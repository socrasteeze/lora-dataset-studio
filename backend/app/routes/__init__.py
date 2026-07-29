def register_blueprints(app, csrf):
    from importlib import import_module
    for name in ('settings', 'datasets', 'training', 'studio', 'setup', 'scrape',
                 'ollama', 'backup', 'bank', 'system', 'cluster'):
        try:
            mod = import_module(f'app.routes.{name}')
        except ImportError:
            continue  # blueprint not built yet (earlier phases)
        app.register_blueprint(mod.bp)
        # Peer machine-to-machine routes use bearer auth, not browser CSRF.
        if name == 'cluster' and hasattr(mod, 'bp'):
            # Individual @csrf.exempt on peer views; nothing else to do here.
            pass
