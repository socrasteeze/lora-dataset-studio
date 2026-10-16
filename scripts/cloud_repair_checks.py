"""Cloud-only bounded regression qualification. This helper never lands."""
import os
from pathlib import Path
import subprocess
import sys


def main():
    if os.environ.get('GITHUB_ACTIONS') != 'true':
        raise RuntimeError('Run this helper only on a hosted validation runner.')
    root = Path(__file__).resolve().parents[1]
    scratch = Path(os.environ['RUNNER_TEMP']) / 'lds-repair'
    scratch.mkdir(parents=True, exist_ok=True)
    reports = root / '.git' / 'lds-gates-validation'
    reports.mkdir(parents=True, exist_ok=True)
    env = dict(os.environ)
    for key in ('LDS_PROFILE_ID', 'LDS_PROFILE_NAME', 'LDS_PROFILE_PORT',
                'LDS_PLUGIN_DISTRIBUTION', 'LDS_BUNDLED_DIR', 'LDS_PLUGIN_BUILD_MODE',
                'LDS_PLUGINS', 'LDS_EXTENSIONS'):
        env.pop(key, None)
    for key, name in (
        ('LDS_DATA_DIR', 'data'), ('LDS_CONFIG', 'config.json'), ('LDS_ENV', '.env'),
        ('LDS_PLUGINS_DIR', 'plugins'), ('LDS_EXTENSIONS_DIR', 'extensions'),
        ('LDS_PROFILES_HOME', 'profiles'),
    ):
        env[key] = str(scratch / name)
    env.update(OMP_NUM_THREADS='1', MKL_NUM_THREADS='1', OPENBLAS_NUM_THREADS='1',
               CUDA_VISIBLE_DEVICES='', HF_HUB_OFFLINE='1', TRANSFORMERS_OFFLINE='1')
    modules = (root / 'scripts' / 'repair-check-modules.txt').read_text().splitlines()
    args = [sys.executable, '-X', 'utf8', '-m', 'pytest', *modules,
            '-q', '-rf', '-n', '4', '--dist', 'loadfile', '--durations=15',
            '--basetemp', str(scratch / 'pytest'),
            '--junitxml', str(reports / 'repair-backend.xml')]
    sys.exit(subprocess.run(args, cwd=root, env=env).returncode)


if __name__ == '__main__':
    main()
