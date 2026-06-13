/**
 * ═══════════════════════════════════════════════════════
 * scripts/widgets/score.js - スコア入力ウィジェット（Phase 4：Calculator連携版）
 *
 * Phase 4 の追加：
 *   - Calculator を import して、合計・PAR差をリアルタイム計算
 *   - 実際のスコア更新ロジックを実装（State に書き込み）
 *   - 内訳ヘッダー（合計/OUT/IN）を表示
 *   - PAR起点シンプル、ショット+パット カウンター モード両方対応
 * ═══════════════════════════════════════════════════════
 */

import { State } from '../core/state.js';
import { getPar } from '../core/config.js';
import { Calculator } from '../core/calculator.js';
import { toast } from '../ui/toast.js';

/**
 * スコアウィジェットを描画
 *
 * @param {HTMLElement} container - 描画先要素
 * @param {Object} [opts]
 * @param {number} [opts.hole] - 表示するホール番号（省略時 State.currentHole）
 */
export function renderScore(container, opts = {}) {
  if (!container) return;

  const hole = opts.hole ?? State.currentHole;
  const mode = State.inputMode;

  container.innerHTML = `
    ${buildSummary()}
    ${mode === 'counter' ? buildCounterUI(hole) : buildSimpleUI(hole)}
  `;

  bindEvents(container);
}

/**
 * サマリヘッダー（合計 / PAR差 / OUT / IN）
 */
function buildSummary() {
  const me = State.players[0];
  if (!me) return '';

  const summary = Calculator.summarize(me);

  // 18ホールの場合のみ OUT/IN を表示
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

/** diff の値からCSSクラスを決定 */
function diffClass(diff) {
  if (diff < 0) return 'diff-under';
  if (diff === 0) return 'diff-even';
  return 'diff-over';
}

/**
 * シンプルモードUI（PARからの ± 調整）
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
 * カウンターモードUI（ショット + パット の自動合算）
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
 * イベントリスナーをバインド
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
 * Phase 4：実際のスコア更新ロジック
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
      // シンプル：未入力なら PAR から、入力済なら +1
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
      // カウンター：ショット +1 → 合計を再計算
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

  // 再描画（同じ container に上書き）
  renderScore(container);

  // 外部リスナー（screen 側）にも通知できるようカスタムイベント発火
  container.dispatchEvent(new CustomEvent('score:updated', {
    bubbles: true,
    detail: { hole, action }
  }));
}

console.log('[widgets/score] loaded (Phase 4: Calculator-integrated)');
