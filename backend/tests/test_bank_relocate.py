"""🗃️ Moving a bank's folder — repoint the bank, keep every analysis.

A bank row stores `source_path`; every BankImage stores a relpath UNDER it, and
every analysis (quality scores, dhash, face state, captions, keep/reject
decisions) hangs off the row id, never off a path. So moving the folder to
another drive should cost nothing — provided (a) the bank can be repointed at
all, and (b) a pass that runs while the folder is elsewhere does not treat the
absence of the files as a defect of the images.

(b) is the dangerous half: an unreadable file is auto-rejected by the quality
pass, and "the folder moved" used to look exactly like "every file is
unreadable" — a silent mass-reject over a whole bank.
"""
import os

import pytest
from PIL import Image


def _save(path, im):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path)


def photo(size=128, seed=0):
    """Smooth structure — a stable dHash and non-degenerate quality metrics."""
    im = Image.new('L', (size, size))
    c, r2 = size / 2, (size / 3) ** 2
    im.putdata([min(255, int(150 * x / size + 50 * y / size) + seed
                    + (80 if (x - c) ** 2 + (y - c) ** 2 < r2 else 0))
                for y in range(size) for x in range(size)])
    return im.convert('RGB')


def _mkbank(client, root, rels, name='B'):
    src = root / 'src'
    for i, rel in enumerate(rels):
        _save(str(src / rel), photo(seed=i * 7))
    r = client.post('/api/bank/create', json={'name': name, 'folder': str(src)})
    assert r.status_code == 200, r.get_json()
    return r.get_json()['id'], src


def _move(src, dest):
    """Simulate "the user moved the folder to another drive": the old path no
    longer exists, the same tree sits at a brand-new one."""
    os.makedirs(os.path.dirname(str(dest)), exist_ok=True)
    os.rename(str(src), str(dest))
    return dest


def _get(model, row_id):
    from app.models import db
    return db.session.get(model, row_id)


def _statuses(app, bank_id):
    from app.models import BankImage
    with app.app_context():
        return sorted((r.relpath.replace('\\', '/'), r.status,
                       r.reject_reason, r.quality_state)
                      for r in BankImage.query.filter_by(bank_id=bank_id))


# --- (b) the guard: a moved folder must not degrade the bank -----------------
def test_scan_on_a_moved_folder_rejects_nothing(client, app, tmp_path):
    """THE regression. Files absent (folder moved / drive unplugged) + quality
    pass: not one image may be auto-rejected, and the job must say the folder
    moved instead of quietly grading 30k images as unreadable."""
    rels = [f'a{i}.png' for i in range(6)]
    bank_id, src = _mkbank(client, tmp_path, rels)
    _move(src, tmp_path / 'moved')

    r = client.post(f'/api/bank/{bank_id}/scan')
    assert r.status_code in (202, 409), r.get_json()

    rows = _statuses(app, bank_id)
    assert len(rows) == len(rels)
    assert [x[1] for x in rows] == ['pending'] * len(rels), rows
    assert all(x[2] is None for x in rows), rows
    # ...and nothing was graded 'unreadable' either: absent is not a defect.
    assert all(x[3] != 'unreadable' for x in rows), rows

    payload = client.get(f'/api/bank/{bank_id}').get_json()
    job = payload.get('activity') or {}
    blurb = f"{job.get('error') or ''} {job.get('detail') or ''}".lower()
    assert 'moved' in blurb, job


def test_scan_stops_when_the_folder_is_there_but_empty(client, app, tmp_path):
    """The nastier shape of the same accident: the PATH still resolves (a drive
    letter got reused, a sync folder came back empty) so the root check passes,
    yet every file is gone. The pass must bail out on the pattern instead of
    walking 30 000 absences and grading each one."""
    rels = [f'a{i}.png' for i in range(25)]
    bank_id, src = _mkbank(client, tmp_path, rels)
    for rel in rels:
        os.remove(str(src / rel))

    assert client.post(f'/api/bank/{bank_id}/scan').status_code == 202
    rows = _statuses(app, bank_id)
    assert {x[1] for x in rows} == {'pending'}, rows
    assert {x[3] for x in rows} == {None}, rows
    job = client.get(f'/api/bank/{bank_id}').get_json().get('activity') or {}
    assert 'moved' in (job.get('error') or '').lower(), job


