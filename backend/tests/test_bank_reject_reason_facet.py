"""✕ Rejected was one pile with no handles.

Reported: a user auto-rejected a bank's duplicates, then filtered by ≈
Duplicates and got 0 results and "nothing found". The images were still there.

The ≈ chip was RIGHT — see test_bank_dup_live_badge: a group is unresolved while
it still holds >=2 non-rejected members, and "keep best" leaves exactly one, so
a fully resolved bank honestly has nothing left to resolve. The defect is what
that leaves behind. `_apply_facets` had no reject_reason facet at all, so every
rejected image — duplicate, blurry, flat, hand-rejected — landed in one
undifferentiated pile whose only distinguishing mark was a text badge on the
tile. Nothing could select "the ones rejected as duplicates".

The `flag == 'dups'` branch says in its own comment that
`status=reject & flag=dups` must keep working, "or we destroy 'show me the
duplicates I rejected'". It does not: the branch dropped `status != 'reject'`
at the ROW level while `_unresolved_dup_groups_q` still applies it at the GROUP
level, which is strictly stronger — rejecting the losers removes the whole
group. This file is about the facet that answers that question honestly, and it
never asserts a count on its own: always against the page that chip really
opens, the discipline test_bank_facet_counts.py sets.

reject_reason had recorded the answer all along. Nothing exposed it.
"""
from PIL import Image, ImageFilter

from test_image_bank import _mkbank, checkerboard, flat, photo_like


def _scan(client, bank_id):
    r = client.post(f'/api/bank/{bank_id}/scan', json={})
    assert r.status_code in (200, 202), r.get_json()


def _payload(client, bank_id):
    r = client.get(f'/api/bank/{bank_id}')
    assert r.status_code == 200, r.get_json()
    return r.get_json()


def _facets(client, bank_id, **filters):
    r = client.get(f'/api/bank/{bank_id}/facets', query_string=filters)
    assert r.status_code == 200, r.get_json()
    return r.get_json()


def _shown(client, bank_id, **filters):
    """How many images the grid REALLY returns — the number the chip predicts."""
    r = client.get(f'/api/bank/{bank_id}/images',
                   query_string={**filters, 'limit': '1'})
    assert r.status_code == 200, r.get_json()
    return r.get_json()['total']


def _names(client, bank_id, **filters):
    r = client.get(f'/api/bank/{bank_id}/images',
                   query_string={**filters, 'limit': '500'})
    assert r.status_code == 200, r.get_json()
    return {im['name'] for im in r.get_json()['images']}


def _all_images(client, bank_id):
    r = client.get(f'/api/bank/{bank_id}/images?limit=500')
    assert r.status_code == 200, r.get_json()
    return r.get_json()['images']


def _set_status(client, bank_id, ids, status):
    r = client.post(f'/api/bank/{bank_id}/images/status',
                    json={'ids': ids, 'status': status})
    assert r.status_code == 200, r.get_json()


def _dup_pair():
    """One image and a resized copy — a stable dHash pair (see photo_like)."""
    big = photo_like(size=256)
    return big, big.resize((96, 96), Image.LANCZOS)


# --- the reported bug --------------------------------------------------------

def test_the_duplicates_you_auto_rejected_are_reachable_again(client, tmp_path):
    """The whole report, end to end. The ≈ chip going quiet is correct and stays
    correct; what changes is that the images it stopped pointing at now have an
    address."""
    orig, copy = _dup_pair()
    bank_id, _src = _mkbank(client, tmp_path, {
        'orig.jpg': orig, 'copy.jpg': copy, 'other.png': checkerboard()})
    _scan(client, bank_id)
    assert _payload(client, bank_id)['dup']['unresolved'] == 1, 'no group to resolve'

    r = client.post(f'/api/bank/{bank_id}/dups/resolve', json={'strategy': 'best'})
    assert r.status_code == 200, r.get_json()

    # The invariants of test_bank_dup_live_badge, restated so a change to this
    # facet that "fixes" the ≈ chip instead is caught right here.
    payload = _payload(client, bank_id)
    assert payload['dup']['unresolved'] == 0
    assert client.get(f'/api/bank/{bank_id}/dup-groups').get_json()['total'] == 0
    assert _shown(client, bank_id, flag='dups') == 0

    # …and THIS is the part that was missing: the rejected copy has an address.
    assert payload['reject_reasons']['duplicate'] == 1
    assert _shown(client, bank_id, status='reject', reason='duplicate') == 1
    assert _names(client, bank_id, status='reject', reason='duplicate') == {'copy.jpg'}


