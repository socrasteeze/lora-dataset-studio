"""A pass clicked on its own must run where the picker says, like Launch all.

The gap: "Launch all → peer" moved five passes off this machine, while clicking
those same five individually kept every one of them on this card — and nothing
in the UI admitted the difference. Score and Faces had a fully wired backend
lane that nothing ever exercised; framing, watermark and caption had services
that accepted a device_id their routes never passed on.
"""
from __future__ import annotations

import json

import pytest

PEER = '4fa2b7c1-0000-4000-8000-0000000000d1'


@pytest.fixture()
def bank(client, tmp_path):
    from test_image_bank import _mkbank, flat
    bank_id, _src = _mkbank(client, tmp_path, {'a.jpg': flat()}, name='SOLO')
    return bank_id


def _peer(app, caps):
    from app.extensions import db
    from app.models import ClusterDevice
    with app.app_context():
        db.session.add(ClusterDevice(id=PEER, name='Spare box',
                                     auth_token_hash='x',
                                     capabilities=json.dumps(caps)))
        db.session.commit()


@pytest.mark.parametrize('route,step', [
    ('framing', 'framing'),
    ('watermark', 'watermark'),
    ('caption', 'caption'),
    ('score', 'score'),
    ('faces', 'faces'),
])
def test_the_route_forwards_the_device_to_the_pass(client, app, bank, monkeypatch,
                                                   route, step):
    from app.services import image_bank_service as svc
    seen = {}
    monkeypatch.setattr(svc, '_remote_pass_device', lambda d: bool(d))
    monkeypatch.setattr(svc, 'refuse_steps_for_device', lambda d, s: None)
    monkeypatch.setattr(svc.bank_jobs, 'start',
                        lambda *a, **k: seen.setdefault('label', k.get('device_label')))

    def _spy(name):
        def _fn(app_, user_id, bank_id, *a, **k):
            seen['device_id'] = k.get('device_id')
            return {'ok': True}
        return _fn

    monkeypatch.setattr(svc, f'start_{route}', _spy(route))
    r = client.post(f'/api/bank/{bank}/{route}', json={'device_id': PEER})
    assert r.status_code in (200, 202), r.get_json()
    assert seen.get('device_id') == PEER, (
        f'/{route} dropped the device — the pass ran on this machine while the '
        f'picker said otherwise')


def test_a_single_pass_is_refused_when_the_peer_cannot_do_it(client, app, bank):
    """The same refusal Launch all makes, at the same moment: while the user is
    still looking at the button, not an hour into a staged run."""
    _peer(app, {'bank_scoring': False, 'ollama': True})
    r = client.post(f'/api/bank/{bank}/score', json={'device_id': PEER})
    assert r.status_code == 400, r.get_json()
    assert 'bank-scoring' in (r.get_json() or {}).get('error', '')


def test_the_same_peer_still_takes_a_pass_it_can_do(client, app, bank, monkeypatch):
    from app.services import image_bank_service as svc
    _peer(app, {'bank_scoring': False, 'ollama': True})
    seen = {}
    monkeypatch.setattr(svc, '_framing_job',
                        lambda *a, **k: (lambda job: seen.setdefault('ran', True)))
    r = client.post(f'/api/bank/{bank}/framing', json={'device_id': PEER})
    assert r.status_code == 202, r.get_json()
