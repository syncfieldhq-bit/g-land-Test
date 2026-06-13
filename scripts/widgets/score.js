/**
 * ═══════════════════════════════════════════════════════
 * scripts/widgets/score.js - スコア入力ウィジェット（Phase 5）
 *
 * Phase 5 の追加：
 *   - hole-grid（18ホールジャンプ）を統合
 *   - companion-list（同伴者表）を統合（簡易版・自分のみ）
 *   - スコア変更のたびに Round Draft を自動保存
 *   - 同伴者名タップで companion-modal を開く
 * ═══════════════════════════════════════════════════════
 */

import { State } from '../core/state.js';
import { Store } from '../core/storage.js';
import { getPar } from '../core/config.js';
import { Calculator } from '../core/calculator.js';
import { toast } from '../ui/toast.js';
import { renderHoleGrid } from './hole-grid.js';
import { openCompanionModal } from './companion-modal.js';

/**
 * スコアウィジェットを描画
 *
 * @param {HTMLElement} container - 描画先要素
 */
export function renderScore(container) {
  if (!container) return;

  const hole = State.currentHole;
  const mode = State.inputMode;

  container.innerHTML = `
    ${buildSummary()}
    ${mode === 'counter' ? buildCounterUI(hole) : buildSimpleUI(hole)}
    <div id="score-hole-grid-mount"></div>
    <div id="score-companion-mount"></div>
  `;

  bindEvents(container);

  // ホールグリッドをマウント
  const gridMount = container.querySelector('#score-hole-grid-mount');
  if (gridMount) {
    renderHoleGrid(gridMount, {
      onJump: (h) => {
        State.currentHole = h;
        renderScore(container);
      }
    });
  }

  // 同伴者リストをマウント
  const compMount = container.querySelector('#score-companion-mount');
  if (compMount) {
    renderCompanionList(compMount, container);
  }
}

/**
 * サマリヘッダー（合計・PAR差・OUT/IN）
 */
