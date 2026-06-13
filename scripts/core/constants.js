/**
 * ═══════════════════════════════════════════════════════
 * scripts/core/constants.js - UI設定・表示ルール（外部化）
 *
 * 【目的】
 *   UIの「マジックナンバー・記号・コース定義」を1箇所に集約。
 *   ジミーちゃんが「記号を変えたい」「コースを追加したい」と思ったら、
 *   このファイルだけ編集すれば良い。
 *
 * 【追加・変更の手順】
 *   1. このファイルの該当する定数を編集
 *   2. 他のファイルは触らない（参照側が自動的に追従）
 * ═══════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════
// スコア表示記号（ジミーちゃんのこだわりUI用）
// ═══════════════════════════════════════════

/**
 * スコア名（diff から決定）
 * 表示モード 'name' の時に使用
 */
export const SCORE_NAMES = {
  '-3': 'ALBATROSS',
  '-2': 'EAGLE',
  '-1': 'BIRDIE',
  '0':  'PAR',
  '1':  'BOGEY',
  '2':  'DOUBLE BOGEY',
  '3':  'TRIPLE BOGEY'
};

/**
 * スコア記号（diff から決定）
 * 表示モード 'symbol' の時に使用
 * 👉 ジミーちゃんが好きな絵文字に変えてOK！
 */
export const SCORE_SYMBOLS = {
  '-3': '🦅', // ALBATROSS
  '-2': '🦅', // EAGLE
  '-1': '🐦', // BIRDIE
  '0':  '⚪', // PAR
  '1':  '🔴', // BOGEY
  '2':  '🟠', // DOUBLE BOGEY
  '3':  '⚫'  // TRIPLE BOGEY
};

/**
 * PAR差カラー（CSSクラス名）
 */
export const DIFF_COLORS = {
  UNDER: 'diff-under',  // アンダーパー（赤）
  EVEN:  'diff-even',   // PAR（金）
  OVER:  'diff-over'    // オーバーパー（青）
};

// ═══════════════════════════════════════════
// コース定義（追加はここだけ！）
// ═══════════════════════════════════════════

/**
 * 利用可能なコース一覧
 * 新しいゴルフ場を追加する時は、この配列に1つ追加するだけ
 */
export const COURSES = [
  {
    id: 'rokko-international',
    icon: '🏌',
    name: '六甲国際パブリック',
    subtitle: '9H / 18H 選択可',
    variants: [
      { v: '9H',  label: '🟢 9ホール',  holes: 9 },
      { v: '18H', label: '🔵 18ホール', holes: 18 }
    ],
    // コース別 PAR（18ホール分）
    pars: [4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4, 4]
  },
  {
    id: 'rokko-west',
    icon: '⛳',
    name: '西コース',
    subtitle: 'OUT / IN スタート選択',
    variants: [
      { v: 'OUT', label: '➡️ OUTスタート', holes: 18 },
      { v: 'IN',  label: '⬅️ INスタート',  holes: 18 }
    ],
    pars: [4, 5, 3, 4, 4, 3, 5, 4, 4, 4, 4, 3, 5, 4, 3, 4, 5, 4]
  },
  {
    id: 'rokko-east',
    icon: '⛳',
    name: '東コース',
    subtitle: 'OUT / IN スタート選択',
    variants: [
      { v: 'OUT', label: '➡️ OUTスタート', holes: 18 },
      { v: 'IN',  label: '⬅️ INスタート',  holes: 18 }
    ],
    pars: [4, 4, 3, 5, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 5, 4, 4]
  }
];

/**
 * コースIDからコース定義を取得
 */
export function getCourse(courseId) {
  return COURSES.find((c) => c.id === courseId) || null;
}

/**
 * コースIDから表示用の名前を取得
 */
export function getCourseName(courseId) {
  const c = getCourse(courseId);
  return c ? c.name : '';
}

/**
 * コースIDとホール番号から PAR を取得
 * （フォールバック：六甲国際の PAR）
 */
export function getParFor(courseId, hole) {
  const c = getCourse(courseId);
  if (!c || !c.pars || hole < 1 || hole > c.pars.length) return 4;
  return c.pars[hole - 1];
}

// ═══════════════════════════════════════════
// UI 表示ルール
// ═══════════════════════════════════════════

/**
 * UI の表示制限
 */
export const UI_LIMITS = {
  /** 履歴に保持する最大ラウンド数 */
  MAX_HISTORY_ROUNDS: 30,
  /** ホームに表示する最近のラウンド件数 */
  RECENT_ROUNDS_ON_HOME: 5,
  /** 同伴者テーブルの一度に表示するホール数 */
  COMPANION_TABLE_HOLES: 5,
  /** 同伴者の名前最大文字数 */
  MAX_COMPANION_NAME_LENGTH: 20,
  /** Toast 表示時間（ms） */
  TOAST_DURATION_MS: 2000,
  /** Toast エラー時の表示時間（ms） */
  TOAST_ERROR_DURATION_MS: 3000
};

/**
 * 表示モード（スコアカード）
 */
export const DISPLAY_MODES = {
  STROKE: 'stroke',   // 数字（4, 5, 6...）
  PARDIFF: 'pardiff', // PAR差（E, +1, -2）
  SYMBOL: 'symbol'    // 記号（🐦, ⚪, 🔴）
};

/**
 * 入力モード
 */
export const INPUT_MODES = {
  SIMPLE: 'simple',     // PARから±調整
  COUNTER: 'counter'    // ショット+パットの自動合算
};

// ═══════════════════════════════════════════
// ルート定義（画面遷移）
// ═══════════════════════════════════════════

export const ROUTES = {
  HOME:   'home',
  GLAND:  'gland',
  MYPAGE: 'mypage'
};

// ═══════════════════════════════════════════
// EventBus イベント名（タイポ防止）
// ═══════════════════════════════════════════

export const EVENTS = {
  // スコア関連
  SCORE_UPDATED:    'score:updated',
  HOLE_CHANGED:     'hole:changed',
  ROUND_FINISHED:   'round:finished',

  // プレイヤー関連
  PROFILE_CHANGED:  'profile:changed',
  COMPANION_ADDED:  'companion:added',
  COMPANION_EDITED: 'companion:edited',
  COMPANION_REMOVED:'companion:removed',

  // 画面関連
  ROUTE_CHANGED:    'route:changed',

  // データ関連
  DRAFT_SAVED:      'draft:saved',
  DRAFT_RESTORED:   'draft:restored'
};

console.log('[core/constants] loaded');
