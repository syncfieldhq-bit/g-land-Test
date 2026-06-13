// =============================================================
// mypage.js - マイページ（Phase 7d：Coming Soon 機能の明示化）
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
    <!-- ✅ プロフィール（動作中） -->
    <div class="gw-mp-section">
      <div class="gw-mp-section-badge gw-mp-badge-ready">✓ 利用可能</div>
      <h2>👤 プロフィール</h2>
      ${profile ? `
        <div class="gw-mp-field">
          <label>ニックネーム（表示名）</label>
          <input type="text" id="gw-mp-name" value="${escapeHtml(profile.name)}" maxlength="20">
        </div>
        <div class="gw-mp-field">
          <label>本名（氏名）</label>
          <input type="text" id="gw-mp-realname" value="${escapeHtml(profile.realName || '')}" placeholder="例: 山田 太郎" maxlength="30">
          <p class="gw-mp-hint">※ コンペ運営側での本人確認に使用されます（非公開）</p>
        </div>
        <div class="gw-mp-field">
          <label class="gw-cm-public-row">
            <input type="checkbox" id="gw-mp-public" ${profile.isPublic !== false ? 'checked' : ''}>
            <span>リーダーボードに公開する</span>
          </label>
        </div>
        <button class="gw-btn-primary" data-action="save-profile">プロフィールを保存</button>
      ` : '<p>未登録です。G-LANDから登録してください。</p>'}
    </div>

    <!-- ✅ 表示設定（動作中） -->
    <div class="gw-mp-section">
      <div class="gw-mp-section-badge gw-mp-badge-ready">✓ 利用可能</div>
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
      <div class="gw-mp-row">
        <label class="gw-cm-public-row" style="flex:1;">
          <input type="checkbox" id="gw-mp-putt" ${settings.puttEnabled ? 'checked' : ''}>
          <span>パット入力をデフォルトでON</span>
        </label>
      </div>
      <button class="gw-btn-primary" data-action="save-settings">設定を保存</button>
    </div>

    <!-- ✅ ラウンド履歴（動作中） -->
    <div class="gw-mp-section">
      <div class="gw-mp-section-badge gw-mp-badge-ready">✓ 利用可能</div>
      <h2>📋 ラウンド履歴（${history.length}件）</h2>
      ${history.length === 0 ? '<p style="color:#aaa;">まだ履歴がありません</p>' : renderHistory(history)}
      ${history.length ? '<button class="gw-btn-secondary" data-action="clear-history">履歴をすべて削除</button>' : ''}
    </div>

    <!-- 🔒 Coming Soon セクション -->
    <div class="gw-mp-soon-header">
      <span>🚀 開発中の機能</span>
      <small>順次リリース予定！お楽しみに</small>
    </div>

    <!-- 🔒 統計分析 -->
    <div class="gw-mp-section gw-mp-soon-section" data-action="coming-soon" data-feature="統計分析">
      <span class="gw-mp-lock">🔒</span>
      <div class="gw-mp-section-badge gw-mp-badge-soon">Coming Soon</div>
      <h2>📊 統計分析</h2>
      <p class="gw-mp-soon-desc">
        平均スコア・パット数・アンダー率など、<br>
        あなたのプレースタイルを可視化します。
      </p>
    </div>

    <!-- 🔒 アチーブメント -->
    <div class="gw-mp-section gw-mp-soon-section" data-action="coming-soon" data-feature="アチーブメント">
      <span class="gw-mp-lock">🔒</span>
      <div class="gw-mp-section-badge gw-mp-badge-soon">Coming Soon</div>
      <h2>🏅 アチーブメント</h2>
      <p class="gw-mp-soon-desc">
        初バーディ・ホールインワン・100切りなど、<br>
        達成した記録を称号として獲得！
      </p>
    </div>

    <!-- 🔒 クラブ・スコア詳細 -->
    <div class="gw-mp-section gw-mp-soon-section" data-action="coming-soon" data-feature="クラブ別記録">
      <span class="gw-mp-lock">🔒</span>
      <div class="gw-mp-section-badge gw-mp-badge-soon">Coming Soon</div>
      <h2>🏌️ クラブ別記録</h2>
      <p class="gw-mp-soon-desc">
        使用クラブ・飛距離・OB位置などを記録して<br>
        コース攻略に活かせます。
      </p>
    </div>

    <!-- 🔒 バックアップ・復元 -->
    <div class="gw-mp-section gw-mp-soon-section" data-action="coming-soon" data-feature="クラウドバックアップ">
      <span class="gw-mp-lock">🔒</span>
      <div class="gw-mp-section-badge gw-mp-badge-soon">Coming Soon</div>
      <h2>☁️ クラウドバックアップ</h2>
      <p class="gw-mp-soon-desc">
        データをクラウドに保存して<br>
        機種変更時も安心して引き継ぎ。
      </p>
    </div>

    <!-- 🔒 ハンディキャップ -->
    <div class="gw-mp-section gw-mp-soon-section" data-action="coming-soon" data-feature="ハンディキャップ">
      <span class="gw-mp-lock">🔒</span>
      <div class="gw-mp-section-badge gw-mp-badge-soon">Coming Soon</div>
      <h2>📐 ハンディキャップ管理</h2>
      <p class="gw-mp-soon-desc">
        JGA準拠のハンディキャップ算出。<br>
        コンペで公平な競技を実現。
      </p>
    </div>

    <!-- ✅ メンテナンス（動作中） -->
    <div class="gw-mp-section">
      <div class="gw-mp-section-badge gw-mp-badge-ready">✓ 利用可能</div>
      <h2>🛠 メンテナンス</h2>
      <button class="gw-btn-danger" data-action="logout">ログアウト（全データ削除）</button>
    </div>

    <div class="gw-mp-footer">
      <small>G-WORLD v7.0.0 — Made with ⛳</small>
    </div>
  `;

  _root.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', (e) => {
      // Coming Soon カード内の子要素クリック対応
      e.stopPropagation();
      handle(el.dataset.action, el);
    });
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
        <span>${escapeHtml(r.course?.name || '-')} ${escapeHtml(r.course?.variant || '')}</span>
        <span>${total}</span>
      </div>
    `;
  }
  html += '</div>';
  return html;
}

function handle(action, el) {
  switch (action) {
    case 'coming-soon': {
      const feature = el.dataset.feature || 'この機能';
      toast(`「${feature}」は近日公開予定です 🚀`, 'info', 2500);
      break;
    }
    case 'save-profile': {
      const name = document.getElementById('gw-mp-name').value.trim();
      const realName = document.getElementById('gw-mp-realname').value.trim();
      const isPublic = document.getElementById('gw-mp-public').checked;
      if (!name) { toast('ニックネームを入力してください', 'error'); return; }
      const profile = Store.getProfile() || {};
      profile.name = name;
      profile.realName = realName;
      profile.isPublic = isPublic;
      Store.saveProfile(profile);
      toast('プロフィールを保存しました', 'success');
      break;
    }
    case 'save-settings': {
      const s = Store.getSettings();
      s.inputMode = document.getElementById('gw-mp-input').value;
      s.displayMode = document.getElementById('gw-mp-display').value;
      s.puttEnabled = document.getElementById('gw-mp-putt').checked;
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
