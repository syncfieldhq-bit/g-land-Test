/**
 * ═══════════════════════════════════════════════════════
 * scripts/core/config.js - アプリ全体の定数
 * ═══════════════════════════════════════════════════════
 */

export const CONFIG = {
  /** アプリバージョン */
  APP_VERSION: '3.0.0-phase1',

  /** GAS Web App URL（Phase 4 以降で使用） */
  GAS_URL: 'https://script.google.com/macros/s/AKfycbyJbjVYmqATkJe2Ial5XOK_CYXCfkPWEIpKOtZziwDQ490l-AfNNF43gwls20y1N2FHgg/exec',

  /** API バージョン */
  API_VERSION: 'v1',

  /** キャッシュ有効期間（24時間） */
  CACHE_TTL_MS: 24 * 60 * 60 * 1000
};

/** localStorage キー一覧 */
export const STORAGE_KEYS = {
  PROFILE: 'gw_profile',
  INPUT_MODE: 'gw_input_mode',
  PUTT_MODE: 'gw_putt_mode',
  RECENT_ROUNDS: 'gw_recent_rounds',
  DEVICE_ID: 'gw_device_id'
};

/** PAR表（六甲国際パブリック想定） */
export const PARS = [4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4, 4];

/** PAR 取得ヘルパー */
export function getPar(hole) {
  if (hole < 1 || hole > 18) return 4;
  return PARS[hole - 1];
}

console.log('[core/config] loaded, version:', CONFIG.APP_VERSION);
