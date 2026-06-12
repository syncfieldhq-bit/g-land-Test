/**
 * ═══════════════════════════════════════════════════════
 * scripts/core/storage.js - localStorage 抽象化
 * ═══════════════════════════════════════════════════════
 */

export const Store = {
  /** 文字列を取得 */
  getStr(key, defaultValue = null) {
    try {
      return localStorage.getItem(key) ?? defaultValue;
    } catch (e) {
      return defaultValue;
    }
  },

  /** 文字列を保存 */
  setStr(key, value) {
    try {
      localStorage.setItem(key, String(value));
      return true;
    } catch (e) {
      console.warn('[Store] setStr failed:', e);
      return false;
    }
  },

  /** JSON を取得（オブジェクト・配列など） */
  get(key, defaultValue = null) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return defaultValue;
      return JSON.parse(raw);
    } catch (e) {
      return defaultValue;
    }
  },

  /** JSON を保存 */
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn('[Store] set failed:', e);
      return false;
    }
  },

  /** 削除 */
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {}
  },

  /** 全削除（ログアウト等で使用） */
  clear() {
    try {
      localStorage.clear();
    } catch (e) {}
  }
};

console.log('[core/storage] loaded');
