"""Cache compatibility using synthetic data and optional installed ATK source.

LDS_TEST_AITK_ROOT enables installed-source checks. Cache methods run against
synthetic files; a separate CPU subprocess imports ATK and installs bridge
hooks. No model is loaded and no job or trainer is constructed.
"""

from __future__ import annotations

import ast
import copy
import itertools
import os
import subprocess
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from contextlib import nullcontext
from pathlib import Path
from types import MethodType, SimpleNamespace

import pytest

from test_aitoolkit_state_bridge import (
    _BucketDataset,
    _Trainer,
    _fake_setup_buckets,
    _fake_setup_epoch,
    _fake_source_tree,
    _identity,
    _requires_torch_runtime,
    runtime,
    torch,
)
from app.training_bridge.lds_aitk_bridge_contract import probe_aitoolkit_source
from app.training_bridge import lds_aitk_bridge_contract as bridge_contract


_CACHE_SOURCE = """
class LatentCachingMixin:
    def cache_latents_all_latents(self):
        to_disk = self.is_caching_latents_to_disk
        to_memory = self.is_caching_latents_to_memory
        num_workers = self.dataset_config.cache_latents_num_workers
        def _prep(prep_item):
            prep_latent_path = prep_item.get_latent_path(recalculate=True)
            if os.path.exists(prep_latent_path):
                cached_state_dict = None
                return prep_item, prep_latent_path, cached_state_dict, False
            prep_item.load_and_process_image()
            return prep_item, prep_latent_path, None, True
        executor = ThreadPoolExecutor(max_workers=num_workers)
        try:
            pending = deque()
            for queued_item in self.file_list:
                pending.append(executor.submit(_prep, queued_item))
            while pending:
                file_item, latent_path, cached_state_dict, needs_encode = pending.popleft().result()
                self._cache_one_latent(file_item, latent_path, cached_state_dict, needs_encode, to_disk, to_memory)
                file_item.is_latent_cached = True
        finally:
            executor.shutdown(wait=True, cancel_futures=True)

    def _cache_one_latent(self, file_item, latent_path, cached_state_dict, needs_encode, to_disk, to_memory):
        if not needs_encode:
            state_dict = cached_state_dict
        else:
            state_dict = self.sd.encode_images(file_item)
            meta = {}
            save_file(state_dict, latent_path, metadata=meta)

class TextEmbeddingCachingMixin:
    def cache_text_embeddings(self):
        for file_item in self.file_list:
            text_embedding_path = file_item.get_text_embedding_path(recalculate=True)
            encode_targets = [(text_embedding_path, file_item.caption)]
            encode_targets = [t for t in encode_targets if not os.path.exists(t[0])]
            if len(encode_targets) > 0:
                for path, caption in encode_targets:
                    prompt_embeds = self.sd.encode_prompt(caption)
                    prompt_embeds.save(path)
            file_item.is_text_embedding_cached = True
"""


def _modern_source_tree(root):
    _fake_source_tree(root)
    mixins = root / "toolkit/dataloader_mixins.py"
    old = mixins.read_text(encoding="utf-8")
    mixins.write_text(old[: old.index("    def cache_latents")] + _CACHE_SOURCE, encoding="utf-8")
    return root


def test_probe_accepts_threaded_latents_and_text_targets(tmp_path):
    report = probe_aitoolkit_source(_modern_source_tree(tmp_path))
    assert report["supported"], report["reasons"]
    assert report["text_cache_layout"] == "targets"


def test_probe_rejects_an_unknown_text_cache_variant(tmp_path):
    root = _modern_source_tree(tmp_path)
    mixins = root / "toolkit/dataloader_mixins.py"
    mixins.write_text(
        mixins.read_text(encoding="utf-8").replace(
            "encode_targets = [(text_embedding_path, file_item.caption)]",
            "encode_targets = [(text_embedding_path, file_item.caption)]\n"
            "            encode_targets.append((file_item.get_other_text_embedding_path(), file_item.caption))",
        ),
        encoding="utf-8",
    )
    report = probe_aitoolkit_source(root)
    assert not report["supported"]
    assert any("unrecognised text cache variants" in reason for reason in report["reasons"])


