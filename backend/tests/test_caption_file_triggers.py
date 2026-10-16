"""The explicit TXT writer prefixes captions without changing dataset content."""
from pathlib import Path

import pytest
from PIL import Image

from app.config import LOCAL_USER


def _dataset(kind='style', caption='A bicycle beside a wall.'):
    from app.extensions import db
    from app.models import FaceDatasetImage
    from app.services import face_dataset_service as svc

    options = {'concept_desc': 'example activity'} if kind == 'concept' else {}
    dataset = svc.create_dataset(LOCAL_USER, 'Example', 'saved_tag', kind=kind,
                                 train_type='anima', **options)
    row = FaceDatasetImage(dataset_id=dataset.id, filename='sample.png',
                           status='keep', caption=caption, framing='body')
    db.session.add(row)
    db.session.commit()
    image = Path(svc._img_path(row))
    image.parent.mkdir(parents=True, exist_ok=True)
    Image.new('RGB', (16, 16), (10, 20, 30)).save(image)
    return dataset, row, image


@pytest.mark.parametrize('kind', ['character', 'concept', 'style'])
def test_txt_override_is_applied_once_without_changing_source_or_metadata(app, client, kind):
    with app.app_context():
        dataset, row, image = _dataset(kind)
        original = image.read_bytes()
        original_caption = row.caption
        for _ in range(2):
            response = client.post(f'/api/dataset/{dataset.id}/captions/write-files',
                                   json={'trigger_word': ' @sampleartist '})
            assert response.status_code == 200, response.get_json()
            assert response.get_json()['written'] == 1
            assert image.with_suffix('.txt').read_text(encoding='utf-8') == (
                f'@sampleartist, {original_caption}')
        assert row.caption == original_caption
        assert row.status == 'keep' and row.framing == 'body'
        assert dataset.trigger_word == 'saved_tag'
        assert image.read_bytes() == original


@pytest.mark.parametrize('caption', [
    '@sampleartist, A bicycle beside a wall.',
    '@SAMPLEARTIST, A bicycle beside a wall.',
    '@sampleartist, @sampleartist, A bicycle beside a wall.',
    'saved_tag, A bicycle beside a wall.',
])
def test_existing_prefixes_are_not_duplicated(app, client, caption):
    with app.app_context():
        dataset, row, image = _dataset(caption=caption)
        response = client.post(f'/api/dataset/{dataset.id}/captions/write-files',
                               json={'trigger_word': '@sampleartist'})
        assert response.status_code == 200
        assert image.with_suffix('.txt').read_text(encoding='utf-8') == (
            '@sampleartist, A bicycle beside a wall.')
        assert row.caption == caption


def test_legacy_request_uses_saved_style_trigger(app, client):
    with app.app_context():
        dataset, _, image = _dataset()
        response = client.post(f'/api/dataset/{dataset.id}/captions/write-files')
        assert response.status_code == 200
        assert image.with_suffix('.txt').read_text(encoding='utf-8') == (
            'saved_tag, A bicycle beside a wall.')


def test_existing_character_caption_equal_to_trigger_is_preserved(app, client):
    with app.app_context():
        dataset, row, image = _dataset('character', caption='@sampleartist')
        response = client.post(f'/api/dataset/{dataset.id}/captions/write-files',
                               json={'trigger_word': '@sampleartist'})
        assert response.status_code == 200
        assert response.get_json()['written'] == 1
        assert image.with_suffix('.txt').read_text(encoding='utf-8') == '@sampleartist'
        assert row.caption == '@sampleartist'


@pytest.mark.parametrize('trigger', ['', '  ', 1, True, [], {}, 'one\ntwo', 'one\u2028two', 'x' * 61])
def test_invalid_trigger_does_not_overwrite_existing_files(app, client, trigger):
    with app.app_context():
        dataset, _, image = _dataset()
        sidecar = image.with_suffix('.txt')
        sidecar.write_text('Existing caption file.', encoding='utf-8')
        response = client.post(f'/api/dataset/{dataset.id}/captions/write-files',
                               json={'trigger_word': trigger})
        assert response.status_code == 400
        assert sidecar.read_text(encoding='utf-8') == 'Existing caption file.'


@pytest.mark.parametrize('payload', ['[]', 'null', '{broken'])
def test_invalid_request_does_not_write_files(app, client, payload):
    with app.app_context():
        dataset, _, image = _dataset()
        response = client.post(f'/api/dataset/{dataset.id}/captions/write-files',
                               data=payload, content_type='application/json')
        assert response.status_code == 400
        assert not image.with_suffix('.txt').exists()
