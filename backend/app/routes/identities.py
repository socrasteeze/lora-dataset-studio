"""Shared identity APIs; all inference needs an explicit operator request."""
from functools import wraps

from flask import Blueprint, jsonify, request, send_file
from sqlalchemy.exc import IntegrityError

from ..config import LOCAL_USER
from ..extensions import db
from ..services import identity_learning as identities
from ..services.bank_jobs import BankJobBusy
from ..services.dataset_activity import DatasetActivityBusy
from ..services.identity_inference import RecognitionUnavailable

bp = Blueprint('identities', __name__, url_prefix='/api')


def endpoint(fn):
    @wraps(fn)
    def run(*args, **kwargs):
        try:
            return jsonify(fn(*args, **kwargs))
        except identities.IdentityNotFound as error:
            db.session.rollback()
            return jsonify(error=str(error)), 404
        except (identities.IdentityConflict, IntegrityError,
                BankJobBusy, DatasetActivityBusy):
            db.session.rollback()
            return jsonify(error='Identity or image work changed. Reload before retrying.'), 409
        except RecognitionUnavailable as error:
            db.session.rollback()
            return jsonify(error=str(error), setup_route='#/setup?step=quality'), 503
        except (ValueError, TypeError) as error:
            db.session.rollback()
            return jsonify(error=str(error)), 400
    return run


def body():
    value = request.get_json(silent=True)
    if not isinstance(value, dict):
        raise ValueError('JSON body must be an object.')
    return value


@bp.get('/identities')
@endpoint
def list_identities():
    return {'identities': identities.list_identities(
        LOCAL_USER, request.args.get('kind'), request.args.get('q', ''))}


@bp.post('/identities/evaluate')
@endpoint
def evaluate():
    from ..services.identity_evaluation import evaluate
    return evaluate(LOCAL_USER, body())


@bp.post('/identities')
@endpoint
def create_identity():
    return identities.identity_dict(identities.create_identity(LOCAL_USER, body()))


@bp.post('/identities/<identity_id>/rename')
@endpoint
def rename_identity(identity_id):
    return identities.rename_identity(LOCAL_USER, identity_id, body())


@bp.get('/identities/catalog')
@endpoint
def search_catalog():
    query = request.args.get('q', '')
    return {'characters': identities.catalog(query) if query.strip() else []}


@bp.post('/identities/catalog/import')
@endpoint
def import_catalog():
    upload = request.files.get('file')
    if upload is None:
        raise ValueError('Choose a character vocabulary CSV.')
    content = upload.stream.read(32*1024*1024+1)
    if len(content) > 32*1024*1024:
        raise ValueError('Catalog exceeds 32 MiB.')
    try:
        text = content.decode('utf-8-sig')
    except UnicodeDecodeError:
        raise ValueError('Catalog must use UTF-8.') from None
    return identities.import_catalog(text)


@bp.post('/identity/<source>/<int:scope_id>/view')
@endpoint
def view(source, scope_id):
    return identities.view(LOCAL_USER, source, scope_id, body().get('image_ids'))


@bp.get('/identity/<source>/<int:scope_id>/filter/<identity_id>')
@endpoint
def filter_ids(source, scope_id, identity_id):
    return {'image_ids': identities.filter_ids(LOCAL_USER, source, scope_id, identity_id)}


@bp.post('/identity/<source>/<int:scope_id>/assign')
@endpoint
def assign(source, scope_id):
    data = body()
    with identities.lease(source, scope_id):
        result = identities.assign(LOCAL_USER, source, scope_id, data)
        # The human decision remains saved if its optional prepared runtime
        # cannot enroll evidence. The response states that limit explicitly.
        if data.get('learn', True):
            identity = identities._identity(LOCAL_USER, data.get('identity_id'))
            try:
                result['learning'] = identities.analyze(
                    LOCAL_USER, source, scope_id, {**data, 'kind': identity.kind},
                    confirmation=(identity.id, set(result['subject_ids'])))
            except RecognitionUnavailable as error:
                result['learning'] = {'measured': 0, 'reason': str(error),
                                      'setup_route': '#/setup?step=quality'}
            except (ValueError, OSError):
                db.session.rollback()
                result['learning'] = {'measured': 0,
                                      'reason': 'Name saved. Recognition needs a fresh analysis.'}
        return result


@bp.post('/identity/<source>/<int:scope_id>/analyze')
@endpoint
def analyze(source, scope_id):
    data = body()
    identities._scope(LOCAL_USER, source, scope_id)
    with identities.lease(source, scope_id):
        return identities.analyze(LOCAL_USER, source, scope_id, data)


@bp.post('/identity/<source>/<int:scope_id>/suggest')
@endpoint
def suggest(source, scope_id):
    return identities.suggestions(LOCAL_USER, source, scope_id, body())


@bp.post('/identity/<source>/<int:scope_id>/tags')
@endpoint
def tag_candidates(source, scope_id):
    data = body()
    identities._scope(LOCAL_USER, source, scope_id)
    with identities.lease(source, scope_id):
        return identities.tag_candidates(LOCAL_USER, source, scope_id, data)


@bp.post('/identity/subjects/<subject_id>/decision')
@endpoint
def decision(subject_id):
    from ..models import IdentitySubject
    subject = db.session.get(IdentitySubject, subject_id)
    if subject is None or subject.user_id != LOCAL_USER:
        raise identities.IdentityNotFound('Subject is unavailable.')
    data = body()
    with identities.lease(subject.source, subject.scope_id):
        return identities.decision(LOCAL_USER, subject_id, data)


@bp.post('/identity/actions/<action_id>/undo')
@endpoint
def undo(action_id):
    from ..models import IdentityAction
    action = db.session.get(IdentityAction, action_id)
    if action is None or action.user_id != LOCAL_USER:
        raise identities.IdentityNotFound('Undo is unavailable.')
    with identities.lease(action.source, action.scope_id):
        return identities.undo(LOCAL_USER, action_id)


@bp.get('/identity/<source>/<int:scope_id>/undo')
@endpoint
def undo_offer(source, scope_id):
    return identities.undo_offer(LOCAL_USER, source, scope_id)


@bp.get('/identity/<source>/<int:scope_id>/image/<int:image_id>')
def image_file(source, scope_id, image_id):
    try:
        scope, image = identities._image(LOCAL_USER, source, scope_id, image_id)
        response = send_file(identities._path(source, scope, image))
        response.headers['Cache-Control'] = 'private, no-store'
        return response
    except (ValueError, OSError):
        return jsonify(error='Image is unavailable.'), 404
