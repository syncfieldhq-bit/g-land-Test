/******************************************************************
 * G-WORLD Backend - Migration Service
 *
 * 【SECTION 6】★ 既存データを失わないスキーマ整備
 *
 * 設計意図【絶対条件】：
 *   - 既存スプレッドシートのデータは1件も失わない
 *   - 既存列はそのまま維持し、新規列のみ末尾追加
 *   - 既存シートが無ければ新規作成、ある場合はヘッダだけ拡張
 *   - identity / backup_links は新規作成
 *
 * 動作タイミング：
 *   - doPost / doGet の最初で毎回呼ばれる（_routeAction 内）
 *   - 起動毎に呼ばれるが、不足列が無ければ何もしないため軽量
 *   - 月変わりの瞬間に新しい events_YYYY_MM シートが自動生成される
 *
 * 含まれる関数：
 *   - _ensureAllSheets   : 全シートのスキーマを確認・修復
 *   - _ensureEventsSheet : 指定年月の events シートを確実に存在させる
 *
 * 【依存】
 *   - config_Config.gs : SS_ID, EVENTS_SHEET_PREFIX
 *   - config_Schema.gs : HEADERS, EVENTS_HEADER
 *   - utils_Utils.gs   : _yyyyMm
 *
 * 【呼出元】
 *   - Router.gs : _routeAction が起動時に _ensureAllSheets を呼ぶ
 *   - Main.gs   : doGet が _ensureAllSheets を呼ぶ
 *   - services_EventLogService.gs : _logEvent が _ensureEventsSheet を呼ぶ
 ******************************************************************/


// ════════════════════════════════════════════════════════════════
// 【SECTION 6-a】全シートのスキーマ整備
//
// 動作フロー：
//   1) HEADERS で定義された全シートを順にチェック
//   2) シートが無い → 新規作成 + ヘッダ書込
//   3) シートが空 → ヘッダだけ書込
//   4) シートがあるが列が不足 → 末尾に不足列を追加（既存データ無傷）
//   5) 今月の events_YYYY_MM シートも用意
//
// 重要な絶対条件：
//   - 既存データは1件も削除しない
//   - 既存列の順序も変更しない
//   - 列の追加のみ行う（削除・改名は厳禁）
// ════════════════════════════════════════════════════════════════

/**
 * 全シートのスキーマを確認・修復
 *   - 起動時に1回だけ呼ばれる（doPost / doGet の最初）
 *   - 既存データは絶対に消さない
 *   - 列の追加のみ行う
 *
 * @returns {Object} { ok: true }
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


// ════════════════════════════════════════════════════════════════
// 【SECTION 6-b】月次 events シート生成
//
// 設計意図【設計憲法・第2条】：
//   - 月変わりの瞬間に新しい events_YYYY_MM が自動生成される
//   - 単一の events シートに全履歴を蓄積するのではなく、月別に分離
//   - これによりシート1枚あたりの行数を抑制し、検索性能を維持
//   - 将来 SQL 移行時には「月別パーティション」として転用可能
// ════════════════════════════════════════════════════════════════

/**
 * 指定年月の events シートを確実に存在させる
 *   - 月次ローテーション用
 *   - 月が変わった瞬間に自動生成される
 *
 * @param {string} yyyymm - 'YYYY_MM' 形式（例: '2024_03'）
 * @returns {Sheet}
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
