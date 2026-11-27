import hashlib
import json
from pathlib import Path

import pytest

from test_image_bank_curation import _emb, _mkbank, _uid, _write_score_cache

np = pytest.importorskip('numpy')


def _write_faces(banks, bank, rows, counts):
    paths = [banks.abs_image_path(bank, row) for row in rows]
    hashes = [hashlib.sha256(Path(path).read_bytes()).digest() for path in paths]
    np.savez(banks._face_cache_path(bank.id), paths=np.array(paths),
             hashes=np.stack([np.frombuffer(value, dtype='uint8') for value in hashes]),
             states=np.array(['scorable'] * len(rows)),
             face_counts=np.array(counts, dtype='int32'))


@pytest.mark.parametrize('selector', ['select-balanced', 'select-diverse'])
@pytest.mark.parametrize('policy', [None, {}], ids=['legacy', 'policy'])
def test_person_guard_modes_and_unknown_candidates(client, app, tmp_path, selector, policy):
    from app.models import BankImage
    from app.services import image_bank_service as banks

    names = [f'{i:02d}.png' for i in range(10)]
    bank_id, _ = _mkbank(client, tmp_path, names)
    _write_score_cache(app, bank_id, {name: _emb(*row) for name, row in zip(names, np.eye(10))})
    with app.app_context():
        bank = banks.get_bank(_uid(), bank_id)
        rows = BankImage.query.filter_by(bank_id=bank_id).order_by(BankImage.relpath).all()
        for row in rows:
            row.framing = 'body'
        banks.db.session.commit()
        _write_faces(banks, bank, rows, [3, 2, 2, 1, 1, 1, 1, 1, 0, -1])
        multi_ids = {row.id for row in rows[:3]}
        unknown_id = rows[-1].id

    url = f'/api/bank/{bank_id}/{selector}'
    base = {'n': 10, 'typicality': 0, 'selection': policy}
    default = client.post(url, json=base).get_json()
    assert default['multi_person'] == 'exclude'
    assert default['multi_person_excluded'] == 3
    assert default['multi_person_kept'] == 0
    assert default['unknown_count'] == default['unknown_count_kept'] == 1
    assert unknown_id in default['image_ids']
    assert multi_ids.isdisjoint(default['image_ids'])

    cap = client.post(url, json={**base, 'multi_person': 'cap'}).get_json()
    assert len(cap['image_ids']) == 8
    assert cap['multi_person_kept'] == 1
    assert cap['multi_person_capped'] == 2
    small = client.post(url, json={**base, 'n': 4, 'multi_person': 'cap'}).get_json()
    assert len(small['image_ids']) == 4
    assert small['multi_person_kept'] == 0

    allow = client.post(url, json={**base, 'multi_person': 'allow'}).get_json()
    assert len(allow['image_ids']) == 10
    assert allow['multi_person_kept'] == 3
    assert allow['multi_person_excluded'] == allow['multi_person_capped'] == 0
    assert client.post(url, json={**base, 'multi_person': 'invalid'}).status_code == 400


def test_face_counts_require_current_bytes_and_distinct_cached_regions(client, app, tmp_path):
    from app.models import BankImage, IdentityEvidence, IdentitySubject
    from app.services import identity_learning
    from app.services import image_bank_service as banks

    bank_id, source = _mkbank(client, tmp_path, ['01.png', '02.png', '03.png'])
    with app.app_context():
        bank = banks.get_bank(_uid(), bank_id)
        rows = BankImage.query.filter_by(bank_id=bank_id).order_by(BankImage.relpath).all()
        banks._face_cache_path(bank_id).parent.mkdir(parents=True, exist_ok=True)
        _write_faces(banks, bank, rows[:1], [2])
        (source / '01.png').write_bytes(b'changed')
        for row, second in zip(rows[1:], [[0.6, 0.6, 0.2, 0.2], [0.15, 0.15, 0.2, 0.2]]):
            digest = hashlib.sha256((source / row.relpath).read_bytes()).hexdigest()
            for index, box in enumerate(([0.1, 0.1, 0.2, 0.2], second)):
                subject = IdentitySubject(
                    user_id=_uid(), source='bank', scope_id=bank_id,
                    scope_instance=bank.instance_id, image_id=row.id,
                    image_instance=row.instance_id, region_key=str(index), region=json.dumps(box))
                banks.db.session.add(subject)
                banks.db.session.flush()
                banks.db.session.add(IdentityEvidence(
                    subject_id=subject.id, model_key=identity_learning.FACE_MODEL,
                    content_hash=digest, vector=b'\0' * 2048, dimension=512))
        banks.db.session.commit()
        assert banks._selection_face_counts(bank, rows) == {rows[1].id: 2}


