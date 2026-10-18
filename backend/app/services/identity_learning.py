"""Profile-local identity decisions and learning from confirmed subject examples.

No matcher writes a human decision. Vectors are partitioned by exact engine
contract and revalidated against source bytes before they can teach a match.
"""
from __future__ import annotations

from contextlib import contextmanager
import csv
import hashlib
import io
import json
import math
from pathlib import Path
import unicodedata

from sqlalchemy import func

from ..extensions import db
from ..models import (BankImage, CharacterVocabulary, FaceDataset, FaceDatasetImage,
                      IdentityAction, IdentityAssignment, IdentityEvidence,
                      IdentitySubject, ImageBank, NamedIdentity)

MAX_IMAGES = 64
MAX_REFERENCES = 32
KINDS = ('person', 'anime')
FACE_MODEL = 'antelopev2:identity-face-v1'
CLIP_MODEL = 'clip-vit-l-14-openai:identity-upright-v1'


class IdentityConflict(ValueError):
    pass


class IdentityNotFound(ValueError):
    pass


def _text(value, maximum=100, *, optional=False):
    if optional and value in (None, ''):
        return ''
    if not isinstance(value, str):
        raise ValueError('Name must be text.')
    value = unicodedata.normalize('NFKC', value).strip()
    if not value or len(value) > maximum or any(ord(c) < 32 for c in value):
        raise ValueError('Enter a valid name within the length limit.')
    return value


def _kind(value):
    if value not in KINDS:
        raise ValueError('Choose Person or Anime.')
    return value


def _ids(values):
    if not isinstance(values, list) or not 1 <= len(values) <= MAX_IMAGES:
        raise ValueError('Select between 1 and 64 images per request.')
    if any(isinstance(v, bool) or not isinstance(v, int) or v <= 0 for v in values):
        raise ValueError('Image IDs must be positive integers.')
    return list(dict.fromkeys(values))


def _scope(user, source, scope_id):
    model = {'bank': ImageBank, 'dataset': FaceDataset}.get(source)
    if model is None:
        raise ValueError('Unknown image surface.')
    row = db.session.get(model, scope_id)
    if row is None or row.user_id != user:
        raise IdentityNotFound('Image surface is unavailable.')
    return row


def _image(user, source, scope_id, image_id):
    scope = _scope(user, source, scope_id)
    model = BankImage if source == 'bank' else FaceDatasetImage
    image = db.session.get(model, image_id)
    owner = 'bank_id' if source == 'bank' else 'dataset_id'
    if image is None or getattr(image, owner) != scope.id:
        raise IdentityNotFound('An image is no longer in this surface.')
    return scope, image


def _path(source, scope, image):
    if source == 'bank':
        from .image_bank_service import analysis_image_path
        path = analysis_image_path(scope, image)
    else:
        from .face_dataset_service import _dataset_dir, _img_path
        if not image.filename:
            raise ValueError('An image has no saved file.')
        path = _img_path(image)
        try:
            Path(path).resolve().relative_to(Path(_dataset_dir(scope.id)).resolve())
        except ValueError:
            raise ValueError('Image storage is unavailable.') from None
    if not path or not Path(path).is_file():
        raise ValueError('Image storage is unavailable.')
    return str(path)


