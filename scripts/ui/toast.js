/**
 * ═══════════════════════════════════════════════════════
 * scripts/ui/toast.js - 通知トースト（最小実装）
 *
 * 使い方:
 *   import { toast } from './ui/toast.js';
 *   toast('保存しました');
 *   toast('エラーです', { type: 'error', duration: 3000 });
 * ═══════════════════════════════════════════════════════
 */

const TOAST_ID = 'gw-toast';
let _timer = null;

/**
 * Toast の DOM要素を取得（なければ自動生成）
 */
function ensureToastElement() {
  let el = document.getElementById(TOAST_ID);
  if (!el) {
    el = document.createElement('div');
    el.id = TOAST_ID;
    el.className = 'toast';
    document.body.appendChild(el);
  }
  return el;
}

/**
 * トーストを表示
 *
 * @param {string} message - 表示するメッセージ
 * @param {Object} [opts]
 * @param {('info'|'success'|'error')} [opts.type='info'] - 種類（CSSクラスが付与される）
 * @param {number} [opts.duration=2000] - 表示時間（ミリ秒）
 */
export function toast(message, opts = {}) {
  const { type = 'info', duration = 2000 } = opts;
  const el = ensureToastElement();

  // CSSクラスをリセット
  el.className = 'toast toast--' + type + ' show';
  el.textContent = message;

  // 既存のタイマーをクリア
  if (_timer) clearTimeout(_timer);

  // 一定時間後に非表示
  _timer = setTimeout(() => {
    el.classList.remove('show');
    _timer = null;
  }, duration);
}

/**
 * トーストを即座に閉じる
 */
export function hideToast() {
  const el = document.getElementById(TOAST_ID);
  if (el) el.classList.remove('show');
  if (_timer) {
    clearTimeout(_timer);
    _timer = null;
  }
}

console.log('[ui/toast] loaded');
