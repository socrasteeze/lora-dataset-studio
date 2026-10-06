"""Online media scan and thumbnail routes.

This install does not fetch a remote page or a remote thumbnail. The local
upload size cap stays in ``app.scrape.netfetch``.
"""
from flask import Blueprint, jsonify

bp = Blueprint('scrape', __name__, url_prefix='/api')

_OFFLINE = 'Online media imports are disabled in this offline fork.'


@bp.post('/scrape/scan')
def scrape_scan():
    return jsonify({'error': _OFFLINE}), 403


@bp.get('/scrape/thumb')
def scrape_thumb():
    return jsonify({'error': _OFFLINE}), 403
