"""The local-only video run graph and the previews behind its pills.

The graph reuses the image-lineage shape, but Divergence 4 keeps exactly one
local node and no rented-pod records. Samples are served by basename through
the local run's own listing, and a poster is cut once and cached.
"""
import json
import os

from app.services import video_lineage
from test_video_checkpoints import _deployed, _local_saves, _loras_root, _video_dataset


PAIR_100 = ['video_surf_000000100_high_noise.safetensors',
            'video_surf_000000100_low_noise.safetensors']
FINAL = ['video_surf.safetensors']


def _samples(folder, names):
    os.makedirs(folder, exist_ok=True)
    for name in names:
        with open(os.path.join(folder, name), 'wb') as fh:
            fh.write(b'\x00' * 32)


def test_the_tree_is_one_local_run_with_one_pill_per_step(
        app, client, tmp_path, monkeypatch):
    _loras_root(tmp_path, monkeypatch)
    with app.app_context():
        ds = _video_dataset(tmp_path)
        _local_saves(tmp_path, monkeypatch, PAIR_100 + FINAL)
        ds_id = ds.id

    response = client.get(f'/api/video-dataset/{ds_id}/train/lineage')
    assert response.status_code == 200
    tree = response.get_json()
    assert tree['root_id'] is None and tree['current_id'] is None
    assert tree['edges'] == [] and tree['single'] is True
    (node,) = tree['nodes']
    assert node['record_id'] == -ds_id and node['run_id'] is None
    assert node['source'] == 'local' and node['run_name'].endswith(f'_ds{ds_id}')
    assert node['train_type'] == 'video' and node['version'] is None
    pair = next(p for p in node['checkpoints'] if p['step'] == 100)
    assert [f['filename'] for f in pair['files']] == PAIR_100
    assert pair['download_urls'] == [
        f'/api/video-dataset/{ds_id}/train/checkpoint?filename={name}'
        for name in PAIR_100]
    assert pair['download_url'] == pair['download_urls'][0]
    assert pair['present'] is True and pair['testable'] is False
    final = next(p for p in node['checkpoints'] if p['final'])
    assert final['step'] is None
    assert client.get(f'/api/video-dataset/{ds_id}/train/samples?run_id=12').status_code == 404
    assert client.get('/api/video-dataset/999/train/lineage').status_code == 404


def test_the_tree_is_empty_when_the_local_run_has_no_saves(
        app, client, tmp_path, monkeypatch):
    _loras_root(tmp_path, monkeypatch)
    with app.app_context():
        ds = _video_dataset(tmp_path)
        from app.services import video_training_local as vtl
        monkeypatch.setattr(vtl, 'save_root', lambda _ds: tmp_path / 'missing')
        ds_id = ds.id
    tree = client.get(f'/api/video-dataset/{ds_id}/train/lineage').get_json()
    assert tree['nodes'] == [] and tree['edges'] == [] and tree['single'] is True


def test_the_local_final_takes_its_number_from_the_job_config(app, tmp_path, monkeypatch):
    from app.services import lora_training as lt
    from app.services import video_training_local as vtl
    jobs = tmp_path / 'jobs'
    jobs.mkdir()
    monkeypatch.setattr(lt, '_jobs_dir', lambda: jobs)
    with app.app_context():
        ds = _video_dataset(tmp_path)
        _local_saves(tmp_path, monkeypatch, FINAL)
        (jobs / (vtl.local_run_name(ds) + '.json')).write_text(json.dumps({
            'job': 'extension', 'config': {'name': 'x', 'process': [
                {'type': 'sd_trainer', 'train': {'steps': 1500}}]}}), encoding='utf-8')
        assert video_lineage.local_total_steps(ds) == 1500
        tree = video_lineage.tree('local', ds.id)
        (pill,) = tree['nodes'][0]['checkpoints']
        assert pill['step'] == 1500 and pill['final'] is True
        assert tree['nodes'][0]['steps'] == 1500


def test_samples_are_listed_by_step_and_served_by_name_only(
        app, client, tmp_path, monkeypatch):
    root = _loras_root(tmp_path, monkeypatch)
    with app.app_context():
        ds = _video_dataset(tmp_path)
        saves = _local_saves(tmp_path, monkeypatch, PAIR_100)
        _samples(saves / 'samples', [
            '1725000000__000000100_0.mp4',
            '1725000000__000000100_1.mp4',
            '1725000000__000000050_0.mp4',
            'notes.txt',
            'grid.png',
        ])
        _deployed(root, *PAIR_100)
        ds_id = ds.id

    payload = client.get(f'/api/video-dataset/{ds_id}/train/samples').get_json()
    assert payload['run_id'] is None
    assert [(s['step'], s['prompt_idx']) for s in payload['samples']] == [
        (100, 0), (100, 1), (50, 0)]
    assert all(s['kind'] == 'video' for s in payload['samples'])
    sample = payload['samples'][0]
    assert sample['url'] == (
        f'/api/video-dataset/{ds_id}/train/sample?filename=1725000000__000000100_0.mp4')
    tree = client.get(f'/api/video-dataset/{ds_id}/train/lineage').get_json()
    (pill,) = tree['nodes'][0]['checkpoints']
    assert pill['preview_count'] == 2 and pill['preview_status'] == 'ready'
    assert pill['preview_url'] == sample['poster_url']
    assert pill['sample_url'] == sample['url'] and pill['testable'] is True
    assert pill['deployed_filename'].replace('\\', '/') == 'h3/lds/' + PAIR_100[0]
    response = client.get(sample['url'])
    assert response.status_code == 200 and response.mimetype == 'video/mp4'
    assert response.data == b'\x00' * 32
    assert client.get(f'/api/video-dataset/{ds_id}/train/sample?filename=../samples/x.mp4').status_code == 404
    assert client.get(f'/api/video-dataset/{ds_id}/train/sample?filename=notes.txt').status_code == 404


