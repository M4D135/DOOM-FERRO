#!/usr/bin/env python3
"""Link the procedural game and byte-identical FERRO into one offline HTML.

The sources remain ESM. This linker supports the static, immutable exports used
here, preserves module scopes and dependency order, and rejects cycles or unknown
syntax. It uses no eval, dynamic import, encoded payload or external dependency.
"""
import hashlib
import json
import pathlib
import re
import shutil

ROOT = pathlib.Path(__file__).resolve().parents[1]
DEST = ROOT / 'dist'
IDENTIFIER = r'[A-Za-z_$][\w$]*'
IMPORT = re.compile(r'''(?m)^[ \t]*import\s+(?:(?P<bindings>[^;\n]+?)\s+from\s+)?['"](?P<path>[^'"]+)['"][ \t]*;[ \t]*$''')
DECLARATION = re.compile(r'(?m)^export\s+(?P<kind>const|function|class)\s+(?P<name>' + IDENTIFIER + r')')
NAMED = re.compile(r'(?m)^export\s*\{(?P<bindings>[^}\n]+)\}\s*;[ \t]*$')
DEFAULT = re.compile(r'(?m)^export\s+default\s+(?P<name>' + IDENTIFIER + r')\s*;[ \t]*$')


def dependency(path, specifier):
    if not re.fullmatch(r'\.{1,2}/[^?#]+\.js', specifier):
        raise SystemExit('Runtime imports must be local JavaScript: ' + specifier)
    return (path.parent / specifier).resolve()


def runtime_graph():
    ordered, visiting = {}, set()

    def visit(path):
        path = path.resolve()
        if path in visiting:
            raise SystemExit('Cyclic runtime imports are not supported: ' + str(path))
        if path in ordered:
            return
        if not path.is_relative_to(ROOT) or not path.is_file():
            raise SystemExit('Invalid runtime dependency: ' + str(path))
        relative = path.relative_to(ROOT)
        if relative.parts[0] not in ('src', 'vendor') or path.suffix != '.js':
            raise SystemExit('Only generated game code and FERRO belong to the runtime: ' + str(relative))
        source = path.read_text()
        visiting.add(path)
        for match in IMPORT.finditer(source):
            visit(dependency(path, match['path']))
        visiting.remove(path)
        ordered[path] = source

    visit(ROOT / 'src/app.js')
    if any(path.name in ('wad.js', 'audio.js', 'procedural-sprites.js') for path in ordered):
        raise SystemExit('Legacy media importers and world sprites must not enter the procedural build.')
    return ordered


def binding_pairs(text):
    pairs = []
    for entry in text.split(','):
        if not entry.strip():
            continue
        match = re.fullmatch(r'\s*(' + IDENTIFIER + r')(?:\s+as\s+(' + IDENTIFIER + r'))?\s*', entry)
        if not match:
            raise SystemExit('Unsupported module binding: ' + entry)
        pairs.append((match[1], match[2] or match[1]))
    return pairs


def linked_module(path, source):
    exports = {}

    def link_import(match):
        target = dependency(path, match['path']).relative_to(ROOT).as_posix()
        bindings = match['bindings']
        if target.startswith('vendor/'):
            if bindings:
                raise SystemExit('Canonical FERRO is loaded only for its global API.')
            return '// Canonical engine module is already inline: ' + target
        if not bindings:
            return '// Dependency initialized before this module: ' + target
        if not (bindings.startswith('{') and bindings.endswith('}')):
            raise SystemExit('Only named static imports are used by this linker: ' + bindings)
        fields = ', '.join(a if a == b else a + ': ' + b for a, b in binding_pairs(bindings[1:-1]))
        return 'const {' + fields + '} = __modules[' + json.dumps(target) + '];'

    def declaration(match):
        exports[match['name']] = match['name']
        return match['kind'] + ' ' + match['name']

    def named(match):
        for local, public in binding_pairs(match['bindings']):
            exports[public] = local
        return ''

    def default(match):
        exports['default'] = match['name']
        return ''

    source = IMPORT.sub(link_import, source)
    source = DECLARATION.sub(declaration, source)
    source = NAMED.sub(named, source)
    source = DEFAULT.sub(default, source)
    if re.search(r'(?m)^\s*(?:import|export)\b', source) or re.search(r'\bimport\s*[.(]', source):
        raise SystemExit('Unsupported module syntax in ' + str(path.relative_to(ROOT)))
    fields = ', '.join(json.dumps(public) + ': ' + local for public, local in exports.items())
    name = json.dumps(path.relative_to(ROOT).as_posix())
    return '__modules[' + name + '] = (() => {\n' + source + '\nreturn Object.freeze({' + fields + '});\n})();\n'


