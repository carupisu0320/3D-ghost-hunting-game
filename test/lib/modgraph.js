// ブラウザ用の ES module(と、サーバーの CommonJS)の import / export を、実行せずに読み取る小さな解析器。
// 依存パッケージは使わない。コメントと文字列を正しく読み飛ばしたうえで、正規表現で import / export を拾う。
// 目的は「import しているのに export されていない名前」「存在しないファイル」「importmap にない外部パッケージ」を、ブラウザで開く前に見つけること。
const fs = require('fs');
const path = require('path');

// コメントを空白に置き換える(行番号は変わらない)。文字列・テンプレート・正規表現リテラルの中身は、そのまま残す
function stripComments(src) {
  const regexAllowedAfter = new Set(['', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', ';', '+', '-', '*', '%', '<', '>', '~', '^']);
  function scan(i, untilBrace) {
    let out = '', depth = 0, prev = '';
    while (i < src.length) {
      const c = src[i], d = src[i + 1];
      if (c === '/' && d === '/') { while (i < src.length && src[i] !== '\n') { out += ' '; i++; } continue; }
      if (c === '/' && d === '*') {
        out += '  '; i += 2;
        while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) { out += src[i] === '\n' ? '\n' : ' '; i++; }
        out += '  '; i += 2; continue;
      }
      if (c === '"' || c === "'") {
        let j = i + 1;
        while (j < src.length && src[j] !== c && src[j] !== '\n') { if (src[j] === '\\') j++; j++; }
        out += src.slice(i, j + 1); i = j + 1; prev = c; continue;
      }
      if (c === '`') {
        out += '`'; i++;
        while (i < src.length && src[i] !== '`') {
          if (src[i] === '\\') { out += src.slice(i, i + 2); i += 2; continue; }
          if (src[i] === '$' && src[i + 1] === '{') { out += '${'; const [o, j] = scan(i + 2, true); out += o + '}'; i = j; continue; }
          out += src[i]; i++;
        }
        out += '`'; i++; prev = '`'; continue;
      }
      if (c === '/' && regexAllowedAfter.has(prev)) { // 正規表現リテラル
        let j = i + 1, inClass = false;
        while (j < src.length && src[j] !== '\n') {
          const ch = src[j];
          if (ch === '\\') { j += 2; continue; }
          if (ch === '[') inClass = true; else if (ch === ']') inClass = false; else if (ch === '/' && !inClass) break;
          j++;
        }
        out += src.slice(i, j + 1); i = j + 1;
        while (i < src.length && /[a-z]/i.test(src[i])) { out += src[i]; i++; }
        prev = ')'; continue;
      }
      if (c === '{') depth++;
      if (c === '}') { if (untilBrace && depth === 0) return [out, i + 1]; depth--; }
      out += c; if (!/\s/.test(c)) prev = c; i++;
    }
    return [out, i];
  }
  return scan(0, false)[0];
}

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

// 名前の並び「a, b as c」を [{ imported, local }] にする
function parseNameList(list) {
  return list.split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
    const m = /^(\w+)(?:\s+as\s+(\w+))?$/.exec(s);
    return m ? { imported: m[1], local: m[2] || m[1] } : { imported: s, local: s, bad: true };
  });
}


