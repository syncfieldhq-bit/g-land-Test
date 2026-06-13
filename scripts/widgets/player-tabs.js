// =============================================================
// player-tabs.js - プレイヤー切替タブ（最大16名対応・横スクロール）
// =============================================================
import { State } from '../core/state.js';
import { EventBus } from '../core/event-bus.js';
import { EVENTS, APP } from '../core/constants.js';
import { openCompanionModal } from './companion-modal.js';

let _container = null;

function build() {
  if (_container) return _container;
  _container = document.createElement('div');
  _container.className = 'gw-player-tabs';
  return _container;
}

export function render() {
  if (!_container) build();
  const players = State.getPlayers();
  const activeId = State.getActiveId();
  let html = '';
  players.forEach(p => {
    const isActive = p.id === activeId;
    const badge = p.isSelf ? '👤' : (p.isHost ? '👑' : '');
    html += `
      <button class="gw-pt-tab ${isActive ? 'is-active' : ''}" data-id="${p.id}">
        ${badge}${escapeHtml(p.name)}
      </button>
    `;
  });
  if (players.length < APP.MAX_PLAYERS) {
    html += `<button class="gw-pt-add" data-action="add">＋ 追加</button>`;
  }
  _container.innerHTML = html;

  _container.querySelectorAll('.gw-pt-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      State.setActivePlayer(btn.dataset.id);
    });
    let pressTimer;
    btn.addEventListener('touchstart', () => {
      pressTimer = setTimeout(() => openCompanionModal(btn.dataset.id), 600);
    });
    btn.addEventListener('touchend', () => clearTimeout(pressTimer));
    btn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openCompanionModal(btn.dataset.id);
    });
  });
  const addBtn = _container.querySelector('.gw-pt-add');
  if (addBtn) addBtn.addEventListener('click', () => openCompanionModal(null));
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'
  }[c]));
}

export function mountPlayerTabs(host) {
  build();
  host.appendChild(_container);
  render();
}

[EVENTS.PLAYER_CHANGED, EVENTS.PLAYER_ADDED, EVENTS.PLAYER_REMOVED, 'player:renamed']
  .forEach(ev => EventBus.on(ev, render));
