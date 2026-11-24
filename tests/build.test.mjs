import test from 'node:test';
import assert from 'node:assert/strict';
import {cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import vm from 'node:vm';

const root = fileURLToPath(new URL('../', import.meta.url));
function files(directory) {
  return readdirSync(directory, {withFileTypes: true}).flatMap(entry =>
    entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)]);
}

function sourceCopy() {
  const temporary = mkdtempSync(join(tmpdir(), 'ferro-procedural-'));
  // Deliberately omit every archive, reference reader and development dependency.
  for (const name of ['src', 'vendor', 'index.html', 'style.css', 'package.json'])
    cpSync(join(root, name), join(temporary, name), {recursive: true});
  mkdirSync(join(temporary, 'tools'));
  cpSync(join(root, 'tools/build.py'), join(temporary, 'tools/build.py'));
  return temporary;
}
const build = cwd => spawnSync('python3', ['tools/build.py'], {cwd, encoding: 'utf8'});

test('production is one offline HTML with all procedural code, styles and byte-identical FERRO', async () => {
  const temporary = sourceCopy();
  try {
    mkdirSync(join(temporary, 'dist'));
    writeFileSync(join(temporary, 'dist/stale-media.wad'), 'obsolete output');
    const result = build(temporary);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const dist = join(temporary, 'dist');
    assert.deepEqual(files(dist).map(path => relative(dist, path)), ['index.html']);
    assert.equal(existsSync(join(temporary, 'reference')), false);
    const html = readFileSync(join(dist, 'index.html'), 'utf8');
    const info = JSON.parse(html.match(/<script id="build-info" type="application\/json">(.*?)<\/script>/s)[1]);
    assert.equal(info.generation, 'procedural');
    assert.equal(info.importedMediaFiles, 0);
    assert.equal(info.runtimeFiles, 1);
    assert.equal(info.offline, true);
    assert.ok(html.includes('VERSION ' + info.version));
    assert.ok(html.includes('<style>' + readFileSync(join(temporary, 'style.css'), 'utf8') + '</style>'));
    assert.doesNotMatch(html, /<script[^>]+\bsrc\s*=|<link[^>]+rel="stylesheet"|<\s*(?:img|audio|video|iframe)\b/i);
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
    assert.equal(scripts.length, 6, 'metadata, four canonical engine modules, linked game');
    const manifest = JSON.parse(readFileSync(join(temporary, 'vendor/ferro/manifest.json'), 'utf8'));
    for (const [i, record] of manifest.modules.entries()) {
      assert.equal(scripts[i + 1][1], ' data-ferro-module="' + record.file + '"');
      const bytes = Buffer.from(scripts[i + 1][2]);
      assert.equal(bytes.length, record.bytes, record.file);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), record.sha256, record.file);
    }
    const game = scripts.at(-1)[2];
    assert.doesNotMatch(game, /^\s*(?:import|export)\b|\bimport\s*\(|\bfetch\s*\(|\bXMLHttpRequest\b|\bnew\s+Image\b|data:image|data:audio|\.wad\b|\beval\s*\(|\bnew\s+Function\b/m);
    for (const script of scripts.slice(1)) new vm.Script(script[2]);
    const modules = [...game.matchAll(/^__modules\["(src\/[^\"]+)"\] = \(\(\) => \{/gm)].map(m => m[1]);
    assert.equal(new Set(modules).size, info.runtimeModules - manifest.modules.length);
    assert.equal(modules.at(-1), 'src/app.js', 'application starts after its full dependency graph');
    assert.ok(!modules.some(name => /sprites|wad\.js/.test(name)));

    // Execute the unmodified inline scripts, including original engine code,
    // without a network or file loader. The only substituted boundary is the
    // host's GPU creation; it declines WebGL, exercising the real fallback UI.
    // This is a linking/boot test, not a browser or pixel-rendering claim.
    const elements = new Map(), errors = [];
    const element = () => ({style: {}, hidden: true, dataset: {}, firstElementChild: {style: {}},
      classList: {toggle() {}, remove() {}}, addEventListener() {}, setAttribute() {},
      getContext: () => ({}), getBoundingClientRect: () => ({width: 640, height: 400})});
    for (const match of html.matchAll(/\bid="([^"]+)"/g)) elements.set(match[1], element());
    const document = {body: element(), addEventListener() {}, getElementById: id => elements.get(id)};
    const context = vm.createContext({document, window: {addEventListener() {}}, navigator: {},
      matchMedia: () => ({matches: false}), console: {error: error => errors.push(error)},
      performance: {now: () => 0}, requestAnimationFrame() {},
      fetch() { throw new Error('Offline build must not request a dependency.'); }});
    for (const script of scripts.slice(1, -1)) vm.runInContext(script[2], context);
    assert.equal(context.FERRO.version, info.ferroVersion);
    assert.equal(typeof context.FRender.create, 'function');
    let engineCalls = 0, disposed = 0;
    context.FRender = {create() { engineCalls++; return {gl: null, dispose() { disposed++; }}; }};
    vm.runInContext(game, context);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(engineCalls, 1, 'linked application reaches canonical FERRO API');
    assert.equal(disposed, 1);
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /nécessite WebGL 2/);
    assert.equal(elements.get('error').hidden, false);
    assert.match(elements.get('errorText').textContent, /nécessite WebGL 2/);
    assert.equal(build(temporary).status, 0);
    assert.equal(readFileSync(join(dist, 'index.html'), 'utf8'), html, 'byte-reproducible HTML');
  } finally { rmSync(temporary, {recursive: true, force: true}); }
});

test('single-file linker rejects missing imports, cycles and modified engine bytes', () => {
  const temporary = sourceCopy();
  try {
    const app = join(temporary, 'src/app.js'), original = readFileSync(app, 'utf8');
    writeFileSync(app, "import './missing.js';\n" + original);
    assert.notEqual(build(temporary).status, 0, 'no silently missing dependency');
    writeFileSync(app, "import './app.js';\n" + original);
    assert.notEqual(build(temporary).status, 0, 'no silently reordered cyclic module');
    writeFileSync(app, original);
    const engine = join(temporary, 'vendor/ferro/engine.js');
    writeFileSync(engine, readFileSync(engine, 'utf8') + '\n// modified\n');
    const result = build(temporary);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /Canonical FERRO module changed/);
  } finally { rmSync(temporary, {recursive: true, force: true}); }
});