def test_a_poster_is_cut_once_and_cached(app, client, tmp_path, monkeypatch):
    _loras_root(tmp_path, monkeypatch)
    from app.services import video_bank_service as vbs
    calls = []

    def cut(src, _ts, dst):
        calls.append(src)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        with open(dst, 'wb') as fh:
            fh.write(b'\xff\xd8JPEG')
        return True

    monkeypatch.setattr(vbs, '_write_thumbnail', cut)
    with app.app_context():
        ds = _video_dataset(tmp_path)
        saves = _local_saves(tmp_path, monkeypatch, PAIR_100)
        _samples(saves / 'samples', [
            '1725000000__000000100_0.mp4',
            '1725000000__000000100_1.png',
        ])
        ds_id = ds.id
    base = f'/api/video-dataset/{ds_id}/train/sample/poster?filename='
    response = client.get(base + '1725000000__000000100_0.mp4')
    assert response.status_code == 200 and response.mimetype == 'image/jpeg'
    assert response.data == b'\xff\xd8JPEG'
    assert client.get(base + '1725000000__000000100_0.mp4').status_code == 200
    assert len(calls) == 1
    response = client.get(base + '1725000000__000000100_1.png')
    assert response.status_code == 200 and response.mimetype == 'image/png'
    assert len(calls) == 1
    monkeypatch.setattr(vbs, '_write_thumbnail', lambda *_args: False)
    with app.app_context():
        _samples(saves / 'samples', ['1725000000__000000200_0.mp4'])
    assert client.get(base + '1725000000__000000200_0.mp4').status_code == 404


def _animated_webp(path, frames=6):
    from PIL import Image
    images = [Image.new('RGB', (64, 36), (i * 40 % 256, 30, 200 - i * 30 % 200))
              for i in range(frames)]
    images[0].save(path, format='WEBP', save_all=True,
                   append_images=images[1:], duration=60, loop=0)


def test_a_wan_sample_uses_a_still_poster(app, client, tmp_path, monkeypatch):
    _loras_root(tmp_path, monkeypatch)
    with app.app_context():
        ds = _video_dataset(tmp_path)
        saves = _local_saves(tmp_path, monkeypatch, PAIR_100)
        (saves / 'samples').mkdir()
        _animated_webp(saves / 'samples' / '1725000000__000000100_0.webp')
        ds_id = ds.id
    listing = client.get(f'/api/video-dataset/{ds_id}/train/samples').get_json()
    (sample,) = listing['samples']
    assert sample['kind'] == 'animation'
    response = client.get(sample['poster_url'])
    assert response.status_code == 200 and response.mimetype == 'image/jpeg'
    assert response.data[:2] == b'\xff\xd8'
    assert client.get(sample['url']).mimetype == 'image/webp'
    tree = client.get(f'/api/video-dataset/{ds_id}/train/lineage').get_json()
    assert tree['nodes'][0]['checkpoints'][0]['preview_url'] == sample['poster_url']


def test_ai_toolkits_thumbnail_wins_before_frame_cut(
        app, client, tmp_path, monkeypatch):
    _loras_root(tmp_path, monkeypatch)
    from app.services import video_bank_service as vbs
    fail = lambda *_args: (_ for _ in ()).throw(AssertionError('cut called'))
    monkeypatch.setattr(vbs, '_write_thumbnail', fail)
    monkeypatch.setattr(video_lineage, '_first_frame_still', fail)
    with app.app_context():
        ds = _video_dataset(tmp_path)
        saves = _local_saves(tmp_path, monkeypatch, PAIR_100)
        _samples(saves / 'samples', ['1725000000__000000100_0.mp4'])
        (saves / 'samples' / '.thumbs').mkdir()
        (saves / 'samples' / '.thumbs' / '1725000000__000000100_0.mp4.jpg').write_bytes(
            b'\xff\xd8OWN')
        ds_id = ds.id
    response = client.get(
        f'/api/video-dataset/{ds_id}/train/sample/poster?filename=1725000000__000000100_0.mp4')
    assert response.status_code == 200 and response.data == b'\xff\xd8OWN'
