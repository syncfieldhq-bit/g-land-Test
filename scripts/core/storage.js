// =============================================================
// storage.js - localStorage ラッパー（Phase 7 完全版）
// 全データI/Oをここに集約。将来のGAS連携も同じAPI経由でOK。
// =============================================================
import { STORAGE_KEYS } from './constants.js';

// --- 低レベルAPI ---
function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    console.warn('[Store] read failed:', key, e);
    return fallback;
  }
}
function writeJSON(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch (e) {
    console.warn('[Store] write failed:', key, e);
    return false;
  }
}

// --- プロフィール ---
export function getProfile() {
  return readJSON(STORAGE_KEYS.PROFILE, null);
}
export function saveProfile(profile) {
  return writeJSON(STORAGE_KEYS.PROFILE, profile);
}
export function clearProfile() {
  localStorage.removeItem(STORAGE_KEYS.PROFILE);
}

// --- 設定 ---
export function getSettings() {
  return readJSON(STORAGE_KEYS.SETTINGS, {
    inputMode: 'simple',
    displayMode: 'number',
    puttEnabled: false,
    isPublic: true,
  });
}
export function saveSettings(settings) {
  return writeJSON(STORAGE_KEYS.SETTINGS, settings);
}
export function updateSetting(key, value) {
  const s = getSettings();
  s[key] = value;
  return saveSettings(s);
}

// --- ラウンド進行中ドラフト ---
export function getRoundDraft() {
  return readJSON(STORAGE_KEYS.ROUND_DRAFT, null);
}
export function saveRoundDraft(draft) {
  draft.updatedAt = Date.now();
  return writeJSON(STORAGE_KEYS.ROUND_DRAFT, draft);
}
export function clearRoundDraft() {
  localStorage.removeItem(STORAGE_KEYS.ROUND_DRAFT);
}

// --- ラウンド履歴 ---
export function getRoundHistory() {
  return readJSON(STORAGE_KEYS.ROUND_HISTORY, []);
}
export function appendRound(round) {
  const history = getRoundHistory();
  round.id = round.id || `r_${Date.now()}`;
  round.savedAt = Date.now();
  history.unshift(round);
  // 直近50件のみ保持
  if (history.length > 50) history.length = 50;
  return writeJSON(STORAGE_KEYS.ROUND_HISTORY, history);
}
export function clearRoundHistory() {
  localStorage.removeItem(STORAGE_KEYS.ROUND_HISTORY);
}

// --- グループ（コンペ）情報 ---
export function getGroup() {
  return readJSON(STORAGE_KEYS.GROUP, null);
}
export function saveGroup(group) {
  return writeJSON(STORAGE_KEYS.GROUP, group);
}
export function clearGroup() {
  localStorage.removeItem(STORAGE_KEYS.GROUP);
}

// --- デバッグ用 ---
export function inspect() {
  return {
    profile: getProfile(),
    settings: getSettings(),
    draft: getRoundDraft(),
    history: getRoundHistory(),
    group: getGroup(),
  };
}