def test_semantic_dup_rejects_are_reachable_too(app, client, tmp_path):
    """Stage 2 writes a different reason ('semantic_dup') through the same
    resolver. A facet that only knew about stage 1 would strand these the same
    way, and the ✂ chip goes quiet on resolution for the same reason the ≈ one
    does."""
    from app.models import BankImage
    from app.services import image_bank_service as banks

    bank_id, _src = _mkbank(client, tmp_path, {
        'a.png': checkerboard(), 'b.png': checkerboard(cell=9)})
    _scan(client, bank_id)
    with app.app_context():
        for row in BankImage.query.filter_by(bank_id=bank_id).all():
            row.semantic_dup_group = 1
        banks.db.session.commit()

    r = client.post(f'/api/bank/{bank_id}/semantic-dups/resolve',
                    json={'strategy': 'best'})
    assert r.status_code == 200, r.get_json()

    assert _payload(client, bank_id)['reject_reasons']['semantic_dup'] == 1
    assert _shown(client, bank_id, status='reject', reason='semantic_dup') == 1


# --- the counting rule -------------------------------------------------------

def _decided_bank(client, tmp_path):
    """A bank where several reasons hold something at once: auto-reject writes
    the flag ids, a hand rejection writes 'manual', and a resolve writes
    'duplicate'. Without a mix, every assertion below passes on zeros."""
    orig, copy = _dup_pair()
    bank_id, _src = _mkbank(client, tmp_path, {
        'orig.jpg': orig, 'copy.jpg': copy,
        'soft1.png': checkerboard().filter(ImageFilter.GaussianBlur(6)),
        'soft2.png': checkerboard().filter(ImageFilter.GaussianBlur(8)),
        'flat1.png': flat(), 'flat2.png': flat(value=200),
        'sharp.png': checkerboard(),
    })
    _scan(client, bank_id)
    client.post(f'/api/bank/{bank_id}/dups/resolve', json={'strategy': 'best'})
    r = client.post(f'/api/bank/{bank_id}/apply-flags',
                    json={'flags': ['blur', 'uniform']})
    assert r.status_code == 200, r.get_json()
    keep = [i['id'] for i in _all_images(client, bank_id)
            if i['name'] == 'sharp.png']
    _set_status(client, bank_id, keep, 'reject')      # 'manual'
    return bank_id


def test_a_reason_chip_counts_the_page_it_opens(client, tmp_path):
    """The assertion this file exists for, made per reason: the printed number
    against the page the click really returns."""
    bank_id = _decided_bank(client, tmp_path)
    from app.services.image_bank_service import REASON_KEYS

    counted = _facets(client, bank_id, status='reject')['reject_reasons']
    for reason in REASON_KEYS:
        assert counted[reason] == _shown(client, bank_id, status='reject',
                                         reason=reason), reason
    # …and the probe discriminates: several reasons really did hold something,
    # otherwise this test proves nothing.
    assert sum(1 for v in counted.values() if v) >= 3, counted


def test_the_reasons_add_up_to_the_rejected_pile(client, tmp_path):
    """Nothing can be rejected and unreachable — which is the whole defect,
    stated as arithmetic. The 'unrecorded' bucket is what makes this hold on a
    bank whose rows predate the column meaning anything."""
    bank_id = _decided_bank(client, tmp_path)
    payload = _payload(client, bank_id)
    assert sum(payload['reject_reasons'].values()) == payload['counts']['reject']


def test_picking_a_reason_does_not_zero_its_neighbours(client, tmp_path):
    """The counting rule (`skip=`), pinned: a facet is measured with every OTHER
    filter applied and its OWN value lifted. Get it wrong and picking ≈
    Duplicate prints 0 on every sibling, so there is no way back without
    clearing the whole filter."""
    bank_id = _decided_bank(client, tmp_path)
    wide = _facets(client, bank_id, status='reject')['reject_reasons']
    picked = _facets(client, bank_id, status='reject',
                     reason='duplicate')['reject_reasons']
    assert picked == wide


# --- the NULL bucket, and the trap it sets -----------------------------------

def test_rows_rejected_before_the_column_existed_get_their_own_bucket(
        app, client, tmp_path):
    """A NULL reject_reason is a real state on an old bank, not an error. It is
    a selectable bucket rather than a silence, because on such a bank that is
    where the entire pile is."""
    from app.models import BankImage
    from app.services import image_bank_service as banks

    bank_id, _src = _mkbank(client, tmp_path, {
        'a.png': checkerboard(), 'b.png': flat()})
    _scan(client, bank_id)
    ids = [i['id'] for i in _all_images(client, bank_id)]
    _set_status(client, bank_id, ids[:1], 'reject')
    with app.app_context():
        row = BankImage.query.filter_by(id=ids[0]).one()
        row.reject_reason = None                 # the pre-column state
        banks.db.session.commit()

    assert _payload(client, bank_id)['reject_reasons']['unrecorded'] == 1
    assert _shown(client, bank_id, status='reject', reason='unrecorded') == 1


