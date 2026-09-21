"""Checkpoint management: app-wide trash (nothing destroyed directly),
selective delete, run cleanup, cloud staging purge, source-side save cap."""

from public_dense_test_io import no_dense_provider_io  # noqa: F401
import os

import pytest

from app.config import LOCAL_USER

pytestmark = pytest.mark.plugins()


@pytest.fixture()
def ds(app, client):
    return client.post('/api/dataset/create',
                       json={'name': 'Mgmt', 'trigger_word': 'mgmt'}).get_json()['id']


def test_trash_roundtrip(app, tmp_path):
    from app.services import trash
    with app.app_context():
        f = tmp_path / 'x.safetensors'
        f.write_bytes(b'12345')
        moved = trash.send_to_trash(str(f), context='test ctx/©')
        assert not f.exists() and os.path.isfile(moved)
        assert trash.trash_size() >= 5
        res = trash.empty_trash()
        assert res['removed'] >= 1 and res['freed_bytes'] >= 5
        assert trash.trash_size() == 0


def test_delete_checkpoint_goes_to_trash_and_is_whitelisted(app, ds, tmp_path, monkeypatch):
    from app.services import lora_training as lt
    from app.services import trash
    with app.app_context():
        run_dir = tmp_path / 'lora_mgmt'
        run_dir.mkdir()
        ck = run_dir / 'lora_mgmt_000001000.safetensors'
        ck.write_bytes(b'W')
        monkeypatch.setattr(lt, '_run_dir', lambda *a, **k: str(run_dir))
        with pytest.raises(ValueError, match='unknown'):
            lt.delete_checkpoint(LOCAL_USER, ds, '../../evil.safetensors')
        assert lt.delete_checkpoint(LOCAL_USER, ds, ck.name) == ck.name
        assert not ck.exists()                       # moved, not destroyed
        assert trash.trash_size() >= 1


def test_delete_checkpoint_refused_while_training(app, ds, tmp_path, monkeypatch):
    from app.services import lora_training as lt
    with app.app_context():
        monkeypatch.setattr(lt, '_local_training_active_for', lambda d: True)
        with pytest.raises(ValueError, match='training right now'):
            lt.delete_checkpoint(LOCAL_USER, ds, 'x.safetensors')


def test_cleanup_keeps_only_the_keep_set(app, ds, tmp_path, monkeypatch):
    from app.services import lora_training as lt
    with app.app_context():
        run_dir = tmp_path / 'lora_mgmt'
        run_dir.mkdir()
        names = [f'lora_mgmt_{i:09d}.safetensors' for i in (1000, 2000, 3000)]
        for n in names:
            (run_dir / n).write_bytes(b'W')
        (run_dir / 'lora_mgmt.safetensors').write_bytes(b'F')   # final
        monkeypatch.setattr(lt, '_run_dir', lambda *a, **k: str(run_dir))
        res = lt.cleanup_checkpoints(LOCAL_USER, ds,
                                     keep=['lora_mgmt.safetensors', names[2]])
        assert res['removed'] == 2
        left = sorted(os.listdir(run_dir))
        assert left == sorted(['lora_mgmt.safetensors', names[2]])






def test_max_step_saves_setting_reaches_job_config(app, ds):
    from app.services import lora_training as lt
    from app.services import face_dataset_service as fds
    with app.app_context():
        dso = fds.get_dataset(LOCAL_USER, ds)
        cfg_job = lt.build_job_config(dso, '/tmp/x', steps=1000,
                                      training_folder='/pod/out')
        save = cfg_job['config']['process'][0]['save']
        assert save['max_step_saves_to_keep'] == 4            # new default
        lt.update_train_settings(LOCAL_USER, ds, {'max_step_saves': 2})
        dso = fds.get_dataset(LOCAL_USER, ds)
        cfg_job = lt.build_job_config(dso, '/tmp/x', steps=1000,
                                      training_folder='/pod/out')
        assert cfg_job['config']['process'][0]['save']['max_step_saves_to_keep'] == 2
        with pytest.raises(ValueError):
            lt.update_train_settings(LOCAL_USER, ds, {'max_step_saves': 99})


def test_trash_open_route(client, monkeypatch):
    from app.services import trash
    opened = []
    monkeypatch.setattr(trash, 'open_trash_folder',
                        lambda: opened.append(True) or 'trash')
    res = client.post('/api/trash/open')
    assert res.status_code == 200
    assert res.get_json()['ok'] is True
    assert opened == [True]


def test_trash_routes(app, client, tmp_path):
    from app.services import trash
    with app.app_context():
        f = tmp_path / 'y.bin'
        f.write_bytes(b'123')
        trash.send_to_trash(str(f), context='route-test')
    assert client.get('/api/trash').get_json()['size_bytes'] >= 3
    res = client.post('/api/trash/empty').get_json()
    assert res['ok'] is True and res['freed_bytes'] >= 3
    assert client.get('/api/trash').get_json()['size_bytes'] == 0
