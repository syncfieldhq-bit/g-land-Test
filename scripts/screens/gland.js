// =============================================================
// gland.js - G-LAND画面（Phase 7c：招待QRボタン最上部配置）
// =============================================================
import { State } from '../core/state.js';
import { EventBus } from '../core/event-bus.js';
import { EVENTS, COURSES } from '../core/constants.js';
import * as Store from '../core/storage.js';
import { toast } from '../ui/toast.js';
import { mountScoreInput } from '../widgets/score-input.js';
import { mountScorecard } from '../widgets/scorecard.js';
import { mountPlayerTabs } from '../widgets/player-tabs.js';
import { openInviteQR } from '../widgets/invite-qr.js';

let _root = null;
let _mounted = false;

export function renderGLand() {
  if (!_root) {
    _root = document.getElementById('gw-screen-gland');
    if (!_root) return;
  }
  const profile = Store.getProfile();
  if (!profile) {
    _root.innerHTML = renderRegister();
    bindRegisterEvents();
    return;
  }

  ensureSelfPlayer(profile);

  const course = State.getCourse();
  if (!course) {
    _root.innerHTML = renderCourseSelect();
    bindCourseEvents();
    return;
  }

  if (!_mounted || !_root.querySelector('#gw-gland-input')) {
    _root.innerHTML = renderMain();
    mountPlayerTabs(document.getElementById('gw-gland-tabs'));
    mountScoreInput(document.getElementById('gw-gland-input'));
    mountScorecard(document.getElementById('gw-gland-card'));
    _mounted = true;
  }
  bindMainEvents();
}

function renderRegister() {
  return `
    <div class="gw-card">
      <h2 style="color:#f5c842;">⛳ はじめまして</h2>
      <p style="color:rgba(255,255,255,0.7);font-size:13px;">あなたのお名前を教えてください。</p>
      <label>ニックネーム（表示名）</label>
      <input type="text" id="gw-input-nick" placeholder="例: タロウ" maxlength="20" autocomplete="off">
      <label>本名（氏名・任意）</label>
      <input type="text" id="gw-input-realname" placeholder="例: 山田 太郎" maxlength="30" autocomplete="off">
      <label class="gw-cm-public-row">
        <input type="checkbox" id="gw-input-public" checked>
        <span>ランキングに公開する</span>
      </label>
      <button class="gw-btn-primary" data-action="register">登録して始める</button>
    </div>
  `;
}

function bindRegisterEvents() {
  _root.querySelector('[data-action="register"]').addEventListener('click', () => {
    const name = document.getElementById('gw-input-nick').value.trim();
    const realName = document.getElementById('gw-input-realname').value.trim();
    const isPublic = document.getElementById('gw-input-public').checked;
    if (!name) { toast('ニックネームを入力してください', 'error'); return; }
    Store.saveProfile({ name, realName, isPublic, createdAt: Date.now() });
    toast(`ようこそ、${name}さん！`, 'success');
    renderGLand();
  });
}

function ensureSelfPlayer(profile) {
  if (State.getSelf()) return;
  State.addPlayer({
    name: profile.name,
    isSelf: true,
    isPublic: profile.isPublic !== false,
  });
}

function renderCourseSelect() {
  let html = `
    <div class="gw-card">
      <h2 style="color:#f5c842;text-align:center;">⚡ 本日のコースを選択</h2>
      <p style="color:rgba(255,255,255,0.6);font-size:12px;text-align:center;margin:0 0 16px;">
        タップで即スタート ⛳
      </p>
  `;
  const groups = {};
  for (const [id, c] of Object.entries(COURSES)) {
    const key = c.name;
    if (!groups[key]) groups[key] = [];
    groups[key].push({ id, ...c });
  }
  for (const [name, variants] of Object.entries(groups)) {
    html += `<div class="gw-cs-group"><h3>${escapeHtml(name)}</h3>`;
    for (const v of variants) {
      const icon = v.holes === 18 ? '🔵' : '🟢';
      html += `
        <button class="gw-cs-btn gw-cs-instant" data-course="${v.id}">
          <span class="gw-cs-icon">${icon}</span>
          <span class="gw-cs-text">
            <span class="gw-cs-variant">${escapeHtml(v.variant)}</span>
            <span class="gw-cs-holes">${v.holes}ホール</span>
          </span>
          <span class="gw-cs-arrow">▶</span>
        </button>
      `;
    }
    html += `</div>`;
  }
  html += '</div>';
  return html;
}

function bindCourseEvents() {
  _root.querySelectorAll('.gw-cs-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.course;
      const c = COURSES[id];
      State.setCourse({ id, ...c });
      toast(`${c.name} ${c.variant} スタート！`, 'success', 1500);
      _mounted = false;
      renderGLand();
    });
  });
}

function renderMain() {
  const course = State.getCourse();
  return `
    <div class="gw-gland-main">
      <!-- 🎯 最上部バー：コース名 / 招待QR / 変更 -->
      <div class="gw-gland-topbar">
        <div class="gw-gland-courseinfo-name">
          <span class="gw-gland-courseicon">⛳</span>
          <span class="gw-gland-coursename">${escapeHtml(course.name)}</span>
          <span class="gw-gland-coursevariant">${escapeHtml(course.variant)}</span>
        </div>
        <div class="gw-gland-topbar-actions">
          <button class="gw-topbar-qr-btn" data-action="open-invite-qr">
            <span class="gw-qr-icon">📲</span>
            <span class="gw-qr-text">招待QR</span>
          </button>
          <button class="gw-mini-btn" data-action="change-course">変更</button>
        </div>
      </div>

      <div id="gw-gland-tabs"></div>
      <div id="gw-gland-input"></div>

      <details class="gw-gland-cardwrap" open>
        <summary>📊 スコアカード（全員のスコア）</summary>
        <div id="gw-gland-card"></div>
      </details>

      <div class="gw-gland-actions">
        <button class="gw-btn-primary" data-action="finish">✅ ラウンド終了して保存</button>
      </div>
    </div>
  `;
}

function bindMainEvents() {
  _root.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', () => handleMain(el.dataset.action));
  });
}

function handleMain(action) {
  switch (action) {
    case 'open-invite-qr':
      openInviteQR();
      break;
    case 'change-course':
      if (confirm('コースを変更しますか？\n（現在のスコアは破棄されます）')) {
        State.reset();
        Store.clearRoundDraft();
        _mounted = false;
        const profile = Store.getProfile();
        if (profile) ensureSelfPlayer(profile);
        renderGLand();
      }
      break;
    case 'finish':
      if (confirm('ラウンドを終了して履歴に保存しますか？')) {
        const snap = State.snapshot();
        Store.appendRound({
          course: snap.course,
          players: snap.players,
          group: snap.group,
        });
        Store.clearRoundDraft();
        State.reset();
        _mounted = false;
        toast('履歴に保存しました 🎉', 'success');
        EventBus.emit(EVENTS.ROUND_FINISHED);
        location.hash = '#home';
      }
      break;
  }
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'
  }[c]));
}

// 自動セーブ
[EVENTS.SCORE_UPDATED, 'putt:updated', EVENTS.PLAYER_ADDED, EVENTS.PLAYER_REMOVED,
 EVENTS.HOLE_CHANGED, 'course:changed', 'player:renamed']
  .forEach(ev => EventBus.on(ev, () => {
    const snap = State.snapshot();
    if (snap.course) Store.saveRoundDraft(snap);
  }));

EventBus.on('route:changed', (name) => {
  if (name === 'gland') renderGLand();
});
