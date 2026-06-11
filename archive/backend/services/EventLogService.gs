/******************************************************************
 * G-WORLD Backend - Event Log Service
 *
 * 【SECTION B-2】★ イベントログ本体（月次ローテ対応）
 *
 * 設計意図【設計憲法・第2条】：
 *   - 全アクションの発生履歴を events_YYYY_MM に記録
 *   - 月変わりで自動的に新シートに切り替わる（_ensureEventsSheet で生成）
 *   - 将来 SQL移行時のファクトテーブルとして転用可能な構造
 *   - 書込み失敗はアプリ全体を止めないため、_safeLogEvent から呼ばれる
 *   - イベントログ自体の負荷を抑えるため、appendRow（行末追加）のみ使用
 *
 * 含まれる関数：
 *   - _logEvent          : イベントログを events_YYYY_MM に記録
 *   - _getEventsSheet    : 指定年月のシート取得（履歴参照・分析用）
 *
 * 【依存】
 *   - services_SheetService.gs    : _headerMap, _emptyRow
 *   - services_MigrationService.gs : _ensureEventsSheet
 *   - utils_Utils.gs              : _uuid, _yyyyMm
 *   - config_Config.gs            : SS_ID, EVENTS_SHEET_PREFIX
 *   - config_Schema.gs            : EVENTS_HEADER
 *
 * 【呼出元】
 *   - utils_Utils.gs : _safeLogEvent（try/catch ラッパー）から呼ばれる
 *   - Router.gs      : _routeAction の最後で成功/失敗時にログ記録
 ******************************************************************/


// ════════════════════════════════════════════════════════════════
// 【SECTION B-2-a】イベントログ本体
//
// 入力：
//   entry = {
//     gwUserId:   string,
//     module:     string,  // 'gland' | 'core' | 'gcompete' 等
//     action:     string,  // 'gland.saveScore' / 'core.boot' 等
//     payload:    Object,  // 軽量メタデータ（_trimPayloadForLog 適用済み）
//     deviceId:   string,
//     apiVersion: string
//   }
//
// 出力：
//   なし（副作用のみ）
//
// 注意：
//   - try/catch は呼出側（_safeLogEvent）が担当するため、本関数では
//     例外を伝播させる。シート書込み失敗は呼出側で握り潰す。
//   - ヘッダ行が破損していた場合は EVENTS_HEADER で自動修復してから書込
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


// ════════════════════════════════════════════════════════════════
// 【SECTION B-2-b】過去月のシート取得（参照用）
//
// 設計意図：
//   - rotateMonthlyEvents / verifyDataIntegrity 等の運用関数から呼ばれる
//   - 指定年月のシートが存在しなければ null を返す
//   - 将来の分析・SQL移行で活用するための足がかり
// ════════════════════════════════════════════════════════════════

/**
 * 古い events_*** シートの取得（履歴参照用）
 *
 * @param {string} yyyymm - 'YYYY_MM' 形式（例: '2024_03'）
 * @returns {Sheet|null}
 */
function _getEventsSheet(yyyymm) {
  var ss = SpreadsheetApp.openById(SS_ID);
  return ss.getSheetByName(EVENTS_SHEET_PREFIX + yyyymm);
}
