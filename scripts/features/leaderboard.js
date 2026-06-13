// =============================================================
// leaderboard.js - 仲間内リーダーボード集計
// 16名対応、公開設定対応
// =============================================================
import { State } from '../core/state.js';

export function compute() {
  const players = State.getPlayers();
  const course = State.getCourse();
  if (!course) return [];

  const rows = players
    .filter(p => p.isPublic !== false)
    .map(p => {
      let total = 0, parSum = 0, played = 0;
      for (let i = 0; i < course.holes; i++) {
        if (p.scores[i] != null) {
          total += p.scores[i];
          parSum += course.pars[i];
          played++;
        }
      }
      const diff = total - parSum;
      return {
        id: p.id,
        name: p.name,
        isSelf: p.isSelf,
        isHost: p.isHost,
        played,
        total,
        diff,
        diffStr: diff === 0 ? 'E' : (diff > 0 ? `+${diff}` : String(diff)),
        avgPutt: avgPutt(p),
      };
    });

  // ソート：プレイ数が多い順、その中で PAR差が少ない順
  rows.sort((a, b) => {
    if (b.played !== a.played) return b.played - a.played;
    return a.diff - b.diff;
  });

  // 順位付け
  rows.forEach((r, i) => {
    r.rank = i + 1;
    r.medal = i === 0 ? '🥇' : (i === 1 ? '🥈' : (i === 2 ? '🥉' : ''));
  });

  return rows;
}

function avgPutt(p) {
  let total = 0, count = 0;
  for (const v of p.putts) {
    if (v != null) { total += v; count++; }
  }
  return count > 0 ? (total / count).toFixed(1) : '-';
}
