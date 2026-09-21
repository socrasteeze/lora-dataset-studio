"""The distributed core is a committed snapshot, never a developer checkout."""
import importlib.util
import json
from pathlib import Path
import subprocess
import zipfile

import pytest

spec = importlib.util.spec_from_file_location(
    'release_bundle', Path(__file__).resolve().parents[2] / 'packaging/release_bundle.py')
bundle = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bundle)


def git(repo, *args, **kwargs):
    return subprocess.check_output(['git', '-C', str(repo), *args], **kwargs)


@pytest.fixture
def repository(tmp_path):
    repo = tmp_path / 'repo'
    repo.mkdir()
    git(repo, 'init', '-q')
    git(repo, 'config', 'user.name', 'lora-dataset-studio')
    git(repo, 'config', 'user.email', 'noreply@lora-dataset-studio.dev')
    files = {path: 'committed\n' for path in bundle.REQUIRED}
    files['fork-plugins.json'] = json.dumps({
        'enabled': list(bundle.CURATED_PLUGINS), 'held': ['held'], 'excluded': ['excluded'],
    })
    files['backend/app/version.py'] = "APP_VERSION = '2026.9.13'\n"
    files['backend/app/plugins/loader.py'] = 'host plugin loader\n'
    files['frontend/dist/assets/app.js'] = 'export const value = "committed";\n'
    for plugin_id in bundle.CURATED_PLUGINS:
        files[f'bundled/{plugin_id}/plugin.json'] = json.dumps({
            'id': plugin_id, 'frontend': 'frontend/index.js',
        })
        files[f'bundled/{plugin_id}/frontend/index.js'] = f'export default {{ id: "{plugin_id}" }};\n'
    files.update({path: 'local-only\n' for path in (
        'backend/extensions/private/__init__.py', 'backend/data/session.json',
        'backend/app/.env', 'backend/tests/test_private.py',
        'bundled/private/plugin.json', 'plugins/private/plugin.json', '.env',
        'store/keys/targets.pem', 'store/commerce.json', 'store/private/registry.json')})
    for name, body in files.items():
        destination = repo / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(body, encoding='utf-8')
    git(repo, 'add', '--', *files)
    git(repo, 'commit', '-q', '-m', 'Synthetic committed release')
    return repo


def test_zip_uses_exact_committed_bytes_and_excludes_local_products(repository, tmp_path):
    (repository / 'backend/app/version.py').write_text('uncommitted change', encoding='utf-8')
    (repository / 'backend/app/untracked.py').write_text('untracked source', encoding='utf-8')
    (repository / 'frontend/dist/assets/untracked.js').write_text('untracked build', encoding='utf-8')
    result = bundle.build(repository, tmp_path / 'out')
    with zipfile.ZipFile(result['archive']) as archive:
        members = {name.split('/', 1)[1]: archive.read(name) for name in archive.namelist()}
    assert members['backend/app/version.py'] == b"APP_VERSION = '2026.9.13'\n"
    assert members['backend/app/plugins/loader.py'] == b'host plugin loader\n'
    assert members['frontend/dist/assets/app.js'] == b'export const value = "committed";\n'
    assert {name for name in members if name.startswith('store/')} == bundle.PUBLIC_STORE_FILES
    assert all(members[name] == b'committed\n' for name in bundle.PUBLIC_STORE_FILES)
    assert not any(b'local-only' in content or b'untracked' in content for content in members.values())
    info = json.loads(members['build_info.json'])
    assert info['commit'] == git(repository, 'rev-parse', 'HEAD').decode().strip()
    assert result['plugins_included'] == len(bundle.CURATED_PLUGINS)
    assert {name.split('/')[1] for name in members if name.startswith('bundled/')} == set(bundle.CURATED_PLUGINS)
    assert 'bundled/private/plugin.json' not in members


def test_curated_plugin_payload_keeps_runtime_resources(repository, tmp_path):
    wheel = repository / 'bundled' / 'seedvr2' / 'resources' / 'wheels' / 'fixture.whl'
    workflow = repository / 'bundled' / 'camera_angles' / 'workflows' / 'fixture.json'
    test_file = repository / 'bundled' / 'video' / 'tests' / 'test_fixture.py'
    for path, body in ((wheel, b'wheel'), (workflow, b'{}'), (test_file, b'not shipped')):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(body)
    git(repository, 'add', '--', wheel.relative_to(repository), workflow.relative_to(repository),
        test_file.relative_to(repository))
    git(repository, 'commit', '-q', '-m', 'Add synthetic plugin resources')
    result = bundle.build(repository, tmp_path / 'out')
    with zipfile.ZipFile(result['archive']) as archive:
        names = {name.split('/', 1)[1] for name in archive.namelist()}
    assert wheel.relative_to(repository).as_posix() in names
    assert workflow.relative_to(repository).as_posix() in names
    assert test_file.relative_to(repository).as_posix() not in names


