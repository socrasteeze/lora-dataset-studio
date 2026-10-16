"""Synthetic behavioral checks for all three review-only curation selectors."""
from copy import deepcopy

import pytest

from test_image_bank_curation import _emb, _mkbank, _uid, _write_score_cache

np = pytest.importorskip('numpy')


def _item(i, **values):
    return {'id': i, 'flags': [], 'quality_state': 'ok', **values}


def _select(items, vectors, *, mode='diverse', n=2, policy=None, refs=None, **kwargs):
    from app.services import bank_curation as curation
    E = np.asarray(vectors, dtype='float32')
    E /= np.linalg.norm(E, axis=1, keepdims=True) + 1e-8
    return curation.select(items, E, n, policy or {}, mode=mode,
                           isolation=lambda rows: np.zeros(len(rows), dtype='float32'),
                           reference_vectors=refs, **kwargs)


@pytest.mark.parametrize('kind,axis', [('character', 'framing'), ('concept', 'view'), ('style', 'subject')])
def test_each_kind_has_a_real_default_axis_and_selection_receipt(kind, axis):
    result = _select([_item(1, caption='a woman in profile outdoors'),
                      _item(2, caption='a dog seen from behind indoors')],
                     [[1, 0], [0, 1]], mode='balanced', policy={'kind': kind})
    assert result['axis'] == axis
    assert result['kind'] == kind
    assert result['selection_only'] is True
    assert result['selected'] == 2
    assert result['coverage']


@pytest.mark.parametrize('kind', ['character', 'concept', 'style'])
@pytest.mark.parametrize('mode', ['similar', 'diverse', 'balanced'])
def test_quality_preference_and_duplicate_limit_apply_to_every_kind_and_selector(kind, mode):
    items = [_item(1, dup_group=1, flags=['blur']), _item(2, dup_group=1), _item(3)]
    result = _select(items, [[1, 0], [1, 0], [0.9, 0.1]], mode=mode,
                     policy={'kind': kind, 'reference_ids': [2]}, refs={2: _emb(1, 0)[:2]})
    assert result['image_ids'] == [2, 3]
    assert result['duplicate_omitted'] == 1
    assert 'nsfw' not in result['results'][0]['flags']


def test_representative_seed_does_not_follow_import_id():
    result = _select([_item(1), _item(2), _item(3)],
                     [[-1, 0], [1, 0], [0.99, 0.01]], n=1)
    assert result['image_ids'][0] in (2, 3)
    assert result['results'][0]['reason'] == 'representative seed'


def test_pinned_seed_keeps_the_full_cosine_distance_range():
    result = _select([_item(1), _item(2), _item(3)],
                     [[1, 0], [-0.6, 0.8], [-1, 0]], policy={'locked_ids': [1]})
    assert result['image_ids'] == [1, 3]


def test_invalid_embeddings_never_produce_an_arbitrary_shortlist():
    with pytest.raises(ValueError, match='invalid embeddings'):
        _select([_item(1)], [[float('nan'), 0]])


def test_unmeasured_quality_is_not_bad_quality():
    result = _select([_item(1, quality_state=None), _item(2, flags=['blur'])],
                     [[1, 0], [1, 0]], n=1)
    assert result['image_ids'] == [1]
    assert result['quality_unknown'] == 1


def test_quality_preference_can_be_disabled_without_changing_flags():
    result = _select([_item(1, flags=['blur']), _item(2)], [[1, 0], [1, 0]],
                     n=1, policy={'prefer_quality': False})
    assert result['image_ids'] == [1]
    assert result['results'][0]['flags'] == ['blur']


def test_aesthetic_and_nsfw_are_not_technical_quality_penalties():
    result = _select([_item(1, flags=['low_aesthetic', 'nsfw']), _item(2)],
                     [[1, 0], [1, 0]], n=1)
    assert result['image_ids'] == [1]
    assert result['results'][0]['quality_factor'] == 1


def test_pins_preserve_rare_views_and_override_duplicate_and_match_limits():
    result = _select([_item(1, dup_group=1), _item(2, dup_group=1), _item(3)],
                     [[-1, 0], [1, 0], [1, 0]], mode='similar',
                     policy={'reference_ids': [2], 'locked_ids': [1, 2], 'min_similarity': 0.9},
                     refs={2: np.array([1, 0])})
    assert result['image_ids'] == [1, 2]
    assert all(row['reason'] == 'pinned' for row in result['results'])


def test_missing_pins_are_reported_and_unreadable_pins_do_not_enter_selection():
    result = _select([_item(1, flags=['unreadable']), _item(2)], [[1, 0], [1, 0]],
                     policy={'locked_ids': [1, 999]})
    assert result['image_ids'] == [2]
    assert result['missing_locked'] == 2


def test_pins_cannot_silently_exceed_requested_count():
    with pytest.raises(ValueError, match='smaller than'):
        _select([_item(1), _item(2)], [[1, 0], [0, 1]], n=1,
                policy={'locked_ids': [1, 2]})


