"""🗃️ Banks that share a name, shown as one card.

The rule is implemented TWICE — here and in frontend/src/components/bank/
bankGroups.js — because publishing the group on the row would break the bank
list's in-place rename patch (GET /api/banks force-re-walks every source folder,
so it cannot be re-fetched to redraw one label).

CASES below is the same table the frontend test carries. A change made on one
side and not the other fails a test rather than producing two silently different
groupings.
"""
import pytest
from PIL import Image

# (why, [names], grouped?) — mirrored in bankGroups.test.js
CASES = [
    ('exact same name groups', ['Telegram', 'Telegram'], True),
    ('surrounding whitespace is ignored', ['Telegram', ' Telegram '], True),
    ('CASE is significant — never merge silently', ['Telegram', 'telegram'], False),
    ('different names never group', ['A', 'B'], False),
    ('an empty name never groups', ['', ''], False),
    ('whitespace-only is an empty name', ['   ', '   '], False),
]


def _bank(tmp_path, name, folder=None, n=1):
    """A real bank. `name` may be junk (empty, spaces) — create_bank is bypassed
    for those, since the API refuses them and the RULE still has to answer."""
    from app.extensions import db
    from app.models import ImageBank
    src = tmp_path / (folder or f'f{abs(hash(name)) % 10000}{n}')
    src.mkdir(parents=True, exist_ok=True)
    Image.new('RGB', (32, 32), (10, 90, 160)).save(str(src / 'a.jpg'))
    bank = ImageBank(user_id='local', name=name, source_path=str(src))
    db.session.add(bank)
    db.session.commit()
    return bank


@pytest.mark.parametrize('why,names,grouped', CASES)
def test_the_grouping_rule(app, tmp_path, why, names, grouped):
    from app.services import bank_groups

    with app.app_context():
        banks = [_bank(tmp_path, n, folder=f'c{i}') for i, n in enumerate(names)]
        groups = bank_groups.build_groups(banks)
        assert bool(groups) is grouped, why
        if grouped:
            assert sorted(next(iter(groups.values()))) == sorted(b.id for b in banks)


def test_a_bank_marked_keep_separate_is_never_a_member(app, tmp_path):
    from app.extensions import db
    from app.services import bank_groups

    with app.app_context():
        a = _bank(tmp_path, 'Telegram', folder='a')
        b = _bank(tmp_path, 'Telegram', folder='b')
        assert bank_groups.build_groups([a, b])
        b.keep_separate = True
        db.session.commit()
        assert bank_groups.build_groups([a, b]) == {}, \
            'one opted-out member leaves a single bank, and a group needs two'
        assert bank_groups.group_key(b) is None


def test_keep_separate_leaves_the_others_grouped(app, tmp_path):
    from app.extensions import db
    from app.services import bank_groups

    with app.app_context():
        a = _bank(tmp_path, 'T', folder='a')
        b = _bank(tmp_path, 'T', folder='b')
        c = _bank(tmp_path, 'T', folder='c')
        c.keep_separate = True
        db.session.commit()
        assert bank_groups.build_groups([a, b, c]) == {'T': [a.id, b.id]}


def test_member_ids_is_re_derived_from_the_db_not_from_a_client(app, tmp_path):
    """member_ids is THE AUTHORITY for the queue and promote routes. A stale card
    — a rename in another tab, a bank deleted a second ago — must not be able to
    drive a promote into the wrong dataset."""
    from app.extensions import db
    from app.services import bank_groups

    with app.app_context():
        a = _bank(tmp_path, 'T', folder='a')
        b = _bank(tmp_path, 'T', folder='b')
        assert bank_groups.member_ids('local', a.id) == sorted([a.id, b.id])
        # Rename one away: the group dissolves immediately, no refetch involved.
        b.name = 'Something else'
        db.session.commit()
        assert bank_groups.member_ids('local', a.id) == [a.id]


def test_member_ids_of_an_ungrouped_bank_is_itself(app, tmp_path):
    from app.services import bank_groups

    with app.app_context():
        a = _bank(tmp_path, 'Solo', folder='a')
        assert bank_groups.member_ids('local', a.id) == [a.id]
        assert bank_groups.member_ids('local', 999999) == []


def test_groups_never_cross_users(app, tmp_path):
    from app.extensions import db
    from app.models import ImageBank
    from app.services import bank_groups

    with app.app_context():
        a = _bank(tmp_path, 'T', folder='a')
        b = _bank(tmp_path, 'T', folder='b')
        db.session.get(ImageBank, b.id).user_id = 'someone-else'
        db.session.commit()
        assert bank_groups.member_ids('local', a.id) == [a.id]


