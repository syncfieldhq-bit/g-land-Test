// =============================================================
// score-input.js - スコア入力UI（Phase 7f：画面圧縮版）
// レイアウト：[−][大きな打数][＋] → パット → 確定ボタン
// 親指移動距離を最短化、画面下部の空きスペース排除
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
  _container.className = 'gw-score-input gw-score-input-compact';
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
  const diffColor = diff != null ? diffToColor(diff) : '#f5c842';
  const scoreName = diff != null ? diffToName(diff) : '';
  const isLastHole = hole === course.holes - 1;
  const current = stroke != null ? stroke : par;

  _container.innerHTML = `
    <!-- ホール移動バー -->
    <div class="gw-si-top">
      <button class="gw-si-prev" data-action="prev-hole">◀</button>
      <button class="gw-si-hole-label gw-si-hole-current" data-action="open-jump">
        <div class="gw-si-hole-num">${hole + 1}H</div>
        <div class="gw-si-hole-par">PAR ${par}</div>
      </button>
      <button class="gw-si-next" data-action="next-hole">▶</button>
    </div>

    <!-- プレイヤー名・スコア名（コンパクト） -->
    <div class="gw-si-player-row">
      <span class="gw-si-player-name">${escapeHtml(active.name)} ${active.isSelf ? '👤' : ''}</span>
      ${scoreName ? `<span class="gw-si-score-name" style="background:${diffColor}20;color:${diffColor};">${scoreName} ${diffStr}</span>` : ''}
    </div>

    ${settings.inputMode === 'simple' ? renderSimpleCompact(current, diffColor, display) : renderCounterCompact(stroke, putt)}

    ${settings.puttEnabled && settings.inputMode === 'simple' ? renderPuttRow(putt) : ''}

    <!-- 確定ボタン -->
    <button class="gw-si-confirm-big ${isLastHole ? 'is-final' : ''}" data-action="${settings.inputMode === 'simple' ? 'confirm-simple' : 'confirm-counter'}">
      ${isLastHole ? '✅ 最終ホール 入力完了' : '✓ 確定して次のホールへ →'}
    </button>

    <!-- 設定・表示切替（小さく下部） -->
    <div class="gw-si-settings">
      <button class="gw-si-cycle-mini" data-action="cycle-display">表示: ${DISPLAY_LABELS[settings.displayMode]}</button>
      <div class="gw-si-toggle">
        <button class="${settings.inputMode === 'simple' ? 'is-on' : ''}" data-action="mode-simple">シンプル</button>
        <button class="${settings.inputMode === 'counter' ? 'is-on' : ''}" data-action="mode-counter">カウンター</button>
      </div>
      <label class="gw-si-switch">
        <input type="checkbox" data-action="toggle-putt" ${settings.puttEnabled ? 'checked' : ''}>
        <span>パット</span>
      </label>
      <button class="gw-si-clear-mini" data-action="clear-hole">クリア</button>
    </div>
  `;

  bindEvents();
}

/** ⚡ 圧縮シンプルモード：[−][大きな数字][＋] を1行で */
function renderSimpleCompact(current, diffColor, display) {
  return `
    <div class="gw-si-compact-row">
      <button class="gw-si-side-btn gw-si-minus" data-action="dec">−</button>
      <div class="gw-si-center-display" style="border-color:${diffColor};">
        <div class="gw-si-big-number" style="color:${diffColor};">${current}</div>
        <div class="gw-si-display-alt" style="color:${diffColor};">${display}</div>
      </div>
      <button class="gw-si-side-btn gw-si-plus" data-action="inc">＋</button>
    </div>
  `;
}

/** ⚡ 圧縮カウンターモード：ショット/パットを横並びコンパクト */
function renderCounterCompact(stroke, putt) {
  const shots = (stroke != null && putt != null) ? (stroke - putt) : (stroke != null ? stroke : 0);
  const putts = putt != null ? putt : 0;
  const total = shots + putts;
  return `
    <div class="gw-si-counter-compact">
      <div class="gw-si-counter-cell">
        <div class="gw-si-counter-label">ショット</div>
        <div class="gw-si-counter-val">${shots}</div>
        <button class="gw-si-counter-btn" data-action="shot-plus">+1</button>
      </div>
      <div class="gw-si-counter-cell">
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
      <span class="gw-si-putt-label">🥅 パット数</span>
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

[EVENTS.SCORE_UPDATED, EVENTS.HOLE_CHANGED, EVENTS.PLAYER_CHANGED, 'putt:updated', 'settings:changed', 'course:changed', 'state:restored', EVENTS.GROUP_SYNCED]
  .forEach(ev => EventBus.on(ev, render));
