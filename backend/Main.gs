/******************************************************************
 * G-WORLD Backend - Main Entry Point
 *
 * 【SECTION 3】Web App のエントリポイント
 *
 * 設計意図：
 *   - doPost は単一エントリ + action ルーター方式（ホワイトリスト）
 *   - 旧 funcName 形式も互換受付（既存データ移行期間中）
 *   - すべてのリクエストを events_YYYY_MM に自動記録（Router 経由）
 *
 * 含まれる関数：
 *   - doPost : フロントからの全リクエストを受ける単一エントリ
 *   - doGet  : HTMLサーブ + ヘルスチェック等の GET アクション
 *
 * 【Apps Script の重要制約】
 *   doPost / doGet は1プロジェクト内に1つしか存在できない。
 *   本ファイル以外に同名関数があると Web App として動作しない。
 *
 * 【依存】
 *   - Router.gs                     : _routeAction / _routeLegacyFuncName
 *   - services_MigrationService.gs  : _ensureAllSheets（doGet で使用）
 *   - utils_Utils.gs                : _jsonResponse
 *   - config_Config.gs              : APP_VERSION, API_VERSION
 ******************************************************************/


// ════════════════════════════════════════════════════════════════
// 【doPost - フロントからの全リクエストを受ける単一エントリ】
//
// リクエスト形式（新）:
//   { action: 'gland.saveScore', payload: {...}, apiVersion: 'v1', meta: {...} }
//
// リクエスト形式（旧・互換）:
//   { funcName: 'updateScore', args: [...] }
//
// レスポンス形式：
//   常に JSON。新形式は ok フィールド、旧形式は success フィールドを返す。
// ════════════════════════════════════════════════════════════════

/**
 * doPost - Web App の POST エンドポイント
 *
 * @param {Object} e - Apps Script の event オブジェクト
 * @returns {TextOutput} JSON レスポンス
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


// ════════════════════════════════════════════════════════════════
// 【doGet - HTML サーブ + ヘルスチェック等の GET アクション】
//
// 設計意図：
//   - GitHub Pages や独自ホスティングで配信する場合、この doGet は呼ばれない
//   - GAS の Web App としても配信できるようにフォールバック実装
//   - フロントは GAS_URL に POST するため、ここでは最小限のみ実装
// ════════════════════════════════════════════════════════════════

/**
 * doGet - Web App の GET エンドポイント
 *
 * @param {Object} e - Apps Script の event オブジェクト
 * @returns {HtmlOutput|TextOutput}
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
