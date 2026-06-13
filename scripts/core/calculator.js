/**
 * ═══════════════════════════════════════════════════════
 * scripts/core/calculator.js - スコア計算ロジック（純粋関数）
 *
 * 【設計原則】
 *   - すべて純粋関数（同じ入力 → 同じ出力、副作用ゼロ）
 *   - DOM・localStorage に一切触れない
 *   - GAS 側でも同じコードがそのまま使える
 *   - ユニットテストが容易
 *
 * 【使い方】
 *   import { Calculator } from './core/calculator.js';
 *   const total = Calculator.totalStrokes(scores);
 *   const diff = Calculator.parDiff(scores, pars);
 *   const summary = Calculator.summarize(player, pars);
 * ═══════════════════════════════════════════════════════
 */

import { PARS } from './config.js';
import { SCORE_NAMES, SCORE_SYMBOLS, DIFF_COLORS } from './constants.js';

export const Calculator = {

  // ═══════════════════════════════════════════
  // 基本集計
  // ═══════════════════════════════════════════

  /**
   * 入力済みホールの打数合計
   * @param {Array<number|null>} scores - 各ホールのスコア配列
   * @returns {number} 合計打数（未入力は 0 として扱う）
   */
  totalStrokes(scores) {
    if (!Array.isArray(scores)) return 0;
    return scores.reduce((sum, s) => {
      return sum + (Number.isFinite(s) && s !== null ? s : 0);
    }, 0);
  },

  /**
   * 入力済みホールの PAR 合計
   * @param {Array<number|null>} scores - 各ホールのスコア
   * @param {Array<number>} [pars=PARS] - 各ホールの PAR
   * @returns {number} 入力済みホールの PAR 合計
   */
  totalPar(scores, pars = PARS) {
    if (!Array.isArray(scores)) return 0;
    return scores.reduce((sum, s, i) => {
      if (s === null || s === undefined) return sum;
      return sum + (pars[i] || 4);
    }, 0);
  },

  /**
   * PAR との差（入力済みホールのみ）
   * @returns {number} 例：3 オーバーなら +3、2 アンダーなら -2
   */
  parDiff(scores, pars = PARS) {
    return this.totalStrokes(scores) - this.totalPar(scores, pars);
  },

  /**
   * PAR 差を表示文字列に整形
   * @param {number} diff
   * @returns {string} 例：'E' / '+3' / '-2'
   */
  formatParDiff(diff) {
    if (diff === 0) return 'E';
    return diff > 0 ? '+' + diff : String(diff);
  },

  // ═══════════════════════════════════════════
  // ホール単位
  // ═══════════════════════════════════════════

  /**
   * 1ホール分の合算（カウンターモード用：ショット + パット = 合計）
   */
  holeTotal(shots, putts) {
    const s = Number.isFinite(shots) ? shots : 0;
    const p = Number.isFinite(putts) ? putts : 0;
    return s + p;
  },

  /**
   * 1ホールの PAR 差
   */
  holeParDiff(stroke, hole, pars = PARS) {
    if (stroke === null || stroke === undefined) return null;
    const par = pars[hole - 1] || 4;
    return stroke - par;
  },

  /**
   * 1ホールのスコア名称（ALBATROSS / EAGLE / BIRDIE / PAR / BOGEY ...）
   * ★constants.SCORE_NAMES を参照しているので、名称変更は constants.js だけ
   */
  holeScoreName(stroke, hole, pars = PARS) {
    const diff = this.holeParDiff(stroke, hole, pars);
    if (diff === null) return '';
    const key = String(Math.max(-3, Math.min(3, diff)));
    return SCORE_NAMES[key] || (diff > 0 ? '+' + diff : String(diff));
  },

  /**
   * ★新追加：1ホールのスコア記号（🐦 / ⚫ / 🔴 etc.）
   * constants.SCORE_SYMBOLS を参照しているので、記号変更は constants.js だけ
   */
  holeScoreSymbol(stroke, hole, pars = PARS) {
    const diff = this.holeParDiff(stroke, hole, pars);
    if (diff === null) return '';
    const key = String(Math.max(-3, Math.min(3, diff)));
    return SCORE_SYMBOLS[key] || (diff > 0 ? '🔵' : '⚫');
  },

  /**
   * ★新追加：PAR差のカラークラスを返す
   */
  diffColorClass(diff) {
    if (diff === null || diff === undefined) return '';
    if (diff < 0)  return DIFF_COLORS.UNDER;
    if (diff === 0) return DIFF_COLORS.EVEN;
    return DIFF_COLORS.OVER;
  },

  // ═══════════════════════════════════════════
  // OUT / IN 集計（18ホール用）
  // ═══════════════════════════════════════════

  /**
   * OUT（1-9）の集計
   */
  outSummary(scores, pars = PARS) {
    const slice = scores.slice(0, 9);
    const sliceParsArr = pars.slice(0, 9);
    return {
      strokes: this.totalStrokes(slice),
      par: this.totalPar(slice, sliceParsArr),
      diff: this.parDiff(slice, sliceParsArr),
      played: slice.filter((s) => s !== null && s !== undefined).length
    };
  },

  /**
   * IN（10-18）の集計
   */
  inSummary(scores, pars = PARS) {
    const slice = scores.slice(9, 18);
    const sliceParsArr = pars.slice(9, 18);
    return {
      strokes: this.totalStrokes(slice),
      par: this.totalPar(slice, sliceParsArr),
      diff: this.parDiff(slice, sliceParsArr),
      played: slice.filter((s) => s !== null && s !== undefined).length
    };
  },

  // ═══════════════════════════════════════════
  // プレイヤー全体のサマリ
  // ═══════════════════════════════════════════

  /**
   * プレイヤー1人分の完全集計
   *
   * @param {Object} player - { scores, shots, putts }
   * @param {Array<number>} [pars=PARS]
   * @returns {Object} {
   *   strokes, par, diff, diffStr,    // 全体
   *   out, in,                         // 各9ホール
   *   playedHoles, totalHoles,         // プレイ済み数
   *   totalShots, totalPutts,          // 内訳（カウンターモード由来）
   *   isComplete                       // 全ホール入力済みか
   * }
   */
  summarize(player, pars = PARS) {
    if (!player || !Array.isArray(player.scores)) {
      return this._emptySummary();
    }

    const scores = player.scores;
    const shots = player.shots || [];
    const putts = player.putts || [];
    const totalHoles = scores.length;
    const playedHoles = scores.filter((s) => s !== null && s !== undefined).length;

    const strokes = this.totalStrokes(scores);
    const par = this.totalPar(scores, pars);
    const diff = strokes - par;

    return {
      strokes,
      par,
      diff,
      diffStr: this.formatParDiff(diff),

      out: this.outSummary(scores, pars),
      in:  this.inSummary(scores, pars),

      playedHoles,
      totalHoles,
      isComplete: playedHoles === totalHoles && totalHoles > 0,

      totalShots: shots.reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0),
      totalPutts: putts.reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0)
    };
  },

  /**
   * 空のサマリ（プレイヤー情報がない場合のデフォルト）
   */
  _emptySummary() {
    return {
      strokes: 0, par: 0, diff: 0, diffStr: 'E',
      out: { strokes: 0, par: 0, diff: 0, played: 0 },
      in:  { strokes: 0, par: 0, diff: 0, played: 0 },
      playedHoles: 0, totalHoles: 0, isComplete: false,
      totalShots: 0, totalPutts: 0
    };
  },

  // ═══════════════════════════════════════════
  // 複数プレイヤーのランキング
  // ═══════════════════════════════════════════

  /**
   * 同伴メンバーを含めた順位付け（diff の小さい順）
   *
   * @param {Array<Object>} players - プレイヤー配列
   * @param {Array<number>} [pars=PARS]
   * @returns {Array<Object>} [{ player, summary, rank }, ...]
   */
  rankPlayers(players, pars = PARS) {
    if (!Array.isArray(players)) return [];
    const rows = players.map((p) => ({
      player: p,
      summary: this.summarize(p, pars)
    }));

    // diff 昇順、同じなら strokes 昇順
    rows.sort((a, b) => {
      if (a.summary.diff !== b.summary.diff) return a.summary.diff - b.summary.diff;
      return a.summary.strokes - b.summary.strokes;
    });

    // 順位を付与（同点は同順位）
    let lastDiff = null, lastStrokes = null, rank = 0;
    rows.forEach((row, i) => {
      const { diff, strokes } = row.summary;
      if (diff !== lastDiff || strokes !== lastStrokes) {
        rank = i + 1;
        lastDiff = diff;
        lastStrokes = strokes;
      }
      row.rank = rank;
    });

    return rows;
  }
};

console.log('[core/calculator] loaded');