def test_face_count_survives_runtime_cache_and_sidecar(tmp_path):
    from app.services import bank_transfer_metadata as transfer

    source = tmp_path / 'image.png'
    source.write_bytes(b'fixture')
    cache = tmp_path / 'faces.npz'
    bundle = {'face': {'state': 'scorable', 'det': 0.9, 'bbox_frac': 0.2,
                       'yaw': None, 'embedding': [1.0] + [0.0] * 511, 'face_count': 2}}
    assert transfer.write_runtime_caches(None, cache, {str(source): bundle})['face'] == 1
    index = transfer.load_runtime_cache_index(face_path=cache)
    portable = transfer.cache_bundle_for_transfer(index, str(source), source.read_bytes())
    assert portable['face']['face_count'] == 2
    sidecars = tmp_path / 'sidecars'
    ref = transfer.write_cache_sidecar(sidecars, portable)
    assert transfer.read_cache_sidecar(sidecars, ref)['face']['face_count'] == 2


def test_automatic_vision_never_probes_remote_or_uses_cloud_models(monkeypatch):
    from app import capabilities
    from app.services import vision_llm

    config = {'ollama.url': 'http://127.0.0.1.example:11434', 'ollama.vision_model': 'fixture'}
    monkeypatch.setattr(vision_llm.cfg, 'get', config.get)
    monkeypatch.delenv('VISION_OLLAMA_MODEL', raising=False)
    calls = []
    def tags(url, *, local_weights_only):
        calls.append((url, local_weights_only))
        return ['fixture:latest']

    monkeypatch.setattr(capabilities, '_ollama_tags', tags)
    assert vision_llm.loopback_vision_target() is None
    config.update({'ollama.url': 'http://127.0.0.1:11434', 'ollama.vision_model': 'fixture:cloud'})
    assert vision_llm.loopback_vision_target() is None
    assert calls == []
    config['ollama.vision_model'] = 'fixture'
    assert vision_llm.loopback_vision_target() == {
        'ollama_url': 'http://127.0.0.1:11434', 'model': 'fixture'}
    assert calls == [('http://127.0.0.1:11434', True)]


def test_auto_curate_runs_to_review_and_preserves_bank_and_dataset(client, app, tmp_path, monkeypatch):
    from app.models import BankImage, FaceDataset
    from app.services import face_dataset_service, lora_training, vision_llm, watermark_detector
    from app.services import image_bank_service as banks

    bank_id, source = _mkbank(client, tmp_path, ['01.png', '02.png', '03.png'])
    (source / '03.png').write_bytes(b'unreadable fixture')
    _write_score_cache(app, bank_id, {'01.png': _emb(1, 0), '02.png': _emb(0, 1)})
    with app.app_context():
        rows = BankImage.query.filter_by(bank_id=bank_id).order_by(BankImage.relpath).all()
        ids = [row.id for row in rows]
        _write_faces(banks, banks.get_bank(_uid(), bank_id), rows[:2], [1, 2])
    original = [p.read_bytes() for p in sorted(source.iterdir())]
    calls = []
    target = {'ollama_url': 'http://127.0.0.1:11434', 'model': 'fixture'}

    def record(name):
        def factory(*_args, **kwargs):
            if name in ('framing', 'watermark'):
                assert kwargs['vision_target'] == target
            if name == 'watermark':
                assert kwargs['preserve_cleaned'] is True
            return lambda _job: calls.append(name)
        return factory

    def forbidden(*_args, **_kwargs):
        pytest.fail('Auto-Curate attempted a decision, deletion, promotion, caption or training')

    for name in ('apply_flags', 'resolve_dups_keep_best', 'set_status', 'start_promote',
                 '_caption_job', 'start_delete_rejected', 'delete_rejected'):
        monkeypatch.setattr(banks, name, forbidden)
    monkeypatch.setattr(face_dataset_service, 'caption_images', forbidden)
    monkeypatch.setattr(lora_training, 'launch_training', forbidden)
    monkeypatch.setattr(lora_training, 'enqueue_training', forbidden)
    for name in ('score', 'faces', 'framing', 'watermark'):
        monkeypatch.setattr(banks, f'_{name}_job', record(name))
    monkeypatch.setattr(banks, '_score_prereq', lambda: None)
    monkeypatch.setattr(banks, '_faces_prereq', lambda: None)
    monkeypatch.setattr(banks, '_gpu_busy_reason', lambda: None)
    monkeypatch.setattr(vision_llm, 'loopback_vision_target', lambda: target)
    monkeypatch.setattr(watermark_detector, 'resolve_backend', lambda: {'backend': 'vision'})
    monkeypatch.setattr(banks, 'rebuild_semantic_dup_groups',
                        lambda *args, **kwargs: calls.append('semantic_dedup') or 0)
    response = client.post(f'/api/bank/{bank_id}/auto-curate', json={'n': 8})
    assert response.status_code == 202
    payload = client.get(f'/api/bank/{bank_id}').get_json()
    report = payload['pipeline_report']
    assert payload['activity']['finished']
    assert report['kind'] == 'auto_curate'
    assert [entry['step'] for entry in report['steps']] == [
        'scan', 'score', 'faces', 'framing', 'semantic_dedup', 'watermark', 'balanced_pick']
    assert all(entry['status'] == 'done' for entry in report['steps']), report['steps']
    assert calls == ['score', 'faces', 'framing', 'semantic_dedup', 'watermark']
    assert report['review']['promote_ids'] == [ids[0]]
    assert ids[2] in report['review']['reject_ids']
    assert report['review']['unreadable'] == 1
    assert report['review']['multi_person_excluded'] == 1
    with app.app_context():
        rows = BankImage.query.filter_by(bank_id=bank_id).all()
        assert {row.status for row in rows} == {'pending'}
        assert all(row.caption is None for row in rows)
        assert FaceDataset.query.count() == 0
    assert [p.read_bytes() for p in sorted(source.iterdir())] == original


