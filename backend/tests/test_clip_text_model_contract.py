"""Every CLIP tower in this project must load the SAME model.

There are three of them now, and they all meet in one dot product:
``bank_score_infer.py`` embeds bank images, ``clip_image_embed_infer.py`` embeds
video frames, and ``clip_text_infer.py`` encodes the query both are ranked
against. A drift in any one of them breaks a feature that shows no error.

🔤 Text search ranks a query vector (from ``clip_text_infer.py``) against the
image vectors ``bank_score_infer.py`` cached. Cosine similarity between vectors
produced by two DIFFERENT CLIP configurations is meaningless — and, crucially,
it does not look meaningless: the dot product returns numbers in the usual range
and a ranking that is plausible at a glance but is noise. No exception, no
crash, nothing in a log. It is the worst failure mode this feature has, so it
gets a test of its own rather than a comment.

The three worker calls are asserted on the source so this suite can run without
open_clip. A textual contract still catches the realistic regression: someone
"modernises" one script's model id (say to the `-quickgelu` variant that matches
how the openai weights were really trained) and silently invalidates every
comparison against every already-scored bank.

⚠ Known, deliberate divergence from upstream: the `openai` ViT-L-14 weights were
trained WITH QuickGELU, and `'ViT-L-14'` builds a plain-GELU model — open_clip
warns about it on every load. Every embedding cached on every install out there
was produced that way. Switching to `'ViT-L-14-quickgelu'` would be more correct
in the abstract and would invalidate every scored bank in practice, so it is a
migration to schedule, NOT a one-line fix. Both halves stay wrong together, on
purpose, until that migration happens.
"""
import re
from pathlib import Path

import pytest

from infer import clip_local_weights

INFER = Path(__file__).resolve().parents[1] / 'infer'
SCORE = INFER / 'bank_score_infer.py'
TEXT = INFER / 'clip_text_infer.py'
FRAMES = INFER / 'clip_image_embed_infer.py'


@pytest.mark.parametrize('path', [SCORE, TEXT, FRAMES], ids=lambda path: path.stem)
def test_all_towers_load_the_same_local_checkpoint(path):
    src = path.read_text(encoding='utf-8')
    shared_import = re.search(r'^from clip_local_weights import (.+)$', src, re.M)
    assert shared_import and {'MODEL_NAME', 'resolve_clip_checkpoint'} <= {
        name.strip() for name in shared_import.group(1).split(',')}
    assert re.findall(r'open_clip\.create_model_and_transforms\(\s*([^,]+),\s*'
                      r'pretrained=([^\n]+)\)', src) == [
        ('MODEL_NAME', 'resolve_clip_checkpoint(models_root)')], (
        f'{path.name} must load the shared CLIP model and local checkpoint')


def test_clip_checkpoint_repo_and_exact_custom_cache_filenames(tmp_path):
    assert clip_local_weights._HUB_REPO == 'models--timm--vit_large_patch14_clip_224.openai'
    assert clip_local_weights._FILENAMES == (
        'open_clip_model.safetensors',
        'open_clip_pytorch_model.safetensors',
        'open_clip_pytorch_model.bin',
    )
    cache = tmp_path / 'models' / 'open_clip'
    cache.mkdir(parents=True)
    (cache / 'unrelated.safetensors').write_bytes(b'placeholder')
    with pytest.raises(FileNotFoundError):
        clip_local_weights.resolve_clip_checkpoint(
            cache.parent, env={'XDG_CACHE_HOME': str(tmp_path / 'empty-xdg')})


def test_the_frame_worker_normalises():
    src = FRAMES.read_text(encoding='utf-8')
    assert re.search(r'emb\s*/\s*emb\.norm\(dim=-1,\s*keepdim=True\)', src), \
        'clip_image_embed_infer.py must L2-normalise its embeddings'


def test_the_frame_worker_can_be_kept_off_the_gpu_before_torch_loads():
    """Unlike the text tower this one MAY use the card — embedding thousands of
    frames is real compute. But when the parent did not take the GPU-exclusive
    window, CUDA has to be hidden before torch is imported, or an hour-long pass
    quietly competes with a training run."""
    src = FRAMES.read_text(encoding='utf-8')
    hide = src.index("os.environ['CUDA_VISIBLE_DEVICES'] = ''")
    assert hide < src.index('import torch', hide), \
        'CUDA must be hidden before torch is imported'


