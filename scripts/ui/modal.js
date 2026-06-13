/**
 * ═══════════════════════════════════════════════════════
 * scripts/ui/modal.js - モーダル管理（最小実装）
 *
 * 使い方:
 *   // 1. ID指定で表示/非表示
 *   import { showModal, hideModal } from './ui/modal.js';
 *   showModal('my-modal');
 *   hideModal('my-modal');
 *
 *   // 2. 確認ダイアログ（Promiseで結果が返る）
 *   import { confirm } from './ui/modal.js';
 *   const ok = await confirm('削除しますか？', '元に戻せません');
 *   if (ok) { ... }
 * ═══════════════════════════════════════════════════════
 */

const CONFIRM_MODAL_ID = 'gw-modal-confirm';

/**
 * 任意の ID のモーダルを表示
 */
export function showModal(modalId) {
  const el = document.getElementById(modalId);
  if (!el) {
    console.warn('[modal] not found:', modalId);
    return;
  }
  el.classList.add('show');
}

/**
 * 任意の ID のモーダルを閉じる
 */
export function hideModal(modalId) {
  const el = document.getElementById(modalId);
  if (el) el.classList.remove('show');
}

/**
 * 確認モーダル（Promise返却）
 *
 * @param {string} title - タイトル
 * @param {string} body - 本文（HTML可）
 * @returns {Promise<boolean>} OK で true、キャンセルで false
 */
export function confirm(title, body) {
  return new Promise((resolve) => {
    ensureConfirmModal();

    document.getElementById('gw-confirm-title').textContent = title;
    document.getElementById('gw-confirm-body').innerHTML = body || '';

    const okBtn = document.getElementById('gw-confirm-ok');
    const cancelBtn = document.getElementById('gw-confirm-cancel');

    const close = (result) => {
      hideModal(CONFIRM_MODAL_ID);
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      resolve(result);
    };
    const onOk = () => close(true);
    const onCancel = () => close(false);

    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);

    showModal(CONFIRM_MODAL_ID);
  });
}

/**
 * 確認モーダルの DOM が無ければ自動生成
 */
function ensureConfirmModal() {
  if (document.getElementById(CONFIRM_MODAL_ID)) return;

  const wrap = document.createElement('div');
  wrap.id = CONFIRM_MODAL_ID;
  wrap.className = 'modal-bg';
  wrap.innerHTML = `
    <div class="modal">
      <h3 id="gw-confirm-title">確認</h3>
      <div id="gw-confirm-body" class="modal-body"></div>
      <div class="modal-buttons">
        <button id="gw-confirm-cancel" class="btn-ghost">キャンセル</button>
        <button id="gw-confirm-ok" class="btn-primary">OK</button>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);
}

console.log('[ui/modal] loaded');
