/******************************************************************
 * G-WORLD Backend - Maintenance: Setup & Debug
 *
 * 【SECTION E-1, E-2】初期セットアップ & デバッグ診断
 *
 * 設計意図【設計憲法・第2条】：
 *   - GAS エディタから手動実行する運用者専用ツール
 *   - doPost からは絶対に呼ばれない（ROUTES に登録しない）
 *   - フロントから到達不可能な「楽屋裏」関数群
 *
 * 含まれる関数：
 *   - setupInitialSheets : 初期セットアップ（新スプレッドシート展開時に1回実行）
 *   - debugCheck         : 全シートの状態確認（診断）
 *
 * 【実行方法】
 *   1. Apps Script エディタを開く
 *   2. 上部メニューの関数ドロップダウンから関数名を選択
 *   3. 「実行」ボタンをクリック
 *   4. 初回は権限承認が必要
 *   5. ログは「実行ログ」タブで確認
 *
 * 【依存】
 *   - services_MigrationService.gs : _ensureAllSheets
 *   - services_SheetService.gs     : _sheet, _setConfig
 *   - config_Config.gs             : SS_ID, SHEET_COURSES
 *   - config_Schema.gs             : HEADERS
 ******************************************************************/


// ════════════════════════════════════════════════════════════════
// 【SECTION E-1】setupInitialSheets - 初期セットアップ
//
// 設計意図：
//   - GAS エディタから手動で1回だけ実行する想定
//   - 新しいスプレッドシートに G-WORLD を展開する時の初期化
//   - 全シートのスキーマを作成し、サンプルコースを投入する
//
// 安全性：
//   - 既存データがあれば触らない（_ensureAllSheets が列追加のみ）
//   - Courses シートに行が0なら、サンプルコースを1件だけ投入
// ════════════════════════════════════════════════════════════════

/**
 * 初期セットアップ
 *   - 全シートを作成（既存があれば列追加のみ）
 *   - Courses が空ならサンプルコース1件投入
 *   - active_course_id を設定
 *
 * 【使い方】
 *   1. 新しいスプレッドシートに本プロジェクトを紐付け
 *   2. Apps Script エディタで本関数を選択
 *   3. 「実行」ボタンをクリック
 *   4. 初回は権限承認ダイアログが出るので「許可」
 *   5. 実行ログに「✅ 初期セットアップ完了」が出れば成功
 */
function setupInitialSheets() {
  console.log('[Setup] 初期セットアップ開始');

  // ── 1) 全シートのスキーマを整備（既存データ無傷） ──
  _ensureAllSheets();
  console.log('[Setup] ✅ 全シートのスキーマ整備完了');

  // ── 2) Courses シートが空ならサンプルコースを投入 ──
  var coursesSh = _sheet(SHEET_COURSES);
  if (coursesSh.getLastRow() < 2) {
    // サンプルコース：六甲国際パブリック（PAR 72・標準的な配分）
    var sampleCourse = [
      'G001',                  // course_id
      '六甲国際パブリック',     // course_name
      4, 5, 3, 4, 4, 3, 5, 4, 4,   // par1-9 (OUT: 36)
      4, 4, 3, 5, 4, 4, 3, 5, 4    // par10-18 (IN: 36) → 合計 72
    ];
    coursesSh.appendRow(sampleCourse);
    console.log('[Setup] ✅ サンプルコース投入: G001 六甲国際パブリック (PAR 72)');

    // ── 3) アクティブコースを設定 ──
    _setConfig('active_course_id', 'G001');
    console.log('[Setup] ✅ active_course_id を G001 に設定');
  } else {
    console.log('[Setup] ⏭ Courses シートに既存データあり、サンプル投入をスキップ');
  }

  // ── 4) スプレッドシート情報を出力 ──
  var ss = SpreadsheetApp.openById(SS_ID);
  console.log('[Setup] スプレッドシート名: ' + ss.getName());
  console.log('[Setup] スプレッドシートURL: ' + ss.getUrl());
  console.log('[Setup] ✅ 初期セットアップ完了');

  return {
    ok:       true,
    ssName:   ss.getName(),
    ssUrl:    ss.getUrl(),
    sheets:   ss.getSheets().map(function (s) { return s.getName(); })
  };
}


