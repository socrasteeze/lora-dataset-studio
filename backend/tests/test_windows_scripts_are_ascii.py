"""Windows shell scripts (.ps1/.bat/.cmd) and requirements*.txt stay ASCII-only.

WHY THIS FILE EXISTS (2026-07-30)
----------------------------------
`stop.bat` shipped and could not run at all — owner-reported, a wall of
PowerShell parse errors (`MissingEndCurlyBrace`, `The string is missing the
terminator: "`) the moment it was double-clicked. Root cause, confirmed byte
for byte:

  1. `scripts/stop_server.ps1` is UTF-8 WITHOUT a BOM.
  2. Windows PowerShell 5.1 (`#requires -Version 5.1`, which `stop.bat` invokes)
     decodes a BOM-less `.ps1` using the ANSI codepage — cp1252 on a US/EU
     Windows install, NOT UTF-8.
  3. An em-dash '—' is the UTF-8 bytes E2 80 94. Read as cp1252 those
     become 'a', a Euro sign, and U+201D RIGHT DOUBLE QUOTATION MARK.
  4. PowerShell accepts curly quotes as string delimiters. That U+201D
     appearing inside a double-quoted string CLOSES the string early, and
     everything after it on the line parses as code — breaking quote parity
     for the rest of the file and surfacing errors far from the real cause.

Three em-dashes sat inside live double-quoted strings; the parser never got
past them. Two OTHER scripts (`bootstrap_python.ps1`, `build_portable.ps1`)
carried the identical em-dash but only ever inside comments, so they merely
garbled their own help text and kept working — which is exactly why this
class of bug hides until the day a dash lands inside a string.

Nothing checked file encoding before this test. The fix is not a BOM: a BOM
is invisible state any editor/tool can silently strip with nothing to catch
the regression, and it cannot be used on `.bat` at all (cmd.exe may execute
the BOM bytes as part of line 1). ASCII is immune to every codepage and needs
no metadata to survive — which is already the convention every one of these
scripts uses for its OWN dashes ('--', never an em-dash) once you look.

requirements*.txt rides along on the SAME mechanism, not a new one:
CLAUDE.md already states "Requirements comments are also kept ASCII-only as a
second line of defence" — after a community-reported pip crash reading
requirements.txt under a GBK locale — but nothing enforced that either, and
`requirements-dev.txt` had since drifted.

SCOPE, deliberately narrow. This is not the retired emoji-free divergence
(FORK_NOTES Divergence 3) — that was about the APP UI, where emoji are used
AS controls and stripping them left real buttons rendering as empty boxes.
This rule never touches Python, JS or Markdown, and never touches emoji
anywhere: it is one property, ASCII, on the exact file classes a non-UTF-8
Windows codepage or a locale-sensitive pip actually reads.
"""
import subprocess
from pathlib import Path

import pytest

_REPO = Path(__file__).resolve().parents[2]

_SCANNED_SUFFIXES = ('.ps1', '.psm1', '.psd1', '.bat', '.cmd')


def _tracked_files():
    out = subprocess.run(['git', 'ls-files'], cwd=_REPO,
                         capture_output=True, text=True, timeout=60)
    if out.returncode != 0:
        pytest.skip('not a git checkout')
    for rel in out.stdout.splitlines():
        is_script = rel.endswith(_SCANNED_SUFFIXES)
        is_requirements = (rel.startswith('backend/requirements')
                          and rel.endswith('.txt'))
        if is_script or is_requirements:
            yield rel


def test_there_is_something_to_check():
    """A glob that matched nothing would make the assertion below pass for the
    wrong reason."""
    assert sum(1 for _ in _tracked_files()) >= 8


def test_windows_scripts_and_requirements_files_are_ascii_only():
    offenders = []
    for rel in _tracked_files():
        raw = (_REPO / rel).read_bytes()
        try:
            text = raw.decode('utf-8')
        except UnicodeDecodeError as e:
            offenders.append(f'{rel}: not even valid UTF-8 ({e})')
            continue
        for n, line in enumerate(text.splitlines(), 1):
            for ch in line:
                if ord(ch) > 127:
                    offenders.append(f'{rel}:{n}: U+{ord(ch):04X} {ch!r}')
                    break   # one hit per line is enough to locate and fix it
    assert not offenders, (
        'Non-ASCII byte(s) in a file Windows reads with its own default '
        'codepage (a BOM-less .ps1/.bat under PowerShell 5.1, or '
        'requirements*.txt under a non-UTF-8 pip locale — see this module\'s '
        'docstring for the exact mechanism that turned one em-dash into a '
        'script that could not parse at all). Replace with an ASCII '
        'equivalent (an em-dash -> "--") rather than adding a BOM: a BOM is '
        'invisible state that silently strips, and cannot be used on .bat at '
        'all.\n  ' + '\n  '.join(offenders))


@pytest.mark.parametrize('text,has_non_ascii', [
    ('Write-Info "left alone — LDS never launches it"', True),
    ('# bootstrap — fetch a self-contained CPython', True),
    ('Write-Info "left alone -- LDS never launches it"', False),
    ('echo [OK] Server is stopped -- goodbye', False),
])
def test_the_detector_itself(text, has_non_ascii):
    """A check that matched nothing would make the ban silently vacuous — the
    exact trap this file exists to close, so the detector gets its own test."""
    found = any(ord(ch) > 127 for ch in text)
    assert found is has_non_ascii
