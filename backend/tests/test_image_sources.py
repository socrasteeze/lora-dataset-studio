"""Synthetic acquisition regressions. No live provider, account, or media."""
import hashlib
import io
import json
from pathlib import Path
import socket
import threading
import zipfile

from PIL import Image
import pytest

from app import config as cfg
from app.extensions import db
from app.models import FaceDataset, FaceDatasetImage, ImageSourceJob as Job
from app.models import ImageSourceAsset as Asset, BankImage
from app.services import image_sources as sources, image_source_metadata as metadata
from app.services import image_source_network as network
from app.services.image_source_import import import_job


@pytest.fixture
def source_context(app):
    with app.app_context():
        yield app


def picture():
    out = io.BytesIO()
    Image.new('RGB', (80, 96), (20, 40, 60)).save(out, 'PNG')
    return out.getvalue()


def make_job(destination='bank', target_id=None, **kwargs):
    job = Job(user_id=cfg.LOCAL_USER, provider='danbooru',
              url='https://danbooru.donmai.us/posts?tags=synthetic',
              destination=destination, target_id=target_id, name='Demo', **kwargs)
    db.session.add(job)
    db.session.commit()
    return job


def make_asset(job, index=1, kind='image'):
    item = metadata.media_item('danbooru', job.url,
                               f'https://cdn.example.test/{index}.png',
                               {'id': index, 'extension': 'png', 'tags': 'synthetic blue',
                                'tags_artist': ['synthetic_artist'], 'width': 80, 'height': 96})
    asset = Asset(job_id=job.id, source_key=item['key'], url=item['url'], kind=kind,
                  metadata_json=json.dumps(item['metadata']))
    db.session.add(asset)
    db.session.commit()
    return asset


def cache(job, asset, raw=None):
    raw = picture() if raw is None else raw
    asset.sha256 = hashlib.sha256(raw).hexdigest()
    asset.local_name = asset.sha256 + ('.zip' if asset.kind == 'archive' else '.png')
    meta = json.loads(asset.metadata_json)
    meta['sha256'] = asset.sha256
    asset.metadata_json = json.dumps(meta)
    sources._write(job, asset.local_name, raw)
    db.session.commit()


@pytest.mark.parametrize('url', [
    'file:///private', 'https://internal.local/posts',
    'https://user:secret@danbooru.donmai.us/posts', 'https://127.0.0.1/posts',
    'https://danbooru.donmai.us:8443/posts',
    'https://danbooru.donmai.us/posts?api_key=synthetic',
    'https://danbooru.donmai.us/posts\ninvalid',
])
def test_source_rejects_unsafe_urls(url):
    with pytest.raises(ValueError):
        metadata.source_url(url)


@pytest.mark.parametrize('provider', ['danbooru', 'gelbooru', 'e621', 'e926', 'rule34', 'paheal'])
def test_tag_queries_round_trip_the_provider(provider):
    url = metadata.search_url(provider, 'synthetic_tag -synthetic_other')
    assert metadata.source_url(url)[0] == provider


def test_scan_preserves_tags_and_stable_identity_without_signed_query():
    meta = {'id': 42, 'extension': 'png', 'md5': 'synthetic',
            'tags_artist': ['synthetic_artist'], 'tags': 'blue synthetic', 'rating': 's'}
    first = metadata.media_item('danbooru', 'https://danbooru.donmai.us/posts',
                                'https://cdn.example.test/42.png?token=one', meta)
    second = metadata.media_item('danbooru', 'https://danbooru.donmai.us/posts',
                                 'https://cdn.example.test/42.png?token=two', meta)
    assert first['key'] == second['key']
    assert first['metadata']['tags']['artist'] == ['synthetic_artist']
    assert first['metadata']['source_url'] == 'https://danbooru.donmai.us/posts/42'
    assert 'token' not in json.dumps(first['metadata'])