// ════════════════════════════════════════════════════════════════
// 【SECTION E-2】debugCheck - 全シートの状態確認
//
// 設計意図：
//   - 全シートの行数・列数・ヘッダ整合性を一覧で確認
//   - 問題のあるシートを早期発見するための診断ツール
//   - 本番投入前のデータ確認、運用時のヘルスチェックに使用
// ════════════════════════════════════════════════════════════════

/**
 * デバッグ用：全シートの状態確認
 *
 * 【使い方】
 *   1. Apps Script エディタで本関数を選択
 *   2. 「実行」ボタンをクリック
 *   3. 実行ログでシート別の状態を確認
 *
 * 【出力例】
 *   [Debug] === シート診断 ===
 *   [Debug] identity       : 行数=3, 列数=11, ヘッダOK
 *   [Debug] backup_links   : 行数=1, 列数=7, ヘッダOK
 *   [Debug] Courses        : 行数=2, 列数=20, ヘッダOK
 *   [Debug] Players        : 行数=15, 列数=13, ヘッダOK
 *   [Debug] Scores         : 行数=253, 列数=8, ヘッダOK
 *   [Debug] Config         : 行数=3, 列数=2, ヘッダOK
 *   [Debug] History        : 行数=8, 列数=16, ヘッダOK
 *   [Debug] events_2024_03 : 行数=1247, 列数=8, ヘッダOK
 *   [Debug] === 診断完了 ===
 */
function debugCheck() {
  console.log('[Debug] === シート診断 ===');

  var ss = SpreadsheetApp.openById(SS_ID);
  var allSheets = ss.getSheets();
  var diagnostics = [];

  // ── 1) HEADERS で定義された各シートを診断 ──
  var defined = Object.keys(HEADERS);
  for (var i = 0; i < defined.length; i++) {
    var name = defined[i];
    var sh = ss.getSheetByName(name);
    if (!sh) {
      console.log('[Debug] ' + _pad(name, 16) + ': ❌ シート不在');
      diagnostics.push({ name: name, exists: false });
      continue;
    }
    var lr = sh.getLastRow();
    var lc = sh.getLastColumn();
    var headerOK = _checkHeaders(sh, HEADERS[name]);
    var msg = '行数=' + lr + ', 列数=' + lc + ', ヘッダ' + (headerOK.ok ? 'OK' : '⚠ 不一致: ' + headerOK.missing.join(','));
    console.log('[Debug] ' + _pad(name, 16) + ': ' + msg);
    diagnostics.push({
      name:        name,
      exists:      true,
      lastRow:     lr,
      lastColumn:  lc,
      headerOK:    headerOK.ok,
      missingCols: headerOK.missing
    });
  }

  // ── 2) events_* シートを診断 ──
  for (var j = 0; j < allSheets.length; j++) {
    var s = allSheets[j];
    if (s.getName().indexOf(EVENTS_SHEET_PREFIX) === 0) {
      var lr2 = s.getLastRow();
      var lc2 = s.getLastColumn();
      console.log('[Debug] ' + _pad(s.getName(), 16) + ': 行数=' + lr2 + ', 列数=' + lc2);
      diagnostics.push({
        name:        s.getName(),
        exists:      true,
        lastRow:     lr2,
        lastColumn:  lc2,
        isEventLog:  true
      });
    }
  }

  console.log('[Debug] === 診断完了 ===');
  return { ok: true, sheets: diagnostics };
}


// ════════════════════════════════════════════════════════════════
// 【内部ヘルパー】
// ════════════════════════════════════════════════════════════════

/**
 * シートのヘッダが期待値と一致するかチェック
 *   - 不足列があれば missing 配列に列挙
 *   - 並び順は問わない（_ensureAllSheets で順序差は許容している）
 */
function _checkHeaders(sh, expectedHeaders) {
  var lr = sh.getLastRow();
  if (lr < 1) return { ok: false, missing: expectedHeaders };
  var lc = sh.getLastColumn();
  var actualHeaders = sh.getRange(1, 1, 1, lc).getValues()[0]
    .map(function (h) { return String(h).trim(); });
  var missing = [];
  for (var i = 0; i < expectedHeaders.length; i++) {
    if (actualHeaders.indexOf(expectedHeaders[i]) < 0) {
      missing.push(expectedHeaders[i]);
    }
  }
  return { ok: missing.length === 0, missing: missing };
}

/**
 * ログ表示用：文字列を指定長まで空白で右パディング
 */
function _pad(str, len) {
  var s = String(str);
  while (s.length < len) s += ' ';
  return s;
}
