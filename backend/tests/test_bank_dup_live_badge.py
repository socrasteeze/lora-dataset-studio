"""≈ / ✂ marks mean "still to resolve", not "was once grouped".

Reported: a bank's thumbnails were marked as duplicates while the Duplicates
filter showed nothing. The filter was right. Measured on the reporter's own
database, bank 52: **10 060 rows carrying `dup_group`, 0 unresolved groups** —
6 887 of them already rejected (that IS the resolution) and 3 173 survivors left
alone in a group of one after the rejected rows were deleted.

`rebuild_dup_groups` is the scan's, and only the scan's; nothing clears the
column afterwards. So `dup_group != None` only ever meant "was once grouped",
while the ≈ chip and the resolution panel ask `_unresolved_dup_groups_q` — still
>= 2 non-rejected members. Two predicates over one column, and the tile had the
wrong one.

THE FIX THAT LOOKS RIGHT AND IS NOT: clearing `dup_group` when a group is
resolved. `bank_undo` snapshots ONLY (status, reject_reason) — its module
docstring states that as a deliberate honesty boundary — so undo would restore
the statuses and the group would stay gone. That is what
`test_undo_brings_the_duplicate_group_back` defends, and the way to verify that
test is to add `r.dup_group = None` to `resolve_dups._apply` and watch it fail.
"""
import os
import sys
import types

import pytest
from PIL import Image

from test_image_bank import _mkbank, photo_like


def _images(client, bank_id, query=''):
    r = client.get(f'/api/bank/{bank_id}/images?limit=500{query}')
    assert r.status_code == 200, r.get_json()
    return r.get_json()


def _by_name(client, bank_id):
    return {i['name']: i for i in _images(client, bank_id)['images']}


def _dup_pair(tmp_path_factory=None):
    """One image and a resized copy of it — a stable dHash pair (see photo_like)."""
    big = photo_like(size=256)
    return big, big.resize((96, 96), Image.LANCZOS)


def _scan(client, bank_id):
    # 202: the scan is a job. Under TESTING bank_jobs runs it INLINE, so it is
    # finished by the time this returns.
    r = client.post(f'/api/bank/{bank_id}/scan', json={})
    assert r.status_code == 202, r.get_json()


def _chip(client, bank_id):
    """What the ≈ Duplicates chip shows."""
    return client.get(f'/api/bank/{bank_id}').get_json()['dup']


def _force_trash(monkeypatch):
    """send2trash → os.remove, so files leave the folder without the OS bin."""
    monkeypatch.setitem(sys.modules, 'send2trash',
                        types.SimpleNamespace(send2trash=lambda p: os.remove(p)))


# --- the reported bug --------------------------------------------------------

def test_a_resolved_group_stops_badging_its_survivor(client, tmp_path):
    orig, copy = _dup_pair()
    bank_id, _src = _mkbank(client, tmp_path, {'orig.jpg': orig, 'copy.jpg': copy})
    _scan(client, bank_id)
    assert _chip(client, bank_id)['unresolved'] == 1, 'no group to resolve'

    r = client.post(f'/api/bank/{bank_id}/dups/resolve', json={'strategy': 'best'})
    assert r.status_code == 200, r.get_json()

    by = _by_name(client, bank_id)
    # The id is HISTORY and stays — undo depends on it.
    assert by['orig.jpg']['dup_group'] is not None
    assert by['copy.jpg']['dup_group'] is not None
    # …but nothing is still to resolve, so nothing is badged.
    assert by['orig.jpg']['dup_unresolved'] is False
    assert by['copy.jpg']['dup_unresolved'] is False

    chip = _chip(client, bank_id)
    assert chip['unresolved'] == 0
    assert client.get(f'/api/bank/{bank_id}/dup-groups').get_json()['total'] == 0

    # THE invariant the bug broke, stated directly: a tile is badged only when
    # the chip counts something. This is the assertion that fails against the
    # naive re-regression `'dup_unresolved': row.dup_group is not None`.
    badged = sum(1 for i in by.values() if i['dup_unresolved'])
    assert (badged > 0) == (chip['unresolved'] > 0)


def test_an_unresolved_group_is_still_badged(client, tmp_path):
    """The mandatory partner: without it, a hardcoded False passes the test above."""
    orig, copy = _dup_pair()
    bank_id, _src = _mkbank(client, tmp_path, {'orig.jpg': orig, 'copy.jpg': copy})
    _scan(client, bank_id)

    by = _by_name(client, bank_id)
    assert by['orig.jpg']['dup_unresolved'] is True
    assert by['copy.jpg']['dup_unresolved'] is True
    assert _chip(client, bank_id)['unresolved'] == 1


def test_a_singleton_left_by_delete_rejected_is_not_badged(client, tmp_path, monkeypatch):
    """Bank 52's 3 173-row case in miniature: the loser's row is gone, nothing
    regroups, and the survivor keeps a group id it is now alone in."""
    _force_trash(monkeypatch)
    orig, copy = _dup_pair()
    bank_id, _src = _mkbank(client, tmp_path, {'orig.jpg': orig, 'copy.jpg': copy})
    _scan(client, bank_id)
    client.post(f'/api/bank/{bank_id}/dups/resolve', json={'strategy': 'best'})
    r = client.post(f'/api/bank/{bank_id}/delete-rejected', json={})
    assert r.status_code == 200, r.get_json()

    by = _by_name(client, bank_id)
    assert len(by) == 1, by.keys()
    survivor = next(iter(by.values()))
    assert survivor['dup_group'] is not None      # nothing regroups it
    assert survivor['dup_unresolved'] is False    # and it is alone, so: no mark
    assert _chip(client, bank_id)['unresolved'] == 0


