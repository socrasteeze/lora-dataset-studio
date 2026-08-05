"""One function answers "can this machine run this pass?".

The rule used to live in three places: a hardcoded copy of the capability map
in `passDeviceGate.js`, `refuse_steps_for_device` at enqueue, and
`_check_peer_capability` at run time. LDS shipped the resulting bug in BOTH
directions on the same day — a peer reporting no scoring stack got Score ticked
for the user, and hours earlier the vision passes were gated on the HUB's Ollama
long after they had learned to travel.

The sibling dataset-manager project states why one function matters:

    "a picker that offers a machine the submit route would refuse is worse than
    no picker, because it turns a clear 'you cannot' into a job that fails a
    minute later on someone else's screen."

What these tests pin:

  * the precedence, so the same machine never reports two reasons on two screens;
  * that silence from a peer is a warning and never a wall;
  * that a local-only pass is refused for a peer by BOTH launch paths — the
    queue path never checked that at all before this moved into one function,
    so 🔖 Tags queued to a peer was accepted and only discovered on the other
    machine, an hour into an overnight run.
"""
import pytest

from app.services import bank_remote


@pytest.fixture
def peer_device(app):
    """A registered peer whose capability blob the test controls."""
    from app import config as cfg
    from app.services import cluster as cluster_svc

    def _make(blob):
        with app.app_context():
            cfg.save_config({'cluster': {'role': 'primary'}})
            minted = cluster_svc.mint_join_token()
            redeemed = cluster_svc.redeem_join_token(minted['token'], name='G18')
            device_id = redeemed['device_id']
            if blob is not None:
                from app.models import ClusterDevice
                row = ClusterDevice.query.filter_by(id=device_id).first()
                import json as _json
                row.capabilities = _json.dumps(blob)
                from app.extensions import db
                db.session.commit()
        return device_id

    return _make


def test_local_is_always_allowed(app):
    """This function answers the REMOTE question only; what is installed here is
    a different question the dialog still answers locally."""
    with app.app_context():
        for device_id in (None, '', 'local'):
            v = bank_remote.device_pass_gate(device_id, 'score')
            assert v['ok'] is True and v['blocked'] is False


def test_an_explicit_false_blocks_and_names_the_missing_stack(app, peer_device):
    device_id = peer_device({'bank_scoring': False})
    with app.app_context():
        v = bank_remote.device_pass_gate(device_id, 'score')
    assert v['blocked'] is True
    assert v['ok'] is False
    assert 'bank-scoring' in v['reason']
    assert 'G18' in v['reason']


def test_silence_warns_and_never_blocks(app, peer_device):
    """A peer that has never checked in reports nothing. Being unable to
    describe yourself is not the same as being unable to do the work — and the
    hub would run that job happily, so the picker must not pretend otherwise."""
    device_id = peer_device({})
    with app.app_context():
        v = bank_remote.device_pass_gate(device_id, 'framing')
    assert v['blocked'] is False
    assert v['ok'] is True
    assert 'reported' in v['warn']


def test_captions_need_only_one_engine(app, peer_device):
    for blob in ({'joycaption': True, 'ollama': False},
                 {'joycaption': False, 'ollama': True}):
        device_id = peer_device(blob)
        with app.app_context():
            assert bank_remote.device_pass_gate(device_id, 'caption')['blocked'] is False

    device_id = peer_device({'joycaption': False, 'ollama': False})
    with app.app_context():
        v = bank_remote.device_pass_gate(device_id, 'caption')
    assert v['blocked'] is True, 'a peer with neither engine cannot caption at all'


def test_an_ungated_step_is_allowed(app, peer_device):
    """scan / auto_reject read the hub's database. A device cannot block work it
    never receives, and inventing a refusal for them would disable real work."""
    device_id = peer_device({'bank_scoring': False, 'ollama': False})
    with app.app_context():
        for step in ('scan', 'auto_reject'):
            assert bank_remote.device_pass_gate(device_id, step)['blocked'] is False


def test_a_local_only_pass_is_blocked_whatever_the_peer_reports(app, peer_device):
    """Opposite polarity to the capability gate, on purpose: no peer advertises
    the tagger at all, so a permissive rule would wave every one of them
    through."""
    device_id = peer_device({'wd14': True, 'bank_scoring': True})
    with app.app_context():
        v = bank_remote.device_pass_gate(device_id, 'tags')
    assert v['blocked'] is True
    assert 'only runs on this machine' in v['reason']


def test_local_only_outranks_a_capability_refusal(app, peer_device):
    """Precedence: 'it never leaves this machine' is a truer answer than 'you
    are missing a stack', and a machine must not report two different reasons on
    two different screens."""
    device_id = peer_device({'wd14': False})
    with app.app_context():
        v = bank_remote.device_pass_gate(device_id, 'tags')
    assert 'only runs on this machine' in v['reason']


def test_the_queue_path_refuses_a_local_only_pass_on_a_peer(app, peer_device):
    """The regression this whole change found.

    `start_pipeline` checked LOCAL_ONLY_STEPS inline, and `bank_queue.enqueue`
    did not — it called `refuse_steps_for_device`, which knew nothing about
    them. So queueing 🔖 Tags to a peer was accepted, and the pass only failed
    on the other machine. The spec claimed both paths "refuse identically";
    they did not.
    """
    from app.services import image_bank_service as banks

    device_id = peer_device({'bank_scoring': True})
    with app.app_context():
        with pytest.raises(ValueError) as excinfo:
            banks.refuse_steps_for_device(device_id, ['tags'])
    assert 'only runs on this machine' in str(excinfo.value)


def test_a_clean_peer_passes_the_launch_check(app, peer_device):
    """The counter-proof: the refusal is about what is missing, not about being
    remote."""
    from app.services import image_bank_service as banks

    device_id = peer_device({'bank_scoring': True, 'face_scoring': True})
    with app.app_context():
        banks.refuse_steps_for_device(device_id, ['score', 'faces', 'scan'])


def test_verdicts_cover_every_gated_step(app, peer_device):
    """The picker renders whatever this returns, so a step missing from it is a
    step the dialog silently stops gating."""
    from app.services.image_bank_service import LOCAL_ONLY_STEPS

    device_id = peer_device({'bank_scoring': False})
    with app.app_context():
        verdicts = bank_remote.device_pass_verdicts(device_id)

    for step in bank_remote.PASS_PEER_CAPS:
        assert step in verdicts
    for step in LOCAL_ONLY_STEPS:
        assert step in verdicts
    assert verdicts['score']['blocked'] is True