def test_distinct_image_decisions_override_duplicate_groups():
    result = _select([_item(1, semantic_dup_group=1), _item(2, semantic_dup_group=1)],
                     [[1, 0], [1, 0]], distinct_pairs={(1, 2)})
    assert result['image_ids'] == [1, 2]


def test_duplicate_limit_does_not_pad_a_short_selection():
    result = _select([_item(1, dup_group=1), _item(2, dup_group=1)], [[1, 0], [1, 0]])
    assert result['selected'] == 1
    assert result['shortfall'] == 1
    unlocked = _select([_item(1, dup_group=1), _item(2, dup_group=1)],
                       [[1, 0], [1, 0]], policy={'duplicate_limit': 0})
    assert unlocked['selected'] == 2


def test_multiple_references_preserve_different_views_and_extension_is_a_prefix():
    items = [_item(i) for i in range(1, 5)]
    vectors = [[1, 0], [0, 1], [0.9, 0.1], [-1, 0]]
    policy = {'reference_ids': [1, 2], 'min_similarity': 0.8}
    refs = {1: np.array([1, 0]), 2: np.array([0, 1])}
    first = _select(items, vectors, mode='similar', n=2, policy=policy, refs=refs)
    more = _select(items, vectors, mode='similar', n=4, policy=policy, refs=refs)
    assert first['image_ids'] == [1, 2]
    assert more['image_ids'][:2] == first['image_ids']
    assert more['image_ids'] == [1, 2, 3]
    assert more['below_minimum'] == 1
    assert more['shortfall'] == 1


def test_face_matching_reports_unknown_faces_without_calling_them_wrong():
    result = _select([_item(1), _item(2), _item(3, framing='back')],
                     [[1, 0], [1, 0], [0, 1]], mode='similar', n=3,
                     policy={'match': 'face', 'reference_ids': [1], 'min_similarity': 0.5},
                     refs={1: np.array([1, 0])},
                     match_vectors={1: np.array([1, 0]), 2: np.array([-1, 0])})
    assert result['image_ids'] == [1]
    assert result['unknown_match_ids'] == [3]
    assert result['below_minimum'] == 1


@pytest.mark.parametrize('kind', ['concept', 'style'])
def test_non_character_kinds_refuse_face_and_person_constraints(kind):
    from app.services import bank_curation as curation
    with pytest.raises(ValueError, match='Character'):
        curation.options({'kind': kind, 'match': 'face'})
    with pytest.raises(ValueError, match='axis'):
        curation.options({'kind': kind, 'axis': 'framing+person'})


def test_custom_targets_redistribute_shortages_and_report_absent_buckets():
    items = [_item(i, framing='face' if i < 4 else 'body') for i in range(1, 8)]
    result = _select(items, np.eye(7), mode='balanced', n=6,
                     policy={'weights': {'face': 1, 'bust': 0, 'body': 1, 'back': 1, 'unknown': 0}})
    buckets = {b['key']: b for b in result['buckets']}
    assert result['selected'] == 6
    assert buckets['face']['selected'] == 3
    assert buckets['body']['selected'] == 3
    assert buckets['back']['fair_share'] == 2
    assert buckets['back']['under_target']


def test_unknown_labels_have_a_real_review_bucket_instead_of_disappearing():
    result = _select([_item(1), _item(2, caption='unclassified material')],
                     [[1, 0], [0, 1]], mode='balanced', policy={'kind': 'style'})
    assert result['image_ids'] == [1, 2]
    assert result['unlabelled'] == 2
    assert any(bucket['key'] == 'unknown' and bucket['selected'] == 2 for bucket in result['buckets'])


def test_all_inputs_are_unchanged_and_result_is_deterministic():
    items = [_item(1), _item(2, caption='a woman outdoors')]
    snapshot = deepcopy(items)
    vectors = [[1, 0], [0, 1]]
    first = _select(items, vectors)
    assert first == _select(items, vectors)
    assert items == snapshot


@pytest.mark.parametrize('policy', [
    {'kind': 'invalid'}, {'duplicate_limit': -1}, {'duplicate_limit': True},
    {'min_similarity': float('nan')}, {'min_similarity': 2}, {'reference_ids': [True]},
    {'reference_ids': list(range(1, 18))}, {'locked_ids': ['1']},
    {'weights': []}, {'weights': {'face': -1}},
    {'weights': {'face': float('inf')}}, {'prefer_quality': 'yes'},
])
def test_invalid_policy_is_refused(policy):
    from app.services import bank_curation as curation
    with pytest.raises(ValueError):
        curation.options(policy)


def test_explicit_zero_weight_excludes_one_bucket_without_disabling_other_defaults():
    result = _select([_item(1, framing='face'), _item(2, framing='body')],
                     [[1, 0], [0, 1]], mode='balanced', policy={'weights': {'face': 0}})
    assert result['image_ids'] == [2]
    assert result['shortfall'] == 1


