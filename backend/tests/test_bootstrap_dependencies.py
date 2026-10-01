from pathlib import Path

import bootstrap_dependencies as bootstrap


# A real Pillow 12 Image.py: `mode` is a READ-ONLY property (no setter) -> any
# plugin still doing `self.mode = ...` raises "property 'mode' has no setter".
_READONLY_MODE_IMAGE = (
    "class Image:\n"
    "    @property\n"
    "    def mode(self) -> str:\n"
    "        return self._mode\n"
)
# A pre-10 Pillow Image.py: `mode` is an ordinary writable attribute, so a plugin
# assigning `self.mode = ...` is perfectly legitimate.
_WRITABLE_MODE_IMAGE = (
    "class Image:\n"
    "    def __init__(self):\n"
    "        self.mode = ''\n"
)


class _Distribution:
    def __init__(self, root: Path, version: str):
        self.root = root
        self.version = version

    def locate_file(self, relative):
        return self.root / relative


def _pillow(tmp_path, version, plugin_source, image_source=None):
    """Fake an installed Pillow tree. `image_source` writes PIL/Image.py so the
    file-based detector runs; omit it to exercise the metadata fallback (Image.py
    absent) that the historical tests rely on."""
    pil = tmp_path / 'PIL'
    pil.mkdir()
    (pil / 'PngImagePlugin.py').write_text(plugin_source, encoding='utf-8')
    if image_source is not None:
        (pil / 'Image.py').write_text(image_source, encoding='utf-8')
    return _Distribution(tmp_path, version)


# --- metadata-fallback path (no Image.py on disk) -------------------------------

def _flagged(tmp_path, version, plugin_source, image_source=None):
    dist = _pillow(tmp_path, version, plugin_source, image_source)
    found_version, plugins = bootstrap.incompatible_pillow_plugins(dist)
    return found_version, [path.name for path in plugins]


def test_coherent_pillow_12_is_not_flagged(tmp_path):
    version, plugins = _flagged(tmp_path, '12.2.0', 'self._mode = "P"\n')
    assert version == '12.2.0'
    assert plugins == []


def test_mixed_pillow_12_is_flagged_before_import(tmp_path):
    version, plugins = _flagged(tmp_path, '12.2.0', 'self.mode = "P"\n')
    assert version == '12.2.0'
    assert plugins == ['PngImagePlugin.py']


def test_legacy_pillow_can_legitimately_assign_mode(tmp_path):
    version, plugins = _flagged(tmp_path, '9.5.0', 'self.mode = "P"\n')
    assert version == '9.5.0'
    assert plugins == []


# --- file-based path (Image.py present) -----------------------------------------

def test_lying_metadata_mix_is_detected_by_file_inspection(tmp_path):
    """A partial downgrade leaves Image.py at 12 (read-only `mode`) while metadata
    reads 9.x and a plugin still assigns `self.mode`. The file check flags it."""
    version, plugins = _flagged(tmp_path, '9.5.0', 'self.mode = "P"\n',
                                image_source=_READONLY_MODE_IMAGE)
    assert version == '9.5.0'
    assert plugins == ['PngImagePlugin.py']


def test_coherent_pillow_12_with_real_image_py_is_not_flagged(tmp_path):
    """Read-only Image.py + a new-style plugin (`self._mode =`) is healthy."""
    version, plugins = _flagged(tmp_path, '12.2.0', 'self._mode = "P"\n',
                                image_source=_READONLY_MODE_IMAGE)
    assert version == '12.2.0'
    assert plugins == []


def test_writable_image_py_with_self_mode_plugin_is_fine(tmp_path):
    """A writable `mode` property means `self.mode =` is legitimate."""
    version, plugins = _flagged(tmp_path, '12.2.0', 'self.mode = "P"\n',
                                image_source=_WRITABLE_MODE_IMAGE)
    assert version == '12.2.0'
    assert plugins == []


def test_image_mode_readonly_detection_helper(tmp_path):
    pil = tmp_path / 'PIL'
    pil.mkdir()
    (pil / 'Image.py').write_text(_READONLY_MODE_IMAGE, encoding='utf-8')
    assert bootstrap._image_mode_is_readonly(pil) is True
    (pil / 'Image.py').write_text(_WRITABLE_MODE_IMAGE, encoding='utf-8')
    assert bootstrap._image_mode_is_readonly(pil) is False
    # a later Pillow that re-adds a setter must read as writable (no false repair)
    (pil / 'Image.py').write_text(
        _READONLY_MODE_IMAGE + "    @mode.setter\n    def mode(self, v):\n        self._mode = v\n",
        encoding='utf-8')
    assert bootstrap._image_mode_is_readonly(pil) is False
    # absent Image.py -> None (caller falls back to metadata)
    (pil / 'Image.py').unlink()
    assert bootstrap._image_mode_is_readonly(pil) is None


def test_pinned_pillow_version_is_readable():
    """The repair target is sourced from requirements.txt; prove it parses."""
    v = bootstrap._pinned_pillow_version()
    assert v and v[0].isdigit()


def test_mode_comparison_is_not_mistaken_for_assignment(tmp_path):
    """A healthy plugin is full of `self.mode == "P"` comparisons. Only a single
    `=` assignment is incompatible."""
    version, plugins = _flagged(
        tmp_path, '12.2.0',
        'if self.mode == "P":\n    rawmode = "L" if self.mode == "L" else "P"\n',
        image_source=_READONLY_MODE_IMAGE)
    assert version == '12.2.0'
    assert plugins == []


def test_real_installed_pillow_is_healthy():
    """Integration guard: the Pillow actually installed in this environment must NOT
    be flagged as mixed (catches the comparison-vs-assignment false positive against
    real plugin sources, not just synthetic ones)."""
    version, plugins = bootstrap.incompatible_pillow_plugins()
    assert version, 'Pillow is expected to be installed in the test env'
    assert plugins == [], f'healthy Pillow {version} was mis-flagged: {plugins}'
