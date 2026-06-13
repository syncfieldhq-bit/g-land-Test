/**
 * ═══════════════════════════════════════════════════════
 * scripts/widgets/score.js - スコア入力ウィジェット（初期構成）
 *
 * 役割：
 *   - シンプルモード（PARからの ± 調整）
 *   - カウンターモード（ショット + パット の自動合算）
 *   - 1ホールずつの入力を提供
 *
 * Phase 2 では「骨組み + テスト表示」のみ実装。
 * Phase 4 で本格的なスコア計算ロジックと連携予定。
 * ═══════════════════════════════════════════════════════
 */

import { State } from '../core/state.js';
import { getPar } from '../core/config.js';
import { toast } from '../ui/toast.js';

/**
 * スコアウィジェットを指定要素にレンダリング
 *
 * @param {HTMLElement} container - 描画先の DOM要素
 * @param {Object} [opts]
 * @param {number} [opts.hole] - 表示するホール番号（省略時は State.currentHole）
 */
export function renderScore(container, opts = {}) {
  if (!container) {
    console.warn('[widgets/score] container is null');
    return;
  }

  const hole = opts.hole ?? State.currentHole;
  const mode = State.inputMode;

  if (mode === 'counter') {
    container.innerHTML = buildCounterUI(hole);
  } else {
    container.innerHTML = buildSimpleUI(hole);
  }

  // イベントリスナーをバインド
  bindEvents(container);
}

/**
 * シンプルモードUI（PARからの ± 調整）
 */
function buildSimpleUI(hole) {
  const par = getPar(hole);
  const me = State.players[0];
  const score = me && me.scores ? me.scores[hole - 1] : null;
  const display = (score !== null && score !== undefined) ? score : par;
  const diff = display - par;
  const diffStr = diff === 0 ? '(PAR)' : `(${diff > 0 ? '+' : ''}${diff})`;

  return `
    <div class="score-widget score-widget--simple">
      <div class="score-header">
        <span class="hole-num">Hole ${hole}</span>
        <span class="hole-par">PAR ${par}</span>
      </div>
      <div class="score-display">
        <div class="score-val">${display}</div>
        <div class="score-diff">${diffStr}</div>
      </div>
      <div class="score-buttons">
        <button data-score-action="minus" class="btn-score btn-minus">−</button>
        <button data-score-action="plus"  class="btn-score btn-plus">+</button>
      </div>
    </div>
  `;
}

/**
 * カウンターモードUI（ショット + パット の合算）
 */
function buildCounterUI(hole) {
  const par = getPar(hole);
  const me = State.players[0];
  const shots = (me && me.shots) ? me.shots[hole - 1] || 0 : 0;
  const putts = (me && me.putts) ? me.putts[hole - 1] || 0 : 0;
  const total = shots + putts;
  const diff = total - par;
  const diffStr = total > 0 ? (diff === 0 ? '(PAR)' : `(${diff > 0 ? '+' : ''}${diff})`) : '';

  return `
    <div class="score-widget score-widget--counter">
      <div class="score-header">
        <span class="hole-num">Hole ${hole}</span>
        <span class="hole-par">PAR ${par}</span>
      </div>
      <div class="score-total">
        <div class="score-total-label">合計スコア</div>
        <div class="score-total-val">${total || 0}</div>
        <div class="score-diff">${diffStr}</div>
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
 * アクションハンドラ
 */
function handleAction(action, container) {
  // Phase 2 では「動作確認用の Toast」を出すだけ
  // Phase 4 で実際のスコア更新ロジックを実装する
  switch (action) {
    case 'plus':
      toast('シンプル: +1（Phase 4 で実装）');
      break;
    case 'minus':
      toast('シンプル: -1（Phase 4 で実装）');
      break;
    case 'shot':
      toast('カウンター: ショット +1（Phase 4 で実装）');
      break;
    case 'putt':
      toast('カウンター: パット +1（Phase 4 で実装）');
      break;
    case 'clear':
      toast('クリア（Phase 4 で実装）', { type: 'info' });
      break;
  }

  // 将来：State を更新して renderScore を再呼び出し（差分更新）
  // renderScore(container);
}

console.log('[widgets/score] loaded');
