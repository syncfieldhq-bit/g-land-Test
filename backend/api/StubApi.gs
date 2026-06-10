/******************************************************************
 * G-WORLD Backend - Stub APIs (拡張余白)
 *
 * 【SECTION E-7】拡張余白用のスタブ関数群
 *
 * 設計意図【設計憲法・第3条】：
 *   - 将来モジュール用の関数を事前に宣言（インターフェース確定）
 *   - 現時点では「未実装」を返すだけだが、ROUTES に登録すれば
 *     即座にエンドポイントとして公開できる
 *   - 各関数の payload / meta シグネチャは本実装時にも維持される
 *
 * 動作タイミング：
 *   - 現状：ROUTES に登録されていないため、フロントから呼ばれることは無い
 *   - 将来：実装完了後、Router.gs の ROUTES に追記してエンドポイント公開
 *
 * 含まれる関数（9つ）：
 *   ── G-COMPETE モジュール ──
 *   - GCompete_create       : コンペ新規作成
 *   - GCompete_leaderboard  : リーダーボード取得
 *   - GCompete_lottery      : 抽選機能
 *
 *   ── G-TOWN モジュール ──
 *   - GTown_shopList        : 店舗一覧取得
 *   - GTown_pointAdd        : ポイント加算
 *   - GTown_pointHistory    : ポイント履歴取得
 *
 *   ── G-JUNIOR モジュール ──
 *   - GJunior_linkParent    : 親子アカウント連携
 *
 *   ── Admin 系 ──
 *   - Admin_setActiveCourse : アクティブコース変更
 *   - Admin_reset           : 運用リセット
 *
 * 【依存】
 *   なし（純粋なスタブ）
 *
 * 【ROUTES への登録手順（将来）】
 *   1. 該当関数を本ファイルで実装
 *   2. Router.gs の ROUTES オブジェクトに 'モジュール.動作': '関数名' を追加
 *   3. フロント側で GW.Core.Api.call('モジュール.動作', payload) を呼ぶだけ
 ******************************************************************/


// ════════════════════════════════════════════════════════════════
// 【G-COMPETE モジュール】コンペ運営機能
//
// 設計意図：
//   - 同じコースで複数組のラウンドを束ねる「コンペ」概念
//   - 抽選・組分け・リーダーボード集計を担当
//   - Players + History を参照し、comp_id でグルーピング
// ════════════════════════════════════════════════════════════════

/**
 * GCompete_create - コンペ新規作成
 *
 * 想定 payload:
 *   { name, date, courseId, organizer, maxGroups }
 *
 * 想定 出力:
 *   { ok, compId }
 */
function GCompete_create(payload, meta) {
  return { ok: false, error: 'GCompete is not implemented yet', code: 'E_NOT_IMPLEMENTED' };
}

/**
 * GCompete_leaderboard - リーダーボード取得
 *
 * 想定 payload:
 *   { compId, scope: 'all' | 'group' }
 *
 * 想定 出力:
 *   { ok, leaderboard: [{playerId, nickname, totalStroke, vsPar, rank}, ...] }
 */
function GCompete_leaderboard(payload, meta) {
  return { ok: false, error: 'GCompete is not implemented yet', code: 'E_NOT_IMPLEMENTED' };
}

/**
 * GCompete_lottery - 抽選機能
 *
 * 想定 payload:
 *   { compId, prizes: [{name, count}, ...] }
 *
 * 想定 出力:
 *   { ok, results: [{playerId, prize}, ...] }
 */
function GCompete_lottery(payload, meta) {
  return { ok: false, error: 'GCompete is not implemented yet', code: 'E_NOT_IMPLEMENTED' };
}


// ════════════════════════════════════════════════════════════════
// 【G-TOWN モジュール】地域連携機能
//
// 設計意図：
//   - ゴルフ場周辺の店舗（飲食・売店等）と連携
//   - プレイヤーへのポイント還元・履歴管理
//   - 地域経済とゴルフを結ぶ「趣味の経済圏」の中核
// ════════════════════════════════════════════════════════════════

/**
 * GTown_shopList - 店舗一覧取得
 *
 * 想定 payload:
 *   { area, category }
 *
 * 想定 出力:
 *   { ok, shops: [{shopId, name, category, ...}, ...] }
 */
function GTown_shopList(payload, meta) {
  return { ok: false, error: 'GTown is not implemented yet', code: 'E_NOT_IMPLEMENTED' };
}

/**
 * GTown_pointAdd - ポイント加算
 *
 * 想定 payload:
 *   { gwUserId, shopId, points, reason }
 *
 * 想定 出力:
 *   { ok, newTotal }
 */
function GTown_pointAdd(payload, meta) {
  return { ok: false, error: 'GTown is not implemented yet', code: 'E_NOT_IMPLEMENTED' };
}

/**
 * GTown_pointHistory - ポイント履歴取得
 *
 * 想定 payload:
 *   { gwUserId, period }
 *
 * 想定 出力:
 *   { ok, history: [...], total }
 */
function GTown_pointHistory(payload, meta) {
  return { ok: false, error: 'GTown is not implemented yet', code: 'E_NOT_IMPLEMENTED' };
}


// ════════════════════════════════════════════════════════════════
// 【G-JUNIOR モジュール】親子アカウント連携
//
// 設計意図：
//   - ジュニアゴルファー向けの保護者アカウント連携
//   - 子のスコアを親のマイページからも閲覧可能に
// ════════════════════════════════════════════════════════════════

/**
 * GJunior_linkParent - 親子アカウント連携
 *
 * 想定 payload:
 *   { childGwUserId, parentGwUserId, relationship }
 *
 * 想定 出力:
 *   { ok, linkId }
 */
function GJunior_linkParent(payload, meta) {
  return { ok: false, error: 'GJunior is not implemented yet', code: 'E_NOT_IMPLEMENTED' };
}


// ════════════════════════════════════════════════════════════════
// 【Admin 系】運用管理機能
//
// 設計意図：
//   - 運用者専用エンドポイント
//   - 本実装時は呼出元の権限チェックが必須（meta.gwUserId が admin リストに含まれるか等）
// ════════════════════════════════════════════════════════════════

/**
 * Admin_setActiveCourse - アクティブコース変更
 *
 * 想定 payload:
 *   { courseId, adminToken }
 *
 * 想定 出力:
 *   { ok, activeCourseId }
 */
function Admin_setActiveCourse(payload, meta) {
  return { ok: false, error: 'Admin is not implemented yet', code: 'E_NOT_IMPLEMENTED' };
}

/**
 * Admin_reset - 運用リセット
 *
 * 想定 payload:
 *   { target: 'scores' | 'history' | 'all', adminToken }
 *
 * 想定 出力:
 *   { ok, cleared }
 *
 * 注意：
 *   本実装時は二段階確認（adminToken + 物理キー入力）を必須とする
 */
function Admin_reset(payload, meta) {
  return { ok: false, error: 'Admin is not implemented yet', code: 'E_NOT_IMPLEMENTED' };
}
