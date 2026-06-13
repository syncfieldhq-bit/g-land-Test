/**
 * ═══════════════════════════════════════════════════════
 * scripts/app/wiring.js - data-action ハンドラの一括配線
 *
 * 【目的】
 *   「data-action="xxx" を押したら何が起きるか」を1箇所に集約。
 *   main.js に散らばっていたハンドラを整理し、見通しを良くする。
 *
 * 【追加・変更の手順】
 *   1. HTML 側に <button data-action="my-action"> を書く
 *   2. このファイルの ACTIONS マップに 'my-action': fn を追加するだけ
 * ═══════════════════════════════════════════════════════
 */

import { Events } from '../core/events.js';
import { Router } from '../core/router.js';
import { EventBus } from '../core/event-bus.js';
import { EVENTS, ROUTES } from '../core/constants.js';
import { toast } from '../ui/toast.js';

import { HomeScreen } from '../screens/home.js';
import { GLandScreen } from '../screens/gland.js';
import { MyPageScreen } from '../screens/mypage.js';

/**
 * 全 data-action ハンドラを Events に登録
 */
export function wireActions() {
  Events.registerMany({

    // ═══════════════════════════════════════════
    // ホーム画面
    // ═══════════════════════════════════════════
    'start-round': () => {
      Router.go(ROUTES.GLAND);
    },
    'coming-soon': (el) => {
      const name = el.getAttribute('data-name') || '機能';
      toast(`🔔 ${name} は近日公開予定です`);
    },

    // ═══════════════════════════════════════════
    // G-LAND：登録カード
    // ═══════════════════════════════════════════
    'register-profile': () => {
      GLandScreen.registerProfile();
      EventBus.emit(EVENTS.PROFILE_CHANGED);
    },
    'back-to-register': () => {
      GLandScreen.backToRegister();
      EventBus.emit(EVENTS.PROFILE_CHANGED);
    },

    // ═══════════════════════════════════════════
    // G-LAND：コース選択
    // ═══════════════════════════════════════════
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

    // ═══════════════════════════════════════════
    // G-LAND：モード切替
    // ═══════════════════════════════════════════
    'set-mode-simple':  () => GLandScreen.setInputMode('simple'),
    'set-mode-counter': () => GLandScreen.setInputMode('counter'),

    // ═══════════════════════════════════════════
    // G-LAND：ラウンド終了
    // ═══════════════════════════════════════════
    'finish-round': () => {
      GLandScreen.finishRound();
    },

    // ═══════════════════════════════════════════
    // マイページ
    // ═══════════════════════════════════════════
    'logout': () => {
      MyPageScreen.logout();
    }
  });

  console.log('[app/wiring] actions wired');
}
