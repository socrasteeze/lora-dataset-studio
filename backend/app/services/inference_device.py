"""Prefer a prepared CUDA runtime while preserving exclusive GPU ownership."""
from __future__ import annotations

from contextlib import ExitStack, contextmanager
import logging

from ..gpu_window import (
    GpuBusyError, gpu_exclusive_vision_window, vision_window_is_owned,
)

logger = logging.getLogger(__name__)


@contextmanager
def preferred_device(python, *, backend='onnx', preference='auto', on_cpu=None):
    """Yield CUDA only with a capable runtime and an owned GPU window.
    ``on_cpu(reason)`` hears why an 'auto' run fell back, so a pass can say so."""
    from ..capabilities import _cached_import

    if preference not in ('auto', 'cuda'):
        yield 'cpu'
        return
    if backend == 'torch':
        probe = 'import torch,sys; sys.exit(0 if torch.cuda.is_available() else 1)'
    elif backend == 'onnx':
        probe = ("import onnxruntime,sys; sys.exit(0 if 'CUDAExecutionProvider' "
                 "in onnxruntime.get_available_providers() else 1)")
    else:
        raise ValueError('Unknown inference backend')
    if not _cached_import('preferred_' + backend + '_gpu', python, probe):
        if on_cpu:
            on_cpu('no CUDA runtime in its environment')
        yield 'cpu'
        return
    if vision_window_is_owned():
        yield 'cuda'
        return
    with ExitStack() as stack:
        try:
            stack.enter_context(gpu_exclusive_vision_window(flag_ttl=1800))
        except GpuBusyError as e:
            logger.info('GPU is occupied; inference uses CPU for this run')
            if on_cpu:
                on_cpu(str(e) or 'the GPU is busy')
            yield 'cpu'
            return
        yield 'cuda'