def test_archive_is_not_an_image_or_preview():
    assert metadata.media_item('pawchive', 'https://pawchive.pw/service/user/1',
                                'https://cdn.example.test/1.zip', {'extension': 'zip'})['kind'] == 'archive'
    assert metadata.media_item('danbooru', 'https://danbooru.donmai.us/posts',
                                'https://cdn.example.test/1.webm', {'extension': 'webm'})['kind'] == 'video'
    assert metadata.media_item('pawchive', 'https://pawchive.pw/service/user/1',
                                'https://cdn.example.test/1.png', {'extension': 'png', 'preview_only': True}) is None


@pytest.mark.parametrize('address', ['127.0.0.1', '10.0.0.1', '169.254.169.254', '::1', '::ffff:127.0.0.1'])
def test_network_rejects_non_public_dns(monkeypatch, address):
    monkeypatch.setattr(socket, 'getaddrinfo', lambda *a, **kw: [(0, 0, 0, '', (address, 443))])
    with pytest.raises(network.SourceNetworkError, match='private or reserved'):
        network.public_address('cdn.example.test')


def test_mixed_dns_answer_fails_closed(monkeypatch):
    monkeypatch.setattr(socket, 'getaddrinfo', lambda *a, **kw: [
        (0, 0, 0, '', ('8.8.8.8', 443)), (0, 0, 0, '', ('127.0.0.1', 443))])
    with pytest.raises(network.SourceNetworkError):
        network.public_address('cdn.example.test')


def test_extractor_proxy_rejects_private_connect_targets():
    import base64
    from urllib.parse import urlsplit
    with network.extractor_proxy() as proxy:
        url = urlsplit(proxy)
        auth = base64.b64encode(f'{url.username}:{url.password}'.encode()).decode()
        with socket.create_connection((url.hostname, url.port), timeout=5) as client:
            client.sendall(('CONNECT 127.0.0.1:443 HTTP/1.1\r\n'
                            f'Proxy-Authorization: Basic {auth}\r\n\r\n').encode())
            assert b'403 Forbidden' in client.recv(1024)


@pytest.mark.parametrize('provider', ['pawchive', 'pawchive.st'])
def test_pawchive_uses_expanded_originals_without_incremental_abort(source_context, provider):
    job = make_job()
    job.provider = provider
    config = sources.extractor_config(job, 'http://proxy.example.test')
    site = config['extractor']['pawchive']
    assert site['expand'] and site['original'] and not site['previews']
    assert 'skip' not in site and 'actions' not in site
    assert config['extractor']['proxy'] == 'http://proxy.example.test'


def test_partial_scan_commits_progress_and_retains_metadata(source_context, monkeypatch):
    job = make_job(limit=3)
    def events(*args):
        yield [3, 'https://cdn.example.test/1.png', {'id': 1, 'extension': 'png', 'tags': 'synthetic'}]
        raise ValueError('synthetic failure')
    monkeypatch.setattr(sources, 'scan_events', events)
    with pytest.raises(ValueError, match='synthetic failure'):
        sources._scan(job, threading.Event(), {})
    db.session.expire_all()
    assert db.session.get(Job, job.id).position == 1
    assert Asset.query.filter_by(job_id=job.id).count() == 1
    assert 'file-range' not in sources.extractor_config(job, 'http://proxy.example.test')['extractor']


def test_boot_recovery_never_launches_network(source_context, monkeypatch):
    job = make_job(state='running')
    monkeypatch.setattr(sources, 'scan_events', lambda *a: pytest.fail('recovery started network work'))
    sources.recover()
    assert job.state == 'interrupted'
    assert 'Resume' in job.error


def test_verified_download_retry_uses_cached_bytes(source_context, monkeypatch):
    job = make_job()
    asset = make_asset(job)
    cache(job, asset)
    monkeypatch.setattr(sources, 'worker_events', lambda *a, **kw: pytest.fail('verified bytes downloaded again'))
    sources._download(job, threading.Event())
    assert asset.local_name and not asset.error