function buildSummary() {
  const me = State.players[0];
  if (!me) return '';

  const summary = Calculator.summarize(me);
  const showHalves = State.totalHoles === 18;

  return `
    <div class="score-summary">
      <div class="summary-main">
        <div class="summary-item summary-total">
          <div class="lbl">合計</div>
          <div class="val">${summary.strokes || '-'}</div>
        </div>
        <div class="summary-item summary-diff">
          <div class="lbl">PAR差</div>
          <div class="val ${diffClass(summary.diff)}">${summary.strokes > 0 ? summary.diffStr : '-'}</div>
        </div>
        <div class="summary-item summary-played">
          <div class="lbl">プレイ済</div>
          <div class="val">${summary.playedHoles}/${summary.totalHoles}</div>
        </div>
      </div>
      ${showHalves ? `
        <div class="summary-halves">
          <div class="half-item">
            <span class="half-lbl">OUT</span>
            <span class="half-val">${summary.out.strokes || '-'}</span>
            <span class="half-diff ${diffClass(summary.out.diff)}">${summary.out.played > 0 ? Calculator.formatParDiff(summary.out.diff) : ''}</span>
          </div>
          <div class="half-item">
            <span class="half-lbl">IN</span>
            <span class="half-val">${summary.in.strokes || '-'}</span>
            <span class="half-diff ${diffClass(summary.in.diff)}">${summary.in.played > 0 ? Calculator.formatParDiff(summary.in.diff) : ''}</span>
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

function diffClass(diff) {
  if (diff < 0) return 'diff-under';
  if (diff === 0) return 'diff-even';
  return 'diff-over';
}

/**
 * シンプルモードUI
 */
function buildSimpleUI(hole) {
  const par = getPar(hole);
  const me = State.players[0];
  const score = me && me.scores ? me.scores[hole - 1] : null;
  const display = (score !== null && score !== undefined) ? score : par;
  const holeDiff = Calculator.holeParDiff(score, hole);
  const diffStr = (score === null || score === undefined)
    ? '(未入力)'
    : (holeDiff === 0 ? '(PAR)' : `(${holeDiff > 0 ? '+' : ''}${holeDiff})`);
  const scoreName = Calculator.holeScoreName(score, hole);

  return `
    <div class="score-widget score-widget--simple">
      <div class="score-hole-nav">
        <button data-score-action="prev-hole" class="hole-nav-btn" ${hole <= 1 ? 'disabled' : ''}>◀</button>
        <div class="hole-info">
          <div class="hole-num">Hole ${hole}</div>
          <div class="hole-par">PAR ${par}</div>
          ${scoreName ? `<div class="hole-name">${scoreName}</div>` : ''}
        </div>
        <button data-score-action="next-hole" class="hole-nav-btn" ${hole >= State.totalHoles ? 'disabled' : ''}>▶</button>
      </div>
      <div class="score-display">
        <div class="score-val">${display}</div>
        <div class="score-diff ${diffClass(holeDiff || 0)}">${diffStr}</div>
      </div>
      <div class="score-buttons">
        <button data-score-action="minus" class="btn-score btn-minus">−</button>
        <button data-score-action="plus"  class="btn-score btn-plus">+</button>
      </div>
    </div>
  `;
}

/**
 * カウンターモードUI
 */
function buildCounterUI(hole) {
  const par = getPar(hole);
  const me = State.players[0];
  const shots = (me && me.shots) ? me.shots[hole - 1] || 0 : 0;
  const putts = (me && me.putts) ? me.putts[hole - 1] || 0 : 0;
  const total = Calculator.holeTotal(shots, putts);
  const holeDiff = total > 0 ? Calculator.holeParDiff(total, hole) : null;
  const diffStr = total > 0
    ? (holeDiff === 0 ? '(PAR)' : `(${holeDiff > 0 ? '+' : ''}${holeDiff})`)
    : '';
  const scoreName = total > 0 ? Calculator.holeScoreName(total, hole) : '';

  return `
    <div class="score-widget score-widget--counter">
      <div class="score-hole-nav">
        <button data-score-action="prev-hole" class="hole-nav-btn" ${hole <= 1 ? 'disabled' : ''}>◀</button>
        <div class="hole-info">
          <div class="hole-num">Hole ${hole}</div>
          <div class="hole-par">PAR ${par}</div>
          ${scoreName ? `<div class="hole-name">${scoreName}</div>` : ''}
        </div>
        <button data-score-action="next-hole" class="hole-nav-btn" ${hole >= State.totalHoles ? 'disabled' : ''}>▶</button>
      </div>
      <div class="score-total">
        <div class="score-total-label">合計スコア</div>
        <div class="score-total-val">${total || 0}</div>
        <div class="score-diff ${diffClass(holeDiff || 0)}">${diffStr}</div>
        <div class="score-breakdown">
          🏌️ <b>${shots}</b> + ⛳ <b>${putts}</b>
        </div>
      </div>
      <div class="score-dual">
        <button data-score-action="shot" class="btn-score btn-shot">
          🏌️<br>ショット +1
        </button>
        <button data-score-action="putt" class="btn-score btn-putt">
          ⛳<br>パット +1
        </button>
      </div>
      <button data-score-action="clear" class="btn-clear">🔄 このホールをクリア</button>
    </div>
  `;
}

/**
 * 同伴者リスト（プレイヤー一覧）
 */
function renderCompanionList(mount, parentContainer) {
  const players = State.players;
  const totalHoles = State.totalHoles;
  const currentHole = State.currentHole;

  // 表示するホール範囲（コンパクト化のため5ホール分のみ表示）
  const showStart = Math.max(1, currentHole - 2);
  const showEnd = Math.min(totalHoles, showStart + 4);

  let html = '<div class="companion-section">';
  html += '<h3 class="companion-title">👥 プレイヤー一覧</h3>';
  html += '<table class="companion-table"><thead><tr>';
  html += '<th class="ct-name">プレイヤー</th>';
  for (let h = showStart; h <= showEnd; h++) {
    html += `<th class="ct-hole ${h === currentHole ? 'is-current' : ''}">${h}</th>`;
  }
  html += '<th class="ct-total">計</th>';
  html += '</tr></thead><tbody>';

  players.forEach((p) => {
    const summary = Calculator.summarize(p);
    html += `<tr class="${p.isMe ? 'row-me' : ''}">`;
    html += `<td class="ct-name-cell" data-companion-edit="${p.id}">
      <span class="ct-name-text">${escapeHtml(p.name)}</span>
      ${p.isMe ? '<span class="me-badge">自分</span>' : ''}
    </td>`;
    for (let h = showStart; h <= showEnd; h++) {
      const s = p.scores && p.scores[h - 1];
      const cellCls = (h === currentHole) ? 'ct-hole is-current' : 'ct-hole';
      html += `<td class="${cellCls}">${(s !== null && s !== undefined) ? s : '-'}</td>`;
    }
    html += `<td class="ct-total">${summary.strokes || '-'}</td>`;
    html += '</tr>';
  });

  html += '</tbody></table>';
  html += '<button class="add-companion-btn" data-companion-add>+ 同伴者を追加</button>';
  html += '</div>';

  mount.innerHTML = html;

  // 名前クリック → 編集モーダル
  mount.querySelectorAll('[data-companion-edit]').forEach((cell) => {
    cell.addEventListener('click', () => {
      const playerId = cell.getAttribute('data-companion-edit');
      const player = State.players.find((p) => p.id === playerId);
      if (!player) return;

      openCompanionModal({
        mode: 'edit',
        player: player,
        onSave: (newName) => {
          player.name = newName;
          // 自分の場合はプロファイルも更新
          if (player.isMe && State.profile) {
            State.profile.nickname = newName;
            Store.set('gw_profile', State.profile);
            // ヘッダー更新
            const headerName = document.getElementById('header-name');
            if (headerName) headerName.textContent = newName + 'さん';
          }
          autoSaveDraft();
          renderScore(parentContainer);
          toast('名前を変更しました', { type: 'success' });
        },
        onDelete: () => {
          const idx = State.players.findIndex((p) => p.id === playerId);
          if (idx >= 0) {
            const removed = State.players.splice(idx, 1)[0];
            autoSaveDraft();
            renderScore(parentContainer);
            toast(`${removed.name} を削除しました`);
          }
        }
      });
    });
  });

  // 「+ 同伴者を追加」ボタン
  const addBtn = mount.querySelector('[data-companion-add]');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      openCompanionModal({
        mode: 'add',
        onSave: (name) => {
          const newId = 'mate-' + Date.now() + '-' + Math.floor(Math.random() * 0xFFFF).toString(16);
          State.players.push({
            id: newId,
            name: name,
            scores: new Array(State.totalHoles).fill(null),
            shots: new Array(State.totalHoles).fill(0),
            putts: new Array(State.totalHoles).fill(0),
            isMe: false
          });
          autoSaveDraft();
          renderScore(parentContainer);
          toast(`${name} を追加しました`, { type: 'success' });
        }
      });
    });
  }
}

