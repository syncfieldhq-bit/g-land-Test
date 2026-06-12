/**
 * ═══════════════════════════════════════════════════════
 * scripts/main.js - 起動エントリーポイント
 *
 * 役割：
 *   1. core モジュールを読み込む
 *   2. DOM 準備完了を待つ
 *   3. 起動シーケンスを実行
 *   4. Phase 1 では「起動成功画面」を表示するだけ
 * ═══════════════════════════════════════════════════════
 */

// ★ES Modules：同じ scripts/ 階層下の core/ を読む
import { CONFIG } from './core/config.js';
import { Store } from './core/storage.js';
import { State } from './core/state.js';

console.log('[G-WORLD] main.js loaded');

/**
 * 起動シーケンス
 */
function bootstrap() {
  console.log('[G-WORLD] bootstrap start, version:', CONFIG.APP_VERSION);

  setBootStatus('core モジュールを初期化中...');

  // 1. 状態を初期化
  State.init();
  console.log('[G-WORLD] State snapshot:', State.snapshot());

  // 2. ヘッダーに名前を反映
  updateHeader();

  // 3. メイン領域に「起動成功画面」を描画
  renderBootSuccess();

  console.log('[G-WORLD] ✅ bootstrap complete');
}

/** 起動ステータスのテキストを更新 */
function setBootStatus(text) {
  const el = document.getElementById('boot-status');
  if (el) el.textContent = text;
}

/** ヘッダーに現在のプレイヤー名を表示 */
function updateHeader() {
  const headerName = document.getElementById('header-name');
  if (!headerName) return;

  const profile = State.profile;
  if (profile && profile.nickname) {
    headerName.textContent = profile.nickname + 'さん';
  } else {
    headerName.textContent = 'ゲスト';
  }
}

/** Phase 1 完了画面：モジュールが正常に読み込まれた証拠を表示 */
function renderBootSuccess() {
  const root = document.getElementById('app-root');
  if (!root) return;

  root.innerHTML = `
    <div class="success-card">
      <div class="icon">🎉</div>
      <div class="title">Phase 1 起動成功！</div>
      <div class="desc">
        ルート階層から ES Modules で<br>
        core レイヤーの読み込みに成功しました。
      </div>
      <div class="module-list">
        ✅ index.html<br>
        ✅ ./styles/base.css<br>
        ✅ ./scripts/main.js<br>
        ✅ ./scripts/core/config.js<br>
        ✅ ./scripts/core/storage.js<br>
        ✅ ./scripts/core/state.js
      </div>
      <div class="desc" style="margin-top:14px;">
        バージョン: <b style="color:var(--gold-bright);">${CONFIG.APP_VERSION}</b><br>
        現在の状態: <b style="color:var(--gold-bright);">${State.profile ? 'プレイヤー登録済み' : 'ゲスト'}</b>
      </div>
    </div>
  `;

  // 確認用 Toast
  showToast('✅ Phase 1 起動成功！');
}

/** 簡易 Toast（Phase 2 で ui/toast.js に移動予定） */
function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

// ─── DOM 準備完了を待って起動 ───
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
