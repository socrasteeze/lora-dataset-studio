"""Keep local-tool APIs on loopback, private LAN or the operator's tailnet."""
from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlsplit


_TAILNET = ipaddress.ip_network('100.64.0.0/10')


def _local_ip(value):
    try:
        address = ipaddress.ip_address(str(value).split('%', 1)[0])
    except ValueError:
        return False
    if address.version == 6 and address.ipv4_mapped is not None:
        address = address.ipv4_mapped
    return (address.is_loopback or address.is_private or address.is_link_local
            or (address.version == 4 and address in _TAILNET)) and not address.is_multicast


def local_api_url(value):
    """Validate without rewriting the configured address or sending an API call."""
    if not isinstance(value, str):
        raise ValueError('Set a local API URL in Settings.')
    url = value.strip()
    parsed = urlsplit(url)
    if (parsed.scheme not in ('http', 'https') or not parsed.hostname
            or parsed.username is not None or parsed.password is not None):
        raise ValueError('Use an HTTP or HTTPS URL for a local API.')
    port = parsed.port or (443 if parsed.scheme == 'https' else 80)
    host = parsed.hostname.lower().rstrip('.')
    if host == 'localhost' or _local_ip(host):
        return url
    try:
        ipaddress.ip_address(host.split('%', 1)[0])
    except ValueError:
        pass
    else:
        raise ValueError('Online API hosts are disabled. Use localhost or a private network address.')
    try:
        addresses = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except OSError as exc:
        raise ValueError('The local API host could not be resolved.') from exc
    if not addresses or not all(_local_ip(item[4][0]) for item in addresses):
        raise ValueError('Online API hosts are disabled. Use localhost or a private network address.')
    return url
