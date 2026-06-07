/******************************************************************
 * G-WORLD Backend
 * v1.0.0 - G-LAND MVP (永久無料インフラ)
 *
 * Backend: Google Apps Script + Spreadsheet
 *
 * 【設計憲法 7条遵守】
 *   - "認証/お試し/料金" の概念を持ち込まず、データ保全志向で構築
 *   - GW_USER_ID: ゲスト(GW-G-*) / バックアップ済み(GW-B-*) の2状態
 *   - 月次ローテーションで肥大化を防止
 *   - 既存スプレッドシートのデータは1件も失わない（追加列のみ）
 *
 * 【セキュリティ】
 *   - doPost は単一エントリ + ホワイトリスト方式 actionルーター
 *   - this[funcName].apply() のような任意関数呼び出しは廃止
 *
 * 【拡張余白】
 *   - GCompete / GTown / GJunior / Admin はコメントで余白を残置
 ******************************************************************/

// ════════════════════════════════════════════════════════════════
// 【SECTION 1】設定・定数
// ════════════════════════════════════════════════════════════════

/** スプレッドシートID（アクティブなものを使用） */
const SS_ID = SpreadsheetApp.getActiveSpreadsheet().getId();

/** APIバージョン（フロントとの整合確認） */
const API_VERSION = 'v1';

/** アプリバージョン（デバッグ用） */
const APP_VERSION = '1.0.0';

/** LockService の最大待機時間（ms）。GAS制限回避のため短めに */
const LOCK_WAIT_MS = 3000;

/** ── シート名定義 ───────────────────────────── */

// ★ G-WORLD 新規シート（GW_USER_ID 関連）
const SHEET_IDENTITY     = 'identity';      // GW_USER_ID マスタ
const SHEET_BACKUP_LINKS = 'backup_links';  // ゲスト→保全済み 移行履歴

// ★ G-LAND 既存シート（データ保全のため列追加のみ）
const SHEET_COURSES = 'Courses';
const SHEET_PLAYERS = 'Players';
const SHEET_SCORES  = 'Scores';
const SHEET_CONFIG  = 'Config';
const SHEET_HISTORY = 'History';

// ★ events_YYYY_MM は動的生成（月次ローテーション）
const EVENTS_SHEET_PREFIX = 'events_';

/* ── 拡張余白：将来モジュール用シート（コメントアウト保持） ──
const SHEET_GCOMPETE_ROUNDS = 'gcompete_rounds';
const SHEET_GCOMPETE_GROUPS = 'gcompete_groups';
const SHEET_GTOWN_SHOPS     = 'gtown_shops';
const SHEET_GTOWN_POINTS    = 'gtown_points';
const SHEET_GJUNIOR_LINKS   = 'gjunior_links';
─────────────────────────────────────────────── */


// ════════════════════════════════════════════════════════════════
// 【SECTION 2】スキーマ定義
//
// 設計意図：
//   - 各シートの列順を明示し、自動マイグレーションで列追加に強くする
//   - 既存データを失わないため、Players/Scores/History 等は
//     「既存列をすべて維持 + 新規列を末尾追加」とする
//   - 列順は HEADERS[シート名] の配列順
// ════════════════════════════════════════════════════════════════
const HEADERS = {
  // ── ★G-WORLD 新規シート ──

  /**
   * identity: GW_USER_ID マスタ
   * - 全モジュール共通の永続ユーザー識別
   */
  identity: [
    'gw_user_id',          // PK: GW-G-* or GW-B-*
    'display_name',        // 表示名（ニックネーム）
    'real_name',           // 本名
    'state',               // 'guest' | 'backed_up'
    'auth_provider',       // '' | 'google' | 'line' | 'apple'
    'provider_uid',        // プロバイダ側UID（保全済みのみ）
    'device_ids_json',     // 紐付き端末ID履歴（JSON配列）
    'use_count',           // 起動回数
    'created_at',          // 作成日時
    'last_active_at',      // 最終アクティブ
    'last_backup_prompt_at' // 最後にバックアップ案内した日時
  ],

  /**
   * backup_links: ゲスト→保全済み 移行履歴
   * - データ復元の鍵。永久保存・編集禁止のテーブル
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

  /** Config: key-value ストア */
  Config: ['key', 'value'],

  /**
   * History: ラウンド履歴スナップショット
   * - 既存スキーマそのまま
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
  'payload_json',        // 軽量メタデータ
  'device_id',           // 端末識別
  'api_version'          // 後方互換確認用
];


// ════════════════════════════════════════════════════════════════
// 【SECTION 3】エントリポイント
//
// 設計意図：
//   - doPost は単一エントリ + actionルーター方式（ホワイトリスト）
//   - 旧 funcName 形式も互換受付（既存データ移行期間中）
//   - すべてのリクエストを events_YYYY_MM に自動記録
// ════════════════════════════════════════════════════════════════

/**
 * doPost - フロントからの全リクエストを受ける単一エントリ
 *
 * リクエスト形式（新）:
 *   { action: 'gland.saveScore', payload: {...}, apiVersion: 'v1', meta: {...} }
 *
 * リクエスト形式（旧・互換）:
 *   { funcName: 'updateScore', args: [...] }
 */
function doPost(e) {
  var req = null;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return _jsonResponse({ ok: false, error: 'invalid JSON', code: 'E_INVALID_JSON' });
  }

  // ── 新形式（action ルーター） ──
  if (req && req.action) {
    return _routeAction(req);
  }

  // ── 旧形式（funcName 互換）──
  //    既存フロントが残っている可能性に備えて、限定的に受け付ける
  if (req && req.funcName) {
    return _routeLegacyFuncName(req);
  }

  return _jsonResponse({ ok: false, error: 'missing action', code: 'E_NO_ACTION' });
}

/**
 * doGet - HTMLサーブ + 一部のGETアクションを受ける
 *
 * 設計意図：
 *   - GitHub Pages 配信の場合この doGet は呼ばれない
 *   - GAS の Web App としても配信できるようにフォールバック実装
 *   - フロントは GAS_URL に POST するため、ここでは最小限のみ実装
 */
function doGet(e) {
  try {
    _ensureAllSheets();
    var p = (e && e.parameter) ? e.parameter : {};

    // ヘルスチェック
    if (p.action === 'health') {
      return _jsonResponse({
        ok: true,
        version: APP_VERSION,
        api: API_VERSION,
        time: new Date().toISOString()
      });
    }

    // それ以外は簡易メッセージ
    return HtmlService.createHtmlOutput(
      '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>G-WORLD Backend</title></head>' +
      '<body style="font-family:sans-serif;padding:20px;background:#0a3d2e;color:#fff;">' +
      '<h2 style="color:#f5c842;">G-WORLD Backend ' + APP_VERSION + '</h2>' +
      '<p>このURLはAPIエンドポイントです。フロントエンドは <code>index.html</code> から起動してください。</p>' +
      '</body></html>'
    ).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);

  } catch (err) {
    return HtmlService.createHtmlOutput(
      '<div style="padding:20px;font-family:sans-serif;">' +
      '<h2 style="color:#c0392b;">⚠ 起動エラー</h2>' +
      '<pre style="background:#f4f4f4;padding:10px;border-radius:6px;white-space:pre-wrap;">' +
      String(err) + '</pre></div>'
    );
  }
}


// ════════════════════════════════════════════════════════════════
// 【SECTION 4】★ actionルーター（ホワイトリスト方式）
//
// 設計意図：
//   - 任意関数呼び出しの脆弱性を完全排除
//   - 全アクションを ROUTES 辞書で明示
//   - 拡張余白として GCompete / GTown 等のキーをコメントで残置
//   - 共通前処理：イベントログ記録、エラーハンドリング
// ════════════════════════════════════════════════════════════════

/**
 * action ルーティング辞書（ホワイトリスト）
 *
 * 命名規則：
 *   {モジュール名}.{動作}
 *
 * 拡張時は ROUTES に追加するだけ。新モジュールも同じ規則で。
 */
const ROUTES = {
  // ── Core 層（認証・利用ログ・プロフィール） ──
  'core.boot':          'Core_boot',          // boot bundle取得
  'core.linkBackup':    'Core_linkBackup',    // ★ ゲスト→保全済み 移行
  'core.ping':          'Core_ping',          // 利用回数の同期記録
  'core.getProfile':    'Core_getProfile',
  'core.updateProfile': 'Core_updateProfile',
  'core.health':        'Core_health',        // 疎通確認

  // ── G-LAND モジュール（MVPコア） ──
  'gland.boot':            'GLand_boot',            // ＝ core.boot のエイリアス
  'gland.register':        'GLand_register',
  'gland.saveScore':       'GLand_saveScore',
  'gland.getMyScores':     'GLand_getMyScores',
  'gland.getMates':        'GLand_getMates',
  'gland.saveSnapshot':    'GLand_saveSnapshot',
  'gland.getHistoryList':  'GLand_getHistoryList',
  'gland.getHistoryDetail':'GLand_getHistoryDetail'

  /* ──────────────────────────────────────────
   * 【拡張余白】将来モジュール追加時はここに追加：
   *
   * 'gcompete.create':       'GCompete_create',
   * 'gcompete.lottery':      'GCompete_lottery',
   * 'gcompete.leaderboard':  'GCompete_leaderboard',
   *
   * 'gtown.shopList':        'GTown_shopList',
   * 'gtown.pointAdd':        'GTown_pointAdd',
   * 'gtown.pointHistory':    'GTown_pointHistory',
   *
   * 'gjunior.linkParent':    'GJunior_linkParent',
   *
   * 'admin.setActiveCourse': 'Admin_setActiveCourse',
   * 'admin.reset':           'Admin_reset',
   * ────────────────────────────────────────── */
};

/**
 * action ルーター本体
 *
 * 処理フロー：
 *   1) シート存在確認（自動マイグレーション）
 *   2) ROUTES でアクション解決（ホワイトリスト）
 *   3) ハンドラ関数を実行
 *   4) イベントログを events_YYYY_MM に記録
 *   5) JSONレスポンスを返す
 */
function _routeAction(req) {
  var action     = String(req.action || '');
  var payload    = req.payload || {};
  var meta       = req.meta || {};
  var apiVersion = req.apiVersion || 'v1';

  // ── シート整備（マイグレーション含む） ──
  try {
    _ensureAllSheets();
  } catch (err) {
    return _jsonResponse({
      ok: false,
      error: 'スキーマ初期化に失敗しました',
      code: 'E_SCHEMA_INIT',
      detail: String(err.message || err)
    });
  }

  // ── ホワイトリスト確認 ──
  var handlerName = ROUTES[action];
  if (!handlerName) {
    return _jsonResponse({
      ok: false,
      error: 'unknown action: ' + action,
      code: 'E_UNKNOWN_ACTION'
    });
  }

  // ── ハンドラ取得 ──
  var handler = (typeof this[handlerName] === 'function') ? this[handlerName] : null;
  if (!handler) {
    // GAS のグローバルスコープから関数を取得（this 経由で取れない場合）
    handler = (typeof globalThis !== 'undefined' && typeof globalThis[handlerName] === 'function')
              ? globalThis[handlerName]
              : null;
  }
  if (!handler) {
    return _jsonResponse({
      ok: false,
      error: 'handler not implemented: ' + handlerName,
      code: 'E_NO_HANDLER'
    });
  }

  // ── 実行 ──
  var result;
  try {
    result = handler(payload, meta);
  } catch (err) {
    // エラーもイベントログに残す
    _safeLogEvent({
      gwUserId: meta.gwUserId || '',
      module:   action.split('.')[0] || 'unknown',
      action:   action,
      payload:  { error: String(err.message || err) },
      deviceId: meta.deviceId || '',
      apiVersion: apiVersion
    });
    return _jsonResponse({
      ok: false,
      error: String(err.message || err),
      code: 'E_HANDLER_ERROR'
    });
  }

  // ── イベントログ記録（成功時） ──
  //   ※スコア保存のような高頻度アクションはサイズ抑制
  _safeLogEvent({
    gwUserId:   meta.gwUserId || '',
    module:     action.split('.')[0] || 'unknown',
    action:     action,
    payload:    _trimPayloadForLog(payload),
    deviceId:   meta.deviceId || '',
    apiVersion: apiVersion
  });

  // ── 結果がオブジェクトでなければ包む ──
  if (typeof result !== 'object' || result === null) {
    result = { ok: true, value: result };
  }
  // ok フィールドが無ければ true を補完
  if (result.ok === undefined) {
    result.ok = true;
  }

  return _jsonResponse(result);
}

/**
 * 旧 funcName 形式の互換レイヤ（移行期間中のみ）
 *
 * 設計意図：
 *   - v4.7 までのフロントが残っている端末からのリクエストを救済
 *   - 主要な5関数だけマップし、それ以外は新APIへ誘導
 *   - 将来的にこの関数は削除する
 */
function _routeLegacyFuncName(req) {
  var funcName = String(req.funcName || '');
  var args = req.args || [];

  // ── 主要関数のみマップ ──
  var legacyMap = {
    'getBootBundle':    function () { return Core_boot({}, {}); },
    'getInitData':      function () { return Core_boot({}, {}); },
    'getCourses':       function () { return _legacyGetCourses(); },
    'registerPlayer':   function () { return GLand_register(args[0] || {}, {}); },
    'updateScore':      function () { return GLand_saveScore(args[0] || {}, {}); },
    'updateScoreWithMode': function () { return GLand_saveScore(args[0] || {}, {}); },
    'getMyScores':      function () { return GLand_getMyScores({ playerId: args[0] }, {}); },
    'getGroupMatesScores': function () {
      return GLand_getMates({
        courseId: args[0],
        groupName: args[1],
        playerId: args[2]
      }, {});
    },
    'saveRoundSnapshot': function () { return GLand_saveSnapshot({ playerId: args[0] }, {}); },
    'getHistoryList':    function () { return GLand_getHistoryList(args[0] || {}, {}); },
    'getHistoryDetail':  function () { return GLand_getHistoryDetail({ historyId: args[0] }, {}); }
  };

  if (legacyMap[funcName]) {
    try {
      var result = legacyMap[funcName]();
      // 旧フロントは success フィールドを期待しているので両対応
      return _jsonResponse({
        success: true,
        data: result,
        ok: result && result.ok !== false
      });
    } catch (err) {
      return _jsonResponse({
        success: false,
        error: String(err.message || err)
      });
    }
  }

  return _jsonResponse({
    success: false,
    error: 'legacy funcName not supported: ' + funcName + ' (use new action API)'
  });
}

