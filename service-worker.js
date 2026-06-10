/******************************************************************
 * G-WORLD Service Worker
 * v1.2.0 - Phase 3 (Widget 分割対応)
 *
 * 【設計憲法・第3条】PWA完全対応の中核
 *   - ゴルフ場の電波弱地帯でも"爆速起動"を実現
 *   - キャッシュ戦略：Stale-While-Revalidate
 *
 * 【Phase 3 の変更】
 *   - script.js を PRECACHE から完全削除
 *   - 全 Widget JS と hobbies.config.js を追加
 *   - CACHE_VERSION を bump（v1.1.0 → v1.2.0）
 ******************************************************************/

const CACHE_VERSION = 'gw-v1.2.0';

const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.png',

  // ── CSS（Phase 1 で分割済み） ──
  './frontend/styles/tokens.css',
  './frontend/styles/reset.css',
  './frontend/styles/layout.css',
  './frontend/styles/components/ui.css',
  './frontend/styles/components/button.css',
  './frontend/styles/components/modal.css',
  './frontend/styles/components/splash.css',
  './frontend/styles/widgets/home.css',
  './frontend/styles/widgets/golf.css',

  // ── JS Core 層（Phase 2） ──
  './frontend/scripts/core/namespace.js',
  './frontend/scripts/config/app.config.js',
  './frontend/scripts/config/hobbies.config.js',
  './frontend/scripts/core/Storage.js',
  './frontend/scripts/core/Cache.js',
  './frontend/scripts/api/gasClient.js',
  './frontend/scripts/core/SaveQueue.js',
  './frontend/scripts/core/Auth.js',
  './frontend/scripts/ui/Toast.js',
  './frontend/scripts/ui/Modal.js',
  './frontend/scripts/core/Router.js',
  './frontend/scripts/core/ActionBus.js',
  './frontend/scripts/core/ServiceWorkerClient.js',

  // ── Widget 基盤（Phase 3） ──
  './frontend/scripts/core/WidgetRegistry.js',
  './frontend/scripts/widgets/_BaseWidget.js',

  // ── Widget 群（Phase 3） ──
  './frontend/scripts/widgets/gcompete/index.js',
  './frontend/scripts/widgets/gtown/index.js',
  './frontend/scripts/widgets/home/index.js',
  './frontend/scripts/widgets/mypage/index.js',
  './frontend/scripts/widgets/golf/courses.config.js',
  './frontend/scripts/widgets/golf/GolfWidget.js',
  './frontend/scripts/widgets/golf/GolfScore.js',
  './frontend/scripts/widgets/golf/GolfMates.js',
  './frontend/scripts/widgets/golf/GolfHistory.js',
  './frontend/scripts/widgets/golf/index.js',

  // ── Main エントリ ──
  './frontend/scripts/main.js'
];

self.addEventListener('install', (event) => {
  console.log('[GW-SW] install:', CACHE_VERSION);
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

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

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== 'GET') return;
  if (url.hostname.includes('script.google.com')) return;
  if (url.hostname.includes('api.qrserver.com') ||
      url.hostname.includes('chart.googleapis.com')) return;
  if (url.origin !== self.location.origin) return;

  event.respondWith(handleSWR(req));
});

async function handleSWR(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);

  const networkPromise = fetch(request).then((res) => {
    if (res && res.status === 200 && res.type === 'basic') {
      cache.put(request, res.clone()).catch(() => {});
    }
    return res;
  }).catch(() => null);

  if (cached) return cached;

  const networkRes = await networkPromise;
  if (networkRes) return networkRes;

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

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
