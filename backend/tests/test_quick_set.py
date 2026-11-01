"""Quick set: graph, frame picker, cull, tags, defaults, and route checks.

No ComfyUI and no GPU. The orbit builder only loads the embedded H3 template.
"""
import io

import pytest
from PIL import Image

from app.config import LOCAL_USER
from app.services import face_dataset_service as fds
from app.services import quick_set as qs


SIGMAS = ('1.0, 0.978453, 0.95418, 0.926626, 0.89508, '
          '0.845148, 0.704534, 0.414568, 0.0')


def _png():
    buf = io.BytesIO()
    Image.new('RGB', (8, 8), (20, 40, 60)).save(buf, 'PNG')
    buf.seek(0)
    return buf


def _post(client, **fields):
    data = {'images': (_png(), 'ref.png')}
    data.update(fields)
    return client.post('/api/quick-set', data=data, content_type='multipart/form-data')


def test_config_defaults():
    block = qs.defaults()
    assert block['engine'] == 'qwen21'
    assert block['turbo'] is True
    assert block['target_count'] == 30
    assert block['sample_frames'] == 45
    assert block['unet'] == 'qwen21/qwen_image_2.1_int8_convrot.safetensors'
    assert block['text_encoder'] == ''
    assert block['vae'] == 'texture_fix_vae_for_qwen_image_2.1_bf16.safetensors'
    assert block['detail_lora'] == 'qwen2.1-detail-fix-2.0.safetensors'
    assert block['detail_strength'] == 1.0
    assert block['turbo_lora'] == 'qwen_image_2.1_turbo_lora_avg_rank_178_bf16.safetensors'
    assert block['turbo_strength'] == 1.0
    assert block['turbo_sigmas'] == SIGMAS
    assert block['turbo_cfg'] == 1.0
    assert block['steps'] == 25
    assert block['cfg'] == 4.0
    assert block['sampler'] == 'euler'
    assert block['scheduler'] == 'simple'


def _graph(**kwargs):
    base = dict(
        unet='qwen21/qwen_image_2.1_int8_convrot.safetensors',
        clip='qwen3vl_8b.safetensors',
        vae='texture_fix_vae_for_qwen_image_2.1_bf16.safetensors',
        detail_lora='qwen2.1-detail-fix-2.0.safetensors',
        turbo_lora='qwen_image_2.1_turbo_lora_avg_rank_178_bf16.safetensors',
        width=1024, height=1536, seed=7, sigmas=SIGMAS,
    )
    base.update(kwargs)
    return qs.build_qwen21_workflow('frame.png', 'ref.png', qs.QWEN_POSITIVE, **base)


def test_qwen21_turbo_on_graph():
    graph = _graph(turbo=True)
    assert graph['1']['inputs']['unet_name'].endswith('qwen_image_2.1_int8_convrot.safetensors')
    assert graph['3']['inputs']['vae_name'] == 'texture_fix_vae_for_qwen_image_2.1_bf16.safetensors'
    assert graph['4']['inputs']['lora_name'] == 'qwen2.1-detail-fix-2.0.safetensors'
    assert graph['4']['inputs']['strength_model'] == 1.0
    assert graph['5']['class_type'] == 'LoraLoaderModelOnly'
    assert graph['5']['inputs']['lora_name'] == 'qwen_image_2.1_turbo_lora_avg_rank_178_bf16.safetensors'
    assert graph['5']['inputs']['strength_model'] == 1.0
    assert graph['10']['inputs']['image1'] == ['8', 0]
    assert graph['10']['inputs']['image2'] == ['7', 0]
    assert 'same framing' in graph['10']['inputs']['prompt']
    assert 'natural skin texture' in graph['10']['inputs']['prompt']
    assert graph['15']['inputs']['sampler_name'] == 'euler'
    assert graph['16']['class_type'] == 'ManualSigmas'
    assert graph['16']['inputs']['sigmas'] == SIGMAS
    assert graph['17']['inputs']['cfg'] == 1.0
    assert graph['18']['class_type'] == 'SamplerCustomAdvanced'
    assert graph['8']['inputs']['width'] == 1024
    assert graph['8']['inputs']['height'] == 1536
    assert '14' not in graph or graph.get('14', {}).get('class_type') != 'KSampler'