def test_scan_still_rejects_a_genuinely_corrupt_file(client, app, tmp_path):
    """The guard must not disarm the legitimate case: the folder is right where
    it should be and ONE file is garbage — that one is still auto-rejected."""
    bank_id, src = _mkbank(client, tmp_path, ['good.png'])
    (src / 'broken.png').write_bytes(b'not a png at all')
    client.get(f'/api/bank/{bank_id}')          # folder walk picks the new file up

    r = client.post(f'/api/bank/{bank_id}/scan')
    assert r.status_code == 202, r.get_json()
    rows = dict((x[0], (x[1], x[3])) for x in _statuses(app, bank_id))
    assert rows['broken.png'] == ('reject', 'unreadable'), rows
    assert rows['good.png'][0] == 'pending', rows


# --- (a) relocate ------------------------------------------------------------
def _analyse(client, app, bank_id):
    """Run the quality pass, then stamp a decision and a caption by hand, so the
    relocate assertions cover BOTH computed analysis and user decisions."""
    from app.models import BankImage
    assert client.post(f'/api/bank/{bank_id}/scan').status_code == 202
    with app.app_context():
        rows = BankImage.query.filter_by(bank_id=bank_id).order_by(
            BankImage.id.asc()).all()
        rows[0].status = 'keep'
        rows[1].status, rows[1].reject_reason = 'reject', 'manual'
        rows[2].caption = 'a photo of a test pattern'
        from app.models import db
        db.session.commit()
        return {r.relpath.replace('\\', '/'): (
            r.status, r.reject_reason, r.quality_state, r.blur_score,
            r.noise_score, r.uniformity_score, r.dhash, r.caption)
            for r in rows}


def test_relocate_keeps_every_analysis_and_serves_from_the_new_path(
        client, app, tmp_path):
    rels = ['a.png', 'sub/b.png', 'sub/deep/c.png', 'd.png']
    bank_id, src = _mkbank(client, tmp_path, rels)
    before = _analyse(client, app, bank_id)
    dest = _move(src, tmp_path / 'other-drive' / 'bank')

    r = client.post(f'/api/bank/{bank_id}/relocate', json={'folder': str(dest)})
    body = r.get_json()
    assert r.status_code == 200, body
    assert body['applied'] is False and body['found'] == len(rels)
    assert body['missing'] == 0

    r = client.post(f'/api/bank/{bank_id}/relocate',
                    json={'folder': str(dest), 'confirm': True})
    body = r.get_json()
    assert r.status_code == 200, body
    assert body['applied'] is True

    from app.models import BankImage, ImageBank
    with app.app_context():
        bank = _get(ImageBank, bank_id)
        assert os.path.normcase(bank.source_path) == os.path.normcase(
            os.path.realpath(str(dest)))
        after = {r.relpath.replace('\\', '/'): (
            r.status, r.reject_reason, r.quality_state, r.blur_score,
            r.noise_score, r.uniformity_score, r.dhash, r.caption)
            for r in BankImage.query.filter_by(bank_id=bank_id)}
    assert after == before

    # ...and the bytes are served again, from the new location.
    with app.app_context():
        one = BankImage.query.filter_by(bank_id=bank_id).first().id
    assert client.get(f'/api/bank/{bank_id}/file/{one}').status_code == 200