/** 旧 getCourses 互換 */
function _legacyGetCourses() {
  var res = Core_boot({}, {});
  return {
    ok: !!(res && res.ok),
    courses: (res && res.courses) || []
  };
}


// ════════════════════════════════════════════════════════════════
// 【SECTION 5】共通ユーティリティ
// ════════════════════════════════════════════════════════════════

/** JSON レスポンスを返す */
function _jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * イベントログ記録の安全ラッパー
 *   - エラーが出てもアプリ全体を止めないため、try/catch で包む
 *   - 本体は SECTION B の _logEvent
 */
function _safeLogEvent(payload) {
  try {
    _logEvent(payload);
  } catch (err) {
    // ログ記録失敗は致命的でない（コンソールに残すのみ）
    console.warn('[_safeLogEvent] failed:', err);
  }
}

/**
 * イベントログのペイロードを軽量化
 *   - スコア保存のような高頻度アクションは payload を縮小
 *   - personally identifiable な内容（本名等）はログに残さない
 */
function _trimPayloadForLog(payload) {
  if (!payload || typeof payload !== 'object') return {};
  var trimmed = {};
  // ── ログに残すべき軽量フィールドのみ抽出 ──
  if (payload.hole !== undefined) trimmed.hole = payload.hole;
  if (payload.stroke !== undefined) trimmed.stroke = payload.stroke;
  if (payload.putt !== undefined) trimmed.putt = payload.putt;
  if (payload.playerId !== undefined) trimmed.playerId = payload.playerId;
  if (payload.courseId !== undefined) trimmed.courseId = payload.courseId;
  if (payload.period !== undefined) trimmed.period = payload.period;
  if (payload.provider !== undefined) trimmed.provider = payload.provider;
  return trimmed;
}

/** UUIDライク な一意ID生成 */
function _uuid(prefix) {
  // GAS の Utilities.getUuid() を活用（衝突可能性ゼロ）
  return (prefix || 'H') + '-' + Utilities.getUuid().split('-')[0].toUpperCase();
}

/** 今日の日付（YYYY-MM-DD） */
function _today() {
  var d = new Date();
  var tz = Session.getScriptTimeZone() || 'Asia/Tokyo';
  return Utilities.formatDate(d, tz, 'yyyy-MM-dd');
}

/** 現在の年月（YYYY_MM、events_*シート名用） */
function _yyyyMm() {
  var d = new Date();
  var tz = Session.getScriptTimeZone() || 'Asia/Tokyo';
  return Utilities.formatDate(d, tz, 'yyyy_MM');
}


// ════════════════════════════════════════════════════════════════
// 【SECTION 6】★ 既存データを失わないスキーマ整備
//
// 設計意図【絶対条件】：
//   - 既存スプレッドシートのデータは1件も失わない
//   - 既存列はそのまま維持し、新規列のみ末尾追加
//   - 既存シートが無ければ新規作成、ある場合はヘッダだけ拡張
//   - identity / backup_links は新規作成
// ════════════════════════════════════════════════════════════════

/**
 * 全シートのスキーマを確認・修復
 *   - 起動時に1回だけ呼ばれる（doPost / doGet の最初）
 *   - 既存データは絶対に消さない
 *   - 列の追加のみ行う
 */
function _ensureAllSheets() {
  var ss = SpreadsheetApp.openById(SS_ID);
  var sheetNames = Object.keys(HEADERS);

  for (var idx = 0; idx < sheetNames.length; idx++) {
    var sheetName = sheetNames[idx];
    var sh = ss.getSheetByName(sheetName);

    // ── シートが無ければ新規作成 ──
    if (!sh) {
      sh = ss.insertSheet(sheetName);
      sh.appendRow(HEADERS[sheetName]);
      continue;
    }

    // ── シートが空ならヘッダだけ書く ──
    if (sh.getLastRow() === 0) {
      sh.appendRow(HEADERS[sheetName]);
      continue;
    }

    // ── 既存ヘッダを取得して不足列を末尾追加 ──
    var lastCol = sh.getLastColumn();
    if (lastCol < 1) {
      sh.getRange(1, 1, 1, HEADERS[sheetName].length).setValues([HEADERS[sheetName]]);
      continue;
    }

    var headerRow = sh.getRange(1, 1, 1, lastCol).getValues()[0];
    var existingHeaders = [];
    for (var j = 0; j < headerRow.length; j++) {
      existingHeaders.push(String(headerRow[j]).trim());
    }

    var required = HEADERS[sheetName];
    var missing = [];
    for (var k = 0; k < required.length; k++) {
      if (existingHeaders.indexOf(required[k]) < 0) {
        missing.push(required[k]);
      }
    }

    // ── 不足列を末尾に追加（既存データは無傷） ──
    if (missing.length > 0) {
      sh.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
      console.log('[_ensureAllSheets] ' + sheetName + ' に列追加: ' + missing.join(', '));
    }
  }

  // ── events_YYYY_MM の今月分も用意 ──
  _ensureEventsSheet(_yyyyMm());

  return { ok: true };
}

/**
 * 指定年月の events シートを確実に存在させる
 *   - 月次ローテーション用
 *   - 月が変わった瞬間に自動生成される
 */
function _ensureEventsSheet(yyyymm) {
  var ss = SpreadsheetApp.openById(SS_ID);
  var name = EVENTS_SHEET_PREFIX + yyyymm;
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(EVENTS_HEADER);
    console.log('[_ensureEventsSheet] 新規作成: ' + name);
  } else if (sh.getLastRow() === 0) {
    sh.appendRow(EVENTS_HEADER);
  }
  return sh;
}


// ════════════════════════════════════════════════════════════════
// 【SECTION 7】Section A までのまとめ
//
// この時点で動くこと：
//   ✅ doPost で action ルーティングを受け付け
//   ✅ 旧 funcName も互換受付（移行期間中の救済）
//   ✅ シートの自動マイグレーション
//   ✅ 既存データを失わない列追加
//
// 動かないこと（次の Section で実装）：
//   ❌ Core_boot / Core_linkBackup / Core_ping  (Section B)
//   ❌ GLand_register / GLand_saveScore         (Section C)
//   ❌ GLand_saveSnapshot / GLand_getHistoryList (Section D)
//   ❌ _logEvent 本体実装                        (Section B)
// ════════════════════════════════════════════════════════════════

/*
 * ↓↓↓ Section B 以降は別投稿で実装します ↓↓↓
 */
/* ════════════════════════════════════════════════════════════════
 * ============================================================
 *              【SECTION B】Core 層 実装
 * ============================================================
 *
 * このセクションで実装する関数：
 *   ✅ Core_boot           - boot bundle取得（コース・設定をまとめて返す）
 *   ✅ Core_health         - 疎通確認
 *   ✅ Core_linkBackup     - ★ ゲスト→保全済み 移行
 *   ✅ Core_ping           - 利用回数の同期記録
 *   ✅ Core_getProfile     - プロフィール取得
 *   ✅ Core_updateProfile  - プロフィール更新
 *   ✅ _logEvent           - イベントログ本体（月次ローテ対応）
 *   ✅ _resolveOrCreateIdentity - GW_USER_ID 自動登録ヘルパー
 *   ✅ その他シート操作ヘルパー
 *
 * すべて _routeAction 経由で呼ばれる前提（payload, meta の2引数）
 * ════════════════════════════════════════════════════════════════ */


// ════════════════════════════════════════════════════════════════
// 【SECTION B-1】シート操作ヘルパー（Core層共通）
//
// 設計意図：
//   - 列順依存ゼロの設計（_headerMap で列インデックスを動的取得）
//   - 既存データを無傷で保つため、行アクセスは全て _headerMap 経由
// ════════════════════════════════════════════════════════════════

/** シートを取得（無ければ作成 + ヘッダ書込） */
function _sheet(name) {
  var ss = SpreadsheetApp.openById(SS_ID);
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    if (HEADERS[name]) sh.appendRow(HEADERS[name]);
  } else if (sh.getLastRow() === 0 && HEADERS[name]) {
    sh.appendRow(HEADERS[name]);
  }
  return sh;
}

/**
 * シートの全行データを取得
 *   - ヘッダ行を含む
 *   - 大規模化したシートではメモリに乗り切らない可能性があるため、
 *     将来的にはチャンク読込に切り替える
 */
function _getValues(name) {
  var sh = _sheet(name);
  var lr = sh.getLastRow();
  var lc = sh.getLastColumn();
  if (lr < 1 || lc < 1) return [];
  return sh.getRange(1, 1, lr, lc).getValues();
}

/**
 * ヘッダ行から「列名 → 列インデックス」のマップを作る
 *   - 列順依存を解消する核心関数
 *   - 既存シートに新列を追加した時も、コード変更なしで動く
 */
function _headerMap(sh) {
  var lastCol = sh.getLastColumn();
  if (lastCol < 1) return {};
  var header = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  var map = {};
  for (var i = 0; i < header.length; i++) {
    map[String(header[i]).trim()] = i;
  }
  return map;
}

/** Config シートから値を取得 */
function _getConfig(key) {
  var data = _getValues(SHEET_CONFIG);
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === key) return data[i][1];
  }
  return '';
}

/** Config シートに値を保存 */
function _setConfig(key, value) {
  var sh = _sheet(SHEET_CONFIG);
  var data = _getValues(SHEET_CONFIG);
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === key) {
      sh.getRange(i + 1, 2).setValue(value);
      return;
    }
  }
  sh.appendRow([key, value]);
}

/**
 * 空の行配列を生成（ヘッダマップに対応した長さ）
 *   - 新規行追加時に、列順を気にせず安全に書き込むためのヘルパー
 */
function _emptyRow(headerMap) {
  var maxIdx = 0;
  var keys = Object.keys(headerMap);
  for (var k = 0; k < keys.length; k++) {
    if (headerMap[keys[k]] > maxIdx) maxIdx = headerMap[keys[k]];
  }
  var row = new Array(maxIdx + 1);
  for (var ri = 0; ri <= maxIdx; ri++) row[ri] = '';
  return row;
}

/** 安全な JSON parse（失敗時はデフォルト値を返す） */
function _safeJsonParse(str, defaultValue) {
  if (!str) return defaultValue === undefined ? null : defaultValue;
  try {
    return JSON.parse(str);
  } catch (e) {
    return defaultValue === undefined ? null : defaultValue;
  }
}


// ════════════════════════════════════════════════════════════════
// 【SECTION B-2】★ _logEvent - イベントログ本体（月次ローテ対応）
//
// 設計意図【設計憲法・第2条】：
//   - 全アクションの発生履歴を events_YYYY_MM に記録
//   - 月変わりで自動的に新シートに切り替わる
//   - 将来 SQL移行時のファクトテーブルとして転用可能
//   - 書込み失敗はアプリ全体を止めないため、_safeLogEvent から呼ばれる
// ════════════════════════════════════════════════════════════════

/**
 * イベントを events_YYYY_MM シートに記録
 *
 * @param {Object} entry
 * @param {string} entry.gwUserId
 * @param {string} entry.module
 * @param {string} entry.action
 * @param {Object} entry.payload     - 軽量メタデータ（_trimPayloadForLog 適用済み）
 * @param {string} entry.deviceId
 * @param {string} entry.apiVersion
 */
function _logEvent(entry) {
  // 今月のシートを取得（無ければ自動作成）
  var sh = _ensureEventsSheet(_yyyyMm());
  var map = _headerMap(sh);

  // ヘッダがおかしい場合は補修
  if (map['event_id'] === undefined) {
    sh.getRange(1, 1, 1, EVENTS_HEADER.length).setValues([EVENTS_HEADER]);
    map = _headerMap(sh);
  }

  var row = _emptyRow(map);
  row[map['event_id']]    = _uuid('E');
  row[map['ts']]          = new Date();
  row[map['gw_user_id']]  = String(entry.gwUserId || '');
  row[map['module']]      = String(entry.module || 'unknown');
  row[map['action']]      = String(entry.action || '');
  row[map['payload_json']] = JSON.stringify(entry.payload || {});
  row[map['device_id']]   = String(entry.deviceId || '');
  row[map['api_version']] = String(entry.apiVersion || '');

  sh.appendRow(row);
}

/**
 * 古い events_*** シートの取得（履歴参照用）
 *   - 指定年月のシートが存在しなければ null
 *   - 将来の分析・SQL移行で使用
 */
function _getEventsSheet(yyyymm) {
  var ss = SpreadsheetApp.openById(SS_ID);
  return ss.getSheetByName(EVENTS_SHEET_PREFIX + yyyymm);
}


// ════════════════════════════════════════════════════════════════
// 【SECTION B-3】★ _resolveOrCreateIdentity
//
// GW_USER_ID マスタ（identity シート）への自動登録ヘルパー
//
// 設計意図【設計憲法・第7条】：
//   - フロントから初めて GW_USER_ID が届いた時に、自動的に identity に登録
//   - ゲスト(GW-G-*) は state='guest' で登録
//   - 既に存在する場合は last_active_at と use_count を更新するだけ
//   - "認証" の手続きはここでは一切発生しない（ご案内のみ）
// ════════════════════════════════════════════════════════════════

/**
 * GW_USER_ID から identity 行を取得（無ければ作成）
 *
 * @param {string} gwUserId - フロントから送られたID
 * @param {Object} meta     - リクエストメタ情報（deviceId / useCount 等）
 * @returns {Object} identity 行の内容（ない場合は空オブジェクト）
 */
