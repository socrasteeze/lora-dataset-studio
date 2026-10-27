"""Exact grouping contracts for the bounded face edge traversal."""
import ast
from pathlib import Path

import pytest

np = pytest.importorskip('numpy')


def test_face_grouping_keeps_bridged_components_and_singletons():
    source = Path(__file__).resolve().parents[1] / 'infer' / 'face_embed_infer.py'
    tree = ast.parse(source.read_text(encoding='utf-8'))
    tree.body = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == '_cluster']
    namespace = {}
    exec(compile(tree, str(source), 'exec'), namespace)
    order = ['input-a', 'input-b', 'input-c', 'input-d']
    vectors = [(1., 0.), (.8, .6), (.28, .96), (-1., 0.)]
    cache = {p: ('scorable', 0., 0., np.asarray(v, dtype='float32'))
             for p, v in zip(order, vectors)}
    assert namespace['_cluster'](order, cache, .75) == {
        'input-a': 1, 'input-b': 1, 'input-c': 1, 'input-d': 2}
