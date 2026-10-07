// Firebase の設定(ブラウザ用)。FIREBASE_SETUP.md の「手順3」でコピーした内容に書き換える。
// ここに書く値(apiKey など)は、Webページに載せる前提の「公開してよい値」。パスワードのようなものではない。
// (本当に秘密にするのは、サーバーに設定する「サービスアカウントのキー」のほう。こちらは絶対にここへ書かない)
//
// YOUR_ から始まる値のままのときは「Googleログイン機能はまだ設定されていない」とみなして、ログインのボタンは出ない(ゲームは普通に遊べる)。
export const firebaseConfig = {
  apiKey: 'AIzaSyDk41Td-641HDTfqUZ7bYf7YB04GWOIkI4',
  authDomain: 'ghost-hunting-game.firebaseapp.com',
  projectId: 'ghost-hunting-game',
  appId: '1:284398535300:web:93554fc2be27eb114178d1',
};

export const accountConfigured = !String(firebaseConfig.apiKey).startsWith('YOUR_');