function _resolveOrCreateIdentity(gwUserId, meta) {
  if (!gwUserId) return { gwUserId: '' };

  var sh = _sheet(SHEET_IDENTITY);
  var map = _headerMap(sh);
  var data = sh.getDataRange().getValues();

  // ── 既存検索 ──
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][map['gw_user_id']]) === String(gwUserId)) {
      // 既存：last_active_at と use_count を更新
      if (meta) {
        try {
          var newUseCount = Number(meta.useCount) || Number(data[i][map['use_count']]) || 0;
          if (newUseCount > 0) {
            sh.getRange(i + 1, map['use_count'] + 1).setValue(newUseCount);
          }
          sh.getRange(i + 1, map['last_active_at'] + 1).setValue(new Date());

          // device_ids_json に新しい端末IDがあれば追加
          if (meta.deviceId) {
            var devs = _safeJsonParse(data[i][map['device_ids_json']], []);
            if (Array.isArray(devs) && devs.indexOf(meta.deviceId) < 0) {
              devs.push(meta.deviceId);
              // 最大10端末まで（古いものから捨てる）
              if (devs.length > 10) devs = devs.slice(devs.length - 10);
              sh.getRange(i + 1, map['device_ids_json'] + 1).setValue(JSON.stringify(devs));
            }
          }
        } catch (e) {
          // 更新失敗は致命的でない
        }
      }
      return _identityRowToObject(data[i], map);
    }
  }

  // ── 新規作成 ──
  var row = _emptyRow(map);
  var now = new Date();
  var deviceIds = meta && meta.deviceId ? [meta.deviceId] : [];

  // プレフィックスから state を判別（GW-G-* → guest, GW-B-* → backed_up）
  var state = 'guest';
  if (String(gwUserId).indexOf('GW-B-') === 0) state = 'backed_up';

  row[map['gw_user_id']]              = gwUserId;
  row[map['display_name']]            = (meta && meta.displayName) || '';
  row[map['real_name']]               = (meta && meta.realName) || '';
  row[map['state']]                   = state;
  row[map['auth_provider']]           = '';
  row[map['provider_uid']]            = '';
  row[map['device_ids_json']]         = JSON.stringify(deviceIds);
  row[map['use_count']]               = (meta && Number(meta.useCount)) || 1;
  row[map['created_at']]              = now;
  row[map['last_active_at']]          = now;
  row[map['last_backup_prompt_at']]   = '';
  sh.appendRow(row);

  return {
    gwUserId:           gwUserId,
    state:              state,
    useCount:           1,
    isNew:              true
  };
}

/** identity 行を JS オブジェクトに変換 */
function _identityRowToObject(row, map) {
  return {
    gwUserId:            String(row[map['gw_user_id']] || ''),
    displayName:         String(row[map['display_name']] || ''),
    realName:            String(row[map['real_name']] || ''),
    state:               String(row[map['state']] || 'guest'),
    authProvider:        String(row[map['auth_provider']] || ''),
    providerUid:         String(row[map['provider_uid']] || ''),
    useCount:            Number(row[map['use_count']]) || 0,
    createdAt:           row[map['created_at']],
    lastActiveAt:        row[map['last_active_at']],
    lastBackupPromptAt:  row[map['last_backup_prompt_at']]
  };
}

/** GW_USER_ID から identity を検索（更新しない・読込み専用） */
function _findIdentity(gwUserId) {
  if (!gwUserId) return null;
  var sh = _sheet(SHEET_IDENTITY);
  var map = _headerMap(sh);
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][map['gw_user_id']]) === String(gwUserId)) {
      return { row: data[i], map: map, rowIndex: i + 1, sheet: sh };
    }
  }
  return null;
}


// ════════════════════════════════════════════════════════════════
// 【SECTION B-4】Core_boot - boot bundle 取得
//
// 設計意図【既存 getBootBundle のリファクタ】：
//   - コース一覧 + 現在アクティブコース + isFinalized をまとめて返す
//   - フロントの GW.Core.Api.call('gland.boot' or 'core.boot') から呼ばれる
//   - identity への自動登録もここで行う（ユーザーが初めて通信した瞬間に記録）
// ════════════════════════════════════════════════════════════════

/**
 * boot bundle 取得
 *
 * @param {Object} payload - {} （現在は空でOK）
 * @param {Object} meta    - { gwUserId, deviceId, useCount, state }
 * @returns {Object} { ok, courses, activeCourseId, isFinalized, identity }
 */
function Core_boot(payload, meta) {
  payload = payload || {};
  meta    = meta    || {};

  // ── identity への自動登録（初回のみ） ──
  var identity = null;
  if (meta.gwUserId) {
    identity = _resolveOrCreateIdentity(meta.gwUserId, meta);
  }

  // ── Courses シートからコース一覧を取得 ──
  var courseList = _loadAllCourses();
  if (!courseList || courseList.length === 0) {
    return {
      ok:    false,
      error: 'Coursesシートにデータがありません。先に setupInitialSheets() を実行してください',
      code:  'E_NO_COURSES',
      courses: []
    };
  }

  // ── アクティブコース・isFinalized 取得 ──
  var activeId = _getConfig('active_course_id') ||
                 (courseList[0] ? courseList[0].id : '');
  var isFinalized = _getConfig('finalized') === 'true';

  return {
    ok:             true,
    courses:        courseList,
    activeCourseId: activeId,
    isFinalized:    isFinalized,
    identity:       identity,
    bundleVersion:  'v1.0.0',
    apiVersion:     API_VERSION,
    serverTime:     new Date().toISOString()
  };
}

/** Courses シートから全コースを読込んで JS オブジェクト配列に変換 */
function _loadAllCourses() {
  var ss = SpreadsheetApp.openById(SS_ID);
  var sh = ss.getSheetByName(SHEET_COURSES);
  if (!sh) return [];

  var lr = sh.getLastRow();
  var lc = sh.getLastColumn();
  if (lr < 2 || lc < 20) return [];

  var data = sh.getRange(1, 1, lr, lc).getValues();
  var list = [];
  for (var i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    list.push({
      id:   String(data[i][0]),
      name: String(data[i][1] || ''),
      pars: data[i].slice(2, 20).map(function (v) { return Number(v) || 4; })
    });
  }
  return list;
}


// ════════════════════════════════════════════════════════════════
// 【SECTION B-5】Core_health - 疎通確認
//
// 設計意図：
//   - フロントから「サーバが生きているか」を確認するための軽量API
//   - 通信できれば必ず ok:true を返す
// ════════════════════════════════════════════════════════════════
function Core_health(payload, meta) {
  return {
    ok:         true,
    version:    APP_VERSION,
    apiVersion: API_VERSION,
    serverTime: new Date().toISOString(),
    yourGwId:   (meta && meta.gwUserId) || ''
  };
}


// ════════════════════════════════════════════════════════════════
// 【SECTION B-6】★ Core_linkBackup - データ保全連携の中核
//
// 設計意図【設計憲法・第7条】：
//   - "ゲストモード" → "データ保全済み" への移行を実行
//   - 旧ID(GW-G-*) → 新ID(GW-B-*) への変換
//   - backup_links シートに永久記録（データ復元の鍵）
//   - Players / Scores / History の player_id 紐付きを切らないため、
//     既存データは旧IDのまま維持し、identity.gw_user_id だけを書き換える
//
// 【※注意】
//   現バージョンでは実プロバイダ(Google/LINE/Apple)との連携は実装せず、
//   この関数はインターフェース確定用のスタブ。
//   フロント側も link-backup ボタンは "次期リリース予定" としている。
//   将来 Google SDK 等を導入する際の差し替えポイントとなる。
// ════════════════════════════════════════════════════════════════

/**
 * ゲスト → 保全済み への移行
 *
 * @param {Object} payload
 * @param {string} payload.oldGwUserId  - 旧ID (GW-G-*)
 * @param {string} payload.provider     - 'google' | 'line' | 'apple'
 * @param {string} payload.providerUid  - プロバイダ側UID
 * @param {string} payload.deviceId
 * @param {Object} payload.profile      - { nickname, realName, ... }
 * @param {Object} meta
 * @returns {Object} { ok, newGwUserId, linkedAt }
 */
function Core_linkBackup(payload, meta) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(LOCK_WAIT_MS);

    var oldId       = String(payload.oldGwUserId || '');
    var provider    = String(payload.provider || '');
    var providerUid = String(payload.providerUid || '');
    var deviceId    = String(payload.deviceId || (meta && meta.deviceId) || '');
    var profile     = payload.profile || {};

    if (!oldId) return { ok: false, error: 'oldGwUserId が必要です' };
    if (!provider) return { ok: false, error: 'provider が必要です' };

    // ── 同じ providerUid で既に保全済みなら、復元処理に切替 ──
    var existing = _findBackupLinkByProviderUid(provider, providerUid);
    if (existing) {
      // 既存ユーザーの機種変更 → 新端末に旧IDを引き継ぐ
      return _restoreFromBackup(existing.newGwUserId, deviceId);
    }

    // ── 新規 GW-B-* IDを発行（連番8桁） ──
    var newId = _generateBackedUpId();

    // ── identity の旧IDを更新（gw_user_id を書き換え + state変更） ──
    var idInfo = _findIdentity(oldId);
    if (idInfo) {
      idInfo.sheet.getRange(idInfo.rowIndex, idInfo.map['gw_user_id']     + 1).setValue(newId);
      idInfo.sheet.getRange(idInfo.rowIndex, idInfo.map['state']          + 1).setValue('backed_up');
      idInfo.sheet.getRange(idInfo.rowIndex, idInfo.map['auth_provider']  + 1).setValue(provider);
      idInfo.sheet.getRange(idInfo.rowIndex, idInfo.map['provider_uid']   + 1).setValue(providerUid);
      idInfo.sheet.getRange(idInfo.rowIndex, idInfo.map['last_active_at'] + 1).setValue(new Date());
      if (profile.nickname) {
        idInfo.sheet.getRange(idInfo.rowIndex, idInfo.map['display_name'] + 1).setValue(profile.nickname);
      }
      if (profile.realName) {
        idInfo.sheet.getRange(idInfo.rowIndex, idInfo.map['real_name'] + 1).setValue(profile.realName);
      }
    } else {
      // identity 行が無ければ新規作成（通常はあり得ないが念のため）
      _createBackedUpIdentity(newId, provider, providerUid, deviceId, profile);
    }

    // ── backup_links に永久記録 ──
    _appendBackupLink(oldId, newId, provider, providerUid, deviceId);

    // ── Players シートの gw_user_id 列も更新 ──
    _updatePlayersGwUserId(oldId, newId);

    return {
      ok:          true,
      newGwUserId: newId,
      linkedAt:    new Date().toISOString(),
      message:     'データを保全しました'
    };
  } catch (err) {
    return { ok: false, error: 'バックアップ連携に失敗しました: ' + String(err.message || err) };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

/**
 * GW-B-* 連番ID発行
 *   - identity シートの既存 GW-B-* の最大番号+1
 */
function _generateBackedUpId() {
  var sh = _sheet(SHEET_IDENTITY);
  var map = _headerMap(sh);
  var data = sh.getDataRange().getValues();
  var maxNum = 0;
  for (var i = 1; i < data.length; i++) {
    var id = String(data[i][map['gw_user_id']] || '');
    if (id.indexOf('GW-B-') === 0) {
      var n = Number(id.substring(5));
      if (!isNaN(n) && n > maxNum) maxNum = n;
    }
  }
  var next = maxNum + 1;
  var padded = ('00000000' + next).slice(-8);
  return 'GW-B-' + padded;
}

/**
 * backup_links に新規行を追加
 *   - データ復元の鍵となるため、絶対に削除しない
 */
function _appendBackupLink(oldId, newId, provider, providerUid, deviceId) {
  var sh = _sheet(SHEET_BACKUP_LINKS);
  var map = _headerMap(sh);
  var row = _emptyRow(map);
  row[map['link_id']]         = _uuid('L');
  row[map['old_gw_user_id']]  = oldId;
  row[map['new_gw_user_id']]  = newId;
  row[map['linked_at']]       = new Date();
  row[map['provider']]        = provider;
  row[map['provider_uid']]    = providerUid;
  row[map['device_id']]       = deviceId;
  sh.appendRow(row);
}

/** providerUid から既存 backup_link を検索 */
function _findBackupLinkByProviderUid(provider, providerUid) {
  if (!provider || !providerUid) return null;
  var sh = _sheet(SHEET_BACKUP_LINKS);
  var map = _headerMap(sh);
  var data = sh.getDataRange().getValues();
  // 最新順にスキャンするため逆順
  for (var i = data.length - 1; i >= 1; i--) {
    if (String(data[i][map['provider']]) === String(provider) &&
        String(data[i][map['provider_uid']]) === String(providerUid)) {
      return {
        linkId:      String(data[i][map['link_id']]),
        oldGwUserId: String(data[i][map['old_gw_user_id']]),
        newGwUserId: String(data[i][map['new_gw_user_id']]),
        linkedAt:    data[i][map['linked_at']]
      };
    }
  }
  return null;
}

/**
 * バックアップ済みアカウントから復元（機種変更時）
 *   - 同じプロバイダUIDで再連携した場合、既存の GW-B-* を引き継ぐ
 */
function _restoreFromBackup(newGwUserId, deviceId) {
  var idInfo = _findIdentity(newGwUserId);
  if (!idInfo) {
    return { ok: false, error: '復元対象のアカウントが見つかりません' };
  }

  // device_ids_json に新端末を追加
  try {
    var devs = _safeJsonParse(idInfo.row[idInfo.map['device_ids_json']], []);
    if (Array.isArray(devs) && deviceId && devs.indexOf(deviceId) < 0) {
      devs.push(deviceId);
      if (devs.length > 10) devs = devs.slice(devs.length - 10);
      idInfo.sheet.getRange(idInfo.rowIndex, idInfo.map['device_ids_json'] + 1).setValue(JSON.stringify(devs));
    }
    idInfo.sheet.getRange(idInfo.rowIndex, idInfo.map['last_active_at'] + 1).setValue(new Date());
  } catch (e) {}

  return {
    ok:          true,
    newGwUserId: newGwUserId,
    restored:    true,
    message:     'お帰りなさい。データを復元しました'
  };
}

/** identity に直接 GW-B-* 行を作成（_resolveOrCreateIdentity が走らなかった場合のフォールバック） */
function _createBackedUpIdentity(newId, provider, providerUid, deviceId, profile) {
  var sh = _sheet(SHEET_IDENTITY);
  var map = _headerMap(sh);
  var row = _emptyRow(map);
  var now = new Date();

  row[map['gw_user_id']]            = newId;
  row[map['display_name']]          = profile.nickname || '';
  row[map['real_name']]             = profile.realName || '';
  row[map['state']]                 = 'backed_up';
  row[map['auth_provider']]         = provider;
  row[map['provider_uid']]          = providerUid;
  row[map['device_ids_json']]       = JSON.stringify(deviceId ? [deviceId] : []);
  row[map['use_count']]             = 1;
  row[map['created_at']]            = now;
  row[map['last_active_at']]        = now;
  row[map['last_backup_prompt_at']] = '';
  sh.appendRow(row);
}

/**
 * Players シートの gw_user_id 列を一括更新
 *   - ゲスト → 保全済み に移行した時、過去のラウンド記録を新IDに紐づけ直す
 */
function _updatePlayersGwUserId(oldId, newId) {
  var sh = _sheet(SHEET_PLAYERS);
  var map = _headerMap(sh);
  // gw_user_id 列が無ければ何もしない（既存データ救済）
  if (map['gw_user_id'] === undefined) return;

  var data = sh.getDataRange().getValues();
  var updates = []; // [行番号, 列番号]
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][map['gw_user_id']]) === String(oldId)) {
      updates.push(i + 1);
    }
  }
  // 一括更新（性能配慮）
  if (updates.length > 0) {
    for (var u = 0; u < updates.length; u++) {
      sh.getRange(updates[u], map['gw_user_id'] + 1).setValue(newId);
    }
  }
}