@pytest.mark.parametrize('path', [
    'bundled/video/runtime.db',
    'bundled/video/tool.exe',
    'bundled/video/archive.zip',
    'bundled/video/cache.pyc',
    'bundled/video/.env',
    'bundled/video/production.env',
    'bundled/video/private.key',
    'bundled/video/private.pem',
    'bundled/video/private.p12',
    'bundled/video/private.pfx',
])
def test_curated_plugin_payload_rejects_runtime_residue(repository, tmp_path, path):
    file = repository / path
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_bytes(b'private runtime residue')
    git(repository, 'add', '--', path)
    git(repository, 'commit', '-q', '-m', 'Add rejected plugin residue')
    result = bundle.build(repository, tmp_path / 'out')
    with zipfile.ZipFile(result['archive']) as archive:
        assert path not in {name.split('/', 1)[1] for name in archive.namelist()}


def test_build_uses_the_selected_committed_policy_not_the_worktree_policy(repository, tmp_path):
    committed = json.loads((repository / 'fork-plugins.json').read_text(encoding='utf-8'))
    (repository / 'fork-plugins.json').write_text(json.dumps({
        **committed, 'enabled': ['unreviewed'],
    }), encoding='utf-8')
    result = bundle.build(repository, tmp_path / 'out')
    with zipfile.ZipFile(result['archive']) as archive:
        members = {name.split('/', 1)[1] for name in archive.namelist()}
    assert 'bundled/video/plugin.json' in members
    assert 'bundled/unreviewed/plugin.json' not in members


def test_destination_cannot_escape_or_replace_an_archive(repository, tmp_path):
    for name in ('../escape', 'nested/name', 'nested\\name', 'x:y', '..', 'name.'):
        with pytest.raises(ValueError, match='simple archive name'):
            bundle.build(repository, tmp_path / 'out', name=name)
    result = bundle.build(repository, tmp_path / 'out')
    original = Path(result['archive']).read_bytes()
    with pytest.raises(ValueError, match='already exists'):
        bundle.build(repository, tmp_path / 'out')
    assert Path(result['archive']).read_bytes() == original
    assert not (tmp_path / 'escape.zip').exists()


def test_a_tracked_runtime_symlink_cannot_read_an_external_target(repository, tmp_path):
    oid = git(repository, 'hash-object', '-w', '--stdin', input=b'../../external.py').decode().strip()
    git(repository, 'update-index', '--add', '--cacheinfo', f'120000,{oid},backend/app/link.py')
    git(repository, 'commit', '-q', '-m', 'Synthetic runtime link')
    with pytest.raises(ValueError, match='regular files'):
        bundle.build(repository, tmp_path / 'out')
    assert not (tmp_path / 'out').exists()


def test_inherited_git_context_cannot_select_another_repository(repository, tmp_path, monkeypatch):
    expected = git(repository, 'rev-parse', 'HEAD').decode().strip()
    other = tmp_path / 'other'
    other.mkdir()
    git(other, 'init', '-q')
    git(other, 'config', 'user.name', 'lora-dataset-studio')
    git(other, 'config', 'user.email', 'noreply@lora-dataset-studio.dev')
    for name in bundle.REQUIRED:
        destination = other / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text('other committed tree\n', encoding='utf-8')
    (other / 'backend/app/version.py').write_text("APP_VERSION = 'private-tree'\n", encoding='utf-8')
    git(other, 'add', '--', *bundle.REQUIRED)
    git(other, 'commit', '-q', '-m', 'Synthetic other tree')
    monkeypatch.setenv('GIT_DIR', str(other / '.git'))
    monkeypatch.setenv('GIT_WORK_TREE', str(other))
    result = bundle.build(repository, tmp_path / 'out')
    assert result['commit'] == expected
    with zipfile.ZipFile(result['archive']) as archive:
        assert b'private-tree' not in archive.read('LoRA-Dataset-Studio-windows/backend/app/version.py')


@pytest.mark.parametrize('path', [
    'backend/app/BUNDLED/private/secret.py',
    'backend/app/Extensions/private/secret.py',
    'backend/app/transition-pack.zip',
])
def test_nested_products_and_archives_are_excluded_regardless_of_case(repository, tmp_path, path):
    file = repository / path
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text('private sentinel', encoding='utf-8')
    git(repository, 'add', '--', path)
    git(repository, 'commit', '-q', '-m', 'Synthetic excluded member')
    result = bundle.build(repository, tmp_path / 'out')
    with zipfile.ZipFile(result['archive']) as archive:
        assert not any(b'private sentinel' in archive.read(name) for name in archive.namelist())