@pytest.mark.parametrize('mode', ['similar', 'diverse', 'balanced'])
@pytest.mark.parametrize('kind', ['character', 'concept', 'style'])
def test_api_policy_stays_inside_filter_preserves_status_and_source_bytes(client, tmp_path, app, mode, kind):
    bank_id, source = _mkbank(client, tmp_path, ['image-01.png', 'image-02.png', 'image-03.png'])
    _write_score_cache(app, bank_id, {'image-01.png': _emb(1, 0),
                                    'image-02.png': _emb(0.99, 0.01), 'image-03.png': _emb(0, 1)})
    with app.app_context():
        from app.models import BankImage
        from app.services import image_bank_service as banks
        rows = BankImage.query.filter_by(bank_id=bank_id).order_by(BankImage.id).all()
        reference = rows[0].id
        rows[0].status = rows[1].status = 'keep'
        rows[2].status = 'reject'
        rows[0].framing = rows[1].framing = 'face'
        banks.db.session.commit()
        before = [(row.id, row.status, row.caption) for row in rows]
    before_bytes = {path.name: path.read_bytes() for path in source.iterdir()}
    response = client.post(f'/api/bank/{bank_id}/select-{mode}', json={
        'n': 10, 'ref_id': reference, 'status': 'keep',
        'selection': {'kind': kind, 'reference_ids': [reference], 'locked_ids': [rows[2].id]},
    })
    assert response.status_code == 200, response.get_json()
    result = response.get_json()
    assert set(result['image_ids']) == {row[0] for row in before[:2]}
    assert result['missing_locked'] == 1
    assert result['selection_only']
    assert result['engine'] == 'clip'
    with app.app_context():
        rows = BankImage.query.filter_by(bank_id=bank_id).order_by(BankImage.id).all()
        assert [(row.id, row.status, row.caption) for row in rows] == before
    assert {path.name: path.read_bytes() for path in source.iterdir()} == before_bytes


def test_foreign_references_are_refused(client, tmp_path, app):
    bank_id, _ = _mkbank(client, tmp_path, ['image-01.png'])
    _write_score_cache(app, bank_id, {'image-01.png': _emb(1, 0)})
    response = client.post(f'/api/bank/{bank_id}/select-diverse', json={
        'selection': {'reference_ids': [999999]},
    })
    assert response.status_code == 400
    assert 'this bank' in response.get_json()['error']


def test_similar_accepts_reference_list_without_legacy_single_reference_field(client, tmp_path, app):
    bank_id, _ = _mkbank(client, tmp_path, ['image-01.png'])
    _write_score_cache(app, bank_id, {'image-01.png': _emb(1, 0)})
    with app.app_context():
        from app.models import BankImage
        iid = BankImage.query.filter_by(bank_id=bank_id).one().id
    response = client.post(f'/api/bank/{bank_id}/select-similar', json={
        'selection': {'reference_ids': [iid]},
    })
    assert response.status_code == 200, response.get_json()
    assert response.get_json()['image_ids'] == [iid]


def test_metadata_defaults_have_one_owner(client):
    from app.services import bank_curation as curation
    response = client.get('/api/bank/curation-options')
    assert response.status_code == 200
    assert response.get_json() == curation.describe()


def test_face_matching_requires_current_payload_hashes_and_usable_measurements(client, tmp_path, app):
    import hashlib
    bank_id, source = _mkbank(client, tmp_path, ['image-01.png', 'image-02.png'])
    with app.app_context():
        from app.models import BankImage
        from app.services import image_bank_service as banks
        bank = banks.get_bank(_uid(), bank_id)
        rows = BankImage.query.filter_by(bank_id=bank_id).order_by(BankImage.id).all()
        for row in rows:
            row.face_state = 'scorable'
            row.medium = 'photo'
        paths = [banks.analysis_image_path(bank, row) for row in rows]
        hashes = np.stack([np.frombuffer(hashlib.sha256((source / row.relpath).read_bytes()).digest(),
                                       dtype='uint8') for row in rows])
        vectors = np.zeros((2, 512), dtype='float32')
        vectors[:, 0] = 1
        banks._face_cache_path(bank_id).parent.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(banks._face_cache_path(bank_id), paths=np.array(paths),
                            states=np.array(['scorable', 'scorable']), embs=vectors, hashes=hashes)
        assert set(banks._curation_face_vectors(bank, rows)) == {row.id for row in rows}
        rows[0].medium = 'anime'
        assert set(banks._curation_face_vectors(bank, rows)) == {rows[1].id}
        (source / rows[1].relpath).write_bytes(b'changed synthetic payload')
        assert banks._curation_face_vectors(bank, rows) == {}


def test_weighted_quotas_conserve_count_and_respect_capacity():
    from app.services import bank_curation as curation
    rng = np.random.RandomState(42)
    for _ in range(100):
        sizes = {str(i): int(rng.randint(0, 30)) for i in range(8)}
        weights = {str(i): float(rng.randint(0, 10)) for i in range(8)}
        n = int(rng.randint(1, 100))
        result = curation.weighted_quotas(sizes, n, weights)
        assert sum(result.values()) == min(n, sum(sizes[k] for k in sizes if weights[k] > 0))
        assert all(0 <= result[k] <= sizes[k] for k in sizes)
        assert all(result[k] == 0 for k in sizes if weights[k] == 0)