def test_the_text_side_uses_the_shared_model_tokenizer():
    src = TEXT.read_text(encoding='utf-8')
    # The tokenizer must come from the same model id — a mismatched tokenizer is
    # the same class of silent bug.
    assert 'get_tokenizer(MODEL_NAME)' in src


def test_both_sides_l2_normalise():
    """A dot product only IS a cosine when both sides are unit vectors. The image
    side normalises; the text side must too, or every score is off by a factor
    nobody can see."""
    for path in (SCORE, TEXT):
        src = path.read_text(encoding='utf-8')
        assert re.search(r'emb\s*/\s*emb\.norm\(dim=-1,\s*keepdim=True\)', src), \
            f'{path.name} must L2-normalise its embeddings'


def test_the_text_child_requires_parent_gpu_permission():
    """The CPU fallback hides CUDA; a parent-owned CUDA run moves both inputs and model."""
    src = TEXT.read_text(encoding='utf-8')
    hide = src.index("os.environ['CUDA_VISIBLE_DEVICES'] = ''")
    imp = src.index('import torch', hide - 4000 if hide > 4000 else 0)
    assert hide < src.index('import torch', imp), \
        'CUDA must be hidden before torch is imported'
    assert "want_cuda = req.get('device') == 'cuda'" in src
    assert 'if not want_cuda:' in src
    assert 'model.to(device)' in src
    assert 'tokenizer([text]).to(device)' in src


def _aesthetic_expects():
    """(model_name, pretrained) the aesthetic head was trained on, as
    bank_score_infer.py declares it next to the checkpoint URL."""
    src = SCORE.read_text(encoding='utf-8')
    m = re.search(r"^_AESTHETIC_EXPECTS\s*=\s*\('([^']+)'\s*,\s*'([^']+)'\)",
                  src, re.M)
    assert m, 'could not find _AESTHETIC_EXPECTS in bank_score_infer.py'
    return m.group(1), m.group(2)


def test_the_aesthetic_head_gets_the_embedding_space_it_was_trained_on():
    """✨ The aesthetic score is a 7-layer MLP over the CLIP embedding, trained
    on ONE space: ViT-L/14 as OpenAI released it. The `l14` in the checkpoint
    filename names that pair, not a family.

    Every other 768-d CLIP also feeds it without error — datacomp_xl, laion2b,
    the quickgelu variant — and it returns a number in the 1-10 range that
    looks like a score and is noise. Nothing raises, nothing logs, and every
    ✨ Score in every bank is quietly wrong.

    The tower tests above cannot catch it: they assert the CLIP call-sites
    agree with EACH OTHER, which stays true when all three are changed together
    to a model this head was never trained on."""
    assert (clip_local_weights.MODEL_NAME, clip_local_weights.PRETRAINED) == _aesthetic_expects(), (
        'bank_score_infer.py loads a CLIP pair the aesthetic head was not '
        'trained on. The head will still return a plausible, meaningless '
        'score. Changing the scoring model requires replacing or retraining '
        f'{_aesthetic_expects()[0]}/{_aesthetic_expects()[1]} too — it is not '
        'a one-line swap.')


def test_the_expected_pair_is_anchored_to_the_checkpoint_that_requires_it():
    """The test above compares two constants that live five lines apart in the
    same file, so a model swap can be "fixed" by editing the expectation — the
    exact reflex the guard exists to stop.

    The pair is not a property of this codebase. It is a property of the
    checkpoint: sac+logos+ava1-l14-linearMSE was fitted on ViT-L/14 as OpenAI
    released it, and always will be. So while THAT file is the aesthetic head,
    the expectation is not editable — changing it requires changing the
    checkpoint too, which is the real precondition."""
    src = SCORE.read_text(encoding='utf-8')
    m = re.search(r"^_AESTHETIC_FILE\s*=\s*'([^']+)'", src, re.M)
    assert m, 'could not find _AESTHETIC_FILE in bank_score_infer.py'
    if 'l14-linearMSE' in m.group(1):
        assert _aesthetic_expects() == ('ViT-L-14', 'openai'), (
            f'{m.group(1)} was trained on ViT-L/14-OpenAI embeddings. While it '
            'is the aesthetic head, _AESTHETIC_EXPECTS cannot be anything '
            'else — change the checkpoint, or leave the pair alone.')
