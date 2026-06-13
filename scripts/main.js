/**
 * ═══════════════════════════════════════════════════════
 * scripts/main.js - 起動エントリーポイント（Phase 2）
 *
 * Phase 2 の追加：
 *   - ./ui/toast.js を import
 *   - ./ui/modal.js を import
 *   - ./widgets/score.js を import
 *   - UI部品の動作確認用ボタンを描画
 * ═══════════════════════════════════════════════════════
 */

// ─── core レイヤー ───
import { CONFIG } from './core/config.js';
import { State } from './core/state.js';

// ─── ui レイヤー（Phase 2 で追加） ───
import { toast } from './ui/toast.js';
import { confirm } from './ui/modal.js';

// ─── widgets レイヤー（Phase 2 で追加） ───
import { renderScore } from './widgets/score.js';

console.log('[G-WORLD] main.js loaded (Phase 2)');

/**
 * 起動シーケンス
 */
function bootstrap() {
  console.log('[G-WORLD] bootstrap start, version:', CONFIG.APP_VERSION);

  // 1. 状態を初期化
  State.init();

  // 2. テスト用ダミープレイヤーを設定（Phase 2のテストのみ）
  if (State.players.length === 0) {
    State.players = [{
      id: 'me',
      name: State.profile?.nickname || 'テスト',
      scores: new Array(18).fill(null),
      shots: new Array(18).fill(0),
      putts: new Array(18).fill(0),
      isMe: true
    }];
  }

  // 3. ヘッダーに名前を反映
  updateHeader();

  // 4. メイン領域に Phase 2 デモを描画
  renderPhase2Demo();

  console.log('[G-WORLD] ✅ bootstrap complete');
}

/** ヘッダーに現在のプレイヤー名を表示 */
function updateHeader() {
  const headerName = document.getElementById('header-name');
  if (!headerName) return;
  const profile = State.profile;
  headerName.textContent = profile && profile.nickname
    ? profile.nickname + 'さん'
    : 'ゲスト';
}

/**
 * Phase 2 デモ画面：UI部品とウィジェットの動作確認
 */
function renderPhase2Demo() {
  const root = document.getElementById('app-root');
  if (!root) return;

  root.innerHTML = `
    <div class="success-card">
      <div class="icon">🎨</div>
      <div class="title">Phase 2 起動成功！</div>
      <div class="desc">
        UI部品（Toast / Modal）と<br>
        スコアウィジェットが読み込まれました
      </div>
      <div class="module-list">
        ✅ ./scripts/ui/toast.js<br>
        ✅ ./scripts/ui/modal.js<br>
        ✅ ./scripts/widgets/score.js
      </div>
    </div>

    <div class="demo-section">
      <h3>🧪 UI部品テスト</h3>
      <button id="btn-test-toast-info" class="btn-primary">📢 Toast（情報）を表示</button>
      <button id="btn-test-toast-success" class="btn-primary">✅ Toast（成功）を表示</button>
      <button id="btn-test-toast-error" class="btn-primary">⚠️ Toast（エラー）を表示</button>
      <button id="btn-test-confirm" class="btn-primary">❓ Confirm モーダルを表示</button>
    </div>

    <div class="demo-section">
      <h3>⛳ スコアウィジェット（シンプル）</h3>
      <div id="score-widget-simple"></div>
    </div>

    <div class="demo-section">
      <h3>🎯 スコアウィジェット（カウンター）</h3>
      <div id="score-widget-counter"></div>
    </div>
  `;

  // ─── テストボタンのイベント ───
  document.getElementById('btn-test-toast-info').addEventListener('click', () => {
    toast('情報メッセージです');
  });
  document.getElementById('btn-test-toast-success').addEventListener('click', () => {
    toast('保存に成功しました', { type: 'success' });
  });
  document.getElementById('btn-test-toast-error').addEventListener('click', () => {
    toast('エラーが発生しました', { type: 'error', duration: 3000 });
  });
  document.getElementById('btn-test-confirm').addEventListener('click', async () => {
    const ok = await confirm('テスト確認', 'この操作を実行しますか？<br>（Phase 2デモ）');
    toast(ok ? '✅ OKが押されました' : '❌ キャンセルされました');
  });

  // ─── スコアウィジェットを2モードで描画 ───
  // シンプルモード
  State.inputMode = 'simple';
  renderScore(document.getElementById('score-widget-simple'));

  // カウンターモード
  State.inputMode = 'counter';
  renderScore(document.getElementById('score-widget-counter'));

  // Toast で起動成功を通知
  toast('🎉 Phase 2 起動完了', { type: 'success' });
}

// ─── DOM 準備完了を待って起動 ───
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
