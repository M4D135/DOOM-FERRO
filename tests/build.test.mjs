import test from 'node:test';
import assert from 'node:assert/strict';
import {cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
function files(directory) {
  return readdirSync(directory, {withFileTypes: true}).flatMap(entry =>
    entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)]);
}

test('production builds from code alone and ships a complete versioned module graph without imported media', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'ferro-procedural-'));
  try {
    // Deliberately omit every archive, reference reader and development tool.
    for (const name of ['src', 'vendor', 'index.html', 'style.css', 'package.json'])
      cpSync(join(root, name), join(temporary, name), {recursive: true});
    mkdirSync(join(temporary, 'tools'));
    cpSync(join(root, 'tools/build.py'), join(temporary, 'tools/build.py'));
    mkdirSync(join(temporary, 'dist'));
    writeFileSync(join(temporary, 'dist/stale-media.wad'), 'obsolete output');
    const result = spawnSync('python3', ['tools/build.py'], {cwd: temporary, encoding: 'utf8'});
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const dist = join(temporary, 'dist');
    const built = files(dist).map(path => relative(dist, path)).sort();
    assert.ok(built.length > 10);
    assert.ok(built.every(path => /\.(?:js|html|css|json)$/.test(path)), built.join('\n'));
    assert.ok(!built.some(path => /(?:reference|assets|wad\.js|audio\.js$)/.test(path.replace('procedural-audio.js', 'synthesis.js'))));
    assert.equal(existsSync(join(temporary, 'reference')), false);
    const info = JSON.parse(readFileSync(join(dist, 'build-info.json'), 'utf8'));
    assert.equal(info.generation, 'procedural');
    assert.equal(info.importedMediaFiles, 0);
    const html = readFileSync(join(dist, 'index.html'), 'utf8');
    assert.ok(html.includes('src/app.js?v=' + info.revision));
    assert.ok(html.includes('style.css?v=' + info.revision));
    const visited = new Set(), pending = [join(dist, 'src/app.js')];
    while (pending.length) {
      const path = pending.pop();
      if (visited.has(path)) continue;
      visited.add(path);
      const source = readFileSync(path, 'utf8');
      if (relative(dist, path).startsWith('src/')) {
        assert.doesNotMatch(source, /\bfetch\s*\(|\bXMLHttpRequest\b|\bnew\s+Image\b|data:image|data:audio|\.wad\b/);
      }
      for (const match of source.matchAll(/(?:import|export)\s+(?:[^;\n]*?\s+from\s+)?['"]([^'"]+)['"]/g)) {
        const specifier = match[1], [dependency, query] = specifier.split('?');
        assert.ok(specifier.startsWith('.'), 'no CDN or package request: ' + specifier);
        if (relative(dist, path).startsWith('src/')) assert.equal(query, 'v=' + info.revision);
        const target = resolve(dirname(path), dependency);
        assert.ok(target.startsWith(dist + '/'), target);
        assert.ok(existsSync(target), specifier);
        pending.push(target);
      }
    }
    assert.equal(visited.size, info.runtimeModules);
    const manifest = JSON.parse(readFileSync(join(dist, 'vendor/ferro/manifest.json'), 'utf8'));
    for (const entry of manifest.modules)
      assert.equal(createHash('sha256').update(readFileSync(join(dist, 'vendor/ferro', entry.file))).digest('hex'), entry.sha256);
  } finally { rmSync(temporary, {recursive: true, force: true}); }
});
