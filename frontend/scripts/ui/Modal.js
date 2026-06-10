/******************************************************************
 * G-WORLD Frontend - Modal Helpers
 *
 * 汎用モーダルの開閉。GW.Core.UI に showModal / hideModal を追加する。
 * Toast.js が先に GW.Core.UI を初期化している前提。
 ******************************************************************/
(function () {
  'use strict';

  if (!GW.Core.UI) {
    console.error('[GW.UI] Modal.js: GW.Core.UI not initialized. Check load order.');
    return;
  }

  /** モーダル表示（汎用） */
  GW.Core.UI.showModal = function (modalId) {
    var el = document.getElementById(modalId);
    if (el) el.classList.add('show');
  };

  /** モーダル非表示 */
  GW.Core.UI.hideModal = function (modalId) {
    var el = document.getElementById(modalId);
    if (el) el.classList.remove('show');
  };
})();
