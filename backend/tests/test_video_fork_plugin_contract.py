"""Exercise local-only video behavior through its actual V2 plugin owner."""
from types import SimpleNamespace

import pytest


pytestmark = pytest.mark.plugins('video')


def test_video_plugin_has_local_training_routes_and_no_rental_routes(app):
    routes = {rule.rule for rule in app.url_map.iter_rules()}
    assert '/api/video-dataset/<int:dataset_id>/train' in routes
    assert '/api/video-dataset/<int:dataset_id>/train/checkpoints' in routes
    assert '/api/video-dataset/<int:dataset_id>/train/lineage' in routes
    assert not any('/video-dataset/' in route and '/train/cloud' in route for route in routes)
    manifest = app.extensions['lds_plugins'].records['video'].manifest
    assert 'secrets:VAST_API_KEY' not in manifest.permissions
    response = app.test_client().get('/api/plugins/')
    assert response.status_code == 200
    plugins = response.get_json()['plugins']
    assert any(plugin['id'] == 'video' and plugin['state'] == 'loaded' for plugin in plugins)


def test_local_checkpoint_grouping_needs_no_rental_product(app):
    from lds_video import video_checkpoints as checkpoints
    saves = {'video_set_000000100_high_noise.safetensors': '/fixture/high',
             'video_set_000000100_low_noise.safetensors': '/fixture/low',
             'video_set.safetensors': '/fixture/final'}
    grouped = checkpoints._group_saves_by_step(saves)
    assert [(row['step'], row['final'], len(row['files'])) for row in grouped] == [
        (100, False, 2), (None, True, 1)]
    assert checkpoints.cloud_groups(SimpleNamespace(id=1)) == []
    with pytest.raises(LookupError, match='unknown checkpoint step'):
        checkpoints._step_files(SimpleNamespace(id=1), 10, 100, False)


def test_video_lineage_refuses_numbered_rental_runs(app):
    from lds_video import video_lineage
    dataset = SimpleNamespace(id=1)
    assert video_lineage.resolve_run(dataset, 'local') is None
    assert video_lineage.samples_dir(dataset, SimpleNamespace(staging_dir='/fixture')) is None
    with pytest.raises(LookupError, match='video training run not found'):
        video_lineage.resolve_run(dataset, '10')


def test_video_preflight_refuses_rental_lane(app, client, tmp_path):
    from app.extensions import db
    from lds_video.models import VideoDataset
    with app.app_context():
        dataset = VideoDataset(user_id='local', name='Fixture', target_profile='wan22_14b',
                               output_dir=str(tmp_path), fps=16, frames=81, width=384, height=384)
        db.session.add(dataset)
        db.session.commit()
        dataset_id = dataset.id
    response = client.get(f'/api/video-dataset/{dataset_id}/train/preflight?lane=cloud')
    assert response.status_code == 400
    assert 'Only local video training' in response.get_json()['error']


def test_readding_video_folder_reuses_its_bank_and_decisions(app, tmp_path):
    from lds_video import video_bank_service
    from lds_video.models import VideoBank
    folder = tmp_path / 'rushes'
    folder.mkdir()
    (folder / 'clip.mp4').write_bytes(b'fixture')
    with app.app_context():
        bank, added = video_bank_service.create_bank('local', 'First', str(folder))
        bank_id = bank.id
        assert added == 1
        again, added = video_bank_service.create_bank('local', 'Second', str(folder / '.'))
        assert again.id == bank_id and again.name == 'First'
        assert added == 0
        assert VideoBank.query.count() == 1
