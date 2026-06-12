/**
 * ═══════════════════════════════════════════════════════
 * scripts/core/state.js - アプリ全体の状態管理（シングルトン）
 * ═══════════════════════════════════════════════════════
 */

import { Store } from './storage.js';
import { STORAGE_KEYS } from './config.js';

export const State = {
  // ─── 永続化される状態 ───
  profile: null,         // { nickname, realname, registeredAt }
  inputMode: 'simple',   // 'simple' | 'counter'
  puttMode: 'off',       // 'on' | 'off'

  // ─── セッション中だけの状態 ───
  currentRoute: 'home',
  currentHole: 1,
  totalHoles: 18,
  courseId: null,
  variant: null,
  players: [],           // [{ id, name, scores, shots, putts, isMe }]

  /** localStorage から状態を読み込んで初期化 */
  init() {
    this.profile = Store.get(STORAGE_KEYS.PROFILE, null);
    this.inputMode = Store.getStr(STORAGE_KEYS.INPUT_MODE, 'simple');
    this.puttMode = Store.getStr(STORAGE_KEYS.PUTT_MODE, 'off');
    console.log('[State] initialized');
  },

  /** プロファイルを保存 */
  saveProfile(profile) {
    this.profile = profile;
    Store.set(STORAGE_KEYS.PROFILE, profile);
  },

  /** 入力モードを保存 */
  saveInputMode(mode) {
    this.inputMode = mode;
    Store.setStr(STORAGE_KEYS.INPUT_MODE, mode);
  },

  /** パットモードを保存 */
  savePuttMode(mode) {
    this.puttMode = mode;
    Store.setStr(STORAGE_KEYS.PUTT_MODE, mode);
  },

  /** デバッグ用：現在の状態をスナップショット */
  snapshot() {
    return {
      profile: this.profile,
      inputMode: this.inputMode,
      puttMode: this.puttMode,
      currentRoute: this.currentRoute,
      players: this.players.length
    };
  },

  /** 全リセット（ログアウト） */
  reset() {
    Store.clear();
    this.profile = null;
    this.inputMode = 'simple';
    this.puttMode = 'off';
    this.currentRoute = 'home';
    this.courseId = null;
    this.variant = null;
    this.players = [];
  }
};

console.log('[core/state] loaded');
