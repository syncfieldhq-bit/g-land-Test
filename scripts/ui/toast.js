// =============================================================
// toast.js - トースト通知
// =============================================================
let _container = null;

function ensure() {
  if (_container) return _container;
  _container = document.createElement('div');
  _container.className = 'gw-toast-container';
  document.body.appendChild(_container);
  return _container;
}

export function toast(msg, type = 'info', duration = 2200) {
  ensure();
  const t = document.createElement('div');
  t.className = `gw-toast gw-toast-${type}`;
  t.textContent = msg;
  _container.appendChild(t);
  requestAnimationFrame(() => t.classList.add('is-show'));
  setTimeout(() => {
    t.classList.remove('is-show');
    setTimeout(() => t.remove(), 300);
  }, duration);
}
