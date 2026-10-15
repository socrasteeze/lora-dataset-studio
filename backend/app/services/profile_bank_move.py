"""Verified Bank metadata/cache moves between inactive local profile databases.

Source media is never opened for writing, copied, renamed or deleted. A durable
journal allows a copied-but-not-removed Bank to be resumed after an interruption.
The source cache is retained in the journal directory as a recovery copy.
"""
from __future__ import annotations

from contextlib import closing
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import uuid

from sqlalchemy import create_engine

from instance_profiles import FileLease, ProfileStore, _write_json, public_profile
from .. import config as cfg
from ..extensions import db
from . import bank_undo, npz_transport

TABLES = ('image_bank', 'bank_image', 'bank_collection', 'bank_collection_member',
          'bank_dup_distinct', 'bank_folder_person', 'bank_folder_probe')
KEYS = {table: ('id',) for table in TABLES}
KEYS['bank_collection_member'] = ('collection_id', 'image_id')
MAX_CACHE = 1024 * 1024 * 1024


class MoveBlocked(ValueError):
    pass


def _rows(connection, sql, values=()):
    cursor = connection.execute(sql, values)
    names = [field[0] for field in cursor.description]
    return [dict(zip(names, row)) for row in cursor.fetchall()]


def _quote(name):
    return '"' + name.replace('"', '""') + '"'


def _snapshot(connection, bank_id):
    result = {'image_bank': _rows(connection, 'SELECT * FROM image_bank WHERE id=?', (bank_id,))}
    for table in TABLES[1:]:
        if table == 'bank_collection_member':
            sql = ('SELECT * FROM bank_collection_member WHERE collection_id IN '
                   '(SELECT id FROM bank_collection WHERE bank_id=?)')
        else:
            sql = f'SELECT * FROM {_quote(table)} WHERE bank_id=?'
        result[table] = _rows(connection, sql, (bank_id,))
    return result


def _digest(snapshot):
    ordered = {table: sorted(rows, key=lambda row: tuple(row[key] for key in KEYS[table]))
               for table, rows in snapshot.items()}
    return hashlib.sha256(json.dumps(ordered, sort_keys=True, ensure_ascii=True,
                                    separators=(',', ':')).encode()).hexdigest()


