"""Read-only worktree cleanup preflight and Codex PreToolUse guard."""
import argparse
import ctypes
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import time


class CleanupBlocked(RuntimeError):
    pass


def linked(info):
    return stat.S_ISLNK(info.st_mode) or bool(
        getattr(info, 'st_file_attributes', 0) & getattr(stat, 'FILE_ATTRIBUTE_REPARSE_POINT', 0x400))


def check_worktree(value):
    """Reject incomplete inspections. Never follow a link or change a file."""
    deadline = time.monotonic() + 8
    if not isinstance(value, str) or not value or '\0' in value:
        raise CleanupBlocked('An absolute worktree path is required.')
    supplied = Path(value)
    if not supplied.is_absolute() or '..' in supplied.parts:
        raise CleanupBlocked('Use an absolute path without parent traversal.')
    root = Path(os.path.abspath(supplied))
    if os.name == 'nt':
        if str(root).startswith('\\\\') or ctypes.windll.kernel32.GetDriveTypeW(root.anchor) != 3:
            raise CleanupBlocked('Cleanup requires an inspectable local fixed drive.')
    for path in reversed((root, *root.parents)):
        if linked(path.lstat()):
            raise CleanupBlocked('The cleanup path or an ancestor is a filesystem link.')
    if not root.is_dir() or root.parent == root:
        raise CleanupBlocked('The cleanup target is not a worktree directory.')
    metadata = (root / '.git').lstat()
    if linked(metadata) or not stat.S_ISREG(metadata.st_mode):
        raise CleanupBlocked('The primary checkout or unregistered directory cannot be archived.')

    def git(*arguments):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise CleanupBlocked('The cleanup inspection exceeded its time budget.')
        process = subprocess.run(['git', '-C', str(root), 'rev-parse', *arguments],
                                 capture_output=True, text=True, encoding='utf-8',
                                 timeout=min(2, remaining), check=True,
                                 env={**os.environ, 'GIT_OPTIONAL_LOCKS': '0'},
                                 creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        return os.path.normcase(os.path.abspath(process.stdout.strip()))

    if git('--show-toplevel') != os.path.normcase(str(root)):
        raise CleanupBlocked('The cleanup target is not the registered worktree root.')
    git_dir = git('--absolute-git-dir')
    common_dir = git('--path-format=absolute', '--git-common-dir')
    if git_dir == common_dir or not Path(git_dir).is_relative_to(Path(common_dir) / 'worktrees'):
        raise CleanupBlocked('The cleanup target is not a linked Git worktree.')

    pending = [root]
    inspected = 0
    while pending:
        directory = pending.pop()
        if time.monotonic() >= deadline:
            raise CleanupBlocked('The cleanup inspection exceeded its time budget.')
        if linked(directory.lstat()):
            raise CleanupBlocked('A directory became a filesystem link during inspection.')
        with os.scandir(directory) as entries:
            for entry in entries:
                inspected += 1
                if inspected > 200_000 or time.monotonic() >= deadline:
                    raise CleanupBlocked('The tree is too large to inspect completely within the cleanup budget.')
                info = entry.stat(follow_symlinks=False)
                if linked(info):
                    raise CleanupBlocked('The worktree contains a symlink, junction or other reparse point.')
                if stat.S_ISDIR(info.st_mode):
                    if os.path.ismount(entry.path):
                        raise CleanupBlocked('The worktree contains a mounted directory.')
                    pending.append(Path(entry.path))
    return inspected


def inside_worktree(cwd):
    if not isinstance(cwd, str) or not Path(cwd).is_absolute():
        raise CleanupBlocked('The cleanup command has no inspectable working directory.')
    directory = Path(cwd)
    for parent in (directory, *directory.parents):
        metadata = parent / '.git'
        try:
            info = metadata.lstat()
        except FileNotFoundError:
            continue
        if linked(info):
            raise CleanupBlocked('The command uses linked Git metadata.')
        return stat.S_ISREG(info.st_mode)
    return False


def check_hook(payload):
    if not isinstance(payload, dict) or payload.get('hook_event_name') != 'PreToolUse':
        raise CleanupBlocked('The cleanup hook received an unsupported event.')
    tool = payload.get('tool_name', '')
    arguments = payload.get('tool_input')
    if not isinstance(tool, str) or not isinstance(arguments, dict):
        raise CleanupBlocked('The cleanup hook received unreadable tool arguments.')
    if tool == 'archive_worktree' or tool.endswith('__archive_worktree'):
        check_worktree(arguments.get('root'))
        return
    if tool not in ('Bash', 'exec_command', 'shell', 'shell_command') and not tool.endswith('__exec_command'):
        return
    command = arguments.get('command', arguments.get('cmd'))
    if not isinstance(command, str):
        raise CleanupBlocked('The shell command could not be inspected.')
    lowered = command.casefold()
    if re.search(r'\bgit(?:\.exe)?[^\r\n;|&]*\bworktree\s+(?:remove|prune)\b', lowered):
        raise CleanupBlocked('Raw worktree removal and pruning are blocked. Use the guarded archive tool.')
    deletion = re.search(r'(?:^|[;\n|&])\s*[\'\"]?(?:remove-item|rmdir|rd|rm)[\'\"]?(?:\s|$)|shutil\s*\.\s*rmtree\s*\(', lowered)
    linking = re.search(r'\bmklink\s+|\bnew-item\b[^;\n]*-itemtype\s+[\'\"]?(?:junction|symboliclink)\b|os\s*\.\s*symlink\s*\(|\bln\s+-[^\s]*s', lowered)
    if not deletion and not linking:
        return
    mentions_worktree = 'worktree' in lowered or inside_worktree(arguments.get('workdir') or payload.get('cwd'))
    if not mentions_worktree:
        return
    if deletion:
        raise CleanupBlocked('Raw deletion in a worktree is blocked. Preserve it and use the guarded archive tool.')
    if linking:
        raise CleanupBlocked('Filesystem links in disposable worktrees are blocked. Install independent dependencies.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--worktree', help='Inspect this actual worktree without modifying it.')
    mode.add_argument('--hook', action='store_true', help='Read a Codex PreToolUse event from stdin.')
    args = parser.parse_args()
    try:
        if args.hook:
            raw = sys.stdin.read(1_048_577)
            if len(raw) > 1_048_576:
                raise CleanupBlocked('The tool request exceeded the cleanup inspection limit.')
            check_hook(json.loads(raw))
        else:
            count = check_worktree(args.worktree)
            print(json.dumps({'cleanup_preflight': 'clear', 'entries_inspected': count,
                              'filesystem_changes': 0}))
    except CleanupBlocked as exc:
        print('Worktree cleanup denied: ' + str(exc), file=sys.stderr)
        return 2
    except BaseException:
        print('Worktree cleanup denied: the inspection did not complete. Preserve the worktree.', file=sys.stderr)
        return 2
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