@pytest.mark.parametrize(
    "before,after",
    [
        ("if os.path.exists(prep_latent_path):", "if False:"),
        (
            "return prep_item, prep_latent_path, cached_state_dict, False",
            "return prep_item, prep_latent_path, cached_state_dict, True",
        ),
        ("executor.shutdown(wait=True, cancel_futures=True)", "executor.shutdown(wait=False)"),
        ("if not needs_encode:", "if needs_encode:"),
        ("if not os.path.exists(t[0])", "if os.path.exists(t[0])"),
        ("if len(encode_targets) > 0:", "if True:"),
    ],
)
def test_probe_rejects_unsafe_cache_changes(tmp_path, before, after):
    root = _modern_source_tree(tmp_path)
    mixins = root / "toolkit/dataloader_mixins.py"
    mixins.write_text(mixins.read_text(encoding="utf-8").replace(before, after), encoding="utf-8")
    report = probe_aitoolkit_source(root)
    assert not report["supported"]
    assert any("cache lookup order" in reason for reason in report["reasons"])


def _installed_source():
    root = os.environ.get("LDS_TEST_AITK_ROOT")
    if not root:
        pytest.skip("set LDS_TEST_AITK_ROOT for installed-source compatibility")
    return Path(root)


def test_installed_atk_source_is_supported():
    report = probe_aitoolkit_source(_installed_source())
    assert report["supported"], report["reasons"]
    assert report["text_cache_layout"] == "targets"


