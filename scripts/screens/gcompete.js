// =============================================================
// gcompete.js - G-COMPETE 画面（QR共有 + リーダーボード）
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
      <p class="gw-gc-lead">仲間内コンペを作成・参加して、リアルタイムでスコアを共有しよう。</p>

      <div class="gw-gc-cards">
        <div class="gw-gc-card">
          <h3>👑 ホストになる</h3>
          <p>新しいコンペを作成して、参加者にQRを共有します。</p>
          <input type="text" id="gw-gc-name" placeholder="コンペ名（例: 第3回 月例コンペ）" maxlength="30">
          <button class="gw-btn-primary" data-action="create-group">コンペを作成</button>
        </div>
        <div class="gw-gc-card">
          <h3>📷 参加する</h3>
          <p>ホストが表示したQRコードを読み取って参加します。</p>
          <input type="text" id="gw-gc-code" placeholder="グループID または QRリンク" maxlength="80">
          <button class="gw-btn-primary" data-action="join-group">参加する</button>
        </div>
      </div>
    </div>
  `;
}

function renderActive(group) {
  const board = compute();
  const joinURL = buildJoinURL(group.id);
  const qrSvg = generateQR(joinURL, { scale: 6, margin: 2 });

  return `
    <div class="gw-gc-active">
      <div class="gw-gc-header">
        <div>
          <div class="gw-gc-group-name">${escapeHtml(group.name || 'コンペ')}</div>
          <div class="gw-gc-group-id">ID: ${group.id}</div>
        </div>
        <button class="gw-gc-leave" data-action="leave-group">退出</button>
      </div>

      <div class="gw-gc-qr-wrap">
        <h3>📲 招待QRコード</h3>
        <div class="gw-gc-qr">${qrSvg}</div>
        <div class="gw-gc-qr-url">
          <input readonly value="${joinURL}" id="gw-gc-url">
          <button data-action="copy-url">コピー</button>
        </div>
      </div>

      <div class="gw-gc-board">
        <h3>🏆 リーダーボード</h3>
        ${renderBoard(board)}
      </div>

      <div class="gw-gc-actions">
        <button class="gw-btn-secondary" data-action="refresh">🔄 最新化</button>
        <button class="gw-btn-primary" data-action="show-share">URLを共有</button>
      </div>
    </div>
  `;
}

function renderBoard(board) {
  if (!board.length) return '<p style="color:#aaa;text-align:center;padding:20px;">公開プレイヤーがいません</p>';
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
    el.addEventListener('click', () => handle(el.dataset.action));
  });
}

async function handle(action) {
  switch (action) {
    case 'create-group': {
      const name = document.getElementById('gw-gc-name').value.trim();
      const self = State.getSelf();
      if (!self) { toast('先にニックネームを登録してください', 'error'); return; }
      self.isHost = true;
      const g = await Sync.createGroup(name || 'コンペ');
      toast(`コンペ「${g.name}」を作成しました`, 'success');
      renderGCompete();
      break;
    }
    case 'join-group': {
      const code = document.getElementById('gw-gc-code').value.trim();
      if (!code) { toast('コードを入力してください', 'error'); return; }
      const id = extractGroupId(code);
      await Sync.joinGroup(id);
      toast(`コンペに参加しました`, 'success');
      renderGCompete();
      break;
    }
    case 'leave-group': {
      if (!confirm('コンペから退出しますか？')) return;
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
      await Sync.pullGroup();
      renderGCompete();
      toast('最新化しました', 'info');
      break;
    }
    case 'show-share': {
      const url = document.getElementById('gw-gc-url').value;
      if (navigator.share) {
        try { await navigator.share({ title: 'G-WORLDコンペ招待', url }); } catch {}
      } else {
        document.getElementById('gw-gc-url').select();
      }
      break;
    }
  }
}

function extractGroupId(code) {
  const m = code.match(/#join=(\S+)/);
  return m ? m[1] : code;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'
  }[c]));
}

// グループ更新時に再描画
[EVENTS.GROUP_JOINED, EVENTS.GROUP_SYNCED, EVENTS.SCORE_UPDATED, 'group:left']
  .forEach(ev => EventBus.on(ev, () => {
    if (document.getElementById('gw-screen-gcompete')?.classList.contains('active')) {
      renderGCompete();
    }
  }));
