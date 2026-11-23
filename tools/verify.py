#!/usr/bin/env python3
"""Run the real tests and reproducible build; optionally save measured evidence."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
QA = ROOT / 'docs' / 'qa'


def build_snapshot():
    result = subprocess.run([sys.executable, 'tools/build.py'], cwd=ROOT, text=True,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    if result.returncode:
        raise SystemExit(result.stdout)
    return {str(path.relative_to(ROOT / 'dist')): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in sorted((ROOT / 'dist').rglob('*')) if path.is_file()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write-report', action='store_true',
                        help='Save the exact TAP output and measured validation fields in docs/qa.')
    parser.add_argument('--check-committed', action='store_true',
                        help='Also require dist to match Git, including files not yet tracked.')
    args = parser.parse_args()
    tests = sorted(str(path.relative_to(ROOT)) for path in (ROOT / 'tests').glob('*.test.mjs'))
    if not tests:
        raise SystemExit('No test files found.')
    result = subprocess.run(['node', '--test', '--test-reporter=tap', *tests], cwd=ROOT,
                            text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    counts = {}
    for name in ('tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'):
        matches = re.findall(r'^# ' + name + r' (\d+)\s*$', result.stdout, flags=re.MULTILINE)
        if len(matches) != 1:
            raise SystemExit('Missing or ambiguous TAP summary: ' + name + '\n' + result.stdout)
        counts[name] = int(matches[0])
    if result.returncode or not counts['tests'] or counts['pass'] != counts['tests']:
        raise SystemExit('Qualification failed:\n' + result.stdout)
    first = build_snapshot()
    second = build_snapshot()
    if first != second:
        changed = sorted(path for path in first.keys() | second.keys() if first.get(path) != second.get(path))
        raise SystemExit('Build is not reproducible: ' + ', '.join(changed))
    if args.check_committed:
        status = subprocess.run(['git', 'status', '--porcelain=v1', '--untracked-files=all', '--', 'dist'],
                                cwd=ROOT, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        if status.returncode or status.stdout.strip():
            raise SystemExit('Committed dist does not match the fresh build:\n' + status.stdout)
    info = json.loads((ROOT / 'dist/build-info.json').read_text())
    measured = {
        'version': json.loads((ROOT / 'package.json').read_text())['version'],
        'nodeTests': counts['tests'],
        'nodeTestsPassed': True,
        'nodeSkipped': counts['skipped'],
        'reproducibleBuild': True,
        'buildFiles': len(second),
        'generation': info['generation'],
        'worldRepresentation': info['worldRepresentation'],
        'worldBillboards': info['worldBillboards'],
        'buildRevision': info['revision'],
        'importedMediaFiles': info['importedMediaFiles'],
        'buildBytes': sum(path.stat().st_size for path in (ROOT / 'dist').rglob('*') if path.is_file()),
        'testFiles': tests,
        'testLogSha256': hashlib.sha256(result.stdout.encode()).hexdigest(),
    }
    if args.write_report:
        QA.mkdir(parents=True, exist_ok=True)
        path = QA / 'validation.json'
        report = json.loads(path.read_text()) if path.exists() else {}
        report.pop('inputTests', None)  # Do not maintain a second hand-counted test total.
        report.update(measured)
        (QA / 'node-tests.txt').write_text(result.stdout)
        path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n')
    print(json.dumps(measured, ensure_ascii=False))


if __name__ == '__main__':
    main()