// const / let / var のあとの「a = 1, b = { ... }, c;」から、宣言されている名前をすべて取り出す(分割代入は { a, b } / [a, b] の中も)
function declaratorNames(text, start) {
  const names = [];
  let i = start, depth = 0, expectName = true;
  while (i < text.length) {
    const c = text[i];
    if (expectName) {
      if (/\s/.test(c)) { i++; continue; }
      if (c === '{' || c === '[') { // 分割代入
        let j = i, d = 0;
        for (; j < text.length; j++) { if ('{['.includes(text[j])) d++; else if ('}]'.includes(text[j])) { d--; if (d === 0) break; } }
        text.slice(i + 1, j).split(',').forEach((s) => { const n = s.trim().split(/[:=\s]/).filter(Boolean).pop(); if (n && /^[\w$]+$/.test(n)) names.push(n); });
        i = j + 1; expectName = false; continue;
      }
      const m = /^[\w$]+/.exec(text.slice(i, i + 80));
      if (!m) break;
      names.push(m[0]); i += m[0].length; expectName = false; continue;
    }
    if (c === '"' || c === "'" || c === '`') { // 文字列を飛ばす
      let j = i + 1;
      while (j < text.length && text[j] !== c) { if (text[j] === '\\') j++; j++; }
      i = j + 1; continue;
    }
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (depth === 0 && c === ',') { expectName = true; }
    else if (depth === 0 && c === ';') break;
    else if (depth === 0 && c === '\n') { // 行末で、次の行が新しい文なら終わり(行末が , や演算子なら続く)
      const before = text.slice(start, i).trimEnd();
      if (!/[,=+\-*/%&|?:(\[{<>]$/.test(before)) {
        const next = /^\s*(\S)/.exec(text.slice(i + 1));
        if (!next || !/[.?:+\-*/%&|<>=,]/.test(next[1])) break;
      }
    }
    i++;
  }
  return names;
}

// 1つのファイルを読んで、import / export / 最上位の宣言を返す
function parseModule(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const text = stripComments(raw);
  const imports = [];   // { from, line, default, namespace, named: [{imported, local}], dynamic }
  const exports = new Set();
  const exportAllFrom = [];
  const reExports = []; // export { a } from './x.js'
  const exportLocals = []; // export { local as name }(このファイルの中の名前)
  let hasDefault = false;
  const requires = []; // CommonJS: { from, names[], line }
  const cjsExports = new Set();

  // ---- import ----
  const clauseRe = /(?:^|[\n;}])[ \t]*import\s+((?:[\w$]+\s*,\s*)?(?:\*\s*as\s+[\w$]+|\{[^}]*\})|[\w$]+)\s*from\s*(['"])([^'"\n]+)\2/g;
  for (let m; (m = clauseRe.exec(text));) {
    const clause = m[1], rec = { from: m[3], line: lineOf(text, m.index + m[0].indexOf('import')), default: null, namespace: null, named: [], dynamic: false };
    const ns = /\*\s*as\s+([\w$]+)/.exec(clause);
    if (ns) rec.namespace = ns[1];
    const braces = /\{([^}]*)\}/.exec(clause);
    if (braces) rec.named = parseNameList(braces[1]);
    const head = /^([\w$]+)\s*(?:,|$)/.exec(clause);
    if (head && !/^\*/.test(clause) && !/^\{/.test(clause)) rec.default = head[1];
    imports.push(rec);
  }
  const sideRe = /(?:^|[\n;}])[ \t]*import\s*(['"])([^'"\n]+)\1/g;
  for (let m; (m = sideRe.exec(text));) imports.push({ from: m[2], line: lineOf(text, m.index), default: null, namespace: null, named: [], dynamic: false, sideEffect: true });
  const dynRe = /\bimport\s*\(\s*(['"])([^'"\n]+)\1\s*\)/g;
  for (let m; (m = dynRe.exec(text));) imports.push({ from: m[2], line: lineOf(text, m.index), default: null, namespace: null, named: [], dynamic: true });

  // ---- export ----
  const exportBraceRe = /(?:^|[\n;}])[ \t]*export\s*\{([^}]*)\}\s*(?:from\s*(['"])([^'"\n]+)\2)?/g;
  for (let m; (m = exportBraceRe.exec(text));) {
    const names = parseNameList(m[1]);
    names.forEach((n) => {
      exports.add(n.local);
      if (m[3]) reExports.push({ from: m[3], imported: n.imported, as: n.local, line: lineOf(text, m.index) });
      else exportLocals.push({ local: n.imported, as: n.local, line: lineOf(text, m.index) });
    });
  }
  const exportFnRe = /(?:^|[\n;}])[ \t]*export\s+(?:async\s+)?(?:function\s*\*?|class)\s+([\w$]+)/g;
  for (let m; (m = exportFnRe.exec(text));) exports.add(m[1]);
  const exportVarRe = /(?:^|[\n;}])[ \t]*export\s+(?:const|let|var)\s+/g;
  for (let m; (m = exportVarRe.exec(text));) declaratorNames(text, m.index + m[0].length).forEach((n) => exports.add(n));
  if (/(?:^|[\n;}])[ \t]*export\s+default\b/.test(text)) hasDefault = true;
  const exportStarRe = /(?:^|[\n;}])[ \t]*export\s*\*\s*(?:as\s+([\w$]+)\s*)?from\s*(['"])([^'"\n]+)\2/g;
  for (let m; (m = exportStarRe.exec(text));) { if (m[1]) exports.add(m[1]); else exportAllFrom.push(m[3]); }

  // ---- CommonJS ----
  const reqRe = /(?:const|let|var)\s*\{([^}]*)\}\s*=\s*require\(\s*(['"])([^'"\n]+)\2\s*\)/g;
  for (let m; (m = reqRe.exec(text));) requires.push({ from: m[3], names: m[1].split(',').map((s) => s.trim().split(':')[0].trim()).filter(Boolean), line: lineOf(text, m.index) });
  const modExp = /module\.exports\s*=\s*\{([^}]*)\}/.exec(text);
  if (modExp) modExp[1].split(',').map((s) => s.trim().split(':')[0].trim()).filter(Boolean).forEach((n) => cjsExports.add(n));
  for (let m, re = /(?:module\.)?exports\.([\w$]+)\s*=/g; (m = re.exec(text));) cjsExports.add(m[1]);

  // ---- 最上位(行頭)の宣言 ----
  const declared = new Set();
  const fnRe = /^(?:export\s+)?(?:async\s+)?(?:function\s*\*?\s*([\w$]+)|class\s+([\w$]+))/gm;
  for (let m; (m = fnRe.exec(text));) declared.add(m[1] || m[2]);
  const varRe = /^(?:export\s+)?(?:const|let|var)\s+/gm;
  for (let m; (m = varRe.exec(text));) declaratorNames(text, m.index + m[0].length).forEach((n) => declared.add(n));

  return { file, raw, text, imports, exports, exportAllFrom, reExports, exportLocals, hasDefault, requires, cjsExports, declared };
}

const cache = new Map();
function load(file) {
  if (!cache.has(file)) cache.set(file, parseModule(file));
  return cache.get(file);
}

// そのファイルが外へ出している名前(export * も含む)の集合
function exportedNames(file, seen = new Set()) {
  if (seen.has(file)) return new Set();
  seen.add(file);
  const mod = load(file);
  const names = new Set(mod.exports);
  mod.exportAllFrom.forEach((rel) => {
    const target = resolveRelative(file, rel);
    if (target) exportedNames(target, seen).forEach((n) => names.add(n));
  });
  return names;
}

function resolveRelative(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const p = path.resolve(path.dirname(fromFile), spec);
  return fs.existsSync(p) && fs.statSync(p).isFile() ? p : null;
}
const isBare = (spec) => !spec.startsWith('.') && !/^(https?:)?\/\//.test(spec) && !spec.startsWith('/') && !spec.startsWith('node:');

module.exports = { stripComments, parseModule, load, exportedNames, resolveRelative, isBare, lineOf };