def test_the_unrecorded_bucket_never_counts_an_undecided_image(client, tmp_path):
    """THE trap. reject_reason is NULL on every pending and kept row too, so an
    'unrecorded' bucket that forgets to scope itself to status == 'reject' hands
    back the whole undecided bank. This is the test that goes red if that scope
    is dropped from either _reason_counts or the _apply_facets predicate."""
    bank_id, _src = _mkbank(client, tmp_path, {
        'a.png': checkerboard(), 'b.png': flat(), 'c.png': checkerboard(cell=9)})
    _scan(client, bank_id)
    ids = [i['id'] for i in _all_images(client, bank_id)]
    _set_status(client, bank_id, ids[:1], 'keep')     # the rest stay pending

    assert _payload(client, bank_id)['counts']['reject'] == 0
    assert _payload(client, bank_id)['reject_reasons']['unrecorded'] == 0
    assert _shown(client, bank_id, reason='unrecorded') == 0
    assert _shown(client, bank_id, status='reject', reason='unrecorded') == 0


# --- composition -------------------------------------------------------------

def test_the_reason_facet_composes_and_never_rewrites_the_status_facet(
        client, tmp_path):
    """A chip toggles its own facet and nothing else. The reason predicate
    carries its own status scope instead of writing the status facet, so
    ✓ Kept + a reason is honestly EMPTY rather than silently switched to
    ✕ Rejected behind the user's back."""
    bank_id = _decided_bank(client, tmp_path)

    assert _shown(client, bank_id, status='keep', reason='duplicate') == 0
    assert _shown(client, bank_id, status='pending', reason='blur') == 0
    # With no status picked at all, the reason still scopes itself to rejected
    # rows — and agrees with the explicit spelling. Counted, never hardcoded:
    # the two blurred copies are a dHash pair of their own, so this fixture has
    # more than one duplicate group and saying "1" here only tests the fixture.
    dups = _payload(client, bank_id)['reject_reasons']['duplicate']
    assert dups > 0
    assert (_shown(client, bank_id, reason='duplicate')
            == _shown(client, bank_id, status='reject', reason='duplicate') == dups)
    # And it composes with a second facet without either one being lost.
    both = _shown(client, bank_id, status='reject', reason='blur', flag='blur')
    assert both == _shown(client, bank_id, status='reject', reason='blur')


def test_select_all_in_filter_sees_the_same_scope(client, tmp_path):
    """ids_only=1 feeds ▶ Review and "Select all in filter" through the SAME
    query. A facet that reached the grid but not this one would offer a review
    of rows the grid never showed."""
    bank_id = _decided_bank(client, tmp_path)
    r = client.get(f'/api/bank/{bank_id}/images',
                   query_string={'status': 'reject', 'reason': 'duplicate',
                                 'ids_only': '1'})
    assert r.status_code == 200, r.get_json()
    n = _shown(client, bank_id, status='reject', reason='duplicate')
    assert n > 0, 'nothing was rejected as a duplicate — fixture proves nothing'
    assert len(r.get_json()['ids']) == n


def test_an_unknown_reason_is_ignored_not_an_error(client, tmp_path):
    """Stored query keys travel in bookmarks and localStorage. A stale or
    hand-typed value must degrade to "no reason filter", never to a 500 or to a
    silently empty grid that looks like a real answer."""
    bank_id = _decided_bank(client, tmp_path)
    assert (_shown(client, bank_id, status='reject', reason='not_a_reason')
            == _shown(client, bank_id, status='reject'))


# --- the contract that stops this happening again ----------------------------

def test_every_reason_the_backend_can_write_has_a_chip(client, tmp_path):
    """🧹 Auto-reject writes the FLAG ID itself as the reason, so a new quality
    or score flag silently becomes a new reject_reason. Derive the vocabulary
    and that is free; hand-copy it and the next flag is unreachable exactly the
    way duplicates were — which is why REJECT_REASONS is built from these
    tuples rather than typed out."""
    from app.services.image_bank_service import (_QUALITY_FLAGS, _SCORE_FLAGS,
                                                 REASON_KEYS, REJECT_REASONS)

    assert set(_QUALITY_FLAGS + _SCORE_FLAGS) <= set(REJECT_REASONS)
    # The three reasons no flag produces: written by resolve_dups (x2) and by a
    # hand rejection through set_status.
    assert {'duplicate', 'semantic_dup', 'manual'} <= set(REJECT_REASONS)
    assert 'unrecorded' in REASON_KEYS and 'unrecorded' not in REJECT_REASONS
    assert len(set(REASON_KEYS)) == len(REASON_KEYS), 'duplicate reason id'
    # Every id has to fit the column it is compared against, or the filter
    # silently matches nothing on a stricter backend than SQLite.
    assert max(len(r) for r in REASON_KEYS) <= 16
