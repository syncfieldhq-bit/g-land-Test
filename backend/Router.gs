/******************************************************************
 * G-WORLD Backend - Action Router
 *
 * 【SECTION 4】★ actionルーター（ホワイトリスト方式）
 *
 * 設計意図【セキュリティ最優先】：
 *   - 任意関数呼び出しの脆弱性を完全排除
 *   - 全アクションを ROUTES 辞書で明示（ホワイトリスト）
 *   - 拡張余白として GCompete / GTown 等のキーをコメントで残置
 *   - 共通前処理：シート自動マイグレーション、イベントログ記録、エラーハンドリング
 *
 * 含まれる関数：
 *   - ROUTES               : action → ハンドラ関数名のマッピング辞書（const）
 *   - _routeAction         : 新形式（action ルーター）の本体
 *   - _routeLegacyFuncName : 旧 funcName 形式の互換レイヤ（移行期間中の救済）
 *   - _legacyGetCourses    : 旧 getCourses 互換ヘルパー
 *
 * 【依存】
 *   - services_MigrationService.gs : _ensureAllSheets
 *   - services_EventLogService.gs  : _logEvent（_safeLogEvent 経由）
 *   - utils_Utils.gs               : _jsonResponse / _safeLogEvent / _trimPayloadForLog
 *   - api_CoreApi.gs               : Core_boot / Core_health / Core_linkBackup / Core_ping / Core_getProfile / Core_updateProfile
 *   - api_GolfApi.gs               : GLand_boot / GLand_register / GLand_saveScore / GLand_getMyScores / GLand_getMates
 *   - api_GolfHistoryApi.gs        : GLand_saveSnapshot / GLand_getHistoryList / GLand_getHistoryDetail
 *
 * 【呼出元】
 *   - Main.gs : doPost が _routeAction / _routeLegacyFuncName を呼ぶ
 ******************************************************************/


// ════════════════════════════════════════════════════════════════
// 【ROUTES - ホワイトリスト】
//
// 設計意図：
//   命名規則 {モジュール名}.{動作} を厳守。
//   拡張時は ROUTES に追加するだけ。新モジュールも同じ規則で。
//   ★ ここに無い action は絶対に実行されない（セキュリティの要）
// ════════════════════════════════════════════════════════════════

/**
 * action ルーティング辞書（ホワイトリスト）
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


// ════════════════════════════════════════════════════════════════
// 【action ルーター本体】
//
// 処理フロー：
//   1) シート存在確認（自動マイグレーション）
//   2) ROUTES でアクション解決（ホワイトリスト）
//   3) ハンドラ関数を実行
//   4) イベントログを events_YYYY_MM に記録
//   5) JSONレスポンスを返す
// ════════════════════════════════════════════════════════════════

/**
 * action ルーター本体
 *
 * @param {Object} req - パース済みリクエストボディ
 * @returns {TextOutput} JSON レスポンス
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


// ════════════════════════════════════════════════════════════════
// 【旧 funcName 形式の互換レイヤ（移行期間中のみ）】
//
// 設計意図：
//   - v4.7 までのフロントが残っている端末からのリクエストを救済
//   - 主要な10関数だけマップし、それ以外は新APIへ誘導
//   - 将来的にこの関数は削除する（移行完了確認後）
//
// 注意：
//   - 旧フロントは success フィールドを期待しているため両対応で返す
//   - meta 情報は空オブジェクトで渡す（旧フロントは meta を送らない）
// ════════════════════════════════════════════════════════════════

/**
 * 旧 funcName 形式の互換レイヤ
 *
 * @param {Object} req - { funcName, args }
 * @returns {TextOutput}
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


/**
 * 旧 getCourses 互換ヘルパー
 *   - 旧フロントは getCourses() でコース配列だけを期待
 *   - 内部的には Core_boot を呼んで courses だけ抜き出す
 *
 * @returns {Object} { ok, courses }
 */
function _legacyGetCourses() {
  var res = Core_boot({}, {});
  return {
    ok: !!(res && res.ok),
    courses: (res && res.courses) || []
  };
}
