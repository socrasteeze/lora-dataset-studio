import io
import json
from pathlib import Path

import pytest
from PIL import Image

from app import config
from app.extensions import db
from app.models import BankImage, ImageBank
from app.services import image_bank_service as banks, watermark_klein as klein
from test_bank_watermark_clean import OFFCENTER_MARK, _flag, _mkbank


def _node(class_type, **inputs):
    return {'class_type': class_type, 'inputs': inputs}


@pytest.fixture
def workflow():
    return {
        '32': _node('LoadImage', image='placeholder.png'),
        '48': _node('UNETLoader', unet_name='custom-unet.safetensors', weight_dtype='default'),
        '52': _node('VAELoader', vae_name='custom-vae.safetensors'),
        '64': _node('CLIPLoader', clip_name='custom-clip.safetensors'),
        '76': _node('CLIPTextEncode', clip=['64', 0], text='Workflow prompt'),
        '89': _node('Edit', image=['32', 0], model=['48', 0], vae=['52', 0],
                    conditioning=['76', 0]),
        '121': _node('SaveImage', images=['89', 0]),
    }


def _configure(workflow, tmp_path):
    path = tmp_path / 'clean.api.json'
    path.write_text(json.dumps(workflow), encoding='utf-8')
    config.save_config({'watermark_clean': {'custom_workflow': str(path)}})
    return path


@pytest.fixture
def mock_comfy(tmp_path, monkeypatch):
    staged = tmp_path / 'comfy-input'
    staged.mkdir()
    monkeypatch.setattr(klein, '_comfy_input_dir', lambda: str(staged))
    monkeypatch.setattr(klein, '_comfy_output_dir', lambda: None)
    monkeypatch.setattr(klein, '_wait_for_job', lambda *_: ('completed', 'result.png', None))
    monkeypatch.setattr('app.capabilities.probe_comfyui', lambda: {'ok': True})

    def unexpected(*args):
        pytest.fail('Custom clean used the shipped model resolver or prefiller')

    monkeypatch.setattr(klein, '_prefill_region', unexpected)
    monkeypatch.setattr(klein.keh, 'unet_for_job', unexpected)
    monkeypatch.setattr(klein.keh, 'resolve_klein_vae', unexpected)
    monkeypatch.setattr(klein.keh, 'resolve_klein_text_encoder', unexpected)
    monkeypatch.setattr(klein.keh, 'klein_missing_assets', unexpected)
    rendered = io.BytesIO()
    Image.new('RGB', (24, 18), (12, 12, 12)).save(rendered, format='PNG')
    monkeypatch.setattr(klein, '_read_comfy_output', lambda _: rendered.getvalue())
    jobs = []

    def queue(**job):
        graph = job['workflow_data']
        name = graph['32']['inputs']['image']
        paths = job['metadata'].get('staged_input_paths')
        path = Path(paths[name]) if paths else staged / name
        with Image.open(path) as image:
            job['uploaded_size'] = image.size
        jobs.append(job)
        return job['job_id']

    monkeypatch.setattr(klein.queue_manager, 'add_job', queue)
    return jobs


