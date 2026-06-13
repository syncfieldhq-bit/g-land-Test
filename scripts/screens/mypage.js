// =============================================================
// mypage.js - マイページ（プロフィール・公開設定・履歴管理）
// =============================================================
import * as Store from '../core/storage.js';
import { toast } from '../ui/toast.js';
import { Router } from '../core/router.js';

let _root = null;

export function renderMyPage() {
  if (!_root) {
    _root = document.getElementById('gw-screen-mypage');
    if (!_root) return;
  }
  const profile = Store.getProfile();
  const settings = Store.getSettings();
  const history = Store.getRoundHistory();

  _root.innerHTML = `
    <div class="gw-mp-section">
      <h2>👤 プロフィール</h2>
      ${profile ? `
        <div class="gw-mp-row"><span>ニックネーム</span><input type="text" id="gw-mp-name" value="${escapeHtml(profile.name)}" maxlength="20"></div>
        <div class="gw-mp-row">
          <label class="gw-cm-public-row">
            <input type="checkbox" id="gw-mp-public" ${profile.isPublic !== false ? 'checked' : ''}>
            <span>ランキングに公開する</span>
          </label>
        </div>
        <button class="gw-btn-primary" data-action="save-profile">プロフィールを保存</button>
      ` : '<p>未登録です。G-LANDから登録してください。</p>'}
    </div>

    <div class="gw-mp-section">
      <h2>⚙️ 表示設定</h2>
      <div class="gw-mp-row">
        <span>入力モード</span>
        <select id="gw-mp-input">
          <option value="simple" ${settings.inputMode === 'simple' ? 'selected' : ''}>シンプル</option>
          <option value="counter" ${settings.inputMode === 'counter' ? 'selected' : ''}>カウンター</option>
        </select>
      </div>
      <div class="gw-mp-row">
        <span>スコア表示</span>
        <select id="gw-mp-display">
          <option value="number" ${settings.displayMode === 'number' ? 'selected' : ''}>数字</option>
          <option value="pardiff" ${settings.displayMode === 'pardiff' ? 'selected' : ''}>±表記</option>
          <option value="symbol" ${settings.displayMode === 'symbol' ? 'selected' : ''}>ゴルフ記号</option>
        </select>
      </div>
      <button class="gw-btn-primary" data-action="save-settings">設定を保存</button>
    </div>

    <div class="gw-mp-section">
      <h2>📋 ラウンド履歴（${history.length}件）</h2>
      ${history.length === 0 ? '<p style="color:#aaa;">まだ履歴がありません</p>' : renderHistory(history)}
      ${history.length ? '<button class="gw-btn-secondary" data-action="clear-history">履歴をすべて削除</button>' : ''}
    </div>

    <div class="gw-mp-section">
      <h2>🛠 メンテナンス</h2>
      <button class="gw-btn-danger" data-action="logout">ログアウト（全データ削除）</button>
    </div>
  `;

  _root.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', () => handle(el.dataset.action));
  });
}

function renderHistory(history) {
  let html = '<div class="gw-mp-history">';
  for (const r of history.slice(0, 20)) {
    const date = new Date(r.savedAt).toLocaleString('ja-JP');
    const me = r.players?.find(p => p.isSelf);
    const total = me ? me.scores.reduce((s, v) => s + (v || 0), 0) : '-';
    html += `
      <div class="gw-mp-history-row">
        <span>${date}</span>
        <span>${r.course?.name || '-'} ${r.course?.variant || ''}</span>
        <span>${total}</span>
      </div>
    `;
  }
  html += '</div>';
  return html;
}

function handle(action) {
  switch (action) {
    case 'save-profile': {
      const name = document.getElementById('gw-mp-name').value.trim();
      const isPublic = document.getElementById('gw-mp-public').checked;
      if (!name) { toast('名前を入力してください', 'error'); return; }
      const profile = Store.getProfile() || {};
      profile.name = name; profile.isPublic = isPublic;
      Store.saveProfile(profile);
      toast('プロフィールを保存しました', 'success');
      break;
    }
    case 'save-settings': {
      const s = Store.getSettings();
      s.inputMode = document.getElementById('gw-mp-input').value;
      s.displayMode = document.getElementById('gw-mp-display').value;
      Store.saveSettings(s);
      toast('設定を保存しました', 'success');
      break;
    }
    case 'clear-history':
      if (confirm('履歴を全て削除しますか？')) {
        Store.clearRoundHistory();
        toast('履歴を削除しました', 'info');
        renderMyPage();
      }
      break;
    case 'logout':
      if (confirm('全データを削除してログアウトしますか？')) {
        Store.clearProfile();
        Store.clearRoundDraft();
        Store.clearRoundHistory();
        Store.clearGroup();
        toast('ログアウトしました', 'info');
        Router.go('home');
      }
      break;
  }
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'
  }[c]));
}
