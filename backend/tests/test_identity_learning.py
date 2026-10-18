"""Behavioral identity regressions with invented images and stub model vectors."""
import io
import json
from pathlib import Path

import numpy as np
import pytest
from PIL import Image


def vector(*values, dimension=768):
    out = np.zeros(dimension, dtype='float32')
    out[:len(values)] = values
    return out.tolist()


@pytest.fixture
def library(app, tmp_path, monkeypatch):
    from app.config import LOCAL_USER
    from app.extensions import db
    from app.models import BankImage, FaceDataset, FaceDatasetImage, ImageBank
    from app.services.face_dataset_service import _dataset_dir
    from app.services import identity_inference
    with app.app_context():
        folder = tmp_path / 'images'
        folder.mkdir()
        bank = ImageBank(user_id=LOCAL_USER, name='Fixture', source_path=str(folder))
        dataset = FaceDataset(user_id=LOCAL_USER, name='Fixture', trigger_word='subject')
        db.session.add_all([bank, dataset])
        db.session.flush()
        destination = Path(_dataset_dir(dataset.id))
        destination.mkdir(parents=True, exist_ok=True)
        bank_ids, dataset_ids = [], []
        for index in range(4):
            filename = f'image-{index+1:02d}.png'
            image = Image.new('RGB', (128, 128), (30+index*20, 60, 90))
            image.save(folder / filename)
            image.save(destination / filename)
            row = BankImage(bank_id=bank.id, relpath=filename, status='pending',
                            caption='Invented caption', width=128, height=128)
            other = FaceDatasetImage(dataset_id=dataset.id, filename=filename,
                                     status='keep', caption='Invented caption', source='import')
            db.session.add_all([row, other])
            db.session.flush()
            bank_ids.append(row.id)
            dataset_ids.append(other.id)
        db.session.commit()
        result = {'bank': bank.id, 'dataset': dataset.id,
                  'bank_ids': bank_ids, 'dataset_ids': dataset_ids,
                  'folder': folder, 'destination': destination, 'user': LOCAL_USER}

    def extract(items, kind):
        return [{'state': 'measured', 'subjects': [{
            'region': item.get('region') or ([0.1, 0.1, 0.4, 0.4] if kind == 'person' else None),
            'vector': vector(1, 0, dimension=512 if kind == 'person' else 768)}]}
            for item in items]
    monkeypatch.setattr(identity_inference, 'extract', extract)
    with app.app_context():
        yield result


def create(client, name='Aster', kind='anime'):
    response = client.post('/api/identities', json={'name': name, 'kind': kind})
    assert response.status_code == 200, response.get_json()
    return response.get_json()


def assign(client, lib, identity, ids=None, source='bank', **extra):
    ids = ids or [lib[source+'_ids'][0]]
    base = f"/api/identity/{source}/{lib[source]}"
    preview = client.post(base+'/view', json={'image_ids': ids}).get_json()
    return client.post(base+'/assign', json={
        **preview, 'image_ids': ids, 'identity_id': identity['id'],
        'single_subject': True, 'learn': True, **extra})


def analyze(client, lib, ids=None, source='bank', kind='anime'):
    ids = ids or lib[source+'_ids'][1:3]
    base = f"/api/identity/{source}/{lib[source]}"
    preview = client.post(base+'/view', json={'image_ids': ids}).get_json()
    result = client.post(base+'/analyze', json={**preview, 'image_ids': ids, 'kind': kind})
    assert result.status_code == 200, result.get_json()
    return base


def suggest(client, lib, ids=None, source='bank', kind='anime', **settings):
    ids = ids or lib[source+'_ids'][1:3]
    response = client.post(f"/api/identity/{source}/{lib[source]}/suggest",
                           json={'image_ids': ids, 'kind': kind, **settings})
    assert response.status_code == 200, response.get_json()
    return response.get_json()


@pytest.mark.parametrize('source', ['bank', 'dataset'])
@pytest.mark.parametrize('kind', ['anime', 'person'])
def test_naming_enrolls_an_example_and_suggests_unseen_images(client, library, source, kind):
    identity = create(client, kind=kind)
    response = assign(client, library, identity, source=source)
    assert response.status_code == 200, response.get_json()
    assert response.get_json()['learning']['measured'] == 1
    analyze(client, library, source=source, kind=kind)
    result = suggest(client, library, source=source, kind=kind)
    assert result['reference_identities'] == 1
    assert all(s['identity']['id'] == identity['id'] for s in result['suggestions'])
    assert all(s['state'] == 'suggested' for s in result['suggestions'])
    assert result['thresholds_measured'] is False
    assert client.get(f"/api/identity/{source}/{library[source]}/filter/{identity['id']}").get_json()['image_ids'] == [library[source+'_ids'][0]]


