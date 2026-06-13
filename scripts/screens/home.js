// =============================================================
// home.js - ホーム画面（ポータル）
// =============================================================
import * as Store from '../core/storage.js';
import { State } from '../core/state.js';
import { Router } from '../core/router.js';

let _root = null;

export function renderHome() {
  if (!_root) {
    _root = document.getElementById('gw-screen-home');
    if (!_root) return;
  }
  const profile = Store.getProfile();
  const draft = Store.getRoundDraft();
  const history = Store.getRoundHistory();
  const group = Store.getGroup() || State.getGroup();

  _root.innerHTML = `
    <div class="gw-portal-hero">
      <div class="gw-greeting">こんにちは</div>
      <div class="gw-user-name">${profile ? profile.name + 'さん' : 'ゲストさん'}</div>
      <div class="gw-state-badge ${profile ? 'is-user' : 'is-guest'}">
        ${profile ? '登録済' : 'ゲストモード'}
      </div>
      ${draft ? `<button class="gw-portal-cta gw-cta-resume" data-route="gland">▶ 進行中のラウンドを続ける</button>` : ''}
      <button class="gw-portal-cta" data-route="gland">⛳ ラウンドを開始する</button>
    </div>
    <div class="gw-portal-modules">
      <button class="gw-portal-module" data-route="gland">
        <div class="gw-mod-icon">⛳</div>
        <div class="gw-mod-name">G-LAND</div>
        <div class="gw-mod-desc">スコア管理</div>
      </button>
      <button class="gw-portal-module" data-route="gcompete">
        <div class="gw-mod-icon">🏆</div>
        <div class="gw-mod-name">G-COMPETE</div>
        <div class="gw-mod-desc">仲間内コンペ</div>
        ${group ? '<span class="gw-mod-badge">参加中</span>' : ''}
      </button>
      <button class="gw-portal-module" data-route="mypage">
        <div class="gw-mod-icon">👤</div>
        <div class="gw-mod-name">マイページ</div>
        <div class="gw-mod-desc">設定・履歴</div>
      </button>
    </div>
    ${history.length ? renderRecent(history.slice(0, 3)) : ''}
  `;

  _root.querySelectorAll('[data-route]').forEach(el => {
    el.addEventListener('click', () => Router.go(el.dataset.route));
  });
}

function renderRecent(rounds) {
  let html = '<div class="gw-portal-recent"><h3>📋 最近のラウンド</h3>';
  for (const r of rounds) {
    const me = r.players?.find(p => p.isSelf);
    const total = me ? me.scores.reduce((s, v) => s + (v || 0), 0) : 0;
    const date = new Date(r.savedAt).toLocaleDateString('ja-JP');
    html += `
      <div class="gw-recent-item">
        <span>${date}</span>
        <span>${r.course?.name || '-'}</span>
        <span class="gw-recent-score">${total || '-'}</span>
      </div>
    `;
  }
  html += '</div>';
  return html;
}
