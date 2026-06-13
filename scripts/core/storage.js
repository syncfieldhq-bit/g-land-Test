/**
 * ═══════════════════════════════════════════════════════
 * scripts/core/storage.js - データ永続化レイヤ（Phase 5 拡張版）
 *
 * 役割：
 *   - localStorage の薄いラッパー（基本 get/set）
 *   - 進行中ラウンドの自動保存・復元（Round Draft）
 *   - 完了済みラウンドの履歴管理（Round History）
 *
 * 設計原則：
 *   - すべてのデータ I/O はこのモジュール経由（GAS 連携への布石）
 *   - 失敗しても例外を投げず、デフォルト値で復帰
 *   - JSON シリアライズで型崩れを防ぐ
 * ═══════════════════════════════════════════════════════
 */

import { STORAGE_KEYS } from './config.js';

// ─── 追加するキーをここで一元管理 ───
const KEYS = {
  ...STORAGE_KEYS,
  ROUND_DRAFT: 'gw_round_draft',  // 進行中ラウンドの一時保存
};

export const Store = {

  // ═══════════════════════════════════════════
  // 基本 I/O（Phase 1 から維持）
  // ═══════════════════════════════════════════

  getStr(key, defaultValue = null) {
    try {
      return localStorage.getItem(key) ?? defaultValue;
    } catch (e) {
      return defaultValue;
    }
  },

  setStr(key, value) {
    try {
      localStorage.setItem(key, String(value));
      return true;
    } catch (e) {
      console.warn('[Store] setStr failed:', e);
      return false;
    }
  },

  get(key, defaultValue = null) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return defaultValue;
      return JSON.parse(raw);
    } catch (e) {
      return defaultValue;
    }
  },

  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn('[Store] set failed:', e);
      return false;
    }
  },

  remove(key) {
    try { localStorage.removeItem(key); } catch (e) {}
  },

  clear() {
    try { localStorage.clear(); } catch (e) {}
  },

  // ═══════════════════════════════════════════
  // 🆕 Phase 5：ラウンド永続化 API
  // ═══════════════════════════════════════════

  /**
   * 進行中ラウンドのドラフト保存
   * 「アプリを閉じても、次に開いた時に続きから入力できる」ための保存
   *
   * @param {Object} draft - { courseId, variant, totalHoles, currentHole, players, savedAt }
   */
  saveRoundDraft(draft) {
    if (!draft || !draft.courseId) return false;
    return this.set(KEYS.ROUND_DRAFT, {
      ...draft,
      savedAt: Date.now()
    });
  },

  /**
   * 進行中ラウンドのドラフト読み込み
   * @returns {Object|null} ドラフトがあれば返す、なければ null
   */
  loadRoundDraft() {
    const draft = this.get(KEYS.ROUND_DRAFT);
    if (!draft || !draft.courseId) return null;
    return draft;
  },

  /**
   * 進行中ラウンドのドラフトを削除（ラウンド終了時）
   */
  clearRoundDraft() {
    this.remove(KEYS.ROUND_DRAFT);
  },

  /**
   * 完了済みラウンドを履歴に追加
   *
   * @param {Object} round - { date, course, variant, total, diff, players? }
   * @returns {Array} 更新後の履歴配列
   */
  appendRound(round) {
    if (!round) return [];
    const history = this.get(KEYS.RECENT_ROUNDS, []) || [];
    history.unshift({
      ...round,
      savedAt: Date.now()
    });
    // 直近30ラウンドのみ保持
    const trimmed = history.slice(0, 30);
    this.set(KEYS.RECENT_ROUNDS, trimmed);
    return trimmed;
  },

  /**
   * 全ラウンド履歴を取得
   * @returns {Array} 履歴配列（新しい順）
   */
  getRoundHistory() {
    return this.get(KEYS.RECENT_ROUNDS, []) || [];
  },

  /**
   * 履歴を全消去
   */
  clearRoundHistory() {
    this.remove(KEYS.RECENT_ROUNDS);
  },

  // ═══════════════════════════════════════════
  // デバッグ用
  // ═══════════════════════════════════════════

  /** 現在の保存状況を一覧表示（コンソール用） */
  inspect() {
    return {
      profile: this.get(STORAGE_KEYS.PROFILE),
      inputMode: this.getStr(STORAGE_KEYS.INPUT_MODE),
      puttMode: this.getStr(STORAGE_KEYS.PUTT_MODE),
      roundDraft: this.loadRoundDraft(),
      historyCount: this.getRoundHistory().length
    };
  }
};

console.log('[core/storage] loaded (Phase 5: round persistence enabled)');