def safe_inline(text, element):
    if re.search(r'</' + element + r'\b', text, re.I):
        raise SystemExit('Unsafe HTML closing tag in inline ' + element + ' source.')
    return text


def main():
    manifest = json.loads((ROOT / 'vendor/ferro/manifest.json').read_text())
    for record in manifest['modules']:
        path = ROOT / 'vendor/ferro' / record['file']
        if hashlib.sha256(path.read_bytes()).hexdigest() != record['sha256']:
            raise SystemExit('Canonical FERRO module changed: ' + record['file'])
    graph = runtime_graph()
    version = json.loads((ROOT / 'package.json').read_text())['version']
    template, css = (ROOT / 'index.html').read_text(), (ROOT / 'style.css').read_text()
    digest = hashlib.sha256()
    for path, source in sorted(graph.items()):
        digest.update(str(path.relative_to(ROOT)).encode())
        digest.update(source.encode())
    digest.update(template.encode()); digest.update(css.encode())
    revision = version + '-' + digest.hexdigest()[:12]
    metadata = {'version': version, 'revision': revision, 'generation': 'procedural',
                'distribution': 'single self-contained HTML', 'offline': True, 'runtimeFiles': 1,
                'level': 'E1M1 geometric reference plan', 'mapGenerator': 'sector contour sweep',
                'importedMediaFiles': 0, 'worldBillboards': 0,
                'worldRepresentation': 'instanced procedural 3D triangle meshes', 'runtimeModules': len(graph),
                'worldDetailLevels': 3, 'proceduralSurfaceMaterials': True, 'modelGpuCacheMiB': 64,
                'physicallyBasedMaterials': True, 'surfaceMapsPerMaterial': 3, 'surfaceCpuCacheMiB': 48,
                'shadowMaps': 2, 'shadowFilter': 'hardware bilinear comparison, 3x3 PCF',
                'smoothNormalBuffer': True, 'contactAO': '12 samples, indirect fraction',
                'ferroVersion': manifest['version'], 'ferroModules': manifest['modules']}
    scripts = ['<script id="build-info" type="application/json">' + json.dumps(metadata, ensure_ascii=False) + '</script>']
    canonical, modules = [], []
    for path, source in graph.items():
        if path.relative_to(ROOT).parts[0] == 'vendor':
            canonical.append(path.name)
            scripts.append('<script data-ferro-module="' + path.name + '">' + safe_inline(source, 'script') + '</script>')
        else:
            modules.append(linked_module(path, source))
    if canonical != [record['file'] for record in manifest['modules'] if record.get('loaded')]:
        raise SystemExit('FERRO inline order differs from the locked manifest.')
    bundle = '(function () {\n"use strict";\nconst __modules = Object.create(null);\n' + '\n'.join(modules) + '\n})();\n'
    scripts.append('<script id="doom-runtime">' + safe_inline(bundle, 'script') + '</script>')
    if template.count('<link rel="stylesheet" href="style.css">') != 1 or template.count('<script type="module" src="src/app.js"></script>') != 1:
        raise SystemExit('The HTML template must have one stylesheet and one application entry point.')
    html = template.replace('<link rel="stylesheet" href="style.css">', '<style>' + safe_inline(css, 'style') + '</style>')
    html = html.replace('<script type="module" src="src/app.js"></script>', '\n'.join(scripts))
    html = re.sub(r'VERSION \d+\.\d+\.\d+', 'VERSION ' + version, html)
    if DEST.exists():
        shutil.rmtree(DEST)
    DEST.mkdir()
    (DEST / 'index.html').write_text(html)
    print(json.dumps({'build': 'dist/index.html', **metadata, 'bytes': (DEST / 'index.html').stat().st_size}))


if __name__ == '__main__':
    main()
