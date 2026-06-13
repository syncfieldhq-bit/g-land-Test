// =============================================================
// gcompete.js - G-COMPETE 画面（Phase 7d：未実装機能 Coming Soon 化）
// 動作する機能: その組専用の招待QR表示・プライベートグループ作成（ローカル）
// Coming Soon: コンペ参加（GAS同期）・全国ランキング・トーナメント等
// =============================================================
import { State } from '../core/state.js';
import { EventBus } from '../core/event-bus.js';
import { EVENTS } from '../core/constants.js';
import { Sync } from '../features/sync.js';
import { compute } from '../features/leaderboard.js';
import { generateQR } from '../core/qr.js';
import { toast } from '../ui/toast.js';

let _root = null;

export function renderGCompete() {
  if (!_root) {
    _root = document.getElementById('gw-screen-gcompete');
    if (!_root) return;
  }
  const group = State.getGroup();
  if (!group) {
    _root.innerHTML = renderEntry();
  } else {
    _root.innerHTML = renderActive(group);
  }
  bindEvents();
}

function renderEntry() {
  return `
    <div class="gw-gc-entry">
      <h2 class="gw-gc-title">🏆 G-COMPETE</h2>
      <p class="gw-gc-lead">仲間内で集まってラウンドを楽しもう。<br>QRを共有してスコアをみんなで管理できます。</p>

      <div class="gw-gc-cards">
        <!-- ✅ 動く機能：プライベートグループ作成（招待QR） -->
        <div class="gw-gc-card gw-gc-card-active">
          <div class="gw-gc-card-badge gw-gc-badge-ready">✓ 利用可能</div>
          <h3>📲 プライベート招待QR</h3>
          <p>その組専用のQRコードを発行。<br>同伴者は読み取るだけで参加できます。</p>
          <input type="text" id="gw-gc-name" placeholder="ルーム名（例: 仲良し4人組）" maxlength="30">
          <button class="gw-btn-primary" data-action="create-private">招待QRを表示する</button>
        </div>

        <!-- 🔒 Coming Soon：コンペ参加 -->
        <div class="gw-gc-card gw-gc-card-soon" data-action="coming-soon" data-feature="他コンペへ参加">
          <span class="gw-gc-lock-icon">🔒</span>
          <div class="gw-gc-card-badge gw-gc-badge-soon">Coming Soon</div>
          <h3>📷 他のコンペに参加</h3>
          <p>友達のコンペQRを読み取って<br>合流できる機能です。</p>
          <button class="gw-btn-soon" disabled>近日公開</button>
        </div>

        <!-- 🔒 Coming Soon：月例コンペ -->
        <div class="gw-gc-card gw-gc-card-soon" data-action="coming-soon" data-feature="月例コンペ">
          <span class="gw-gc-lock-icon">🔒</span>
          <div class="gw-gc-card-badge gw-gc-badge-soon">Coming Soon</div>
          <h3>📅 月例コンペ</h3>
          <p>定期コンペの自動管理。<br>順位表・幹事支援機能。</p>
          <button class="gw-btn-soon" disabled>近日公開</button>
        </div>

        <!-- 🔒 Coming Soon：全国ランキング -->
        <div class="gw-gc-card gw-gc-card-soon" data-action="coming-soon" data-feature="全国ランキング">
          <span class="gw-gc-lock-icon">🔒</span>
          <div class="gw-gc-card-badge gw-gc-badge-soon">Coming Soon</div>
          <h3>🌐 全国ランキング</h3>
          <p>同じコースをプレーした<br>全国の仲間とスコア比較。</p>
          <button class="gw-btn-soon" disabled>近日公開</button>
        </div>

        <!-- 🔒 Coming Soon：トーナメント -->
        <div class="gw-gc-card gw-gc-card-soon" data-action="coming-soon" data-feature="トーナメント">
          <span class="gw-gc-lock-icon">🔒</span>
          <div class="gw-gc-card-badge gw-gc-badge-soon">Coming Soon</div>
          <h3>🏅 トーナメント</h3>
          <p>マッチプレー・ストロークプレーの<br>本格トーナメント形式。</p>
          <button class="gw-btn-soon" disabled>近日公開</button>
        </div>

      </div>

      <div class="gw-gc-info-box">
        <p>💡 <strong>現在公開中の機能：</strong>その組専用の招待QR共有のみです。<br>他の機能は順次リリース予定！お楽しみに🚀</p>
      </div>
    </div>
  `;
}

