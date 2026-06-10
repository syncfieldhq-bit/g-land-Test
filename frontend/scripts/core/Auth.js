/******************************************************************
 * G-WORLD Frontend - Auth & Identity
 *
 * 【SECTION 6】GW.Core.Auth - 認証・ID管理（★G-WORLD の心臓部）
 *
 * 設計意図【設計憲法・第1条・第7条】：
 *   - GW_USER_ID は端末ローカル発行（GW-G-*）でスタート → 永久無料・即利用可
 *   - 利用回数 7,14,21,30,60 回到達時に「データ保全のご案内」モーダル
 *   - "認証"・"ログイン" という言葉は使わない。"バックアップ" "データ保全" で統一
 *   - 機種変更時の引き継ぎは backup_links 経由で GW-G-* → GW-B-* に変換
 *   - ローカルIDの段階でも全機能が完全に動く（押し付けゼロ）
 ******************************************************************/
(function () {
  'use strict';

  GW.Core.Auth = {
    /**
     * 起動時に呼ばれる初期化
     *   - GW_USER_ID が無ければ新規発行（GW-G-*）
     *   - 利用回数を+1
     *   - 最終アクセス時刻を更新
     */
    boot: function () {
      // ── GW_USER_ID ──
      var uid = GW.Core.Storage.get(GW.Core.Config.KEYS.USER_ID);
      if (!uid) {
        uid = this._generateGuestId();
        GW.Core.Storage.set(GW.Core.Config.KEYS.USER_ID, uid);
        GW.Core.Storage.set(GW.Core.Config.KEYS.STATE, 'guest');
      }

      // ── デバイスID（端末識別、永久不変） ──
      if (!GW.Core.Storage.get(GW.Core.Config.KEYS.DEVICE_ID)) {
        var did = 'D-' + Date.now().toString(36).toUpperCase() + '-' +
                  Math.floor(Math.random() * 0xFFFFFF).toString(16).toUpperCase();
        GW.Core.Storage.set(GW.Core.Config.KEYS.DEVICE_ID, did);
      }

      // ── 利用回数を+1 ──
      var count = Number(GW.Core.Storage.get(GW.Core.Config.KEYS.USE_COUNT, '0')) + 1;
      GW.Core.Storage.set(GW.Core.Config.KEYS.USE_COUNT, count);

      // ── 最終アクセス更新 ──
      GW.Core.Storage.set(GW.Core.Config.KEYS.LAST_ACTIVE, String(Date.now()));

      return {
        userId:   uid,
        state:    GW.Core.Storage.get(GW.Core.Config.KEYS.STATE, 'guest'),
        useCount: count,
        deviceId: GW.Core.Storage.get(GW.Core.Config.KEYS.DEVICE_ID)
      };
    },

    /** ゲストモードIDを発行 */
    _generateGuestId: function () {
      // UUID風8桁。Math.randomベースだが、衝突時はサーバが backup_links 経由で吸収するため許容
      var seg = function () {
        return Math.floor(Math.random() * 0xFFFFFF).toString(16).toUpperCase().padStart(6, '0');
      };
      return 'GW-G-' + seg().substring(0, 4) + seg().substring(0, 4);
    },

    /** GW_USER_ID を取得 */
    getUserId: function () {
      return GW.Core.Storage.get(GW.Core.Config.KEYS.USER_ID);
    },

    /** 状態取得（'guest' or 'backed_up'） */
    getState: function () {
      return GW.Core.Storage.get(GW.Core.Config.KEYS.STATE, 'guest');
    },

    /** ゲストモードかどうか */
    isGuest: function () {
      return this.getState() === 'guest';
    },

    /** 利用回数を取得 */
    getUseCount: function () {
      return Number(GW.Core.Storage.get(GW.Core.Config.KEYS.USE_COUNT, '0'));
    },

    /** デバイスIDを取得 */
    getDeviceId: function () {
      return GW.Core.Storage.get(GW.Core.Config.KEYS.DEVICE_ID);
    },

    /** プロフィール情報を取得 */
    getProfile: function () {
      return GW.Core.Storage.getJSON(GW.Core.Config.KEYS.PROFILE, {});
    },

    /** プロフィール情報を保存 */
    setProfile: function (profile) {
      GW.Core.Storage.setJSON(GW.Core.Config.KEYS.PROFILE, profile);
    },

    /**
     * データ保全モーダルを表示すべきタイミング判定
     *   設計憲法・第1条：押し付けず、節目（7, 14, 21, 30, 60回）でのみ提示
     *   かつ、過去24時間以内に提示済みなら再提示しない（うるさくならないよう配慮）
     */
    shouldShowBackupPrompt: function () {
      // 既にバックアップ済みなら不要
      if (!this.isGuest()) return false;

      var count = this.getUseCount();
      var milestone = GW.Core.Config.BACKUP_PROMPT_AT.indexOf(count) >= 0;
      if (!milestone) return false;

      // 24時間以内に提示済みならスキップ
      var lastPrompt = Number(GW.Core.Storage.get(GW.Core.Config.KEYS.LAST_PROMPT, '0'));
      if (lastPrompt && Date.now() - lastPrompt < 24 * 60 * 60 * 1000) {
        return false;
      }
      return true;
    },

    /** 「あとで」を選択された記録 */
    dismissBackupPrompt: function () {
      GW.Core.Storage.set(GW.Core.Config.KEYS.LAST_PROMPT, String(Date.now()));
    },

    /**
     * バックアップ連携を完了させる（ゲスト → バックアップ済みへ遷移）
     *
     * 実装フェーズ：
     *   現在は「ご案内のみ」段階のため、実プロバイダ連携は将来実装。
     *   この関数はインターフェース確定用のスタブ。
     *   将来 Google/LINE/Apple SDK を組み込む際の差し替えポイント。
     */
    linkBackup: function (provider, providerUid) {
      var self = this;
      var oldId = this.getUserId();

      return GW.Core.Api.call('core.linkBackup', {
        oldGwUserId:   oldId,
        provider:      provider,    // 'google' | 'line' | 'apple'
        providerUid:   providerUid,
        deviceId:      this.getDeviceId(),
        profile:       this.getProfile()
      }).then(function (res) {
        if (res && res.ok && res.newGwUserId) {
          // 新IDで上書き
          GW.Core.Storage.set(GW.Core.Config.KEYS.USER_ID, res.newGwUserId);
          GW.Core.Storage.set(GW.Core.Config.KEYS.STATE, 'backed_up');
          GW.Core.UI.toast('✅ データを保全しました');
          return res;
        }
        throw new Error((res && res.error) || 'バックアップ連携に失敗しました');
      });
    },

    /**
     * ログアウト（別プレイヤーで使う）
     *   端末ローカルのGW_USER_IDをクリアして再発行を促す。
     *   ※バックアップ済みの場合は警告を出すべきだが、初期実装ではシンプルに。
     */
    reset: function () {
      // GW.Core.Config.KEYS の全てをクリア
      Object.keys(GW.Core.Config.KEYS).forEach(function (k) {
        var key = GW.Core.Config.KEYS[k];
        if (typeof key === 'string') {
          if (key.endsWith('_')) {
            GW.Core.Storage.removeByPrefix(key);
          } else {
            GW.Core.Storage.remove(key);
          }
        }
      });
      GW.Core.Cache.clearAll();
    }
  };
})();