@pytest.mark.parametrize('levels', [1, 2])
def test_widen_rebases_paths_and_keeps_analysis(client, app, tmp_path, levels):
    import json

    from app.models import BankImage, ImageBank, db
    from app.services import image_bank_service as banks

    target = tmp_path / 'library'
    old_parent = target if levels == 1 else target / 'nested'
    rels = ['a.png', 'sub/b.png', 'sub/deep/c.png', 'd.png']
    bank_id, src = _mkbank(client, old_parent, rels)
    _analyse(client, app, bank_id)
    prefix = os.path.relpath(src, target) + os.sep
    (src / 'a.txt').write_text('test caption', encoding='utf-8')
    _save(str(target / 'extra.png'), photo())

    def analysis_rows():
        return {row.id: {col.name: getattr(row, col.name)
                         for col in BankImage.__table__.columns if col.name != 'relpath'}
                for row in BankImage.query.filter_by(bank_id=bank_id)}

    with app.app_context():
        banks.refresh_bank('local', bank_id, force=True)
        bank = _get(ImageBank, bank_id)
        bank.excluded_folders = json.dumps(['sub/deep'])
        db.session.commit()
        before = analysis_rows()
        image_id = BankImage.query.filter_by(bank_id=bank_id, relpath='a.png').one().id
        assert bank_id in banks._folder_sync

    url = f'/api/bank/{bank_id}/relocate'
    request = {'folder': f'"{target}{os.sep}"'}
    r = client.post(url, json=request)
    body = r.get_json()
    assert r.status_code == 200, body
    assert (body['mode'], body['prefix'], body['applied']) == ('widen', prefix, False)
    assert (body['found'], body['total'], body['missing'], body['extra']) == (4, 4, 0, 1)
    with app.app_context():
        assert _get(ImageBank, bank_id).source_path == os.path.realpath(src)

    r = client.post(url, json={**request, 'confirm': True})
    assert r.status_code == 200 and r.get_json()['applied'] is True, r.get_json()
    with app.app_context():
        bank = _get(ImageBank, bank_id)
        assert bank.source_path == os.path.realpath(target)
        assert json.loads(bank.excluded_folders) == [prefix.replace(os.sep, '/') + 'sub/deep']
        assert analysis_rows() == before
        assert {r.relpath for r in BankImage.query.filter_by(bank_id=bank_id)} == {
            prefix + os.path.normpath(rel) for rel in rels}
        assert bank_id not in banks._folder_sync

    file = client.get(f'/api/bank/{bank_id}/file/{image_id}')
    assert file.status_code == 200 and file.data == (src / 'a.png').read_bytes()
    assert (src / 'a.txt').read_text(encoding='utf-8') == 'test caption'
    with app.app_context():
        banks.refresh_bank('local', bank_id, force=True)
        assert BankImage.query.filter_by(bank_id=bank_id, relpath='extra.png').count() == 1
        assert BankImage.query.filter_by(bank_id=bank_id).count() == 5


@pytest.mark.parametrize('present', [0, 1])
def test_widen_with_missing_files_keeps_all_rows(client, app, tmp_path, present):
    target = tmp_path / 'library'
    bank_id, src = _mkbank(client, target, ['a.png', 'b.png'])
    (src / 'b.png').unlink()
    if not present:
        (src / 'a.png').unlink()
    url = f'/api/bank/{bank_id}/relocate'
    request = {'folder': str(target)}
    r = client.post(url, json=request)
    assert r.status_code == 200, r.get_json()
    body = r.get_json()
    assert body['found'] == present and body['missing'] == 2 - present
    assert body['needs_confirm'] is True and body['applied'] is False
    assert body['missing_sample'][-1] == os.path.join('src', 'b.png')
    assert [r[0] for r in _statuses(app, bank_id)] == ['a.png', 'b.png']
    r = client.post(url, json={**request, 'confirm': True})
    assert r.status_code == 200 and r.get_json()['applied'] is True
    assert [r[0] for r in _statuses(app, bank_id)] == ['src/a.png', 'src/b.png']


def test_widen_reports_nested_banks_and_keeps_read_only_protection(client, app, tmp_path):
    from app.models import ImageBank, db
    from app.services import bank_jobs

    target = tmp_path / 'library'
    bank_id, src = _mkbank(client, target, ['a.png'])
    other_id, other = _mkbank(client, target / 'sibling', ['b.png'], name='Other bank')
    with app.app_context():
        _get(ImageBank, bank_id).read_only = True
        db.session.commit()
    url = f'/api/bank/{bank_id}/relocate'
    request = {'folder': str(target)}
    overlap = {'id': other_id, 'name': 'Other bank',
               'source_path': os.path.realpath(other), 'relation': 'child'}
    r = client.post(url, json=request)
    assert r.status_code == 200 and r.get_json()['overlaps'] == [overlap]
    with bank_jobs.mutation_lease(other_id, 'test-overlap'):
        assert client.post(url, json={**request, 'confirm': True}).status_code == 409
    with app.app_context():
        assert _get(ImageBank, bank_id).source_path == os.path.realpath(src)
    r = client.post(url, json={**request, 'confirm': True})
    assert r.status_code == 200 and r.get_json()['overlaps'] == [overlap]
    with app.app_context():
        assert _get(ImageBank, bank_id).read_only is True


def test_widen_refuses_an_ancestor_already_in_another_bank(client, tmp_path):
    target = tmp_path / 'library'
    bank_id, _ = _mkbank(client, target, ['a.png'])
    assert client.post('/api/bank/create', json={
        'name': 'Existing bank', 'folder': str(target)}).status_code == 200
    r = client.post(f'/api/bank/{bank_id}/relocate', json={'folder': str(target), 'confirm': True})
    assert r.status_code == 400 and 'Existing bank' in r.get_json()['error']


