// =============================================================
// scorecard.js - 16名対応スコアカード（プレイヤー名sticky+横スクロール）
// セルタップ→その場で±編集（Excel風）
// =============================================================
import { State } from '../core/state.js';
import { EventBus } from '../core/event-bus.js';
import { EVENTS, formatScore } from '../core/constants.js';

let _container = null;
let _editingCell = null;

function buildSkeleton() {
  if (_container) return _container;
  _container = document.createElement('div');
  _container.className = 'gw-scorecard';
  _container.innerHTML = `
    <div class="gw-sc-fixed">
      <div class="gw-sc-header-corner">プレイヤー</div>
      <div class="gw-sc-fixed-rows" id="gw-sc-fixed-rows"></div>
    </div>
    <div class="gw-sc-scroll" id="gw-sc-scroll">
      <div class="gw-sc-header-row" id="gw-sc-header-row"></div>
      <div class="gw-sc-body" id="gw-sc-body"></div>
    </div>
  `;
  return _container;
}

function renderHeader() {
  const course = State.getCourse();
  if (!course) return;
  const cur = State.getHole();
  const row = _container.querySelector('#gw-sc-header-row');
  let html = '';
  for (let i = 0; i < course.holes; i++) {
    const isCurrent = i === cur;
    html += `
      <div class="gw-sc-th ${isCurrent ? 'is-current' : ''}" data-hole="${i}">
        <div class="gw-sc-th-num">${i + 1}</div>
        <div class="gw-sc-th-par">P${course.pars[i]}</div>
      </div>
    `;
  }
  html += `<div class="gw-sc-th gw-sc-th-total">合計</div>`;
  html += `<div class="gw-sc-th gw-sc-th-diff">±</div>`;
  row.innerHTML = html;
  // ヘッダータップでホール移動
  row.querySelectorAll('.gw-sc-th[data-hole]').forEach(th => {
    th.addEventListener('click', () => {
      State.setHole(parseInt(th.dataset.hole, 10));
    });
  });
}

function renderRows() {
  const course = State.getCourse();
  if (!course) return;
  const players = State.getPlayers();
  const activeId = State.getActiveId();
  const mode = State.getSettings().displayMode || 'number';

  // 左固定列（プレイヤー名）
  const fixedRows = _container.querySelector('#gw-sc-fixed-rows');
  let fixedHtml = '';
  players.forEach(p => {
    const isActive = p.id === activeId;
    const badge = p.isSelf ? '👤' : (p.isHost ? '👑' : '');
    fixedHtml += `
      <div class="gw-sc-row-name ${isActive ? 'is-active' : ''}" data-player="${p.id}">
        <span class="gw-sc-pname">${badge}${escapeHtml(p.name)}</span>
      </div>
    `;
  });
  fixedRows.innerHTML = fixedHtml;
  fixedRows.querySelectorAll('.gw-sc-row-name').forEach(el => {
    el.addEventListener('click', () => {
      State.setActivePlayer(el.dataset.player);
    });
  });

  // 右スクロール列（スコア）
  const body = _container.querySelector('#gw-sc-body');
  let bodyHtml = '';
  players.forEach(p => {
    const isActive = p.id === activeId;
    let total = 0, parTotal = 0, hasAny = false;
    let cellsHtml = '';
    for (let i = 0; i < course.holes; i++) {
      const stroke = p.scores[i];
      const par = course.pars[i];
      const display = formatScore(stroke, par, mode);
      const diff = stroke != null ? stroke - par : null;
      const cellCls = [
        'gw-sc-cell',
        i === State.getHole() ? 'is-current' : '',
        stroke != null ? 'is-filled' : '',
        diff != null ? diffClass(diff) : '',
      ].join(' ');
      cellsHtml += `<div class="${cellCls}" data-player="${p.id}" data-hole="${i}">${display}</div>`;
      if (stroke != null) { total += stroke; parTotal += par; hasAny = true; }
    }
    const totalStr = hasAny ? total : '-';
    const diffVal = hasAny ? (total - parTotal) : null;
    const diffStr = hasAny ? (diffVal === 0 ? 'E' : (diffVal > 0 ? `+${diffVal}` : String(diffVal))) : '-';
    cellsHtml += `<div class="gw-sc-cell gw-sc-cell-total">${totalStr}</div>`;
    cellsHtml += `<div class="gw-sc-cell gw-sc-cell-diff ${hasAny ? diffClass(diffVal) : ''}">${diffStr}</div>`;
    bodyHtml += `<div class="gw-sc-row ${isActive ? 'is-active' : ''}" data-player="${p.id}">${cellsHtml}</div>`;
  });
  body.innerHTML = bodyHtml;

  // セルタップ→直接編集
  body.querySelectorAll('.gw-sc-cell[data-hole]').forEach(cell => {
    cell.addEventListener('click', (e) => {
      e.stopPropagation();
      openCellEditor(cell);
    });
  });
}