@pytest.mark.parametrize('output,device,override,has_prompt', [
    ('SaveImage', None, None, True),
    ('PreviewImage', 'api:abc123def456', 'Explicit prompt', True),
    ('SaveImage', 'sample-peer', 'Explicit prompt', False),
])
def test_custom_workflow_patches_detected_ports(app, tmp_path, workflow, mock_comfy,
                                               output, device, override, has_prompt):
    workflow['121']['class_type'] = output
    if not has_prompt:
        del workflow['76']
        del workflow['89']['inputs']['conditioning']
        workflow['89']['inputs']['encoder'] = ['64', 0]
    path = _configure(workflow, tmp_path)
    source = tmp_path / 'sample.png'
    Image.new('RGB', (31, 27), 'white').save(source)
    with app.app_context():
        ok, error = klein.inpaint_watermark_klein(
            'local', source, [OFFCENTER_MARK], device_id=device, klein_model='ignored',
            klein_prompt=override)
    assert ok, error
    job, = mock_comfy
    graph = job['workflow_data']
    assert job['uploaded_size'] == (31, 27)
    assert job.get('worker_id') == device
    assert bool(job['metadata'].get('staged_input_paths')) == bool(device)
    assert graph['32']['inputs']['image'].startswith('wmklein_crop_')
    assert graph['121']['class_type'] == 'SaveImage'
    assert graph['121']['inputs']['images'] == ['89', 0]
    assert graph['121']['inputs']['filename_prefix'].startswith('wmklein_')
    for key in ('48', '52', '64'):
        assert graph[key] == workflow[key]
    if has_prompt:
        assert graph['76']['inputs']['text'] == (override or 'Workflow prompt')
    assert json.loads(path.read_text(encoding='utf-8')) == workflow


@pytest.mark.parametrize('remove,add,message', [
    ('32', None, 'exactly one LoadImage'),
    (None, 'LoadImage', 'exactly one LoadImage'),
    ('121', None, 'exactly one SaveImage or PreviewImage'),
    (None, 'PreviewImage', 'exactly one SaveImage or PreviewImage'),
])
def test_custom_workflow_rejects_invalid_port_counts(app, tmp_path, workflow, remove, add, message):
    if remove:
        del workflow[remove]
    if add:
        workflow['221'] = _node(add)
    path = _configure(workflow, tmp_path)
    with pytest.raises(ValueError, match=message):
        klein.load_custom_clean_workflow(path)


@pytest.mark.parametrize('device', ['local', 'api:abc123def456'])
@pytest.mark.parametrize('selected', [False, True])
def test_custom_bank_clean_replaces_and_restores_source(client, app, tmp_path, workflow,
                                                       mock_comfy, device, selected):
    _configure(workflow, tmp_path)
    bank_id, folder = _mkbank(client, tmp_path, {'sample.jpg': Image.new('RGB', (32, 24), 'white')})
    image_id = _flag(app, bank_id, OFFCENTER_MARK)
    source = folder / 'sample.jpg'
    original = source.read_bytes()
    backup = source.with_name('sample.orig.jpg')
    with app.app_context():
        row = db.session.get(BankImage, image_id)
        row.caption = 'Sample caption'
        if selected:
            row.watermark_state = row.watermark_bbox = row.watermark_fingerprint = None
        db.session.commit()

    body = {'method': 'klein', 'device_id': device}
    if selected:
        body.update(clean_selected=True, image_ids=[image_id])
    response = client.post(f'/api/bank/{bank_id}/watermark/inpaint', json=body)
    assert response.status_code == 202, response.get_json()
    assert len(mock_comfy) == 1
    with Image.open(source) as result:
        assert result.size == (32, 24)
        assert result.getpixel((0, 0)) == (12, 12, 12)
    assert backup.read_bytes() == original
    with app.app_context():
        row = db.session.get(BankImage, image_id)
        assert (row.bank_id, row.relpath, row.caption) == (bank_id, 'sample.jpg', 'Sample caption')
        assert row.watermark_state == 'cleaned'
        bank = db.session.get(ImageBank, bank_id)
        assert Path(banks.analysis_image_path(bank, row)) == source
        assert banks._watermark_scan_query(bank_id, rescan=True).count() == 0
        assert not banks.clean_image_path(bank_id, image_id).exists()
        assert list(banks._walk_image_relpaths(str(folder))) == ['sample.jpg']

    response = client.get(f'/api/bank/{bank_id}/file/{image_id}?original=1')
    assert response.data == original
    response.close()

    response = client.post(f'/api/bank/{bank_id}/watermark/undo', json={})
    assert response.get_json() == {'ok': True, 'restored': 1}
    assert source.read_bytes() == original
    assert not backup.exists()
    with app.app_context():
        assert db.session.get(BankImage, image_id).watermark_state == (None if selected else 'detected')
