/******************************************************************
 * G-WORLD Frontend - App Config
 *
 * 【SECTION 1】GW.Core.Config - 全アプリ定数
 *
 * 設計意図：
 *   定数を一箇所に集約することで、デプロイ時の変更を1ファイル/1箇所で完結。
 *   将来のSQL移行・API URL変更にも強い。
 ******************************************************************/
(function () {
  'use strict';

  GW.Core.Config = {
    /**
     * GAS Web App URL
     *
     * 【デプロイ時の唯一の書換ポイント】
     *   コード.gs をデプロイすると新しい URL が払い出される。
     *   そのURLをここに貼り付けるだけで本番切替が完了する。
     *
     *   ※ 開発期間中は v4.7 と同じURLを使用（既存データ完全保全のため）
     */
    GAS_URL: 'https://script.google.com/macros/s/AKfycbyJbjVYmqATkJe2Ial5XOK_CYXCfkPWEIpKOtZziwDQ490l-AfNNF43gwls20y1N2FHgg/exec',

    /** API バージョン。サーバ側との整合確認に使用 */
    API_VERSION: 'v1',

    /** アプリバージョン（ユーザーに見せる用） */
    APP_VERSION: '1.0.0',

    /** キャッシュ有効期間（24時間） */
    CACHE_TTL_MS: 24 * 60 * 60 * 1000,

    /** SaveQueueの並列数上限 */
    SAVE_PARALLEL: 2,

    /** SaveQueueのリトライ上限 */
    SAVE_RETRY_MAX: 3,

    /** スコア保存のデバウンス遅延（ms）*/
    SCORE_DEBOUNCE_MS: 150,

    /** 同伴メンバー表のポーリング間隔（ms）*/
    MATES_POLL_MS: 30000,

    /**
     * データ保全のご案内モーダルを表示する利用回数
     * 設計憲法・第1条：押し付けず、節目ごとに穏やかに再案内
     */
    BACKUP_PROMPT_AT: [7, 14, 21, 30, 60],

    /** localStorage キー一覧（タイプミス防止のため一箇所に集約） */
    KEYS: {
      USER_ID:       'gw_user_id',
      USE_COUNT:     'gw_use_count',
      STATE:         'gw_state',                // 'guest' | 'backed_up'
      LAST_ACTIVE:   'gw_last_active',
      LAST_PROMPT:   'gw_last_backup_prompt',
      PROFILE:       'gw_profile',
      PLAYER:        'gw_player',               // 現在のラウンドのプレイヤー情報
      DEVICE_ID:     'gw_device_id',
      DISPLAY_MODE:  'gw_display_mode',
      INPUT_MODE:    'gw_input_mode',
      PWA_SKIP:      'gw_pwa_skip_until',
      BOOT_BUNDLE:   'gw_boot_bundle',
      SCORES_PREFIX: 'gw_scores_',
      MATES_PREFIX:  'gw_mates_'
    }
  };
})();
