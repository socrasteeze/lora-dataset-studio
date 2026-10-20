"""CPU budgets shared by inference workers without importing the application."""
from contextlib import contextmanager
import os

NATIVE_THREAD_KEYS = ('OMP_NUM_THREADS', 'MKL_NUM_THREADS', 'OPENBLAS_NUM_THREADS', 'NUMEXPR_NUM_THREADS')
CACHE_SAVE_SECONDS = 60
FACE_SCORING_MODULES = ('detection', 'recognition', 'landmark_3d_68')


def native_thread_count(cpu_count=None):
    cpus = os.cpu_count() if cpu_count is None else cpu_count
    return max(1, min(4, max(1, cpus or 1) // 4))


def prepare_workers(cpu_count=None):
    cpus = os.cpu_count() if cpu_count is None else cpu_count
    return max(1, min(8, max(1, cpus or 1) // 3))


def bounded_native_environment(environment, cpu_count=None):
    result = dict(environment)
    budget = native_thread_count(cpu_count)
    for key in NATIVE_THREAD_KEYS:
        try:
            limit = min(budget, max(1, int(result.get(key, budget))))
        except (TypeError, ValueError):
            limit = budget
        result[key] = str(limit)
    return result


@contextmanager
def native_thread_limits():
    """Set limits before numerical imports; restore callers that embed a worker."""
    previous = {key: os.environ.get(key) for key in NATIVE_THREAD_KEYS}
    limits = bounded_native_environment(os.environ)
    try:
        os.environ.update({key: limits[key] for key in NATIVE_THREAD_KEYS})
        yield
    finally:
        for key, value in previous.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


def onnx_session_options(ort):
    """Avoid a full spinning CPU pool for every ONNX model in a face bundle."""
    options = ort.SessionOptions()
    environment = bounded_native_environment(os.environ)
    options.intra_op_num_threads = min(native_thread_count(), int(environment['OMP_NUM_THREADS']))
    options.inter_op_num_threads = 1
    options.add_session_config_entry('session.intra_op.allow_spinning', '0')
    options.add_session_config_entry('session.inter_op.allow_spinning', '0')
    return options
