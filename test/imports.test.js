// インポート整合性の検査。ブラウザで開く前に、次のような事故を見つける。
//   - import している名前が、相手のファイルで export されていない(分割・名前変更のときに一番起きやすい)
//   - export { x } と書いたのに、x がそのファイルにない(ブラウザでは、ページが真っ白になる)
//   - import 先のファイルがない / 同じ名前を二重に import / import した名前と同じ名前を宣言
//   - ページ(lobby.html / game.html)から辿れるファイルが使う外部パッケージが、importmap にない
//   - ファイルの文法の誤り
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { ROOT } = require('./helpers');
const { load, exportedNames, resolveRelative, isBare, lineOf } = require('./lib/modgraph');

const abs = (f) => path.join(ROOT, f);
const jsFiles = fs.readdirSync(ROOT).filter((f) => f.endsWith('.js'));
const CJS = new Set(['server.js', 'money.js']); // サーバー側(Node の require を使う)。それ以外はブラウザ用の ES module
const esFiles = jsFiles.filter((f) => !CJS.has(f));

test('すべてのファイルに、文法の誤りがない', () => {
  const problems = [];
  for (const f of jsFiles) {
    const args = CJS.has(f) ? ['--check', abs(f)] : ['--experimental-default-type=module', '--check', abs(f)];
    let r = spawnSync(process.execPath, args, { encoding: 'utf8' });
    if (r.status !== 0 && !CJS.has(f) && /bad option|experimental-default-type/.test(r.stderr)) { // 古い Node: 標準入力から module として検査する
      r = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: fs.readFileSync(abs(f)), encoding: 'utf8' });
    }
    if (r.status !== 0) problems.push(`${f}:\n${r.stderr.trim()}`);
  }
  assert.deepEqual(problems, [], '文法の誤りがあります:\n' + problems.join('\n'));
});

test('import している名前は、相手のファイルがすべて export している', () => {
  const problems = [];
  for (const f of esFiles) {
    const mod = load(abs(f));
    for (const imp of mod.imports) {
      if (isBare(imp.from) || /^(https?:)?\/\//.test(imp.from)) continue; // three・socket.io-client・Firebase(CDN)は別の検査
      const target = resolveRelative(abs(f), imp.from);
      if (!target) { problems.push(`${f}:${imp.line} import 先のファイルがありません: ${imp.from}`); continue; }
      if (imp.dynamic || imp.sideEffect) continue;
      const names = exportedNames(target);
      const targetMod = load(target);
      imp.named.forEach((n) => { if (!names.has(n.imported)) problems.push(`${f}:${imp.line} ${imp.from} は「${n.imported}」を export していません`); });
      if (imp.default && !targetMod.hasDefault) problems.push(`${f}:${imp.line} ${imp.from} には default export がありません`);
      if (imp.namespace) { // import * as X のあと X.名前 で使っているものが、本当に export されているか
        const used = new Set();
        for (let m, re = new RegExp(`\\b${imp.namespace}\\.([\\w$]+)`, 'g'); (m = re.exec(mod.text));) used.add(m[1]);
        used.forEach((n) => { if (!names.has(n)) problems.push(`${f} ${imp.namespace}.${n} を使っていますが、${imp.from} は「${n}」を export していません`); });
      }
    }
  }
  assert.deepEqual(problems, [], '\n' + problems.join('\n'));
});

test('export { 名前 } に書いた名前は、そのファイルの中に存在する', () => {
  const problems = [];
  for (const f of esFiles) {
    const mod = load(abs(f));
    const importedLocals = new Set();
    mod.imports.forEach((i) => { i.named.forEach((n) => importedLocals.add(n.local)); if (i.namespace) importedLocals.add(i.namespace); if (i.default) importedLocals.add(i.default); });
    mod.exportLocals.forEach((e) => {
      if (!mod.declared.has(e.local) && !importedLocals.has(e.local)) problems.push(`${f}:${e.line} export { ${e.local} } と書いてありますが、${e.local} が見つかりません`);
    });
    mod.reExports.forEach((e) => {
      const target = resolveRelative(abs(f), e.from);
      if (target && !exportedNames(target).has(e.imported)) problems.push(`${f}:${e.line} ${e.from} は「${e.imported}」を export していません(再公開)`);
    });
  }
  assert.deepEqual(problems, [], '\n' + problems.join('\n'));
});

test('同じ名前の二重 import や、import した名前と同じ名前の宣言がない', () => {
  const problems = [];
  for (const f of esFiles) {
    const mod = load(abs(f));
    const seen = new Map();
    mod.imports.forEach((i) => {
      const locals = [...i.named.map((n) => n.local), ...(i.namespace ? [i.namespace] : []), ...(i.default ? [i.default] : [])];
      locals.forEach((n) => {
        if (seen.has(n)) problems.push(`${f}:${i.line} 「${n}」を二重に import しています(${seen.get(n)}行目にもあります)`);
        else seen.set(n, i.line);
        if (mod.declared.has(n)) problems.push(`${f}:${i.line} import した「${n}」と同じ名前を、このファイルの中でも宣言しています`);
      });
    });
  }
  assert.deepEqual(problems, [], '\n' + problems.join('\n'));
});

test('サーバー側(CommonJS)の require した名前が、相手の module.exports にある', () => {
  const problems = [];
  for (const f of CJS) {
    const mod = load(abs(f));
    mod.requires.forEach((r) => {
      if (!r.from.startsWith('.')) return;
      const target = resolveRelative(abs(f), r.from.endsWith('.js') ? r.from : r.from + '.js');
      if (!target) { problems.push(`${f}:${r.line} require 先がありません: ${r.from}`); return; }
      const exp = load(target).cjsExports;
      r.names.forEach((n) => { if (!exp.has(n)) problems.push(`${f}:${r.line} ${r.from} は「${n}」を module.exports していません`); });
    });
  }
  assert.deepEqual(problems, [], '\n' + problems.join('\n'));
});

// ---- ページ(HTML)から辿れるファイルと、importmap ----
function pageInfo(htmlFile) {
  const html = fs.readFileSync(abs(htmlFile), 'utf8');
  const mapText = /<script[^>]*type="importmap"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  const imports = mapText ? JSON.parse(mapText[1]).imports : {};
  const entries = [];
  for (let m, re = /<script[^>]*type="module"[^>]*src="([^"]+)"/g; (m = re.exec(html));) entries.push(m[1]);
  return { html, imports, entries };
}
const covered = (map, spec) => Object.keys(map).some((k) => (k.endsWith('/') ? spec.startsWith(k) : spec === k));

