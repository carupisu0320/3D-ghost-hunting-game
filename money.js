// 稼いだお金を、Googleアカウントごとに保存する(サーバー用)。server.js が使う。
//
// しくみ:
//   - ブラウザは Firebase Authentication で Google にログインして、「IDトークン」(本人確認の証明書)を受け取る。
//   - サーバーは、そのトークンを firebase-admin で確認して、誰(uid)なのかを知る。ブラウザが送ってきた uid は信じない。
//   - お金は Firestore の players/{uid} に保存する。ブラウザからは直接さわらず、サーバーだけが書き込む(だから不正に書き換えにくい)。
//
// 準備(Firebase の設定)は FIREBASE_SETUP.md を見る。設定がなければ「お金の保存はオフ」になるだけで、ゲーム自体は動く。
//
// 環境変数:
//   FIREBASE_SERVICE_ACCOUNT         Firebase の「サービスアカウントのキー」(JSONの中身をそのまま)
//   FIREBASE_SERVICE_ACCOUNT_BASE64  上のJSONをbase64にしたもの(改行を貼りにくい場合の代わり)
//   MONEY_DEV=1                      動作確認用。Firebaseなしで、メモリ上に保存する(サーバーを止めると消える)。
//                                    トークンは「dev:ユーザーID:名前」の形で受け付ける。公開サーバーでは使わないこと

const MAX_CLAIM_IDS = 30; // 二重に受け取らないよう、受け取り済みの目印を、アカウントごとにこの数だけ覚えておく

// 1回の受け取りを、保存されている内容に反映する(Firestore版もメモリ版も、同じ計算を使う)
//   doc: { money, claims } か、まだ無いとき null
//   戻り値: { money, claims, duplicate } ... duplicate が true のときは、すでに受け取り済みなので、お金は増やさない
function applyClaim(doc, amount, claimId) {
  const money = Number.isFinite(doc && doc.money) ? doc.money : 0;
  const claims = Array.isArray(doc && doc.claims) ? doc.claims : [];
  if (claimId && claims.includes(claimId)) return { money, claims, duplicate: true };
  const add = Math.max(0, Math.floor(Number(amount) || 0));
  return {
    money: money + add,
    claims: claimId ? [...claims, claimId].slice(-MAX_CLAIM_IDS) : claims,
    duplicate: false,
  };
}

function offStore(reason) {
  return {
    enabled: false, mode: 'off', reason,
    async verify() { throw new Error('お金の保存はオフです'); },
    async get() { return 0; },
    async add() { throw new Error('お金の保存はオフです'); },
  };
}

// 動作確認用(メモリ)
function devStore() {
  const docs = new Map();
  return {
    enabled: true, mode: 'dev',
    async verify(token) {
      const m = /^dev:([^:]{1,40}):?(.{0,40})$/.exec(String(token || ''));
      if (!m) throw new Error('トークンが正しくありません');
      return { uid: 'dev-' + m[1], name: m[2] || m[1] };
    },
    async get(uid) { return (docs.get(uid) || { money: 0 }).money; },
    async add(uid, amount, { claimId } = {}) {
      const next = applyClaim(docs.get(uid), amount, claimId);
      docs.set(uid, { money: next.money, claims: next.claims });
      return { balance: next.money, duplicate: next.duplicate };
    },
  };
}

function firebaseStore(serviceAccount) {
  const admin = require('firebase-admin');
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();
  const players = db.collection('players');
  return {
    enabled: true, mode: 'firebase',
    async verify(token) {
      const decoded = await admin.auth().verifyIdToken(String(token || ''));
      return { uid: decoded.uid, name: String(decoded.name || '').slice(0, 40) || 'プレイヤー' };
    },
    async get(uid) {
      const snap = await players.doc(uid).get();
      return snap.exists && Number.isFinite(snap.data().money) ? snap.data().money : 0;
    },
    // 同時に2か所から受け取っても、取りこぼしや二重加算が起きないよう、トランザクションで行う
    async add(uid, amount, { name, claimId } = {}) {
      const ref = players.doc(uid);
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const next = applyClaim(snap.exists ? snap.data() : null, amount, claimId);
        if (!next.duplicate) {
          tx.set(ref, {
            money: next.money, claims: next.claims,
            name: String(name || '').slice(0, 40),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
        }
        return { balance: next.money, duplicate: next.duplicate };
      });
    },
  };
}

function createMoneyStore(env = process.env) {
  if (env.MONEY_DEV === '1') return devStore();
  let raw = env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw && env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    try { raw = Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8'); } catch (e) { /* 下で扱う */ }
  }
  if (!raw) return offStore('FIREBASE_SERVICE_ACCOUNT が設定されていません');
  let serviceAccount;
  try { serviceAccount = JSON.parse(raw); } catch (e) { return offStore('FIREBASE_SERVICE_ACCOUNT がJSONとして読めません'); }
  try { return firebaseStore(serviceAccount); } catch (e) { return offStore('firebase-admin を始められません: ' + e.message); }
}

module.exports = { createMoneyStore, applyClaim };
