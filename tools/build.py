#!/usr/bin/env python3
"""Build the procedural game from its ES-module graph, without imported media."""
import hashlib
import json
import pathlib
import re
import shutil

ROOT = pathlib.Path(__file__).resolve().parents[1]
DEST = ROOT / 'dist'
IMPORT = re.compile(r'''(?m)^(?P<before>\s*(?:import|export)\s+(?:[^;\n]*?\s+from\s+)?['"])(?P<path>\.{1,2}/[^'"]+\.m?js)(?P<after>['"])''')


def runtime_graph():
    pending = [ROOT / 'src/app.js']
    graph = {}
    while pending:
        path = pending.pop().resolve()
        if path in graph:
            continue
        if not path.is_relative_to(ROOT) or not path.is_file():
            raise SystemExit('Invalid runtime dependency: ' + str(path))
        relative = path.relative_to(ROOT)
        if relative.parts[0] not in ('src', 'vendor') or path.suffix != '.js':
            raise SystemExit('Only generated game code and FERRO belong to the runtime: ' + str(relative))
        source = path.read_text()
        graph[path] = source
        for match in IMPORT.finditer(source):
            pending.append(path.parent / match['path'])
    if any(path.name in ('wad.js', 'audio.js') for path in graph):
        raise SystemExit('The legacy WAD/audio importer must not enter the procedural build.')
    return graph


def main():
    manifest = json.loads((ROOT / 'vendor/ferro/manifest.json').read_text())
    for record in manifest['modules']:
        path = ROOT / 'vendor/ferro' / record['file']
        if hashlib.sha256(path.read_bytes()).hexdigest() != record['sha256']:
            raise SystemExit('Canonical FERRO module changed: ' + record['file'])
    graph = runtime_graph()
    version = json.loads((ROOT / 'package.json').read_text())['version']
    # The whole module graph participates in the tag, so a deployment cannot
    # combine a cached adapter with a new map or collision implementation.
    digest = hashlib.sha256()
    for path, source in sorted(graph.items()):
        digest.update(str(path.relative_to(ROOT)).encode())
        digest.update(source.encode())
    revision = version + '-' + digest.hexdigest()[:12]
    if DEST.exists():
        shutil.rmtree(DEST)
    DEST.mkdir()
    index = (ROOT / 'index.html').read_text()
    index = index.replace('src="src/app.js"', 'src="src/app.js?v=' + revision + '"')
    index = index.replace('href="style.css"', 'href="style.css?v=' + revision + '"')
    (DEST / 'index.html').write_text(index)
    shutil.copy2(ROOT / 'style.css', DEST / 'style.css')
    for path, source in sorted(graph.items()):
        relative = path.relative_to(ROOT)
        target = DEST / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        if relative.parts[0] == 'vendor':
            shutil.copy2(path, target)  # FERRO stays byte-for-byte canonical.
        else:
            source = IMPORT.sub(lambda m: m['before'] + m['path'] + '?v=' + revision + m['after'], source)
            target.write_text(source)
    shutil.copy2(ROOT / 'vendor/ferro/manifest.json', DEST / 'vendor/ferro/manifest.json')
    metadata = {'version': version, 'revision': revision, 'generation': 'procedural',
                'level': 'E1M1 geometric reference plan', 'mapGenerator': 'sector contour sweep',
                'importedMediaFiles': 0, 'worldBillboards': 0,
                'worldRepresentation': 'instanced procedural 3D triangle meshes', 'runtimeModules': len(graph),
                'worldDetailLevels': 3, 'proceduralSurfaceMaterials': True, 'modelGpuCacheMiB': 64,
                'physicallyBasedMaterials': True, 'surfaceMapsPerMaterial': 3, 'surfaceCpuCacheMiB': 48,
                'shadowMaps': 2, 'shadowFilter': 'hardware bilinear comparison, 3x3 PCF',
                'smoothNormalBuffer': True, 'contactAO': '12 samples, indirect fraction',
                'ferroVersion': manifest['version']}
    (DEST / 'build-info.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n')
    total = sum(p.stat().st_size for p in DEST.rglob('*') if p.is_file())
    print(json.dumps({'build': 'dist/index.html', **metadata, 'bytes': total}))


if __name__ == '__main__':
    main()