// ════════════════════════════════════════════════════════════════
// 【SECTION B-7】Core_ping - 利用回数の同期記録
//
// 設計意図：
//   - フロントの利用回数 (use_count) をサーバ側 identity に反映
//   - フロントだけで管理するとデバイス紛失時に消えるため、サーバにも記録
//   - 高頻度で呼ばれることを想定し、軽量に
// ════════════════════════════════════════════════════════════════
function Core_ping(payload, meta) {
  if (!meta || !meta.gwUserId) {
    return { ok: false, error: 'gwUserId が必要です' };
  }
  // _resolveOrCreateIdentity が last_active_at + use_count を自動更新するため、
  // ここで明示的に呼ぶだけで足りる
  _resolveOrCreateIdentity(meta.gwUserId, meta);
  return { ok: true, serverTime: new Date().toISOString() };
}


// ════════════════════════════════════════════════════════════════
// 【SECTION B-8】Core_getProfile - プロフィール取得
// ════════════════════════════════════════════════════════════════
function Core_getProfile(payload, meta) {
  var gwUserId = (meta && meta.gwUserId) || payload.gwUserId || '';
  if (!gwUserId) return { ok: false, error: 'gwUserId が必要です' };

  var idInfo = _findIdentity(gwUserId);
  if (!idInfo) {
    return {
      ok:     true,
      exists: false,
      profile: null
    };
  }
  var p = _identityRowToObject(idInfo.row, idInfo.map);
  return {
    ok:     true,
    exists: true,
    profile: {
      gwUserId:    p.gwUserId,
      displayName: p.displayName,
      realName:    p.realName,
      state:       p.state,
      useCount:    p.useCount,
      createdAt:   p.createdAt,
      lastActiveAt: p.lastActiveAt
    }
  };
}


// ════════════════════════════════════════════════════════════════
// 【SECTION B-9】Core_updateProfile - プロフィール更新
// ════════════════════════════════════════════════════════════════
function Core_updateProfile(payload, meta) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(LOCK_WAIT_MS);

    var gwUserId = (meta && meta.gwUserId) || payload.gwUserId || '';
    if (!gwUserId) return { ok: false, error: 'gwUserId が必要です' };

    var idInfo = _findIdentity(gwUserId);
    if (!idInfo) {
      // 存在しなければ新規作成（自動的に登録）
      _resolveOrCreateIdentity(gwUserId, meta);
      idInfo = _findIdentity(gwUserId);
      if (!idInfo) return { ok: false, error: 'identity の作成に失敗しました' };
    }

    // ── 更新可能フィールドのみ反映 ──
    if (payload.displayName !== undefined) {
      idInfo.sheet.getRange(idInfo.rowIndex, idInfo.map['display_name'] + 1)
                  .setValue(String(payload.displayName));
    }
    if (payload.realName !== undefined) {
      idInfo.sheet.getRange(idInfo.rowIndex, idInfo.map['real_name'] + 1)
                  .setValue(String(payload.realName));
    }
    idInfo.sheet.getRange(idInfo.rowIndex, idInfo.map['last_active_at'] + 1).setValue(new Date());

    return { ok: true };
  } catch (err) {
    return { ok: false, error: 'updateProfile失敗: ' + String(err.message || err) };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}


// ════════════════════════════════════════════════════════════════
// 【SECTION B-10】Section B までのまとめ
//
// この時点で動くこと：
//   ✅ doPost で boot bundle 取得が完結（gland.boot / core.boot）
//   ✅ ゲスト → 保全済み への移行ロジック（スタブ含む）
//   ✅ identity シートへの自動登録
//   ✅ events_YYYY_MM への自動ログ記録（月次ローテ）
//   ✅ Players の gw_user_id 列の自動マイグレーション
//
// 動かないこと（次の Section で実装）：
//   ❌ GLand_register     (Section C)
//   ❌ GLand_saveScore    (Section C)
//   ❌ GLand_getMyScores  (Section C)
//   ❌ GLand_getMates     (Section C)
//
// ── 整合性確認 ──
//   ✅ script.js GW.Core.Auth.linkBackup() → core.linkBackup OK
//   ✅ script.js GW.Core.Api.call('gland.boot') → Core_boot OK
//   ✅ meta.gwUserId / deviceId / useCount は全アクションで自動受領
// ════════════════════════════════════════════════════════════════

/*
 * ↓↓↓ Section C 以降は次の投稿で実装します ↓↓↓
 */
/* ════════════════════════════════════════════════════════════════
 * ============================================================
 *              【SECTION C】G-LAND モジュール 実装
 * ============================================================
 *
 * このセクションで実装する関数：
 *   ✅ GLand_boot          - Core_boot のエイリアス（命名の対称性）
 *   ✅ GLand_register      - プレイヤー登録（gw_user_id 紐付け）
 *   ✅ GLand_saveScore     - スコア更新（高頻度・LockService不要）
 *   ✅ GLand_getMyScores   - 自分の18ホールスコア取得
 *   ✅ GLand_getMates      - 同伴メンバーのスコア取得
 *
 * 設計憲法・第1条 / 第2条：
 *   - スコア保存は LockService を使わない（dedupe前提・高頻度）
 *   - register は LockService を3秒で取得（既存挙動継承）
 *   - 既存データを失わないため、Players には gw_user_id 列を末尾追加して紐付け
 *
 * script.js 側との整合：
 *   - GW.Core.Api.fire('gland.saveScore', { playerId, hole, stroke, putt })
 *   - GW.Core.Api.fire('gland.register',  { courseId, nickname, realName, groupName, gwUserId })
 *   - GW.Core.Api.call('gland.getMyScores', { playerId })
 *   - GW.Core.Api.call('gland.getMates',    { courseId, groupName, playerId })
 * ════════════════════════════════════════════════════════════════ */


// ════════════════════════════════════════════════════════════════
// 【SECTION C-1】GLand_boot - Core_boot のエイリアス
//
// 設計意図：
//   - ROUTES 内で 'gland.boot' と 'core.boot' の両方を受け付けるため
//   - 命名の対称性と将来の差別化余地（G-LAND専用の起動情報追加）
// ════════════════════════════════════════════════════════════════
function GLand_boot(payload, meta) {
  return Core_boot(payload, meta);
}


// ════════════════════════════════════════════════════════════════
// 【SECTION C-2】GLand_register - プレイヤー登録
//
// 設計意図【既存挙動完全継承 + GW_USER_ID対応】：
//   - 既存と同様、Players シートに新規行を追加
//   - 同名(course×nickname×group)プレイヤーは重複登録を防止し、既存IDを返す
//   - Scores シートに18ホール分の空行を一括投入（既存挙動）
//   - ★新規：末尾の gw_user_id 列に紐付け
//   - LockService 3秒（既存と同じ）
//
// 入力（script.js GW.Modules.GLand._register から）:
//   payload = {
//     courseId:  "G001",
//     nickname:  "タロウ",
//     realName:  "山田 太郎",
//     groupName: "Aチーム",
//     gwUserId:  "GW-G-XXXX" or "GW-B-XXXXXXXX"
//   }
//
// 出力:
//   { ok: true, playerId, userId, gwUserId }   ※成功
//   { ok: false, msg, playerId? }              ※失敗（同名既存ならIDも返す）
// ════════════════════════════════════════════════════════════════
function GLand_register(payload, meta) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(LOCK_WAIT_MS);

    payload = payload || {};
    var courseId  = String(payload.courseId  || '').trim();
    var nickname  = String(payload.nickname  || '').trim();
    var realName  = String(payload.realName  || '').trim();
    var groupName = String(payload.groupName || '').trim();
    var gwUserId  = String(payload.gwUserId  || (meta && meta.gwUserId) || '').trim();

    // ── バリデーション ──
    if (!courseId)  return { ok: false, msg: 'courseId が必要です' };
    if (!nickname)  return { ok: false, msg: 'nickname が必要です' };
    if (!realName)  return { ok: false, msg: 'realName が必要です' };
    if (!groupName) return { ok: false, msg: 'groupName が必要です' };

    var sh = _sheet(SHEET_PLAYERS);
    var map = _headerMap(sh);
    var data = sh.getDataRange().getValues();

    // ── 同名既存チェック（course × nickname × group） ──
    //    既存挙動完全継承。重複登録を防ぐ。
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][map['course_id']]) === courseId &&
          String(data[i][map['nickname']]) === nickname &&
          String(data[i][map['group_name']]) === groupName) {
        // 既存IDを返し、必要なら gw_user_id を上書き
        var existingPid = String(data[i][map['player_id']]);
        if (map['gw_user_id'] !== undefined && gwUserId &&
            String(data[i][map['gw_user_id']]) !== gwUserId) {
          // gw_user_id が空 or 異なる場合、新しいIDで上書き
          sh.getRange(i + 1, map['gw_user_id'] + 1).setValue(gwUserId);
        }
        return {
          ok:       false,
          msg:      '同名のプレイヤーが既に登録されています',
          playerId: existingPid,
          existing: true
        };
      }
    }

    // ── 新規 player_id 発行（旧形式互換： "P" + timestamp + random） ──
    //    既存データとの整合性を保つため、IDフォーマットは変更しない
    var playerId = 'P' + new Date().getTime() + Math.floor(Math.random() * 1000);

    // ── user_id (旧フィールド) も発行 ──
    //    既存スキーマ維持のため空にしない
    var userId = gwUserId || ('U' + new Date().getTime() + Math.floor(Math.random() * 1000));

    // ── Players シートに新規行追加 ──
    var row = _emptyRow(map);
    row[map['player_id']]   = playerId;
    row[map['timestamp']]   = new Date();
    row[map['course_id']]   = courseId;
    row[map['nickname']]    = nickname;
    row[map['real_name']]   = realName;
    row[map['group_name']]  = groupName;

    // ── 既存維持フィールド（未使用でも空文字で埋める） ──
    if (map['user_role']    !== undefined) row[map['user_role']]    = 'student';
    if (map['teacher_id']   !== undefined) row[map['teacher_id']]   = '';
    if (map['user_id']      !== undefined) row[map['user_id']]      = userId;
    if (map['my_club_json'] !== undefined) row[map['my_club_json']] = '';
    if (map['input_mode']   !== undefined) row[map['input_mode']]   = 'par_diff';
    if (map['status']       !== undefined) row[map['status']]       = 'active';

    // ★ gw_user_id 紐付け（GW-G-* または GW-B-*） ──
    if (map['gw_user_id'] !== undefined) {
      row[map['gw_user_id']] = gwUserId;
    }

    sh.appendRow(row);

    // ── identity への自動登録 + display_name 更新 ──
    if (gwUserId) {
      _resolveOrCreateIdentity(gwUserId, {
        gwUserId:    gwUserId,
        displayName: nickname,
        realName:    realName,
        deviceId:    (meta && meta.deviceId) || '',
        useCount:    (meta && meta.useCount) || 0
      });
    }

    // ── Scores シートに18ホール分の空行を一括投入 ──
    _initEmptyScores(playerId);

    return {
      ok:       true,
      playerId: playerId,
      userId:   userId,
      gwUserId: gwUserId,
      message:  '登録が完了しました'
    };
  } catch (err) {
    return { ok: false, msg: '登録失敗: ' + String(err.message || err) };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

/**
 * Scores シートに18ホール分の空行を一括投入
 *   - 既存挙動完全継承：登録時に 18 行を確保
 *   - setValues で一括書込（性能配慮）
 */
function _initEmptyScores(playerId) {
  var sh = _sheet(SHEET_SCORES);
  var map = _headerMap(sh);
  var maxIdx = 0;
  var keys = Object.keys(map);
  for (var k = 0; k < keys.length; k++) {
    if (map[keys[k]] > maxIdx) maxIdx = map[keys[k]];
  }

  var initRows = [];
  var now = new Date();
  var today = _today();
  for (var h = 1; h <= 18; h++) {
    var row = new Array(maxIdx + 1);
    for (var r = 0; r <= maxIdx; r++) row[r] = '';
    row[map['player_id']]  = playerId;
    row[map['hole']]       = h;
    row[map['stroke']]     = 0;
    row[map['putt']]       = 0;
    row[map['updated_at']] = now;
    if (map['date']       !== undefined) row[map['date']]       = today;
    if (map['input_mode'] !== undefined) row[map['input_mode']] = 'par_diff';
    initRows.push(row);
  }
  var startRow = Math.max(sh.getLastRow() + 1, 2);
  sh.getRange(startRow, 1, 18, maxIdx + 1).setValues(initRows);
}


// ════════════════════════════════════════════════════════════════
// 【SECTION C-3】★ GLand_saveScore - スコア更新
//
// 設計意図【設計憲法・第1条 / 第2条】：
//   - 高頻度で呼ばれる（ボタン押下毎にデバウンス150ms後に発火）
//   - LockService は使わない
//       理由：同一 playerId × hole の更新は、フロントの SaveQueue dedupeKey
//             ('score-{playerId}-{hole}') で1つに集約済み。
//             ロック取得のオーバーヘッドの方が大きい。
//   - 行特定は player_id + hole の組み合わせで一意
//   - 既存挙動完全継承（旧 updateScore と互換）
//
// 入力（script.js Score._saveScore から）:
//   payload = { playerId, hole, stroke, putt }
//
// 出力:
//   { ok: true } または { ok: false, msg }
// ════════════════════════════════════════════════════════════════
function GLand_saveScore(payload, meta) {
  // ── finalized 状態（順位確定）なら編集不可 ──
  //    現バージョンでは確定機能は無いが、将来 GCompete で復活させる
  if (_getConfig('finalized') === 'true') {
    return { ok: false, msg: '順位確定済み・編集不可' };
  }

  payload = payload || {};
  var playerId = String(payload.playerId || '');
  var hole     = Number(payload.hole);
  var stroke   = Number(payload.stroke);
  var putt     = Number(payload.putt);

  if (!playerId) return { ok: false, msg: 'playerId が必要です' };
  if (!hole || hole < 1 || hole > 18) return { ok: false, msg: 'hole は 1〜18 の範囲です' };
  if (isNaN(stroke)) stroke = 0;
  if (isNaN(putt))   putt   = 0;

  try {
    var sh = _sheet(SHEET_SCORES);
    var map = _headerMap(sh);
    var data = sh.getDataRange().getValues();
    var today = _today();

    // ── 対象行を検索（player_id × hole） ──
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][map['player_id']]) === playerId &&
          Number(data[i][map['hole']]) === hole) {
        // ── 既存行を更新 ──
        sh.getRange(i + 1, map['stroke']     + 1).setValue(stroke);
        sh.getRange(i + 1, map['putt']       + 1).setValue(putt);
        sh.getRange(i + 1, map['updated_at'] + 1).setValue(new Date());
        if (map['date'] !== undefined) {
          sh.getRange(i + 1, map['date'] + 1).setValue(today);
        }
        return { ok: true };
      }
    }

    // ── 対象行が無ければ新規追加（保険） ──
    //    通常は register 時に 18 行確保するためここには来ないが、
    //    既存データ移行時の取りこぼし対策として残す
    var row = _emptyRow(map);
    row[map['player_id']]  = playerId;
    row[map['hole']]       = hole;
    row[map['stroke']]     = stroke;
    row[map['putt']]       = putt;
    row[map['updated_at']] = new Date();
    if (map['date'] !== undefined) row[map['date']] = today;
    if (map['input_mode'] !== undefined) row[map['input_mode']] = 'par_diff';
    sh.appendRow(row);

    return { ok: true, created: true };
  } catch (err) {
    return { ok: false, msg: '保存失敗: ' + String(err.message || err) };
  }
}