function renderActive(group) {
  const board = compute();
  const joinURL = buildJoinURL(group.id);
  let qrSvg;
  try {
    qrSvg = generateQR(joinURL, { scale: 7, margin: 2, fg: '#0a3d2e', bg: '#ffffff' });
  } catch (e) {
    qrSvg = '<div style="color:#e74c3c;">QR生成失敗</div>';
  }

  return `
    <div class="gw-gc-active">
      <div class="gw-gc-header">
        <div>
          <div class="gw-gc-group-name">${escapeHtml(group.name || 'プライベートルーム')}</div>
          <div class="gw-gc-group-id">ID: ${escapeHtml(group.id)}</div>
        </div>
        <button class="gw-gc-leave" data-action="leave-group">退出</button>
      </div>

      <div class="gw-gc-qr-wrap">
        <h3>📲 招待QRコード</h3>
        <div class="gw-gc-qr">${qrSvg}</div>
        <div class="gw-gc-qr-url">
          <input readonly value="${escapeHtml(joinURL)}" id="gw-gc-url">
          <button data-action="copy-url">コピー</button>
        </div>
      </div>

      <div class="gw-gc-board">
        <h3>🏆 リーダーボード</h3>
        ${renderBoard(board)}
      </div>

      <!-- 🔒 GAS同期は Coming Soon -->
      <div class="gw-gc-soon-row" data-action="coming-soon" data-feature="リアルタイム同期">
        <span class="gw-gc-lock-icon">🔒</span>
        <div class="gw-gc-soon-text">
          <strong>☁️ クラウド同期</strong>
          <small>同伴者のスコアをリアルタイムで集約（近日公開）</small>
        </div>
        <span class="gw-gc-soon-badge">Coming Soon</span>
      </div>

      <div class="gw-gc-actions">
        <button class="gw-btn-secondary" data-action="refresh">🔄 スコア更新</button>
        <button class="gw-btn-primary" data-action="show-share">📤 リンクを共有</button>
      </div>
    </div>
  `;
}

function renderBoard(board) {
  if (!board.length) {
    return '<p style="color:rgba(255,255,255,0.7);text-align:center;padding:20px;">公開プレイヤーがいません</p>';
  }
  let html = '<table class="gw-gc-board-table"><thead><tr><th>順位</th><th>名前</th><th>済</th><th>計</th><th>±</th></tr></thead><tbody>';
  for (const r of board) {
    html += `
      <tr class="${r.isSelf ? 'is-self' : ''}">
        <td class="gw-gc-rank">${r.medal || r.rank}</td>
        <td class="gw-gc-name">${r.isSelf ? '👤' : (r.isHost ? '👑' : '')}${escapeHtml(r.name)}</td>
        <td>${r.played}</td>
        <td>${r.total || '-'}</td>
        <td class="gw-gc-diff">${r.played ? r.diffStr : '-'}</td>
      </tr>
    `;
  }
  html += '</tbody></table>';
  return html;
}

function buildJoinURL(groupId) {
  const base = location.origin + location.pathname.replace(/\/$/, '');
  return `${base}/#join=${groupId}`;
}

function bindEvents() {
  _root.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', (e) => {
      // Coming Soon カードは子要素まで含めてイベントバブリングを処理
      e.stopPropagation();
      handle(el.dataset.action, el);
    });
  });
}

async function handle(action, el) {
  switch (action) {
    case 'coming-soon': {
      const feature = el.dataset.feature || 'この機能';
      toast(`「${feature}」は近日公開予定です 🚀`, 'info', 2500);
      break;
    }
    case 'create-private': {
      const name = document.getElementById('gw-gc-name').value.trim();
      const self = State.getSelf();
      if (!self) { toast('先にニックネームを登録してください', 'error'); return; }
      self.isHost = true;
      try {
        const g = await Sync.createGroup(name || 'プライベートルーム');
        toast(`招待ルーム「${g.name}」を作成しました 🎉`, 'success');
        renderGCompete();
      } catch (e) {
        toast('作成に失敗しました', 'error');
      }
      break;
    }
    case 'leave-group': {
      if (!confirm('ルームから退出しますか？\n（招待QRは無効になります）')) return;
      await Sync.leaveGroup();
      toast('退出しました', 'info');
      renderGCompete();
      break;
    }
    case 'copy-url': {
      const url = document.getElementById('gw-gc-url').value;
      try {
        await navigator.clipboard.writeText(url);
        toast('URLをコピーしました', 'success');
      } catch (e) {
        toast('コピーに失敗しました', 'error');
      }
      break;
    }
    case 'refresh': {
      renderGCompete();
      toast('表示を更新しました', 'info');
      break;
    }
    case 'show-share': {
      const url = document.getElementById('gw-gc-url').value;
      if (navigator.share) {
        try { await navigator.share({ title: 'G-WORLD ルーム招待', url }); } catch {}
      } else {
        try {
          await navigator.clipboard.writeText(url);
          toast('URLをコピーしました', 'success');
        } catch (e) {/**/}
      }
      break;
    }
  }
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'
  }[c]));
}

[EVENTS.GROUP_JOINED, EVENTS.GROUP_SYNCED, EVENTS.SCORE_UPDATED, 'group:left']
  .forEach(ev => EventBus.on(ev, () => {
    if (document.getElementById('gw-screen-gcompete')?.classList.contains('active')) {
      renderGCompete();
    }
  }));
