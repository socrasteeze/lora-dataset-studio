"""Check the built fork's real startup and plugin discovery using scratch state."""
from __future__ import annotations

import json
import os
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]


def main():
    if not os.environ.get('LDS_SYNC_SCRATCH'):
        raise RuntimeError('Run this check through upstream_sync.ps1 with isolated scratch state.')
    scratch = Path(os.environ['LDS_SYNC_SCRATCH']).resolve()
    for key in ('LDS_DATA_DIR', 'LDS_CONFIG', 'LDS_ENV'):
        value = os.environ.get(key)
        if not value or not Path(value).resolve().is_relative_to(scratch):
            raise RuntimeError(f'{key} must point to disposable state before this smoke check runs.')
    sys.path.insert(0, str(ROOT / 'backend'))
    from app import create_app
    from app.extensions import db

    marker = json.loads((ROOT / 'frontend/dist/plugin-build.json').read_text(encoding='utf-8'))
    policy = json.loads((ROOT / 'fork-plugins.json').read_text(encoding='utf-8'))
    if marker.get('distribution') != 'fork' or marker.get('plugins') != policy['enabled']:
        raise RuntimeError('Build the curated fork frontend before qualifying startup.')
    application = create_app({'TESTING': True, 'WTF_CSRF_ENABLED': False})
    try:
        client = application.test_client()
        response = client.get('/api/plugins/')
        if response.status_code != 200:
            raise RuntimeError(f'The frontend plugin discovery endpoint returned {response.status_code}.')
        records = application.extensions['lds_plugins'].records
        loaded = {pid for pid, record in records.items() if record.state == 'loaded'}
        expected = set(policy['enabled'])
        if set(records) != expected or loaded != expected:
            raise RuntimeError(f'Plugin startup differs from the build: loaded={sorted(loaded)}.')
        if client.get('/api/health').status_code != 200:
            raise RuntimeError('Health endpoint failed.')
        print(f'Built fork starts with all {len(expected)} curated plugins and working discovery.')
    finally:
        with application.app_context():
            db.session.remove()
            db.engine.dispose()


if __name__ == '__main__':
    main()
