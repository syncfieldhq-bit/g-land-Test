// =============================================================
// router.js - 画面遷移（Phase 7e：QR ダイレクト参加対応）
// =============================================================
import { EventBus } from './event-bus.js';

const _screens = new Map();
let _current = null;

export const Router = {
  register(name, renderFn) {
    _screens.set(name, renderFn);
  },
  go(name) {
    if (!_screens.has(name)) {
      console.warn('[Router] unknown screen:', name);
      return;
    }
    location.hash = `#${name}`;
  },
  _activate(name) {
    document.querySelectorAll('.gw-screen').forEach(el => el.classList.remove('active'));
    const target = document.getElementById(`gw-screen-${name}`);
    if (target) target.classList.add('active');
    document.querySelectorAll('.gw-footer-nav [data-route]').forEach(el => {
      el.classList.toggle('is-active', el.dataset.route === name);
    });
    const fn = _screens.get(name);
    if (fn) fn();
    _current = name;
    EventBus.emit('route:changed', name);
  },
  current() { return _current; },
  start() {
    window.addEventListener('hashchange', () => {
      const { screen, joinId } = parseHash();
      if (joinId) {
        // QR経由の参加リクエストを保存して、即座に gland に直行
        sessionStorage.setItem('gworld.pendingJoin', joinId);
        if (_screens.has('gland')) this._activate('gland');
        return;
      }
      if (_screens.has(screen)) this._activate(screen);
    });

    // 🎯 初回ロード時：URLハッシュに #join=xxx があれば最優先で gland に直行
    const { screen, joinId } = parseHash();
    if (joinId) {
      sessionStorage.setItem('gworld.pendingJoin', joinId);
      // hash を gland に書き換え（履歴汚染を避けるため replaceState）
      history.replaceState(null, '', location.pathname + location.search + '#gland');
      this._activate('gland');
      return;
    }
    const initial = screen || 'home';
    this._activate(initial);
  },
};

function parseHash() {
  const h = location.hash.replace('#', '');
  const joinMatch = h.match(/^join=([^&]+)/);
  if (joinMatch) {
    return { screen: 'gland', joinId: joinMatch[1] };
  }
  const screen = h.split('?')[0] || 'home';
  return { screen, joinId: null };
}
