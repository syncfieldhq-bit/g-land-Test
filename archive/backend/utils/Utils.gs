/******************************************************************
 * G-WORLD Backend - Utilities
 *
 * 【SECTION 5】共通ユーティリティ
 *
 * 設計意図：
 *   - ドメインに依存しない汎用関数の集約
 *   - 全レイヤー（API / Repository / Service）から呼ばれる
 *   - 1つでも変更があれば波及範囲が大きいため、機能追加は慎重に
 *
 * 含まれる関数（5つ）：
 *   - _jsonResponse        : JSON 形式の HTTP レスポンス生成
 *   - _safeLogEvent        : _logEvent の try/catch ラッパー
 *   - _trimPayloadForLog   : イベントログ用にペイロードを軽量化
 *   - _uuid                : UUID ライクな一意 ID 生成（プレフィックス付き）
 *   - _today               : 今日の日付（YYYY-MM-DD）
 *   - _yyyyMm              : 現在の年月（YYYY_MM、events_*シート名用）
 *
 * 【依存】
 *   - services_EventLogService.gs : _logEvent
 *
 * 【呼出元】
 *   - Main.gs                       : _jsonResponse（doPost / doGet）
 *   - Router.gs                     : _jsonResponse / _safeLogEvent / _trimPayloadForLog
 *   - api_GolfApi.gs                : _today
 *   - api_GolfHistoryApi.gs         : _uuid / _today
 *   - repositories_GolfRepository.gs       : _today
 *   - repositories_BackupRepository.gs     : _uuid
 *   - services_EventLogService.gs   : _uuid / _yyyyMm
 *   - services_MigrationService.gs  : _yyyyMm
 ******************************************************************/


// ════════════════════════════════════════════════════════════════
// 【HTTP レスポンス生成】
// ════════════════════════════════════════════════════════════════

/**
 * JSON レスポンスを返す
 *   - doPost / Router の最終出力はすべてここを経由
 *   - Content-Type: application/json を必ず設定
 *
 * @param {Object} obj - 返却するオブジェクト
 * @returns {TextOutput}
 */
function _jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}


// ════════════════════════════════════════════════════════════════
// 【イベントログ ラッパー】
// ════════════════════════════════════════════════════════════════

/**
 * イベントログ記録の安全ラッパー
 *   - エラーが出てもアプリ全体を止めないため、try/catch で包む
 *   - 本体は services_EventLogService.gs の _logEvent
 *
 * 設計意図：
 *   ログ記録の失敗は致命的ではない（ユーザー操作には影響しない）。
 *   そのため _logEvent が例外を投げても呼出側（Router）には伝播させず、
 *   コンソールに警告を残すだけで処理を続行する。
 *
 * @param {Object} payload - _logEvent と同じ形式
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
 *
 * 設計意図：
 *   events_YYYY_MM シートは長期保存される。本名やニックネームを
 *   ログに含めるとプライバシー漏洩のリスクとなるため、明示的に
 *   許可されたフィールドのみを抽出するホワイトリスト方式とする。
 *
 * @param {Object} payload - リクエストペイロード（元のまま）
 * @returns {Object} ログ用に軽量化されたペイロード
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


// ════════════════════════════════════════════════════════════════
// 【ID 生成】
// ════════════════════════════════════════════════════════════════

/**
 * UUIDライクな一意ID生成
 *   - GAS の Utilities.getUuid() を活用（衝突可能性ゼロ）
 *   - プレフィックスでドメインを明示（'H'=History, 'E'=Event, 'L'=Link 等）
 *   - 出力例: 'H-A1B2C3D4'
 *
 * @param {string} [prefix='H'] - ID プレフィックス
 * @returns {string}
 */
function _uuid(prefix) {
  return (prefix || 'H') + '-' + Utilities.getUuid().split('-')[0].toUpperCase();
}


// ════════════════════════════════════════════════════════════════
// 【日付フォーマット】
// ════════════════════════════════════════════════════════════════

/**
 * 今日の日付（YYYY-MM-DD）
 *   - タイムゾーンはスクリプトの設定（既定 Asia/Tokyo）に従う
 *   - Scores.date / History.play_date に使用
 *
 * @returns {string} 'YYYY-MM-DD'
 */
function _today() {
  var d = new Date();
  var tz = Session.getScriptTimeZone() || 'Asia/Tokyo';
  return Utilities.formatDate(d, tz, 'yyyy-MM-dd');
}

/**
 * 現在の年月（YYYY_MM、events_*シート名用）
 *   - events_YYYY_MM シートの月次ローテーション用
 *   - ハイフンではなくアンダースコア区切り（シート名規約）
 *
 * @returns {string} 'YYYY_MM'
 */
function _yyyyMm() {
  var d = new Date();
  var tz = Session.getScriptTimeZone() || 'Asia/Tokyo';
  return Utilities.formatDate(d, tz, 'yyyy_MM');
}
