/******************************************************************
 * G-WORLD Backend - Schema Definition
 *
 * 【SECTION 2】スキーマ定義（全シートの列構造）
 *
 * 設計意図：
 *   - 各シートの列順を明示し、自動マイグレーションで列追加に強くする
 *   - 既存データを失わないため、Players/Scores/History 等は
 *     「既存列をすべて維持 + 新規列を末尾追加」とする
 *   - 列順は HEADERS[シート名] の配列順
 *   - 本ファイルが G-WORLD バックエンドの「DDL」相当
 *
 * 動作連携：
 *   - _ensureAllSheets が HEADERS を走査して不足列を末尾追加
 *   - _sheet が HEADERS[name] を使って新規シートのヘッダ行を生成
 *   - _logEvent が EVENTS_HEADER を使ってヘッダ補修
 *
 * 含まれる定数：
 *   - HEADERS        : 7シートの列名配列を集約したオブジェクト
 *   - EVENTS_HEADER  : 月次 events シート共通の列定義
 *
 * 【呼出元】
 *   - services_MigrationService.gs : _ensureAllSheets / _ensureEventsSheet
 *   - services_SheetService.gs     : _sheet（新規作成時のヘッダ書込）
 *   - services_EventLogService.gs  : _logEvent（ヘッダ補修）
 ******************************************************************/


// ════════════════════════════════════════════════════════════════
// 【HEADERS - 全シートの列定義】
//
// 設計憲法・絶対条件：
//   - 既存列の順序は絶対に変更しない（既存データを破壊するため）
//   - 列の削除・改名は厳禁
//   - 新規列は必ず末尾に追加
// ════════════════════════════════════════════════════════════════
const HEADERS = {

  // ── ★G-WORLD 新規シート ──

  /**
   * identity: GW_USER_ID マスタ
   * - 全モジュール共通の永続ユーザー識別
   * - ゲスト(GW-G-*) / 保全済み(GW-B-*) の両状態を保持
   */
  identity: [
    'gw_user_id',          // PK: GW-G-* or GW-B-*
    'display_name',        // 表示名（ニックネーム）
    'real_name',           // 本名
    'state',               // 'guest' | 'backed_up'
    'auth_provider',       // '' | 'google' | 'line' | 'apple'
    'provider_uid',        // プロバイダ側UID（保全済みのみ）
    'device_ids_json',     // 紐付き端末ID履歴（JSON配列・最大10端末）
    'use_count',           // 起動回数
    'created_at',          // 作成日時
    'last_active_at',      // 最終アクティブ
    'last_backup_prompt_at' // 最後にバックアップ案内した日時
  ],

  /**
   * backup_links: ゲスト→保全済み 移行履歴
   * - データ復元の鍵。永久保存・編集禁止のテーブル
   * - 機種変更時はこのシートを参照して旧IDを復元
   */
  backup_links: [
    'link_id',             // PK
    'old_gw_user_id',      // 旧ID (GW-G-*)
    'new_gw_user_id',      // 新ID (GW-B-*)
    'linked_at',           // 連携日時
    'provider',            // 'google' | 'line' | 'apple'
    'provider_uid',        // プロバイダUID
    'device_id'            // 実施端末ID
  ],

  // ── ★G-LAND 既存シート（既存列維持 + gw_user_id を末尾追加） ──

  /**
   * Courses: コース定義
   * - 既存スキーマそのまま（変更なし）
   * - par1〜par18 は18ホール分のPAR値
   */
  Courses: [
    'course_id', 'course_name',
    'par1','par2','par3','par4','par5','par6','par7','par8','par9',
    'par10','par11','par12','par13','par14','par15','par16','par17','par18'
  ],

  /**
   * Players: プレイヤー登録
   * - 既存列をすべて維持し、末尾に gw_user_id を追加
   * - 既存データは player_id で識別、新規データは gw_user_id でも識別可能
   * - user_role / teacher_id / my_club_json / input_mode / status は
   *   既存スキーマ維持のため残置（未使用でも削除しない）
   */
  Players: [
    'player_id',
    'timestamp',
    'course_id',
    'nickname',
    'real_name',
    'group_name',
    'user_role',     // 既存維持（未使用でも残す）
    'teacher_id',    // 既存維持（未使用でも残す）
    'user_id',       // 既存維持（未使用でも残す）
    'my_club_json',  // 既存維持（未使用でも残す）
    'input_mode',    // 既存維持（未使用でも残す）
    'status',        // 既存維持
    'gw_user_id'     // ★新規追加：identity への外部キー
  ],

  /**
   * Scores: スコア（playerId × hole=1..18 で複合キー）
   * - 既存スキーマそのまま
   * - shots_json は将来の詳細ショットログ用（現バージョンでは未使用）
   */
  Scores: [
    'player_id',
    'hole',
    'stroke',
    'putt',
    'updated_at',
    'date',
    'shots_json',
    'input_mode'
  ],

  /**
   * Config: key-value ストア
   * - active_course_id / finalized 等の運用設定を格納
   */
  Config: ['key', 'value'],

  /**
   * History: ラウンド履歴スナップショット
   * - 既存スキーマそのまま
   * - hole_scores_json に18ホール分のスコアを詰め込み（JSON）
   * - shots_detail_json は将来のショット詳細用
   */
  History: [
    'history_id',
    'player_id',
    'user_id',
    'course_id',
    'course_name',
    'comp_id',
    'group_name',
    'play_date',
    'total_stroke',
    'total_putt',
    'vs_par',
    'played_holes',
    'hole_scores_json',
    'shots_detail_json',
    'input_mode',
    'created_at'
  ]
};


// ════════════════════════════════════════════════════════════════
// 【EVENTS_HEADER - 月次 events シートの共通スキーマ】
//
// 設計意図：
//   events_YYYY_MM シートは動的生成のため HEADERS とは別管理。
//   全月で同一スキーマを使い、将来 SQL 移行時の UNION ALL を容易にする。
// ════════════════════════════════════════════════════════════════

/**
 * events_YYYY_MM の共通スキーマ
 *   月次シートは動的生成するため、HEADERSとは別管理
 */
const EVENTS_HEADER = [
  'event_id',
  'ts',                  // タイムスタンプ
  'gw_user_id',          // 主体ユーザー
  'module',              // 'gland' | 'core' | 'gcompete' 等
  'action',              // 'score_saved' | 'boot' | 'register' 等
  'payload_json',        // 軽量メタデータ（_trimPayloadForLog 適用済み）
  'device_id',           // 端末識別
  'api_version'          // 後方互換確認用
];