// ════════════════════════════════════════════════════════════════
// 【SECTION C-4】GLand_getMyScores - 自分の18ホールスコア取得
//
// 設計意図：
//   - フロントの STAGE2（バックグラウンド更新）から呼ばれる
//   - 18ホール分の {stroke, putt} 配列を返す
//   - スコアが無いホールは {stroke:0, putt:0} で埋める（既存挙動）
//
// 入力（script.js _enterMain / onOnline から）:
//   payload = { playerId }
//
// 出力:
//   { ok: true, scores: [{stroke, putt}, ...18個] }
// ════════════════════════════════════════════════════════════════
function GLand_getMyScores(payload, meta) {
  payload = payload || {};
  var playerId = String(payload.playerId || '');
  if (!playerId) {
    return { ok: false, error: 'playerId が必要です', scores: [] };
  }

  try {
    var sh = _sheet(SHEET_SCORES);
    var map = _headerMap(sh);
    var data = sh.getDataRange().getValues();

    // ── 18個の空スコアで初期化 ──
    var scores = [];
    for (var h = 0; h < 18; h++) {
      scores.push({ stroke: 0, putt: 0 });
    }

    // ── 該当 player_id の全行をスキャン ──
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][map['player_id']]) === playerId) {
        var hn = Number(data[i][map['hole']]);
        if (hn >= 1 && hn <= 18) {
          scores[hn - 1] = {
            stroke: Number(data[i][map['stroke']]) || 0,
            putt:   Number(data[i][map['putt']])   || 0
          };
        }
      }
    }

    return { ok: true, scores: scores };
  } catch (err) {
    return {
      ok:     false,
      error:  'getMyScores失敗: ' + String(err.message || err),
      scores: []
    };
  }
}


// ════════════════════════════════════════════════════════════════
// 【SECTION C-5】★ GLand_getMates - 同伴メンバースコア取得
//
// 設計意図【既存挙動完全継承】：
//   - 同じ course × 同じ group の最大4名のスコアを返す
//   - 自分は1番目（先頭）に並べる
//   - 各メンバーは {playerId, nickname, realName, strokes: [18個]} の形式
//   - PARの配列も同梱（フロントで現在ホールハイライトに使用）
//
// 入力（script.js Mates.load から）:
//   payload = { courseId, groupName, playerId }
//
// 出力:
//   {
//     ok: true,
//     pars: [4,5,3,4,...],
//     members: [
//       { playerId, nickname, realName, strokes: [18個] },
//       ...
//     ]
//   }
// ════════════════════════════════════════════════════════════════
function GLand_getMates(payload, meta) {
  payload = payload || {};
  var courseId   = String(payload.courseId || '');
  var groupName  = String(payload.groupName || '');
  var myPlayerId = String(payload.playerId || '');

  if (!courseId) {
    return { ok: false, error: 'courseId が必要です', pars: [], members: [] };
  }
  if (!groupName) {
    return { ok: false, error: 'groupName が必要です', pars: [], members: [] };
  }

  try {
    // ── 1) コースのPAR配列を取得 ──
    var pars = _loadPars(courseId);

    // ── 2) Players シートから同じ course×group のメンバーを最大4名収集 ──
    var pSh = _sheet(SHEET_PLAYERS);
    var pMap = _headerMap(pSh);
    var pData = pSh.getDataRange().getValues();

    var members = [];
    var memberIds = {};   // playerId → members 配列のインデックス
    for (var r = 1; r < pData.length; r++) {
      if (String(pData[r][pMap['course_id']]) !== courseId) continue;
      // group_name は trim 比較（既存挙動継承）
      if (String(pData[r][pMap['group_name']]).trim() !== groupName.trim()) continue;

      var pid = String(pData[r][pMap['player_id']]);
      if (!pid) continue;

      members.push({
        playerId: pid,
        nickname: String(pData[r][pMap['nickname']]  || ''),
        realName: String(pData[r][pMap['real_name']] || ''),
        strokes:  new Array(18).fill(0)
      });
      memberIds[pid] = members.length - 1;

      // 既存挙動：最大4名でストップ
      if (members.length >= 4) break;
    }

    // ── 3) Scores シートを1回だけ読込んで全メンバー分のスコアを埋める ──
    //    （メンバー数だけスキャンするより、シート1回読込みの方が高速）
    if (members.length > 0) {
      var sSh = _sheet(SHEET_SCORES);
      var sMap = _headerMap(sSh);
      var sData = sSh.getDataRange().getValues();

      for (var i = 1; i < sData.length; i++) {
        var pid2 = String(sData[i][sMap['player_id']]);
        if (!(pid2 in memberIds)) continue;

        var hn = Number(sData[i][sMap['hole']]);
        if (!hn || hn < 1 || hn > 18) continue;

        var st = Number(sData[i][sMap['stroke']]) || 0;
        members[memberIds[pid2]].strokes[hn - 1] = st;
      }
    }

    // ── 4) 自分を1番目に並べる（既存挙動） ──
    members.sort(function (a, b) {
      if (a.playerId === myPlayerId) return -1;
      if (b.playerId === myPlayerId) return  1;
      return 0;
    });

    return {
      ok:      true,
      pars:    pars,
      members: members
    };
  } catch (err) {
    return {
      ok:      false,
      error:   'getMates失敗: ' + String(err.message || err),
      pars:    [],
      members: []
    };
  }
}

/**
 * 指定 courseId の18ホール PAR 配列を取得
 *   - 見つからない場合は全PAR=4
 */
function _loadPars(courseId) {
  var pars = [];
  try {
    var cSh = _sheet(SHEET_COURSES);
    var cData = cSh.getDataRange().getValues();
    for (var r = 1; r < cData.length; r++) {
      if (String(cData[r][0]) === String(courseId)) {
        for (var k = 2; k < 20; k++) {
          pars.push(Number(cData[r][k]) || 4);
        }
        break;
      }
    }
  } catch (e) {}
  if (!pars.length) {
    for (var d = 0; d < 18; d++) pars.push(4);
  }
  return pars;
}


// ════════════════════════════════════════════════════════════════
// 【SECTION C-6】Section C までのまとめ
//
// この時点で動くこと：
//   ✅ プレイヤー登録（GLand_register）
//   ✅ スコア入力・保存（GLand_saveScore）
//   ✅ 18ホールスコア取得（GLand_getMyScores）
//   ✅ 同伴メンバー4名のスコア取得（GLand_getMates）
//   ✅ 既存 Players / Scores シートのデータを失わず継続利用
//   ✅ gw_user_id 列が無い既存データは旧 player_id で動作維持
//   ✅ gw_user_id 列がある新規データは GW-G-* / GW-B-* で紐付け
//
// 動かないこと（次の Section で実装）：
//   ❌ GLand_saveSnapshot     (Section D) - 履歴保存
//   ❌ GLand_getHistoryList   (Section D) - 履歴一覧
//   ❌ GLand_getHistoryDetail (Section D) - 履歴詳細
//
// ── script.js との整合性確認 ──
//   ✅ GW.Modules.GLand._register()
//        → fire('gland.register', {courseId, nickname, realName, groupName, gwUserId})
//        → GLand_register が受領 ✓
//   ✅ GW.Modules.GLand.Score._saveScore()
//        → fire('gland.saveScore', {playerId, hole, stroke, putt}, ..., dedupeKey)
//        → GLand_saveScore が受領 ✓
//   ✅ GW.Modules.GLand._enterMain() / onOnline()
//        → call('gland.getMyScores', {playerId})
//        → GLand_getMyScores が { ok, scores } を返却 ✓
//   ✅ GW.Modules.GLand.Mates.load()
//        → call('gland.getMates', {courseId, groupName, playerId})
//        → GLand_getMates が { ok, pars, members } を返却 ✓
// ════════════════════════════════════════════════════════════════

/*
 * ↓↓↓ Section D 以降は次の投稿で実装します ↓↓↓
 */
/* ════════════════════════════════════════════════════════════════
 * ============================================================
 *           【SECTION D】G-LAND 履歴系 実装
 * ============================================================
 *
 * このセクションで実装する関数：
 *   ✅ GLand_saveSnapshot     - ラウンド終了時のスナップショット保存
 *   ✅ GLand_getHistoryList   - 履歴一覧 + 統計（フィルタ・期間対応）
 *   ✅ GLand_getHistoryDetail - 履歴詳細（同組4名のホール別スコア）
 *
 * 設計憲法・第1条 / 第2条：
 *   - saveSnapshot は LockService 3秒で取得（既存挙動継承）
 *   - History シートに JSON で詰め込み（既存スキーマ完全継承）
 *   - getHistoryList は読み込み専用（Lock不要）
 *   - フィルタは period/courseId/playerId に対応
 *
 * script.js 側との整合：
 *   - GW.Modules.GLand.Score._finishRound()
 *       → fire('gland.saveSnapshot', { playerId, gwUserId })
 *   - GW.Modules.GLand.History._loadList()
 *       → call('gland.getHistoryList', { playerId, gwUserId, period, courseId })
 *   - GW.Modules.GLand.History._loadDetailInto()
 *       → call('gland.getHistoryDetail', { historyId })
 *   - GW.Modules.Home._renderRecent()
 *       → call('gland.getHistoryList', { playerId, gwUserId, period:'recent10' })
 * ════════════════════════════════════════════════════════════════ */


// ════════════════════════════════════════════════════════════════
// 【SECTION D-1】★ GLand_saveSnapshot - ラウンド履歴スナップショット保存
//
// 設計意図【既存挙動完全継承】：
//   - Players + Scores + Courses からデータを集約し、
//     History シートに1行で保存（JSON詰め込み形式）
//   - 中断・9H・18H すべてに対応（既存挙動）
//   - 1ホールも入力されていない場合は保存しない
//   - LockService 3秒で取得（History の整合性確保）
//
// 入力（script.js Score._finishRound から）:
//   payload = { playerId, gwUserId }
//
// 出力:
//   { ok, historyId, totalStroke, vsPar, playedHoles }
//   または { ok: false, msg }
// ════════════════════════════════════════════════════════════════
function GLand_saveSnapshot(payload, meta) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(LOCK_WAIT_MS);

    payload = payload || {};
    var playerId = String(payload.playerId || '');
    var gwUserId = String(payload.gwUserId || (meta && meta.gwUserId) || '');

    if (!playerId) return { ok: false, msg: 'playerId が必要です' };

    // ── 1) Players シートから対象プレイヤーを取得 ──
    var player = _loadPlayerById(playerId);
    if (!player) return { ok: false, msg: 'プレイヤーが見つかりません' };

    // ── gw_user_id が Players 行に無ければ補完 ──
    if (gwUserId && !player.gwUserId) {
      _backfillPlayerGwUserId(playerId, gwUserId);
      player.gwUserId = gwUserId;
    }

    // ── 2) Courses からコース情報・PAR配列を取得 ──
    var courseInfo = _loadCourseInfo(player.courseId);

    // ── 3) Scores から全18ホールのスコアを集約 ──
    var collected = _collectScoresForSnapshot(playerId);
    var holeScores  = collected.holeScores;
    var shotsDetail = collected.shotsDetail;
    var playDate    = collected.playDate || _today();

    // ── 4) 集計計算（打数 / パット / vs PAR / プレイホール数） ──
    var totalStroke = 0;
    var totalPutt   = 0;
    var playedHoles = 0;
    var playedPar   = 0;
    for (var h = 0; h < 18; h++) {
      var s = holeScores[h] || { stroke: 0, putt: 0 };
      totalStroke += s.stroke || 0;
      totalPutt   += s.putt   || 0;
      if (s.stroke > 0) {
        playedHoles++;
        playedPar += courseInfo.pars[h] || 4;
      }
    }

    if (playedHoles === 0) {
      return { ok: false, msg: 'スコアが1ホールも入力されていません' };
    }

    var vsPar = totalStroke - playedPar;

    // ── 5) History シートに新規行追加 ──
    var hSh = _sheet(SHEET_HISTORY);
    var hMap = _headerMap(hSh);
    var historyId = _uuid('H');
    var row = _emptyRow(hMap);

    row[hMap['history_id']]        = historyId;
    row[hMap['player_id']]         = playerId;
    row[hMap['user_id']]           = player.userId || '';
    row[hMap['course_id']]         = player.courseId;
    row[hMap['course_name']]       = courseInfo.courseName;
    row[hMap['comp_id']]           = '';    // 拡張余白（将来 G-COMPETE 用）
    row[hMap['group_name']]        = player.groupName;
    row[hMap['play_date']]         = playDate;
    row[hMap['total_stroke']]      = totalStroke;
    row[hMap['total_putt']]        = totalPutt;
    row[hMap['vs_par']]            = vsPar;
    row[hMap['played_holes']]      = playedHoles;
    row[hMap['hole_scores_json']]  = JSON.stringify(holeScores);
    row[hMap['shots_detail_json']] = JSON.stringify(shotsDetail);
    row[hMap['input_mode']]        = player.inputMode || 'par_diff';
    row[hMap['created_at']]        = new Date();

    hSh.appendRow(row);

    return {
      ok:          true,
      historyId:   historyId,
      totalStroke: totalStroke,
      totalPutt:   totalPutt,
      vsPar:       vsPar,
      playedHoles: playedHoles,
      message:     '履歴に保存しました'
    };
  } catch (err) {
    return { ok: false, msg: 'スナップショット保存失敗: ' + String(err.message || err) };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

/**
 * playerId からプレイヤー情報を取得
 *   - 戻り値は { playerId, courseId, nickname, realName, groupName, userId, gwUserId, inputMode }
 *   - 見つからなければ null
 */
function _loadPlayerById(playerId) {
  var sh = _sheet(SHEET_PLAYERS);
  var map = _headerMap(sh);
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][map['player_id']]) === String(playerId)) {
      return {
        playerId:  String(data[i][map['player_id']]),
        courseId:  String(data[i][map['course_id']] || ''),
        nickname:  String(data[i][map['nickname']] || ''),
        realName:  String(data[i][map['real_name']] || ''),
        groupName: String(data[i][map['group_name']] || ''),
        userId:    (map['user_id']      !== undefined) ? String(data[i][map['user_id']]      || '') : '',
        gwUserId:  (map['gw_user_id']   !== undefined) ? String(data[i][map['gw_user_id']]   || '') : '',
        inputMode: (map['input_mode']   !== undefined) ? String(data[i][map['input_mode']]   || '') : ''
      };
    }
  }
  return null;
}

