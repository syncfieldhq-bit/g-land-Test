// =============================================================
// state.js - アプリ全体の状態管理（Phase 7 完全版）
// 16名対応・グループ・代理入力に対応
// =============================================================
import { APP } from './constants.js';
import { EventBus } from './event-bus.js';

const _state = {
  // プレイヤー：最大16名
  // { id, name, scores: [], putts: [], isPublic: true, isHost: false, isSelf: false }
  players: [],

  // 現在編集中のプレイヤーID（代理入力切替）
  activePlayerId: null,

  // 現在のホール（0-indexed）
  currentHole: 0,

  // コース
  course: null,  // { id, name, variant, holes, pars }

  // グループ（コンペモード時のみ）
  group: null,   // { id, name, hostId, joinedAt }

  // 設定（settings.js とミラー）
  settings: {
    inputMode: 'simple',
    displayMode: 'number',
    puttEnabled: false,
    isPublic: true,
  },
};

export const State = {
  // --- Getter ---
  getAll() { return _state; },
  getPlayers() { return _state.players; },
  getActivePlayer() {
    return _state.players.find(p => p.id === _state.activePlayerId) || _state.players[0];
  },
  getSelf() {
    return _state.players.find(p => p.isSelf);
  },
  getActiveId() { return _state.activePlayerId; },
  getHole() { return _state.currentHole; },
  getCourse() { return _state.course; },
  getGroup() { return _state.group; },
  getSettings() { return _state.settings; },

  // --- Setter ---
  setCourse(course) {
    _state.course = course;
    // プレイヤーのスコア配列を初期化
    _state.players.forEach(p => {
      if (!p.scores || p.scores.length !== course.holes) {
        p.scores = new Array(course.holes).fill(null);
        p.putts = new Array(course.holes).fill(null);
      }
    });
    EventBus.emit('course:changed', course);
  },

  setHole(idx) {
    if (idx < 0 || (_state.course && idx >= _state.course.holes)) return;
    _state.currentHole = idx;
    EventBus.emit('hole:changed', idx);
  },

  setActivePlayer(id) {
    if (!_state.players.find(p => p.id === id)) return;
    _state.activePlayerId = id;
    EventBus.emit('player:changed', id);
  },

  // --- プレイヤー管理 ---
  addPlayer(player) {
    if (_state.players.length >= APP.MAX_PLAYERS) return false;
    const id = player.id || `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const holes = _state.course ? _state.course.holes : APP.MAX_HOLES;
    const newPlayer = {
      id,
      name: player.name || 'ゲスト',
      scores: player.scores || new Array(holes).fill(null),
      putts: player.putts || new Array(holes).fill(null),
      isPublic: player.isPublic !== false,
      isHost: !!player.isHost,
      isSelf: !!player.isSelf,
    };
    _state.players.push(newPlayer);
    if (!_state.activePlayerId) _state.activePlayerId = id;
    EventBus.emit('player:added', newPlayer);
    return newPlayer;
  },

  removePlayer(id) {
    const idx = _state.players.findIndex(p => p.id === id);
    if (idx < 0) return false;
    if (_state.players[idx].isSelf) return false; // 自分は消せない
    _state.players.splice(idx, 1);
    if (_state.activePlayerId === id) {
      _state.activePlayerId = _state.players[0]?.id || null;
    }
    EventBus.emit('player:removed', id);
    return true;
  },

  renamePlayer(id, name) {
    const p = _state.players.find(p => p.id === id);
    if (!p) return false;
    p.name = name;
    EventBus.emit('player:renamed', { id, name });
    return true;
  },

  // --- スコア更新 ---
  setScore(playerId, holeIdx, stroke) {
    const p = _state.players.find(p => p.id === playerId);
    if (!p) return false;
    p.scores[holeIdx] = stroke;
    EventBus.emit('score:updated', { playerId, holeIdx, stroke });
    return true;
  },

  setPutt(playerId, holeIdx, putt) {
    const p = _state.players.find(p => p.id === playerId);
    if (!p) return false;
    p.putts[holeIdx] = putt;
    EventBus.emit('putt:updated', { playerId, holeIdx, putt });
    return true;
  },

  // --- 設定更新 ---
  updateSetting(key, value) {
    _state.settings[key] = value;
    EventBus.emit('settings:changed', { key, value });
  },

  // --- グループ ---
  setGroup(group) {
    _state.group = group;
    EventBus.emit('group:joined', group);
  },
  clearGroup() {
    _state.group = null;
    EventBus.emit('group:left', null);
  },

  // --- 全リセット ---
  reset() {
    _state.players = [];
    _state.activePlayerId = null;
    _state.currentHole = 0;
    _state.course = null;
    _state.group = null;
  },

  // --- スナップショット（保存用） ---
  snapshot() {
    return JSON.parse(JSON.stringify(_state));
  },

  // --- 復元 ---
  restore(snapshot) {
    Object.assign(_state, snapshot);
    EventBus.emit('state:restored', _state);
  },
};
