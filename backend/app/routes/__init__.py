def register_blueprints(app, csrf):
    from importlib import import_module
    # 'cluster' is fork-only (Divergence 6: peer/device training) and upstream's
    # list does not carry it — a union, never either side alone. 'extensions' is
    # upstream's; 'local_llm' is upstream's; 'video_studio' is upstream's, new
    # this sync.
    for name in ('settings', 'datasets', 'training', 'studio', 'video_studio', 'setup',
                 'setup_state', 'scrape', 'ollama', 'local_llm', 'backup', 'bank',
                 'video_bank', 'video_datasets', 'system', 'cluster', 'tools',
                 'extensions'):
        try:
            mod = import_module(f'app.routes.{name}')
        except ImportError:
            continue  # blueprint not built yet (earlier phases)
        app.register_blueprint(mod.bp)
