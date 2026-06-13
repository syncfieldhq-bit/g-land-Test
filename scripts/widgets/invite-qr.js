// =============================================================
// invite-qr.js - その組限定の招待QRモーダル
// グループ未作成ならその場で作成してQR表示
// =============================================================
import { State } from '../core/state.js';
import { Sync } from '../features/sync.js';
import { generateQR } from '../core/qr.js';
import { toast } from '../ui/toast.js';

let _modal = null;

function build() {
  if (_modal) return _modal;
  _modal = document.createElement('div');
  _modal.className = 'gw-invite-qr-modal';
  _modal.innerHTML = `
    <div class="gw-invite-qr-backdrop"></div>
    <div class="gw-invite-qr-sheet">
      <div class="gw-invite-qr-header">
        <h3>📲 招待QRコード</h3>
        <button class="gw-invite-qr-close">×</button>
      </div>
      <div class="gw-invite-qr-body" id="gw-invite-qr-body"></div>
    </div>
  `;
  document.body.appendChild(_modal);
  _modal.querySelector('.gw-invite-qr-backdrop').addEventListener('click', close);
  _modal.querySelector('.gw-invite-qr-close').addEventListener('click', close);
  return _modal;
}

export async function openInviteQR() {
  build();
  const body = _modal.querySelector('#gw-invite-qr-body');
  let group = State.getGroup();

  // グループ未作成なら自動で作成（その組専用ルーム）
  if (!group) {
    body.innerHTML = `<div class="gw-invite-qr-loading">グループを作成中...</div>`;
    requestAnimationFrame(() => _modal.classList.add('is-open'));
    try {
      const self = State.getSelf();
      if (!self) {
        body.innerHTML = `<div class="gw-invite-qr-error">先にプロフィール登録を完了してください。</div>`;
        return;
      }
      self.isHost = true;
      const course = State.getCourse();
      const name = course ? `${course.name} ${course.variant}` : 'プライベートラウンド';
      group = await Sync.createGroup(name);
      toast('招待ルームを作成しました', 'success');
    } catch (e) {
      console.error('[InviteQR] create failed:', e);
      body.innerHTML = `<div class="gw-invite-qr-error">作成に失敗しました：${e.message}</div>`;
      return;
    }
  } else {
    requestAnimationFrame(() => _modal.classList.add('is-open'));
  }

  // QR生成
  const joinURL = buildJoinURL(group.id);
  let qrSvg;
  try {
    qrSvg = generateQR(joinURL, { scale: 8, margin: 2, fg: '#0a3d2e', bg: '#ffffff' });
  } catch (e) {
    qrSvg = '<div style="color:#e74c3c;">QR生成失敗</div>';
  }

  const groupName = group.name || 'プライベートラウンド';
  body.innerHTML = `
    <div class="gw-invite-qr-info">
      <div class="gw-invite-qr-groupname">${escapeHtml(groupName)}</div>
      <div class="gw-invite-qr-groupid">ID: ${escapeHtml(group.id)}</div>
    </div>
    <div class="gw-invite-qr-image">${qrSvg}</div>
    <p class="gw-invite-qr-hint">
      📷 同伴者にこのQRを読み取ってもらうと<br>
      自動で同じ組に参加できます
    </p>
    <div class="gw-invite-qr-url">
      <input readonly value="${escapeHtml(joinURL)}" id="gw-invite-qr-url-input">
      <button data-action="copy">コピー</button>
    </div>
    <div class="gw-invite-qr-actions">
      <button class="gw-invite-qr-share" data-action="share">📤 リンクを共有</button>
    </div>
  `;

  body.querySelector('[data-action="copy"]').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(joinURL);
      toast('URLをコピーしました', 'success');
    } catch (e) {
      const input = body.querySelector('#gw-invite-qr-url-input');
      input.select();
      document.execCommand('copy');
      toast('URLをコピーしました', 'success');
    }
  });
  body.querySelector('[data-action="share"]').addEventListener('click', async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'G-WORLD コンペ招待',
          text: `${groupName} に参加しよう！`,
          url: joinURL,
        });
      } catch (e) {/* ユーザーキャンセル */}
    } else {
      try {
        await navigator.clipboard.writeText(joinURL);
        toast('共有機能なし → URLをコピーしました', 'info');
      } catch (e) {
        toast('URLをコピーできませんでした', 'error');
      }
    }
  });
}

function close() {
  if (_modal) _modal.classList.remove('is-open');
}

function buildJoinURL(groupId) {
  const base = location.origin + location.pathname.replace(/\/$/, '');
  return `${base}/#join=${groupId}`;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'
  }[c]));
}