def test_same_profile_examples_work_across_surfaces(client, library):
    identity = create(client)
    assert assign(client, library, identity).status_code == 200
    analyze(client, library, source='dataset', ids=library['dataset_ids'][1:3])
    result = suggest(client, library, source='dataset', ids=library['dataset_ids'][1:3])
    assert result['suggestions'][0]['identity']['id'] == identity['id']


def test_unconfirmed_suggestions_never_teach(client, library):
    from app.models import IdentityAssignment
    identity = create(client)
    assign(client, library, identity)
    analyze(client, library)
    suggest(client, library)
    assert IdentityAssignment.query.filter_by(state='confirmed').count() == 1


def test_rejection_is_pair_specific_and_durable(client, library):
    identity = create(client)
    assign(client, library, identity)
    analyze(client, library)
    hint = suggest(client, library)['suggestions'][0]
    response = client.post('/api/identity/subjects/'+hint['subject_id']+'/decision', json={
        'identity_id': identity['id'], 'revision': hint['revision'], 'action': 'reject'})
    assert response.status_code == 200
    assert all(s['subject_id'] != hint['subject_id'] for s in suggest(client, library)['suggestions'])
    assert client.post('/api/identity/actions/'+response.get_json()['action_id']+'/undo', json={}).get_json()['restored'] == 1
    assert any(s['subject_id'] == hint['subject_id'] for s in suggest(client, library)['suggestions'])


def test_correcting_a_name_removes_the_old_reference_contribution(client, library):
    first, second = create(client), create(client, 'Nova')
    assign(client, library, first)
    corrected = assign(client, library, second, replace_identity_id=first['id'])
    assert corrected.status_code == 200, corrected.get_json()
    analyze(client, library)
    result = suggest(client, library)
    assert result['reference_identities'] == 1
    assert result['suggestions'][0]['identity']['id'] == second['id']


def test_undo_never_overwrites_later_human_work(client, library):
    first, second = create(client), create(client, 'Nova')
    original = assign(client, library, first).get_json()
    assert assign(client, library, second, replace_identity_id=first['id']).status_code == 200
    undone = client.post('/api/identity/actions/'+original['action_id']+'/undo', json={})
    assert undone.get_json() == {'restored': 0, 'skipped': 1}
    assert client.get(f"/api/identity/bank/{library['bank']}/filter/{second['id']}").get_json()['image_ids']


def test_multiple_characters_need_subject_regions_before_learning(client, library):
    identity = create(client)
    response = assign(client, library, identity, single_subject=False)
    assert response.status_code == 400
    response = assign(client, library, identity, single_subject=False,
                      regions={str(library['bank_ids'][0]): [0.1, 0.1, 0.4, 0.4]})
    assert response.status_code == 200


def test_several_names_do_not_teach_from_the_same_whole_frame(client, library):
    first, second = create(client), create(client, 'Nova')
    assert assign(client, library, first).status_code == 200
    assert assign(client, library, second).status_code == 400
    assert assign(client, library, second, learn=False).status_code == 200
    analyze(client, library)
    assert suggest(client, library)['reference_identities'] == 0


def test_multiple_detected_faces_do_not_enroll_the_biggest(client, library, monkeypatch):
    from app.services import identity_inference
    from app.models import IdentitySubject, IdentityAssignment
    monkeypatch.setattr(identity_inference, 'extract', lambda items, kind: [
        {'subjects': [{'region': [0, 0, 0.3, 0.3], 'vector': vector(1, dimension=512)},
                      {'region': [0.5, 0.5, 0.4, 0.4], 'vector': vector(0, 1, dimension=512)}]}
        for _ in items])
    identity = create(client, kind='person')
    assert assign(client, library, identity, single_subject=False).status_code == 200
    assert not any(s.single_subject for s in IdentitySubject.query.join(
        IdentityAssignment, IdentitySubject.id == IdentityAssignment.subject_id).all())
    analyze(client, library, kind='person')
    assert suggest(client, library, kind='person')['reference_identities'] == 0


def test_pixel_changes_invalidate_examples_without_removing_names(client, library):
    identity = create(client)
    assign(client, library, identity)
    Image.new('RGB', (128, 128), 'white').save(library['folder']/'image-01.png')
    analyze(client, library)
    result = suggest(client, library)
    assert not result['suggestions']
    assert result['stale_references'] >= 1
    filtered = client.get(f"/api/identity/bank/{library['bank']}/filter/{identity['id']}")
    assert filtered.get_json()['image_ids'] == [library['bank_ids'][0]]


