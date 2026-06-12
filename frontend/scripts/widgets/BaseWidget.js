// frontend/scripts/widgets/_BaseWidget.js
(function(global){
  'use strict';

  // GW名前空間の保証（防御的初期化）
  global.GW = global.GW || {};
  global.GW.Widgets = global.GW.Widgets || {};

  /**
   * すべてのWidgetの基底クラス
   * Backbone風 extend パターンで継承を提供
   */
  function BaseWidget(opts){
    this.options = opts || {};
    this.el = null;
    this._initialized = false;
  }

  BaseWidget.prototype = {
    init:    function(){ this._initialized = true; return this; },
    render:  function(){ return this; },
    destroy: function(){ this.el = null; this._initialized = false; },
    on:      function(evt, fn){
      if (!this._handlers) this._handlers = {};
      (this._handlers[evt] = this._handlers[evt] || []).push(fn);
      return this;
    },
    emit: function(evt, payload){
      var hs = this._handlers && this._handlers[evt];
      if (!hs) return;
      for (var i=0; i<hs.length; i++) { try { hs[i](payload); } catch(e){ console.error(e); } }
    }
  };

  /**
   * Backbone風 extend - 子クラス生成
   * 使い方:
   *   var GolfWidget = GW.Widgets.Base.extend({
   *     init: function(){ ... },
   *     render: function(){ ... }
   *   });
   */
  BaseWidget.extend = function(protoProps, staticProps){
    var Parent = this;
    var Child = function(){ Parent.apply(this, arguments); };

    // プロトタイプチェーン構築
    var Surrogate = function(){ this.constructor = Child; };
    Surrogate.prototype = Parent.prototype;
    Child.prototype = new Surrogate();

    // プロトタイプメソッドのコピー
    if (protoProps) {
      for (var k in protoProps) {
        if (Object.prototype.hasOwnProperty.call(protoProps, k)) {
          Child.prototype[k] = protoProps[k];
        }
      }
    }
    // スタティックプロパティのコピー
    if (staticProps) {
      for (var k2 in staticProps) {
        if (Object.prototype.hasOwnProperty.call(staticProps, k2)) {
          Child[k2] = staticProps[k2];
        }
      }
    }

    // 親の保持と extend の継承
    Child.__super__ = Parent.prototype;
    Child.extend = Parent.extend;
    return Child;
  };

  // 名前空間に登録
  global.GW.Widgets.Base = BaseWidget;

  // ★ここに新しく追加（ショートカットを作ってあげる）
global.GW.Widgets.extend = BaseWidget.extend;

  console.log('[GW] BaseWidget loaded');
})(window);
