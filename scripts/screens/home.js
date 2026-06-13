// =============================================================
// home.js - ポータル画面（Phase 7d：✓利用可能 / 🔒近日公開 を明示）
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

    <!-- ✅ 利用可能機能 -->
    <div class="gw-portal-section-label">
      <span class="gw-portal-label-dot is-ready"></span>
      <span>利用可能な機能</span>
    </div>
    <div class="gw-portal-modules">
      <button class="gw-portal-module is-ready" data-route="gland">
        <span class="gw-mod-tag gw-tag-ready">✓ READY</span>
        <div class="gw-mod-icon">⛳</div>
        <div class="gw-mod-name">G-LAND</div>
        <div class="gw-mod-desc">スコア管理</div>
      </button>
      <button class="gw-portal-module is-ready" data-route="gcompete">
        <span class="gw-mod-tag gw-tag-ready">✓ READY</span>
        <div class="gw-mod-icon">🏆</div>
        <div class="gw-mod-name">G-COMPETE</div>
        <div class="gw-mod-desc">仲間内QR共有</div>
        ${group ? '<span class="gw-mod-badge gw-badge-active">参加中</span>' : ''}
      </button>
      <button class="gw-portal-module is-ready" data-route="mypage">
        <span class="gw-mod-tag gw-tag-ready">✓ READY</span>
        <div class="gw-mod-icon">👤</div>
        <div class="gw-mod-name">マイページ</div>
        <div class="gw-mod-desc">設定・履歴</div>
      </button>
    </div>

    <!-- 🔒 開発中の機能 -->
    <div class="gw-portal-section-label">
      <span class="gw-portal-label-dot is-soon"></span>
      <span>開発中の機能</span>
      <small class="gw-portal-label-hint">タップで詳細</small>
    </div>
    <div class="gw-portal-modules">
      <button class="gw-portal-module is-coming-soon" data-action="coming-soon" data-name="Gタウン">
        <span class="gw-mod-lock">🔒</span>
        <span class="gw-mod-tag gw-tag-soon">SOON</span>
        <div class="gw-mod-icon">🏘️</div>
        <div class="gw-mod-name">Gタウン</div>
        <div class="gw-mod-desc">地域とつながる</div>
      </button>
      <button class="gw-portal-module is-coming-soon" data-action="coming-soon" data-name="Gプロアマコンペ">
        <span class="gw-mod-lock">🔒</span>
        <span class="gw-mod-tag gw-tag-soon">SOON</span>
        <div class="gw-mod-icon">🏌️‍♂️</div>
        <div class="gw-mod-name">Gプロアマ</div>
        <div class="gw-mod-desc">プロアマコンペ</div>
      </button>
      <button class="gw-portal-module is-coming-soon" data-action="coming-soon" data-name="Gレッスン">
        <span class="gw-mod-lock">🔒</span>
        <span class="gw-mod-tag gw-tag-soon">SOON</span>
        <div class="gw-mod-icon">🎓</div>
        <div class="gw-mod-name">Gレッスン</div>
        <div class="gw-mod-desc">プロのレッスン</div>
      </button>
      <button class="gw-portal-module is-coming-soon" data-action="coming-soon" data-name="Gショップ">
        <span class="gw-mod-lock">🔒</span>
        <span class="gw-mod-tag gw-tag-soon">SOON</span>
        <div class="gw-mod-icon">🛍️</div>
        <div class="gw-mod-name">Gショップ</div>
        <div class="gw-mod-desc">用品ショップ</div>
      </button>
    </div>

    ${history.length ? renderRecent(history.slice(0, 3)) : ''}

    <div class="gw-portal-footer-info">
      <small>※ 🔒マークは開発中の機能です。順次リリース予定 🚀</small>
    </div>
  `;

  bindEvents();
}

function bindEvents() {
  _root.querySelectorAll('[data-route]').forEach(el => {
    el.addEventListener('click', () => Router.go(el.dataset.route));
  });
  _root.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', () => handle(el.dataset.action, el));
  });
}

function handle(action, el) {
  switch (action) {
    case 'resume-round': {
      const draft = Store.getRoundDraft();
      if (!draft || !draft.course) {
        toast('進行中のラウンドが見つかりません', 'error');
        return;
      }
      try {
        State.reset();
        State.restore(draft);
        if (draft.course) State.setCourse(draft.course);
        if (typeof draft.currentHole === 'number') State.setHole(draft.currentHole);
        const self = draft.players?.find(p => p.isSelf);
        if (self) State.setActivePlayer(self.id);
        toast('ラウンドを再開します', 'success');
        Router.go('gland');
      } catch (e) {
        console.error('[Resume] failed:', e);
        toast('再開に失敗しました: ' + e.message, 'error');
      }
      break;
    }
    case 'start-round': {
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
      toast(`「${name}」は近日公開予定です 🚀`, 'info', 2500);
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