def test_qwen21_turbo_off_graph():
    graph = _graph(turbo=False)
    assert '5' not in graph
    assert all(node['class_type'] != 'ManualSigmas' for node in graph.values())
    assert all('turbo_lora' not in str(node.get('inputs', {}).get('lora_name', ''))
               for node in graph.values())
    sampler = graph['14']
    assert sampler['class_type'] == 'KSampler'
    assert sampler['inputs']['steps'] == 25
    assert sampler['inputs']['cfg'] == 4.0
    assert sampler['inputs']['scheduler'] == 'simple'
    assert sampler['inputs']['sampler_name'] == 'euler'
    assert sampler['inputs']['model'] == ['4', 0]


def test_output_size_portrait_and_cap():
    assert qs.output_size(512, 768) == (1024, 1536)
    width, height = qs.output_size(4000, 500)
    assert width * height <= 2_000_000
    assert width > height


def test_frame_picker_blur_and_duplicates():
    flat = Image.new('L', (64, 64), 40)
    sharp = Image.new('L', (64, 64), 0)
    for x in range(0, 64, 2):
        for y in range(64):
            sharp.putpixel((x, y), 255)
    assert qs.blur_score(flat) < qs.blur_score(sharp)
    assert qs.hamming(qs.dhash(sharp), qs.dhash(sharp.copy())) == 0
    frames = [
        {'index': 0, 'blur': 30, 'phash': 1},
        {'index': 1, 'blur': 1, 'phash': 2},
        {'index': 2, 'blur': 30, 'phash': 1},
    ]
    assert [row['index'] for row in qs.pick_frames(frames, sample=3, blur_min=8, hash_distance=0)] == [0]
    spread = qs.even_indices(90, 45)
    assert spread[0] == 0 and spread[-1] == 89 and len(spread) == 45


def test_angle_and_caption_tags():
    assert qs.angle_tag(0, 8) == 'front view'
    assert qs.angle_tag(1, 8) == 'three-quarter right view'
    assert qs.angle_tag(2, 8) == 'side right view'
    assert qs.angle_tag(4, 8) == 'back view'
    assert qs.angle_tag(6, 8) == 'side left view'
    assert qs.angle_tag(7, 8) == 'three-quarter left view'
    assert qs.framing_phrase('full') == 'full body'
    assert qs.framing_phrase('close') == 'close-up'
    text = qs.merge_caption('a person standing', 'front view', 'full')
    assert text == 'a person standing, front view, full body'
    assert 'tok' not in text
    assert qs.merge_caption('', 'back view', 'medium') == 'back view, medium shot'


def test_crop_box_uses_the_face_when_present():
    full = qs.crop_box(100, 200, 'full')
    assert full == (0, 0, 100, 200)
    left, top, right, bottom = qs.crop_box(100, 200, 'close', face=(40, 20, 10, 12))
    assert 0 <= left < right <= 100
    assert 0 <= top < bottom <= 200
    assert left < 40 and right > 50


def test_cull_keeps_highest_scores_and_drops_no_face():
    rows = [
        {'id': 'low', 'sim': 0.2, 'state': 'scorable'},
        {'id': 'high', 'sim': 0.9, 'state': 'scorable'},
        {'id': 'face', 'sim': 0.99, 'state': 'no_face'},
        {'id': 'blank', 'state': 'scorable'},
    ]
    assert [row['id'] for row in qs.cull_scored(rows, 1)] == ['high']
    assert [row['id'] for row in qs.cull_scored(rows, 30)] == ['high', 'low']


def test_orbit_graph_uses_the_h3_reference_node():
    name = 'lds_vref_' + ('ab' * 16) + '.png'
    built = qs.orbit_workflow(name, seed=3, frames=124, megapixels=1.0, accel='')
    node = built['workflow']['104']
    assert node['class_type'] == 'MiniMaxH3ReferenceToVideo'
    assert '360' in node['inputs']['prompt']
    assert node['inputs']['ref_images.ref_image_0'][1] == 0


def test_routes_require_one_or_two_images_and_a_trigger(client, monkeypatch):
    def _validate(user_id, fields, paths):
        qs.validate_fields(user_id, fields, len(paths))
        pytest.fail('validation should have refused this request')

    monkeypatch.setattr(qs, 'start', _validate)
    missing = client.post('/api/quick-set', data={'name': 'alpha', 'trigger': 'tok'})
    assert missing.status_code == 400
    assert '1 or 2' in missing.get_json()['error']
    too_many = client.post(
        '/api/quick-set',
        data={'name': 'alpha', 'trigger': 'tok',
              'images': [(_png(), 'a.png'), (_png(), 'b.png'), (_png(), 'c.png')]},
        content_type='multipart/form-data')
    assert too_many.status_code == 400
    assert '1 or 2' in too_many.get_json()['error']
    no_trigger = _post(client, name='alpha', trigger='  ')
    assert no_trigger.status_code == 400
    assert 'trigger' in no_trigger.get_json()['error'].lower()


