"""Persistent manual collections. Membership never writes images or files."""
import json
import os
from datetime import datetime, timezone

from sqlalchemy import and_, func

from ..extensions import db
from ..models import BankCollection, BankCollectionMember, BankImage
from ..utils.dbbusy import write_with_retry
from . import bank_jobs


class CollectionConflict(ValueError):
    pass


class CollectionNotFound(ValueError):
    pass


def positive_id(value, label='ID'):
    if isinstance(value, bool) or not isinstance(value, int) or value < 1:
        raise ValueError(f'{label} must be a positive integer')
    return value


def _ids(values):
    if not isinstance(values, list) or len(values) > 200_000:
        raise ValueError('image_ids must be a list of at most 200000 image IDs')
    return list(dict.fromkeys(positive_id(value, 'image ID') for value in values))


def _name(value):
    if not isinstance(value, str):
        raise ValueError('collection name is required')
    value = value.strip()
    if not value or len(value) > 128 or any(ord(char) < 32 for char in value):
        raise ValueError('collection name must contain 1 to 128 characters without control characters')
    return value


def _bank(user_id, bank_id):
    from . import image_bank_service as banks
    bank = banks.get_bank(user_id, bank_id)
    if not bank:
        raise CollectionNotFound('bank not found')
    return bank


def _collection(user_id, bank_id, collection_id, *, deleted=False):
    _bank(user_id, bank_id)
    row = BankCollection.query.filter_by(
        id=positive_id(collection_id, 'collection ID'), bank_id=bank_id).first()
    if not row or (row.deleted and not deleted):
        raise CollectionNotFound('collection not found')
    return row


def _members(collection_id):
    return BankCollectionMember.query.filter_by(collection_id=collection_id).order_by(
        BankCollectionMember.position, BankCollectionMember.image_id)


def _summary(row, count=None):
    return {'id': row.id, 'name': row.name, 'revision': row.revision,
            'deleted': row.deleted,
            'count': _members(row.id).count() if count is None else count}


def _snapshot(row):
    return {**_summary(row), 'members': [
        {'image_id': member.image_id, 'image_instance_id': member.image_instance_id,
         'label': member.label, 'position': member.position}
        for member in _members(row.id).all()]}


def _write(bank_id, fn):
    try:
        with bank_jobs.mutation_lease(bank_id, 'collections'):
            return write_with_retry(fn)
    except Exception:
        db.session.rollback()
        raise


def _claim(row, revision):
    revision = positive_id(revision, 'revision')
    changed = BankCollection.query.filter_by(id=row.id, revision=revision).update(
        {'revision': revision + 1, 'undo_state': None,
         'updated_at': datetime.now(timezone.utc).replace(tzinfo=None)},
        synchronize_session=False)
    if changed != 1:
        raise CollectionConflict('Collection changed in another window. Reload it before saving.')
    db.session.expire(row)


def _undo_offer(owner, before):
    owner.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    owner.undo_state = json.dumps({'before': before, 'after': [
        {'id': state['id'], 'revision': db.session.get(BankCollection, state['id']).revision}
        for state in before]})


def list_collections(user_id, bank_id):
    _bank(user_id, bank_id)
    rows = BankCollection.query.filter_by(bank_id=bank_id).order_by(
        BankCollection.updated_at.desc(), BankCollection.id.desc()).all()
    counts = dict(db.session.query(BankCollectionMember.collection_id, func.count())
                  .join(BankCollection, BankCollection.id == BankCollectionMember.collection_id)
                  .filter(BankCollection.bank_id == bank_id)
                  .group_by(BankCollectionMember.collection_id).all())
    by_id = {row.id: row for row in rows}
    undo = None
    for row in rows:
        if row.undo_state:
            state = json.loads(row.undo_state)
            if all(item['id'] in by_id and by_id[item['id']].revision == item['revision']
                   for item in state['after']):
                undo = _summary(row, counts.get(row.id, 0))
                break
    return {'collections': [_summary(row, counts.get(row.id, 0)) for row in rows if not row.deleted],
            'undo': undo}


