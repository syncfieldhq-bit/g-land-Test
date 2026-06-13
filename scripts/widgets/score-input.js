// =============================================================
// score-input.js - スコア入力UI（Phase 7c：視線移動ゼロの最適配置）
// 構成：打数入力 → パット入力(小) → 確定ボタン(大)
// =============================================================
import { State } from '../core/state.js';
import { EventBus } from '../core/event-bus.js';
import { EVENTS, DISPLAY_MODES, DISPLAY_LABELS, formatScore, diffToName, diffToColor } from '../core/constants.js';
import { openHoleJump } from './hole-jump.js';
import { updateSetting } from '../core/storage.js';

let _container = null;

function build() {
  if (_container) return _container;
  _container = document.createElement('div');
  _container.className = 'gw-score-input';
  return _container;
}

function render() {
  if (!_container) build();
  const course = State.getCourse();
  if (!course) { _container.innerHTML = '<div style="padding:20px;color:#aaa;">コース未選択</div>'; return; }
  const active = State.getActivePlayer();
  if (!active) { _container.innerHTML = '<div style="padding:20px;color:#aaa;">プレイヤー未設定</div>'; return; }

  const settings = State.getSettings();
  const hole = State.getHole();
  const par = course.pars[hole];
  const stroke = active.scores[hole];
  const putt = active.putts[hole];

  const display = formatScore(stroke, par, settings.displayMode);
  const diff = stroke != null ? stroke - par : null;
  const diffStr = diff == null ? '' : (diff === 0 ? 'E' : (diff > 0 ? `+${diff}` : String(diff)));
  const diffColor = diff != null ? diffToColor(diff) : '#888';
  const scoreName = diff != null ? diffToName(diff) : '';
  const isLastHole = hole === course.holes - 1;

  _container.innerHTML = `
    <!-- ホール表示・移動 -->
    <div class="gw-si-top">
      <button class="gw-si-prev" data-action="prev-hole">◀</button>
      <button class="gw-si-hole-label gw-si-hole-current" data-action="open-jump">
        <div class="gw-si-hole-num">${hole + 1}H</div>
        <div class="gw-si-hole-par">PAR ${par}</div>
        <span class="gw-si-hole-hint">タップでジャンプ</span>
      </button>
      <button class="gw-si-next" data-action="next-hole">▶</button>
    </div>

    <div class="gw-si-player">${escapeHtml(active.name)} ${active.isSelf ? '👤' : ''}</div>

    <!-- 現在打数の大表示 -->
    <div class="gw-si-display" style="border-color:${diffColor};">
      <div class="gw-si-big" style="color:${diffColor};">${display}</div>
      <div class="gw-si-sub">
        <span class="gw-si-diff" style="color:${diffColor};">${diffStr}</span>
        ${scoreName ? `<span class="gw-si-name">${scoreName}</span>` : ''}
      </div>
      <button class="gw-si-cycle" data-action="cycle-display">表示: ${DISPLAY_LABELS[settings.displayMode]}</button>
    </div>

    <!-- ① 打数入力エリア（メイン）-->
    ${settings.inputMode === 'simple' ? renderSimpleMode(par, stroke) : renderCounterMode(stroke, putt)}

    <!-- ② パット入力（小・直下に配置）-->
    ${settings.puttEnabled && settings.inputMode === 'simple' ? renderPuttRow(putt) : ''}

    <!-- ③ 確定ボタン（大・最下部・視線移動なし）-->
    <button class="gw-si-confirm-big ${isLastHole ? 'is-final' : ''}" data-action="${settings.inputMode === 'simple' ? 'confirm-simple' : 'confirm-counter'}">
      ${isLastHole ? '✅ 最終ホール 入力完了' : '✓ 確定して次のホールへ →'}
    </button>

    <!-- 設定切替・クリア（折り畳み風）-->
    <div class="gw-si-settings">
      <div class="gw-si-toggle">
        <button class="${settings.inputMode === 'simple' ? 'is-on' : ''}" data-action="mode-simple">シンプル</button>
        <button class="${settings.inputMode === 'counter' ? 'is-on' : ''}" data-action="mode-counter">カウンター</button>
      </div>
      <label class="gw-si-switch">
        <input type="checkbox" data-action="toggle-putt" ${settings.puttEnabled ? 'checked' : ''}>
        <span>パット入力</span>
      </label>
      <button class="gw-si-clear-mini" data-action="clear-hole">クリア</button>
    </div>
  `;

  bindEvents();
}

function renderSimpleMode(par, stroke) {
  const current = stroke != null ? stroke : par;
  return `
    <div class="gw-si-simple">
      <button class="gw-si-bigbtn gw-si-minus" data-action="dec">−</button>
      <div class="gw-si-current">${current}</div>
      <button class="gw-si-bigbtn gw-si-plus" data-action="inc">＋</button>
    </div>
  `;
}

