/**
 * ═══════════════════════════════════════════════════════
 * scripts/screens/mypage.js - マイページ画面
 *
 * Phase 3 では最小実装。Phase 4 でバックアップ連携等を追加予定。
 * ═══════════════════════════════════════════════════════
 */

import { State } from '../core/state.js';
import { Store } from '../core/storage.js';
import { confirm } from '../ui/modal.js';
import { toast } from '../ui/toast.js';

export const MyPageScreen = {
  render(container) {
    const profile = State.profile;
    const name = profile && profile.nickname ? profile.nickname : '未登録';

    container.innerHTML = `
      <div class="card mypage-card">
        <div class="avatar">👤</div>
        <div class="my-name">${escapeHtml(name)}</div>
        <div class="my-state">${profile ? 'プレイヤー' : 'ゲスト'}</div>
      </div>

      <div class="card">
        <h3>⚙️ 設定</h3>
        <button class="btn-ghost" data-action="logout">🚪 別のプレイヤーで使用</button>
      </div>

      <div class="version-info">
        G-WORLD v3.0.0-phase3<br>
        永久無料 golfインフラ
      </div>
    `;

    console.log('[screens/mypage] rendered');
  },

  /** ログアウト処理 */
  async logout() {
    const ok = await confirm(
      'プレイヤーリセット',
      'すべてのデータが削除されます。<br>本当にリセットしますか？'
    );
    if (ok) {
      State.reset();
      toast('リセットしました', { type: 'success' });
      setTimeout(() => location.reload(), 800);
    }
  }
};

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}

console.log('[screens/mypage] loaded');