function diffClass(diff) {
  if (diff <= -2) return 'is-under2';
  if (diff === -1) return 'is-birdie';
  if (diff === 0) return 'is-par';
  if (diff === 1) return 'is-bogey';
  if (diff === 2) return 'is-double';
  return 'is-over';
}

function openCellEditor(cell) {
  if (_editingCell) closeCellEditor();
  _editingCell = cell;
  const playerId = cell.dataset.player;
  const holeIdx = parseInt(cell.dataset.hole, 10);
  const player = State.getPlayers().find(p => p.id === playerId);
  const course = State.getCourse();
  const par = course.pars[holeIdx];
  const current = player.scores[holeIdx] ?? par;

  cell.classList.add('is-editing');
  const popup = document.createElement('div');
  popup.className = 'gw-sc-cell-editor';
  popup.innerHTML = `
    <div class="gw-sc-edit-info">${player.name} / ${holeIdx + 1}H (P${par})</div>
    <div class="gw-sc-edit-row">
      <button class="gw-sc-edit-btn" data-act="minus">−</button>
      <div class="gw-sc-edit-val" id="gw-sc-edit-val">${current}</div>
      <button class="gw-sc-edit-btn" data-act="plus">＋</button>
    </div>
    <div class="gw-sc-edit-actions">
      <button class="gw-sc-edit-cancel" data-act="cancel">キャンセル</button>
      <button class="gw-sc-edit-clear" data-act="clear">クリア</button>
      <button class="gw-sc-edit-ok" data-act="ok">確定</button>
    </div>
  `;
  cell.appendChild(popup);
  let val = current;
  const valEl = popup.querySelector('#gw-sc-edit-val');
  popup.addEventListener('click', (e) => {
    e.stopPropagation();
    const act = e.target.dataset.act;
    if (act === 'minus') { val = Math.max(1, val - 1); valEl.textContent = val; }
    else if (act === 'plus') { val = Math.min(15, val + 1); valEl.textContent = val; }
    else if (act === 'ok') { State.setScore(playerId, holeIdx, val); closeCellEditor(); }
    else if (act === 'cancel') closeCellEditor();
    else if (act === 'clear') { State.setScore(playerId, holeIdx, null); closeCellEditor(); }
  });
  // 外側タップで閉じる
  setTimeout(() => document.addEventListener('click', outsideClose, { once: true }), 50);
}

function outsideClose(e) {
  if (_editingCell && !_editingCell.contains(e.target)) closeCellEditor();
}

function closeCellEditor() {
  if (!_editingCell) return;
  _editingCell.classList.remove('is-editing');
  const popup = _editingCell.querySelector('.gw-sc-cell-editor');
  if (popup) popup.remove();
  _editingCell = null;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'
  }[c]));
}

export function mountScorecard(host) {
  buildSkeleton();
  host.appendChild(_container);
  render();
}

export function render() {
  if (!_container) buildSkeleton();
  renderHeader();
  renderRows();
}

// イベントで再描画
[
  EVENTS.SCORE_UPDATED, EVENTS.HOLE_CHANGED, EVENTS.PLAYER_CHANGED,
  EVENTS.PLAYER_ADDED, EVENTS.PLAYER_REMOVED, EVENTS.DISPLAY_MODE_CHANGED,
  'player:renamed', 'course:changed'
].forEach(ev => EventBus.on(ev, render));