def fingerprint(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def region(value):
    if value is None:
        return None
    if (not isinstance(value, list) or len(value) != 4
            or any(isinstance(v, bool) or not isinstance(v, (float, int))
                   or not math.isfinite(v) for v in value)):
        raise ValueError('Subject region must contain four finite fractions.')
    x, y, w, h = map(float, value)
    if min(x, y) < 0 or min(w, h) <= 0 or x + w > 1.000001 or y + h > 1.000001:
        raise ValueError('Subject region is outside the image.')
    return [round(v, 6) for v in (x, y, w, h)]


def _region_key(box):
    return hashlib.sha256(json.dumps(box, separators=(',', ':')).encode()).hexdigest()


def _subjects(source, scope, image):
    return IdentitySubject.query.filter_by(
        source=source, scope_instance=scope.instance_id,
        image_instance=image.instance_id, user_id=scope.user_id).all()


def _iou(a, b):
    if a is None or b is None:
        return float(a is None and b is None)
    x, y = max(a[0], b[0]), max(a[1], b[1])
    right, bottom = min(a[0]+a[2], b[0]+b[2]), min(a[1]+a[3], b[1]+b[3])
    common = max(0, right-x) * max(0, bottom-y)
    return common / max(1e-12, a[2]*a[3] + b[2]*b[3] - common)


def _subject(user, source, scope, image, box=None, *, single=False, continuity=False):
    box = region(box)
    key = _region_key(box)
    rows = _subjects(source, scope, image)
    found = next((r for r in rows if r.region_key == key), None)
    if found is None and continuity and box is not None:
        ranked = sorted((( _iou(json.loads(r.region), box), r) for r in rows
                         if r.region), key=lambda pair: pair[0], reverse=True)
        if ranked and ranked[0][0] >= 0.6:
            found = ranked[0][1]
    if found is None:
        if len(rows) >= 32:
            raise ValueError('An image supports at most 32 subject regions.')
        found = IdentitySubject(user_id=user, source=source, scope_id=scope.id,
                                scope_instance=scope.instance_id, image_id=image.id,
                                image_instance=image.instance_id, region_key=key,
                                region=json.dumps(box) if box else None,
                                single_subject=single or box is not None)
        db.session.add(found)
        db.session.flush()
    return found


def _identity(user, identity_id):
    row = db.session.get(NamedIdentity, identity_id)
    if row is None or row.user_id != user:
        raise IdentityNotFound('Identity is unavailable.')
    return row


def identity_dict(row):
    return {'id': row.id, 'kind': row.kind, 'name': row.name,
            'series': row.series, 'aliases': json.loads(row.aliases),
            'catalog_tag': row.catalog_tag, 'revision': row.revision}


def create_identity(user, data):
    name, kind = _text(data.get('name')), _kind(data.get('kind'))
    aliases = data.get('aliases', [])
    if not isinstance(aliases, list) or len(aliases) > 20:
        raise ValueError('Use at most 20 aliases.')
    aliases = list(dict.fromkeys(_text(v) for v in aliases))
    key = name.casefold()
    existing = NamedIdentity.query.filter_by(user_id=user, kind=kind, name_key=key).first()
    if existing:
        return existing
    row = NamedIdentity(user_id=user, kind=kind, name=name, name_key=key,
                        series=_text(data.get('series'), 200, optional=True) or None,
                        aliases=json.dumps(aliases),
                        catalog_tag=_text(data.get('catalog_tag'), 200, optional=True) or None)
    db.session.add(row)
    db.session.commit()
    return row


def list_identities(user, kind=None, query=''):
    rows = NamedIdentity.query.filter_by(user_id=user)
    if kind:
        rows = rows.filter_by(kind=_kind(kind))
    if query:
        q = _text(query, 100).casefold().replace('%', '\\%').replace('_', '\\_')
        rows = rows.filter(db.or_(func.lower(NamedIdentity.name).like('%'+q+'%', escape='\\'),
                                  func.lower(NamedIdentity.aliases).like('%'+q+'%', escape='\\')))
    return [identity_dict(row) for row in rows.order_by(
        NamedIdentity.name_key, NamedIdentity.id).limit(200).all()]


def rename_identity(user, identity_id, data):
    row = _identity(user, identity_id)
    revision = data.get('revision')
    if isinstance(revision, bool) or revision != row.revision:
        raise IdentityConflict('Identity changed. Reload it before saving.')
    name = _text(data.get('name'))
    aliases = data.get('aliases', json.loads(row.aliases))
    if not isinstance(aliases, list) or len(aliases) > 20:
        raise ValueError('Use at most 20 aliases.')
    changed = NamedIdentity.query.filter_by(id=row.id, revision=revision).update({
        'name': name, 'name_key': name.casefold(),
        'aliases': json.dumps(list(dict.fromkeys(_text(v) for v in aliases))),
        'revision': revision+1}, synchronize_session=False)
    if changed != 1:
        raise IdentityConflict('Identity changed. Reload it before saving.')
    db.session.commit()
    db.session.refresh(row)
    for assignment in IdentityAssignment.query.filter_by(identity_id=row.id).all():
        subject = db.session.get(IdentitySubject, assignment.subject_id)
        try:
            sync_metadata(subject)
        except IdentityNotFound:
            continue
    db.session.commit()
    return identity_dict(row)


def _assignment_snapshot(subject):
    return [{'identity_id': a.identity_id, 'state': a.state, 'learn': a.learn}
            for a in IdentityAssignment.query.filter_by(subject_id=subject.id).all()]


def _subject_dict(subject):
    decisions = _assignment_snapshot(subject)
    for decision in decisions:
        row = db.session.get(NamedIdentity, decision['identity_id'])
        decision['name'] = row.name if row else ''
        decision['kind'] = row.kind if row else ''
    return {'id': subject.id, 'image_id': subject.image_id,
            'region': json.loads(subject.region) if subject.region else None,
            'single_subject': subject.single_subject, 'revision': subject.revision,
            'assignments': decisions}


def _preview(scope, rows):
    value = [(image.id, image.instance_id,
              sorted((s.id, s.revision) for s in _subjects(source, scope, image)))
             for source, image in rows]
    return hashlib.sha256(json.dumps([scope.instance_id, value]).encode()).hexdigest()


def view(user, source, scope_id, ids):
    ids = _ids(ids)
    scope = _scope(user, source, scope_id)
    rows = [_image(user, source, scope_id, i)[1] for i in ids]
    return {'scope_instance': scope.instance_id,
            'preview': _preview(scope, [(source, row) for row in rows]),
            'images': [{'id': row.id, 'subjects': [_subject_dict(s) for s in
                        _subjects(source, scope, row)]} for row in rows]}


@contextmanager
def lease(source, scope_id):
    from . import bank_jobs, dataset_activity
    if source == 'bank':
        with bank_jobs.mutation_lease(scope_id, 'identity'):
            yield
    else:
        activity = dataset_activity.begin_exclusive(scope_id, 'identity')
        try:
            yield
        finally:
            dataset_activity.end(activity)


def _claim(subject, revision):
    if subject.revision != revision:
        raise IdentityConflict('Assignment changed. Reload it before saving.')
    changed = IdentitySubject.query.filter_by(id=subject.id, revision=revision).update(
        {'revision': revision+1}, synchronize_session=False)
    if changed != 1:
        raise IdentityConflict('Assignment changed. Reload it before saving.')
    db.session.refresh(subject)


def assign(user, source, scope_id, data):
    ids = _ids(data.get('image_ids'))
    scope = _scope(user, source, scope_id)
    rows = [_image(user, source, scope_id, i)[1] for i in ids]
    if (data.get('scope_instance') != scope.instance_id
            or data.get('preview') != _preview(scope, [(source, row) for row in rows])):
        raise IdentityConflict('Selection changed. Reload it before assigning.')
    target = _identity(user, data.get('identity_id'))
    learn = data.get('learn', True)
    single = data.get('single_subject', False)
    if not isinstance(learn, bool) or not isinstance(single, bool):
        raise ValueError('Learning choices must be boolean.')
    boxes = data.get('regions', {})
    if not isinstance(boxes, dict) or len(boxes) > MAX_IMAGES:
        raise ValueError('Subject regions must be an image map.')
    parsed = {str(row.id): region(boxes.get(str(row.id))) for row in rows}
    # Validate the whole request before creating any decisions.
    if learn and target.kind == 'anime' and not single and any(
            parsed[str(row.id)] is None for row in rows):
        raise ValueError('Select a subject crop or confirm one character per image.')
    subjects = []
    for row in rows:
        box = parsed[str(row.id)]
        if target.kind == 'person' and box is None:
            faces = [s for s in _subjects(source, scope, row)
                     if IdentityEvidence.query.filter_by(
                         subject_id=s.id, model_key=FACE_MODEL).first()]
            if len(faces) > 1 and learn:
                raise ValueError('Select one face before teaching this person.')
            subject = faces[0] if len(faces) == 1 else _subject(
                user, source, scope, row, single=single)
        else:
            subject = _subject(user, source, scope, row, box, single=single)
        subjects.append(subject)
    snapshots = []
    for subject in subjects:
        snapshots.append({'subject_id': subject.id, 'before': _assignment_snapshot(subject),
                          'single_before': subject.single_subject,
                          'after_revision': subject.revision+1})
        _claim(subject, subject.revision)
        if single or subject.region:
            subject.single_subject = True
        previous_id = data.get('replace_identity_id')
        if previous_id and previous_id != target.id:
            _identity(user, previous_id)
            previous = db.session.get(IdentityAssignment, (subject.id, previous_id))
            if previous:
                previous.state, previous.learn = 'rejected', False
        other_confirmed = [a for a in IdentityAssignment.query.filter_by(
            subject_id=subject.id, state='confirmed').all()
            if a.identity_id != target.id and _identity(user, a.identity_id).kind == target.kind]
        if target.kind == 'anime' and other_confirmed:
            if learn:
                raise ValueError('This subject already has another name. Correct it or choose a separate crop.')
            subject.single_subject = False
            for previous in other_confirmed:
                previous.learn = False
        if target.kind == 'person':
            # A located face has one confirmed person. Correcting it removes
            # its contribution to the previous person's exemplar bank.
            for old in IdentityAssignment.query.filter_by(
                    subject_id=subject.id, state='confirmed').all():
                if old.identity_id != target.id and _identity(user, old.identity_id).kind == 'person':
                    old.state, old.learn = 'rejected', False
        decision = db.session.get(IdentityAssignment, (subject.id, target.id))
        if decision is None:
            decision = IdentityAssignment(subject_id=subject.id, identity_id=target.id)
            db.session.add(decision)
        decision.state, decision.learn = 'confirmed', learn
    action = IdentityAction(user_id=user, snapshots=json.dumps(snapshots))
    db.session.add(action)
    for subject in subjects:
        sync_metadata(subject)
    db.session.commit()
    return {'action_id': action.id, 'assigned': len(subjects),
            'subject_ids': [s.id for s in subjects]}


def decision(user, subject_id, data):
    subject = db.session.get(IdentitySubject, subject_id)
    if subject is None or subject.user_id != user:
        raise IdentityNotFound('Subject is unavailable.')
    scope, image = _image(user, subject.source, subject.scope_id, subject.image_id)
    if scope.instance_id != subject.scope_instance or image.instance_id != subject.image_instance:
        raise IdentityConflict('Image instance changed.')
    target = _identity(user, data.get('identity_id'))
    operation = data.get('action')
    if operation not in ('confirm', 'reject', 'remove'):
        raise ValueError('Choose Confirm, Reject or Remove.')
    before = _assignment_snapshot(subject)
    prior_single = subject.single_subject
    _claim(subject, data.get('revision'))
    if operation == 'confirm':
        if target.kind == 'anime' and any(
                old.identity_id != target.id and old.state == 'confirmed'
                and _identity(user, old.identity_id).kind == 'anime'
                for old in IdentityAssignment.query.filter_by(subject_id=subject.id).all()):
            raise ValueError('Correct the previous name or choose a separate subject crop.')
        if data.get('single_subject') is True:
            subject.single_subject = True
        if not subject.single_subject:
            raise ValueError('Select a subject crop before confirming an example.')
        if target.kind == 'person':
            for old in IdentityAssignment.query.filter_by(
                    subject_id=subject.id, state='confirmed').all():
                if old.identity_id != target.id and _identity(user, old.identity_id).kind == 'person':
                    old.state, old.learn = 'rejected', False
    row = db.session.get(IdentityAssignment, (subject.id, target.id))
    if operation == 'remove':
        if row:
            db.session.delete(row)
    else:
        if row is None:
            row = IdentityAssignment(subject_id=subject.id, identity_id=target.id)
            db.session.add(row)
        row.state = 'confirmed' if operation == 'confirm' else 'rejected'
        row.learn = operation == 'confirm'
    action = IdentityAction(user_id=user, snapshots=json.dumps([{
        'subject_id': subject.id, 'before': before, 'single_before': prior_single,
        'after_revision': subject.revision}]))
    db.session.add(action)
    sync_metadata(subject)
    db.session.commit()
    return {'action_id': action.id, 'changed': 1}


def undo(user, action_id):
    action = db.session.get(IdentityAction, action_id)
    if action is None or action.user_id != user:
        raise IdentityNotFound('Undo is unavailable.')
    if action.undone:
        return {'restored': 0, 'skipped': 0}
    restored = skipped = 0
    for item in json.loads(action.snapshots):
        subject = db.session.get(IdentitySubject, item['subject_id'])
        if subject is None or subject.revision != item['after_revision']:
            skipped += 1
            continue
        _claim(subject, subject.revision)
        IdentityAssignment.query.filter_by(subject_id=subject.id).delete()
        for previous in item['before']:
            if db.session.get(NamedIdentity, previous['identity_id']):
                db.session.add(IdentityAssignment(subject_id=subject.id, **previous))
        subject.single_subject = item['single_before']
        sync_metadata(subject)
        restored += 1
    action.undone = True
    db.session.commit()
    return {'restored': restored, 'skipped': skipped}


def normalized_vector(value, dimension):
    import numpy as np
    vector = np.asarray(value, dtype='<f4')
    if (vector.shape != (dimension,) or not np.isfinite(vector).all()
            or float(np.linalg.norm(vector)) < 1e-8):
        raise ValueError('Recognition returned an invalid vector.')
    return vector / np.linalg.norm(vector)


def _live_evidence(subject, evidence):
    try:
        scope, image = _image(subject.user_id, subject.source, subject.scope_id, subject.image_id)
        if (scope.instance_id != subject.scope_instance
                or image.instance_id != subject.image_instance):
            return False
        return fingerprint(_path(subject.source, scope, image)) == evidence.content_hash
    except (OSError, ValueError):
        return False


def store_evidence(subject, model_key, digest, vector):
    dimension = 512 if model_key == FACE_MODEL else 768
    value = normalized_vector(vector, dimension)
    row = IdentityEvidence.query.filter_by(subject_id=subject.id, model_key=model_key).first()
    if row is None:
        row = IdentityEvidence(subject_id=subject.id, model_key=model_key)
        db.session.add(row)
    elif row.content_hash != digest:
        for assignment in IdentityAssignment.query.filter_by(subject_id=subject.id).all():
            assignment.learn = False
    row.content_hash, row.dimension, row.vector = digest, dimension, value.tobytes()
    db.session.flush()
    return row


def analyze(user, source, scope_id, data):
    from . import identity_inference
    ids, kind = _ids(data.get('image_ids')), _kind(data.get('kind'))
    scope = _scope(user, source, scope_id)
    if kind == 'person' and source == 'dataset':
        from .face_dataset_service import face_scoring_block_reason
        if face_scoring_block_reason(scope):
            raise ValueError('Choose Anime for drawn subjects.')
    if data.get('scope_instance') != scope.instance_id:
        raise IdentityConflict('Image surface changed. Reload it.')
    boxes = data.get('regions', {})
    if not isinstance(boxes, dict):
        raise ValueError('Subject regions must be an image map.')
    work = []
    for image_id in ids:
        _, image = _image(user, source, scope_id, image_id)
        path = _path(source, scope, image)
        work.append((image, path, fingerprint(path), region(boxes.get(str(image_id)))))
    outputs = identity_inference.extract(
        [{'path': path, 'region': box} for _, path, _, box in work], kind)
    if not isinstance(outputs, list) or len(outputs) != len(work):
        raise ValueError('Recognition returned an incomplete batch.')
    measured, unknown = [], []
    for (image, path, digest, requested), output in zip(work, outputs):
        if fingerprint(path) != digest:
            raise IdentityConflict('Image pixels changed during recognition. Retry it.')
        entries = output.get('subjects', [])
        if not entries:
            unknown.append({'image_id': image.id, 'reason': output.get('state', 'unmeasured')})
            continue
        if len(entries) > 32:
            raise ValueError('Recognition returned too many subjects.')
        for entry in entries:
            box = region(entry.get('region'))
            subject = _subject(user, source, scope, image, box,
                               single=kind == 'person' or requested is not None,
                               continuity=kind == 'person')
            store_evidence(subject, FACE_MODEL if kind == 'person' else CLIP_MODEL,
                           digest, entry.get('vector'))
            # A previously named whole-frame person can enroll only when
            # detection proves one usable face, never by choosing the biggest.
            whole = next((s for s in _subjects(source, scope, image) if s.region is None), None)
            if kind == 'person' and len(entries) == 1 and whole and whole.id != subject.id:
                confirmed = IdentityAssignment.query.filter_by(
                    subject_id=whole.id, state='confirmed', learn=True).all()
                for assignment in confirmed:
                    if _identity(user, assignment.identity_id).kind == 'person':
                        store_evidence(whole, FACE_MODEL, digest, entry.get('vector'))
                        whole.single_subject = True
            measured.append(subject.id)
    for image, _path_value, _digest, _requested in work:
        existing = _subjects(source, scope, image)
        if existing:
            sync_metadata(existing[0])
    db.session.commit()
    return {'measured': len(measured), 'unknown': unknown}


def sync_metadata(subject):
    """Transport mirror only; canonical live decisions remain relational."""
    scope, image = _image(subject.user_id, subject.source, subject.scope_id, subject.image_id)
    payload = []
    db.session.flush()
    for row in _subjects(subject.source, scope, image):
        assignments = []
        for assignment in IdentityAssignment.query.filter_by(subject_id=row.id).all():
            identity = _identity(subject.user_id, assignment.identity_id)
            assignments.append({'identity': identity_dict(identity),
                                'state': assignment.state, 'learn': assignment.learn})
        evidence = [{'model_key': e.model_key, 'content_hash': e.content_hash,
                     'dimension': e.dimension, 'vector': e.vector.hex()}
                    for e in IdentityEvidence.query.filter_by(subject_id=row.id).all()]
        payload.append({'region': json.loads(row.region) if row.region else None,
                        'single_subject': row.single_subject,
                        'assignments': assignments, 'evidence': evidence})
    image.identity_snapshot = json.dumps({'version': 1, 'subjects': payload})


def restore_metadata(user, source, scope_id, image_id, raw):
    """Import explicit metadata into this image, never a different profile."""
    from .identity_metadata import normalize
    value = normalize(raw)
    if value is None or not value['subjects']:
        return
    scope, image = _image(user, source, scope_id, image_id)
    digest = fingerprint(_path(source, scope, image))
    for item in value['subjects']:
        subject = _subject(user, source, scope, image, item['region'],
                           single=item['single_subject'])
        for assignment in item['assignments']:
            identity = assignment['identity']
            target = db.session.get(NamedIdentity, identity['id'])
            if target is None:
                target = NamedIdentity(
                    id=identity['id'], user_id=user, kind=identity['kind'],
                    name=identity['name'], name_key=identity['name'].casefold(),
                    aliases=json.dumps(identity['aliases']), series=identity.get('series'),
                    catalog_tag=identity.get('catalog_tag'))
                db.session.add(target)
                db.session.flush()
            elif target.user_id != user or target.kind != identity['kind']:
                raise IdentityConflict('Imported identity conflicts with this profile.')
            if db.session.get(IdentityAssignment, (subject.id, target.id)) is None:
                db.session.add(IdentityAssignment(
                    subject_id=subject.id, identity_id=target.id,
                    state=assignment['state'], learn=assignment['learn']))
        for evidence in item['evidence']:
            if evidence['content_hash'] == digest:
                import numpy as np
                store_evidence(subject, evidence['model_key'], digest,
                               np.frombuffer(bytes.fromhex(evidence['vector']), dtype='<f4'))
    sync_metadata(subject)


def _number(value, default, low=-1.0, high=1.0):
    if value is None:
        return default
    if isinstance(value, bool) or not isinstance(value, (float, int)):
        raise ValueError('Match settings must be numbers.')
    if not math.isfinite(value) or not low <= value <= high:
        raise ValueError('Match setting is outside its range.')
    return float(value)


def suggestions(user, source, scope_id, data):
    import numpy as np
    from .identity_matching import rank_candidates, disposition
    kind = _kind(data.get('kind'))
    ids = _ids(data.get('image_ids'))
    scope = _scope(user, source, scope_id)
    model_key = FACE_MODEL if kind == 'person' else CLIP_MODEL
    minimum = _number(data.get('minimum'), 0.55 if kind == 'person' else 0.70)
    margin = _number(data.get('margin'), 0.05, 0, 1)
    confirmed = (db.session.query(IdentityAssignment, IdentitySubject, IdentityEvidence,
                                 NamedIdentity)
                 .join(IdentitySubject, IdentitySubject.id == IdentityAssignment.subject_id)
                 .join(IdentityEvidence, IdentityEvidence.subject_id == IdentitySubject.id)
                 .join(NamedIdentity, NamedIdentity.id == IdentityAssignment.identity_id)
                 .filter(NamedIdentity.user_id == user, NamedIdentity.kind == kind,
                         IdentityAssignment.state == 'confirmed',
                         IdentityAssignment.learn.is_(True),
                         IdentitySubject.single_subject.is_(True),
                         IdentityEvidence.model_key == model_key)
                 .order_by(IdentityEvidence.created_at.desc(), IdentityEvidence.id.desc())
                 .limit(6401).all())
    if len(confirmed) > 6400:
        raise ValueError('Reference pool exceeds this pass limit. Use a separate profile.')
    bank = {}
    stale = 0
    for assignment, subject, evidence, identity in confirmed:
        if not _live_evidence(subject, evidence):
            stale += 1
            continue
        vector = normalized_vector(np.frombuffer(evidence.vector, dtype='<f4'), evidence.dimension)
        bucket = bank.setdefault(identity.id, (identity, []))[1]
        if len(bucket) < MAX_REFERENCES:
            bucket.append((subject.id, vector, evidence.content_hash))
    result, unknown = [], []
    for image_id in ids:
        _, image = _image(user, source, scope_id, image_id)
        found = False
        for subject in _subjects(source, scope, image):
            evidence = IdentityEvidence.query.filter_by(
                subject_id=subject.id, model_key=model_key).first()
            if evidence is None or not _live_evidence(subject, evidence):
                continue
            found = True
            vector = normalized_vector(np.frombuffer(evidence.vector, dtype='<f4'),
                                       evidence.dimension)
            decisions = IdentityAssignment.query.filter_by(subject_id=subject.id).all()
            excluded = {a.identity_id for a in decisions}
            ranked = rank_candidates(vector, bank, excluded=excluded,
                                     subject_id=subject.id, content_hash=evidence.content_hash)
            if ranked:
                score, identity = ranked[0]
                result.append({'subject_id': subject.id, 'image_id': image_id,
                               'identity': identity_dict(identity), 'score': round(score, 5),
                               'state': disposition(ranked, minimum, margin),
                               'revision': subject.revision,
                               'region': json.loads(subject.region) if subject.region else None})
        if not found:
            unknown.append(image_id)
    return {'suggestions': result, 'unmeasured': unknown, 'stale_references': stale,
            'minimum': minimum, 'margin': margin,
            'thresholds_measured': False, 'reference_identities': len(bank)}


def import_catalog(text):
    if not isinstance(text, str) or len(text.encode('utf-8')) > 32*1024*1024:
        raise ValueError('Catalog must be a CSV within 32 MiB.')
    reader = csv.DictReader(io.StringIO(text))
    fields = set(reader.fieldnames or [])
    if not ({'character', 'copyright'} <= fields or {'name', 'category'} <= fields):
        raise ValueError('Use a character masterlist or tagger vocabulary CSV.')
    count = 0
    for item in reader:
        if 'category' in fields and str(item.get('category')) != '4':
            continue
        tag = _text(item.get('character') or item.get('name'), 200)
        series = _text(item.get('copyright'), 200, optional=True) or None
        row = db.session.get(CharacterVocabulary, tag)
        if row is None:
            row = CharacterVocabulary(tag=tag, name=tag.replace('_', ' '), series=series)
            db.session.add(row)
        else:
            row.series = series or row.series
        count += 1
        if count > 300000:
            raise ValueError('Catalog exceeds 300000 character rows.')
    db.session.commit()
    return {'imported': count}


def catalog(query):
    query = _text(query, 100).casefold().replace('%', '\\%').replace('_', '\\_')
    rows = CharacterVocabulary.query.filter(db.or_(
        func.lower(CharacterVocabulary.name).like('%'+query+'%', escape='\\'),
        func.lower(CharacterVocabulary.tag).like('%'+query+'%', escape='\\'))).order_by(
            CharacterVocabulary.tag).limit(30).all()
    return [{'tag': row.tag, 'name': row.name, 'series': row.series} for row in rows]


def filter_clause(source, scope_id, identity_id):
    """One confirmed-identity predicate shared by lists, counts and selectors."""
    if not isinstance(identity_id, str) or len(identity_id) != 32:
        raise ValueError('Choose a valid identity.')
    model = BankImage if source == 'bank' else FaceDatasetImage
    return (db.session.query(IdentitySubject.id)
            .join(IdentityAssignment, IdentityAssignment.subject_id == IdentitySubject.id)
            .filter(IdentitySubject.source == source, IdentitySubject.scope_id == scope_id,
                    IdentitySubject.image_id == model.id,
                    IdentitySubject.image_instance == model.instance_id,
                    IdentityAssignment.identity_id == identity_id,
                    IdentityAssignment.state == 'confirmed').exists())


def filter_ids(user, source, scope_id, identity_id):
    scope = _scope(user, source, scope_id)
    _identity(user, identity_id)
    model = BankImage if source == 'bank' else FaceDatasetImage
    owner = model.bank_id if source == 'bank' else model.dataset_id
    return [row[0] for row in db.session.query(model.id).filter(
        owner == scope.id, filter_clause(source, scope_id, identity_id))
        .order_by(model.id).all()]


def tag_candidates(user, source, scope_id, data):
    from . import identity_inference
    ids = _ids(data.get('image_ids'))
    engine = data.get('engine', 'wd14')
    if engine not in ('wd14', 'pixai'):
        raise ValueError('Choose WD14 or PixAI.')
    scope = _scope(user, source, scope_id)
    if data.get('scope_instance') != scope.instance_id:
        raise IdentityConflict('Image surface changed. Reload it.')
    paths = []
    for image_id in ids:
        _, image = _image(user, source, scope_id, image_id)
        path = _path(source, scope, image)
        paths.append((image_id, path, fingerprint(path)))
    outputs = identity_inference.character_tags([path for _, path, _ in paths], engine)
    result = []
    for image_id, path, digest in paths:
        if fingerprint(path) != digest:
            raise IdentityConflict('Image changed during tagging. Retry it.')
        candidates = outputs.get(path, {})
        result.append({'image_id': image_id, 'candidates': [
            {'tag': name, 'score': float(score), 'engine': engine,
             'content_hash': digest}
            for name, score in sorted(candidates.items(), key=lambda pair: -pair[1])
            if isinstance(score, (int, float)) and math.isfinite(score)]})
    return {'images': result}