def test_the_lead_is_the_smallest_member_id(app, tmp_path):
    from app.services import bank_groups

    with app.app_context():
        ids = [_bank(tmp_path, 'T', folder=f'x{i}').id for i in range(3)]
        assert bank_groups.member_ids('local', ids[-1])[0] == min(ids)


# --- the column and its route -------------------------------------------------

def test_keep_separate_survives_a_rename_away_and_back(app, tmp_path):
    """It is a property of the BANK, not of the group. Auto-clearing it on
    rename would silently re-group a bank the user had explicitly separated."""
    from app.extensions import db
    from app.models import ImageBank
    from app.services import bank_groups

    with app.app_context():
        a = _bank(tmp_path, 'T', folder='a')
        _bank(tmp_path, 'T', folder='b')
        bank_groups.set_keep_separate('local', a.id, True)
        row = db.session.get(ImageBank, a.id)
        row.name = 'Elsewhere'
        db.session.commit()
        row.name = 'T'
        db.session.commit()
        assert db.session.get(ImageBank, a.id).keep_separate is True
        assert bank_groups.member_ids('local', a.id) == [a.id]


def test_existing_banks_read_as_grouping_normally(app, tmp_path):
    """The column is additive — NULL must mean "groups normally", never
    "separate", or every bank in an existing install would un-group on upgrade."""
    from app.extensions import db
    from app.services import bank_groups

    with app.app_context():
        a = _bank(tmp_path, 'T', folder='a')
        b = _bank(tmp_path, 'T', folder='b')
        # What a bank created before the migration actually holds.
        a.keep_separate = None
        b.keep_separate = None
        db.session.commit()
        assert bank_groups.build_groups([a, b]) == {'T': sorted([a.id, b.id])}
        assert bank_groups.member_ids('local', a.id) == sorted([a.id, b.id])


def test_the_list_publishes_keep_separate(app, tmp_path):
    from app.services import bank_groups, image_bank_service as banks

    with app.app_context():
        a = _bank(tmp_path, 'T', folder='a')
        bank_groups.set_keep_separate('local', a.id, True)
        row = next(b for b in banks.list_banks('local') if b['id'] == a.id)
        assert row['keep_separate'] is True


def test_the_route_toggles_it_both_ways(app, client, tmp_path):
    with app.app_context():
        bank_id = _bank(tmp_path, 'T', folder='a').id
    assert client.post(f'/api/bank/{bank_id}/keep-separate',
                       json={'keep_separate': True}).get_json() == {
        'ok': True, 'keep_separate': True}
    assert client.post(f'/api/bank/{bank_id}/keep-separate',
                       json={'keep_separate': False}).get_json() == {
        'ok': True, 'keep_separate': False}


def test_the_route_404s_an_unknown_bank(app, client):
    assert client.post('/api/bank/999999/keep-separate',
                       json={'keep_separate': True}).status_code == 404


# --- the group queue ----------------------------------------------------------

def test_queueing_a_group_queues_every_member_as_its_own_entry(app, client,
                                                               tmp_path,
                                                               monkeypatch):
    """A group card is a display device. Queueing it must produce one entry PER
    BANK — the worker still runs them one at a time."""
    from app.services import bank_queue

    monkeypatch.setattr(bank_queue, '_process_next', lambda _app: False)
    bank_queue.reset()
    with app.app_context():
        a = _bank(tmp_path, 'T', folder='a')
        b = _bank(tmp_path, 'T', folder='b')
        ids = sorted([a.id, b.id])
    r = client.post(f'/api/bank-group/{ids[0]}/queue', json={'steps': ['scan']})
    assert r.status_code == 202
    assert sorted(q['bank_id'] for q in r.get_json()['queued']) == ids
    with app.app_context():
        bank_queue.reset()


def test_the_group_queue_uses_the_SERVER_member_list(app, client, tmp_path,
                                                     monkeypatch):
    """Not a client-supplied one: a stale card would otherwise queue banks that
    no longer share a name."""
    from app.services import bank_queue

    monkeypatch.setattr(bank_queue, '_process_next', lambda _app: False)
    bank_queue.reset()
    with app.app_context():
        a = _bank(tmp_path, 'T', folder='a')
        _bank(tmp_path, 'Different', folder='b')
        lead = a.id
    r = client.post(f'/api/bank-group/{lead}/queue',
                    json={'steps': ['scan'], 'bank_ids': [1, 2, 3, 4, 5]})
    assert [q['bank_id'] for q in r.get_json()['queued']] == [lead]
    with app.app_context():
        bank_queue.reset()