def test_changed_cache_downloads_a_verified_replacement(source_context, monkeypatch):
    job = make_job()
    asset = make_asset(job)
    cache(job, asset)
    sources.local_path(job, asset).write_bytes(b'changed')
    calls = []
    def worker(job, cancel, control, extra):
        calls.append(True)
        path = Path(extra['directory']) / (asset.source_key + '.png')
        path.write_bytes(picture())
        yield [4, asset.source_key, {'file': path.name}]
    monkeypatch.setattr(sources, 'worker_events', worker)
    sources._download(job, threading.Event())
    assert calls == [True]
    assert hashlib.sha256(sources.local_path(job, asset).read_bytes()).hexdigest() == asset.sha256


def zip_bytes(entries):
    out = io.BytesIO()
    with zipfile.ZipFile(out, 'w') as archive:
        for name, data in entries:
            archive.writestr(name, data)
    return out.getvalue()


@pytest.mark.parametrize('name', ['../image.png', '/image.png', 'C:/image.png', 'a/../../image.png'])
def test_zip_traversal_is_rejected_before_any_extraction(source_context, name):
    job = make_job()
    asset = make_asset(job, kind='archive')
    with pytest.raises(ValueError, match='unsafe'):
        sources._archive(job, asset, zip_bytes([('image.png', picture()), (name, picture())]), threading.Event())
    assert Asset.query.filter_by(job_id=job.id).count() == 1
    assert not sources.root(job).exists()


def test_zip_images_are_idempotent_and_original_archive_is_retained(source_context):
    job = make_job()
    asset = make_asset(job, kind='archive')
    raw = zip_bytes([('image-01.png', picture()), ('notes.txt', b'synthetic')])
    sources._archive(job, asset, raw, threading.Event())
    sources._archive(job, asset, raw, threading.Event())
    assert Asset.query.filter_by(job_id=job.id, kind='image').count() == 1
    assert sources.local_path(job, asset).read_bytes() == raw


def test_bank_import_preserves_bytes_tags_and_pending_review(source_context):
    job = make_job()
    asset = make_asset(job)
    cache(job, asset)
    import_job(job, threading.Event())
    import_job(job, threading.Event())
    rows = BankImage.query.filter_by(bank_id=job.target_id).all()
    assert len(rows) == 1 and rows[0].status == 'pending'
    assert json.loads(rows[0].source_metadata)['tags']['artist'] == ['synthetic_artist']
    from app.services.image_bank_service import get_bank
    path = Path(get_bank(cfg.LOCAL_USER, job.target_id).source_path) / rows[0].relpath
    assert path.read_bytes() == picture()


def test_existing_bank_bytes_keep_caption_and_review_state(source_context):
    from app.services import image_bank_service as banks
    bank = banks._stage_import_bank(cfg.LOCAL_USER, 'Demo')
    path = Path(bank.source_path) / 'image-01.png'
    path.write_bytes(picture())
    banks._insert_bank_images(bank.id, bank.source_path, ['image-01.png'])
    row = BankImage.query.filter_by(bank_id=bank.id).one()
    row.status, row.caption = 'keep', 'synthetic caption'
    db.session.commit()
    job = make_job(target_id=bank.id)
    asset = make_asset(job)
    cache(job, asset)
    import_job(job, threading.Event())
    assert BankImage.query.filter_by(bank_id=bank.id).count() == 1
    assert row.status == 'keep' and row.caption == 'synthetic caption'
    assert metadata.normalize(row.source_metadata)['sha256'] == asset.sha256


def test_dataset_import_retries_once_and_leaves_caption_untouched(source_context):
    dataset = FaceDataset(user_id=cfg.LOCAL_USER, name='Demo', trigger_word='demo', kind='concept')
    db.session.add(dataset)
    db.session.commit()
    job = make_job('dataset', dataset.id)
    asset = make_asset(job)
    cache(job, asset)
    import_job(job, threading.Event())
    row = FaceDatasetImage.query.filter_by(dataset_id=dataset.id).one()
    row.caption, row.caption_origin = 'synthetic caption', 'asserted'
    db.session.commit()
    import_job(job, threading.Event())
    assert FaceDatasetImage.query.filter_by(dataset_id=dataset.id).count() == 1
    assert row.caption == 'synthetic caption' and row.status == 'pending'
    assert json.loads(row.source_metadata)['tags']['artist'] == ['synthetic_artist']


