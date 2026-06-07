/******************************************************************
 * G-WORLD Service Worker
 * v1.0.0
 *
 * 【設計憲法・第3条】PWA完全対応の中核
 *   - ゴルフ場の電波弱地帯でも"爆速起動"を実現
 *   - キャッシュ戦略：Stale-While-Revalidate
 *     → 起動時は即キャッシュ表示 → 裏で最新取得 → 次回反映
 *
 * 【キャッシュ対象】
 *   - HTML / CSS / JS / manifest / アイコン
 *
 * 【キャッシュ非対象】
 *   - GAS API への POST 通信（常に最新を取りに行く）
 *   - 動的に発行されるQRコード画像
 ******************************************************************/

// バージョンを上げるとキャッシュが完全に作り直される
// →リリース時には必ず数字を上げること
const CACHE_VERSION = 'gw-v1.0.0';

// プリキャッシュ対象（アプリの骨格を全てここに）
const PRECACHE_URLS = [
  './',
  './index.html',
  './script.js',
  './manifest.webmanifest',
  './icon.png'
];

/* ================================================================
 * install: 初回登録時にプリキャッシュ
 * ================================================================ */
self.addEventListener('install', (event) => {
  console.log('[GW-SW] install:', CACHE_VERSION);
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      // 待たずに即有効化
      .then(() => self.skipWaiting())
  );
});

/* ================================================================
 * activate: 古いキャッシュを削除
 * ================================================================ */
self.addEventListener('activate', (event) => {
  console.log('[GW-SW] activate:', CACHE_VERSION);
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION)
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

/* ================================================================
 * fetch: リクエストごとに振る舞いを切り替え
 *
 * 【判定ロジック】
 *   1) GAS API への通信 → ネットワーク優先（キャッシュしない）
 *   2) 同一オリジンの静的ファイル → SWR戦略
 *   3) それ以外（QRコード生成API等） → ネットワーク優先
 * ================================================================ */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // POST はキャッシュしない
  if (req.method !== 'GET') return;

  // ── GAS API（書込み・取得）はキャッシュ対象外 ──
  if (url.hostname.includes('script.google.com')) {
    return; // デフォルトのfetchに任せる
  }

  // ── QRコード生成API等の外部リソースもキャッシュ対象外 ──
  if (url.hostname.includes('api.qrserver.com') ||
      url.hostname.includes('chart.googleapis.com')) {
    return;
  }

  // ── 同一オリジン以外もそのままネットワーク ──
  if (url.origin !== self.location.origin) {
    return;
  }

  // ── 同一オリジンの静的ファイル：SWR戦略 ──
  event.respondWith(handleSWR(req));
});

/**
 * Stale-While-Revalidate 戦略
 *   キャッシュがあれば即返す（爆速）→ 裏で最新を取得して次回用に保存
 *   キャッシュが無ければネットワークを待つ
 */
async function handleSWR(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);

  // ネットワーク取得を裏で実行（成功時のみキャッシュ更新）
  const networkPromise = fetch(request).then((res) => {
    // 成功レスポンスのみキャッシュに保存
    if (res && res.status === 200 && res.type === 'basic') {
      cache.put(request, res.clone()).catch(() => {});
    }
    return res;
  }).catch(() => null);

  // キャッシュがあれば即返す（ネットワーク待ち不要）
  if (cached) {
    return cached;
  }

  // キャッシュが無ければネットワーク結果を待つ
  const networkRes = await networkPromise;
  if (networkRes) return networkRes;

  // ネットワークも失敗 → オフライン用の最終フォールバック
  // index.html だけは何としても返したい
  if (request.mode === 'navigate') {
    const fallback = await cache.match('./index.html');
    if (fallback) return fallback;
  }

  return new Response('オフラインです。電波が回復したら自動的に再接続されます。', {
    status: 503,
    statusText: 'Service Unavailable',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}

/* ================================================================
 * message: フロントエンドからの制御コマンド
 *   - 'SKIP_WAITING' : 即座に新バージョンを有効化（更新通知時に使用）
 * ================================================================ */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
