def register_blueprints(app, csrf):
    from importlib import import_module
    # 'cluster' is fork-only (Divergence 6: peer/device training) and upstream's
    # list does not carry it — a union, never either side alone. 'extensions' is
    # upstream's; 'local_llm', 'video_studio', and 'video_live' are upstream's.
    # Upstream's 'civitai' blueprint is the publish lane this fork does not
    # carry: the Civitai key here is a scraping credential, and the publisher
    # wires itself into the cloud-key Setup screen Divergence 1 removed.
    # video_bank / video_datasets / video_studio are NOT here: the bundled `video`
    # plugin registers those three blueprints itself (bundled/video/lds_video
    # register_blueprint calls), and Flask refuses a second registration under the
    # same name -- every video test failed with "already registered for a different
    # blueprint" until core stopped claiming them. video_live has no plugin
    # counterpart and stays core. The modules under app/routes/ are kept: the
    # plugin imports its own copies, and deleting them is a separate decision.
    for name in ('settings', 'datasets', 'training', 'studio', 'video_live', 'setup',
                 'setup_state', 'scrape', 'ollama', 'local_llm', 'backup', 'bank',
                 'system', 'cluster', 'tools',
                 'extensions'):
        try:
            mod = import_module(f'app.routes.{name}')
        except ImportError:
            continue  # blueprint not built yet (earlier phases)
        app.register_blueprint(mod.bp)