def test_read_routes_are_local_and_paginated(source_context, client, monkeypatch):
    from app import capabilities
    monkeypatch.setattr(capabilities, 'probe_image_source_deps', lambda: {'ok': True})
    monkeypatch.setattr(sources, 'fetch', lambda *a, **kw: pytest.fail('read route started a download'))
    job = make_job()
    for index in range(30):
        make_asset(job, index)
    response = client.get(f'/api/image-sources/jobs/{job.id}').get_json()
    assert len(response['items']) == 24 and response['filtered_count'] == 30
    assert client.get('/api/image-sources').status_code == 200
    assert not sources.root(job).exists()


def test_selection_cannot_reach_another_job(source_context, client):
    first, second = make_job(), make_job()
    asset = make_asset(second)
    result = client.post(f'/api/image-sources/jobs/{first.id}/selection',
                         json={'ids': [asset.id], 'selected': False})
    assert result.status_code == 400
    assert asset.selected


def test_missing_dependency_offers_setup_without_creating_job(source_context, client, monkeypatch):
    from app import capabilities
    monkeypatch.setattr(capabilities, 'probe_image_source_deps', lambda: {'ok': False})
    response = client.post('/api/image-sources/jobs', json={
        'url': 'https://danbooru.donmai.us/posts', 'destination': 'bank'})
    assert response.status_code == 409
    assert response.get_json()['action'] == 'image_source_extras'
    assert Job.query.count() == 0


def test_source_credentials_are_write_only(source_context, client, monkeypatch):
    from app import capabilities
    saved = {}
    monkeypatch.setattr(cfg, 'secret', lambda key: saved.get(key))
    monkeypatch.setattr(cfg, 'set_secrets', lambda values: saved.update(values))
    monkeypatch.setattr(capabilities, 'probe_image_source_deps', lambda: {'ok': True})
    response = client.post('/api/image-sources/credentials/danbooru', json={'api_key': 'synthetic-secret'})
    assert response.status_code == 200
    assert 'synthetic-secret' not in client.get('/api/image-sources').get_data(as_text=True)
    assert json.loads(saved['IMAGE_SOURCE_CREDENTIALS'])['danbooru']['api_key'] == 'synthetic-secret'


def test_worker_uses_the_pinned_gallery_job_without_a_network_request(monkeypatch):
    import copy
    import logging
    import sys
    from gallery_dl import config, extractor
    from gallery_dl.extractor.common import Extractor, Message
    from app.scrape import image_source_worker

    class Synthetic(Extractor):
        category = 'synthetic'
        subcategory = 'post'
        pattern = r'https://example\.invalid/source'

        def items(self):
            yield Message.Directory, '', {'id': 1}
            yield Message.Url, 'https://cdn.example.test/1.png', {'id': 1, 'extension': 'png', 'tags': 'synthetic'}

    old_config, old_logging = copy.deepcopy(config._config), logging.root.manager.disable
    output = io.StringIO()
    monkeypatch.setattr(extractor, 'find', lambda url, *a, **kw: Synthetic.from_url(url))
    monkeypatch.setattr(sys, 'stdin', io.StringIO(json.dumps({
        'provider': 'synthetic', 'url': 'https://example.invalid/source',
        'proxy': 'http://proxy.example.test', 'limit': 1,
        'config': {'output': {'jsonl': True}, 'extractor': {}}})))
    monkeypatch.setattr(sys, 'stdout', output)
    try:
        assert image_source_worker.main() == 0
        events = [json.loads(line) for line in output.getvalue().splitlines()]
        item = next(event for event in events if event[0] == 3)[2]['acquisition_item']
        assert item['metadata']['tags']['general'] == ['synthetic']
    finally:
        config.clear()
        config._config.update(old_config)
        logging.disable(old_logging)


