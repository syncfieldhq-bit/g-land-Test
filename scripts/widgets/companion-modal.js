// =============================================================
// companion-modal.js - 同伴者の追加・編集・削除モーダル
// =============================================================
import { State } from '../core/state.js';
import { toast } from '../ui/toast.js';

let _modal = null;

function build() {
  if (_modal) return _modal;
  _modal = document.createElement('div');
  _modal.className = 'gw-companion-modal';
  _modal.innerHTML = `
    <div class="gw-companion-backdrop"></div>
    <div class="gw-companion-sheet">
      <div class="gw-companion-header">
        <h3 id="gw-cm-title">同伴者を追加</h3>
        <button class="gw-companion-close">×</button>
      </div>
      <div class="gw-companion-body">
        <label>名前</label>
        <input type="text" id="gw-cm-name" maxlength="20" placeholder="例: タロウ">
        <label class="gw-cm-public-row">
          <input type="checkbox" id="gw-cm-public" checked>
          <span>ランキングに公開する</span>
        </label>
      </div>
      <div class="gw-companion-actions">
        <button class="gw-cm-delete" id="gw-cm-delete">削除</button>
        <div class="gw-cm-spacer"></div>
        <button class="gw-cm-cancel">キャンセル</button>
        <button class="gw-cm-ok" id="gw-cm-ok">確定</button>
      </div>
    </div>
  `;
  document.body.appendChild(_modal);

  _modal.querySelector('.gw-companion-backdrop').addEventListener('click', close);
  _modal.querySelector('.gw-companion-close').addEventListener('click', close);
  _modal.querySelector('.gw-cm-cancel').addEventListener('click', close);
  return _modal;
}

let _editId = null;

export function openCompanionModal(playerId) {
  build();
  _editId = playerId;
  const isEdit = !!playerId;
  const player = isEdit ? State.getPlayers().find(p => p.id === playerId) : null;
  _modal.querySelector('#gw-cm-title').textContent = isEdit ? '同伴者を編集' : '同伴者を追加';
  _modal.querySelector('#gw-cm-name').value = player?.name || '';
  _modal.querySelector('#gw-cm-public').checked = player?.isPublic !== false;
  const deleteBtn = _modal.querySelector('#gw-cm-delete');
  deleteBtn.style.display = (isEdit && !player?.isSelf) ? 'inline-block' : 'none';
  deleteBtn.onclick = () => {
    if (confirm(`${player.name}さんを削除しますか？`)) {
      State.removePlayer(playerId);
      toast('削除しました', 'info');
      close();
    }
  };
  _modal.querySelector('#gw-cm-ok').onclick = () => {
    const name = _modal.querySelector('#gw-cm-name').value.trim();
    const isPublic = _modal.querySelector('#gw-cm-public').checked;
    if (!name) { toast('名前を入力してください', 'error'); return; }
    if (isEdit) {
      State.renamePlayer(playerId, name);
      const p = State.getPlayers().find(p => p.id === playerId);
      if (p) p.isPublic = isPublic;
      toast('更新しました', 'success');
    } else {
      const added = State.addPlayer({ name, isPublic });
      if (added) toast(`${name}さんを追加しました`, 'success');
      else toast('これ以上追加できません（最大16名）', 'error');
    }
    close();
  };

  requestAnimationFrame(() => _modal.classList.add('is-open'));
  setTimeout(() => _modal.querySelector('#gw-cm-name').focus(), 200);
}

function close() {
  if (_modal) _modal.classList.remove('is-open');
}
