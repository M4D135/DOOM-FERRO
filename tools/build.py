#!/usr/bin/env python3
"""Build the self-contained, network-independent static game."""
import hashlib
import json
import pathlib
import shutil
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
DEST = ROOT / 'dist'
WAD_SHA256 = '1d7d43be501e67d927e415e0b8f3e29c3bf33075e859721816f652a526cac771'

def main():
    wad = ROOT / 'assets' / 'doom1.wad'
    if not wad.is_file():
        raise SystemExit('Missing assets/doom1.wad. Run python3 tools/fetch-shareware.py first.')
    if hashlib.sha256(wad.read_bytes()).hexdigest() != WAD_SHA256:
        raise SystemExit('DOOM1.WAD hash mismatch; expected authentic shareware 1.9.')
    manifest = json.loads((ROOT / 'vendor/ferro/manifest.json').read_text())
    files = manifest.get('files', manifest.get('modules', []))
    if isinstance(files, dict):
        files = [{'path': key, **value} if isinstance(value, dict) else {'path': key, 'sha256': value} for key, value in files.items()]
    for record in files:
        filename = record.get('path', record.get('file', record.get('name')))
        path = ROOT / filename
        if not path.exists():
            path = ROOT / 'vendor/ferro' / filename
        expected = record.get('sha256')
        if expected and hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            raise SystemExit(f'Canonical FERRO module changed: {filename}')
    DEST.mkdir(exist_ok=True)
    for name in ('index.html', 'style.css'):
        shutil.copy2(ROOT / name, DEST / name)
    for name in ('src', 'assets', 'vendor'):
        shutil.copytree(ROOT / name, DEST / name, dirs_exist_ok=True)
    total = sum(p.stat().st_size for p in DEST.rglob('*') if p.is_file())
    print(json.dumps({'build': 'dist/index.html', 'version': '0.1.0', 'wad_sha256': WAD_SHA256, 'bytes': total, 'network_at_runtime': 'same-origin assets only'}))

if __name__ == '__main__':
    main()
