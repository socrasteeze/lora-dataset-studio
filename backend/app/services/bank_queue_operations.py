"""Serializable workspace analysis jobs for the shared Bank queue."""
from copy import deepcopy
import inspect
import json

from ..extensions import db
from ..models import BankImage, ImageBank

# Operation IDs are persisted. Keep them stable across restarts.
OPERATIONS = {
    'scan': ('image_bank_service', 'start_scan'),
    'faces': ('image_bank_service', 'start_faces'),
    'score': ('image_bank_service', 'start_score'),
    'semantic_index': ('image_bank_service', 'start_semantic_index'),
    'semantic_dedup': ('image_bank_service', 'start_semantic_dedup'),
    'watermark': ('image_bank_service', 'start_watermark'),
    'text_scan': ('image_bank_service', 'start_text_scan'),
    'watermark_crop': ('image_bank_service', 'start_watermark_crop'),
    'watermark_inpaint': ('image_bank_service', 'start_watermark_inpaint'),
    'improve': ('image_bank_service', 'start_improve'),
    'framing': ('image_bank_service', 'start_framing'),
    'tags': ('image_bank_service', 'start_tags'),
    'medium': ('image_bank_service', 'start_medium'),
    'angles': ('image_bank_service', 'start_faces'),
    'caption': ('image_bank_service', 'start_caption'),
    'pipeline': ('image_bank_service', 'start_pipeline'),
    'folder-check': ('folder_person', 'start_sample_check'),
    'folder-scan': ('folder_person', 'start_folder_scan'),
    'folder-preflight': ('folder_person', 'start_preflight'),
}


def function(operation):
    from importlib import import_module
    if operation not in OPERATIONS:
        raise ValueError('This Bank job cannot be queued.')
    module, name = OPERATIONS[operation]
    return getattr(import_module('.' + module, __package__), name)


def _selected_instances(bank_id, ids):
    from .image_bank_service import _SQL_IN_CHUNK
    result = {}
    for offset in range(0, len(ids), _SQL_IN_CHUNK):
        rows = (db.session.query(BankImage.id, BankImage.instance_id)
                .filter(BankImage.bank_id == bank_id,
                        BankImage.id.in_(ids[offset:offset + _SQL_IN_CHUNK])).all())
        result.update({str(ident): instance for ident, instance in rows})
    return result


def prepare(operation, user_id, bank_id, options):
    """Validate the submission without loading models or starting work."""
    from . import image_bank_service as banks
    from .cluster import LOCAL_DEVICE_ID, normalize_device_id
    bank = banks.get_bank(user_id, bank_id)
    if bank is None:
        raise ValueError('bank not found')
    options = json.loads(json.dumps(options, allow_nan=False))
    inspect.signature(function(operation)).bind(None, user_id, bank_id, **options)
    if options.get('statuses') is not None:
        options['statuses'] = banks.normalize_pass_statuses(options['statuses'])
    if operation == 'caption':
        from .face_dataset_service import CAPTION_BACKENDS, CAPTION_LENGTHS, CAPTION_VOCABULARIES
        from .ollama_control import normalize_ollama_model_ref
        for key, allowed in (('backend', CAPTION_BACKENDS), ('length', CAPTION_LENGTHS),
                             ('vocabulary', CAPTION_VOCABULARIES)):
            value = banks._caption_name_option(key, options.get(key))
            if value and value not in allowed:
                raise ValueError(f'invalid caption {key}: {value}')
        normalize_ollama_model_ref(options.get('ollama_model') or '', allow_empty=True)
    if operation == 'watermark_inpaint':
        banks.normalize_inpaint_options(options.get('method'), options.get('target'))
    if operation == 'semantic_dedup':
        banks._semantic_dup_threshold(banks._selected_semantic_engine(bank), options.get('threshold'))
    if options.get('limit') is not None and int(options['limit']) < 1:
        raise ValueError('limit must be at least 1')
    ids = options.get('ids') or []
    if not isinstance(ids, list) or any(isinstance(ident, bool) or int(ident) < 1 for ident in ids):
        raise ValueError('image_ids must contain positive image IDs')
    instances = _selected_instances(bank_id, ids)
    if len(instances) != len({str(int(ident)) for ident in ids}):
        raise ValueError('The image selection changed. Reload it before queuing the job.')
    device_id = normalize_device_id(options.get('device_id'))
    if operation == 'watermark_inpaint' and options.get('method', 'auto') != 'klein':
        device_id = LOCAL_DEVICE_ID
    if device_id != LOCAL_DEVICE_ID:
        if operation != 'watermark_inpaint':
            banks._remote_pass_device(device_id)
            step = 'faces' if operation == 'angles' else operation
            banks.refuse_steps_for_device(device_id, options.get('steps') or [step])
    if operation == 'pipeline':
        options['steps'] = banks._sanitize_pipeline_steps(options.get('steps'), banks._selected_semantic_engine(bank))
        if not options['steps']:
            raise ValueError('no pipeline steps selected')
    return {'options': options, 'bank_instance_id': bank.instance_id,
            'image_instances': instances}, None if device_id == LOCAL_DEVICE_ID else device_id


def execute(app, entry):
    payload = entry['operation_payload']
    bank = db.session.get(ImageBank, entry['bank_id'])
    if (bank is None or bank.user_id != str(entry['user_id'])
            or bank.instance_id != payload['bank_instance_id']):
        raise ValueError('The queued Bank was removed or replaced. Remove this job and select the Bank again.')
    options = deepcopy(payload['options'])
    expected = payload.get('image_instances') or {}
    if expected != _selected_instances(bank.id, options.get('ids') or []):
        raise ValueError('The queued image selection changed. Remove this job and select the images again.')
    # Models and current prerequisites are checked by the original service at
    # execution time, after the queue has granted this job its machine slot.
    return function(entry['operation'])(app, entry['user_id'], bank.id, **options)
