#!/usr/bin/env bash
# Scan publishable working files with the repository's shared privacy rules.
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ -x .venv/Scripts/python.exe ]]; then
  interpreter=.venv/Scripts/python.exe
else
  interpreter=.venv/bin/python
fi
"$interpreter" -X utf8 - <<'PY'
from pathlib import Path
import subprocess
import sys

sys.path.insert(0, 'scripts')
import privacy_patterns

files = subprocess.check_output([
    'git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard',
]).decode('utf-8').split('\0')
findings = []
count = 0
for name in sorted(set(filter(None, files))):
    path = Path(name)
    if not path.is_file() or not privacy_patterns.is_scannable(name):
        continue
    count += 1
    for line, category, _value in privacy_patterns.scan_text(path.read_text(encoding='utf-8', errors='replace')):
        findings.append(f'{name}:{line}: {category}')
for finding in findings:
    print(finding)
print(f'Scanned {count} tracked and untracked text files; {len(findings)} privacy findings.')
sys.exit(bool(findings))
PY
