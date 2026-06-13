/**
 * ═══════════════════════════════════════════════════════
 * scripts/core/event-bus.js - 軽量パブサブ（モジュール間通信）
 *
 * 【目的】
 *   モジュール A が直接モジュール B を import して呼ぶ「密結合」を解消。
 *   代わりに「イベントを発火する／購読する」だけにする。
 *
 * 【使い方】
 *   // 購読側（例：HomeScreen）
 *   import { EventBus } from './core/event-bus.js';
 *   import { EVENTS } from './core/constants.js';
 *   EventBus.on(EVENTS.SCORE_UPDATED, (data) => { ... });
 *
 *   // 発火側（例：ScoreWidget）
 *   EventBus.emit(EVENTS.SCORE_UPDATED, { hole: 1, stroke: 4 });
 *
 * 【メリット】
 *   - 直接 import せずに通信できる
 *   - 1つのイベントに複数モジュールが反応可能
 *   - テスト時にモック差し替えが容易
 * ═══════════════════════════════════════════════════════
 */

class EventBusImpl {
  constructor() {
    /** 登録されたリスナー：{ eventName: [handler, ...] } */
    this._listeners = {};
    /** デバッグログ出力するか */
    this._debug = false;
  }

  /**
   * イベントを購読
   *
   * @param {string} event - イベント名（constants.EVENTS を使用推奨）
   * @param {Function} handler - 受信時のハンドラ (payload) => void
   * @returns {Function} 購読解除関数
   */
  on(event, handler) {
    if (!this._listeners[event]) {
      this._listeners[event] = [];
    }
    this._listeners[event].push(handler);

    if (this._debug) {
      console.log('[EventBus] on:', event, '(total:', this._listeners[event].length, ')');
    }

    // 購読解除関数を返す
    return () => this.off(event, handler);
  }

  /**
   * 1回だけ購読（自動的に解除される）
   */
  once(event, handler) {
    const wrapped = (payload) => {
      this.off(event, wrapped);
      handler(payload);
    };
    return this.on(event, wrapped);
  }

  /**
   * 購読解除
   */
  off(event, handler) {
    const list = this._listeners[event];
    if (!list) return;
    const idx = list.indexOf(handler);
    if (idx >= 0) list.splice(idx, 1);
  }

  /**
   * イベントを発火
   *
   * @param {string} event - イベント名
   * @param {*} payload - リスナーに渡すデータ
   */
  emit(event, payload) {
    if (this._debug) {
      console.log('[EventBus] emit:', event, payload);
    }
    const list = this._listeners[event];
    if (!list || list.length === 0) return;

    // ハンドラのコピーをループ（実行中に list が変化しても安全）
    [...list].forEach((handler) => {
      try {
        handler(payload);
      } catch (e) {
        console.error('[EventBus] handler error for', event, ':', e);
      }
    });
  }

  /**
   * 指定イベントの全リスナーを削除（テスト時等）
   */
  clear(event) {
    if (event) {
      delete this._listeners[event];
    } else {
      this._listeners = {};
    }
  }

  /**
   * デバッグモード切替（開発時のみ）
   */
  setDebug(enabled) {
    this._debug = !!enabled;
  }

  /**
   * 現在の購読状況をスナップショット
   */
  inspect() {
    const result = {};
    Object.keys(this._listeners).forEach((event) => {
      result[event] = this._listeners[event].length;
    });
    return result;
  }
}

// シングルトンとしてエクスポート
export const EventBus = new EventBusImpl();

console.log('[core/event-bus] loaded');
