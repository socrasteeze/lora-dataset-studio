"""Phase-1 end-to-end acceptance path: create -> upload ref -> generate (Klein,
enqueue mocked) -> curate (keep + caption) -> export ZIP. Exercises the same
HTTP surface the frontend drives; the ComfyUI queue is stubbed at the
enqueue_klein_edit seam and completion is materialised on disk directly (the
queue-side completion linking has its own tests)."""
import io
import os
import zipfile

from PIL import Image


def _png():
    buf = io.BytesIO(); Image.new('RGB', (64, 64), (1, 2, 3)).save(buf, 'PNG')
    return buf.getvalue()


def test_local_klein_end_to_end(client, app, monkeypatch):
    ds = client.post('/api/dataset/create',
                     json={'name': 'E2E', 'trigger_word': 'e2e'}).get_json()
    did = ds['id']

    r = client.post(f'/api/dataset/{did}/ref',
                    data={'file': (io.BytesIO(_png()), 'ref.png')},
                    content_type='multipart/form-data')
    assert r.status_code == 200

    from app.services import face_dataset_service as svc
    from app.services import klein_edit_helper as keh
    from app.services.face_variations import select_preset

    monkeypatch.setattr(keh, 'klein_missing_assets', lambda *a, **k: set())
    monkeypatch.setattr(keh, 'klein_missing_nodes', lambda *a, **k: [])
    jobs = []
    monkeypatch.setattr(keh, 'enqueue_klein_edit',
                        lambda **k: jobs.append(k) or f'job-{len(jobs)}')

    r = client.post(f'/api/dataset/{did}/generate', json={
        'generator': 'klein',
        'variations': select_preset('zimage_12')[:2],
        'multiplier': 1,
        'klein_model': 'm.safetensors',
    })
    assert r.status_code == 200
    assert r.get_json()['created'] == 2
    assert len(jobs) == 2

    # Materialise the "completed" Klein outputs directly (queue linking has its
    # own tests) so the curation/export surface sees finished tiles.
    with app.app_context():
        rows = svc.FaceDatasetImage.query.filter_by(dataset_id=did).all()
        assert len(rows) == 2 and all(row.job_id for row in rows)
        d = svc._dataset_dir(did)
        for i, row in enumerate(rows):
            fn = f'gen_{i}.webp'
            with open(os.path.join(d, fn), 'wb') as fh:
                fh.write(svc.normalize_to_webp(_png()))
            row.filename = fn
            row.job_id = None
        svc.db.session.commit()

    payload = client.get(f'/api/dataset/{did}').get_json()
    assert len(payload['images']) == 2

    # Keep one, caption it manually, export.
    iid = payload['images'][0]['id']
    r = client.post(f'/api/dataset/image/{iid}/status', json={'status': 'keep'})
    assert r.status_code == 200
    r = client.post(f'/api/dataset/image/{iid}/caption', json={'caption': 'a portrait'})
    assert r.status_code == 200

    z = client.get(f'/api/dataset/{did}/export')
    assert z.status_code == 200 and z.mimetype == 'application/zip'
    zf = zipfile.ZipFile(io.BytesIO(z.data))
    names = zf.namelist()
    assert any(n.endswith('_000_ref.png') for n in names)  # reference kept as the real anchor
    caption_file = next(n for n in names if n.endswith('_001.txt'))
    assert zf.read(caption_file).decode('utf-8') == 'e2e, a portrait'
