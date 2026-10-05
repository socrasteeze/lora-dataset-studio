"""Online video-bank imports stay refused. Local folder import is a different route."""
import pytest


def test_video_bank_service_refuses_online_import():
    from lds_video.video_bank_service import scrape_import_to_video_bank
    with pytest.raises(ValueError, match='offline'):
        scrape_import_to_video_bank(
            'local', [{'url': 'https://example.invalid/clip.mp4'}], name='offline')
