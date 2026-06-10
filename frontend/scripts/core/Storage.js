/******************************************************************
 * G-WORLD Frontend - Storage
 *
 * 【SECTION 2】GW.Core.Storage - localStorage 抽象化
 *
 * 設計意図：
 *   - localStorage アクセスは try/catch 必須（プライベートモード対策）
 *   - JSON のシリアライズ/デシリアライズも一元化
 *   - 将来 IndexedDB へ移行する際の差し替えポイントになる
 ******************************************************************/
(function () {
  'use strict';

  GW.Core.Storage = {
    /** 値を取得（無ければデフォルト） */
    get: function (key, defaultValue) {
      try {
        var v = localStorage.getItem(key);
        return v === null ? (defaultValue === undefined ? null : defaultValue) : v;
      } catch (e) {
        return defaultValue === undefined ? null : defaultValue;
      }
    },

    /** 値を保存 */
    set: function (key, value) {
      try {
        localStorage.setItem(key, String(value));
        return true;
      } catch (e) {
        // QuotaExceededError 等は静かに失敗（ユーザー体験を壊さない）
        return false;
      }
    },

    /** JSONオブジェクトを取得 */
    getJSON: function (key, defaultValue) {
      try {
        var raw = localStorage.getItem(key);
        if (raw === null) return defaultValue === undefined ? null : defaultValue;
        return JSON.parse(raw);
      } catch (e) {
        return defaultValue === undefined ? null : defaultValue;
      }
    },

    /** JSONオブジェクトを保存 */
    setJSON: function (key, obj) {
      try {
        localStorage.setItem(key, JSON.stringify(obj));
        return true;
      } catch (e) {
        return false;
      }
    },

    /** キーを削除 */
    remove: function (key) {
      try {
        localStorage.removeItem(key);
      } catch (e) {}
    },

    /** プレフィックスに一致するキーを一括削除（モジュール切替時等で使用） */
    removeByPrefix: function (prefix) {
      try {
        var toDelete = [];
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (k && k.indexOf(prefix) === 0) toDelete.push(k);
        }
        toDelete.forEach(function (k) { localStorage.removeItem(k); });
      } catch (e) {}
    }
  };
})();