@pytest.mark.parametrize('url,provider', [
    ('https://www.pixiv.net/artworks/1', 'pixiv.net'),
    ('https://x.com/demo/status/1', 'twitter'),
    ('https://youtu.be/synthetic', 'youtube'),
    ('http://boards.example.test/thread/1', 'boards.example.test'),
])
def test_all_public_source_hosts_are_candidates(url, provider):
    assert metadata.source_url(url)[0] == provider
    value = metadata.normalize({'platform': provider, 'acquisition': True,
                                'source_url': url, 'engine': 'yt-dlp'})
    assert value is not None and value['source_url'] == url


@pytest.mark.parametrize('status,expected', [(0, ['gallery-dl']), (16, ['gallery-dl']),
                                           (4, ['gallery-dl']), (64, ['gallery-dl', 'yt-dlp'])])
def test_resolver_falls_through_only_when_unsupported(monkeypatch, status, expected):
    from app.scrape import image_source_engines as engines
    calls = []
    monkeypatch.setattr(engines, '_configure', lambda request: None)
    monkeypatch.setattr(engines, 'emit', lambda value: None)
    monkeypatch.setattr(engines, '_gdl', lambda *args: calls.append('gallery-dl') or status)
    monkeypatch.setattr(engines, '_yt', lambda *args: calls.append('yt-dlp') or 0)
    assert engines.run({}) == (0 if status == 64 else status)
    assert calls == expected


def test_configured_local_modules_load_before_builtins(tmp_path, monkeypatch):
    import copy
    import sys
    from gallery_dl import config, extractor
    from app.scrape import image_source_engines as engines
    module = '_lds_synthetic_extractor_01'
    (tmp_path / (module + '.py')).write_text('SYNTHETIC = True\n', encoding='utf-8')
    old = copy.deepcopy(config._config)
    monkeypatch.setattr(extractor, '_module_iter', extractor._module_iter)
    try:
        engines._configure({'proxy': 'http://proxy.example.test', 'config': {
            'extractor': {'module-sources': [str(tmp_path), None]}}})
        assert next(extractor._module_iter).__name__ == module
    finally:
        sys.modules.pop(module, None)
        config.clear()
        config._config.update(old)


@pytest.mark.parametrize('domain,expected', [('', 'images.example.test'), ('.x.com', '.x.com')])
def test_cookie_scope_preserves_extractor_domains(monkeypatch, domain, expected):
    import copy
    from gallery_dl import config, extractor
    from gallery_dl.extractor.common import Extractor
    from app.scrape import image_source_engines as engines
    class Synthetic(Extractor):
        category, subcategory = 'synthetic', 'post'
        pattern = r'https://images\.example\.test/post/1'
    instance = Synthetic.from_url('https://images.example.test/post/1')
    instance.cookies_domain = domain
    monkeypatch.setattr(extractor, 'find', lambda url: instance)
    old = copy.deepcopy(config._config)
    try:
        config.clear()
        assert engines._gdl({'url': instance.url, 'provider': 'synthetic',
                             'credentials': {'cookies': 'demo=synthetic'}}) == 0
        assert instance.cookies_domain == expected
    finally:
        config.clear()
        config._config.update(old)


def test_nested_gallery_scan_uses_one_media_window(monkeypatch):
    import copy
    from gallery_dl import config, extractor
    from gallery_dl.extractor.common import Extractor, Message
    from app.scrape import image_source_engines as engines

    class Album(Extractor):
        category, subcategory = 'synthetic', 'album'
        pattern = r'https://example\.invalid/album/(\d+)'
        def items(self):
            yield Message.Directory, '', {}
            for index in range(2):
                ident = int(self.groups[0]) * 2 + index
                yield Message.Url, f'https://cdn.example.test/{ident}.png', {'id': ident, 'extension': 'png'}

    class Collection(Extractor):
        category, subcategory = 'synthetic', 'collection'
        pattern = r'https://example\.invalid/source'
        def items(self):
            for index in range(3):
                yield Message.Queue, f'https://example.invalid/album/{index}', {'_extractor': Album}

    old = copy.deepcopy(config._config)
    messages = []
    monkeypatch.setattr(extractor, 'find', lambda url: Collection.from_url(url))
    monkeypatch.setattr(engines, 'emit', messages.append)
    try:
        config.clear()
        assert engines._gdl({'provider': 'synthetic', 'url': 'https://example.invalid/source',
                             'start': 2, 'limit': 2, 'credentials': {}}) == 0
        assert [message[2]['acquisition_item']['metadata']['post_id'] for message in messages] == ['2', '3']
    finally:
        config.clear()
        config._config.update(old)


