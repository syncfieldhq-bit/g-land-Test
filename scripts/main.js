/**
 * ═══════════════════════════════════════════════════════
 * scripts/main.js - 起動エントリーポイント（Phase 3）
 *
 * Phase 3 の追加：
 *   - Router（画面遷移管理）
 *   - Events（data-action 集中処理）
 *   - 3つの画面モジュール（Home / GLand / MyPage）
 *   - ボタン1つで画面切替が動く
 * ═══════════════════════════════════════════════════════
 */

// ─── core レイヤー ───
import { CONFIG } from './core/config.js';
import { State } from './core/state.js';
import { Router } from './core/router.js';
import { Events } from './core/events.js';

// ─── ui レイヤー ───
import { toast } from './ui/toast.js';

// ─── screens レイヤー（Phase 3 で追加） ───
import { HomeScreen } from './screens/home.js';
import { GLandScreen } from './screens/gland.js';
import { MyPageScreen } from './screens/mypage.js';

console.log('[G-WORLD] main.js loaded (Phase 3)');

/**
 * 起動シーケンス
 */
function bootstrap() {
  console.log('[G-WORLD] bootstrap start, version:', CONFIG.APP_VERSION);

  // 1. 状態を初期化
  State.init();

  // 2. ヘッダー名前を反映
  updateHeader();

  // 3. 画面モジュールを Router に登録
  Router.register('home',   HomeScreen);
  Router.register('gland',  GLandScreen);
  Router.register('mypage', MyPageScreen);

  // 4. Events に画面遷移ハンドラを差し込む
  Events.setRouteHandler((route) => {
    Router.go(route);
  });

  // 5. アクションハンドラを一括登録
  registerActions();

  // 6. グローバルクリックリスナーを起動
  Events.bind();

  // 7. 初期画面を決定して遷移
  const initial = Router.resolveInitial();
  Router.go(initial);

  console.log('[G-WORLD] ✅ bootstrap complete');
}

/**
 * 全アクションを一括登録
 */
function registerActions() {
  Events.registerMany({
    // ─── ホーム画面 ───
    'start-round': () => {
      Router.go('gland');
    },
    'coming-soon': (el) => {
      const name = el.getAttribute('data-name') || '機能';
      toast(`🔔 ${name} は近日公開予定です`);
    },

    // ─── G-LAND：登録 ───
    'register-profile': () => {
      GLandScreen.registerProfile();
      // ヘッダーも更新
      updateHeader();
    },
    'back-to-register': () => {
      GLandScreen.backToRegister();
      updateHeader();
    },

    // ─── G-LAND：コース選択 ───
    'cs-toggle': (el) => {
      GLandScreen.toggleCourse(el.getAttribute('data-course-id'));
    },
    'cs-confirm': (el) => {
      GLandScreen.confirmCourse(
        el.getAttribute('data-course-id'),
        el.getAttribute('data-variant')
      );
    },
    'change-course': () => {
      GLandScreen.changeCourse();
    },

    // ─── G-LAND：モード切替 ───
    'set-mode-simple':  () => GLandScreen.setInputMode('simple'),
    'set-mode-counter': () => GLandScreen.setInputMode('counter'),

    // ─── G-LAND：終了 ───
    'finish-round': () => {
      GLandScreen.finishRound();
    },

    // ─── マイページ ───
    'logout': () => {
      MyPageScreen.logout();
    }
  });
}

/**
 * ヘッダーに現在のプレイヤー名を表示
 */
function updateHeader() {
  const headerName = document.getElementById('header-name');
  if (!headerName) return;
  const profile = State.profile;
  headerName.textContent = profile && profile.nickname
    ? profile.nickname + 'さん'
    : 'ゲスト';
}

// ─── DOM 準備完了を待って起動 ───
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
