/**
 * ═══════════════════════════════════════════════════════
 * scripts/widgets/hole-grid.js - ホール一覧ジャンプグリッド
 *
 * 役割：
 *   - 全ホール（9 or 18）を3列グリッドで表示
 *   - 各セルに「ホール番号・PAR・現在のスコア」を表示
 *   - 現在のホール／プレイ済／未入力を色分け
 *   - タップで該当ホールへジャンプ
 *
 * 使い方：
 *   import { renderHoleGrid } from './widgets/hole-grid.js';
 *   renderHoleGrid(container, { onJump: (hole) => { ... } });
 * ═══════════════════════════════════════════════════════
 */

import { State } from '../core/state.js';
import { getPar } from '../core/config.js';
import { Calculator } from '../core/calculator.js';

/**
 * ホールグリッドを描画
 *
 * @param {HTMLElement} container - 描画先要素
 * @param {Object} [opts]
 * @param {Function} [opts.onJump] - ホール選択時のコールバック (hole) => void
 */
export function renderHoleGrid(container, opts = {}) {
  if (!container) return;

  const total = State.totalHoles || 18;
  const current = State.currentHole;
  const me = State.players[0];

  const cells = [];
  for (let h = 1; h <= total; h++) {
    const par = getPar(h);
    const score = me && me.scores ? me.scores[h - 1] : null;
    const isCurrent = h === current;
    const isFilled = score !== null && score !== undefined;
    const diff = isFilled ? Calculator.holeParDiff(score, h) : null;

    // 状態に応じたCSSクラス
    let cls = 'hole-cell';
    if (isCurrent) cls += ' is-current';
    if (isFilled) cls += ' is-filled';
    if (diff !== null) {
      if (diff < 0) cls += ' is-under';
      else if (diff === 0) cls += ' is-par';
      else cls += ' is-over';
    }

    cells.push(`
      <button class="${cls}" data-hole-jump="${h}">
        <span class="hc-num">${h}</span>
        <span class="hc-par">P${par}</span>
        <span class="hc-score">${isFilled ? score : '−'}</span>
      </button>
    `);
  }

  container.innerHTML = `
    <div class="hole-grid">
      ${cells.join('')}
    </div>
  `;

  // イベントバインド
  container.querySelectorAll('[data-hole-jump]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const hole = parseInt(btn.getAttribute('data-hole-jump'), 10);
      if (typeof opts.onJump === 'function') {
        opts.onJump(hole);
      }
    });
  });
}

console.log('[widgets/hole-grid] loaded');
