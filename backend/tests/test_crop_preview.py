"""Upright crop previews and full-resolution crop output use the same frame."""
import io
from pathlib import Path

import pytest
from PIL import Image, ImageOps

from app.models import BankImage
from app.services import face_dataset_service as datasets, image_encoding
from app.services.dataset_storage import ensure_dataset_dir


def _write_jpeg(path, turn, size=(1603, 1009)):
    width, height = size
    x, y = width // 2, height // 2
    image = Image.new('RGB', size)
    image.paste('red', (0, 0, x, y))
    image.paste('blue', (x, 0, width, y))
    image.paste('lime', (0, y, x, height))
    image.paste('yellow', (x, y, width, height))
    exif = Image.Exif()
    exif[274] = turn
    image.save(path, 'JPEG', quality=95, exif=exif)


def _assert_upright_preview(response, source):
    assert response.status_code == 200
    with Image.open(source) as image, Image.open(io.BytesIO(response.data)) as preview:
        upright = ImageOps.exif_transpose(image)
        assert response.headers.get('X-Crop-Source-Size') == f'{upright.width}x{upright.height}'
        assert preview.format == 'WEBP'
        assert max(preview.size) == min(1024, max(upright.size))
        assert preview.getexif().get(274, 1) == 1
        for x in (0.25, 0.75):
            for y in (0.25, 0.75):
                expected = upright.getpixel((int(x * upright.width), int(y * upright.height)))
                actual = preview.getpixel((int(x * preview.width), int(y * preview.height)))
                assert max(abs(a - b) for a, b in zip(actual, expected)) <= 8


@pytest.mark.parametrize('turn', range(1, 9))
def test_dataset_preview_bakes_exif_and_preserves_original_route(client, app, turn):
    dataset_id = client.post('/api/dataset/create', json={
        'name': 'Crop fixture', 'trigger_word': 'fixture',
    }).get_json()['id']
    with app.app_context():
        source = Path(ensure_dataset_dir(dataset_id)) / 'source.jpg'
    _write_jpeg(source, turn)
    url = f'/api/dataset/{dataset_id}/img/source.jpg'
    assert client.get(url).data == source.read_bytes()
    _assert_upright_preview(client.get(f'{url}?v=2&crop_preview=1'), source)
    assert client.get(f'/api/dataset/{dataset_id}/img/missing.jpg?crop_preview=1').status_code == 404


def test_unsupported_preview_leaves_the_dataset_original_available(client, app):
    dataset_id = client.post('/api/dataset/create', json={
        'name': 'Crop fixture', 'trigger_word': 'fixture',
    }).get_json()['id']
    with app.app_context():
        source = Path(ensure_dataset_dir(dataset_id)) / 'source.gif'
    Image.new('RGB', (120, 80), 'red').save(source)
    url = f'/api/dataset/{dataset_id}/img/source.gif'
    assert client.get(f'{url}?crop_preview=1').status_code == 204
    assert client.get(url).data == source.read_bytes()


def test_bank_preview_tracks_source_replacement_and_crop_without_changing_grid(client, app, tmp_path):
    folder = tmp_path / 'inputs'
    folder.mkdir()
    source = folder / 'source.jpg'
    _write_jpeg(source, 6, (4033, 3025))
    bank_id = client.post('/api/bank/create', json={
        'name': 'Crop fixture', 'folder': str(folder),
    }).get_json()['id']
    with app.app_context():
        image_id = BankImage.query.filter_by(bank_id=bank_id).one().id
    url = f'/api/bank/{bank_id}/file/{image_id}'
    preview_url = f'{url}?crop_preview=1'
    first = client.get(preview_url)
    _assert_upright_preview(first, source)
    assert client.get(preview_url, headers={'If-None-Match': first.headers['ETag']}).status_code == 304

    _write_jpeg(source, 8, (4033, 3025))
    second = client.get(preview_url, headers={'If-None-Match': first.headers['ETag']})
    _assert_upright_preview(second, source)
    assert second.headers['ETag'] != first.headers['ETag']
    thumb = client.get(f'/api/bank/{bank_id}/thumb/{image_id}')
    with Image.open(io.BytesIO(thumb.data)) as image:
        assert max(image.size) == 320

    crop = client.post(f'/api/bank/{bank_id}/image/{image_id}/crop',
                       json={'x': 100, 'y': 150, 'w': 350, 'h': 650})
    assert crop.status_code == 200
    result = client.get(f'{preview_url}&e=1')
    assert result.headers.get('X-Crop-Source-Size') == '350x650'
    with Image.open(io.BytesIO(result.data)) as image:
        assert image.size == (350, 650)


@pytest.mark.parametrize('mode', ['RGB', 'RGBA', 'P'])
@pytest.mark.parametrize('width,height', [(337, 509), (1207, 1113)])
def test_dataset_crop_matches_previous_pixels(tmp_path, mode, width, height):
    # Include asymmetry, transparency and a quarter turn in the source raster.
    channel = Image.effect_noise((1301, 1403), 50)
    image = Image.merge('RGBA', (channel, channel.transpose(Image.Transpose.FLIP_LEFT_RIGHT),
                                channel.transpose(Image.Transpose.FLIP_TOP_BOTTOM), channel))
    if mode == 'P':
        image = image.quantize(colors=64)
        image.info['transparency'] = 0
    else:
        image = image.convert(mode)
    source = tmp_path / 'source.png'
    target = tmp_path / 'crop.png'
    exif = Image.Exif()
    exif[274] = 6
    image.save(source, exif=exif)
    original = source.read_bytes()

    x, y = 125, 91
    size = (width, height) if width <= 1024 else (1024, round(1024 * height / width))
    with Image.open(source) as opened:
        upright = ImageOps.exif_transpose(opened)
        expected = upright.convert(image_encoding.resample_mode(upright))
        expected = expected.crop((x, y, x + width, y + height)).resize(size, Image.Resampling.LANCZOS)

    assert datasets._crop_resize_file(source, x, y, width, height, dst=target) == (True, 1024 / max(width, height))
    assert source.read_bytes() == original
    with Image.open(target) as actual:
        assert actual.size == size
        assert actual.mode == expected.mode
        assert actual.tobytes() == expected.tobytes()
        assert actual.getexif().get(274, 1) == 1
