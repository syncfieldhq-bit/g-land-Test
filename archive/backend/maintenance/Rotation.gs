/******************************************************************
 * G-WORLD Backend - Maintenance: Rotation & Migration
 *
 * 【SECTION E-3〜E-6】月次運用・既存データ救済ツール群
 *
 * 設計意図【設計憲法・第2条】：
 *   - 月次ローテーション運用でスプレッドシート肥大化を防止
 *   - 既存データを GW_USER_ID 体系へ段階的に救済
 *   - 整合性確認で運用中の異常を早期発見
 *
 * 含まれる関数（4つ）：
 *   - rotateMonthlyEvents       : 月次トリガーで来月分の events シートを事前作成
 *   - migrateExistingPlayers    : 既存 Players の gw_user_id 列を一括補完
 *   - verifyDataIntegrity       : Players / Scores / History 間の整合性確認
 *   - purgeOldGuestIdentities   : 1年以上未使用のゲストIDを掃除（任意）
 *
 * 【実行方法】
 *   - rotateMonthlyEvents     : 時刻トリガー（毎月25日 03:00）推奨
 *   - migrateExistingPlayers  : 手動で1回だけ実行
 *   - verifyDataIntegrity     : 必要時に手動実行
 *   - purgeOldGuestIdentities : 手動実行（半年〜1年に1回）
 *
 * 【依存】
 *   - services_SheetService.gs    : _sheet, _headerMap
 *   - services_MigrationService.gs : _ensureEventsSheet
 *   - utils_Utils.gs              : _yyyyMm
 *   - config_Config.gs            : SS_ID, SHEET_PLAYERS, SHEET_SCORES,
 *                                   SHEET_HISTORY, SHEET_IDENTITY,
 *                                   EVENTS_SHEET_PREFIX
 ******************************************************************/


// ════════════════════════════════════════════════════════════════
// 【SECTION E-3】★ rotateMonthlyEvents - 月次ローテーション運用
//
// 設計意図：
//   - 月末に来月分の events シートを事前作成しておく
//   - GAS の時刻トリガーから毎月25日頃に起動させる想定
//   - 月初の初回アクセスで _ensureEventsSheet が自動作成するため、
//     本関数は「保険」的な位置付け（事前準備）
//
// 【トリガー設定手順】
//   1. Apps Script エディタ → 左サイドバーの「トリガー」⏰
//   2. 「トリガーを追加」
//   3. 実行する関数: rotateMonthlyEvents
//   4. イベントのソース: 時間主導型
//   5. 時間ベースのトリガー: 月タイマー
//   6. 日付: 25日
//   7. 時刻: 午前3〜4時
// ════════════════════════════════════════════════════════════════

/**
 * 月次ローテーション
 *   - 来月分の events_YYYY_MM シートを事前作成
 *   - 当月分も念のため確認
 *
 * 【手動実行も可能】
 *   Apps Script エディタで関数選択 → 「実行」で即座に動作
 */
function rotateMonthlyEvents() {
  console.log('[Rotation] 月次ローテーション開始');

  // ── 1) 当月分を確認（無ければ作成） ──
  var thisMonth = _yyyyMm();
  _ensureEventsSheet(thisMonth);
  console.log('[Rotation] ✅ 当月シート確認: events_' + thisMonth);

  // ── 2) 来月分を事前作成 ──
  var nextMonth = _calcNextYyyyMm();
  _ensureEventsSheet(nextMonth);
  console.log('[Rotation] ✅ 来月シート準備: events_' + nextMonth);

  // ── 3) 古いシートの行数を集計（容量監視） ──
  var ss = SpreadsheetApp.openById(SS_ID);
  var allSheets = ss.getSheets();
  var totalRows = 0;
  var eventSheetCount = 0;
  for (var i = 0; i < allSheets.length; i++) {
    var s = allSheets[i];
    if (s.getName().indexOf(EVENTS_SHEET_PREFIX) === 0) {
      var lr = s.getLastRow();
      totalRows += lr;
      eventSheetCount++;
      console.log('[Rotation]   - ' + s.getName() + ': ' + lr + ' 行');
    }
  }
  console.log('[Rotation] events 系シート: ' + eventSheetCount + ' 個 / 合計 ' + totalRows + ' 行');
  console.log('[Rotation] ✅ ローテーション完了');

  return {
    ok: true,
    thisMonth: thisMonth,
    nextMonth: nextMonth,
    eventSheetCount: eventSheetCount,
    totalEventRows: totalRows
  };
}

/**
 * 翌月の YYYY_MM 形式を算出
 *   - タイムゾーンはスクリプト設定（既定 Asia/Tokyo）に従う
 */
function _calcNextYyyyMm() {
  var d = new Date();
  d.setMonth(d.getMonth() + 1);
  var tz = Session.getScriptTimeZone() || 'Asia/Tokyo';
  return Utilities.formatDate(d, tz, 'yyyy_MM');
}


// ════════════════════════════════════════════════════════════════
// 【SECTION E-4】★ migrateExistingPlayers - 既存 Players の一括補完
//
// 設計意図【既存データ救済】：
//   - v4.7 時代の Players には gw_user_id 列が存在しなかった
//   - 本関数は既存プレイヤーに新規 GW-G-* IDを発行して紐付ける
//   - identity シートにも対