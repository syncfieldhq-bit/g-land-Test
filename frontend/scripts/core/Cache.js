/******************************************************************
 * G-WORLD Frontend - Cache
 *
 * 【SECTION 3】GW.Core.Cache - キャッシュ層（既存BootCache継承）
 *
 * 設計意図：
 *   - 24時間TTL付きキャッシュ
 *   - boot bundle / スコア / 同伴メンバーを分けて格納
 *   - キーは Config.KEYS で集中管理し、タイプミス防止
 ******************************************************************/
(function () {
  'use strict';

  GW.Core.Cache = {
    /** boot bundle（コース・設定）を保存 */
    saveBoot: function (bundle) {
      GW.Core.Storage.setJSON(GW.Core.Config.KEYS.BOOT_BUNDLE, {
        courses:        bundle.courses        || [],
        activeCourseId: bundle.activeCourseId || '',
        isFinalized:    !!bundle.isFinalized,
        savedAt:        Date.now()
      });
    },

    /** boot bundle を取得（期限切れなら null）*/
    loadBoot: function () {
      var data = GW.Core.Storage.getJSON(GW.Core.Config.KEYS.BOOT_BUNDLE);
      if (!data || !data.savedAt) return null;
      if (Date.now() - data.savedAt > GW.Core.Config.CACHE_TTL_MS) return null;
      return data;
    },

    /** 自分のスコアをキャッシュ */
    saveMyScores: function (playerId, scores) {
      if (!playerId) return;
      GW.Core.Storage.setJSON(GW.Core.Config.KEYS.SCORES_PREFIX + playerId, {
        scores:  scores,
        savedAt: Date.now()
      });
    },

    /** 自分のスコアをキャッシュから取得 */
    loadMyScores: function (playerId) {
      if (!playerId) return null;
      var data = GW.Core.Storage.getJSON(GW.Core.Config.KEYS.SCORES_PREFIX + playerId);
      if (!data || !data.savedAt) return null;
      if (Date.now() - data.savedAt > GW.Core.Config.CACHE_TTL_MS) return null;
      return data.scores;
    },

    /** 同伴メンバー情報をキャッシュ */
    saveMates: function (courseId, groupName, payload) {
      var key = GW.Core.Config.KEYS.MATES_PREFIX + courseId + '_' + groupName;
      GW.Core.Storage.setJSON(key, { data: payload, savedAt: Date.now() });
    },

    /** 同伴メンバー情報をキャッシュから取得 */
    loadMates: function (courseId, groupName) {
      var key = GW.Core.Config.KEYS.MATES_PREFIX + courseId + '_' + groupName;
      var data = GW.Core.Storage.getJSON(key);
      if (!data || !data.savedAt) return null;
      if (Date.now() - data.savedAt > GW.Core.Config.CACHE_TTL_MS) return null;
      return data.data;
    },

    /** 全キャッシュをクリア（リセット時のみ使用） */
    clearAll: function () {
      GW.Core.Storage.remove(GW.Core.Config.KEYS.BOOT_BUNDLE);
      GW.Core.Storage.removeByPrefix(GW.Core.Config.KEYS.SCORES_PREFIX);
      GW.Core.Storage.removeByPrefix(GW.Core.Config.KEYS.MATES_PREFIX);
    }
  };
})();
