/**
 * ═══════════════════════════════════════════════════════
 * scripts/screens/gland.js - G-LAND画面（スコア管理）
 *
 * Phase 3 では3つの状態を管理：
 *   1. 未登録 → 登録カード表示
 *   2. 登録済・コース未選択 → コース選択画面
 *   3. コース選択済 → スコア入力画面（widgets/score.js を呼ぶ）
 *
 * Phase 4 で同伴者ポップアップ等を追加予定。
 * ═══════════════════════════════════════════════════════
 */

import { State } from '../core/state.js';
import { Store } from '../core/storage.js';
import { STORAGE_KEYS } from '../core/config.js';
import { Calculator } from '../core/calculator.js';
import { toast } from '../ui/toast.js';
import { confirm } from '../ui/modal.js';
import { renderScore } from '../widgets/score.js';

export const GLandScreen = {
  /**
   * G-LAND画面を描画（状態に応じて分岐）
   * Phase 5: 起動時にドラフトを自動復元
   */
  render(container) {
    // 🆕 Phase 5：ドラフトを復元（初回のみ）
    this._tryRestoreDraft();

    if (!State.profile || !State.profile.nickname) {
      this._renderRegister(container);
    } else if (!State.courseId) {
      this._renderCourseSelect(container);
    } else {
      this._renderScoreMain(container);
    }
  },

  /**
   * 🆕 Phase 5：進行中ラウンドのドラフトを復元
   * State がまだコース未選択で、かつドラフトが存在する場合のみ復元
   */
  _tryRestoreDraft() {
    if (State.courseId) return; // 既に読み込み済み
    const draft = Store.loadRoundDraft();
    if (!draft) return;

    State.courseId = draft.courseId;
    State.variant = draft.variant;
    State.totalHoles = draft.totalHoles || 18;
    State.currentHole = draft.currentHole || 1;
    State.players = draft.players || [];
    if (draft.inputMode) State.inputMode = draft.inputMode;
    if (draft.puttMode) State.puttMode = draft.puttMode;
    console.log('[gland] draft restored:', draft.courseId, draft.variant);
  },

  /** ① 登録カード */
  _renderRegister(container) {
    container.innerHTML = `
      <div class="card register-card">
        <h2 class="card-title">⛳ はじめまして</h2>
        <p class="card-desc">
          G-WORLDをご利用いただきありがとうございます。<br>
          まずはお名前を教えてください。
        </p>
        <label>ニックネーム</label>
        <input type="text" id="input-nickname" placeholder="例: タロウ" autocomplete="off">
        <button class="btn-primary" data-action="register-profile">次へ →</button>
        <p class="card-note">※ 1度だけの登録です。次回以降は自動でログインします。</p>
      </div>
    `;

    // 既存の名前を予め入れる
    if (State.profile && State.profile.nickname) {
      document.getElementById('input-nickname').value = State.profile.nickname;
    }

    console.log('[screens/gland] register card rendered');
  },

  /** ② コース選択 */
  _renderCourseSelect(container) {
    const name = State.profile.nickname;

    container.innerHTML = `
      <div class="course-greet">
        ${escapeHtml(name)}さん、こんにちは
      </div>
      <h2 class="screen-title">本日のコースを選択</h2>
      <div class="course-list">
        ${this._buildCourseCards()}
      </div>
      <button class="btn-ghost" data-action="back-to-register" style="margin-top:14px;">
        ← 名前を変更する
      </button>
    `;

    console.log('[screens/gland] course select rendered');
  },

  _buildCourseCards() {
    const courses = [
      { id: 'rokko-international', icon: '🏌', name: '六甲国際パブリック', variants: [
        { v: '9H', label: '🟢 9H' }, { v: '18H', label: '🔵 18H' }
      ]},
      { id: 'rokko-west', icon: '⛳', name: '西コース', variants: [
        { v: 'OUT', label: '➡️ OUT' }, { v: 'IN', label: '⬅️ IN' }
      ]},
      { id: 'rokko-east', icon: '⛳', name: '東コース', variants: [
        { v: 'OUT', label: '➡️ OUT' }, { v: 'IN', label: '⬅️ IN' }
      ]}
    ];

    return courses.map((c) => `
      <div class="course-wrap" data-course-id="${c.id}">
        <button class="course-card" data-action="cs-toggle" data-course-id="${c.id}">
          <div class="course-icon">${c.icon}</div>
          <div class="course-info">
            <div class="course-name">${escapeHtml(c.name)}</div>
          </div>
          <div class="course-arrow">▼</div>
        </button>
        <div class="course-options">
          ${c.variants.map((v) => `
            <button class="course-variant" data-action="cs-confirm"
              data-course-id="${c.id}" data-variant="${v.v}">
              ${v.label}
            </button>
          `).join('')}
        </div>
      </div>
    `).join('');
  },

  /** ③ スコア入力メイン */
  _renderScoreMain(container) {
    const me = State.players[0];
    const courseName = getCourseName(State.courseId);

    container.innerHTML = `
      <div class="player-bar">
        <div>
          <div class="lbl">プレイヤー</div>
          <div class="me-name">${escapeHtml(me ? me.name : '-')}</div>
        </div>
        <div style="text-align:right;">
          <div class="lbl">コース</div>
          <div class="me-course">${escapeHtml(courseName)} ${escapeHtml(State.variant || '')}</div>
        </div>
      </div>

      <div id="score-area"></div>

      <div class="settings-panel">
        <div class="setting-row">
          <div class="setting-label">入力モード</div>
          <div class="toggle-group">
            <button id="mode-simple" data-action="set-mode-simple"
              class="${State.inputMode === 'simple' ? 'active' : ''}">シンプル</button>
            <button id="mode-counter" data-action="set-mode-counter"
              class="${State.inputMode === 'counter' ? 'active' : ''}">カウンター</button>
          </div>
        </div>
      </div>

      <button class="btn-primary" data-action="finish-round" style="margin-top:20px;">
        ✅ ラウンド終了
      </button>
      <button class="btn-ghost" data-action="change-course" style="margin-top:8px;">
        🔄 コース変更
      </button>
    `;

    // スコアウィジェットを描画
    const scoreArea = document.getElementById('score-area');
    renderScore(scoreArea);

    console.log('[screens/gland] score main rendered');
  },

  // ─── 公開アクション（main.jsから呼ばれる） ───

  /** 登録処理 */
  registerProfile() {
    const input = document.getElementById('input-nickname');
    if (!input) return;
    const nick = input.value.trim();
    if (!nick) {
      toast('ニックネームを入力してください', { type: 'error' });
      return;
    }
    State.saveProfile({ nickname: nick, registeredAt: Date.now() });
    toast('登録完了！', { type: 'success' });
    // 再描画 → コース選択画面へ
    const container = document.getElementById('app-root');
    if (container) this.render(container);
  },

  /** コース選択トグル */
  toggleCourse(courseId) {
    document.querySelectorAll('.course-wrap').forEach((wrap) => {
      if (wrap.getAttribute('data-course-id') === courseId) {
        wrap.classList.toggle('open');
      } else {
        wrap.classList.remove('open');
      }
    });
  },

  /** コース確定 */
  confirmCourse(courseId, variant) {
    State.courseId = courseId;
    State.variant = variant;
    State.totalHoles = (variant === '9H') ? 9 : 18;
    State.currentHole = 1;
    State.players = [{
      id: 'me',
      name: State.profile.nickname,
      scores: new Array(State.totalHoles).fill(null),
      shots: new Array(State.totalHoles).fill(0),
      putts: new Array(State.totalHoles).fill(0),
      isMe: true
    }];
    toast(`${getCourseName(courseId)} ${variant} を選択`, { type: 'success' });
    // 再描画 → スコア入力画面へ
    const container = document.getElementById('app-root');
    if (container) this.render(container);
  },

  /** 入力モード切替 */
  setInputMode(mode) {
    State.saveInputMode(mode);
    toast(mode === 'simple' ? 'シンプルモード' : 'カウンターモード');
    // スコア領域だけ再描画
    const scoreArea = document.getElementById('score-area');
    if (scoreArea) renderScore(scoreArea);
    // モードボタンのactive更新
    document.getElementById('mode-simple')?.classList.toggle('active', mode === 'simple');
    document.getElementById('mode-counter')?.classList.toggle('active', mode === 'counter');
  },

  /** コース変更（State + ドラフトをリセット） */
  async changeCourse() {
    const ok = await confirm(
      'コース変更',
      '現在の入力中スコアは破棄されます。<br>本当にコースを変更しますか？'
    );
    if (!ok) return;

    // ドラフトも削除
    Store.clearRoundDraft();
    State.courseId = null;
    State.variant = null;
    State.players = [];
    State.currentHole = 1;
    const container = document.getElementById('app-root');
    if (container) this.render(container);
  },

  /**
   * 🆕 Phase 5：ラウンド終了 → 確認 → 履歴保存 → ドラフト削除
   */
  async finishRound() {
    const me = State.players[0];
    if (!me) {
      toast('プレイヤー情報がありません', { type: 'error' });
      return;
    }

    const summary = Calculator.summarize(me);
    const ok = await confirm(
      'ラウンドを終了',
      `合計 <b style="color:#ffe082;font-size:18px;">${summary.strokes}打</b> ` +
      `(PAR差 <b>${summary.diffStr}</b>)<br>` +
      `プレイ済 ${summary.playedHoles}/${summary.totalHoles}ホール<br><br>` +
      `このラウンドを履歴に保存しますか？`
    );

    if (!ok) return;

    // 履歴に追加
    Store.appendRound({
      date: new Date().toISOString().slice(0, 10),
      course: getCourseName(State.courseId),
      variant: State.variant,
      total: summary.strokes,
      diff: summary.diff,
      diffStr: summary.diffStr,
      playedHoles: summary.playedHoles,
      totalHoles: summary.totalHoles
    });

    // ドラフトを削除
    Store.clearRoundDraft();

    // State をリセット
    State.courseId = null;
    State.variant = null;
    State.players = [];
    State.currentHole = 1;

    toast('✅ 履歴に保存しました', { type: 'success' });

    // ホームへ遷移
    setTimeout(() => {
      const container = document.getElementById('app-root');
      // Router 経由でホームに戻す（main.js から渡されるルーターが必要だが、
      // ここでは location.hash を使ってホームへ）
      location.hash = '#home';
      location.reload();
    }, 1000);
  },

  /** 登録画面に戻る */
  backToRegister() {
    State.profile = null;
    Store.remove(STORAGE_KEYS.PROFILE);
    const container = document.getElementById('app-root');
    if (container) this.render(container);
  }
};

/** コース名取得ヘルパー */
function getCourseName(id) {
  const names = {
    'rokko-international': '六甲国際パブリック',
    'rokko-west': '西コース',
    'rokko-east': '東コース'
  };
  return names[id] || id || '';
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}

console.log('[screens/gland] loaded');
