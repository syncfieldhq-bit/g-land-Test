/******************************************************************
 * G-WORLD Frontend - UI Components (Toast / Confirm / Boot / Error)
 *
 * 【SECTION 7】GW.Core.UI - UI共通部品（Toast / Modal / Confirm / Loading）
 *
 * 設計意図：
 *   - 全モジュールが共通で使う UI 部品の集約
 *   - alert()/confirm()/prompt() は iOS PWA で表示崩れの原因になるため
 *     必ずこのモジュール経由でモーダル表示する
 *
 * 【重要】本ファイルが GW.Core.UI 全体の土台を作る。
 *         Modal.js は本ファイルが作った GW.Core.UI に追加メソッドを生やすだけ。
 ******************************************************************/
(function () {
  'use strict';

  GW.Core.UI = {
    _toastTimer: null,
    _confirmCallback: null,

    /** トースト表示 */
    toast: function (msg, duration) {
      var t = document.getElementById('gw-toast');
      if (!t) return;
      t.textContent = msg;
      t.classList.add('show');
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(function () {
        t.classList.remove('show');
      }, duration || 1800);
    },

    /** 確認モーダル（OK/キャンセル） */
    confirm: function (title, body, onOk) {
      document.getElementById('gw-confirm-title').textContent = title || '確認';
      document.getElementById('gw-confirm-body').innerHTML =
        this._escapeHtml(body || '').replace(/\n/g, '<br>');
      this._confirmCallback = onOk || null;
      document.getElementById('gw-modal-confirm').classList.add('show');
    },

    _closeConfirm: function () {
      document.getElementById('gw-modal-confirm').classList.remove('show');
      this._confirmCallback = null;
    },

    _execConfirm: function () {
      var cb = this._confirmCallback;
      this._closeConfirm();
      if (typeof cb === 'function') cb();
    },

    /**
     * ハプティックフィードバック（短い振動）
     *   ボタン押下時の物理的フィードバックを再現
     */
    haptic: function () {
      if (navigator.vibrate) {
        try { navigator.vibrate(10); } catch (e) {}
      }
    },

    /**
     * HTMLエスケープ（XSS対策・全モジュール共通）
     *
     * ★重要：this を使わないアロー的実装にしている。
     *   理由：var esc = GW.Core.UI.escapeHtml; のように変数に代入されても
     *         動作する必要があるため（_render 内で実際にこの使い方をしている）
     */
    escapeHtml: function (s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m];
      });
    },

    /**
     * 互換用エイリアス（旧コードが this._escapeHtml を呼んでいる場合のため）
     * 内部実装も escapeHtml と同じ
     */
    _escapeHtml: function (s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m];
      });
    },

    /** 起動オーバーレイの表示テキストを更新 */
    setBootText: function (text) {
      var el = document.getElementById('gw-boot-sub');
      if (el) el.textContent = text;
    },

    /** 起動オーバーレイを隠す */
    hideBoot: function () {
      var el = document.getElementById('gw-boot-overlay');
      if (el) el.classList.add('hidden');
    },

    /** 起動エラーバナーを表示 */
    showStartupError: function (message, detail) {
      var banner = document.getElementById('gw-startup-error');
      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'gw-startup-error';
        banner.className = 'gw-startup-error';
        document.body.appendChild(banner);
      }
      var detailHtml = detail
        ? '<div style="font-size:11px;opacity:0.85;margin-top:4px;">' + this._escapeHtml(detail) + '</div>'
        : '';
      banner.innerHTML =
        '<button class="err-close" data-action="close-startup-error">×</button>' +
        '<div class="err-title">⚠ 起動エラー</div>' +
        '<div>' + this._escapeHtml(message) + '</div>' +
        detailHtml;
    }
  };
})();
