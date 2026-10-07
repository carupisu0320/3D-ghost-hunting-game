// Googleアカウントでのログインと、稼いだお金の取得・受け取り(ブラウザ用)。ロビーとゲーム本編の両方が使う。
//
// ログインは Firebase Authentication(ポップアップでGoogleのログイン画面が開く)。ログインしたままにしておけるので、毎回ログインし直す必要はない。
// お金は、サーバー(server.js)が Firestore に保存している。ブラウザは、ログインの証明書(IDトークン)をサーバーに送って、
// 自分の所持金を教えてもらったり、ひとりで遊んだ結果の報酬を受け取ったりする。
// Firebase の読み込みは、設定されているときだけ(設定がなければ、通信もしない)。
import { firebaseConfig, accountConfigured } from './firebase-config.js';
import { SERVER_URL } from './server-config.js';

const FIREBASE_VERSION = '10.14.1';
const CDN = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;

let authMod = null, auth = null, user = null, initPromise = null;
let loadModule = (url) => import(url); // Firebase の読み込み(試験のときだけ差し替える)
export function __setModuleLoaderForTests(fn) { loadModule = fn; }
let state = { configured: accountConfigured, ready: !accountConfigured, signedIn: false, name: '', uid: null, error: null };
const listeners = new Set();
function emit() { const s = getAccountState(); listeners.forEach((fn) => { try { fn(s); } catch (e) { console.warn(e); } }); }

export function getAccountState() { return { ...state }; }
// ログイン状態が変わるたびに呼ばれる(登録した直後にも、今の状態で1回呼ばれる)
export function onAccountChange(fn) { listeners.add(fn); fn(getAccountState()); return () => listeners.delete(fn); }

// Firebase を読み込んで、ログイン状態を調べる(最初の1回だけ。何度呼んでもよい)
export function initAccount() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    if (!accountConfigured) return getAccountState();
    try {
      const appMod = await loadModule(`${CDN}/firebase-app.js`);
      authMod = await loadModule(`${CDN}/firebase-auth.js`);
      auth = authMod.getAuth(appMod.initializeApp(firebaseConfig));
      await new Promise((resolve) => {
        let first = true;
        authMod.onAuthStateChanged(auth, (u) => {
          user = u;
          state = { ...state, ready: true, error: null, signedIn: !!u, uid: u ? u.uid : null, name: u ? String(u.displayName || 'プレイヤー') : '' };
          emit();
          if (first) { first = false; resolve(); }
        });
      });
    } catch (e) {
      console.warn('Googleログインの準備に失敗しました', e);
      state = { ...state, ready: true, error: 'Googleログインを読み込めませんでした' };
      emit();
    }
    return getAccountState();
  })();
  return initPromise;
}

// ログインの状態が分かるまで待つ(ゲーム本編などが「ログインしているか」を知りたいとき)。時間がかかりすぎたら、いまの状態を返す
export async function waitForAuth(timeoutMs = 4000) {
  await Promise.race([initAccount(), new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
  return getAccountState();
}

function explainError(e) {
  const code = e && e.code ? String(e.code) : '';
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return 'ログインをやめました';
  if (code === 'auth/popup-blocked') return 'ポップアップがブロックされました。ブラウザの設定で許可してください';
  if (code === 'auth/unauthorized-domain') return 'このサイトのドメインが、Firebaseの「承認済みドメイン」に入っていません(FIREBASE_SETUP.md の手順2)';
  if (code === 'auth/network-request-failed') return 'ネットワークにつながりません';
  return 'ログインできませんでした' + (code ? `(${code})` : '');
}

// Googleでログイン(ポップアップ)。クリックなどの操作の直接の結果として呼ぶこと(そうでないと、ポップアップがブロックされる)
export async function signIn() {
  if (!accountConfigured) throw new Error('Googleログインはまだ設定されていません');
  if (!authMod) await initAccount();
  if (!authMod) throw new Error(state.error || 'Googleログインを読み込めませんでした');
  try { await authMod.signInWithPopup(auth, new authMod.GoogleAuthProvider()); }
  catch (e) { throw new Error(explainError(e)); }
}
export async function signOutAccount() { if (authMod && auth) await authMod.signOut(auth); }

// サーバーに送る、ログインの証明書(IDトークン)。ログインしていなければ null。期限が近ければ、Firebaseが自動で取り直す
export async function getIdToken() { return user ? user.getIdToken() : null; }

async function callServer(path, { method = 'GET', body } = {}) {
  const token = await getIdToken();
  if (!token) throw new Error('ログインしていません');
  const res = await fetch(SERVER_URL + path, {
    method,
    headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch (e) { /* 本文なし */ }
  if (!res.ok && !(json && json.balance !== undefined)) throw new Error((json && json.error) || `サーバーのエラー(${res.status})`);
  return json || {};
}

// 自分の所持金を、サーバーに聞く。戻り値: { enabled, balance, name }(enabled が false なら、サーバー側の保存設定がまだ)
export function fetchMe() { return callServer('/me'); }

// ひとりで遊んだ結果の報酬を受け取る(オンラインの報酬は、サーバーが自動で保存するので、これは使わない)
// 報酬の額はサーバーが計算する。claimId が同じものは、二重には受け取れない
export function claimSoloReward({ correct, elapsed, claimId }) {
  return callServer('/claim', { method: 'POST', body: { correct: !!correct, elapsed: Math.max(0, Math.floor(elapsed || 0)), claimId: String(claimId) } });
}