# --- the second, quieter bug: Select all in filter ---------------------------

def test_the_dups_filter_returns_only_members_of_open_groups(client, tmp_path):
    """`flag=dups` feeds "Select all in filter" and ▶ Review. Unqualified it
    returned every row that had EVER been grouped — on the reporter's bank 52,
    10 060 rows (6 887 already rejected) under a chip reading 0."""
    a1 = photo_like(size=256)
    a2 = a1.resize((96, 96), Image.LANCZOS)
    b1 = photo_like(size=200).rotate(180)
    b2 = b1.resize((80, 80), Image.LANCZOS)
    bank_id, _src = _mkbank(client, tmp_path, {
        'a1.jpg': a1, 'a2.jpg': a2, 'b1.jpg': b1, 'b2.jpg': b2})
    _scan(client, bank_id)
    assert _chip(client, bank_id)['unresolved'] == 2, 'expected two dup groups'

    # Resolve ONE group only, by naming the keeper in it.
    by = _by_name(client, bank_id)
    gid_a = by['a1.jpg']['dup_group']
    r = client.post(f'/api/bank/{bank_id}/dups/resolve',
                    json={'group': gid_a, 'strategy': 'best'})
    assert r.status_code == 200, r.get_json()
    assert _chip(client, bank_id)['unresolved'] == 1

    got = _images(client, bank_id, '&flag=dups')
    names = {i['name'] for i in got['images']}
    assert names == {'b1.jpg', 'b2.jpg'}, names
    assert got['total'] == 2
    # …and it agrees with what the panel would offer to resolve.
    panel = client.get(f'/api/bank/{bank_id}/dup-groups').get_json()
    assert got['total'] == sum(len(g['images']) for g in panel['groups'])


# --- the constraint guard ----------------------------------------------------

def test_undo_brings_the_duplicate_group_back(client, tmp_path):
    """Verified against the REJECTED design, not against the shipped one.

    Reverting the live-badge fix only makes this fail on a missing key. Its real
    job is to fail when someone "fixes" the bug by clearing dup_group on
    resolve: bank_undo restores (status, reject_reason) and nothing else, so the
    group would never come back. Add `r.dup_group = None` to resolve_dups._apply
    to see all four assertions below go red.
    """
    orig, copy = _dup_pair()
    bank_id, _src = _mkbank(client, tmp_path, {'orig.jpg': orig, 'copy.jpg': copy})
    _scan(client, bank_id)
    client.post(f'/api/bank/{bank_id}/dups/resolve', json={'strategy': 'best'})
    assert all(i['dup_unresolved'] is False
               for i in _images(client, bank_id)['images'])

    r = client.post(f'/api/bank/{bank_id}/undo', json={})
    assert r.status_code == 200, r.get_json()

    by = _by_name(client, bank_id)
    assert by['orig.jpg']['dup_unresolved'] is True
    assert by['copy.jpg']['dup_unresolved'] is True
    assert _chip(client, bank_id)['unresolved'] == 1
    assert client.get(f'/api/bank/{bank_id}/dup-groups').get_json()['total'] == 1


# --- the panel path, and the cost contract -----------------------------------

def test_the_resolution_panel_badges_its_own_rows(client, tmp_path):
    """dup_groups_payload goes through _page_images too. Catches a bank_id=None
    or mis-hoisted `live` in the panel path that nothing else would."""
    orig, copy = _dup_pair()
    bank_id, _src = _mkbank(client, tmp_path, {'orig.jpg': orig, 'copy.jpg': copy})
    _scan(client, bank_id)

    panel = client.get(f'/api/bank/{bank_id}/dup-groups').get_json()
    assert panel['groups'], panel
    for group in panel['groups']:
        assert group['images']
        for img in group['images']:
            assert img['dup_unresolved'] is True, img


def test_the_live_lookup_is_once_per_page_not_once_per_row(client, tmp_path, app):
    """The design rests on one grouped-lookup per page. A regression to per-row
    would be invisible in every other test and quadratic on a 30k bank."""
    from sqlalchemy import event
    from app.extensions import db

    orig, copy = _dup_pair()
    files = {'orig.jpg': orig, 'copy.jpg': copy}
    for i in range(6):                      # ungrouped filler
        files[f'x{i}.jpg'] = photo_like(size=64 + i * 7)
    bank_id, _src = _mkbank(client, tmp_path, files)
    _scan(client, bank_id)

    seen = []

    def spy(conn, cursor, statement, params, context, many):
        if 'HAVING' in statement.upper():
            seen.append(statement)

    with app.app_context():
        engine = db.engine
    event.listen(engine, 'before_cursor_execute', spy)
    try:
        seen.clear()
        _images(client, bank_id)            # a page WITH grouped rows
        with_groups = len(seen)
        seen.clear()
        # A page with no grouped rows at all must cost no grouped lookup.
        _images(client, bank_id, '&flag=no_face')
        without = len(seen)
    finally:
        event.remove(engine, 'before_cursor_execute', spy)

    assert with_groups <= 2, (
        f'{with_groups} grouped lookups for one page — the live state is being '
        'resolved per row, not per page')
    assert without == 0, (
        f'{without} grouped lookups for a page with nothing grouped on it')
