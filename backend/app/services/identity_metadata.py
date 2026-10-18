"""Bounded, path-free identity transport for explicit image/profile transfers."""
from __future__ import annotations

import hashlib
import json
import math
import re
import struct
import uuid

_UUID = re.compile(r'^[0-9a-f]{32}$')
_HASH = re.compile(r'^[0-9a-f]{64}$')
_MODELS = {'antelopev2:identity-face-v1': 512,
           'clip-vit-l-14-openai:identity-upright-v1': 768}


def normalize(raw):
    if raw in (None, ''):
        return None
    if isinstance(raw, str):
        if len(raw.encode('utf-8')) > 1024*1024:
            raise ValueError('Identity metadata exceeds 1 MiB.')
        try:
            raw = json.loads(raw)
        except (ValueError, RecursionError):
            raise ValueError('Invalid identity metadata.') from None
    if (not isinstance(raw, dict) or isinstance(raw.get('version'), bool)
            or raw.get('version') != 1):
        raise ValueError('Unsupported identity metadata.')
    subjects = raw.get('subjects')
    if not isinstance(subjects, list) or len(subjects) > 32:
        raise ValueError('Invalid identity subjects.')
    from .identity_learning import _text, region
    out = []
    for subject in subjects:
        if not isinstance(subject, dict) or not isinstance(subject.get('single_subject'), bool):
            raise ValueError('Invalid identity subject.')
        assignments = subject.get('assignments')
        evidence = subject.get('evidence')
        if (not isinstance(assignments, list) or len(assignments) > 64
                or not isinstance(evidence, list) or len(evidence) > 2):
            raise ValueError('Invalid identity evidence.')
        decisions, vectors = [], []
        seen = set()
        for decision in assignments:
            identity = decision.get('identity') if isinstance(decision, dict) else None
            if (not isinstance(identity, dict) or identity.get('kind') not in ('anime', 'person')
                    or not isinstance(identity.get('id'), str) or not _UUID.fullmatch(identity['id'])
                    or identity['id'] in seen
                    or decision.get('state') not in ('confirmed', 'rejected')
                    or not isinstance(decision.get('learn'), bool)):
                raise ValueError('Invalid identity assignment.')
            seen.add(identity['id'])
            label_hash = decision.get('content_hash')
            if label_hash is not None and (not isinstance(label_hash, str) or not _HASH.fullmatch(label_hash)):
                raise ValueError('Invalid identity label provenance.')
            aliases = identity.get('aliases', [])
            if not isinstance(aliases, list) or len(aliases) > 20:
                raise ValueError('Invalid identity aliases.')
            canonical = {'id': identity['id'], 'kind': identity['kind'],
                         'name': _text(identity.get('name')),
                         'aliases': [_text(alias) for alias in aliases],
                         'series': _text(identity.get('series'), 200, optional=True) or None,
                         'catalog_tag': _text(identity.get('catalog_tag'), 200, optional=True) or None}
            decisions.append({'identity': canonical, 'state': decision['state'],
                              'learn': decision['learn'], 'content_hash': label_hash})
        seen_models = set()
        for item in evidence:
            if not isinstance(item, dict):
                raise ValueError('Invalid identity vector.')
            key, digest = item.get('model_key'), item.get('content_hash')
            dim = _MODELS.get(key)
            if (dim is None or key in seen_models or item.get('dimension') != dim
                    or not isinstance(digest, str) or not _HASH.fullmatch(digest)
                    or not isinstance(item.get('vector'), str) or len(item['vector']) != dim*8):
                raise ValueError('Invalid identity vector provenance.')
            try:
                values = struct.unpack('<'+str(dim)+'f', bytes.fromhex(item['vector']))
            except (ValueError, struct.error):
                raise ValueError('Invalid identity vector bytes.') from None
            if not all(math.isfinite(v) for v in values) or sum(v*v for v in values) < 1e-12:
                raise ValueError('Invalid identity vector values.')
            vectors.append({k: item[k] for k in ('model_key', 'content_hash', 'dimension', 'vector')})
            seen_models.add(key)
        out.append({'region': region(subject.get('region')),
                    'single_subject': subject['single_subject'],
                    'assignments': decisions, 'evidence': vectors})
    normalized = {'version': 1, 'subjects': out}
    if len(json.dumps(normalized).encode('utf-8')) > 1024*1024:
        raise ValueError('Identity metadata exceeds 1 MiB.')
    return normalized


def materialize_sqlite(connection, source, scope, image):
    """Join an explicitly moved image to its copied, profile-local identity graph."""
    payload = normalize(image.get('identity_snapshot'))
    if not payload:
        return
    for item in payload['subjects']:
        box = item['region']
        key = hashlib.sha256(json.dumps(box, separators=(',', ':')).encode()).hexdigest()
        existing = connection.execute(
            'SELECT id FROM identity_subject WHERE source=? AND scope_instance=? '
            'AND image_instance=? AND region_key=?',
            (source, scope['instance_id'], image['instance_id'], key)).fetchone()
        subject_id = existing[0] if existing else uuid.uuid4().hex
        if not existing:
            connection.execute(
                'INSERT INTO identity_subject(id,user_id,source,scope_id,scope_instance,'
                'image_id,image_instance,region_key,region,single_subject,revision) '
                'VALUES(?,?,?,?,?,?,?,?,?,?,1)',
                (subject_id, scope['user_id'], source, scope['id'], scope['instance_id'],
                 image['id'], image['instance_id'], key, json.dumps(box) if box else None,
                 item['single_subject']))
        for decision in item['assignments']:
            identity = decision['identity']
            prior = connection.execute(
                'SELECT user_id,kind,name_key FROM named_identity WHERE id=?',
                (identity['id'],)).fetchone()
            expected = (scope['user_id'], identity['kind'], identity['name'].casefold())
            if prior and tuple(prior) != expected:
                raise ValueError('Imported identity conflicts with this profile.')
            if not prior:
                connection.execute(
                    'INSERT INTO named_identity(id,user_id,kind,name,name_key,series,aliases,'
                    'catalog_tag,revision,created_at) VALUES(?,?,?,?,?,?,?,?,1,CURRENT_TIMESTAMP)',
                    (identity['id'], scope['user_id'], identity['kind'], identity['name'],
                     identity['name'].casefold(), identity['series'],
                     json.dumps(identity['aliases']), identity['catalog_tag']))
            connection.execute(
                'INSERT OR IGNORE INTO identity_assignment(subject_id,identity_id,state,learn,content_hash,updated_at) '
                'VALUES(?,?,?,?,?,CURRENT_TIMESTAMP)',
                (subject_id, identity['id'], decision['state'], decision['learn'], decision['content_hash']))
        for evidence in item['evidence']:
            connection.execute(
                'INSERT OR IGNORE INTO identity_evidence(subject_id,model_key,content_hash,'
                'vector,dimension,created_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP)',
                (subject_id, evidence['model_key'], evidence['content_hash'],
                 bytes.fromhex(evidence['vector']), evidence['dimension']))


def remove_bank_sqlite(connection, bank_id, instance_id):
    params = (bank_id, instance_id)
    subjects = "SELECT id FROM identity_subject WHERE source='bank' AND scope_id=? AND scope_instance=?"
    for table in ('identity_evidence', 'identity_assignment'):
        connection.execute(f'DELETE FROM {table} WHERE subject_id IN ({subjects})', params)
    connection.execute(
        "DELETE FROM identity_subject WHERE source='bank' AND scope_id=? AND scope_instance=?", params)
