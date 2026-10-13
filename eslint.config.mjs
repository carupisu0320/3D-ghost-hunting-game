// 静的な検査(任意)。npx eslint@10 . で実行する。npm test には含めていない(eslint のインストールが要るため)。
// 見つけたいのは、ファイルを分割したときの事故:
//   no-undef        分けたあとに、どこにも定義されていない名前を使っている(実行したときに初めて落ちる)
//   no-import-assign  import した変数に代入している(別ファイルに移した let 変数を、元のファイルから書き換えると、実行時エラーになる)
const names = 'window document performance navigator location sessionStorage localStorage requestAnimationFrame cancelAnimationFrame setTimeout clearTimeout setInterval clearInterval console Image Audio AudioContext webkitAudioContext fetch URL URLSearchParams Promise Float32Array Uint16Array Uint8Array Uint8ClampedArray Int16Array Float64Array ArrayBuffer Blob FileReader MouseEvent KeyboardEvent Event CustomEvent HTMLElement getComputedStyle alert prompt confirm atob btoa structuredClone TextDecoder TextEncoder crypto queueMicrotask OffscreenCanvas ResizeObserver MutationObserver IntersectionObserver Gamepad';
const globals = Object.fromEntries(names.split(' ').map((n) => [n, 'readonly']));
export default [
  { ignores: ['test/**', 'server.js', 'money.js', 'node_modules/**', 'eslint.config.mjs'] },
  {
    files: ['*.js', 'engine/*.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals },
    rules: { 'no-undef': 'error', 'no-import-assign': 'error', 'no-redeclare': 'error', 'no-const-assign': 'error', 'no-dupe-keys': 'error' },
  },
];