// 入口から、import(静的・動的)を辿って、届くファイルと、使う外部パッケージを集める
function walk(entries) {
  const files = new Set(), bare = new Map(); // bare: 指定子 -> 最初に使ったファイル
  const stack = entries.map((e) => abs(e));
  while (stack.length) {
    const file = stack.pop();
    if (files.has(file) || !fs.existsSync(file)) continue;
    files.add(file);
    load(file).imports.forEach((i) => {
      if (isBare(i.from)) { if (!bare.has(i.from)) bare.set(i.from, path.basename(file)); return; }
      const t = resolveRelative(file, i.from);
      if (t) stack.push(t);
    });
  }
  return { files, bare };
}

for (const page of ['lobby.html', 'game.html']) {
  test(`${page}: 読み込まれるファイルが使う外部パッケージは、すべて importmap にある`, () => {
    const { imports, entries } = pageInfo(page);
    assert.ok(entries.length > 0, `${page} に <script type="module" src=...> がありません`);
    entries.forEach((e) => assert.ok(fs.existsSync(abs(e)), `${page} が読み込む ${e} がありません`));
    const { bare } = walk(entries);
    const missing = [...bare].filter(([spec]) => !covered(imports, spec)).map(([spec, by]) => `「${spec}」(${by} が使用)`);
    assert.deepEqual(missing, [], `${page} の importmap に足りないものがあります。ブラウザで真っ白になります: ${missing.join(', ')}`);
  });
}

test('importmap に書いたものは、どこかで使われている(消し忘れ・綴りの違いの検出)', () => {
  const allBare = new Set();
  for (const page of ['lobby.html', 'game.html']) walk(pageInfo(page).entries).bare.forEach((_, spec) => allBare.add(spec));
  for (const page of ['lobby.html', 'game.html']) {
    const { imports } = pageInfo(page);
    Object.keys(imports).forEach((k) => {
      const used = [...allBare].some((s) => (k.endsWith('/') ? s.startsWith(k) : s === k));
      assert.ok(used, `${page} の importmap の「${k}」は、このページから読み込まれるどのファイルでも使われていません`);
    });
  }
});

test('ページ間の移動先(.html)が、すべて存在する', () => {
  const problems = [];
  const sources = [...jsFiles, 'index.html', 'game.html', 'lobby.html'];
  sources.forEach((f) => {
    const text = fs.readFileSync(abs(f), 'utf8');
    for (let m, re = /['"=\s(]([\w-]+\.html)(?:[?#'"\s)>]|$)/g; (m = re.exec(text));) {
      if (!fs.existsSync(abs(m[1]))) problems.push(`${f}:${lineOf(text, m.index)} 移動先 ${m[1]} がありません`);
    }
  });
  assert.deepEqual(problems, [], '\n' + problems.join('\n'));
});

test('main.js が読み込む各マップは、build と mapLabel を export している', () => {
  const main = load(abs('main.js'));
  const maps = main.imports.filter((i) => /-map\.js$/.test(i.from));
  assert.ok(maps.length >= 3, 'マップの import が見つかりません');
  maps.forEach((i) => {
    const names = exportedNames(resolveRelative(abs('main.js'), i.from));
    assert.ok(names.has('build'), `${i.from} に build がありません`);
    assert.ok(names.has('mapLabel'), `${i.from} に mapLabel がありません`);
  });
});