def _file_hash(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for part in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(part)
    return digest.hexdigest()


def _history(raw, entry):
    if raw:
        try:
            value = json.loads(raw)
        except (TypeError, ValueError):
            value = [{'legacy': raw}]
        if not isinstance(value, list):
            value = [{'legacy': value}]
    else:
        value = []
    return json.dumps([*value, entry], ensure_ascii=True)


def _schema(source, target):
    """Refuse unknown dependent tables or columns instead of dropping metadata."""
    source_tables = [row[0] for row in source.execute("SELECT name FROM sqlite_master WHERE type='table'")]
    for table in source_tables:
        if table in TABLES:
            continue
        foreign = source.execute(f'PRAGMA foreign_key_list({_quote(table)})').fetchall()
        if any(row[2] in TABLES for row in foreign) and table != 'bank_queue_entry':
            raise MoveBlocked('This Bank has unsupported dependent metadata. The move was refused without changing it.')
    for table in TABLES:
        columns = {row[1] for row in source.execute(f'PRAGMA table_info({_quote(table)})')}
        available = {row[1] for row in target.execute(f'PRAGMA table_info({_quote(table)})')}
        if not columns or not columns.issubset(available):
            raise MoveBlocked('Open the destination profile once to update its database, then retry this move.')


def _insert(target, table, row, maps, *, resume):
    row = dict(row)
    if table != 'bank_collection_member':
        old = row.pop('id')
        mapping = maps.setdefault(table, {})
        if resume:
            row['id'] = mapping[str(old)]
            return row
        columns = list(row)
        cursor = target.execute(
            f'INSERT INTO {_quote(table)} ({",".join(map(_quote, columns))}) '
            f'VALUES ({",".join("?" for _ in columns)})', [row[key] for key in columns])
        row['id'] = mapping[str(old)] = cursor.lastrowid
    elif not resume:
        columns = list(row)
        target.execute(f'INSERT INTO {_quote(table)} ({",".join(map(_quote, columns))}) '
                       f'VALUES ({",".join("?" for _ in columns)})', [row[key] for key in columns])
    return row


def _remap_undo(raw, collections, images):
    if not raw:
        return raw
    state = json.loads(raw)
    for group in ('before', 'after'):
        for item in state.get(group, ()):
            item['id'] = collections[str(item['id'])]
            for member in item.get('members', ()):
                member['image_id'] = images[str(member['image_id'])]
    return json.dumps(state)


def _folder_signatures(snapshot, images, threshold):
    from ..models import BankImage
    from . import folder_person
    signatures = {}
    folders = {row['subfolder'] for table in ('bank_folder_person', 'bank_folder_probe')
               for row in snapshot[table]}
    try:
        for folder in folders:
            rows = (folder_person._folder_rows_q(snapshot['image_bank'][0]['id'], folder)
                    .filter(BankImage.status != 'reject')
                    .with_entities(BankImage.id, BankImage.relpath, BankImage.analysis_fingerprint,
                                   BankImage.rotation, BankImage.watermark_clean_method)
                    .order_by(BankImage.id.asc()).all())
            rebound = sorted((images[str(row[0])], *row[1:]) for row in rows)
            signatures[folder] = (folder_person._signature_for_rows(rows, threshold),
                                  folder_person._signature_for_rows(rebound, threshold))
    finally:
        db.session.rollback()
    return signatures


def _copy_rows(target, snapshot, maps, origin, threshold, *, resume):
    expected = {table: [] for table in TABLES}
    bank = _insert(target, 'image_bank', snapshot['image_bank'][0], maps, resume=resume)
    expected['image_bank'].append(bank)
    new_id = bank['id']
    images = maps.setdefault('bank_image', {})
    for original in snapshot['bank_image']:
        row = {**original, 'bank_id': new_id, 'promoted_dataset_id': None,
               'promoted_bank_id': new_id if original.get('promoted_bank_id') == origin['bank_id'] else None}
        row['profile_history'] = _history(original.get('profile_history'), {
            **origin, 'image_id': original['id'],
            'promoted_dataset_id': original.get('promoted_dataset_id'),
            'promoted_bank_id': original.get('promoted_bank_id')})
        expected['bank_image'].append(_insert(target, 'bank_image', row, maps, resume=resume))
    # Missing collection members/distinct endpoints remain tombstones. Negative
    # aliases cannot accidentally bind a future positive image ID.
    references = {row[key] for row in snapshot['bank_dup_distinct'] for key in ('image_a', 'image_b')}
    references.update(row['image_id'] for row in snapshot['bank_collection_member'])
    for collection in snapshot['bank_collection']:
        if collection['undo_state']:
            state = json.loads(collection['undo_state'])
            references.update(member['image_id'] for item in state.get('before', ())
                              for member in item.get('members', ()))
    for ident in sorted(references):
        images.setdefault(str(ident), -len(images) - 1)
    for original in snapshot['bank_collection']:
        row = {**original, 'bank_id': new_id, 'undo_state': None}
        expected['bank_collection'].append(_insert(target, 'bank_collection', row, maps, resume=resume))
    collections = maps.get('bank_collection', {})
    for original, copied in zip(snapshot['bank_collection'], expected['bank_collection']):
        copied['undo_state'] = _remap_undo(original['undo_state'], collections, images)
        if not resume:
            target.execute('UPDATE bank_collection SET undo_state=? WHERE id=?',
                           (copied['undo_state'], copied['id']))
    for original in snapshot['bank_collection_member']:
        row = {**original, 'collection_id': collections[str(original['collection_id'])],
               'image_id': images[str(original['image_id'])]}
        expected['bank_collection_member'].append(_insert(target, 'bank_collection_member', row, maps, resume=resume))
    signatures = _folder_signatures(snapshot, images, threshold)
    for table in ('bank_dup_distinct', 'bank_folder_person', 'bank_folder_probe'):
        for original in snapshot[table]:
            row = {**original, 'bank_id': new_id}
            if table == 'bank_dup_distinct':
                row['image_a'], row['image_b'] = sorted(images[str(original[key])] for key in ('image_a', 'image_b'))
            elif table == 'bank_folder_probe':
                before, after = signatures[row['subfolder']]
                if row['content_sig'] == before:
                    row['content_sig'] = after
            elif row['sample_report']:
                try:
                    report = json.loads(row['sample_report'])
                except (ValueError, TypeError):
                    report = None
                before, after = signatures[row['subfolder']]
                if isinstance(report, dict) and report.get('content_sig') == before:
                    row['sample_report'] = json.dumps({**report, 'content_sig': after})
            expected[table].append(_insert(target, table, row, maps, resume=resume))
    return expected


def _relative_cache_name(relative, images):
    if relative.parts[0] in ('thumbs', 'clean', 'rotated', 'edited'):
        match = re.match(r'^(\d+)(\..*)$', relative.name)
        if match:
            old, suffix = match.groups()
            images.setdefault(old, -len(images) - 1)
            return relative.with_name(f'{images[old]}{suffix}')
    return relative


def _linked(path):
    return path.is_symlink() or getattr(path, 'is_junction', lambda: False)()


def _copy_cache(source, staging, final, images, undo):
    staging.mkdir(parents=True)
    hashes = {}
    archives = []
    if source.exists():
        if _linked(source):
            raise MoveBlocked('The Bank cache uses a link and cannot be moved safely.')
        for root, dirs, files in os.walk(source):
            if any(_linked(Path(root) / name) for name in [*dirs, *files]):
                raise MoveBlocked('The Bank cache contains a link. The move was refused without changing source images.')
            for name in files:
                original = Path(root) / name
                relative = _relative_cache_name(original.relative_to(source), images)
                copied = staging / relative
                copied.parent.mkdir(parents=True, exist_ok=True)
                if copied.exists():
                    raise MoveBlocked('Cache aliases conflict. The move was refused without changing the Bank.')
                shutil.copy2(original, copied)
                if _file_hash(original) != _file_hash(copied):
                    raise MoveBlocked('A cache copy could not be verified. The original Bank is unchanged.')
                if copied.suffix.lower() == '.npz':
                    archives.append((copied, relative))
                hashes[str(relative)] = _file_hash(copied)
    # All derived files must exist before signatures are rebound.
    for copied, relative in archives:
        arrays = npz_transport.read(copied, max_file_bytes=MAX_CACHE,
                                   max_uncompressed_bytes=MAX_CACHE,
                                   max_elements=200_000 * 1024)
        if arrays is None:
            raise MoveBlocked('A cached analysis format could not be preserved. The original Bank is unchanged.')
        if 'paths' in arrays:
            paths, sigs = [], []
            for index in range(arrays['paths'].shape[0]):
                path = arrays['paths'].string(index)
                try:
                    relative_path = Path(path).relative_to(source)
                except ValueError:
                    paths.append(path)
                    sigs.append(arrays['sigs'].string(index) if 'sigs' in arrays else '')
                    continue
                relative_path = _relative_cache_name(relative_path, images)
                paths.append(str(final / relative_path))
                file = staging / relative_path
                sigs.append(f'{file.stat().st_size}:{file.stat().st_mtime_ns}' if file.is_file() else '')
            arrays['paths'] = npz_transport.unicode(paths)
            if 'sigs' in arrays:
                arrays['sigs'] = npz_transport.unicode(sigs)
            if not npz_transport.write_atomic(copied, arrays, max_file_bytes=MAX_CACHE):
                raise MoveBlocked('The analysis cache could not be rebound to its copied files.')
            verified = npz_transport.read(copied, max_file_bytes=MAX_CACHE,
                                          max_uncompressed_bytes=MAX_CACHE,
                                          max_elements=200_000 * 1024)
            if verified != arrays:
                raise MoveBlocked('The rebound analysis cache could not be verified. The source Bank was kept.')
        hashes[str(relative)] = _file_hash(copied)
    if undo:
        _write_json(staging / 'profile_undo.json', {
            **undo, 'rows': {str(images[str(key)]): value for key, value in undo['rows'].items()
                            if str(key) in images}})
        hashes['profile_undo.json'] = _file_hash(staging / 'profile_undo.json')
    return hashes


def _verify(target, expected, cache, hashes):
    actual = _snapshot(target, expected['image_bank'][0]['id'])
    for table in TABLES:
        columns = set(expected[table][0]) if expected[table] else set()
        actual[table] = [{key: value for key, value in row.items() if key in columns}
                         for row in actual[table]]
    if _digest(actual) != _digest(expected):
        raise MoveBlocked('Destination metadata does not match the verified snapshot. The source Bank was kept.')
    _verify_cache(cache, hashes)


def _verify_cache(cache, hashes):
    for relative, fingerprint in hashes.items():
        path = cache / relative
        if not path.resolve().is_relative_to(cache.resolve()):
            raise MoveBlocked('The move journal contains an invalid cache reference.')
        if not path.is_file() or _file_hash(path) != fingerprint:
            raise MoveBlocked('Destination cache verification failed. The source Bank was kept.')


def _detach_history(source, snapshot, origin, new_id):
    images = {image['id']: image for image in snapshot['bank_image']}
    keys = list(images)
    for start in range(0, len(keys), 500):
        chunk = keys[start:start + 500]
        for row in _rows(source, 'SELECT id, bank_image_id, bank_profile_history FROM face_dataset_image WHERE bank_image_id IN ('
                         + ','.join('?' for _ in chunk) + ')', chunk):
            image = images[row['bank_image_id']]
            history = _history(row['bank_profile_history'], {
                **origin, 'image_id': image['id'], 'image_instance_id': image['instance_id'],
                'destination_bank_id': new_id})
            source.execute('UPDATE face_dataset_image SET bank_image_id=NULL, bank_profile_history=? WHERE id=?', (history, row['id']))
    for row in _rows(source, 'SELECT id, bank_id, profile_history FROM bank_image WHERE promoted_bank_id=?', (origin['bank_id'],)):
        if row['bank_id'] != origin['bank_id']:
            source.execute('UPDATE bank_image SET promoted_bank_id=NULL, profile_history=? WHERE id=?',
                           (_history(row['profile_history'], {**origin, 'destination_bank_id': new_id}), row['id']))


def move_bank(user_id, bank_id, instance_id, target_id, operation_id):
    """Move under the caller's freeze_profile_work admission reservation."""
    store = ProfileStore()
    current = public_profile()['id']
    if target_id == current:
        raise MoveBlocked('Choose another profile.')
    if not re.fullmatch(r'[0-9a-f]{32}', str(operation_id or '')):
        raise MoveBlocked('The move identity is invalid. Reopen the dialog.')
    target_profile = store.get(target_id)
    target_data = Path(target_profile['paths']['LDS_DATA_DIR'])
    target_database = target_data / 'studio.db'
    source_database = db.engine.url.database
    if db.engine.url.get_backend_name() != 'sqlite' or not source_database or source_database == ':memory:':
        raise MoveBlocked('Profile moves require on-disk SQLite storage.')
    if target_database.resolve() == Path(source_database).resolve():
        raise MoveBlocked('The destination profile uses the same database.')
    journal_dir = cfg._data_dir() / 'banks' / '.profile-moves'
    journal_dir.mkdir(parents=True, exist_ok=True)
    journal_path = journal_dir / f'{operation_id}.json'
    source_removed = False
    with FileLease(store.home / 'transition.lock'):
        store.check_other_work(current)
        raw = db.engine.raw_connection()
        source = raw.driver_connection
        try:
            source.execute('BEGIN IMMEDIATE')
            snapshot = _snapshot(source, bank_id)
            if not snapshot['image_bank']:
                if journal_path.is_file():
                    journal = json.loads(journal_path.read_text(encoding='utf-8'))
                    if (journal.get('state') in ('copied', 'complete') and journal.get('source_id') == bank_id
                            and journal.get('instance_id') == instance_id and journal.get('target') == target_id):
                        if not target_database.is_file():
                            raise MoveBlocked('The destination database is unavailable. Recovery data was retained.')
                        with closing(sqlite3.connect(target_database)) as target:
                            present = target.execute('SELECT instance_id FROM image_bank WHERE id=?',
                                                     (journal['destination_id'],)).fetchone()
                        if present and present[0] == instance_id:
                            return {'bank_id': journal['destination_id'], 'profile_id': target_id, 'moved': True}
                raise MoveBlocked('The Bank is unavailable. Refresh the Bank list.')
            bank = snapshot['image_bank'][0]
            if bank['user_id'] != str(user_id) or bank['instance_id'] != instance_id:
                raise MoveBlocked('The Bank selection changed. Reopen the dialog.')
            source_cache = cfg._data_dir() / 'banks' / str(bank_id)
            source_folder = Path(bank['source_path']).resolve()
            if source_folder.is_relative_to(source_cache.resolve()) or source_cache.resolve().is_relative_to(source_folder):
                raise MoveBlocked('Source images overlap the cache directory. The move was refused to keep them in place.')
            target_cache_root = (target_data / 'banks').resolve()
            if source_folder.is_relative_to(target_cache_root) or target_cache_root.is_relative_to(source_folder):
                raise MoveBlocked('The destination cache overlaps the source folder. Choose another profile.')
            # An index reuses an interrupted operation after a dialog or process restart.
            index_path = journal_dir / f'bank-{instance_id}.json'
            if index_path.is_file() and not journal_path.exists():
                indexed = json.loads(index_path.read_text(encoding='utf-8'))
                if not re.fullmatch(r'[0-9a-f]{32}', str(indexed.get('operation_id', ''))):
                    raise MoveBlocked('The move journal index is invalid. The source Bank was kept.')
                prior = journal_dir / f"{indexed['operation_id']}.json"
                if prior.is_file():
                    value = json.loads(prior.read_text(encoding='utf-8'))
                    if value.get('state') in ('prepared', 'copied') and value.get('target') != target_id:
                        raise MoveBlocked('Complete the recorded move before choosing another destination.')
                    if value.get('target') == target_id and value.get('state') in ('prepared', 'copied'):
                        journal_path = prior
            journal = json.loads(journal_path.read_text(encoding='utf-8')) if journal_path.exists() else None
            if journal and (journal.get('source_id') != bank_id or journal.get('instance_id') != instance_id
                            or journal.get('target') != target_id):
                raise MoveBlocked('The move identity belongs to another selection. Reopen the dialog.')
            fingerprint = _digest(snapshot)
            resume = bool(journal and journal.get('state') in ('prepared', 'copied'))
            if resume and (journal['snapshot'] != fingerprint or journal['instance_id'] != instance_id or journal['target'] != target_id):
                raise MoveBlocked('The Bank changed after an interrupted move. Both copies were kept for recovery.')
            origin = {'profile_id': current, 'bank_id': bank_id, 'bank_instance_id': instance_id,
                      'destination_profile_id': target_id, 'operation_id': operation_id}
            if resume:
                origin = journal['origin']
                operation_id = origin['operation_id']
            from . import image_bank_service as banks
            threshold = journal['face_threshold'] if resume else banks.thresholds().get('face_threshold')
            target_data.mkdir(parents=True, exist_ok=True)
            engine = create_engine('sqlite:///' + str(target_database))
            try:
                db.metadata.create_all(engine)
            finally:
                engine.dispose()
            with closing(sqlite3.connect(target_database, isolation_level=None, timeout=5)) as target:
                target.execute('PRAGMA foreign_keys=ON')
                target.execute('BEGIN IMMEDIATE')
                published_cache = None
                try:
                    _schema(source, target)
                    present = target.execute('SELECT id FROM image_bank WHERE instance_id=?', (instance_id,)).fetchone()
                    if present and not resume:
                        raise MoveBlocked('This Bank already exists in that profile. Existing metadata was not overwritten.')
                    if not resume:
                        for other in target.execute('SELECT source_path, root_only FROM image_bank WHERE user_id=?', (str(user_id),)):
                            if (os.path.normcase(os.path.realpath(other[0])) == os.path.normcase(str(source_folder))
                                    and bool(other[1]) == bool(bank.get('root_only'))):
                                raise MoveBlocked('The destination already has a Bank for this folder. Neither Bank was changed.')
                    if not present and resume:
                        if journal['state'] != 'prepared':
                            raise MoveBlocked('The interrupted destination is unavailable. The source Bank was kept for recovery.')
                        # A crash before the target commit leaves no row. Keep
                        # any verified cache as recovery data, then copy afresh.
                        abandoned = target_data / 'banks' / str(journal['destination_id'])
                        occupied = target.execute('SELECT 1 FROM image_bank WHERE id=?', (journal['destination_id'],)).fetchone()
                        if abandoned.exists() and not occupied:
                            _verify_cache(abandoned, journal['hashes'])
                            abandoned.rename(abandoned.with_name(f'.failed-{operation_id}-{uuid.uuid4().hex}'))
                        journal['state'] = 'failed'
                        _write_json(journal_path, journal)
                        resume = False
                    maps = journal['maps'] if resume else {}
                    expected = _copy_rows(target, snapshot, maps, origin, threshold, resume=resume)
                    new_id = expected['image_bank'][0]['id']
                    final = target_data / 'banks' / str(new_id)
                    if not resume:
                        if final.exists():
                            raise MoveBlocked('An existing destination cache would be overwritten. The move was refused.')
                        staging = target_data / 'banks' / f'.move-{operation_id}'
                        if staging.exists():
                            staging.rename(staging.with_name(f'.failed-{operation_id}-{uuid.uuid4().hex}'))
                        undo = bank_undo.export_snapshot(bank_id)
                        hashes = _copy_cache(source_cache, staging, final, maps['bank_image'], undo)
                        journal = {'state': 'prepared', 'source_id': bank_id, 'instance_id': instance_id,
                                   'target': target_id, 'destination_id': new_id, 'snapshot': fingerprint,
                                   'origin': origin, 'maps': maps, 'hashes': hashes,
                                   'face_threshold': threshold}
                        _write_json(journal_path, journal)
                        _write_json(index_path, {'operation_id': operation_id})
                        staging.rename(final)
                        published_cache = final
                    _verify(target, expected, final, journal['hashes'])
                    target.commit()
                except Exception:
                    target.rollback()
                    if published_cache is not None and published_cache.exists():
                        published_cache.rename(published_cache.with_name(f'.failed-{operation_id}-{uuid.uuid4().hex}'))
                    if not resume and journal is not None:
                        journal['state'] = 'failed'
                        _write_json(journal_path, journal)
                    raise
            journal['state'] = 'copied'
            _write_json(journal_path, journal)
            archive = journal_path.with_suffix('')
            archive.mkdir(exist_ok=True)
            if source_cache.exists():
                source_cache.rename(archive / 'cache')
            _detach_history(source, snapshot, origin, new_id)
            source.execute('DELETE FROM bank_collection_member WHERE collection_id IN (SELECT id FROM bank_collection WHERE bank_id=?)', (bank_id,))
            for table in reversed(TABLES[1:]):
                if table != 'bank_collection_member':
                    source.execute(f'DELETE FROM {_quote(table)} WHERE bank_id=?', (bank_id,))
            source.execute('DELETE FROM image_bank WHERE id=? AND instance_id=?', (bank_id, instance_id))
            source.commit()
            source_removed = True
            db.session.expire_all()
            bank_undo.clear(bank_id)
            from . import bank_jobs
            # The caller owns bank_jobs._lock. Retire this numeric alias so a
            # later Bank cannot inherit the moved Bank's terminal job display.
            bank_jobs._jobs.pop(bank_id, None)
            banks.reset_score_memo()
            banks.reset_poll_path_memo()
            banks.reset_folder_sync()
            journal['state'] = 'complete'
            _write_json(journal_path, journal)
            return {'bank_id': new_id, 'profile_id': target_id, 'moved': True}
        except Exception:
            source.rollback()
            if not source_removed and 'archive' in locals() and (archive / 'cache').exists() and not source_cache.exists():
                (archive / 'cache').rename(source_cache)
            raise
        finally:
            source.rollback()
            raw.close()
