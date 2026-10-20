"""Image preparation keeps the former pixels and strips source metadata."""
import io

from PIL import Image, ImageDraw, ImageOps
import pytest

from app.services import vision_image


def _example(fmt, mode):
    image = Image.new(mode, (2048, 1200), (25, 90, 140, 160) if mode == 'RGBA' else (25, 90, 140))
    ImageDraw.Draw(image).rectangle((130, 100, 1600, 1100), fill='red')
    exif = Image.Exif()
    exif[274] = 6
    exif[270] = 'Synthetic private metadata'
    output = io.BytesIO()
    image.save(output, fmt, exif=exif)
    return output.getvalue()


def _previous_preparation(payload):
    with Image.open(io.BytesIO(payload)) as source:
        source.load()
        image = ImageOps.exif_transpose(source)
    if image.mode == 'RGBA':
        background = Image.new('RGB', image.size, (255, 255, 255))
        background.paste(image, mask=image.split()[-1])
        image = background
    elif image.mode != 'RGB':
        image = image.convert('RGB')
    clean = Image.new('RGB', image.size)
    clean.paste(image)
    clean.thumbnail((vision_image.VISION_MAX_SIDE, vision_image.VISION_MAX_SIDE), Image.LANCZOS)
    output = io.BytesIO()
    clean.save(output, 'JPEG', quality=90)
    return output.getvalue()


@pytest.mark.parametrize('fmt,mode', [('JPEG', 'RGB'), ('PNG', 'RGBA'), ('WEBP', 'RGB')])
def test_bounded_copy_keeps_identical_jpeg_bytes(fmt, mode):
    payload = _example(fmt, mode)
    actual = vision_image.ensure_vision_safe_jpeg(payload)
    assert actual == _previous_preparation(payload)
    assert b'Synthetic private metadata' not in actual
    with Image.open(io.BytesIO(actual)) as image:
        assert max(image.size) <= vision_image.VISION_MAX_SIDE
        assert not image.getexif()


def test_metadata_copy_is_allocated_only_after_resize(monkeypatch):
    payload = _example('JPEG', 'RGB')
    sizes = []
    create = Image.new

    def tracked(mode, size, *args, **kwargs):
        sizes.append(size)
        return create(mode, size, *args, **kwargs)

    monkeypatch.setattr(Image, 'new', tracked)
    assert vision_image.ensure_vision_safe_jpeg(payload)
    assert sizes and all(max(size) <= vision_image.VISION_MAX_SIDE for size in sizes)
