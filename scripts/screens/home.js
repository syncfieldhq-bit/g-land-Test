// =============================================================
// home.js - ポータル画面（Phase 7b：Gタウン・Gプロアマ追加版）
// =============================================================
import * as Store from '../core/storage.js';
import { State } from '../core/state.js';
import { Router } from '../core/router.js';
import { toast } from '../ui/toast.js';

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

  // 進行中ラウンドの有無を判定（コース＆プレイヤーが存在するか）
  const hasResumable = !!(draft && draft.course && draft.players && draft.players.length > 0);

  _root.innerHTML = `
    <div class="gw-portal-hero">
      <div class="gw-greeting">こんにちは</div>
      <div class="gw-user-name">${profile ? escapeHtml(profile.name) + 'さん' : 'ゲストさん'}</div>
      <div class="gw-state-badge ${profile ? 'is-user' : 'is-guest'}">
        ${profile ? '登録済' : 'ゲストモード'}
      </div>
      ${hasResumable ? `
        <button class="gw-portal-cta gw-cta-resume" data-action="resume-round">
          ▶ 進行中のラウンドを続ける
          <small class="gw-resume-sub">${escapeHtml(draft.course.name)} ${escapeHtml(draft.course.variant || '')}</small>
        </button>
      ` : ''}
      <button class="gw-portal-cta" data-action="start-round">⛳ ラウンドを開始する</button>
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
        ${group ? '<span class="gw-mod-badge gw-badge-active">参加中</span>' : ''}
      </button>
      <button class="gw-portal-module is-coming-soon" data-action="coming-soon" data-name="Gタウン">
        <div class="gw-mod-icon">🏘️</div>
        <div class="gw-mod-name">Gタウン</div>
        <div class="gw-mod-desc">地域とつながる</div>
        <span class="gw-mod-lock">🔒</span>
        <span class="gw-mod-badge gw-badge-soon">Coming Soon</span>
      </button>
      <button class="gw-portal-module is-coming-soon" data-action="coming-soon" data-name="Gプロアマコンペ">
        <div class="gw-mod-icon">🏌️‍♂️</div>
        <div class="gw-mod-name">Gプロアマ</div>
        <div class="gw-mod-desc">プロアマコンペ</div>
        <span class="gw-mod-lock">🔒</span>
        <span class="gw-mod-badge gw-badge-soon">Coming Soon</span>
      </button>
      <button class="gw-portal-module" data-route="mypage">
        <div class="gw-mod-icon">👤</div>
        <div class="gw-mod-name">マイページ</div>
        <div class="gw-mod-desc">設定・履歴</div>
      </button>
    </div>

    ${history.length ? renderRecent(history.slice(0, 3)) : ''}
  `;

  bindEvents();
}

function bindEvents() {
  // ルート遷移ボタン
  _root.querySelectorAll('[data-route]').forEach(el => {
    el.addEventListener('click', () => Router.go(el.dataset.route));
  });
  // アクションボタン
  _root.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', () => handle(el.dataset.action, el));
  });
}

function handle(action, el) {
  switch (action) {
    case 'resume-round': {
      // 🔧 バグ修正: ドラフトを State に確実に復元してから遷移
      const draft = Store.getRoundDraft();
      if (!draft || !draft.course) {
        toast('進行中のラウンドが見つかりません', 'error');
        return;
      }
      try {
        // State をリセットしてからドラフトを復元（重複登録防止）
        State.reset();
        State.restore(draft);
        // 念のためコース・ホール・アクティブプレイヤーを確実に設定
        if (draft.course) State.setCourse(draft.course);
        if (typeof draft.currentHole === 'number') State.setHole(draft.currentHole);
        const self = draft.players?.find(p => p.isSelf);
        if (self) State.setActivePlayer(self.id);
        toast('ラウンドを再開します', 'success');
        // 確実に gland 画面に遷移
        Router.go('gland');
      } catch (e) {
        console.error('[Resume] failed:', e);
        toast('再開に失敗しました: ' + e.message, 'error');
      }
      break;
    }
    case 'start-round': {
      // 新規ラウンド開始 → 既存ドラフトがあれば確認
      const draft = Store.getRoundDraft();
      if (draft && draft.course) {
        if (!confirm('進行中のラウンドがあります。新しく始めますか？\n（現在のラウンドは破棄されます）')) return;
        Store.clearRoundDraft();
        State.reset();
      }
      Router.go('gland');
      break;
    }
    case 'coming-soon': {
      const name = el.dataset.name || 'この機能';
      toast(`${name} は近日公開予定です 🚀`, 'info', 2500);
      break;
    }
  }
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
        <span>${escapeHtml(r.course?.name || '-')}</span>
        <span class="gw-recent-score">${total || '-'}</span>
      </div>
    `;
  }
  html += '</div>';
  return html;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'
  }[c]));
}