def test_generic_media_is_downloadable_without_entering_image_intake(source_context, monkeypatch):
    job = make_job(options_json=json.dumps({'media': 'all'}))
    item = metadata.media_item('generic', 'https://images.example.test/post/1',
                               'https://cdn.example.test/file.mp4', {'extension': 'mp4'})
    asset = Asset(job_id=job.id, source_key=item['key'], url=item['url'], kind='video',
                  metadata_json=json.dumps(item['metadata']))
    db.session.add(asset)
    db.session.commit()
    def worker(job, cancel, control, extra):
        path = Path(extra['directory']) / (asset.source_key + '.mp4')
        path.write_bytes(b'synthetic-video-container')
        yield [4, asset.source_key, {'file': path.name}]
    monkeypatch.setattr(sources, 'worker_events', worker)
    sources._download(job, threading.Event())
    assert sources.local_path(job, asset).read_bytes() == b'synthetic-video-container'
    with pytest.raises(ValueError, match='Select downloaded images'):
        import_job(job, threading.Event())


def test_cancelled_queued_job_never_claims_the_extractor(source_context, monkeypatch):
    class DeferredThread:
        def __init__(self, **kwargs):
            pass
        def start(self):
            pass
    monkeypatch.setattr(sources.threading, 'Thread', DeferredThread)
    monkeypatch.setattr(sources, 'scan_events', lambda *a: pytest.fail('cancelled job reached the extractor'))
    job = make_job()
    sources.launch(source_context, job, 'scan')
    sources.stop(source_context, job)
    sources._drain(source_context)
    db.session.expire_all()
    assert db.session.get(Job, job.id).state == 'cancelled'


def test_rescan_refreshes_temporary_urls_without_dropping_verified_files(source_context, monkeypatch):
    job = make_job(limit=1)
    asset = make_asset(job)
    cache(job, asset)
    original_path = sources.local_path(job, asset)
    original_meta = {'id': 1, 'extension': 'png', 'tags': 'synthetic blue',
                     'tags_artist': ['synthetic_artist'], 'width': 80, 'height': 96}
    monkeypatch.setattr(sources, 'scan_events', lambda *a: iter([
        [3, 'https://cdn.example.test/1.png?token=renewed', original_meta]]))
    sources._scan(job, threading.Event(), {})
    assert Asset.query.filter_by(job_id=job.id).count() == 1
    assert asset.url.endswith('token=renewed') and original_path.read_bytes() == picture()


def test_zip_links_are_rejected_before_extraction(source_context):
    job = make_job()
    asset = make_asset(job, kind='archive')
    output = io.BytesIO()
    with zipfile.ZipFile(output, 'w') as archive:
        link = zipfile.ZipInfo('image.png')
        link.external_attr = 0o120777 << 16
        archive.writestr(link, b'synthetic-target')
    with pytest.raises(ValueError, match='unsafe'):
        sources._archive(job, asset, output.getvalue(), threading.Event())


def test_dataset_busy_guard_preserves_local_files_and_defers_import(source_context):
    from app.services import dataset_activity
    dataset = FaceDataset(user_id=cfg.LOCAL_USER, name='Demo', trigger_word='demo')
    db.session.add(dataset)
    db.session.commit()
    job = make_job('dataset', dataset.id)
    asset = make_asset(job)
    cache(job, asset)
    token = dataset_activity.begin_exclusive(dataset.id, 'backup')
    try:
        with pytest.raises(ValueError, match='active work'):
            import_job(job, threading.Event())
        assert not asset.imported and sources.local_path(job, asset).read_bytes() == picture()
    finally:
        dataset_activity.end(token)
