def register_blueprints(app, csrf):
    from importlib import import_module
    # 'cluster' is fork-only (Divergence 6: peer/device training) and upstream's
    # list does not carry it — a union, never either side alone.
    for name in ('settings', 'datasets', 'training', 'studio', 'setup', 'setup_state',
                 'scrape', 'ollama', 'backup', 'bank', 'video_bank', 'video_datasets',
                 'system', 'cluster', 'tools'):
        try:
            mod = import_module(f'app.routes.{name}')
        except ImportError:
            continue  # blueprint not built yet (earlier phases)
        app.register_blueprint(mod.bp)