def test_auto_curate_skips_cached_passes_and_protects_cleaned_rows(client, app, tmp_path, monkeypatch):
    from app.models import BankImage
    from app.services import image_bank_service as banks

    bank_id, _ = _mkbank(client, tmp_path, ['01.png', '02.png'])
    _write_score_cache(app, bank_id, {'01.png': _emb(1, 0), '02.png': _emb(0, 1)})
    with app.app_context():
        rows = BankImage.query.filter_by(bank_id=bank_id).order_by(BankImage.id).all()
        for row in rows:
            row.quality_state = 'ok'
            row.origin = 'unknown'
            row.framing = 'body'
            row.face_state = 'scorable'
            row.aesthetic_score = 5
            row.watermark_state = 'none'
            row.watermark_fingerprint = row.analysis_fingerprint
        rows[-1].watermark_clean_method = 'crop'
        rows[-1].watermark_fingerprint = None
        banks.db.session.commit()
        _write_faces(banks, banks.get_bank(_uid(), bank_id), rows, [1, 1])
        banks.note_pass_run(bank_id, 'semantic_dedup', detail='Done', signature=(
            banks._semantic_partition_signature(bank_id, banks._semantic_dup_threshold('clip'))))

    def unexpected(*_args, **_kwargs):
        pytest.fail('A completed or protected pass ran')

    for stage in ('scan', 'score', 'faces', 'framing', 'watermark'):
        monkeypatch.setattr(banks, f'_{stage}_job', unexpected)
    monkeypatch.setattr(banks, 'rebuild_semantic_dup_groups', unexpected)
    assert client.post(f'/api/bank/{bank_id}/auto-curate', json={}).status_code == 202
    report = client.get(f'/api/bank/{bank_id}').get_json()['pipeline_report']
    assert [step['status'] for step in report['steps']] == ['skipped'] * 6 + ['done']
    assert report['review']['selected'] == 1


def test_auto_curate_stop_does_not_publish_review(client, tmp_path, monkeypatch):
    from app.services import bank_jobs, image_bank_service as banks

    bank_id, _ = _mkbank(client, tmp_path, ['01.png'])

    def stop(*_args, **_kwargs):
        return lambda _job: bank_jobs.cancel(bank_id)

    monkeypatch.setattr(banks, '_scan_job', stop)
    assert client.post(f'/api/bank/{bank_id}/auto-curate', json={}).status_code == 202
    report = client.get(f'/api/bank/{bank_id}').get_json()['pipeline_report']
    assert report['cancelled']
    assert 'review' not in report
    assert report['steps'][-1]['status'] == 'cancelled'
