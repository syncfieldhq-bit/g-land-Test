/******************************************************************
 * G-WORLD Backend - History Repository
 *
 * 履歴データの絞り込み・集計ロジックを集約
 *
 * 設計意図【関心の分離】：
 *   - GLand_getHistoryList から「フィルタ・統計」を切り出し
 *   - 純粋関数（副作用なし）として実装し、テストしやすくする
 *   - シートアクセスは _isPlayerLinkedToGwUserId のみ（Players 1シート）
 *
 * 含まれる関数：
 *   - _isPlayerLinkedToGwUserId : playerId が gwUserId に紐付いているか判定
 *   - _applyPeriodFilter         : 期間フィルタ適用（all / recent10 / half_year / one_year / year:YYYY）
 *   - _calcHistoryStats          : 4種統計算出（rounds / best / avgStroke / avgPutt）
 *
 * 【依存】
 *   - services_SheetService.gs : _sheet, _headerMap
 *   - config_Config.gs         : SHEET_PLAYERS
 *
 * 【呼出元】
 *   - api_GolfHistoryApi.gs : GLand_getHistoryList から全3関数を呼出
 ******************************************************************/


// ════════════════════════════════════════════════════════════════
// 【Players 紐付け判定】
// ════════════════════════════════════════════════════════════════

/**
 * 指定 playerId が指定 gwUserId に紐付いているかを判定
 *   - Players シートの gw_user_id 列で照合
 *   - 旧 user_id 列でも照合（既存データ救済）
 *   - キャッシュ無しで毎回検索（簡素化優先）
 *
 * 設計意図：
 *   GLand_getHistoryList で playerId が指定されず gwUserId のみが指定された
 *   ケース（機種変更後の履歴取得など）で使用。
 *   History シートには gw_user_id 列が無いため、Players シートを経由して
 *   間接的に紐付けを確認する。
 *
 * @param {string} playerId
 * @param {string} gwUserId
 * @returns {boolean}
 */
function _isPlayerLinkedToGwUserId(playerId, gwUserId) {
  if (!playerId || !gwUserId) return false;
  var sh = _sheet(SHEET_PLAYERS);
  var map = _headerMap(sh);
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][map['player_id']]) !== String(playerId)) continue;
    // ── gw_user_id 列で照合 ──
    if (map['gw_user_id'] !== undefined &&
        String(data[i][map['gw_user_id']]) === String(gwUserId)) {
      return true;
    }
    // ── 旧 user_id 列でも照合（既存データ救済） ──
    if (map['user_id'] !== undefined &&
        String(data[i][map['user_id']]) === String(gwUserId)) {
      return true;
    }
    return false;
  }
  return false;
}


// ════════════════════════════════════════════════════════════════
// 【期間フィルタ】
// ════════════════════════════════════════════════════════════════

/**
 * 期間フィルタ適用
 *   - 'all'        : フィルタなし
 *   - 'recent10'   : フィルタなし（先頭10件はソート後に slice する）
 *   - 'half_year'  : 過去183日以内
 *   - 'one_year'   : 過去365日以内
 *   - 'year:YYYY'  : 指定年のみ（拡張用）
 *
 * 注意：
 *   - 'recent10' の slice 処理は GLand_getHistoryList 側で行うため
 *     本関数では何もしない
 *   - playDate が空文字の履歴は半年/1年フィルタで除外される
 *
 * @param {Array} list - 履歴行の配列
 * @param {string} period
 * @returns {Array}
 */
function _applyPeriodFilter(list, period) {
  if (!period || period === 'all' || period === 'recent10') return list;
  var today = new Date();

  if (period === 'half_year') {
    var cutoff1 = new Date(today.getTime() - 183 * 86400000);
    return list.filter(function (h) {
      return h.playDate && new Date(h.playDate) >= cutoff1;
    });
  }
  if (period === 'one_year') {
    var cutoff2 = new Date(today.getTime() - 365 * 86400000);
    return list.filter(function (h) {
      return h.playDate && new Date(h.playDate) >= cutoff2;
    });
  }
  if (period.indexOf('year:') === 0) {
    var yr = period.split(':')[1];
    return list.filter(function (h) {
      return h.playDate.indexOf(yr) === 0;
    });
  }
  return list;
}


// ════════════════════════════════════════════════════════════════
// 【統計算出】
// ════════════════════════════════════════════════════════════════

/**
 * 統計算出（4種）
 *   - rounds: 入力済ホールが1以上のラウンド数
 *   - best: 18H完走の最小スコア（18H未満は対象外）
 *   - avgStroke / avgPutt: 全ラウンド平均（小数1桁）
 *
 * 設計意図【既存挙動完全継承】：
 *   - ベストスコアは「18H完走したラウンド」のみで判定
 *     （9Hやハーフのスコアと混在させない）
 *   - 平均値は全ラウンド（playedHoles >= 1）が対象
 *   - データが無ければ null を返し、フロントで '-' 表示
 *
 * @param {Array} list - 履歴行の配列（フィルタ・期間適用済み）
 * @returns {Object} { rounds, best, avgStroke, avgPutt }
 */
function _calcHistoryStats(list) {
  var valid = list.filter(function (h) { return h.playedHoles > 0; });
  if (!valid.length) {
    return { rounds: 0, best: null, avgStroke: null, avgPutt: null };
  }

  var sumStroke = 0;
  var sumPutt   = 0;
  for (var v = 0; v < valid.length; v++) {
    sumStroke += valid[v].totalStroke;
    sumPutt   += valid[v].totalPutt;
  }

  var fullRounds = valid.filter(function (h) { return h.playedHoles === 18; });
  var bestVal = null;
  if (fullRounds.length) {
    bestVal = Math.min.apply(null, fullRounds.map(function (h) {
      return h.totalStroke;
    }));
  }

  return {
    rounds:    valid.length,
    best:      bestVal,
    avgStroke: Math.round(sumStroke / valid.length * 10) / 10,
    avgPutt:   Math.round(sumPutt   / valid.length * 10) / 10
  };
}