def test_empty_missing_or_cross_scope_requests_refuse_before_writes(client, library):
    identity = create(client)
    for ids in ([], [True], [999999], list(range(1, 66))):
        response = client.post(f"/api/identity/bank/{library['bank']}/assign", json={
            'identity_id': identity['id'], 'image_ids': ids})
        assert response.status_code in (400, 404, 409)


def test_stale_bulk_preview_cannot_overwrite_a_decision(client, library):
    identity = create(client)
    base = f"/api/identity/bank/{library['bank']}"
    preview = client.post(base+'/view', json={'image_ids': library['bank_ids'][:1]}).get_json()
    assign(client, library, identity)
    response = client.post(base+'/assign', json={**preview, 'image_ids': library['bank_ids'][:1],
                                                'identity_id': identity['id']})
    assert response.status_code == 409


def test_identity_operations_preserve_pixels_captions_and_image_decisions(client, library):
    from app.models import BankImage
    from app.services.identity_learning import fingerprint
    before = [(r.id, r.caption, r.status) for r in BankImage.query.all()]
    hashes = [fingerprint(library['folder']/f'image-{i:02d}.png') for i in range(1, 5)]
    identity = create(client)
    assign(client, library, identity)
    analyze(client, library)
    suggest(client, library)
    assert [(r.id, r.caption, r.status) for r in BankImage.query.all()] == before
    assert hashes == [fingerprint(library['folder']/f'image-{i:02d}.png') for i in range(1, 5)]


def test_missing_runtime_keeps_the_name_and_reports_learning_gap(client, library, monkeypatch):
    from app.services import identity_inference
    monkeypatch.setattr(identity_inference, 'extract', lambda *a: (_ for _ in ()).throw(
        identity_inference.RecognitionUnavailable('Prepare the local engine.')))
    identity = create(client)
    response = assign(client, library, identity)
    assert response.status_code == 200
    assert response.get_json()['assigned'] == 1
    assert response.get_json()['learning']['measured'] == 0
    assert 'reason' in response.get_json()['learning']


def test_untrusted_identity_metadata_rejects_invalid_vectors(client, library):
    from app.models import BankImage
    from app.services.identity_metadata import normalize
    identity = create(client)
    assign(client, library, identity)
    payload = json.loads(BankImage.query.get(library['bank_ids'][0]).identity_snapshot)
    payload['subjects'][0]['evidence'][0]['vector'] = '00'*768*4
    with pytest.raises(ValueError, match='vector'):
        normalize(payload)


def test_explicit_transfer_preserves_names_and_valid_reference_evidence(client, library):
    from app.extensions import db
    from app.models import BankImage
    from app.services import identity_learning as service
    identity = create(client)
    assign(client, library, identity)
    row = db.session.get(BankImage, library['bank_ids'][0])
    # The first Dataset fixture holds exactly the same invented source bytes.
    service.restore_metadata(library['user'], 'dataset', library['dataset'],
                             library['dataset_ids'][0], row.identity_snapshot)
    db.session.commit()
    assert service.filter_ids(library['user'], 'dataset', library['dataset'], identity['id']) == library['dataset_ids'][:1]


def test_catalog_import_is_dictionary_only_and_can_be_repeated(client, library):
    text = b'character,copyright,trigger\naster_(demo),demo_series,aster\n'
    for _ in range(2):
        response = client.post('/api/identities/catalog/import',
                               data={'file': (io.BytesIO(text), 'catalog.csv')})
        assert response.status_code == 200
    result = client.get('/api/identities/catalog?q=aster').get_json()
    assert len(result['characters']) == 1
    from app.models import IdentityAssignment
    assert IdentityAssignment.query.count() == 0


def test_ambiguous_matches_remain_uncertain(client, library):
    first, second = create(client), create(client, 'Nova')
    assign(client, library, first, library['bank_ids'][:1])
    assign(client, library, second, library['bank_ids'][1:2])
    analyze(client, library, library['bank_ids'][2:])
    result = suggest(client, library, library['bank_ids'][2:])
    assert all(row['state'] == 'uncertain' for row in result['suggestions'])


def test_photographic_vectors_cannot_teach_anime_identity(client, library):
    identity = create(client, kind='person')
    assign(client, library, identity)
    analyze(client, library, kind='anime')
    assert suggest(client, library, kind='anime')['reference_identities'] == 0


