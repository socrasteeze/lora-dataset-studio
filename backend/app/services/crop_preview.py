"""Bounded, upright previews for drawing a crop on the full source frame."""
import hashlib
import io
import os
import stat
import warnings
from functools import lru_cache

from PIL import ExifTags, Image, ImageOps

from . import image_encoding
from .dataset_thumbs import SOURCE_MAX_BYTES

CROP_PREVIEW_SIDE = 1024


def _generation(info):
    return (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns)


@lru_cache(maxsize=32)
def _encode_preview(path, generation):
    with open(path, 'rb') as source, warnings.catch_warnings():
        if _generation(os.fstat(source.fileno())) != generation:
            raise OSError('Crop preview source changed')
        warnings.simplefilter('error', Image.DecompressionBombWarning)
        with Image.open(source) as image:
            if image.format not in image_encoding.EDITABLE_FORMATS or getattr(image, 'n_frames', 1) != 1:
                return None
            width, height = image_encoding.validate_input_header_dimensions(image, label='crop preview')
            turn = image.getexif().get(ExifTags.Base.Orientation, 1)
            size = (height, width) if turn in (5, 6, 7, 8) else (width, height)

            scale = CROP_PREVIEW_SIDE / max(width, height)
            if scale < 1:
                # With JPEG, decode at the smallest DCT scale that covers the preview.
                image.draft(None, (max(1, round(width * scale)), max(1, round(height * scale))))
            ImageOps.exif_transpose(image, in_place=True)
            mode = image_encoding.resample_mode(image)
            icc = image.info.get('icc_profile')
            if not isinstance(icc, bytes) or len(icc) > 128 * 1024 or image.mode not in ('RGB', 'RGBA', 'P'):
                icc = b''
            preview = image if image.mode == mode else image.convert(mode)
            preview.thumbnail((CROP_PREVIEW_SIDE, CROP_PREVIEW_SIDE), Image.Resampling.LANCZOS)
            output = io.BytesIO()
            preview.save(output, 'WEBP', quality=82, method=0, icc_profile=icc)
        if _generation(os.fstat(source.fileno())) != generation:
            raise OSError('Crop preview source changed')
    payload = output.getvalue()
    etag = f'{size[0]}x{size[1]}-{hashlib.sha256(payload).hexdigest()}'
    return payload, size, etag


def load_crop_preview(path):
    """Return preview bytes and exact upright dimensions from the same generation."""
    try:
        info = os.stat(path)
        if stat.S_ISREG(info.st_mode) and info.st_size <= SOURCE_MAX_BYTES:
            return _encode_preview(path, _generation(info))
    except (OSError, ValueError, SyntaxError, MemoryError,
            Image.DecompressionBombError, Image.DecompressionBombWarning):
        pass
    return None