/**
 * イベントリスナーをバインド（スコア入力部分のみ）
 */
function bindEvents(container) {
  container.querySelectorAll('[data-score-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.getAttribute('data-score-action');
      handleAction(action, container);
    });
  });
}

/**
 * スコア更新ロジック
 */
function handleAction(action, container) {
  const me = State.players[0];
  if (!me) {
    toast('プレイヤー情報がありません', { type: 'error' });
    return;
  }

  const hole = State.currentHole;
  const idx = hole - 1;

  switch (action) {
    case 'plus': {
      const cur = me.scores[idx];
      const par = getPar(hole);
      const base = (cur === null || cur === undefined) ? par : cur;
      me.scores[idx] = base + 1;
      break;
    }
    case 'minus': {
      const cur = me.scores[idx];
      const par = getPar(hole);
      const base = (cur === null || cur === undefined) ? par : cur;
      me.scores[idx] = Math.max(1, base - 1);
      break;
    }
    case 'shot': {
      if (!me.shots) me.shots = new Array(State.totalHoles).fill(0);
      if (!me.putts) me.putts = new Array(State.totalHoles).fill(0);
      me.shots[idx] = (me.shots[idx] || 0) + 1;
      me.scores[idx] = Calculator.holeTotal(me.shots[idx], me.putts[idx]);
      break;
    }
    case 'putt': {
      if (!me.shots) me.shots = new Array(State.totalHoles).fill(0);
      if (!me.putts) me.putts = new Array(State.totalHoles).fill(0);
      me.putts[idx] = (me.putts[idx] || 0) + 1;
      me.scores[idx] = Calculator.holeTotal(me.shots[idx], me.putts[idx]);
      break;
    }
    case 'clear': {
      me.scores[idx] = null;
      if (me.shots) me.shots[idx] = 0;
      if (me.putts) me.putts[idx] = 0;
      toast('クリアしました');
      break;
    }
    case 'prev-hole': {
      if (hole > 1) State.currentHole = hole - 1;
      break;
    }
    case 'next-hole': {
      if (hole < State.totalHoles) State.currentHole = hole + 1;
      break;
    }
  }

  // 🆕 Phase 5：変更のたびにドラフト自動保存
  autoSaveDraft();

  // 再描画
  renderScore(container);
}

/**
 * 進行中ラウンドのドラフトを自動保存
 */
function autoSaveDraft() {
  if (!State.courseId) return;
  Store.saveRoundDraft({
    courseId: State.courseId,
    variant: State.variant,
    totalHoles: State.totalHoles,
    currentHole: State.currentHole,
    inputMode: State.inputMode,
    puttMode: State.puttMode,
    players: State.players
  });
}

/** HTMLエスケープ */
function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}

console.log('[widgets/score] loaded (Phase 5: hole-grid + companion + auto-save)');
