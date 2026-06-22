/* =============================================================
 * G-WORLD v70 — main.gs (エントリ / インクルード / DB初期化)
 *
 * v70 爆速化：
 *  - doGet キャッシュ最適化 (webAppUrl は ScriptApp 呼出のキャッシュ化)
 *  - HTML テンプレートを 1パス評価 → 余計な scriptlet 評価を排除
 *  - 機能・スキーマは v69 完全互換 (Users / Rounds / Scores / Log)
 * ============================================================= */

const PROP_KEY_SS_ID = 'G_WORLD_SS_ID_V52';   /* DB スキーマは互換維持 */
const SS_NAME        = 'G-WORLD DB v52';
const PROP_KEY_WEB_URL = 'G_WORLD_WEB_URL_V70';

const SHEET = { USERS:'Users', ROUNDS:'Rounds', SCORES:'Scores', LOG:'Log' };
const APP_META = { title:'G-WORLD', version:'v70.0', course:'六甲国際パブリックコース' };

/* ---------- doGet : 画面ロード爆速化 ---------- */
function doGet(e) {
  ensureDatabase_();
  const tmpl = HtmlService.createTemplateFromFile('index');
  tmpl.appMeta   = APP_META;
  tmpl.joinId    = (e && e.parameter && e.parameter.join) || '';
  tmpl.webAppUrl = _getWebAppUrlCached_();
  return tmpl.evaluate()
    .setTitle(APP_META.title + ' ' + APP_META.version)
    .addMetaTag('viewport',
      'width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no,viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * ScriptApp.getService().getUrl() は内部的に重いので
 * Script Properties にキャッシュして再利用する。
 */
function _getWebAppUrlCached_() {
  const props = PropertiesService.getScriptProperties();
  let url = props.getProperty(PROP_KEY_WEB_URL);
  if (url) return url;
  try {
    url = ScriptApp.getService().getUrl() || '';
    if (url) props.setProperty(PROP_KEY_WEB_URL, url);
  } catch (_) { url = ''; }
  return url;
}

/* ---------- include : サブテンプレ展開 ---------- */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/* ---------- DB 初期化 (v69 互換 : familyKana 列を含む) ---------- */
function ensureDatabase_() {
  const props = PropertiesService.getScriptProperties();
  let ssId = props.getProperty(PROP_KEY_SS_ID);
  if (ssId) { try { SpreadsheetApp.openById(ssId); return ssId; } catch(_) {} }
  const ss = SpreadsheetApp.create(SS_NAME);
  ssId = ss.getId();
  props.setProperty(PROP_KEY_SS_ID, ssId);
  const first = ss.getSheets()[0];
  first.setName(SHEET.USERS);
  first.appendRow(['userId','nickname','familyName','familyKana','firstName','courseAdjust','createdAt','updatedAt']);
  ss.insertSheet(SHEET.ROUNDS).appendRow(
    ['roundId','groupId','ownerUserId','courseName','tee','holeMode','inputMode',
     'scoreMode','lockerNo','startedAt','finishedAt','status']);
  ss.insertSheet(SHEET.SCORES).appendRow(
    ['roundId','playerName','playerType','holeNo','par','stroke','putt','updatedAt']);
  ss.insertSheet(SHEET.LOG).appendRow(['ts','event','payload']);
  return ssId;
}

/* ---------- DB ハンドル (リクエスト内キャッシュ) ---------- */
let _dbCache_ = null;
function _db() {
  if (_dbCache_) return _dbCache_;
  const id = PropertiesService.getScriptProperties().getProperty(PROP_KEY_SS_ID) || ensureDatabase_();
  _dbCache_ = SpreadsheetApp.openById(id);
  return _dbCache_;
}

/* ---------- デバッグ ---------- */
function debugResetDB() {
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty(PROP_KEY_SS_ID);
  props.deleteProperty(PROP_KEY_WEB_URL);
  _dbCache_ = null;
  ensureDatabase_();
}
function debugWriteTest() {
  const r = apiSaveScore('R-TEST', '佐藤', 'me', 1, 4, 5, 2);
  Logger.log(JSON.stringify(r));
}
function debugVerifyKana() {
  Logger.log('========== v70 ふりがな実装確認 ==========');
  try {
    const indexHtml = HtmlService.createHtmlOutputFromFile('index').getContent();
    Logger.log('index ファイルサイズ: ' + indexHtml.length + ' bytes');
    Logger.log('「regKana」を含む?: ' + indexHtml.includes('regKana'));
    Logger.log('「cmpKana」を含む?: ' + indexHtml.includes('cmpKana'));
    Logger.log('「ふりがな」を含む?: ' + indexHtml.includes('ふりがな'));
  } catch (err) {
    Logger.log('index ファイル読込エラー: ' + err);
  }
  Logger.log('==========================================');
}
