// =============================================================
// gland.js - G-LAND 画面（コース選択 + スコア入力 + スコアカード）
// =============================================================
import { State } from '../core/state.js';
import { EventBus } from '../core/event-bus.js';
import { EVENTS, COURSES } from '../core/constants.js';
import * as Store from '../core/storage.js';
import { toast } from '../ui/toast.js';
import { mountScoreInput } from '../widgets/score-input.js';
import { mountScorecard } from '../widgets/scorecard.js';
import { mountPlayerTabs } from '../widgets/player-tabs.js';
import { openCompanionModal } from '../widgets/companion-modal.js';

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

  // 自分をプレイヤーとして登録
  ensureSelfPlayer(profile);

  const course = State.getCourse();
  if (!course) {
    _root.innerHTML = renderCourseSelect();
    bindCourseEvents();
    return;
  }

  // メイン画面
  _root.innerHTML = renderMain();
  if (!_mounted) {
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
      <p style="color:rgba(255,255,255,0.7);font-size:13px;">あなたのニックネームを教えてください。</p>
      <label>ニックネーム</label>
      <input type="text" id="gw-input-nick" placeholder="例: タロウ" maxlength="20">
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
    const isPublic = document.getElementById('gw-input-public').checked;
    if (!name) { toast('ニックネームを入力してください', 'error'); return; }
    Store.saveProfile({ name, isPublic, createdAt: Date.now() });
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
  let html = `<div class="gw-card"><h2 style="color:#f5c842;">本日のコースを選択</h2>`;
  const groups = {};
  for (const [id, c] of Object.entries(COURSES)) {
    const key = c.name;
    if (!groups[key]) groups[key] = [];
    groups[key].push({ id, ...c });
  }
  for (const [name, variants] of Object.entries(groups)) {
    html += `<div class="gw-cs-group"><h3>${name}</h3>`;
    for (const v of variants) {
      html += `<button class="gw-cs-btn" data-course="${v.id}">${v.variant} (${v.holes}H)</button>`;
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
      toast(`${c.name} ${c.variant} で開始`, 'success');
    });
  });
}

function renderMain() {
  const course = State.getCourse();
  return `
    <div class="gw-gland-main">
      <div class="gw-gland-courseinfo">
        <span>⛳ ${course.name} <small>(${course.variant})</small></span>
        <button class="gw-mini-btn" data-action="change-course">変更</button>
      </div>
      <div id="gw-gland-tabs"></div>
      <div id="gw-gland-input"></div>
      <details class="gw-gland-cardwrap">
        <summary>📊 スコアカードを開く</summary>
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
    case 'change-course':
      if (confirm('コースを変更しますか？（スコアはクリアされます）')) {
        State.reset();
        _mounted = false;
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
        toast('履歴に保存しました', 'success');
        EventBus.emit(EVENTS.ROUND_FINISHED);
      }
      break;
  }
}

// 自動セーブ
[EVENTS.SCORE_UPDATED, 'putt:updated', EVENTS.PLAYER_ADDED, EVENTS.PLAYER_REMOVED, 'course:changed']
  .forEach(ev => EventBus.on(ev, () => {
    const snap = State.snapshot();
    if (snap.course) Store.saveRoundDraft(snap);
  }));
