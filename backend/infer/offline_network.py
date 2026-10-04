"""Local-network-only inference; stdlib only, never installed in the host app.

The inference launcher selects this helper through its child environment.
Setup downloads run in their own jobs, without this child-process guard.
"""
from __future__ import annotations

import ipaddress
import socket
import sys


_TAILNET = ipaddress.ip_network('100.64.0.0/10')


def local_host(host):
    if host is None:
        return True
    if isinstance(host, bytes):
        host = host.decode('ascii', errors='replace')
    value = str(host).lower().rstrip('.')
    if value in ('', 'localhost'):
        return True
    try:
        address = ipaddress.ip_address(value.split('%', 1)[0])
    except ValueError:
        # Local DNS names may resolve here. The connect event still checks the
        # resolved IP, so a name resolving to a public host cannot be contacted.
        return ('.' not in value or value.endswith(
            ('.local', '.lan', '.home', '.internal', '.home.arpa', '.ts.net')))
    return (address.is_loopback or address.is_private or address.is_link_local
            or (address.version == 4 and address in _TAILNET)) and not address.is_multicast


def inference_audit(event, args):
    host = None
    if event == 'socket.getaddrinfo':
        host = args[0]
    elif event in ('socket.connect', 'socket.sendto'):
        sock = args[0]
        if sock.family == getattr(socket, 'AF_UNIX', None):
            return
        address = args[-1]
        if not isinstance(address, tuple) or not address:
            return
        host = address[0]
    else:
        return
    if not local_host(host):
        raise OSError('Inference is offline. Install or copy the required model '
                      'weights before starting this pass.')


def enforce_inference_offline():
    if getattr(sys, '_lds_inference_offline', False):
        return
    sys.addaudithook(inference_audit)
    sys._lds_inference_offline = True
