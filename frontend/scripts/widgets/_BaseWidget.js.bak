/******************************************************************
 * G-WORLD - Base Widget
 *
 * 全 Widget の基底プロトタイプ。
 * 各 Widget は GW.Widgets.extend({...}) で自身を生成する。
 *
 * 【提供メソッド】
 *   - extend(definition) : 基底を継承した Widget オブジェクトを生成
 *   - registerActions(map) : GW.Core.Action へ一括登録
 *
 * 【規約】
 *   各 Widget は最低限 render() を実装すること。
 *   オプションで init() / onOnline() / onResize() を実装可能。
 ******************************************************************/
(function () {
  'use strict';

  var BaseProto = {
    /** 既定の render（各 Widget で上書き必須） */
    render: function () {
      console.warn('[GW.Widget] render() not implemented:', this.__widgetName__);
    },

    /** 既定の init（任意） */
    init: function () {
      // デフォルトは何もしない
    },

    /** GW.Core.Action に複数アクションを一括登録するヘルパ */
    registerActions: function (actionMap) {
      if (!GW.Core.Action || typeof GW.Core.Action.registerMany !== 'function') {
        console.warn('[GW.Widget] GW.Core.Action not ready for', this.__widgetName__);
        return;
      }
      GW.Core.Action.registerMany(actionMap);
    }
  };

  GW.Widgets = {
    /**
     * 基底を継承した Widget を生成する
     * @param {Object} definition - Widget 固有のメソッド/状態
     * @returns {Object} - 基底メソッドを継承した Widget
     */
    extend: function (definition) {
      var widget = Object.create(BaseProto);
      Object.keys(definition || {}).forEach(function (k) {
        widget[k] = definition[k];
      });
      return widget;
    }
  };
})();