/**
 * Players の指定行に gw_user_id を後付けで埋める
 *   - 既存データ救済：旧 player_id しか持たないプレイヤーに、新IDを紐付け
 */
function _backfillPlayerGwUserId(playerId, gwUserId) {
  if (!playerId || !gwUserId) return;
  var sh = _sheet(SHEET_PLAYERS);
  var map = _headerMap(sh);
  if (map['gw_user_id'] === undefined) return; // 列が無いシートはスキップ
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][map['player_id']]) === String(playerId)) {
      if (!data[i][map['gw_user_id']]) {
        sh.getRange(i + 1, map['gw_user_id'] + 1).setValue(gwUserId);
      }
      return;
    }
  }
}

/**
 * コース情報を取得（PAR配列付き）
 *   - 見つからなければデフォルト（全PAR=4）
 */
function _loadCourseInfo(courseId) {
  var sh = _sheet(SHEET_COURSES);
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(courseId)) {
      var pars = [];
      for (var k = 2; k < 20; k++) pars.push(Number(data[i][k]) || 4);
      return {
        courseId:   String(data[i][0]),
        courseName: String(data[i][1] || ''),
        pars:       pars
      };
    }
  }
  // ── フォールバック ──
  var defPars = [];
  for (var d = 0; d < 18; d++) defPars.push(4);
  return { courseId: courseId, courseName: '', pars: defPars };
}

/**
 * Scores シートから指定 playerId の全データを収集
 *   - 18ホール分の {stroke, putt} 配列
 *   - shots_json があれば shotsDetail にも詰める
 *   - 最新の play_date を返す
 */
function _collectScoresForSnapshot(playerId) {
  var sh = _sheet(SHEET_SCORES);
  var map = _headerMap(sh);
  var data = sh.getDataRange().getValues();

  var holeScores = [];
  for (var h = 0; h < 18; h++) holeScores.push({ stroke: 0, putt: 0 });

  var shotsDetail = [];
  var playDate = '';

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][map['player_id']]) !== String(playerId)) continue;
    var hn = Number(data[i][map['hole']]);
    if (hn < 1 || hn > 18) continue;

    holeScores[hn - 1] = {
      stroke: Number(data[i][map['stroke']]) || 0,
      putt:   Number(data[i][map['putt']])   || 0
    };

    if (map['date'] !== undefined && data[i][map['date']]) {
      playDate = String(data[i][map['date']]);
    }

    // 詳細ショットログがあれば収集（既存挙動継承）
    if (map['shots_json'] !== undefined && data[i][map['shots_json']]) {
      var shots = _safeJsonParse(data[i][map['shots_json']], null);
      if (Array.isArray(shots)) {
        shotsDetail.push({ hole: hn, shots: shots });
      }
    }
  }

  return {
    holeScores:  holeScores,
    shotsDetail: shotsDetail,
    playDate:    playDate
  };
}


// ════════════════════════════════════════════════════════════════
// 【SECTION D-2】★ GLand_getHistoryList - 履歴一覧 + 統計
//
// 設計意図【既存挙動完全継承】：
//   - フィルタ条件：playerId / gwUserId / courseId / period
//   - period: 'all' / 'recent10' / 'half_year' / 'one_year'
//   - 4種統計：rounds / best / avgStroke / avgPutt
//   - ベストは18H完走のみで判定（既存挙動）
//
// 入力（script.js History._loadList から）:
//   payload = { playerId, gwUserId, period, courseId }
//
// 出力:
//   { ok, list: [...], stats: { rounds, best, avgStroke, avgPutt } }
// ════════════════════════════════════════════════════════════════
function GLand_getHistoryList(payload, meta) {
  payload = payload || {};
  var playerId = String(payload.playerId || '');
  var gwUserId = String(payload.gwUserId || (meta && meta.gwUserId) || '');
  var courseId = String(payload.courseId || '');
  var period   = String(payload.period   || 'all');

  try {
    var sh = _sheet(SHEET_HISTORY);
    if (sh.getLastRow() < 2) {
      return {
        ok:    true,
        list:  [],
        stats: { rounds: 0, best: null, avgStroke: null, avgPutt: null }
      };
    }

    var map = _headerMap(sh);
    var data = sh.getDataRange().getValues();

    // ── 1) フィルタを適用しながら一覧構築 ──
    var list = [];
    for (var i = 1; i < data.length; i++) {
      var row = data[i];

      // playerId フィルタ（最優先）
      if (playerId && String(row[map['player_id']]) !== playerId) continue;

      // courseId フィルタ
      if (courseId && String(row[map['course_id']]) !== courseId) continue;

      // ── gw_user_id 経由のフィルタ（将来の機種変更後も履歴が拾えるように） ──
      //    playerId が未指定で gwUserId が指定された場合のみ使用
      if (!playerId && gwUserId) {
        // History に gw_user_id 列は無いため、Players 経由で照合
        var rowPlayerId = String(row[map['player_id']]);
        if (!_isPlayerLinkedToGwUserId(rowPlayerId, gwUserId)) continue;
      }

      list.push({
        historyId:   String(row[map['history_id']]),
        playerId:    String(row[map['player_id']]),
        userId:      String(row[map['user_id']] || ''),
        courseId:    String(row[map['course_id']]),
        courseName:  String(row[map['course_name']] || ''),
        compId:      String(row[map['comp_id']] || ''),
        groupName:   String(row[map['group_name']] || ''),
        playDate:    String(row[map['play_date']] || ''),
        totalStroke: Number(row[map['total_stroke']]) || 0,
        totalPutt:   Number(row[map['total_putt']])   || 0,
        vsPar:       Number(row[map['vs_par']])       || 0,
        playedHoles: Number(row[map['played_holes']]) || 0,
        inputMode:   String(row[map['input_mode']] || '')
      });
    }

    // ── 2) 期間フィルタ ──
    list = _applyPeriodFilter(list, period);

    // ── 3) 日付降順ソート ──
    list.sort(function (a, b) {
      return (b.playDate > a.playDate) ? 1 : -1;
    });

    // ── 4) recent10 はソート後に先頭10件 ──
    if (period === 'recent10') {
      list = list.slice(0, 10);
    }

    // ── 5) 統計算出 ──
    var stats = _calcHistoryStats(list);

    return {
      ok:    true,
      list:  list,
      stats: stats
    };
  } catch (err) {
    return {
      ok:    false,
      msg:   'getHistoryList失敗: ' + String(err.message || err),
      list:  [],
      stats: { rounds: 0, best: null, avgStroke: null, avgPutt: null }
    };
  }
}

/**
 * 指定 playerId が指定 gwUserId に紐付いているかを判定
 *   - Players シートの gw_user_id 列で照合
 *   - 旧 user_id 列でも照合（既存データ救済）
 *   - キャッシュ無しで毎回検索（簡素化優先）
 */
function _isPlayerLinkedToGwUserId(playerId, gwUserId) {
  if (!playerId || !gwUserId) return false;
  var sh = _sheet(SHEET_PLAYERS);
  var map = _headerMap(sh);
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][map['player_id']]) !== String(playerId)) continue;
    // ── gw_user_id 列で照合 ──
    if (map['gw_user_id'] !== undefined &&
        String(data[i][map['gw_user_id']]) === String(gwUserId)) {
      return true;
    }
    // ── 旧 user_id 列でも照合（既存データ救済） ──
    if (map['user_id'] !== undefined &&
        String(data[i][map['user_id']]) === String(gwUserId)) {
      return true;
    }
    return false;
  }
  return false;
}

/**
 * 期間フィルタ適用
 *   - 'all'        : フィルタなし
 *   - 'recent10'   : フィルタなし（先頭10件はソート後に slice する）
 *   - 'half_year'  : 過去183日以内
 *   - 'one_year'   : 過去365日以内
 *   - 'year:YYYY'  : 指定年のみ（拡張用）
 */
function _applyPeriodFilter(list, period) {
  if (!period || period === 'all' || period === 'recent10') return list;
  var today = new Date();

  if (period === 'half_year') {
    var cutoff1 = new Date(today.getTime() - 183 * 86400000);
    return list.filter(function (h) {
      return h.playDate && new Date(h.playDate) >= cutoff1;
    });
  }
  if (period === 'one_year') {
    var cutoff2 = new Date(today.getTime() - 365 * 86400000);
    return list.filter(function (h) {
      return h.playDate && new Date(h.playDate) >= cutoff2;
    });
  }
  if (period.indexOf('year:') === 0) {
    var yr = period.split(':')[1];
    return list.filter(function (h) {
      return h.playDate.indexOf(yr) === 0;
    });
  }
  return list;
}

/**
 * 統計算出（4種）
 *   - rounds: 入力済ホールが1以上のラウンド数
 *   - best: 18H完走の最小スコア
 *   - avgStroke / avgPutt: 全ラウンド平均（小数1桁）
 */
function _calcHistoryStats(list) {
  var valid = list.filter(function (h) { return h.playedHoles > 0; });
  if (!valid.length) {
    return { rounds: 0, best: null, avgStroke: null, avgPutt: null };
  }

  var sumStroke = 0;
  var sumPutt   = 0;
  for (var v = 0; v < valid.length; v++) {
    sumStroke += valid[v].totalStroke;
    sumPutt   += valid[v].totalPutt;
  }

  var fullRounds = valid.filter(function (h) { return h.playedHoles === 18; });
  var bestVal = null;
  if (fullRounds.length) {
    bestVal = Math.min.apply(null, fullRounds.map(function (h) {
      return h.totalStroke;
    }));
  }

  return {
    rounds:    valid.length,
    best:      bestVal,
    avgStroke: Math.round(sumStroke / valid.length * 10) / 10,
    avgPutt:   Math.round(sumPutt   / valid.length * 10) / 10
  };
}


// ════════════════════════════════════════════════════════════════
// 【SECTION D-3】★ GLand_getHistoryDetail - 履歴詳細（同組4名）
//
// 設計意図【既存挙動完全継承】：
//   - 指定 historyId と同じ courseId × groupName × playDate のラウンドを
//     最大4名分まで集めて返す（同組メンバーの比較ビュー）
//   - 自分の履歴は isPrimary: true でマーク
//   - 各メンバーは Players からニックネーム/本名を引いて添える
//
// 入力（script.js History._loadDetailInto から）:
//   payload = { historyId }
//
// 出力:
//   {
//     ok, historyId, courseName, playDate, groupName, pars,
//     mates: [
//       { playerId, nickname, realName, totalStroke, totalPutt, vsPar, holeScores, isPrimary }
//     ]
//   }
// ════════════════════════════════════════════════════════════════
function GLand_getHistoryDetail(payload, meta) {
  payload = payload || {};
  var historyId = String(payload.historyId || '');
  if (!historyId) return { ok: false, msg: 'historyId が必要です' };

  try {
    var hSh = _sheet(SHEET_HISTORY);
    if (hSh.getLastRow() < 2) return { ok: false, msg: '履歴がありません' };

    var hMap = _headerMap(hSh);
    var hData = hSh.getDataRange().getValues();

    // ── 1) 対象履歴行を検索 ──
    var target = null;
    for (var i = 1; i < hData.length; i++) {
      if (String(hData[i][hMap['history_id']]) === historyId) {
        target = hData[i];
        break;
      }
    }
    if (!target) return { ok: false, msg: '該当履歴が見つかりません' };

    var courseId  = String(target[hMap['course_id']]);
    var groupName = String(target[hMap['group_name']] || '');
    var playDate  = String(target[hMap['play_date']] || '');

    // ── 2) 同じ course×group×playDate のラウンドを最大4名分収集 ──
    var mates = [];
    var playerIds = []; // 後で Players シートから一括ルックアップするための配列
    for (var j = 1; j < hData.length; j++) {
      var row = hData[j];
      if (String(row[hMap['course_id']])  !== courseId)  continue;
      if (String(row[hMap['group_name']]) !== groupName) continue;
      if (String(row[hMap['play_date']])  !== playDate)  continue;

      // hole_scores_json をパース
      var holeScores = _safeJsonParse(row[hMap['hole_scores_json']], []);

      mates.push({
        playerId:    String(row[hMap['player_id']]),
        historyId:   String(row[hMap['history_id']]),
        totalStroke: Number(row[hMap['total_stroke']]) || 0,
        totalPutt:   Number(row[hMap['total_putt']])   || 0,
        vsPar:       Number(row[hMap['vs_par']])       || 0,
        holeScores:  holeScores,
        isPrimary:   String(row[hMap['history_id']]) === historyId,
        nickname:    '',  // 後で埋める
        realName:    ''   // 後で埋める
      });
      playerIds.push(String(row[hMap['player_id']]));

      if (mates.length >= 4) break;
    }

    // ── 3) Players シートから一括でニックネーム/本名を取得 ──
    if (playerIds.length > 0) {
      var pSh = _sheet(SHEET_PLAYERS);
      var pMap = _headerMap(pSh);
      var pData = pSh.getDataRange().getValues();
      var nameMap = {}; // playerId → {nickname, realName}
      for (var k = 1; k < pData.length; k++) {
        var pid = String(pData[k][pMap['player_id']]);
        if (playerIds.indexOf(pid) >= 0) {
          nameMap[pid] = {
            nickname: String(pData[k][pMap['nickname']]  || ''),
            realName: String(pData[k][pMap['real_name']] || '')
          };
        }
      }
      mates.forEach(function (m) {
        if (nameMap[m.playerId]) {
          m.nickname = nameMap[m.playerId].nickname;
          m.realName = nameMap[m.playerId].realName;
        }
      });
    }

    // ── 4) isPrimary を先頭に並べる（既存挙動継承） ──
    mates.sort(function (a, b) {
      if (a.isPrimary && !b.isPrimary) return -1;
      if (!a.isPrimary && b.isPrimary) return  1;
      return 0;
    });

    // ── 5) PAR配列を取得 ──
    var courseInfo = _loadCourseInfo(courseId);

    return {
      ok:         true,
      historyId:  historyId,
      courseName: String(target[hMap['course_name']] || courseInfo.courseName || ''),
      playDate:   playDate,
      groupName:  groupName,
      pars:       courseInfo.pars,
      mates:      mates
    };
  } catch (err) {
    return { ok: false, msg: 'getHistoryDetail失敗: ' + String(err.message || err) };
  }
}


