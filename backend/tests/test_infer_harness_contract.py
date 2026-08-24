"""infer/_harness.py stays a stdlib-only sibling, and the factored map holds.

The infer scripts run in their own torch venvs and are launched as plain files,
so their one shared module must import nothing a bare interpreter lacks — a
single torch/numpy/app import in _harness would kill every worker at startup.
And each script that handed a helper to the harness must keep importing it
rather than quietly growing a local copy back (the drift this factoring
removed). Pure AST checks: nothing here needs the ML venvs.

DIVERGENCE 5 — `_emit` is factored upstream but NOT here, for every script that
prints a result. This fork claims the real stdout for the result line
(`infer_io.claim_result_stream`, `tests/test_infer_result_channel.py`), so a
worker's `_emit` must print `file=_OUT`, never `_harness`'s plain
`print(..., flush=True)` — importing the shared one would send the result line
to the same stream `claim_result_stream` redirected library banners to, and the
parent would read `{}` back. Every FACTORED entry below is upstream's, minus
`_emit`; `_harness._emit` itself stays defined (upstream owns it, and this file
is otherwise adopted verbatim) but no script here may import it — which is what
the harness-level test below pins."""
import ast
import pathlib

INFER = pathlib.Path(__file__).resolve().parents[1] / 'infer'

# Simple stdlib names only: anything outside this set is a doctrine break.
ALLOWED_IMPORTS = {'json', 'os', 'sys', 'typing'}

# The factored map, file -> names it must import from _harness and not redefine.
# `_emit` is deliberately absent from every entry — see the module docstring.
FACTORED = {
    'bank_score_infer.py': {'_log', '_cancel_requested', '_write_count'},
    'bank_semantic_infer.py': {'_pooled_features'},
    'clip_image_embed_infer.py': {'_log'},
    'clip_text_infer.py': {'_log'},
    'face_embed_infer.py': {'_log', '_cancel_requested', '_write_count'},
    'face_score_infer.py': {'_log'},
    'shot_detect_infer.py': {'_log', '_cancel_requested'},
    'siglip2_text_infer.py': {'_pooled_features'},
    'video_aesthetic_infer.py': {'_log'},
    'video_ai_check_infer.py': {'_log'},
    'video_caption_infer.py': {'_log'},
    'video_text_infer.py': {'_log', '_cancel_requested'},
    'watermark_detect_infer.py': {'_log', '_cancel_requested'},
}

# _harness.py defines this too (upstream's own shared _emit), but DIVERGENCE 5
# above is exactly why no FACTORED entry may ever import it.
UNIMPORTED_HARNESS_HELPERS = {'_emit'}


def _tree(name):
    return ast.parse((INFER / name).read_text(encoding='utf-8'))


def test_harness_is_stdlib_only():
    imported = set()
    for node in ast.walk(_tree('_harness.py')):
        if isinstance(node, ast.Import):
            imported.update(a.name.split('.')[0] for a in node.names)
        elif isinstance(node, ast.ImportFrom) and node.level == 0:
            imported.add((node.module or '').split('.')[0])
    assert imported <= ALLOWED_IMPORTS, imported - ALLOWED_IMPORTS


def test_harness_defines_each_factored_helper_once():
    tree = _tree('_harness.py')
    defs = [n.name for n in tree.body if isinstance(n, ast.FunctionDef)]
    expected = set().union(*FACTORED.values()) | UNIMPORTED_HARNESS_HELPERS
    assert set(defs) == expected
    assert len(defs) == len(set(defs))


def test_factored_scripts_import_and_do_not_redefine():
    for fname, names in FACTORED.items():
        tree = _tree(fname)
        imported = set()
        for node in tree.body:
            if isinstance(node, ast.ImportFrom) and node.module == '_harness':
                imported.update(a.name for a in node.names)
        redefined = {n.name for n in tree.body
                     if isinstance(n, ast.FunctionDef)} & names
        assert names <= imported, (fname, names - imported)
        assert not redefined, (fname, redefined)
        assert not (imported & UNIMPORTED_HARNESS_HELPERS), (
            fname, imported & UNIMPORTED_HARNESS_HELPERS)
