/******************************************************************
 * G-WORLD Backend - Sheet Service
 *
 * 【SECTION B-1】シート操作の最重要基盤
 *
 * 設計意図：
 *   - 全シート操作はここを経由する唯一の窓口
 *   - 列順依存ゼロの設計（_headerMap で列インデックスを動的取得）
 *   - 既存データを無傷で保つため、行アクセスは全て _headerMap 経由
 *   - 将来 SQL/Firestore 等に移行する場合の差し替えポイント
 *
 * 含まれる関数（7つ）：
 *   - _sheet            : シート取得（無ければ作成+ヘッダ書込）
 *   - _getValues        : シート全行取得
 *   - _headerMap        : 「列名 → 列インデックス」マップ生成
 *   - _getConfig        : Config シート key-value 読み込み
 *   - _setConfig        : Config シート key-value 書き込み
 *   - _emptyRow         : ヘッダマップに対応した空行生成
 *   - _safeJsonParse    : 失敗時デフォルト値を返す安全なパース
 *
 * 【依存】
 *   - config_Config.gs : SS_ID, SHEET_CONFIG
 *   - config_Schema.gs : HEADERS
 *
 * 【呼出元】
 *   - api_CoreApi.gs                : 全6関数（_sheet / _headerMap / _emptyRow / _getConfig）
 *   - api_GolfApi.gs                : 全5関数（_sheet / _headerMap / _emptyRow / _getConfig）
 *   - api_GolfHistoryApi.gs         : 全3関数（_sheet / _headerMap / _emptyRow / _safeJsonParse）
 *   - repositories_GolfRepository.gs       : 全7関数（_sheet / _headerMap / _safeJsonParse）
 *   - repositories_HistoryRepository.gs    : 1関数（_sheet / _headerMap）
 *   - repositories_BackupRepository.gs     : 全6関数（_sheet / _headerMap / _emptyRow / _safeJsonParse）
 *   - services_IdentityService.gs   : 全3関数（_sheet / _headerMap / _emptyRow / _safeJsonParse）
 *   - services_EventLogService.gs   : _logEvent（_headerMap / _emptyRow）
 *   - services_MigrationService.gs  : _ensureAllSheets
 *   - utils_Utils.gs                : _safeLogEvent
 ******************************************************************/


// ════════════════════════════════════════════════════════════════
// 【シート取得】
// ════════════════════════════════════════════════════════════════

/**
 * シートを取得（無ければ作成 + ヘッダ書込）
 *
 * 動作：
 *   1) シートが存在すればそのまま返す
 *   2) 存在しなければ新規作成し、HEADERS[name] があればヘッダ行を書込
 *   3) 既存だが空シート（lastRow=0）の場合もヘッダを書込
 *
 * @param {string} name - シート名
 * @returns {Sheet}
 */
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


// ════════════════════════════════════════════════════════════════
// 【全行取得】
// ════════════════════════════════════════════════════════════════

/**
 * シートの全行データを取得（ヘッダ行を含む）
 *
 * 注意：
 *   - 大規模化したシートではメモリに乗り切らない可能性があるため、
 *     将来的にはチャンク読込に切り替える
 *   - 通常は呼出元で sh.getDataRange().getValues() を直接使う方が
 *     ベター（_sheet との二度取得を避ける）。本関数は薄いラッパーとして残置
 *
 * @param {string} name - シート名
 * @returns {Array<Array>} 2次元配列（ヘッダ行を含む）
 */
function _getValues(name) {
  var sh = _sheet(name);
  var lr = sh.getLastRow();
  var lc = sh.getLastColumn();
  if (lr < 1 || lc < 1) return [];
  return sh.getRange(1, 1, lr, lc).getValues();
}


// ════════════════════════════════════════════════════════════════
// 【ヘッダマップ - 列順依存解消の核心】
// ════════════════════════════════════════════════════════════════

/**
 * ヘッダ行から「列名 → 列インデックス」のマップを作る
 *
 * 設計意図【最重要】：
 *   - 列順依存を解消する核心関数
 *   - 既存シートに新列を追加した時も、コード変更なしで動く
 *   - 例：sh.getRange(i+1, map['stroke']+1).setValue(...) のように使う
 *
 * @param {Sheet} sh
 * @returns {Object} { 'player_id': 0, 'hole': 1, ... }
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


// ════════════════════════════════════════════════════════════════
// 【Config シート key-value 読み書き】
// ════════════════════════════════════════════════════════════════

/**
 * Config シートから値を取得
 *   - 該当キーが無ければ空文字を返す
 *
 * @param {string} key
 * @returns {string|*}
 */
function _getConfig(key) {
  var data = _getValues(SHEET_CONFIG);
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === key) return data[i][1];
  }
  return '';
}

/**
 * Config シートに値を保存
 *   - 既存キーがあれば上書き、無ければ末尾追加
 *
 * @param {string} key
 * @param {*} value
 */
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


// ════════════════════════════════════════════════════════════════
// 【空行生成】
// ════════════════════════════════════════════════════════════════

/**
 * 空の行配列を生成（ヘッダマップに対応した長さ）
 *
 * 設計意図：
 *   新規行追加時に、列順を気にせず安全に書き込むためのヘルパー。
 *   呼出側は row[map['xxx']] = 値 の形で代入し、最後に sh.appendRow(row) する。
 *   未指定の列は空文字のままになる。
 *
 * @param {Object} headerMap - _headerMap の結果
 * @returns {Array} 空文字で埋められた配列
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


// ════════════════════════════════════════════════════════════════
// 【安全な JSON パース】
// ════════════════════════════════════════════════════════════════

/**
 * 安全な JSON parse（失敗時はデフォルト値を返す）
 *
 * 設計意図：
 *   シートの JSON 列（hole_scores_json / device_ids_json 等）を読む際、
 *   セルが空・壊れた JSON・null 等の異常系で例外を出さないようにする。
 *
 * @param {string} str
 * @param {*} defaultValue - 失敗時に返す値（省略時は null）
 * @returns {*}
 */
function _safeJsonParse(str, defaultValue) {
  if (!str) return defaultValue === undefined ? null : defaultValue;
  try {
    return JSON.parse(str);
  } catch (e) {
    return defaultValue === undefined ? null : defaultValue;
  }
}
