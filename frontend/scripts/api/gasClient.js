/******************************************************************
 * G-WORLD Frontend - GAS API Client
 *
 * 【SECTION 5】GW.Core.Api - GAS API 通信レイヤ
 *
 * 設計意図：
 *   - 本ファイルが google.script.run / fetch の唯一の窓口
 *   - action ルーター方式に対応（funcName ではなく action パラメータを送る）
 *   - 通信は2系統に分離：
 *       ◆ Promise版 GW.Core.Api.call()  → 戻り値が即必要な処理（起動時等）
 *       ◆ Fire&Forget GW.Core.Api.fire() → 戻り値不要な書込処理
 *   - すべてのリクエストに apiVersion / device_id / gw_user_id を自動付与
 *   - keepalive:true でページ離脱時も最後まで送信完了
 *
 * 【重要】将来 google.script.run 方式に切り替える場合も、
 *         本ファイルの差し替えだけで全モジュールが追従できる。
 ******************************************************************/
(function () {
  'use strict';

  GW.Core.Api = {
    /**
     * Promise版API呼び出し
     *   起動時のboot bundle取得、QR解決、履歴取得など、戻り値が即欲しい処理用。
     *
     * @param {string} action - アクション名（例: 'gland.boot'）
     * @param {Object} [payload] - リクエストボディ
     * @returns {Promise<Object>} - サーバの data フィールド
     */
    call: function (action, payload) {
      var body = JSON.stringify({
        action:     action,
        payload:    payload || {},
        apiVersion: GW.Core.Config.API_VERSION,
        // サーバ側で識別・記録するためのメタ情報
        meta: {
          deviceId:  GW.Core.Auth.getDeviceId(),
          gwUserId:  GW.Core.Auth.getUserId() || '',
          useCount:  GW.Core.Auth.getUseCount(),
          state:     GW.Core.Auth.getState(),
          ts:        Date.now()
        }
      });

      var fetchOpts = {
        method: 'POST',
        body:   body
      };
      // 離脱中も送信を完了させる（GAS制限内では効果あり）
      try { fetchOpts.keepalive = true; } catch (e) {}

      return fetch(GW.Core.Config.GAS_URL, fetchOpts)
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (res && res.ok === true) {
            return res; // 全体を返す（ok以外のメタも使うため）
          }
          // 旧API互換：success フィールド形式も受け入れる
          if (res && res.success === true) {
            return res.data;
          }
          var errMsg = (res && (res.error || res.msg)) || 'unknown server error';
          throw new Error(errMsg);
        });
    },

    /**
     * Fire-and-Forget版API呼び出し
     *   スコア保存・履歴記録など、UIをブロックしてはいけない処理用。
     *   内部で GW.Core.Queue にジョブを積むだけ。
     *
     * @param {string} action
     * @param {Object} [payload]
     * @param {Function} [onSuccess]
     * @param {Function} [onError]
     * @param {string} [dedupeKey]
     */
    fire: function (action, payload, onSuccess, onError, dedupeKey) {
      GW.Core.Queue.add(action, payload, onSuccess, onError, dedupeKey);
    }
  };
})();
