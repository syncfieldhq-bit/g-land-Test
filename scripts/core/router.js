// =============================================================
// router.js - 画面遷移（hashベース）
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
    // hashchange イベントで処理される
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
      const name = parseHash();
      if (_screens.has(name)) this._activate(name);
    });
    // QRリンク経由の参加処理
    const joinMatch = location.hash.match(/#join=(\S+)/);
    if (joinMatch) {
      sessionStorage.setItem('gworld.pendingJoin', joinMatch[1]);
      location.hash = '#gcompete';
    }
    const initial = parseHash() || 'home';
    this._activate(initial);
  },
};

function parseHash() {
  const h = location.hash.replace('#', '');
  if (h.startsWith('join=')) return 'gcompete';
  return h.split('?')[0] || 'home';
}
