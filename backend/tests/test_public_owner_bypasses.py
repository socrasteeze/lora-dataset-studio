"""The remaining core entry points must admit their active product first."""
from types import SimpleNamespace
import pytest

from test_public_backend_mount import factory  # noqa: F401
from app import config as cfg


@pytest.mark.parametrize('engine,pid', [('klein', 'image_upscale'), ('seedvr2', 'seedvr2')])
def test_on_restoration_calls_registered_provider_and_closes_pending_disable(factory, engine, pid):
    from app.services import face_dataset_service as fds
    from app.plugins.restoration import RestoreUnavailable
    app = factory({pid})
    calls = []
    spec = app.extensions['lds_plugins'].restore_engines[engine]
    spec['preflight'] = lambda: calls.append('preflight')
    spec['enqueue'] = lambda **kwargs: calls.append(kwargs) or 'fake-job'
    if spec['profile']:
        spec['profile'] = lambda model: {'klein_model': model, 'sampler_steps': 4}
    with app.app_context():
        assert fds.resolve_improve_engine(engine) == engine
        fds._improve_preflight(engine)
        result = fds._enqueue_improve(engine, user_id='local', source=SimpleNamespace(filename='fixture.png'),
                                    source_path='fixture.png', prompt='fixture', label='fixture', dataset=None,
                                    extra_metadata={'fixture': True})
        assert result == 'fake-job' and calls[0] == 'preflight'
        assert calls[1]['source_filename'] == 'fixture.png'
        assert calls[1]['extra_metadata'] == {'fixture': True}
        assert ('prompt' in calls[1]) == (engine == 'klein')
        cfg.save_config({'plugins': {'enabled': {pid: False}}})
        with pytest.raises(RestoreUnavailable):
            fds.resolve_improve_engine(engine)
        with pytest.raises(RestoreUnavailable):
            fds._improve_preflight(engine)
        with pytest.raises(RestoreUnavailable):
            fds._enqueue_improve(engine, user_id='local',
                                 source=SimpleNamespace(filename='fixture.png'),
                                 source_path='fixture.png', prompt='fixture',
                                 label='fixture', dataset=None,
                                 extra_metadata={'fixture': True})
        assert len(calls) == 2