def image_query(user_id, bank_id, collection_id, query):
    _bank(user_id, bank_id)
    return scope_query(bank_id, collection_id, query)


def scope_query(bank_id, collection_id, query):
    row = BankCollection.query.filter_by(
        id=positive_id(collection_id, 'collection ID'), bank_id=bank_id, deleted=False).first()
    if not row:
        raise CollectionNotFound('Collection is unavailable. Clear the collection filter.')
    return query.join(BankCollectionMember, and_(
        BankCollectionMember.image_id == BankImage.id,
        BankCollectionMember.image_instance_id == BankImage.instance_id,
        BankCollectionMember.collection_id == collection_id))


def member_ids(user_id, bank_id, collection_id):
    row = _collection(user_id, bank_id, collection_id)
    return {'collection': _summary(row), 'ids': [member.image_id for member in _members(row.id)]}


def detail(user_id, bank_id, collection_id, offset=0, limit=24):
    from . import image_bank_service as banks
    bank = _bank(user_id, bank_id)
    row = _collection(user_id, bank_id, collection_id)
    offset = max(0, int(offset))
    limit = max(1, min(100, int(limit)))
    members = _members(row.id).offset(offset).limit(limit).all()
    ids = [member.image_id for member in members]
    images = BankImage.query.filter(BankImage.bank_id == bank_id, BankImage.id.in_(ids)).all()
    by_id = {image.id: image for image in images}
    valid = [by_id[member.image_id] for member in members
             if member.image_id in by_id
             and by_id[member.image_id].instance_id == member.image_instance_id]
    payloads = {image['id']: image for image in banks._page_images(valid, banks.thresholds(), bank_id)}
    out = []
    for member in members:
        image = payloads.get(member.image_id)
        source = banks.abs_image_path(bank, by_id[member.image_id]) if image else None
        out.append({'id': member.image_id, 'label': member.label, 'image': image,
                    'missing': not source or not os.path.isfile(source)})
    return {'collection': _summary(row), 'members': out, 'offset': offset}


def promotable_ids(user_id, bank_id, collection_id):
    from . import image_bank_service as banks
    bank = _bank(user_id, bank_id)
    query = image_query(user_id, bank_id, collection_id,
                        BankImage.query.filter_by(bank_id=bank_id, status='keep'))
    ids = []
    for image in query.order_by(BankCollectionMember.position).all():
        source = banks.abs_image_path(bank, image)
        if source and os.path.isfile(source):
            ids.append(image.id)
    return ids


def _add_images(row, bank_id, ids):
    existing = {member.image_id for member in _members(row.id).all()}
    position = db.session.query(func.max(BankCollectionMember.position)).filter_by(
        collection_id=row.id).scalar()
    position = -1 if position is None else position
    by_id = {}
    for start in range(0, len(ids), 500):
        by_id.update({image.id: image for image in BankImage.query.filter(
            BankImage.bank_id == bank_id, BankImage.id.in_(ids[start:start + 500])).all()})
    if any(image_id not in by_id for image_id in ids):
        raise ValueError('One or more selected images are not in this Bank. Reload the selection.')
    for image_id in ids:
        if image_id in existing:
            member = db.session.get(BankCollectionMember, (row.id, image_id))
            if member.image_instance_id != by_id[image_id].instance_id:
                raise CollectionConflict('An image ID has been reused. Remove its missing membership first.')
            continue
        position += 1
        image = by_id[image_id]
        db.session.add(BankCollectionMember(collection_id=row.id, image_id=image.id,
                                           image_instance_id=image.instance_id,
                                           label=os.path.basename(image.relpath), position=position))


def create(user_id, bank_id, name, image_ids):
    name, ids = _name(name), _ids(image_ids)

    def apply():
        _bank(user_id, bank_id)
        row = BankCollection(bank_id=bank_id, name=name)
        db.session.add(row)
        db.session.flush()
        before = {**_snapshot(row), 'deleted': True}
        _add_images(row, bank_id, ids)
        _undo_offer(row, [before])
        return row.id

    collection_id = _write(bank_id, apply)
    return detail(user_id, bank_id, collection_id)


