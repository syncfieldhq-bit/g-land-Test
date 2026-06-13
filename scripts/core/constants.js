// =============================================================
// constants.js - 設定・定数の一元管理（Phase 7 完全版）
// UI/UXに関わる全ての設定をここに集約。
// ロジックを触らずに見た目・ルールを変更できる。
// =============================================================

// --- アプリ情報 ---
export const APP = {
  NAME: 'G-WORLD',
  VERSION: '7.0.0',
  MAX_PLAYERS: 16,      // 最大同時プレイヤー数
  MAX_HOLES: 18,
  AUTOSAVE_INTERVAL: 3000, // ms
};

// --- スコア表示モード ---
// 数字 → PAR差 → 記号 で循環
export const DISPLAY_MODES = ['number', 'pardiff', 'symbol'];
export const DISPLAY_LABELS = {
  number: '数字',
  pardiff: '±',
  symbol: '記号',
};

// --- ゴルフ記号定義（PAR差ベース） ---
// PAR差 → 表示記号 のマップ
export const SCORE_SYMBOLS = {
  '-3': '⭐',   // アルバトロス（3アンダー）
  '-2': '◎',   // イーグル
  '-1': '◯',   // バーディ
  '0':  '━',   // パー
  '1':  '△',   // ボギー
  '2':  '□',   // ダブルボギー
  '3+': '▣',   // トリプル以上
};

// --- スコア名（PAR差ベース） ---
export const SCORE_NAMES = {
  '-3': 'ALBATROSS',
  '-2': 'EAGLE',
  '-1': 'BIRDIE',
  '0':  'PAR',
  '1':  'BOGEY',
  '2':  'DOUBLE',
  '3':  'TRIPLE',
  '4+': '+',
};

// --- スコア色（PAR差ベース） ---
export const SCORE_COLORS = {
  under: '#e74c3c',   // -2以下（赤・燃え）
  birdie: '#f39c12',  // -1（オレンジ）
  par:    '#f5c842',  // 0（金）
  bogey:  '#5dade2',  // +1（水色）
  double: '#2980b9',  // +2（青）
  over:   '#7f8c8d',  // +3以上（灰）
};

// --- コース定義 ---
export const COURSES = {
  'rokko-18': {
    name: '六甲国際パブリック',
    variant: '18H',
    holes: 18,
    pars: [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4],
  },
  'rokko-9': {
    name: '六甲国際パブリック',
    variant: '9H',
    holes: 9,
    pars: [4, 4, 3, 5, 4, 4, 3, 5, 4],
  },
  'west-out': {
    name: '西コース OUT',
    variant: 'OUT 9H',
    holes: 9,
    pars: [4, 5, 4, 3, 4, 4, 3, 5, 4],
  },
  'west-in': {
    name: '西コース IN',
    variant: 'IN 9H',
    holes: 9,
    pars: [4, 4, 3, 5, 4, 4, 3, 5, 4],
  },
  'east-out': {
    name: '東コース OUT',
    variant: 'OUT 9H',
    holes: 9,
    pars: [5, 4, 4, 3, 4, 5, 3, 4, 4],
  },
  'east-in': {
    name: '東コース IN',
    variant: 'IN 9H',
    holes: 9,
    pars: [4, 4, 3, 4, 5, 4, 3, 5, 4],
  },
};

// --- 入力モード ---
export const INPUT_MODES = ['simple', 'counter'];

// --- localStorage キー ---
export const STORAGE_KEYS = {
  PROFILE: 'gworld.profile',
  ROUND_DRAFT: 'gworld.round.draft',
  ROUND_HISTORY: 'gworld.round.history',
  SETTINGS: 'gworld.settings',
  GROUP: 'gworld.group',
};

// --- GAS連携 ---
export const GAS_URL = 'https://script.google.com/macros/s/AKfycbyJbjVYmqATkJe2Ial5XOK_CYXCfkPWEIpKOtZziwDQ490l-AfNNF43gwls20y1N2FHgg/exec';

// --- イベント名 ---
export const EVENTS = {
  SCORE_UPDATED: 'score:updated',
  HOLE_CHANGED: 'hole:changed',
  PLAYER_CHANGED: 'player:changed',
  PLAYER_ADDED: 'player:added',
  PLAYER_REMOVED: 'player:removed',
  ROUND_SAVED: 'round:saved',
  ROUND_FINISHED: 'round:finished',
  GROUP_JOINED: 'group:joined',
  GROUP_SYNCED: 'group:synced',
  DISPLAY_MODE_CHANGED: 'display:mode-changed',
};

// --- PAR差→記号変換ヘルパー ---
export function diffToSymbol(diff) {
  if (diff <= -3) return SCORE_SYMBOLS['-3'];
  if (diff === -2) return SCORE_SYMBOLS['-2'];
  if (diff === -1) return SCORE_SYMBOLS['-1'];
  if (diff === 0) return SCORE_SYMBOLS['0'];
  if (diff === 1) return SCORE_SYMBOLS['1'];
  if (diff === 2) return SCORE_SYMBOLS['2'];
  return SCORE_SYMBOLS['3+'];
}

// --- PAR差→色変換 ---
export function diffToColor(diff) {
  if (diff <= -2) return SCORE_COLORS.under;
  if (diff === -1) return SCORE_COLORS.birdie;
  if (diff === 0) return SCORE_COLORS.par;
  if (diff === 1) return SCORE_COLORS.bogey;
  if (diff === 2) return SCORE_COLORS.double;
  return SCORE_COLORS.over;
}

// --- PAR差→名前 ---
export function diffToName(diff) {
  if (diff <= -3) return SCORE_NAMES['-3'];
  if (diff === -2) return SCORE_NAMES['-2'];
  if (diff === -1) return SCORE_NAMES['-1'];
  if (diff === 0) return SCORE_NAMES['0'];
  if (diff === 1) return SCORE_NAMES['1'];
  if (diff === 2) return SCORE_NAMES['2'];
  if (diff === 3) return SCORE_NAMES['3'];
  return SCORE_NAMES['4+'];
}

// --- 表示変換（モード別） ---
export function formatScore(stroke, par, mode) {
  if (stroke == null) return '-';
  if (mode === 'number') return String(stroke);
  const diff = stroke - par;
  if (mode === 'pardiff') {
    if (diff === 0) return 'E';
    return diff > 0 ? `+${diff}` : String(diff);
  }
  if (mode === 'symbol') return diffToSymbol(diff);
  return String(stroke);
}
