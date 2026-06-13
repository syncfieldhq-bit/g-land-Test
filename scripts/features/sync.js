// =============================================================
// sync.js - グループ同期（Phase 7f：プレイヤー全員リアルタイム反映）
// GAS連携 + ローカルマージで「全員のスコアカード」を維持
// =============================================================
import { GAS_URL, EVENTS } from '../core/constants.js';
import { EventBus } from '../core/event-bus.js';
import { State } from '../core/state.js';

let _syncTimer = null;
let _syncInterval = 5000; // 5秒間隔（よりリアルタイム）
let _enabled = false;
let _debounceTimer = null;

async function sendData(payload) {
  try {
    await fetch(GAS_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload),
    });
    return true;
  } catch (e) {
    console.warn('[Sync] send failed:', e);
    return false;
  }
}

async function fetchGroup(groupId) {
  try {
    const res = await fetch(`${GAS_URL}?action=getGroup&groupId=${encodeURIComponent(groupId)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.warn('[Sync] fetch failed:', e);
    return null;
  }
}

/**
 * 🔄 リモートから取得したプレイヤー情報をローカルStateにマージ
 * - 自分（isSelf）は上書きしない
 * - 既存の同伴者はスコアを更新
 * - 新規参加者は追加
 */
function mergeRemotePlayers(remotePlayers) {
  if (!Array.isArray(remotePlayers)) return false;
  const localPlayers = State.getPlayers();
  const self = State.getSelf();
  let changed = false;

  remotePlayers.forEach(rp => {
    // 自分自身はスキップ
    if (self && rp.id === self.id) return;
    if (!rp.id || !rp.name) return;

    const existing = localPlayers.find(p => p.id === rp.id);
    if (existing) {
      // 既存プレイヤー：スコアを更新
      if (rp.scores && Array.isArray(rp.scores)) {
        existing.scores = rp.scores;
        changed = true;
      }
      if (rp.putts && Array.isArray(rp.putts)) {
        existing.putts = rp.putts;
      }
      if (rp.name !== existing.name) {
        existing.name = rp.name;
        changed = true;
      }
    } else {
      // 新規参加者：追加
      State.addPlayer({
        id: rp.id,
        name: rp.name,
        scores: rp.scores || [],
        putts: rp.putts || [],
        isPublic: rp.isPublic !== false,
        isHost: !!rp.isHost,
        isSelf: false,
      });
      changed = true;
    }
  });

  if (changed) {
    EventBus.emit(EVENTS.GROUP_SYNCED, { players: remotePlayers });
  }
  return changed;
}

export const Sync = {
  /** グループ作成（ホスト） */
  async createGroup(name) {
    const groupId = `g_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const self = State.getSelf();
    const course = State.getCourse();
    const group = {
      id: groupId,
      name: name || 'コンペ',
      hostId: self?.id,
      course: course ? { id: course.id, name: course.name, variant: course.variant, holes: course.holes, pars: course.pars } : null,
      createdAt: Date.now(),
    };
    State.setGroup(group);
    await sendData({
      action: 'createGroup',
      group,
      host: serializePlayer(self),
    });
    this.start();
    return group;
  },

  /** グループ参加 */
  async joinGroup(groupId) {
    const self = State.getSelf();
    const group = { id: groupId, joinedAt: Date.now() };
    State.setGroup(group);
    await sendData({
      action: 'joinGroup',
      groupId,
      player: serializePlayer(self),
    });
    // 即座にプル → 他メンバー情報取得
    await this.pullGroup();
    this.start();
    return group;
  },

  /** グループ離脱 */
  async leaveGroup() {
    const group = State.getGroup();
    if (group) {
      await sendData({
        action: 'leaveGroup',
        groupId: group.id,
        playerId: State.getSelf()?.id
      });
    }
    State.clearGroup();
    this.stop();
  },

  /** 自分のスコアをサーバーへ送信 */
  async pushScores() {
    const group = State.getGroup();
    if (!group) return;
    const self = State.getSelf();
    if (!self) return;
    await sendData({
      action: 'updateScores',
      groupId: group.id,
      player: serializePlayer(self),
    });
  },

  /** サーバーから全員のスコアを取得してマージ */
  async pullGroup() {
    const group = State.getGroup();
    if (!group) return null;
    const data = await fetchGroup(group.id);
    if (data && data.players) {
      mergeRemotePlayers(data.players);
    }
    return data;
  },

  /** 定期同期スタート */
  start(interval) {
    if (_syncTimer) clearInterval(_syncTimer);
    if (interval) _syncInterval = interval;
    _enabled = true;
    _syncTimer = setInterval(async () => {
      await this.pushScores();
      await this.pullGroup();
    }, _syncInterval);
  },

  stop() {
    if (_syncTimer) clearInterval(_syncTimer);
    _syncTimer = null;
    _enabled = false;
  },

  isEnabled() { return _enabled; },
};

function serializePlayer(p) {
  if (!p) return null;
  return {
    id: p.id,
    name: p.name,
    scores: p.scores,
    putts: p.putts,
    isPublic: p.isPublic !== false,
    isHost: !!p.isHost,
  };
}

// スコア更新時に自動プッシュ（デバウンス）
EventBus.on(EVENTS.SCORE_UPDATED, () => {
  if (!_enabled) return;
  clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(() => Sync.pushScores(), 1000);
});
EventBus.on('putt:updated', () => {
  if (!_enabled) return;
  clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(() => Sync.pushScores(), 1000);
});
