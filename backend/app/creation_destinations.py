"""Installation policy and stable names for newly created Datasets."""
from __future__ import annotations

import json
import os
import re
from pathlib import Path


def default_policy_path() -> Path:
    return Path(__file__).resolve().parents[2] / 'dataset-destinations.json'


def policy_path() -> Path:
    """Resolve on each call. ``LDS_DATASET_DESTINATIONS`` overrides the repo file."""
    override = os.environ.get('LDS_DATASET_DESTINATIONS', '').strip()
    if override:
        return Path(override)
    return POLICY_PATH


# Tests may replace this when the environment override is unset.
POLICY_PATH = default_policy_path()


def destination(kind: str) -> Path | None:
    """Resolve without creating folders. A broken policy must never fall back."""
    if kind not in ('datasets', 'video_datasets'):
        raise ValueError('Unknown creation destination.')
    try:
        raw = policy_path().read_text(encoding='utf-8')
    except FileNotFoundError:
        return None
    except OSError as exc:
        raise ValueError('Cannot read dataset-destinations.json. Repair it before creating a Dataset.') from exc
    try:
        settings = json.loads(raw)
        value = settings['root']
        if not isinstance(value, str) or not value.strip():
            raise ValueError
        root = Path(value.strip()).expanduser()
        if not root.is_absolute() or root.parent == root:
            raise ValueError
    except (ValueError, TypeError, KeyError) as exc:
        raise ValueError('Set an absolute folder root in dataset-destinations.json before creating a Dataset.') from exc
    target = root / 'LDS'
    if target.resolve().parent != root.resolve():
        raise ValueError('The Dataset app folder leaves its configured root. Remove the redirected folder.')
    return target


MAX_DATASET_ID = 2**63 - 1
CATEGORY_PREFIXES = {'character': 'CHAR', 'style': 'STYL', 'miscellaneous': 'MISC'}


def normalize_category(value, *, default='miscellaneous') -> str:
    """A folder label, independent of caption and training semantics."""
    if value is None:
        value = default
    if not isinstance(value, str) or value.strip().lower() not in CATEGORY_PREFIXES:
        raise ValueError('Choose Character, Style or Miscellaneous for the folder category.')
    return value.strip().lower()


def folder_name(name: str, category: str, app: str, number: int) -> str:
    """Create one portable basename; its identity suffix is never truncated."""
    import unicodedata

    category = normalize_category(category)
    if app not in ('LDS', 'DSM') or type(number) is not int or not 1 <= number <= MAX_DATASET_ID:
        raise ValueError('Invalid Dataset folder identity.')
    ascii_name = unicodedata.normalize('NFKD', str(name or '')).encode('ascii', 'ignore').decode('ascii')
    words = re.findall(r'[A-Z0-9]+', ascii_name.upper())
    description = '-'.join(word[:4] for word in words) or 'DATA'
    suffix = f'_{app}{number:04d}'
    description = description[:64 - 5 - len(suffix)].rstrip('-') or 'DATA'
    return f'{CATEGORY_PREFIXES[category]}-{description}{suffix}'


def folder_number(name: str, app: str) -> int | None:
    """Read the immutable suffix, including earlier bare app-number folders."""
    if app not in ('LDS', 'DSM'):
        raise ValueError('Invalid Dataset app.')
    match = re.fullmatch(rf'(?:(?:CHAR|STYL|MISC)-[A-Z0-9]+(?:-[A-Z0-9]+)*_)?{app}([0-9]+)',
                         name, re.IGNORECASE)
    return int(match.group(1)) if match else None


ALLOCATION_STATE = '.dataset-folders.json'
ALLOCATION_LOCK = '.dataset-folders.lock'


def is_flat_root(root) -> bool:
    """Recognize earlier allocation roots even after the policy changes."""
    root = Path(root).resolve()
    if (root / ALLOCATION_STATE).is_file():
        return True
    try:
        configured = destination('datasets')
    except ValueError:
        return False
    return configured is not None and configured.resolve() == root


def dataset_namespace_conflict(folder, root) -> bool:
    """Guard Dataset namespaces, allowing separate Bank folders in the root."""
    folder, root = Path(folder).resolve(), Path(root).resolve()
    if root == folder or root.is_relative_to(folder):
        return True
    if not folder.is_relative_to(root):
        return False
    first = folder.relative_to(root).parts[0]
    return (any(folder_number(first, app) is not None for app in ('LDS', 'DSM'))
            or re.fullmatch(r'[0-9]+(?:__.*)?', first) is not None)


def reserve_folder(root: Path, prefix: str, *, name: str = '', category: str = 'miscellaneous', minimum: int = 1) -> tuple[int, Path]:
    """Reserve a monotonic direct child across profiles, processes and apps.

    The ledger is durable before mkdir. Gaps are deliberate: a failed create
    must never let another catalog reuse a previously assigned folder name.
    A leftover lock after interruption fails closed and needs operator review.
    """
    import tempfile

    if prefix not in ('LDS', 'DSM') or type(minimum) is not int or not 1 <= minimum <= MAX_DATASET_ID:
        raise ValueError('Invalid Dataset folder allocation.')
    category = normalize_category(category)
    root = Path(root)
    root.mkdir(parents=True, exist_ok=True)
    lock = root / ALLOCATION_LOCK
    try:
        descriptor = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError as exc:
        raise ValueError('A folder allocation is pending. Retry after it finishes; an interrupted allocation needs review.') from exc
    temporary = None
    try:
        os.close(descriptor)
        state_path = root / ALLOCATION_STATE
        try:
            state = json.loads(state_path.read_text(encoding='utf-8'))
        except FileNotFoundError:
            state = {'version': 1, 'last': {}}
        except (OSError, ValueError) as exc:
            raise ValueError('Cannot read the Dataset allocation record. Creation stopped.') from exc
        if (not isinstance(state, dict) or state.get('version') != 1
                or not isinstance(state.get('last'), dict)
                or any(key not in ('LDS', 'DSM', 'LDSB') or type(value) is not int or value < 0
                       for key, value in state['last'].items())):
            raise ValueError('Invalid Dataset allocation record. Creation stopped.')
        occupied = state['last'].get(prefix, 0)
        legacy = re.compile(r'([0-9]+)(?:__.*)?$')
        for child in root.iterdir():
            number = folder_number(child.name, prefix)
            match = legacy.fullmatch(child.name)
            if number is not None or match:
                occupied = max(occupied, number if number is not None else int(match.group(1)))
        number = max(minimum, occupied + 1)
        while True:
            if number > MAX_DATASET_ID:
                raise ValueError('No Dataset folder numbers remain in this destination.')
            state['last'][prefix] = number
            with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=root,
                                             prefix='.dataset-folders-', suffix='.tmp', delete=False) as stream:
                temporary = Path(stream.name)
                json.dump(state, stream)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, state_path)
            temporary = None
            folder = root / folder_name(name, category, prefix, number)
            try:
                folder.mkdir()
            except FileExistsError:
                number += 1
                continue
            return number, folder
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
        lock.unlink(missing_ok=True)
