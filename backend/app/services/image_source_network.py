"""Public-only, DNS-pinned HTTP(S) for explicitly started acquisition jobs.

The scoped CONNECT proxy applies the same rule inside gallery-dl's child.
No URL, cookie, query, or source filename enters a diagnostic message.
"""
import base64
import contextlib
import hmac
import http.client
import ipaddress
import secrets
import select
import socket
import socketserver
import ssl
import threading
import time
from urllib.parse import urljoin, urlsplit

from .image_source_metadata import web_url


class SourceNetworkError(ValueError):
    def __init__(self, message, kind='network'):
        super().__init__(message)
        self.kind = kind


def public_address(host, port=443):
    answers = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    addresses = list(dict.fromkeys(answer[4][0] for answer in answers))
    if not addresses:
        raise SourceNetworkError('The source did not resolve. Retry later.')
    for address in addresses:
        ip = ipaddress.ip_address(address)
        if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
            ip = ip.ipv4_mapped
        if not ip.is_global:
            raise SourceNetworkError('The source resolves to a private or reserved address.', 'blocked')
    return addresses[0]


class _PinnedHTTPS(http.client.HTTPSConnection):
    def connect(self):
        raw = socket.create_connection((public_address(self.host), self.port), self.timeout)
        try:
            self.sock = self._context.wrap_socket(raw, server_hostname=self.host)
        except BaseException:
            raw.close()
            raise


class _PinnedHTTP(http.client.HTTPConnection):
    def connect(self):
        self.sock = socket.create_connection((public_address(self.host, self.port), self.port), self.timeout)


def fetch(url, *, max_bytes, referer, cancel=None):
    """Bound bytes and redirects; resolve and pin each actual connection."""
    for _ in range(4):
        if cancel and cancel.is_set():
            raise InterruptedError()
        url = web_url(url)
        parts = urlsplit(url)
        connection = (_PinnedHTTPS(parts.hostname, timeout=15, context=ssl.create_default_context())
                      if parts.scheme == 'https' else _PinnedHTTP(parts.hostname, timeout=15))
        try:
            connection.request('GET', parts.path + ('?' + parts.query if parts.query else ''),
                               headers={'User-Agent': 'LDS-Image-Import/1.0',
                                        'Referer': referer, 'Accept-Encoding': 'identity',
                                        'Sec-Fetch-Dest': 'image', 'Sec-Fetch-Mode': 'no-cors',
                                        'Sec-Fetch-Site': 'same-site'})
            response = connection.getresponse()
            if response.status in (301, 302, 303, 307, 308):
                url = urljoin(url, response.getheader('Location', ''))
                continue
            if response.status == 429:
                raise SourceNetworkError('The source rate limit stopped this job. Resume later.', 'rate_limit')
            if response.status in (401, 403):
                raise SourceNetworkError('The source refused this file. Check source access.', 'auth')
            if response.status != 200:
                raise SourceNetworkError('The source did not return the file. Retry later.')
            length = response.getheader('Content-Length')
            if length and (not length.isdecimal() or int(length) > max_bytes):
                raise SourceNetworkError('The file exceeds the download limit.', 'size')
            data = bytearray()
            deadline = time.monotonic() + 180
            while True:
                if cancel and cancel.is_set():
                    raise InterruptedError()
                if time.monotonic() > deadline:
                    raise SourceNetworkError('The file download timed out. Retry later.')
                chunk = response.read(min(65536, max_bytes + 1 - len(data)))
                if not chunk:
                    return bytes(data)
                data.extend(chunk)
                if len(data) > max_bytes:
                    raise SourceNetworkError('The file exceeds the download limit.', 'size')
        finally:
            connection.close()
    raise SourceNetworkError('The source redirected too many times.', 'blocked')