def test_route_never_overwrites_an_existing_dataset(app, client):
    with app.app_context():
        fds.create_dataset(LOCAL_USER, 'alpha', 'tok')
    response = _post(client, name='alpha', trigger='tok')
    assert response.status_code == 409
    with app.app_context():
        rows = fds.FaceDataset.query.filter_by(user_id=LOCAL_USER, name='alpha').all()
        assert len(rows) == 1


def test_route_starts_a_new_job_without_calling_comfy(client, monkeypatch):
    seen = {}

    def fake_start(user_id, fields, paths):
        seen['user'] = user_id
        seen['fields'] = qs.validate_fields(user_id, fields, len(paths))
        seen['count'] = len(paths)
        return {'id': 'a' * 32, 'status': 'running', 'stage': 'orbit', 'message': 'Rendering the orbit.',
                'done': 0, 'total': 0, 'thumbnails': [], 'dataset_id': None, 'error': None}

    monkeypatch.setattr(qs, 'start', fake_start)
    response = _post(client, name='beta', trigger='tok', engine='qwen21')
    assert response.status_code == 202
    assert seen['fields']['engine'] == 'qwen21'
    assert seen['fields']['turbo'] is True
    assert seen['fields']['target_count'] == 30
    assert seen['count'] == 1
    body = response.get_json()
    assert body['stage'] == 'orbit'


def test_resolve_prefers_the_canonical_file_then_a_narrow_token(monkeypatch, tmp_path):
    from app.services import comfy_model_paths
    root = tmp_path / 'models'
    unet = root / 'diffusion_models' / 'qwen21'
    unet.mkdir(parents=True)
    (unet / 'qwen_image_2.1_int8_convrot.safetensors').write_bytes(b'unet')
    (root / 'diffusion_models' / 'other.safetensors').write_bytes(b'nope')
    monkeypatch.setattr(comfy_model_paths, 'search_roots',
                        lambda folder: [str(root / folder)])
    monkeypatch.setattr(qs, 'block', lambda: {
        **qs.defaults(),
        'text_encoder': '',
    })
    # Only the UNet is on disk. The other slots must fail closed, not guess.
    with pytest.raises(qs.QuickSetError):
        qs.resolve_qwen21()
    for folder, name in (
            ('text_encoders', 'qwen3vl_8b_fp8.safetensors'),
            ('vae', 'texture_fix_vae_for_qwen_image_2.1_bf16.safetensors'),
            ('loras', 'qwen2.1-detail-fix-2.0.safetensors'),
            ('loras', 'qwen_image_2.1_turbo_lora_avg_rank_178_bf16.safetensors')):
        path = root / folder
        path.mkdir(parents=True, exist_ok=True)
        (path / name).write_bytes(b'x')
    names = qs.resolve_qwen21()
    assert names['unet'].replace('\\', '/').endswith('qwen21/qwen_image_2.1_int8_convrot.safetensors')
    assert 'qwen3vl_8b' in names['clip']
    assert names['vae'].endswith('texture_fix_vae_for_qwen_image_2.1_bf16.safetensors')
    assert 'qwen2.1-detail-fix-2.0' in names['detail_lora']
    assert 'turbo_lora_avg_rank_178' in names['turbo_lora']


def test_a_changed_pin_that_is_missing_does_not_scan(monkeypatch, tmp_path):
    from app.services import comfy_model_paths
    root = tmp_path / 'models' / 'vae'
    root.mkdir(parents=True)
    (root / 'texture_fix_vae_for_qwen_image_2.1_bf16.safetensors').write_bytes(b'vae')
    monkeypatch.setattr(comfy_model_paths, 'search_roots', lambda folder: [str(tmp_path / 'models' / folder)])
    with pytest.raises(qs.QuickSetError, match='not on disk'):
        qs._resolve_slot('vae', 'missing-vae.safetensors',
                         qs.defaults()['vae'], qs._VAE_TOKENS, 'quick_set.vae')
