def register_blueprints(app, csrf):
    from importlib import import_module
    # 'cluster' is fork-only (Divergence 6: peer/device training) and upstream's
    # list does not carry it — a union, never either side alone. 'extensions' is
    # upstream's; 'local_llm', 'video_studio', and 'video_live' are upstream's.
    # Upstream's 'civitai' blueprint is the publish lane this fork does not
    # carry: the Civitai key here is a scraping credential, and the publisher
    # wires itself into the cloud-key Setup screen Divergence 1 removed.
    # video_bank / video_datasets / video_studio / video_live / scrape are NOT
    # here: their bundled plugins register those blueprints. Flask refuses a
    # second registration under the same name. The legacy modules remain for
    # compatibility imports while callers migrate to the owning plugin.
    for name in ('settings', 'datasets', 'training', 'studio', 'setup',
                 'setup_state', 'ollama', 'local_llm', 'backup', 'bank',
                 'system', 'cluster',
                 'extensions'):
        try:
            mod = import_module(f'app.routes.{name}')
        except ImportError:
            continue  # blueprint not built yet (earlier phases)
        app.register_blueprint(mod.bp)
    from ..plugins.routes import bp as plugins_bp
    app.register_blueprint(plugins_bp)
