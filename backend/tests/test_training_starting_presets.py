"""Settings ▸ Training ▸ Defaults: the preset a new dataset starts on.

``training.starting_presets[family][kind]`` names a preset. A new dataset, or
one switched to the family before it has saved settings, starts on it; saved
settings are never replaced.
"""


def _create(client, train_type='anima', kind='character', name='Start', trigger='start_tok'):
    return client.post('/api/dataset/create', json={
        'name': name, 'trigger_word': trigger, 'train_type': train_type, 'kind': kind,
    }).get_json()['id']


def _map(app, table):
    from app import config as cfg
    with app.app_context():
        cfg.save_config({'training': {'starting_presets': table}})


def _settings(app, ds_id):
    with app.app_context():
        from app.services import lora_training as lt
        return lt.snapshot_train_settings('local', ds_id)


def _preset(preset_id):
    from app.services import lora_training as lt
    return next(p for p in lt.BUILTIN_TRAIN_PRESETS if p['id'] == preset_id)


def test_no_mapping_leaves_a_new_dataset_on_app_defaults(client, app):
    ds_id = _create(client)
    assert _settings(app, ds_id) == {}


def test_a_new_dataset_starts_on_its_family_preset(client, app):
    _map(app, {'anima': {'character': 'builtin-character-anima'}})
    ds_id = _create(client)
    assert _settings(app, ds_id) == _preset('builtin-character-anima')['settings']


def test_a_preset_for_another_kind_is_not_applied(client, app):
    _map(app, {'anima': {'character': 'builtin-concept-anima'}})
    ds_id = _create(client)
    assert _settings(app, ds_id) == {}


def test_switching_family_applies_it_only_without_saved_settings(client, app):
    _map(app, {'anima': {'character': 'builtin-character-anima'}})
    fresh = _create(client, train_type='zimage', name='Fresh', trigger='fresh_tok')
    assert client.post(f'/api/dataset/{fresh}/train-type',
                       json={'train_type': 'anima'}).status_code == 200
    assert _settings(app, fresh) == _preset('builtin-character-anima')['settings']

    tuned = _create(client, train_type='anima', name='Tuned', trigger='tuned_tok')
    r = client.post(f'/api/dataset/{tuned}/train/presets/apply',
                    json={'settings': {'resolution': '768'}})
    assert r.status_code == 200
    assert client.post(f'/api/dataset/{tuned}/train-type',
                       json={'train_type': 'zimage'}).status_code == 200
    assert client.post(f'/api/dataset/{tuned}/train-type',
                       json={'train_type': 'anima'}).status_code == 200
    assert _settings(app, tuned) == {'resolution': '768'}
