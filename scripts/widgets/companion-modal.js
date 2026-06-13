/**
 * ═══════════════════════════════════════════════════════
 * scripts/widgets/companion-modal.js - 同伴者名編集モーダル
 *
 * 役割：
 *   - 名前入力ポップアップを開閉
 *   - 新規追加 / 既存編集 / 削除 の3モードに対応
 *   - 自分（isMe=true）の名前変更にも対応（プロファイルも同期）
 *
 * 使い方：
 *   import { openCompanionModal } from './widgets/companion-modal.js';
 *
 *   // 新規追加
 *   openCompanionModal({ mode: 'add', onSave: (name) => { ... } });
 *
 *   // 既存編集
 *   openCompanionModal({
 *     mode: 'edit',
 *     player: { id, name, isMe },
 *     onSave: (name) => { ... },
 *     onDelete: () => { ... }
 *   });
 * ═══════════════════════════════════════════════════════
 */

import { toast } from '../ui/toast.js';

const MODAL_ID = 'gw-companion-modal';

/**
 * モーダルの DOM が無ければ自動生成
 */
function ensureModal() {
  if (document.getElementById(MODAL_ID)) return;

  const wrap = document.createElement('div');
  wrap.id = MODAL_ID;
  wrap.className = 'modal-bg';
  wrap.innerHTML = `
    <div class="modal companion-modal">
      <div class="companion-icon">👥</div>
      <h3 id="companion-modal-title">同伴者を追加</h3>
      <p id="companion-modal-desc" class="modal-body">
        お名前を入力してください
      </p>
      <input
        type="text"
        id="companion-modal-input"
        placeholder="例: 田中さん"
        maxlength="20"
        autocomplete="off">
      <div class="modal-buttons">
        <button id="companion-modal-cancel" class="btn-ghost">キャンセル</button>
        <button id="companion-modal-save" class="btn-primary">確定</button>
      </div>
      <button id="companion-modal-delete" class="btn-delete hidden">
        🗑 この同伴者を削除
      </button>
    </div>
  `;
  document.body.appendChild(wrap);
}

/**
 * モーダルを開く
 *
 * @param {Object} opts
 * @param {'add'|'edit'} opts.mode - 新規追加か編集か
 * @param {Object} [opts.player] - 編集時のプレイヤー情報 { id, name, isMe }
 * @param {Function} opts.onSave - 保存時のコールバック (name) => void
 * @param {Function} [opts.onDelete] - 削除時のコールバック（編集モードのみ）
 */
export function openCompanionModal(opts = {}) {
  ensureModal();
  const { mode = 'add', player = null, onSave, onDelete } = opts;

  const modal = document.getElementById(MODAL_ID);
  const title = document.getElementById('companion-modal-title');
  const desc = document.getElementById('companion-modal-desc');
  const input = document.getElementById('companion-modal-input');
  const saveBtn = document.getElementById('companion-modal-save');
  const cancelBtn = document.getElementById('companion-modal-cancel');
  const deleteBtn = document.getElementById('companion-modal-delete');

  // モードに応じてUIを切替
  if (mode === 'edit' && player) {
    title.textContent = player.isMe ? '🏌️ 自分の名前を変更' : '✎ 同伴者の名前を変更';
    desc.textContent = player.isMe
      ? 'あなたのニックネームを変更します'
      : 'この同伴者の名前を変更します';
    input.value = player.name || '';
    // 自分は削除できない
    if (!player.isMe && typeof onDelete === 'function') {
      deleteBtn.classList.remove('hidden');
    } else {
      deleteBtn.classList.add('hidden');
    }
  } else {
    title.textContent = '👥 同伴者を追加';
    desc.textContent = 'QRをお持ちでない方のスコアもここから入力できます';
    input.value = '';
    deleteBtn.classList.add('hidden');
  }

  // モーダル表示
  modal.classList.add('show');
  setTimeout(() => input.focus(), 100);

  // ── イベント（毎回新規にバインド：上書きで重複を防ぐ） ──
  saveBtn.onclick = () => {
    const name = input.value.trim();
    if (!name) {
      toast('名前を入力してください', { type: 'error' });
      return;
    }
    if (typeof onSave === 'function') {
      onSave(name);
    }
    closeModal();
  };

  cancelBtn.onclick = closeModal;

  deleteBtn.onclick = () => {
    if (typeof onDelete === 'function') {
      onDelete();
    }
    closeModal();
  };

  // Enter キーで保存
  input.onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveBtn.click();
    }
  };
}

/** モーダルを閉じる */
function closeModal() {
  const modal = document.getElementById(MODAL_ID);
  if (modal) modal.classList.remove('show');
}

console.log('[widgets/companion-modal] loaded');