function renderCounterMode(stroke, putt) {
  const shots = (stroke != null && putt != null) ? (stroke - putt) : (stroke != null ? stroke : 0);
  const putts = putt != null ? putt : 0;
  const total = shots + putts;
  return `
    <div class="gw-si-counter">
      <div class="gw-si-counter-row">
        <div class="gw-si-counter-label">ショット</div>
        <div class="gw-si-counter-val">${shots}</div>
        <button class="gw-si-counter-btn" data-action="shot-plus">+1</button>
      </div>
      <div class="gw-si-counter-row">
        <div class="gw-si-counter-label">パット</div>
        <div class="gw-si-counter-val">${putts}</div>
        <button class="gw-si-counter-btn" data-action="putt-plus">+1</button>
      </div>
      <div class="gw-si-counter-total">
        <span>合計</span>
        <strong>${total}</strong>
      </div>
    </div>
  `;
}

function renderPuttRow(putt) {
  return `
    <div class="gw-si-putt-row gw-si-putt-compact">
      <span class="gw-si-putt-label">🥅 パット</span>
      <button class="gw-si-putt-btn" data-action="putt-dec">−</button>
      <span class="gw-si-putt-val">${putt != null ? putt : 0}</span>
      <button class="gw-si-putt-btn" data-action="putt-inc">＋</button>
    </div>
  `;
}

function bindEvents() {
  _container.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', (e) => handle(el.dataset.action, e));
    el.addEventListener('change', (e) => handle(el.dataset.action, e));
  });
}

function autoAdvance() {
  const course = State.getCourse();
  const hole = State.getHole();
  if (course && hole < course.holes - 1) {
    setTimeout(() => State.setHole(hole + 1), 180);
  } else if (course && hole === course.holes - 1) {
    setTimeout(() => EventBus.emit('round:lasthole-confirmed'), 200);
  }
}

function handle(action, e) {
  const active = State.getActivePlayer();
  const hole = State.getHole();
  const course = State.getCourse();
  if (!active || !course) return;
  const par = course.pars[hole];
  const settings = State.getSettings();

  switch (action) {
    case 'prev-hole': State.setHole(Math.max(0, hole - 1)); break;
    case 'next-hole': State.setHole(Math.min(course.holes - 1, hole + 1)); break;
    case 'open-jump': openHoleJump(); break;
    case 'cycle-display': {
      const next = DISPLAY_MODES[(DISPLAY_MODES.indexOf(settings.displayMode) + 1) % DISPLAY_MODES.length];
      State.updateSetting('displayMode', next);
      updateSetting('displayMode', next);
      EventBus.emit(EVENTS.DISPLAY_MODE_CHANGED, next);
      render();
      break;
    }
    case 'mode-simple':
      State.updateSetting('inputMode', 'simple');
      updateSetting('inputMode', 'simple');
      render(); break;
    case 'mode-counter':
      State.updateSetting('inputMode', 'counter');
      updateSetting('inputMode', 'counter');
      render(); break;
    case 'toggle-putt': {
      const val = e.target.checked;
      State.updateSetting('puttEnabled', val);
      updateSetting('puttEnabled', val);
      render(); break;
    }
    case 'inc': {
      const cur = active.scores[hole] ?? par;
      State.setScore(active.id, hole, Math.min(15, cur + 1));
      break;
    }
    case 'dec': {
      const cur = active.scores[hole] ?? par;
      State.setScore(active.id, hole, Math.max(1, cur - 1));
      break;
    }
    case 'confirm-simple': {
      if (active.scores[hole] == null) State.setScore(active.id, hole, par);
      autoAdvance();
      break;
    }
    case 'confirm-counter': {
      autoAdvance();
      break;
    }
    case 'clear-hole':
      State.setScore(active.id, hole, null);
      State.setPutt(active.id, hole, null);
      break;
    case 'shot-plus': {
      const cur = active.scores[hole] ?? 0;
      State.setScore(active.id, hole, cur + 1);
      break;
    }
    case 'putt-plus': {
      const curS = active.scores[hole] ?? 0;
      const curP = active.putts[hole] ?? 0;
      State.setPutt(active.id, hole, curP + 1);
      State.setScore(active.id, hole, curS + 1);
      break;
    }
    case 'putt-inc': {
      const curP = active.putts[hole] ?? 0;
      State.setPutt(active.id, hole, curP + 1);
      break;
    }
    case 'putt-dec': {
      const curP = active.putts[hole] ?? 0;
      State.setPutt(active.id, hole, Math.max(0, curP - 1));
      break;
    }
  }
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'
  }[c]));
}

export function mountScoreInput(host) {
  build();
  host.appendChild(_container);
  render();
}

[EVENTS.SCORE_UPDATED, EVENTS.HOLE_CHANGED, EVENTS.PLAYER_CHANGED, 'putt:updated', 'settings:changed', 'course:changed', 'state:restored']
  .forEach(ev => EventBus.on(ev, render));
