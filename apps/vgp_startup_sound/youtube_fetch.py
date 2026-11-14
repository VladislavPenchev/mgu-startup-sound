#!/usr/bin/env python3
"""Run the pinned yt-dlp zipapp with the MGU uplink's DNS, without changing system DNS."""
import ipaddress
import json
import os
import socket
import struct
import sys
import time


def skip_name(packet, offset):
    for _ in range(128):
        n = packet[offset]
        if n & 0xc0 == 0xc0:
            return offset + 2
        if n == 0:
            return offset + 1
        if n > 63:
            raise ValueError('Invalid DNS name')
        offset += n + 1
    raise ValueError('DNS name too long')


def resolve(host, servers):
    labels = host.rstrip('.').encode('idna').split(b'.')
    if any(not x or len(x) > 63 for x in labels):
        raise socket.gaierror('Invalid hostname')
    transaction = os.urandom(2)
    query = transaction + b'\x01\x00\x00\x01\x00\x00\x00\x00\x00\x00' + b''.join(bytes([len(x)]) + x for x in labels) + b'\x00\x00\x01\x00\x01'
    for server in servers:
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
                sock.settimeout(3)
                sock.connect((server, 53))
                sock.send(query)
                packet = sock.recv(4096)
            if len(packet) < 12 or packet[:2] != transaction or packet[3] & 15 or not packet[2] & 128:
                continue
            offset = 12
            for _ in range(struct.unpack_from('!H', packet, 4)[0]):
                offset = skip_name(packet, offset) + 4
            ips = []
            for _ in range(struct.unpack_from('!H', packet, 6)[0]):
                offset = skip_name(packet, offset)
                kind, cls, _, length = struct.unpack_from('!HHIH', packet, offset)
                offset += 10
                if kind == 1 and cls == 1 and length == 4:
                    ips.append(socket.inet_ntoa(packet[offset:offset + 4]))
                offset += length
            if ips:
                return ips
        except (OSError, IndexError, ValueError, struct.error):
            continue
    raise socket.gaierror('MGU uplink DNS failed for ' + host)


def install_dns(lease):
    try:
        with open(lease, encoding='utf-8') as stream:
            servers = [str(ipaddress.IPv4Address(x)) for x in json.load(stream).get('dns', [])][:3]
    except (OSError, ValueError, TypeError):
        servers = []
    if not servers:
        return  # Desktop / a normally configured resolver.
    original = socket.getaddrinfo
    cache = {}

    def lookup(host, port, family=0, type=0, proto=0, flags=0):
        name = host.decode('ascii') if isinstance(host, bytes) else host
        try:
            ipaddress.ip_address(name)
            literal = True
        except ValueError:
            literal = False
        if not name or literal or name == 'localhost' or family == socket.AF_INET6:
            return original(host, port, family, type, proto, flags)
        entry = cache.get(name)
        if not entry or time.monotonic() - entry[0] > 30:
            entry = cache[name] = (time.monotonic(), resolve(name, servers))
        return [(socket.AF_INET, type or socket.SOCK_STREAM, proto, '', (ip, int(port or 0))) for ip in entry[1]]

    socket.getaddrinfo = lookup


if __name__ == '__main__':
    archive, lease = sys.argv[1:3]
    install_dns(lease)
    sys.path.insert(0, archive)
    sys.argv = [archive] + sys.argv[3:]
    import yt_dlp
    yt_dlp.main()
