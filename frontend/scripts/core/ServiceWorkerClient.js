/******************************************************************
 * G-WORLD Frontend - Service Worker Registration
 *
 * 【SECTION 10】GW.Core.SW - Service Worker 登録
 *
 * 設計意図：
 *   - ゴルフ場での電波弱地帯対応の核心
 *   - 登録失敗してもアプリは普通に動く（致命的でない）
 ******************************************************************/
(function () {
  'use strict';

  GW.Core.SW = {
    register: function () {
      if (!('serviceWorker' in navigator)) {
        console.log('[GW.SW] not supported');
        return Promise.resolve(null);
      }
      return navigator.serviceWorker.register('./service-worker.js')
        .then(function (reg) {
          console.log('[GW.SW] registered:', reg.scope);
          return reg;
        })
        .catch(function (err) {
          console.warn('[GW.SW] register failed:', err);
          return null;
        });
    }
  };
})();