def test_widen_refuses_an_ancestor_with_dataset_storage(client, app, tmp_path):
    from app.models import FaceDataset, db

    target = tmp_path / 'library'
    bank_id, _ = _mkbank(client, target, ['a.png'])
    storage = target / 'reserved'
    storage.mkdir()
    with app.app_context():
        db.session.add(FaceDataset(user_id='local', name='Test dataset', trigger_word='test_token',
                                   storage_root=str(storage)))
        db.session.commit()
    r = client.post(f'/api/bank/{bank_id}/relocate', json={'folder': str(target)})
    assert r.status_code == 400 and 'dataset' in r.get_json()['error'].lower()


def test_widen_refuses_a_root_only_bank(client, app, tmp_path):
    from app.models import ImageBank, db

    target = tmp_path / 'library'
    bank_id, src = _mkbank(client, target, ['a.png'])
    with app.app_context():
        _get(ImageBank, bank_id).root_only = True
        db.session.commit()
    r = client.post(f'/api/bank/{bank_id}/relocate', json={'folder': str(target), 'confirm': True})
    assert r.status_code == 400 and 'root-only' in r.get_json()['error']
    with app.app_context():
        assert _get(ImageBank, bank_id).source_path == os.path.realpath(src)
        assert _get(ImageBank, bank_id).root_only is True


def test_widen_rolls_back_when_a_path_rewrite_fails(client, app, tmp_path, monkeypatch):
    from app.models import BankImage, ImageBank
    from app.services import folder_person, image_bank_service as banks

    target = tmp_path / 'library'
    bank_id, src = _mkbank(client, target, ['a.png'])

    def fail(bank_id, prefix):
        assert BankImage.query.filter_by(bank_id=bank_id).one().relpath == prefix + 'a.png'
        raise RuntimeError('rewrite failed')

    monkeypatch.setattr(folder_person, 'widen_scopes', fail)
    with app.app_context():
        with pytest.raises(RuntimeError, match='rewrite failed'):
            banks.relocate_bank('local', bank_id, str(target), confirm=True)
        assert _get(ImageBank, bank_id).source_path == os.path.realpath(src)
        assert BankImage.query.filter_by(bank_id=bank_id).one().relpath == 'a.png'


def test_widen_preserves_exact_folder_groups_and_probe_history(client, app, tmp_path):
    from app.models import BankFolderProbe, BankImage, db
    from app.services import folder_person, image_bank_service as banks

    target = tmp_path / 'library'
    bank_id, src = _mkbank(client, target / 'middle', ['a.png', 'group/b.png', 'other/c.png'])
    root_scope = os.path.join('middle', 'src') + os.sep
    child_scope = root_scope + 'group'
    with app.app_context():
        root_id = folder_person.assert_single_person('local', bank_id, '')['cluster_id']
        child_id = folder_person.assert_single_person('local', bank_id, 'group')['cluster_id']
        root = folder_person.assertion_for(bank_id, '')
        root.sample_report = '{"note": "test evidence"}'
        db.session.add(BankFolderProbe(bank_id=bank_id, subfolder='other',
                                      verdict='mixed', note='test probe'))
        db.session.commit()

    url = f'/api/bank/{bank_id}/relocate'
    for parent in (target / 'middle', target):
        r = client.post(url, json={'folder': str(parent), 'confirm': True})
        assert r.status_code == 200, r.get_json()
    _save(str(src / 'new.png'), photo())
    _save(str(src / 'group' / 'new.png'), photo())
    _save(str(target / 'middle' / 'sibling.png'), photo())
    with app.app_context():
        root = folder_person.assertion_for(bank_id, root_scope)
        assert (root.cluster_id, root.sample_report) == (root_id, '{"note": "test evidence"}')
        assert folder_person.assertion_for(bank_id, child_scope).cluster_id == child_id
        probe = folder_person.probe_for(bank_id, root_scope + 'other')
        assert (probe.verdict, probe.note) == ('mixed', 'test probe')
        assert folder_person._folder_rows_q(bank_id, root_scope).count() == 1
        banks.refresh_bank('local', bank_id, force=True)
        clusters = {r.relpath: r.face_cluster for r in BankImage.query.filter_by(bank_id=bank_id)}
        assert clusters[root_scope + 'new.png'] == root_id
        assert clusters[child_scope + os.sep + 'new.png'] == child_id
        assert clusters[os.path.join('middle', 'sibling.png')] is None
        with pytest.raises(ValueError, match='overlapping folder group'):
            folder_person.assert_single_person('local', bank_id, 'middle')
        assert folder_person.revoke('local', bank_id, root_scope)['cleared'] == 2
        assert folder_person._folder_rows_q(bank_id, child_scope).filter_by(
            face_cluster=child_id).count() == 2


