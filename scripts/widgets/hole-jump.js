// =============================================================
// hole-jump.js - ホールジャンプモーダル（にゅるっと出現UI）
// =============================================================
import { State } from '../core/state.js';
import { EVENTS } from '../core/constants.js';
import { EventBus } from '../core/event-bus.js';

let _modal = null;

function build() {
  if (_modal) return _modal;
  _modal = document.createElement('div');
  _modal.className = 'gw-hole-jump-modal';
  _modal.innerHTML = `
    <div class="gw-hole-jump-backdrop"></div>
    <div class="gw-hole-jump-sheet">
      <div class="gw-hole-jump-header">
        <h3>ホールへジャンプ</h3>
        <button class="gw-hole-jump-close" aria-label="閉じる">×</button>
      </div>
      <div class="gw-hole-jump-grid" id="gw-hole-jump-grid"></div>
    </div>
  `;
  document.body.appendChild(_modal);

  _modal.querySelector('.gw-hole-jump-backdrop').addEventListener('click', close);
  _modal.querySelector('.gw-hole-jump-close').addEventListener('click', close);
  return _modal;
}

function render() {
  const course = State.getCourse();
  if (!course) return;
  const active = State.getActivePlayer();
  const cur = State.getHole();
  const grid = _modal.querySelector('#gw-hole-jump-grid');
  let html = '';
  for (let i = 0; i < course.holes; i++) {
    const par = course.pars[i];
    const score = active?.scores[i];
    const isCurrent = i === cur;
    const hasScore = score != null;
    const cls = [
      'gw-hj-cell',
      isCurrent ? 'is-current' : '',
      hasScore ? 'is-filled' : '',
    ].join(' ');
    html += `
      <button class="${cls}" data-hole="${i}">
        <span class="gw-hj-num">${i + 1}</span>
        <span class="gw-hj-par">PAR${par}</span>
        <span class="gw-hj-score">${hasScore ? score : '-'}</span>
      </button>
    `;
  }
  grid.innerHTML = html;
  grid.querySelectorAll('.gw-hj-cell').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.hole, 10);
      State.setHole(idx);
      close();
    });
  });
}

export function openHoleJump() {
  build();
  render();
  requestAnimationFrame(() => {
    _modal.classList.add('is-open');
  });
}

export function close() {
  if (!_modal) return;
  _modal.classList.remove('is-open');
}

// ホール変更時に閉じる
EventBus.on(EVENTS.HOLE_CHANGED, close);