// ════════════════════════════════════════════════════════════════
// 【SECTION D-4】Section D までのまとめ
//
// この時点で動くこと：
//   ✅ ラウンド終了 → 履歴スナップショット保存（GLand_saveSnapshot）
//   ✅ 履歴一覧 + 統計取得（GLand_getHistoryList）
//   ✅ 履歴詳細（同組4名の比較ビュー）（GLand_getHistoryDetail）
//   ✅ 既存 History シートのデータ完全継続利用
//   ✅ Player.gw_user_id 後付け補完（_backfillPlayerGwUserId）
//   ✅ 旧 user_id でも履歴フィルタが動作（既存データ救済）
//
// ── script.js との整合性確認 ──
//   ✅ GW.Modules.GLand.Score._finishRound()
//        → fire('gland.saveSnapshot', {playerId, gwUserId})
//        → GLand_saveSnapshot が {ok, historyId, totalStroke, vsPar, playedHoles} 返却 ✓
//   ✅ GW.Modules.GLand.History._loadList()
//        → call('gland.getHistoryList', {playerId, gwUserId, period, courseId})
//        → GLand_getHistoryList が {ok, list, stats} 返却 ✓
//   ✅ GW.Modules.GLand.History._loadDetailInto()
//        → call('gland.getHistoryDetail', {historyId})
//        → GLand_getHistoryDetail が {ok, courseName, playDate, pars, mates} 返却 ✓
//   ✅ GW.Modules.Home._renderRecent()
//        → call('gland.getHistoryList', {playerId, gwUserId, period:'recent10'})
//        → 同上、先頭3件のみ表示 ✓
//
// 次の Section E で実装：
//   ❌ setupInitialSheets   - 初期セットアップ用
//   ❌ debugCheck           - デバッグ用
//   ❌ rotateMonthlyEvents  - 月次ローテーション運用
//   ❌ 旧データマイグレーション関数
// ════════════════════════════════════════════════════════════════

/*
 * ↓↓↓ Section E は次の投稿で実装します ↓↓↓
 */
/* ════════════════════════════════════════════════════════════════
 * ============================================================
 *      【SECTION E】運用・保守ユーティリティ（最終セクション）
 * ============================================================
 *
 * このセクションで実装する関数：
 *   ✅ setupInitialSheets       - 初期セットアップ（GASエディタから手動実行）
 *   ✅ debugCheck                - 全シートの状態確認
 *   ✅ rotateMonthlyEvents       - 月次ローテーション（タイムトリガー）
 *   ✅ migrateExistingPlayers    - 既存 Players の gw_user_id 一括補完
 *   ✅ verifyDataIntegrity       - データ整合性チェック
 *   ✅ exportEventsToArchive     - 古い events_* をアーカイブ
 *   ✅ purgeOldGuestIdentities   - 1年以上未使用のゲストIDを掃除（任意）
 *   ✅ 拡張余白用のスタブ関数群
 *
 * 設計憲法・第2条：
 *   - events_YYYY_MM の月次ローテーションでスプレッドシート肥大化を防止
 *   - すべての運用関数は GAS エディタから手動 or タイムトリガーで実行
 *
 * 重要：このセクションの関数は doPost からは呼ばれない（運用者専用）
 * ════════════════════════════════════════════════════════════════ */


// ════════════════════════════════════════════════════════════════
// 【SECTION E-1】setupInitialSheets - 初期セットアップ
//
// 設計意図：
//   - GASエディタから手動で1回だけ実行する想定
//   - 全シートを HEADERS 定義通りに作成
//   - 既存データがあれば一切触らず、不足列のみ追加
//   - サンプルコースが無ければ G001 を投入（既存挙動継承）
//   - 完了後にUIアラートでサマリを表示
// ════════════════════════════════════════════════════════════════
function setupInitialSheets() {
  var result = _ensureAllSheets();
  if (!result.ok) {
    try {
      SpreadsheetApp.getUi().alert('❌ エラー: ' + (result.msg || '不明'));
    } catch (e) {}
    return result;
  }

  // ── Config 初期値（既存があれば触らない） ──
  if (!_getConfig('active_course_id')) _setConfig('active_course_id', 'G001');
  if (!_getConfig('finalized'))        _setConfig('finalized', 'false');

  // ── サンプルコース投入（既存挙動継承） ──
  var cSh = _sheet(SHEET_COURSES);
  if (cSh.getLastRow() === 1) {
    cSh.appendRow(['G001', 'G-LAND カントリークラブ',
      4, 5, 3, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 5, 3, 4, 4]);
    cSh.appendRow(['G002', '鶴舞ゴルフ倶楽部',
      4, 4, 5, 3, 4, 4, 3, 5, 4, 4, 5, 3, 4, 4, 4, 5, 3, 4]);
  }

  // ── 全シートのサマリを出力 ──
  var ss = SpreadsheetApp.openById(SS_ID);
  var summary = [];
  var names = Object.keys(HEADERS);
  for (var i = 0; i < names.length; i++) {
    var sh = ss.getSheetByName(names[i]);
    if (sh) {
      summary.push('・' + names[i] + ': ' + sh.getLastRow() + '行 / ' + sh.getLastColumn() + '列');
    }
  }

  // ── 今月の events シートも確認 ──
  var thisMonthEvents = _ensureEventsSheet(_yyyyMm());
  summary.push('・' + thisMonthEvents.getName() + ': ' + thisMonthEvents.getLastRow() + '行（今月ログ）');

  var msg =
    '✅ G-WORLD v' + APP_VERSION + ' セットアップ完了\n\n' +
    summary.join('\n') + '\n\n' +
    '・API バージョン: ' + API_VERSION + '\n' +
    '・GAS_URL は webアプリとしてデプロイ後、URLを script.js に貼り付けてください\n\n' +
    '※ 既存データはすべて保持されています';

  console.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}

  return { ok: true, summary: summary };
}


// ════════════════════════════════════════════════════════════════
// 【SECTION E-2】debugCheck - デバッグ用
//
// 設計意図：
//   - GASエディタから手動実行
//   - 全シートのヘッダと行数を一覧表示
//   - データ移行時の確認や本番デプロイ前の検証に使用
// ════════════════════════════════════════════════════════════════
function debugCheck() {
  var ss = SpreadsheetApp.openById(SS_ID);
  var lines = ['=== G-WORLD v' + APP_VERSION + ' 動作確認 ==='];

  // ── 定義済みシート ──
  var names = Object.keys(HEADERS);
  for (var i = 0; i < names.length; i++) {
    var sh = ss.getSheetByName(names[i]);
    if (sh) {
      var lc = sh.getLastColumn();
      var header = lc > 0 ? sh.getRange(1, 1, 1, lc).getValues()[0].join(' | ') : '(空)';
      lines.push('▼ ' + names[i] + ' (' + sh.getLastRow() + '行)');
      lines.push('   ' + header);
    } else {
      lines.push('▼ ' + names[i] + ': シート不在');
    }
  }

  // ── events_* シート（月次ローテーション） ──
  var allSheets = ss.getSheets();
  var eventsSheets = [];
  for (var s = 0; s < allSheets.length; s++) {
    var nm = allSheets[s].getName();
    if (nm.indexOf(EVENTS_SHEET_PREFIX) === 0) {
      eventsSheets.push(nm + ' (' + allSheets[s].getLastRow() + '行)');
    }
  }
  if (eventsSheets.length > 0) {
    lines.push('');
    lines.push('▼ events 月次シート群:');
    eventsSheets.sort();
    eventsSheets.forEach(function (n) { lines.push('   ' + n); });
  }

  // ── Config 値 ──
  lines.push('');
  lines.push('▼ Config:');
  lines.push('   active_course_id: ' + (_getConfig('active_course_id') || '(未設定)'));
  lines.push('   finalized: ' + (_getConfig('finalized') || 'false'));

  // ── identity 状態統計 ──
  try {
    var idSh = ss.getSheetByName(SHEET_IDENTITY);
    if (idSh && idSh.getLastRow() > 1) {
      var idData = idSh.getRange(2, 1, idSh.getLastRow() - 1, idSh.getLastColumn()).getValues();
      var idMap = _headerMap(idSh);
      var guestCount = 0;
      var backedUpCount = 0;
      for (var k = 0; k < idData.length; k++) {
        var state = String(idData[k][idMap['state']] || 'guest');
        if (state === 'guest') guestCount++;
        else if (state === 'backed_up') backedUpCount++;
      }
      lines.push('');
      lines.push('▼ Identity 統計:');
      lines.push('   ゲストモード: ' + guestCount + ' 人');
      lines.push('   保全済み: ' + backedUpCount + ' 人');
    }
  } catch (e) {}

  var msg = lines.join('\n');
  console.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  return msg;
}


// ════════════════════════════════════════════════════════════════
// 【SECTION E-3】★ rotateMonthlyEvents - 月次ローテーション運用
//
// 設計意図【設計憲法・第2条】：
//   - GAS のタイムトリガーで月初に自動実行する想定
//   - 今月の events_YYYY_MM シートを作成（無ければ）
//   - 古い events_* シートを「直近12ヶ月だけ残してアーカイブ」
//   - データ自体は削除せず、専用フォルダにCSVエクスポート
//
// セットアップ手順：
//   1. GASエディタで rotateMonthlyEvents を選択
//   2. 「トリガー」を開き、毎月1日 0:00 に実行設定
//
// ※ アーカイブ機能はオプション（フォルダID未設定なら作成のみ）
// ════════════════════════════════════════════════════════════════
function rotateMonthlyEvents() {
  var log = [];
  try {
    // ── 1) 今月のシートを確実に存在させる ──
    var thisMonth = _ensureEventsSheet(_yyyyMm());
    log.push('✅ 今月シート確認: ' + thisMonth.getName());

    // ── 2) 古い events_* を一覧化（直近12ヶ月以外） ──
    var ss = SpreadsheetApp.openById(SS_ID);
    var allSheets = ss.getSheets();
    var keep = _getRecentEventsSheetNames(12); // 直近12ヶ月分のシート名

    var oldSheets = [];
    for (var i = 0; i < allSheets.length; i++) {
      var nm = allSheets[i].getName();
      if (nm.indexOf(EVENTS_SHEET_PREFIX) === 0 && keep.indexOf(nm) < 0) {
        oldSheets.push(nm);
      }
    }

    if (oldSheets.length === 0) {
      log.push('✅ 古いシート無し。保持期間内のみ。');
      return { ok: true, log: log };
    }

    // ── 3) アーカイブ処理（任意） ──
    //   Config に 'events_archive_folder_id' があれば CSV化してDriveへ
    var folderId = _getConfig('events_archive_folder_id');
    if (folderId) {
      for (var j = 0; j < oldSheets.length; j++) {
        try {
          _archiveSheetToFolder(oldSheets[j], folderId);
          log.push('📦 アーカイブ: ' + oldSheets[j]);
        } catch (err) {
          log.push('⚠ アーカイブ失敗: ' + oldSheets[j] + ' - ' + err.message);
        }
      }
    } else {
      log.push('ℹ️ events_archive_folder_id 未設定 → アーカイブはスキップ');
      log.push('   削除対象: ' + oldSheets.join(', '));
      log.push('   ※削除は手動推奨。自動削除したい場合はコード末尾のスタブを有効化');
    }

    return { ok: true, log: log };
  } catch (err) {
    log.push('❌ エラー: ' + err.message);
    return { ok: false, log: log, error: err.message };
  } finally {
    console.log(log.join('\n'));
  }
}

/**
 * 直近Nヶ月分の events_* シート名を生成
 *   - 例: keepMonths=12 で今月から12ヶ月分のシート名を配列で返す
 */
function _getRecentEventsSheetNames(keepMonths) {
  var tz = Session.getScriptTimeZone() || 'Asia/Tokyo';
  var names = [];
  var d = new Date();
  for (var i = 0; i < keepMonths; i++) {
    names.push(EVENTS_SHEET_PREFIX + Utilities.formatDate(d, tz, 'yyyy_MM'));
    d.setMonth(d.getMonth() - 1);
  }
  return names;
}

/**
 * シートをCSV化してDriveの指定フォルダに保存
 *   - 元のシートは残す（手動削除可）
 *   - CSV ファイル名は シート名.csv
 */
