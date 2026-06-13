/**
 * ═══════════════════════════════════════════════════════
 * scripts/core/router.js - 画面遷移ルーター
 *
 * 役割：
 *   - 画面（screen）の表示切替
 *   - 各画面モジュールの render() を呼び出す
 *   - URLハッシュ（#home, #gland）と同期
 *
 * 使い方:
 *   import { Router } from './core/router.js';
 *   Router.register('home', HomeModule);
 *   Router.go('home');
 * ═══════════════════════════════════════════════════════
 */

import { State } from './state.js';

export const Router = {
  /** ルート定義：{ name: { module, container } } */
  _routes: {},

  /** 現在のルート名 */
  current: null,

  /**
   * 画面モジュールを登録
   *
   * @param {string} name - ルート名（'home', 'gland'など）
   * @param {Object} module - { render: function(container, params) }
   * @param {string} [containerId='app-root'] - 描画先の要素ID
   */
  register(name, module, containerId = 'app-root') {
    this._routes[name] = { module, containerId };
    console.log('[Router] registered:', name);
  },

  /**
   * 指定したルートへ遷移
   *
   * @param {string} name - ルート名
   * @param {Object} [params] - 画面に渡すパラメータ
   */
  go(name, params = {}) {
    const route = this._routes[name];
    if (!route) {
      console.warn('[Router] unknown route:', name);
      return;
    }

    // 状態を更新
    State.currentRoute = name;
    this.current = name;

    // URLハッシュを更新（戻るボタン対応の布石）
    try {
      if (location.hash !== '#' + name) {
        history.replaceState(null, '', '#' + name);
      }
    } catch (e) {}

    // フッターナビの active 状態を更新
    this._updateNavActive(name);

    // 描画先要素を取得
    const container = document.getElementById(route.containerId);
    if (!container) {
      console.warn('[Router] container not found:', route.containerId);
      return;
    }

    // 画面モジュールの render を呼ぶ
    try {
      if (typeof route.module.render === 'function') {
        route.module.render(container, params);
      }
    } catch (e) {
      console.error('[Router] render error:', name, e);
    }

    console.log('[Router] →', name);
  },

  /**
   * フッターナビのアクティブ状態を更新
   */
  _updateNavActive(name) {
    const btns = document.querySelectorAll('.footer-nav [data-route]');
    btns.forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-route') === name);
    });
  },

  /**
   * 初期ルートを決定（URLハッシュから）
   */
  resolveInitial() {
    try {
      const hash = (location.hash || '').replace(/^#/, '');
      if (hash && this._routes[hash]) return hash;
    } catch (e) {}
    return 'home';
  }
};

console.log('[core/router] loaded');
