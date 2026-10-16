"""Cloud-only comparison of the current failure floor and changed test modules."""
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import xml.etree.ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]
BASE_SHA = '447864093bb46be53f8fa85c91d5b1d3dac3ea48'
MODULES = (
    'backend/tests/test_capabilities.py',
    'backend/tests/test_broken_interpreter_probe.py',
    'backend/tests/test_bank_dup_groups_identity.py',
    'backend/tests/test_gpu_window_close_race.py',
    'backend/tests/test_updater_history_rewrite.py',
    'backend/tests/test_dev_requirements_contract.py',
    'scripts/tests/test_gates_driver.py',
    'scripts/tests/test_migrate_to_v2.py',
    'backend/tests/test_suite_runtime_imports.py',
    'backend/tests/test_suite_queue_isolation.py',
    'backend/tests/test_bank_queue.py',
    'backend/tests/test_bank_queue_durable.py',
    'backend/tests/test_bank_queue_lanes.py',
    'backend/tests/test_bank_queue_device.py',
    'backend/tests/test_bank_queue_workspace.py',
    'backend/tests/test_bank_queue_direct_work.py',
    'backend/tests/test_bank_queue_all.py',
)


def main():
    if os.environ.get('GITHUB_ACTIONS') != 'true':
        raise RuntimeError('Run this diagnostic in the cloud workflow only.')
    scratch = Path('D:/lds-diag')
    scratch.mkdir(exist_ok=True)
    baseline = scratch / 'baseline'
    subprocess.run(['git', 'worktree', 'add', '--detach', str(baseline), BASE_SHA],
                   cwd=ROOT, check=True)
    reports = ROOT / '.git/lds-gates-validation/runtime-comparison'
    reports.mkdir(parents=True, exist_ok=True)
    selected = (ROOT / 'scripts/runtime-diagnostic-cases.txt').read_text().splitlines()
    results = {}
    outcomes = {}
    for label, source in (('baseline', baseline), ('optimized', ROOT)):
        state = scratch / label / 'isolated'
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
            env[key] = str(state / name)
        env.update(OMP_NUM_THREADS='1', MKL_NUM_THREADS='1', OPENBLAS_NUM_THREADS='1',
                   CUDA_VISIBLE_DEVICES='', HF_HUB_OFFLINE='1', TRANSFORMERS_OFFLINE='1')
        report = reports / f'{label}.xml'
        modules = [name for name in MODULES if (source / name).is_file()]
        arguments = [name for name in selected if name.split('::', 1)[0] not in modules] + modules
        arguments += ['-q', '-rf', '-n', '4', '--dist', 'loadfile', '--durations=20',
                      '--basetemp', str(state / 'tmp'), '--junitxml', str(report)]
        state.mkdir(parents=True, exist_ok=True)
        argument_file = state / 'arguments.json'
        argument_file.write_text(json.dumps(arguments), encoding='utf-8')
        # Read an argument file to stay below Windows' command-line length limit.
        boot = ('import json,sys,pytest; '
                'sys.exit(pytest.main(json.load(open(sys.argv[1],encoding="utf-8"))))')
        started = time.monotonic()
        run = subprocess.run([sys.executable, '-X', 'utf8', '-c', boot, str(argument_file)],
                             cwd=source, env=env)
        if run.returncode not in (0, 1):
            raise RuntimeError(f'{label} could not execute: exit {run.returncode}')
        cases = ET.parse(report).findall('.//testcase')
        outcomes[label] = {(c.attrib['classname'], c.attrib['name']):
                           ('failed' if c.find('failure') is not None or c.find('error') is not None
                            else 'skipped' if c.find('skipped') is not None else 'passed')
                           for c in cases}
        if len(outcomes[label]) != len(cases):
            raise RuntimeError('The diagnostic collected a duplicate test identifier.')
        results[label] = {
            'seconds': round(time.monotonic() - started, 2),
            'cases': len(cases), 'failed': sum(v == 'failed' for v in outcomes[label].values()),
            'skipped': sum(v == 'skipped' for v in outcomes[label].values()),
        }
    before, after = outcomes['baseline'], outcomes['optimized']
    new_failures = [key for key, result in after.items()
                    if result == 'failed' and before.get(key) != 'failed']
    new_skips = [key for key, result in after.items()
                 if result == 'skipped' and before.get(key) != 'skipped']
    missing = sorted(set(before) - set(after))
    receipt = {'baseline': BASE_SHA,
               'head': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
               'runs': results, 'new_failures': new_failures, 'new_skips': new_skips,
               'missing_cases': missing}
    (reports / 'comparison.json').write_text(json.dumps(receipt, indent=2), encoding='utf-8')
    print(json.dumps(receipt, indent=2), flush=True)
    if new_failures or new_skips or missing:
        raise RuntimeError('Comparison found a regression or missing coverage.')
    subprocess.run(['node', '--import', './scripts/registerSdk.mjs', '--test',
                    'tests/test-runner.test.mjs'], cwd=ROOT / 'frontend', check=True)


if __name__ == '__main__':
    main()
