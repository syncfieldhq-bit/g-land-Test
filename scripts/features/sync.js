// =============================================================
// sync.js - GASスプレッドシート経由のグループ同期
// =============================================================
import { GAS_URL, EVENTS } from '../core/constants.js';
import { EventBus } from '../core/event-bus.js';
import { State } from '../core/state.js';

let _syncTimer = null;
let _syncInterval = 8000; // 8秒
let _enabled = false;

async function sendData(payload) {
  try {
    const res = await fetch(GAS_URL, {
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

export const Sync = {
  /** グループ作成（ホスト） */
  async createGroup(name) {
    const groupId = `g_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const self = State.getSelf();
    const group = {
      id: groupId,
      name: name || 'コンペ',
      hostId: self?.id,
      createdAt: Date.now(),
    };
    State.setGroup(group);
    await sendData({ action: 'createGroup', group, host: self });
    this.start();
    return group;
  },

  /** グループ参加 */
  async joinGroup(groupId) {
    const self = State.getSelf();
    const group = { id: groupId, joinedAt: Date.now() };
    State.setGroup(group);
    await sendData({ action: 'joinGroup', groupId, player: self });
    this.start();
    return group;
  },

  /** グループ離脱 */
  async leaveGroup() {
    const group = State.getGroup();
    if (group) {
      await sendData({ action: 'leaveGroup', groupId: group.id, playerId: State.getSelf()?.id });
    }
    State.clearGroup();
    this.stop();
  },

  /** スコア送信 */
  async pushScores() {
    const group = State.getGroup();
    if (!group) return;
    const self = State.getSelf();
    if (!self || !self.isPublic) return;
    await sendData({
      action: 'updateScores',
      groupId: group.id,
      playerId: self.id,
      name: self.name,
      scores: self.scores,
      putts: self.putts,
      isPublic: self.isPublic,
    });
  },

  /** グループメンバー取得 */
  async pullGroup() {
    const group = State.getGroup();
    if (!group) return null;
    const data = await fetchGroup(group.id);
    if (data) {
      EventBus.emit(EVENTS.GROUP_SYNCED, data);
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

// 自動連携：スコア更新時に押し出す
EventBus.on(EVENTS.SCORE_UPDATED, () => {
  if (_enabled) {
    // デバウンス
    clearTimeout(Sync._debounceTimer);
    Sync._debounceTimer = setTimeout(() => Sync.pushScores(), 1500);
  }
});