def test_accuracy_receipt_uses_disjoint_artwork_and_the_shipped_matcher(client, library):
    identity = create(client)
    assign(client, library, identity)
    analyze(client, library)
    base = f"/api/identity/bank/{library['bank']}"
    data = client.post(base+'/view', json={'image_ids': library['bank_ids'][:2]}).get_json()
    reference = data['images'][0]['subjects'][0]['id']
    holdout = data['images'][1]['subjects'][0]['id']
    request = {'kind': 'anime',
               'references': [{'subject_id': reference, 'identity_id': identity['id'],
                               'artwork_group': 'reference-work'}],
               'holdouts': [{'subject_id': holdout, 'identity_id': identity['id'],
                             'artwork_group': 'unseen-work'}]}
    response = client.post('/api/identities/evaluate', json=request)
    assert response.status_code == 200, response.get_json()
    receipt = response.get_json()
    assert receipt['correct'] == 1
    assert receipt['wrong_name'] == 0
    assert receipt['total'] == 1
    assert receipt['coverage'] == 1
    request['holdouts'][0]['artwork_group'] = 'reference-work'
    assert client.post('/api/identities/evaluate', json=request).status_code == 400


def test_profile_transfer_materializes_a_local_identity_graph(client, library, tmp_path):
    from sqlalchemy import create_engine
    from app.extensions import db
    from app.models import BankImage
    from app.services.identity_metadata import materialize_sqlite
    identity = create(client)
    assign(client, library, identity)
    row = db.session.get(BankImage, library['bank_ids'][0])
    engine = create_engine('sqlite:///'+str(tmp_path/'profile.db'))
    db.metadata.create_all(engine)
    connection = engine.raw_connection()
    try:
        materialize_sqlite(connection, 'bank',
                           {'id': 91, 'instance_id': 'b'*32, 'user_id': library['user']},
                           {'id': 72, 'instance_id': 'c'*32,
                            'identity_snapshot': row.identity_snapshot})
        connection.commit()
        assert connection.execute('SELECT count(*) FROM named_identity').fetchone()[0] == 1
        assert connection.execute('SELECT count(*) FROM identity_assignment').fetchone()[0] == 1
        assert connection.execute('SELECT count(*) FROM identity_evidence').fetchone()[0] == 1
        assert connection.execute('SELECT scope_id,image_id FROM identity_subject').fetchone() == (91, 72)
    finally:
        connection.close()
        engine.dispose()


def test_training_zip_carries_identity_metadata_separately_from_captions(client, library):
    import zipfile
    from app.services import face_dataset_service as datasets
    from app.models import FaceDataset
    identity = create(client)
    assign(client, library, identity, source='dataset')
    output = io.BytesIO()
    datasets.write_export_zip(library['user'], library['dataset'], output)
    with zipfile.ZipFile(io.BytesIO(output.getvalue())) as archive:
        manifest = json.loads(archive.read('_identity_metadata.json'))
        assert len(manifest) == 1
        assert next(iter(manifest.values()))['subjects'][0]['assignments'][0]['identity']['id'] == identity['id']
        captions = [archive.read(name).decode() for name in archive.namelist() if name.endswith('.txt')]
        assert all('Aster' not in caption for caption in captions)
    target = datasets.create_dataset(library['user'], 'Imported', 'subject')
    ids, failed = datasets.import_dataset_zip(library['user'], target.id, output.getvalue())
    assert not failed
    assert ids
    from app.services.identity_learning import filter_ids
    assert filter_ids(library['user'], 'dataset', target.id, identity['id'])
    assert FaceDataset.query.count() == 2


def test_tag_suggestions_do_not_write_captions_or_confirm_identities(client, library, monkeypatch):
    from app.models import BankImage, IdentityAssignment
    from app.services import identity_inference
    monkeypatch.setattr(identity_inference, 'character_tags',
                        lambda paths, engine: {path: {'aster_demo': 0.9} for path in paths})
    base = f"/api/identity/bank/{library['bank']}"
    preview = client.post(base+'/view', json={'image_ids': library['bank_ids'][:1]}).get_json()
    response = client.post(base+'/tags', json={**preview, 'image_ids': library['bank_ids'][:1], 'engine': 'wd14'})
    assert response.status_code == 200
    assert response.get_json()['images'][0]['candidates'][0]['tag'] == 'aster_demo'
    assert IdentityAssignment.query.count() == 0
    assert BankImage.query.first().caption == 'Invented caption'