def test_relocate_refuses_a_folder_that_is_not_this_bank(client, app, tmp_path):
    rels = ['a.png', 'b.png', 'c.png']
    bank_id, src = _mkbank(client, tmp_path, rels)
    before = _statuses(app, bank_id)
    stranger = tmp_path / 'someone-elses'
    _save(str(stranger / 'zzz.png'), photo())

    r = client.post(f'/api/bank/{bank_id}/relocate',
                    json={'folder': str(stranger), 'confirm': True})
    body = r.get_json()
    assert r.status_code == 400, body
    assert body['found'] == 0 and body['missing'] == len(rels)
    assert 'error' in body

    from app.models import ImageBank
    with app.app_context():
        assert os.path.normcase(_get(ImageBank, bank_id).source_path) \
            == os.path.normcase(os.path.realpath(str(src)))
    assert _statuses(app, bank_id) == before          # not one row lost


def test_relocate_needs_confirmation_when_files_are_missing(
        client, app, tmp_path):
    """A PARTIAL match is the ambiguous case: report both numbers and require an
    explicit confirmation — then keep every row, missing files included."""
    rels = ['a.png', 'b.png', 'c.png', 'd.png']
    bank_id, src = _mkbank(client, tmp_path, rels)
    dest = _move(src, tmp_path / 'moved')
    os.remove(str(dest / 'c.png'))
    os.remove(str(dest / 'd.png'))

    r = client.post(f'/api/bank/{bank_id}/relocate', json={'folder': str(dest)})
    body = r.get_json()
    assert r.status_code == 200, body
    assert (body['found'], body['missing']) == (2, 2)
    assert body['applied'] is False and body['needs_confirm'] is True
    assert body['missing_sample']

    r = client.post(f'/api/bank/{bank_id}/relocate',
                    json={'folder': str(dest), 'confirm': True})
    assert r.status_code == 200 and r.get_json()['applied'] is True
    assert len(_statuses(app, bank_id)) == len(rels)     # nothing deleted


def test_relocate_matches_case_insensitively_on_windows(client, app, tmp_path):
    """The same tree re-created with a different case (or reached through a
    differently-cased drive letter) is still the same bank on Windows."""
    from app.services import image_bank_service as banks
    bank_id, src = _mkbank(client, tmp_path, ['Photo.PNG', 'Sub/Two.png'])
    dest = tmp_path / 'dest'
    os.makedirs(str(dest / 'sub'), exist_ok=True)
    _save(str(dest / 'photo.png'), photo())
    _save(str(dest / 'sub' / 'two.png'), photo(seed=3))

    with app.app_context():
        preview = banks.relocate_preview('local', bank_id, str(dest))
    expected = 2 if os.path.normcase('A') == os.path.normcase('a') else 0
    assert preview['found'] == expected, preview


def test_relocate_rejects_an_unknown_folder(client, tmp_path):
    bank_id, _src = _mkbank(client, tmp_path, ['a.png'])
    r = client.post(f'/api/bank/{bank_id}/relocate',
                    json={'folder': str(tmp_path / 'nope'), 'confirm': True})
    assert r.status_code == 400
    assert 'not found' in (r.get_json().get('error') or '').lower()


def test_widen_rejects_an_unreadable_ancestor(client, tmp_path, monkeypatch):
    from app.services import image_bank_service as banks

    target = tmp_path / 'library'
    bank_id, _src = _mkbank(client, target, ['a.png'])

    def unreadable(folder, *, onerror):
        onerror(PermissionError(13, 'Permission denied', folder))

    monkeypatch.setattr(banks, '_walk_image_relpaths', unreadable)
    r = client.post(f'/api/bank/{bank_id}/relocate', json={'folder': str(target)})
    assert r.status_code == 400 and 'not readable' in r.get_json()['error']


@pytest.mark.parametrize('folder', ['', '   '])
def test_relocate_requires_a_folder(client, tmp_path, folder):
    bank_id, _src = _mkbank(client, tmp_path, ['a.png'])
    r = client.post(f'/api/bank/{bank_id}/relocate', json={'folder': folder})
    assert r.status_code == 400
