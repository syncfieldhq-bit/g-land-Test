/**
 * ═══════════════════════════════════════════════════════
 * scripts/screens/home.js - ホーム画面（ポータル）
 *
 * 役割：
 *   - 挨拶（こんにちは ○○さん）
 *   - ステータス表示（ゲスト / プレイヤー）
 *   - 「ラウンド開始」ボタン
 *   - ポータルモジュール一覧（G-LAND / マイページ等）
 *   - 最近のラウンド履歴
 * ═══════════════════════════════════════════════════════
 */

import { State } from '../core/state.js';
import { Store } from '../core/storage.js';

export const HomeScreen = {
  /**
   * ホーム画面を描画
   * @param {HTMLElement} container - 描画先（通常 #app-root）
   */
  render(container) {
    const profile = State.profile;
    const name = profile && profile.nickname ? profile.nickname : 'ゲスト';
    const isGuest = !profile || !profile.nickname;
    // 🆕 Phase 5：Store の専用API経由で取得
    const recent = Store.getRoundHistory();
    const hasDraft = !!Store.loadRoundDraft();

    container.innerHTML = `
      <div class="home-hero">
        <div class="greeting">こんにちは</div>
        <div class="user-name">${escapeHtml(name)}さん</div>
        <div class="state-badge ${isGuest ? 'guest' : 'user'}">
          ${isGuest ? 'ゲストモード' : 'プレイヤーモード'}
        </div>
        <button class="btn-cta" data-action="start-round">
          ${hasDraft ? '⏯️ 進行中のラウンドを続ける' : '⛳ ラウンドを開始する'}
        </button>
      </div>

      <div class="home-modules">
        <button class="home-module" data-route="gland">
          <div class="mod-icon">⛳</div>
          <div class="mod-name">G-LAND</div>
          <div class="mod-desc">スコア管理</div>
        </button>
        <button class="home-module coming-soon" data-action="coming-soon" data-name="G-COMPETE">
          <div class="mod-icon">🏆</div>
          <div class="mod-name">G-COMPETE</div>
          <div class="mod-desc">コンペ運営</div>
          <span class="mod-badge">Coming Soon</span>
        </button>
        <button class="home-module coming-soon" data-action="coming-soon" data-name="G-TOWN">
          <div class="mod-icon">🏘</div>
          <div class="mod-name">G-TOWN</div>
          <div class="mod-desc">地域連携</div>
          <span class="mod-badge">Coming Soon</span>
        </button>
        <button class="home-module" data-route="mypage">
          <div class="mod-icon">👤</div>
          <div class="mod-name">マイページ</div>
          <div class="mod-desc">設定</div>
        </button>
      </div>

      <div class="home-recent">
        <h3>📋 最近のラウンド</h3>
        ${renderRecent(recent)}
      </div>
    `;

    console.log('[screens/home] rendered');
  }
};

/** 最近のラウンドを描画 */
function renderRecent(recent) {
  if (!recent || recent.length === 0) {
    return '<div class="empty">まだラウンド記録がありません</div>';
  }
  return recent.slice(0, 5).map((r) => `
    <div class="recent-item">
      <span class="recent-date">${escapeHtml(r.date || '')}</span>
      <span class="recent-course">${escapeHtml(r.course || '')} ${escapeHtml(r.variant || '')}</span>
      <span class="recent-total">${r.total || '-'}打 <small style="color:#ffe082;">(${r.diffStr || ''})</small></span>
    </div>
  `).join('');
}

/** HTMLエスケープ */
function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}

console.log('[screens/home] loaded');