def mutate(user_id, bank_id, collection_id, data):
    operation = data.get('operation')
    if operation not in ('rename', 'members', 'delete', 'merge', 'split', 'undo'):
        raise ValueError('unknown collection operation')

    def apply():
        row = _collection(user_id, bank_id, collection_id, deleted=operation == 'undo')
        if operation == 'undo':
            if not row.undo_state:
                raise CollectionConflict('There is no collection change to undo.')
            undo = json.loads(row.undo_state)
            if row.revision != positive_id(data.get('revision'), 'revision'):
                raise CollectionConflict('Collection changed. Reload before undoing.')
            for state in undo['after']:
                changed = _collection(user_id, bank_id, state['id'], deleted=True)
                _claim(changed, state['revision'])
            for state in undo['before']:
                changed = db.session.get(BankCollection, state['id'])
                changed.name, changed.deleted = state['name'], state['deleted']
                BankCollectionMember.query.filter_by(collection_id=changed.id).delete(synchronize_session=False)
                for member in state['members']:
                    db.session.add(BankCollectionMember(collection_id=changed.id, **member))
            return row.id

        before = [_snapshot(row)]
        _claim(row, data.get('revision'))
        owner = row
        if operation == 'rename':
            row.name = _name(data.get('name'))
        elif operation == 'delete':
            row.deleted = True
        elif operation == 'members':
            add_ids, remove_ids = _ids(data.get('add_ids', [])), _ids(data.get('remove_ids', []))
            if set(add_ids) & set(remove_ids):
                raise ValueError('An image cannot be added and removed in the same change.')
            for start in range(0, len(remove_ids), 500):
                BankCollectionMember.query.filter(
                    BankCollectionMember.collection_id == row.id,
                    BankCollectionMember.image_id.in_(remove_ids[start:start + 500])).delete(synchronize_session=False)
            _add_images(row, bank_id, add_ids)
        else:
            if data.get('target_id') is not None:
                target = _collection(user_id, bank_id, data['target_id'])
                if target.id == row.id:
                    raise ValueError('Choose another collection.')
                before.append(_snapshot(target))
                _claim(target, data.get('target_revision'))
            else:
                if operation == 'merge':
                    raise ValueError('Choose a collection to merge into.')
                target = BankCollection(bank_id=bank_id, name=_name(data.get('name')))
                db.session.add(target)
                db.session.flush()
                before.append({**_snapshot(target), 'deleted': True})
            selected = _ids(data.get('image_ids', [])) if operation == 'split' else None
            source = _members(row.id).all()
            if selected is not None and (not selected or set(selected) - {member.image_id for member in source}):
                raise ValueError('Select members of this collection to split.')
            target_members = {member.image_id: member for member in _members(target.id).all()}
            position = max((member.position for member in target_members.values()), default=-1)
            for member in source:
                if selected is not None and member.image_id not in selected:
                    continue
                existing = target_members.get(member.image_id)
                if existing and existing.image_instance_id != member.image_instance_id:
                    raise CollectionConflict('Collections contain different instances of a reused image ID.')
                if not existing:
                    position += 1
                    db.session.add(BankCollectionMember(
                        collection_id=target.id, image_id=member.image_id,
                        image_instance_id=member.image_instance_id, label=member.label, position=position))
                if operation == 'split':
                    db.session.delete(member)
            if operation == 'merge':
                row.deleted = True
            owner = target
        db.session.flush()
        _undo_offer(owner, before)
        return owner.id

    changed_id = _write(bank_id, apply)
    return {'collection_id': changed_id, **list_collections(user_id, bank_id)}


def drop_for_bank(bank_id):
    ids = db.session.query(BankCollection.id).filter_by(bank_id=bank_id)
    BankCollectionMember.query.filter(BankCollectionMember.collection_id.in_(ids)).delete(synchronize_session=False)
    BankCollection.query.filter_by(bank_id=bank_id).delete(synchronize_session=False)
