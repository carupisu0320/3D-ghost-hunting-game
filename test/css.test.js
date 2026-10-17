// 画面の部品の見た目(ui.css / lobby.css)の検査。デザインを担当する人が CSS だけを直せるように、次のことを保つ:
//   - コードが付けているクラス名(gh-...)が、すべて CSS にある(綴りの違い・消し忘れの検出)
//   - CSS にある gh- クラスは、どこかで使われている(使われなくなった指定が残らない)
//   - .html が CSS を読み込んでいる
//   - コードに、style.cssText(見た目の直書き)を新しく増やさない
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./helpers');
const { stripComments } = require('./lib/modgraph');

const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(ROOT, f));
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '');

const SETS = [
  { name: 'ゲーム本編', css: 'ui.css', html: 'game.html',
    sources: ['engine.js', 'main.js', 'online-game.js', 'pause-menu.js', ...fs.readdirSync(path.join(ROOT, 'engine')).filter((f) => f.endsWith('.js')).map((f) => 'engine/' + f)] },
  { name: '操作説明', css: 'help.css', html: ['game.html', 'lobby.html'], sources: ['controls-help.js'] },
  { name: 'ロビー', css: 'lobby.css', html: 'lobby.html',
    sources: fs.readdirSync(ROOT).filter((f) => /^lobby[\w-]*\.js$/.test(f)) },
];

for (const set of SETS) {
  const css = strip(read(set.css));
  const cssClasses = new Set([...css.matchAll(/\.(gh-[a-z0-9-]+|is-[a-z0-9-]+)/g)].map((m) => m[1]));
  // コードの中で使っているクラス名(コメントは除く)。gh-journal-page--${...} のように後ろを組み立てるものは、接頭辞だけ拾う
  const used = new Map();
  set.sources.forEach((f) => {
    const text = stripComments(read(f));
    for (const m of text.matchAll(/\b(gh-[a-z0-9-]+)/g)) if (!used.has(m[1])) used.set(m[1], f);
    for (const m of text.matchAll(/['"` ](is-[a-z0-9-]+)\b/g)) if (!used.has(m[1])) used.set(m[1], f);
  });

  test(`${set.name}: ${[].concat(set.html).join('・')} が ${set.css} を読み込み、${set.css} がある`, () => {
    [].concat(set.html).forEach((h) => assert.match(read(h), new RegExp(`<link[^>]+rel="stylesheet"[^>]+href="${set.css.replace('.', '\\.')}"`), `${h} が ${set.css} を読み込んでいません`));
  });

  test(`${set.name}: コードが付けているクラス名は、すべて ${set.css} に定義がある`, () => {
    const missing = [];
    used.forEach((file, name) => {
      const prefixOnly = name.endsWith('--'); // 後ろを組み立てるクラス名(gh-journal-page--left / --right)
      const ok = prefixOnly ? [...cssClasses].some((c) => c.startsWith(name)) : cssClasses.has(name);
      if (!ok) missing.push(`${name}(${file})`);
    });
    assert.deepEqual(missing, [], `${set.css} に定義がありません: ` + missing.join(', '));
  });

  test(`${set.name}: ${set.css} のクラスは、どれもコードで使われている`, () => {
    const names = [...used.keys()];
    const unused = [...cssClasses].filter((c) => !names.includes(c) && !names.some((n) => n.endsWith('--') && c.startsWith(n)));
    assert.deepEqual(unused, [], 'コードで使われていないクラス: ' + unused.join(', '));
  });

  test(`${set.name}: コードに style.cssText(見た目の直書き)がない。見た目は ${set.css} に書く`, () => {
    const found = [];
    set.sources.forEach((f) => {
      stripComments(read(f)).split('\n').forEach((l, i) => { if (/\.style\.cssText\b/.test(l)) found.push(`${f}:${i + 1}`); });
    });
    assert.deepEqual(found, [], 'style.cssText が残っています(CSS にクラスを足して、className で付けてください): ' + found.join(', '));
  });

  test(`${set.name}: ${set.css} の書式: 括弧が対応し、各宣言が ; で終わる`, () => {
    let depth = 0;
    for (const ch of css) { if (ch === '{') depth++; if (ch === '}') depth--; assert.ok(depth >= 0, '} が多すぎます'); }
    assert.equal(depth, 0, '{ と } の数が合いません');
    const bad = [];
    for (const m of css.matchAll(/\{([^{}]*)\}/g)) {
      m[1].split('\n').map((s) => s.trim()).filter(Boolean).forEach((d) => { if (!/;$/.test(d) && !/^[\w-]+:\s*$/.test(d) && !/,$/.test(d)) bad.push(d); });
    }
    assert.deepEqual(bad.filter((d) => /:/.test(d)), [], '末尾に ; がない宣言があります');
  });
}

test('血の画面の --blood-splatter は、コードが渡し、ui.css が使っている', () => {
  assert.match(read('ui.css'), /var\(--blood-splatter\)/);
  assert.match(read('engine.js'), /setProperty\('--blood-splatter'/);
});

test('左上に出していた、緑の EMF 表示と、黄色の通知は出さない(画面をすっきりさせるため)', () => {
  const engine = stripComments(read('engine.js'));
  assert.doesNotMatch(engine, /gh-emf-display|gh-pickup-notice|emfDisplay/, 'EMF の文字表示・黄色の通知が、また作られています');
  assert.doesNotMatch(read('ui.css'), /gh-emf-display|gh-pickup-notice/);
  assert.match(engine, /userData\.leds\.forEach/, 'EMF の数値は、手に持った道具のランプで見えるようにしてあります(消さないでください)');
});
