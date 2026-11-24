#!/usr/bin/env python3
"""Publish the self-contained build on the shared host and verify it in place.

The layout matches the other sites of the host: one directory per commit under
~/apps/doom/releases, an atomic `current` symlink and the existing shared Caddy
vhost. Only the committed artifact of the published commit is uploaded, its
SHA-256 is checked on both sides of the wire, the previous release is kept so a
rollback is a single symlink move, and the public URL is re-read and compared
before the run is called a success.
"""
import argparse
import hashlib
import json
import pathlib
import subprocess
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
HOST = 'amiga'
APP = 'apps/doom'
URL = 'https://doom.estrasse.fr/'
ARTIFACT = 'dist/index.html'
REVISION = '([0-9]+\\.[0-9]+\\.[0-9]+-[0-9a-f]{12})'


def digest(payload):
    return hashlib.sha256(payload).hexdigest()


def command(argv, cwd=None):
    result = subprocess.run(argv, cwd=cwd, capture_output=True, text=True)
    if result.returncode:
        raise SystemExit(' '.join(argv) + ' failed: ' + (result.stderr or result.stdout).strip())
    return result.stdout.strip()


def remote(script):
    return command(['ssh', '-o', 'BatchMode=yes', HOST, script])


def committed(revision):
    result = subprocess.run(['git', 'show', revision + ':' + ARTIFACT], cwd=ROOT, capture_output=True)
    if result.returncode:
        raise SystemExit('committed artifact missing at %s: %s' % (revision, result.stderr.decode().strip()))
    return result.stdout


def releases():
    """Release directories, newest first."""
    out = remote('ls -1t %s/releases 2>/dev/null || true' % APP)
    return [name for name in out.splitlines() if name]


def current():
    out = remote('readlink %s/current 2>/dev/null || true' % APP)
    return out.rsplit('/', 1)[-1] if out else None


def flip(target):
    remote('ln -sfn ~/%s/releases/%s %s/current.tmp && mv -Tf %s/current.tmp %s/current'
           % (APP, target, APP, APP, APP))


def prune(keep, protected):
    for name in [entry for entry in releases() if entry not in protected][keep:]:
        remote('rm -rf %s/releases/%s' % (APP, name))


def verify(revision, payload):
    body = urllib.request.urlopen(URL, timeout=60).read()
    expected = digest(payload)
    if digest(body) != expected:
        raise SystemExit('served bytes differ from %s: %s' % (revision, digest(body)))
    found = set(__import__('re').findall(REVISION, body.decode('utf8', 'replace')))
    if len(found) != 1:
        raise SystemExit('served page does not carry exactly one build revision: %s' % sorted(found))
    return {'url': URL, 'httpBytes': len(body), 'sha256': expected, 'buildRevision': found.pop()}


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--ref', default='main', help='commit to publish (default: main)')
    parser.add_argument('--keep', type=int, default=3, help='releases kept on the host')
    parser.add_argument('--rollback', action='store_true', help='point current at the previous release')
    parser.add_argument('--dry-run', action='store_true', help='report the plan without touching the host')
    args = parser.parse_args()

    revision = command(['git', 'rev-parse', args.ref + '^{commit}'], cwd=ROOT)
    live = current()

    if args.rollback:
        if not live:
            raise SystemExit('no release is current; nothing to roll back')
        candidates = [name for name in releases() if name != live]
        if not candidates:
            raise SystemExit('only one release exists; nothing to roll back to')
        target = candidates[0]
        if args.dry_run:
            print(json.dumps({'action': 'rollback', 'from': live, 'to': target}))
            return
        flip(target)
        print(json.dumps({'action': 'rollback', 'from': live, 'to': target,
                          'verified': verify(target, committed(target))}, ensure_ascii=False))
        return

    payload = committed(revision)
    expected = digest(payload)
    plan = {'action': 'publish', 'commit': revision, 'sha256': expected,
            'bytes': len(payload), 'from': live, 'to': revision}
    if args.dry_run:
        plan['upload'] = live != revision
        print(json.dumps(plan, ensure_ascii=False))
        return

    if live != revision:
        remote('rm -rf %s/releases/%s.staging && mkdir -p %s/releases/%s.staging' % (APP, revision, APP, revision))
        staging = '/tmp/doom-ferro-%s.html' % revision[:12]
        pathlib.Path(staging).write_bytes(payload)
        command(['scp', '-o', 'BatchMode=yes', staging, '%s:~/%s/releases/%s.staging/index.html' % (HOST, APP, revision)])
        command(['rm', '-f', staging])
        seen = remote('cd %s/releases/%s.staging && sha256sum index.html' % (APP, revision)).split()[0]
        if seen != expected:
            remote('rm -rf %s/releases/%s.staging' % (APP, revision))
            raise SystemExit('uploaded artifact differs: %s' % seen)
        remote('mv %s/releases/%s.staging %s/releases/%s' % (APP, revision, APP, revision))
        flip(revision)

    prune(max(1, args.keep), {revision, live} - {None})
    plan['verified'] = verify(revision, payload)
    plan['releases'] = releases()
    print(json.dumps(plan, ensure_ascii=False))


if __name__ == '__main__':
    main()
