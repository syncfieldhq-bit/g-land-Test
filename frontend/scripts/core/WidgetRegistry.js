/******************************************************************
 * G-WORLD Frontend - Widget Registry
 *
 * 趣味プラグインのレジストリ。
 * 各 Widget は本レジストリに self を登録し、Router から名前で解決される。
 *
 * 【設計思想】
 *   - 新趣味追加は widgets/{name}/index.js で register() を呼ぶだけで完結
 *   - Router は GW.Modules[name] を直接見ているが、内部的には Registry が
 *     その登録を仲介している（将来 lazy load 等を差し込む拡張余地を残す）
 ******************************************************************/
(function () {
  'use strict';

  GW.Core.WidgetRegistry = {
    _registry: {},

    /**
     * Widget を登録する
     * @param {string} name - Router の routes.module 名と一致させること
     * @param {Object} widget - render() / init() / 必要に応じ onOnline / onResize 等を持つオブジェクト
     */
    register: function (name, widget) {
      if (!name || !widget) {
        console.warn('[GW.WidgetRegistry] invalid register call:', name);
        return;
      }
      if (this._registry[name]) {
        console.warn('[GW.WidgetRegistry] duplicate registration:', name);
      }
      this._registry[name] = widget;

      // Router が参照する GW.Modules にも同時登録（既存コードと互換）
      GW.Modules[name] = widget;

      // init() があれば即時実行（data-action 登録など）
      if (typeof widget.init === 'function') {
        try {
          widget.init();
        } catch (e) {
          console.error('[GW.WidgetRegistry] init error in ' + name + ':', e);
        }
      }

      console.log('[GW.WidgetRegistry] registered:', name);
    },

    /** 登録された Widget を取得 */
    get: function (name) {
      return this._registry[name] || null;
    },

    /** 全 Widget 一覧 */
    list: function () {
      return Object.keys(this._registry);
    }
  };
})();
