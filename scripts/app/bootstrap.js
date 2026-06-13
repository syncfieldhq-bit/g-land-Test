/**
 * ═══════════════════════════════════════════════════════
 * scripts/app/bootstrap.js - アプリ起動シーケンス
 *
 * 【目的】
 *   main.js を「これを呼ぶだけ」にスリム化。
 *   起動フェーズを宣言的に並べて、順序や失敗時の挙動を明確にする。
 *
 * 【起動フェーズ】
 *   1. core   : 設定読み込み・状態初期化
 *   2. router : 画面モジュールを登録
 *   3. wiring : イベントハンドラを配線
 *   4. render : 初期画面を描画
 * ═══════════════════════════════════════════════════════
 */

import { CONFIG } from '../core/config.js';
import { EVENTS, ROUTES } from '../core/constants.js';
import { State } from '../core/state.js';
import { Router } from '../core/router.js';
import { Events } from '../core/events.js';
import { EventBus } from '../core/event-bus.js';

import { HomeScreen } from '../screens/home.js';
import { GLandScreen } from '../screens/gland.js';
import { MyPageScreen } from '../screens/mypage.js';

import { wireActions } from './wiring.js';

/**
 * 起動シーケンスを実行
 */
export async function bootstrap() {
  const t0 = Date.now();
  console.log('[bootstrap] start, version:', CONFIG.APP_VERSION);

  // 各フェーズを順番に実行
  const phases = [
    { name: 'core',   fn: initCore },
    { name: 'router', fn: initRouter },
    { name: 'wiring', fn: initWiring },
    { name: 'render', fn: renderInitial }
  ];

  for (const phase of phases) {
    try {
      const ts = Date.now();
      await phase.fn();
      console.log(`[bootstrap] ✓ ${phase.name} (${Date.now() - ts}ms)`);
    } catch (e) {
      console.error(`[bootstrap] ✗ ${phase.name} failed:`, e);
      // 致命的エラーでも、可能な限り続行を試みる
    }
  }

  console.log(`[bootstrap] ✅ complete in ${Date.now() - t0}ms`);
  EventBus.emit('app:ready');
}

/**
 * フェーズ1：core 初期化
 */
function initCore() {
  // State を localStorage から復元
  State.init();
  updateHeader();
}

/**
 * フェーズ2：Router に画面を登録
 */
function initRouter() {
  Router.register(ROUTES.HOME,   HomeScreen);
  Router.register(ROUTES.GLAND,  GLandScreen);
  Router.register(ROUTES.MYPAGE, MyPageScreen);

  // Router と Events を接続
  Events.setRouteHandler((route) => Router.go(route));
}

/**
 * フェーズ3：アクションハンドラを配線
 */
function initWiring() {
  wireActions();        // data-action ハンドラを一括登録
  Events.bind();        // グローバルクリックリスナーを起動

  // EventBus 経由でヘッダー名前を同期
  EventBus.on(EVENTS.PROFILE_CHANGED, updateHeader);
  EventBus.on(EVENTS.COMPANION_EDITED, updateHeader);
}

/**
 * フェーズ4：初期画面を描画
 */
function renderInitial() {
  const initial = Router.resolveInitial();
  Router.go(initial);
}

/**
 * ヘッダーにプレイヤー名を反映（共通ヘルパー）
 */
function updateHeader() {
  const headerName = document.getElementById('header-name');
  if (!headerName) return;
  const profile = State.profile;
  headerName.textContent = profile && profile.nickname
    ? profile.nickname + 'さん'
    : 'ゲスト';
}

console.log('[app/bootstrap] loaded');
