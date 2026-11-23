#!/usr/bin/env python3
"""Recover the unchanged DOOM1.WAD from id's original Doom95 shareware archive."""
import hashlib
import io
import pathlib
import urllib.request
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
URL = 'https://ftp.fu-berlin.de/pc/games/idgames/idstuff/doom/win95/doom95.zip'
EXPECTED = '1d7d43be501e67d927e415e0b8f3e29c3bf33075e859721816f652a526cac771'

def main():
    target = ROOT / 'assets/doom1.wad'
    if target.is_file() and hashlib.sha256(target.read_bytes()).hexdigest() == EXPECTED:
        print('DOOM1.WAD shareware 1.9 already verified.'); return
    request = urllib.request.Request(URL, headers={'User-Agent': 'DOOM-FERRO shareware downloader'})
    with urllib.request.urlopen(request, timeout=60) as response:
        archive = response.read(32 * 1024 * 1024)
    with zipfile.ZipFile(io.BytesIO(archive)) as z:
        member = next((n for n in z.namelist() if pathlib.PurePosixPath(n.replace('\\', '/')).name.upper() == 'DOOM1.WAD'), None)
        if member is None: raise SystemExit('Original archive does not contain DOOM1.WAD.')
        data = z.read(member)
    if hashlib.sha256(data).hexdigest() != EXPECTED:
        raise SystemExit('Shareware hash mismatch. No file was replaced.')
    target.parent.mkdir(exist_ok=True)
    temporary = target.with_suffix('.wad.tmp'); temporary.write_bytes(data); temporary.replace(target)
    print(f'Authentic shareware 1.9 saved: {len(data)} bytes, SHA256 {EXPECTED}')

if __name__ == '__main__': main()