class _Proxy(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True
    block_on_close = False

    def __init__(self, token):
        self.token = token
        self.slots = threading.BoundedSemaphore(4)
        super().__init__(('127.0.0.1', 0), _Tunnel)

    def process_request(self, request, address):
        if not self.slots.acquire(blocking=False):
            request.close()
            return
        try:
            super().process_request(request, address)
        except BaseException:
            self.slots.release()
            raise

    def process_request_thread(self, request, address):
        try:
            super().process_request_thread(request, address)
        finally:
            self.slots.release()

    def handle_error(self, request, client_address):
        pass  # Raw network failures must not print private request details.


class _Tunnel(socketserver.BaseRequestHandler):
    def handle(self):
        self.request.settimeout(15)
        header = bytearray()
        while b'\r\n\r\n' not in header:
            chunk = self.request.recv(1)
            if not chunk or len(header) >= 8192:
                return
            header.extend(chunk)
        lines = bytes(header).decode('ascii', errors='strict').split('\r\n')
        parts = lines[0].split()
        if len(parts) != 3:
            self.request.sendall(b'HTTP/1.1 403 Forbidden\r\n\r\n')
            return
        headers = dict(line.split(':', 1) for line in lines[1:] if ':' in line)
        auth = next((v.strip() for k, v in headers.items() if k.lower() == 'proxy-authorization'), '')
        expected = 'Basic ' + base64.b64encode(('lds:' + self.server.token).encode()).decode()
        if not hmac.compare_digest(auth, expected):
            self.request.sendall(b'HTTP/1.1 407 Proxy Authentication Required\r\n\r\n')
            return
        if parts[0] != 'CONNECT':
            return self._forward(parts, headers)
        target = urlsplit('https://' + parts[1])
        if (target.port != 443 or not target.hostname or target.username or target.password
                or target.path or target.query or target.fragment):
            self.request.sendall(b'HTTP/1.1 403 Forbidden\r\n\r\n')
            return
        try:
            address = public_address(target.hostname)
            upstream = socket.create_connection((address, 443), timeout=15)
        except (ValueError, OSError):
            self.request.sendall(b'HTTP/1.1 403 Forbidden\r\n\r\n')
            return
        with upstream:
            self.request.sendall(b'HTTP/1.1 200 Connection Established\r\n\r\n')
            deadline = time.monotonic() + 300
            while time.monotonic() < deadline:
                ready, _, _ = select.select([self.request, upstream], [], [], 1)
                for source in ready:
                    data = source.recv(65536)
                    if not data:
                        return
                    (upstream if source is self.request else self.request).sendall(data)

    def _forward(self, parts, headers):
        """Public HTTP forwarding for sources that do not provide HTTPS."""
        try:
            url = urlsplit(web_url(parts[1]))
            if url.scheme != 'http' or parts[0] not in ('GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'):
                raise ValueError()
            lower = {key.lower(): value.strip() for key, value in headers.items()}
            length = lower.get('content-length', '0')
            if not length.isdecimal() or int(length) > 1024 * 1024 or 'transfer-encoding' in lower:
                raise ValueError()
            address = public_address(url.hostname, 80)
            upstream = socket.create_connection((address, 80), timeout=15)
        except (ValueError, OSError):
            self.request.sendall(b'HTTP/1.1 403 Forbidden\r\n\r\n')
            return
        with upstream:
            target = url.path + ('?' + url.query if url.query else '')
            outgoing = [f'{parts[0]} {target} HTTP/1.1', f'Host: {url.netloc}', 'Connection: close']
            outgoing += [f'{key}: {value.strip()}' for key, value in headers.items()
                         if key.lower() not in ('host', 'connection', 'proxy-connection', 'proxy-authorization')]
            upstream.sendall(('\r\n'.join(outgoing) + '\r\n\r\n').encode('ascii'))
            remaining = int(length)
            while remaining:
                data = self.request.recv(min(65536, remaining))
                if not data:
                    return
                upstream.sendall(data)
                remaining -= len(data)
            deadline = time.monotonic() + 300
            while time.monotonic() < deadline:
                data = upstream.recv(65536)
                if not data:
                    return
                self.request.sendall(data)


@contextlib.contextmanager
def extractor_proxy():
    token = secrets.token_hex(24)
    with _Proxy(token) as server:
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            yield f'http://lds:{token}@127.0.0.1:{server.server_address[1]}'
        finally:
            server.shutdown()
            thread.join(timeout=2)
