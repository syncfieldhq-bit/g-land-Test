/******************************************************************
 * G-WORLD Backend - Configuration & Constants
 *
 * 【SECTION 1】設定・定数の中央管理
 *
 * 設計意図：
 *   - プロジェクト全体で参照される定数を一箇所に集約
 *   - 環境変更（本番／検証）はこのファイルの差し替えだけで完結
 *   - 全 const はプロジェクト全体のグローバル定数として参照可能
 *   - シート名・ID・バージョン等のリテラル散在を防止
 *
 * 含まれる定数：
 *   - SS_ID                : スプレッドシートID（自動取得）
 *   - API_VERSION          : APIバージョン（フロントとの整合確認）
 *   - APP_VERSION          : アプリバージョン（デバッグ・表示用）
 *   - LOCK_WAIT_MS         : LockService の最大待機時間
 *   - SHEET_IDENTITY       : identity シート名
 *   - SHEET_BACKUP_LINKS   : backup_links シート名
 *   - SHEET_COURSES        : Courses シート名
 *   - SHEET_PLAYERS        : Players シート名
 *   - SHEET_SCORES         : Scores シート名
 *   - SHEET_CONFIG         : Config シート名
 *   - SHEET_HISTORY        : History シート名
 *   - EVENTS_SHEET_PREFIX  : events_YYYY_MM の接頭辞
 *
 * 【呼出元】
 *   - ほぼ全ファイル
 ******************************************************************/


// ════════════════════════════════════════════════════════════════
// 【基礎設定】
// ════════════════════════════════════════════════════════════════

/**
 * スプレッドシートID（アクティブなものを使用）
 *
 * 注意：
 *   この行は Apps Script がスプレッドシートにバインドされている前提。
 *   将来、独立した Web App としてデプロイする場合は、ハードコードされた
 *   ID（'1abc...XYZ'）に書き換える必要がある。
 */
const SS_ID = SpreadsheetApp.getActiveSpreadsheet().getId();

/**
 * APIバージョン（フロントとの整合確認に使用）
 *   - フロント側 GW.Core.Config.API_VERSION と一致させる
 */
const API_VERSION = 'v1';

/**
 * アプリバージョン（デバッグ用・表示用）
 *   - リリース時にここを bump し、Service Worker の CACHE_VERSION も連動
 */
const APP_VERSION = '1.0.0';

/**
 * LockService の最大待機時間（ms）
 *   - GAS制限回避のため短めに（3秒）
 *   - 同時書込みが衝突した場合、ロック取得に3秒かけて諦める
 *   - 諦めた場合は呼出元で catch されて、ユーザーには再試行を促す
 */
const LOCK_WAIT_MS = 3000;


// ════════════════════════════════════════════════════════════════
// 【シート名定義】
//
// 設計意図：
//   全てのシート名をここで定数化し、タイプミスによるバグを防止。
//   将来シート名を変更する場合は、ここを書き換えるだけで全コードが追従。
// ════════════════════════════════════════════════════════════════

// ── ★ G-WORLD 新規シート（GW_USER_ID 関連） ──
const SHEET_IDENTITY     = 'identity';      // GW_USER_ID マスタ
const SHEET_BACKUP_LINKS = 'backup_links';  // ゲスト→保全済み 移行履歴

// ── ★ G-LAND 既存シート（データ保全のため列追加のみ） ──
const SHEET_COURSES = 'Courses';
const SHEET_PLAYERS = 'Players';
const SHEET_SCORES  = 'Scores';
const SHEET_CONFIG  = 'Config';
const SHEET_HISTORY = 'History';

// ── ★ events_YYYY_MM は動的生成（月次ローテーション） ──
const EVENTS_SHEET_PREFIX = 'events_';


// ════════════════════════════════════════════════════════════════
// 【拡張余白】将来モジュール用シート定数
//
// 設計意図：
//   将来 GCompete / GTown / GJunior を実装する際に有効化する。
//   今は宣言だけ用意（コメントアウト）し、設計の意図を残す。
// ════════════════════════════════════════════════════════════════

/* ── 将来モジュール用シート（実装時にコメント解除）──
const SHEET_GCOMPETE_ROUNDS = 'gcompete_rounds';
const SHEET_GCOMPETE_GROUPS = 'gcompete_groups';
const SHEET_GTOWN_SHOPS     = 'gtown_shops';
const SHEET_GTOWN_POINTS    = 'gtown_points';
const SHEET_GJUNIOR_LINKS   = 'gjunior_links';
─────────────────────────────────────────────── */
