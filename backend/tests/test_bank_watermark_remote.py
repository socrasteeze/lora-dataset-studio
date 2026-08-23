"""Level-3 Klein watermark inpaint can render on a remote device.

The bank's only ComfyUI round-trip. The contract mirrors dataset generate:
local device → every local preflight applies, byte-identical behaviour;
remote device (peer / api: backend) → the LOCAL probes are skipped (they
answer the wrong machine's question), the crop travels via
staged_input_paths instead of the local Comfy input folder, and the job row
carries the worker_id the cluster plumbing routes on.
"""
from __future__ import annotations

from PIL import Image


def _mock_resolvers(monkeypatch, wk):
    monkeypatch.setattr(wk.keh, 'unet_for_job', lambda *a, **k: 'unet.safetensors')
    monkeypatch.setattr(wk.keh, 'resolve_klein_vae', lambda *a, **k: 'vae.safetensors')
    monkeypatch.setattr(wk.keh, 'resolve_klein_text_encoder', lambda *a, **k: 'te.safetensors')
    monkeypatch.setattr(wk.keh, '_unet_weight_dtype', lambda *a, **k: 'default')


def test_the_route_threads_device_id_through(app, client, monkeypatch):
    from app.services import image_bank_service as banks
    seen = {}

    def fake_start(app_, user_id, bank_id, method='auto', device_id=None, **_kw):
        seen.update(method=method, device_id=device_id)
        return {'ok': True}
    monkeypatch.setattr(banks, 'start_watermark_inpaint', fake_start)
    r = client.post('/api/bank/1/watermark/inpaint',
                    json={'method': 'klein', 'device_id': 'api:abc123def456'})
    assert r.status_code == 202, r.get_data(as_text=True)
    assert seen == {'method': 'klein', 'device_id': 'api:abc123def456'}


def test_prereq_skips_the_local_klein_probe_for_a_remote_device(app, monkeypatch):
    """A hub without local Klein weights can still aim the pass at a machine
    that has them — the probe here answers the wrong machine's question."""
    from app.services import image_bank_service as banks
    from app.services import watermark_klein as wk
    monkeypatch.setattr(wk, 'is_available', lambda: False)
    with app.app_context():
        assert banks._watermark_inpaint_prereq('klein') is not None, \
            'local device: the local probe still gates'
        assert banks._watermark_inpaint_prereq('klein', 'api:abc123def456') is None
        assert banks._watermark_inpaint_prereq('klein', 'local') is not None


def test_prereq_for_lama_ignores_the_device_entirely(app, monkeypatch):
    """LaMa never travels; a picked device must not loosen ITS gate."""
    from app.services import image_bank_service as banks
    from app.services import watermark_lama as wl
    monkeypatch.setattr(wl, 'is_available', lambda: False)
    with app.app_context():
        assert banks._watermark_inpaint_prereq('auto', 'api:abc123def456') is not None


def test_inpaint_guard_skips_local_availability_when_remote(app, monkeypatch):
    from app.services import watermark_klein as wk
    monkeypatch.setattr(wk, 'is_available', lambda: False)
    with app.app_context():
        ok, err = wk.inpaint_watermark_klein('local', 'no-such-file.png',
                                             [[0.1, 0.1, 0.2, 0.2]])
        assert not ok and err['kind'] == 'unavailable', 'local: guard holds'
        ok, err = wk.inpaint_watermark_klein('local', 'no-such-file.png',
                                             [[0.1, 0.1, 0.2, 0.2]],
                                             device_id='api:abc123def456')
        assert not ok
        assert err['kind'] == 'failed' and 'unreadable image' in err['detail'], \
            'remote: past the guard, failing on the actual next step'


def test_remote_klein_job_stages_by_path_not_by_local_folder(app, tmp_path,
                                                             monkeypatch):
    """No local input-folder write for a remote render — the crop rides
    staged_input_paths for the peer publisher / BackendWorker upload."""
    import os
    from app.services import watermark_klein as wk
    _mock_resolvers(monkeypatch, wk)
    # A LOCAL run would die on this folder; a remote one must never look at it.
    monkeypatch.setattr(wk, '_comfy_input_dir', lambda: str(tmp_path / 'absent'))
    monkeypatch.setattr(wk.keh, 'klein_missing_assets',
                        lambda *a, **k: ['unet'])   # would raise if consulted

    captured = {}

    def fake_add_job(**kwargs):
        captured.update(kwargs)
        src = kwargs['metadata']['staged_input_paths'][
            kwargs['metadata']['staged_inputs'][0]]
        captured['src_existed_at_enqueue'] = os.path.isfile(src)
        return kwargs['job_id']
    monkeypatch.setattr(wk.queue_manager, 'add_job',
                        lambda **kw: fake_add_job(**kw))
    monkeypatch.setattr(wk, '_wait_for_job',
                        lambda job_id, timeout: ('failed', None, 'stub'))

    with app.app_context():
        img, err = wk._run_klein_job('local', Image.new('RGB', (8, 8)), seed=1,
                                     device_id='api:abc123def456')
    assert img is None and err['kind'] == 'failed'          # the stubbed wait
    assert captured['worker_id'] == 'api:abc123def456'
    names = captured['metadata']['staged_inputs']
    assert len(names) == 1 and names[0].startswith('wmklein_crop_')
    assert captured['src_existed_at_enqueue'] is True
    # And the finally-cleanup dropped the temp once the job ended.
    src = captured['metadata']['staged_input_paths'][names[0]]
    assert not os.path.exists(src)


def test_local_klein_job_is_byte_identical_to_before(app, tmp_path, monkeypatch):
    """No worker routing, no path metadata — the local lane must not change."""
    from app.services import watermark_klein as wk
    _mock_resolvers(monkeypatch, wk)
    monkeypatch.setattr(wk.keh, 'klein_missing_assets', lambda *a, **k: [])
    input_dir = tmp_path / 'comfy-in'
    input_dir.mkdir()
    monkeypatch.setattr(wk, '_comfy_input_dir', lambda: str(input_dir))

    captured = {}
    monkeypatch.setattr(wk.queue_manager, 'add_job',
                        lambda **kw: captured.update(kw) or kw['job_id'])
    monkeypatch.setattr(wk, '_wait_for_job',
                        lambda job_id, timeout: ('failed', None, 'stub'))

    with app.app_context():
        wk._run_klein_job('local', Image.new('RGB', (8, 8)), seed=1)
    assert captured.get('worker_id') is None
    assert 'staged_input_paths' not in captured['metadata']
    assert captured['metadata'] == {'model_name': 'watermark_klein'}