def test_installed_atk_interpreter_can_install_bridge_without_a_job(tmp_path):
    root = _installed_source()
    candidates = [
        root / folder / suffix for folder in ("venv", ".venv") for suffix in ("Scripts/python.exe", "bin/python")
    ]
    python = next((path for path in candidates if path.is_file()), None)
    assert python is not None, "installed ATK must have its own test interpreter"
    bridge_dir = Path(__file__).resolve().parents[1] / "app/training_bridge"
    child_env = {key: value for key, value in os.environ.items() if not key.startswith("LDS_AITK_")}
    child_env.update(
        {
            "LDS_TEST_BRIDGE_DIR": str(bridge_dir),
            "LDS_AITK_ROOT": str(root),
            "LDS_AITK_BRIDGE_PROTOCOL": str(bridge_contract.BRIDGE_PROTOCOL),
            "CUDA_VISIBLE_DEVICES": "-1",
            "ACCELERATE_USE_CPU": "1",
            "HF_HOME": str(tmp_path / "hf"),
            "HF_HUB_OFFLINE": "1",
            "TRANSFORMERS_OFFLINE": "1",
            "HF_HUB_DISABLE_TELEMETRY": "1",
            "NO_ALBUMENTATIONS_UPDATE": "1",
            "PYTHONDONTWRITEBYTECODE": "1",
        }
    )
    script = """
import os
import sys
sys.path[:0] = [os.environ["LDS_TEST_BRIDGE_DIR"], os.environ["LDS_AITK_ROOT"]]
import lds_aitk_bridge_runtime as bridge
report = bridge.install_from_environment()
assert report["supported"] and bridge._INSTALLED
from toolkit.data_loader import AiToolkitDataset
assert AiToolkitDataset.cache_latents_all_latents is bridge._patched_cache_latents
assert AiToolkitDataset.cache_text_embeddings is bridge._patched_cache_text
print("LDS_ATK_BOOTSTRAP_OK")
"""
    completed = subprocess.run(
        [str(python), "-I", "-c", script],
        cwd=tmp_path,
        env=child_env,
        capture_output=True,
        text=True,
        timeout=90,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    assert completed.returncode == 0, completed.stderr[-4000:]
    assert "LDS_ATK_BOOTSTRAP_OK" in completed.stdout


class _Progress:
    def __init__(self, iterable=(), **kwargs):
        self.iterable = iterable

    def __iter__(self):
        return iter(self.iterable)

    def update(self, *args):
        pass

    def close(self):
        pass

    def write(self, *args):
        pass


def _cache_methods(source):
    names = {"cache_latents_all_latents", "_cache_one_latent", "cache_text_embeddings"}
    methods = [
        node
        for cls in ast.parse(source).body
        if isinstance(cls, ast.ClassDef)
        for node in cls.body
        if isinstance(node, ast.FunctionDef) and node.name in names
    ]
    assert {method.name for method in methods} == names
    module = ast.Module(
        body=[
            ast.ImportFrom(
                module="__future__",
                names=[ast.alias(name="annotations")],
                level=0,
            ),
            *methods,
        ],
        type_ignores=[],
    )
    namespace = {
        "os": os,
        "torch": torch,
        "deque": deque,
        "itertools": itertools,
        "ThreadPoolExecutor": ThreadPoolExecutor,
        "tqdm": _Progress,
        "accelerator": SimpleNamespace(main_process_first=nullcontext),
        "print_acc": lambda *args: None,
        "UnusableFileError": RuntimeError,
    }
    exec(compile(ast.fix_missing_locations(module), "<cache-methods>", "exec"), namespace)
    return namespace


def _no_encode(*args, **kwargs):
    raise AssertionError("restored caches must not be regenerated")


def _configure_targets(dataset, *, write, shared):
    dataset.dataset_config.caption_dropout_rate = 0.05
    dataset.dataset_config.diff_output_preservation = True
    dataset.dataset_config.cache_latents_num_workers = 2
    dataset.is_caching_latents_to_memory = False
    dataset.dataset_path = str(Path(dataset.file_list[0].path).parent)
    dataset.sd = SimpleNamespace(
        device="cpu", encode_prompt=_no_encode, encode_images=_no_encode, set_device_state_preset=_no_encode
    )
    for item in dataset.file_list:
        item.dataset_config = dataset.dataset_config
        item.caption = "synthetic caption"
        item.caption_dop = "synthetic class"
        item.caption_dopsd = "synthetic reference"
        item.dopsd_self_ref = True
        item.get_dropout_caption = lambda: "synthetic trigger"
        item.get_dop_dropout_caption = lambda: "synthetic class"
        item.get_dopsd_dropout_caption = lambda: "synthetic reference"
        item.load_and_process_image = _no_encode
        for kind, name in runtime._TEXT_CACHE_METHODS.items():
            if kind == "text_embedding":
                continue

            # ATK reuses the primary file when a replacement caption is identical.
            def get_path(self, recalculate=False, variant=kind):
                if shared and variant == "text_embedding_dop":
                    return self.get_text_embedding_path(recalculate=recalculate)
                return str(Path(self.path).parent / "_t_e_cache" / f"{self.token}-{variant}.safetensors")

            setattr(item, name, MethodType(get_path, item))
            path = Path(getattr(item, name)())
            if write and not path.exists():
                path.write_bytes(f"{kind}:{item.token}".encode())


@_requires_torch_runtime
@pytest.mark.parametrize("installed", [False, True], ids=["synthetic", "installed-cache-methods"])
@pytest.mark.parametrize("shared", [False, True], ids=["distinct-text-caches", "shared-text-cache"])
def test_restore_preserves_threaded_and_auxiliary_cache_bytes(tmp_path, monkeypatch, installed, shared):
    source = (
        (_installed_source() / "toolkit/dataloader_mixins.py").read_text(encoding="utf-8")
        if installed
        else _CACHE_SOURCE
    )
    methods = _cache_methods(source)
    monkeypatch.setattr(
        runtime,
        "_SOURCE_PROBE",
        {
            "text_cache_layout": "targets",
            "aitoolkit_revision": "toolkit-v1",
        },
    )
    monkeypatch.setattr(
        runtime,
        "_current_runtime_identity",
        lambda: {
            "torch": torch.__version__,
            "device": "cpu",
        },
    )
    monkeypatch.setattr(runtime, "_EARLY_DATASET_RESTORE_QUEUE", [])
    monkeypatch.setenv("LDS_AITK_IDENTITY_FILE", str(_identity(tmp_path / "identity.json")))
    original_dataset = _BucketDataset(tmp_path / "original", ("alpha", "beta", "gamma"), saved_layout=True)
    _configure_targets(original_dataset, write=True, shared=shared)
    original = _Trainer(tmp_path / "original-run")
    original.data_loader = torch.utils.data.DataLoader(original_dataset, batch_size=None, shuffle=True, num_workers=0)
    runtime.instrument_dataloader(original.data_loader, "main")
    next(iter(original.data_loader))
    bundle = runtime.capture_exact_bundle(original, 3)
    monkeypatch.setattr(runtime, "_ORIGINAL_AITK_SETUP_BUCKETS", _fake_setup_buckets)
    monkeypatch.setattr(runtime, "_ORIGINAL_AITK_SETUP_EPOCH", _fake_setup_epoch)
    monkeypatch.setattr(runtime, "_ORIGINAL_AITK_CACHE_LATENTS", methods["cache_latents_all_latents"])
    monkeypatch.setattr(runtime, "_ORIGINAL_AITK_CACHE_TEXT", methods["cache_text_embeddings"])
    monkeypatch.setenv("LDS_AITK_STATE_RESTORE_DIR", str(bundle))
    fresh = _BucketDataset(tmp_path / "resumed", ("gamma", "alpha", "beta"), saved_layout=False)
    _configure_targets(fresh, write=False, shared=shared)
    fresh._cache_one_latent = MethodType(methods["_cache_one_latent"], fresh)
    try:
        runtime._prepare_early_dataset_restore(bundle)
        runtime._patched_setup_epoch(fresh)
        assert fresh.epoch_num == original_dataset.epoch_num
        assert fresh.batch_indices == original_dataset.batch_indices
        assert all(item.is_latent_cached and item.is_text_embedding_cached for item in fresh.file_list)
        for before, after in zip(original_dataset.file_list, fresh.file_list):
            assert before.token == after.token
            for name in ("get_latent_path", *runtime._TEXT_CACHE_METHODS.values()):
                assert Path(getattr(before, name)()).read_bytes() == Path(getattr(after, name)()).read_bytes()
        resumed = _Trainer(tmp_path / "resumed-run")
        resumed.parameter.data.fill_(99)
        resumed.data_loader = torch.utils.data.DataLoader(
            fresh,
            batch_size=None,
            shuffle=True,
            num_workers=0,
        )
        runtime.restore_exact_bundle(resumed, bundle)
        assert resumed.step_num == resumed.start_step == 4
        assert torch.equal(resumed.parameter, original.parameter)
        assert resumed.optimizer.state_dict() == original.optimizer.state_dict()
        # The bridge adds a one-call bootstrap guard to scheduler.step.
        scheduler_state = resumed.lr_scheduler.state_dict()
        scheduler_state.pop("step")
        assert scheduler_state == original.lr_scheduler.state_dict()
        # Missing an auxiliary cache must fail before materialisation or encoding.
        saved = runtime._capture_aitk_dataset_state(original_dataset, label="main", leaf_index=0, cache_sources={})
        incomplete = copy.deepcopy(saved)
        incomplete["files"][0]["cache"].pop("text_embedding_dropout")
        with pytest.raises(runtime.StateBridgeError, match="saved cache state is invalid"):
            runtime._restore_aitk_dataset_state(
                fresh, incomplete, label="main", leaf_index=0, bucket_objects_ready=False
            )
    finally:
        runtime._clear_early_staging()


@_requires_torch_runtime
def test_auxiliary_cache_destination_cannot_escape_export(tmp_path):
    dataset = _BucketDataset(
        tmp_path / "export",
        ("alpha", "beta", "gamma"),
        saved_layout=False,
    )
    outside = tmp_path / "outside" / "_t_e_cache"
    outside.mkdir(parents=True)
    target = outside / "cache.safetensors"
    target.write_bytes(b"untouched")
    item = dataset.file_list[0]
    item.get_blank_text_embedding_path = lambda recalculate=False: str(target)
    with pytest.raises(runtime.StateBridgeError, match="unsafe cache destination"):
        runtime._safe_cache_destination(item, "text_embedding_dropout")
    assert target.read_bytes() == b"untouched"