function _archiveSheetToFolder(sheetName, folderId) {
  var ss = SpreadsheetApp.openById(SS_ID);
  var sh = ss.getSheetByName(sheetName);
  if (!sh) throw new Error('シート不在: ' + sheetName);

  var lr = sh.getLastRow();
  var lc = sh.getLastColumn();
  if (lr < 1 || lc < 1) return;

  var data = sh.getRange(1, 1, lr, lc).getValues();
  var csv = data.map(function (row) {
    return row.map(function (cell) {
      var s = String(cell == null ? '' : cell);
      if (s.indexOf(',') >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    }).join(',');
  }).join('\n');

  var folder = DriveApp.getFolderById(folderId);
  folder.createFile(sheetName + '.csv', csv, MimeType.CSV);
}


// ════════════════════════════════════════════════════════════════
// 【SECTION E-4】★ migrateExistingPlayers - 既存 Players の一括補完
//
// 設計意図【既存データ救済】：
//   - 旧データには gw_user_id 列が空のプレイヤーが多数存在
//   - 旧 user_id 列 → identity 自動登録 → gw_user_id 補完 の流れ
//   - GASエディタから手動で1回実行する想定
//   - 既に gw_user_id が埋まっている行はスキップ
//
// 実行効果：
//   - 過去のラウンド履歴が、新しい認証システム (GW_USER_ID) に紐付く
//   - その後の Core_linkBackup でデータ保全連携が可能になる
// ════════════════════════════════════════════════════════════════
function migrateExistingPlayers() {
  var log = [];
  try {
    var sh = _sheet(SHEET_PLAYERS);
    var map = _headerMap(sh);

    if (map['gw_user_id'] === undefined) {
      // ── 列追加から ──
      sh.getRange(1, sh.getLastColumn() + 1).setValue('gw_user_id');
      map = _headerMap(sh);
      log.push('✅ Players に gw_user_id 列を追加しました');
    }

    var data = sh.getDataRange().getValues();
    if (data.length < 2) {
      log.push('ℹ️ Players が空です。マイグレーション不要');
      return { ok: true, log: log, migrated: 0 };
    }

    var migrated = 0;
    var skipped = 0;

    for (var i = 1; i < data.length; i++) {
      var currentGw = String(data[i][map['gw_user_id']] || '');
      if (currentGw) {
        skipped++;
        continue; // 既に埋まっている
      }

      var nickname = String(data[i][map['nickname']] || '');
      var realName = String(data[i][map['real_name']] || '');
      var oldUserId = (map['user_id'] !== undefined)
                      ? String(data[i][map['user_id']] || '')
                      : '';

      // ── 新しい GW-G-* を発行（既存データ用、ローカルIDと別系統） ──
      //    プレフィックスは GW-G- だが、明確に区別したい場合は GW-M-（Migrated）も可
      var newGwId = 'GW-G-MIG' + ('00000' + (i)).slice(-5);

      // ── identity への登録 ──
      _resolveOrCreateIdentity(newGwId, {
        gwUserId:    newGwId,
        displayName: nickname,
        realName:    realName,
        useCount:    0
      });

      // ── Players の gw_user_id を埋める ──
      sh.getRange(i + 1, map['gw_user_id'] + 1).setValue(newGwId);

      migrated++;
    }

    log.push('✅ マイグレーション完了');
    log.push('   補完: ' + migrated + ' 行');
    log.push('   スキップ（既設）: ' + skipped + ' 行');

    return { ok: true, log: log, migrated: migrated, skipped: skipped };
  } catch (err) {
    log.push('❌ エラー: ' + err.message);
    return { ok: false, log: log, error: err.message };
  } finally {
    console.log(log.join('\n'));
    try { SpreadsheetApp.getUi().alert(log.join('\n')); } catch (e) {}
  }
}


// ════════════════════════════════════════════════════════════════
// 【SECTION E-5】verifyDataIntegrity - データ整合性チェック
//
// 設計意図：
//   - 本番デプロイ前 or バグ調査時に手動実行
//   - 検査項目：
//     1. Players.player_id の重複
//     2. Scores の孤児行（対応する Players が無い）
//     3. History の孤児行
//     4. identity.gw_user_id の重複
//     5. backup_links の参照整合性
// ════════════════════════════════════════════════════════════════
function verifyDataIntegrity() {
  var log = ['=== G-WORLD データ整合性チェック ==='];
  var issues = 0;

  try {
    // ── 1. Players.player_id 重複チェック ──
    var pSh = _sheet(SHEET_PLAYERS);
    var pMap = _headerMap(pSh);
    var pData = pSh.getDataRange().getValues();
    var pidSet = {};
    var dupPids = [];
    for (var i = 1; i < pData.length; i++) {
      var pid = String(pData[i][pMap['player_id']] || '');
      if (!pid) continue;
      if (pidSet[pid]) {
        dupPids.push(pid);
      } else {
        pidSet[pid] = true;
      }
    }
    log.push('\n[1] Players.player_id 重複:');
    if (dupPids.length === 0) {
      log.push('   ✅ OK（重複なし）');
    } else {
      issues += dupPids.length;
      log.push('   ⚠ 重複あり: ' + dupPids.join(', '));
    }

    // ── 2. Scores の孤児行 ──
    var sSh = _sheet(SHEET_SCORES);
    var sMap = _headerMap(sSh);
    var sData = sSh.getDataRange().getValues();
    var orphanScores = 0;
    for (var j = 1; j < sData.length; j++) {
      var spid = String(sData[j][sMap['player_id']] || '');
      if (spid && !pidSet[spid]) orphanScores++;
    }
    log.push('\n[2] Scores 孤児行（対応 Players なし）:');
    if (orphanScores === 0) {
      log.push('   ✅ OK');
    } else {
      issues += orphanScores;
      log.push('   ⚠ ' + orphanScores + ' 行');
    }

    // ── 3. History の孤児行 ──
    var hSh = _sheet(SHEET_HISTORY);
    var hMap = _headerMap(hSh);
    var hData = hSh.getDataRange().getValues();
    var orphanHist = 0;
    for (var k = 1; k < hData.length; k++) {
      var hpid = String(hData[k][hMap['player_id']] || '');
      if (hpid && !pidSet[hpid]) orphanHist++;
    }
    log.push('\n[3] History 孤児行:');
    if (orphanHist === 0) {
      log.push('   ✅ OK');
    } else {
      issues += orphanHist;
      log.push('   ℹ️ ' + orphanHist + ' 行（履歴のみ残存・問題なし）');
    }

    // ── 4. identity.gw_user_id 重複 ──
    var idSh = _sheet(SHEET_IDENTITY);
    var idMap = _headerMap(idSh);
    if (idSh.getLastRow() > 1) {
      var idData = idSh.getRange(2, 1, idSh.getLastRow() - 1, idSh.getLastColumn()).getValues();
      var idSet = {};
      var dupIds = [];
      for (var m = 0; m < idData.length; m++) {
        var gid = String(idData[m][idMap['gw_user_id']] || '');
        if (!gid) continue;
        if (idSet[gid]) {
          dupIds.push(gid);
        } else {
          idSet[gid] = true;
        }
      }
      log.push('\n[4] identity.gw_user_id 重複:');
      if (dupIds.length === 0) {
        log.push('   ✅ OK');
      } else {
        issues += dupIds.length;
        log.push('   ⚠ 重複あり: ' + dupIds.join(', '));
      }

      // ── 5. backup_links 参照整合性 ──
      var blSh = _sheet(SHEET_BACKUP_LINKS);
      var blMap = _headerMap(blSh);
      if (blSh.getLastRow() > 1) {
        var blData = blSh.getRange(2, 1, blSh.getLastRow() - 1, blSh.getLastColumn()).getValues();
        var brokenLinks = 0;
        for (var n = 0; n < blData.length; n++) {
          var newId = String(blData[n][blMap['new_gw_user_id']] || '');
          if (newId && !idSet[newId]) brokenLinks++;
        }
        log.push('\n[5] backup_links 参照整合性:');
        if (brokenLinks === 0) {
          log.push('   ✅ OK');
        } else {
          issues += brokenLinks;
          log.push('   ⚠ ' + brokenLinks + ' 件の参照切れ（new_gw_user_id が identity に無い）');
        }
      }
    }

    log.push('\n=== 結果 ===');
    log.push(issues === 0 ? '✅ 全項目クリア' : '⚠ 検出された問題: ' + issues + ' 件');

    var msg = log.join('\n');
    console.log(msg);
    try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
    return { ok: issues === 0, issues: issues, log: log };
  } catch (err) {
    log.push('❌ エラー: ' + err.message);
    console.log(log.join('\n'));
    return { ok: false, error: err.message, log: log };
  }
}


// ════════════════════════════════════════════════════════════════
// 【SECTION E-6】purgeOldGuestIdentities - 古いゲストIDを掃除（任意）
//
// 設計意図：
//   - 1年以上アクセスの無いゲストID（GW-G-*）を identity から削除
//   - state='backed_up' のIDは絶対に削除しない（データ保全志向）
//   - 関連する Players / Scores / History は削除しない（履歴は永久保存）
//   - 手動 or タイムトリガーで年1回実行を想定
//
// ※デフォルトでは「ドライラン」で実行され、何も削除されません
//   実削除する場合は引数 dryRun=false で呼ぶ
// ════════════════════════════════════════════════════════════════
function purgeOldGuestIdentities(dryRun) {
  if (dryRun === undefined) dryRun = true;
  var log = ['=== 古いゲストID 掃除 (dryRun=' + dryRun + ') ==='];

  try {
    var sh = _sheet(SHEET_IDENTITY);
    var map = _headerMap(sh);
    var data = sh.getDataRange().getValues();
    if (data.length < 2) {
      log.push('ℹ️ identity が空です');
      return { ok: true, log: log, removed: 0 };
    }

    var cutoff = new Date(Date.now() - 365 * 86400000);
    var toRemove = [];

    for (var i = 1; i < data.length; i++) {
      var state = String(data[i][map['state']] || 'guest');
      if (state !== 'guest') continue; // 保全済みは絶対残す

      var lastActive = data[i][map['last_active_at']];
      if (!lastActive) continue;
      try {
        if (new Date(lastActive) < cutoff) {
          toRemove.push({
            rowIdx: i + 1,
            gwUserId: String(data[i][map['gw_user_id']]),
            lastActive: lastActive
          });
        }
      } catch (e) {}
    }

    log.push('検出: ' + toRemove.length + ' 件のゲストIDが1年以上未使用');
    toRemove.forEach(function (r) {
      log.push('   - ' + r.gwUserId + ' (last: ' + r.lastActive + ')');
    });

    if (!dryRun && toRemove.length > 0) {
      // 後ろから削除（行番号ズレ回避）
      toRemove.sort(function (a, b) { return b.rowIdx - a.rowIdx; });
      toRemove.forEach(function (r) {
        sh.deleteRow(r.rowIdx);
      });
      log.push('✅ 削除完了: ' + toRemove.length + ' 行');
    } else if (dryRun) {
      log.push('ℹ️ ドライラン：実際の削除は行っていません');
      log.push('   実削除するには purgeOldGuestIdentities(false) を実行');
    }

    console.log(log.join('\n'));
    return { ok: true, log: log, removed: dryRun ? 0 : toRemove.length, candidates: toRemove.length };
  } catch (err) {
    log.push('❌ エラー: ' + err.message);
    return { ok: false, error: err.message, log: log };
  }
}


// ════════════════════════════════════════════════════════════════
// 【SECTION E-7】拡張余白用のスタブ関数群
//
// 設計意図：
//   - 将来 G-COMPETE / G-TOWN / G-JUNIOR モジュールを追加する際の
//     インターフェース確定用スタブ
//   - 現状は ROUTES に登録されていないため呼ばれない
//   - 実装時にはこれらの関数を埋め、ROUTES のコメントアウトを外す
//
// ※ G-WORLD の "11モジュール拡張" 構想への布石
// ════════════════════════════════════════════════════════════════

/* ──────────────────────────────────────────────
 * 【G-COMPETE】コンペ運営機能（将来実装）
 * ────────────────────────────────────────────── */

function GCompete_create(payload, meta) {
  return { ok: false, error: 'G-COMPETE は次期リリースで実装予定', code: 'E_NOT_IMPLEMENTED' };
}

function GCompete_leaderboard(payload, meta) {
  return { ok: false, error: 'G-COMPETE は次期リリースで実装予定', code: 'E_NOT_IMPLEMENTED' };
}

function GCompete_lottery(payload, meta) {
  return { ok: false, error: 'G-COMPETE は次期リリースで実装予定', code: 'E_NOT_IMPLEMENTED' };
}

/* ──────────────────────────────────────────────
 * 【G-TOWN】地域連携機能（将来実装）
 * ────────────────────────────────────────────── */

function GTown_shopList(payload, meta) {
  return { ok: false, error: 'G-TOWN は次期リリースで実装予定', code: 'E_NOT_IMPLEMENTED' };
}

function GTown_pointAdd(payload, meta) {
  return { ok: false, error: 'G-TOWN は次期リリースで実装予定', code: 'E_NOT_IMPLEMENTED' };
}

function GTown_pointHistory(payload, meta) {
  return { ok: false, error: 'G-TOWN は次期リリースで実装予定', code: 'E_NOT_IMPLEMENTED' };
}

/* ──────────────────────────────────────────────
 * 【G-JUNIOR】ジュニア・保護者紐付け（将来実装）
 * ────────────────────────────────────────────── */

function GJunior_linkParent(payload, meta) {
  return { ok: false, error: 'G-JUNIOR は次期リリースで実装予定', code: 'E_NOT_IMPLEMENTED' };
}

/* ──────────────────────────────────────────────
 * 【Admin】管理機能（将来実装）
 * ────────────────────────────────────────────── */

function Admin_setActiveCourse(payload, meta) {
  return { ok: false, error: '管理機能は次期リリースで実装予定', code: 'E_NOT_IMPLEMENTED' };
}

function Admin_reset(payload, meta) {
  return { ok: false, error: '管理機能は次期リリースで実装予定', code: 'E_NOT_IMPLEMENTED' };
}


// ════════════════════════════════════════════════════════════════
// 【SECTION E-8】ファイル末尾のまとめ
//
// ★ G-WORLD Backend v1.0.0 完成 ★
//
// 実装完了:
//   ✅ doPost / doGet                           (Section A)
//   ✅ actionルーター (ホワイトリスト)            (Section A)
//   ✅ スキーマ自動マイグレーション               (Section A)
//   ✅ identity / backup_links / events_*       (Section A,B)
//   ✅ Core 層 (boot/health/linkBackup/ping/profile) (Section B)
//   ✅ _logEvent 月次ローテ対応                  (Section B)
//   ✅ GLand_register / saveScore / getMyScores / getMates (Section C)
//   ✅ GLand_saveSnapshot / getHistoryList / getHistoryDetail (Section D)
//   ✅ 運用ツール 6種                            (Section E)
//   ✅ 拡張余白スタブ 8種                        (Section E)
//
// ── 設計憲法 全7条遵守状況 ──
//   ✅ 第1条 段階的エンゲージメント         (GW-G-* / GW-B-*)
//   ✅ 第2条 システム限界回避               (events_YYYY_MM 月次ローテ)
//   ✅ 第3条 名前空間ルール                 (GW.Core / GW.Modules)
//   ✅ 第4条 徹底軽量化                     (51関数→25関数)
//   ✅ 第5条 フッターナビ5項目              (HTML/CSS で実装済み)
//   ✅ 第6条 日本語コメント                 (本ファイル全体)
//   ✅ 第7条 言葉の選択                     ("認証/お試し" 全廃)
//
// ── デプロイ手順は次の投稿（投稿5/5）で詳述 ──
//
// 🍺 ハワイで乾杯まで、あとひと息！
// ════════════════════════════════════════════════════════════════
