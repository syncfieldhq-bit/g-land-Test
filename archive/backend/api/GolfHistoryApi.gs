/******************************************************************
 * G-WORLD Backend - Golf History API
 *
 * 【SECTION D-1〜D-3】G-LAND 履歴系の公開 API
 *
 * 含まれる関数：
 *   - GLand_saveSnapshot      : ラウンド終了時のスナップショット保存
 *   - GLand_getHistoryList    : 履歴一覧 + 統計（フィルタ・期間対応）
 *   - GLand_getHistoryDetail  : 履歴詳細（同組4名のホール別スコア）
 *
 * 【設計憲法・第1条 / 第2条】
 *   - saveSnapshot は LockService 3秒で取得（既存挙動継承）
 *   - History シートに JSON で詰め込み（既存スキーマ完全継承）
 *   - getHistoryList / getHistoryDetail は読み込み専用（Lock不要）
 *   - フィルタは period / courseId / playerId / gwUserId に対応
 *
 * 【script.js 側との整合】
 *   - GW.Widgets.Golf.Score._finishRound()
 *       → fire('gland.saveSnapshot', { playerId, gwUserId })
 *   - GW.Widgets.Golf.History._loadList()
 *       → call('gland.getHistoryList', { playerId, gwUserId, period, courseId })
 *   - GW.Widgets.Golf.History._loadDetailInto()
 *       → call('gland.getHistoryDetail', { historyId })
 *   - GW.Modules.Home._renderRecent()
 *       → call('gland.getHistoryList', { playerId, gwUserId, period:'recent10' })
 *
 * 【依存】
 *   - services_SheetService.gs    : _sheet, _headerMap, _emptyRow, _safeJsonParse
 *   - repositories_GolfRepository.gs    : _loadPlayerById, _backfillPlayerGwUserId, _loadCourseInfo, _collectScoresForSnapshot
 *   - repositories_HistoryRepository.gs : _isPlayerLinkedToGwUserId, _applyPeriodFilter, _calcHistoryStats
 *   - config_Config.gs            : SHEET_HISTORY, SHEET_PLAYERS, LOCK_WAIT_MS
 *   - utils_Utils.gs              : _uuid, _today
 ******************************************************************/


// ════════════════════════════════════════════════════════════════
// 【SECTION D-1】★ GLand_saveSnapshot - ラウンド履歴スナップショット保存
//
// 設計意図【既存挙動完全継承】：
//   - Players + Scores + Courses からデータを集約し、
//     History シートに1行で保存（JSON詰め込み形式）
//   - 中断・9H・18H すべてに対応（既存挙動）
//   - 1ホールも入力されていない場合は保存しない
//   - LockService 3秒で取得（History の整合性確保）
//
// 入力（script.js Score._finishRound から）:
//   payload = { playerId, gwUserId }
//
// 出力:
//   { ok, historyId, totalStroke, vsPar, playedHoles }
//   または { ok: false, msg }
// ════════════════════════════════════════════════════════════════
function GLand_saveSnapshot(payload, meta) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(LOCK_WAIT_MS);

    payload = payload || {};
    var playerId = String(payload.playerId || '');
    var gwUserId = String(payload.gwUserId || (meta && meta.gwUserId) || '');

    if (!playerId) return { ok: false, msg: 'playerId が必要です' };

    // ── 1) Players シートから対象プレイヤーを取得 ──
    var player = _loadPlayerById(playerId);
    if (!player) return { ok: false, msg: 'プレイヤーが見つかりません' };

    // ── gw_user_id が Players 行に無ければ補完 ──
    if (gwUserId && !player.gwUserId) {
      _backfillPlayerGwUserId(playerId, gwUserId);
      player.gwUserId = gwUserId;
    }

    // ── 2) Courses からコース情報・PAR配列を取得 ──
    var courseInfo = _loadCourseInfo(player.courseId);

    // ── 3) Scores から全18ホールのスコアを集約 ──
    var collected = _collectScoresForSnapshot(playerId);
    var holeScores  = collected.holeScores;
    var shotsDetail = collected.shotsDetail;
    var playDate    = collected.playDate || _today();

    // ── 4) 集計計算（打数 / パット / vs PAR / プレイホール数） ──
    var totalStroke = 0;
    var totalPutt   = 0;
    var playedHoles = 0;
    var playedPar   = 0;
    for (var h = 0; h < 18; h++) {
      var s = holeScores[h] || { stroke: 0, putt: 0 };
      totalStroke += s.stroke || 0;
      totalPutt   += s.putt   || 0;
      if (s.stroke > 0) {
        playedHoles++;
        playedPar += courseInfo.pars[h] || 4;
      }
    }

    if (playedHoles === 0) {
      return { ok: false, msg: 'スコアが1ホールも入力されていません' };
    }

    var vsPar = totalStroke - playedPar;

    // ── 5) History シートに新規行追加 ──
    var hSh = _sheet(SHEET_HISTORY);
    var hMap = _headerMap(hSh);
    var historyId = _uuid('H');
    var row = _emptyRow(hMap);

    row[hMap['history_id']]        = historyId;
    row[hMap['player_id']]         = playerId;
    row[hMap['user_id']]           = player.userId || '';
    row[hMap['course_id']]         = player.courseId;
    row[hMap['course_name']]       = courseInfo.courseName;
    row[hMap['comp_id']]           = '';    // 拡張余白（将来 G-COMPETE 用）
    row[hMap['group_name']]        = player.groupName;
    row[hMap['play_date']]         = playDate;
    row[hMap['total_stroke']]      = totalStroke;
    row[hMap['total_putt']]        = totalPutt;
    row[hMap['vs_par']]            = vsPar;
    row[hMap['played_holes']]      = playedHoles;
    row[hMap['hole_scores_json']]  = JSON.stringify(holeScores);
    row[hMap['shots_detail_json']] = JSON.stringify(shotsDetail);
    row[hMap['input_mode']]        = player.inputMode || 'par_diff';
    row[hMap['created_at']]        = new Date();

    hSh.appendRow(row);

    return {
      ok:          true,
      historyId:   historyId,
      totalStroke: totalStroke,
      totalPutt:   totalPutt,
      vsPar:       vsPar,
      playedHoles: playedHoles,
      message:     '履歴に保存しました'
    };
  } catch (err) {
    return { ok: false, msg: 'スナップショット保存失敗: ' + String(err.message || err) };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}


// ════════════════════════════════════════════════════════════════
// 【SECTION D-2】★ GLand_getHistoryList - 履歴一覧 + 統計
//
// 設計意図【既存挙動完全継承】：
//   - フィルタ条件：playerId / gwUserId / courseId / period
//   - period: 'all' / 'recent10' / 'half_year' / 'one_year'
//   - 4種統計：rounds / best / avgStroke / avgPutt
//   - ベストは18H完走のみで判定（既存挙動）
//
// 入力（script.js History._loadList から）:
//   payload = { playerId, gwUserId, period, courseId }
//
// 出力:
//   { ok, list: [...], stats: { rounds, best, avgStroke, avgPutt } }
// ════════════════════════════════════════════════════════════════
function GLand_getHistoryList(payload, meta) {
  payload = payload || {};
  var playerId = String(payload.playerId || '');
  var gwUserId = String(payload.gwUserId || (meta && meta.gwUserId) || '');
  var courseId = String(payload.courseId || '');
  var period   = String(payload.period   || 'all');

  try {
    var sh = _sheet(SHEET_HISTORY);
    if (sh.getLastRow() < 2) {
      return {
        ok:    true,
        list:  [],
        stats: { rounds: 0, best: null, avgStroke: null, avgPutt: null }
      };
    }

    var map = _headerMap(sh);
    var data = sh.getDataRange().getValues();

    // ── 1) フィルタを適用しながら一覧構築 ──
    var list = [];
    for (var i = 1; i < data.length; i++) {
      var row = data[i];

      // playerId フィルタ（最優先）
      if (playerId && String(row[map['player_id']]) !== playerId) continue;

      // courseId フィルタ
      if (courseId && String(row[map['course_id']]) !== courseId) continue;

      // ── gw_user_id 経由のフィルタ（将来の機種変更後も履歴が拾えるように） ──
      //    playerId が未指定で gwUserId が指定された場合のみ使用
      if (!playerId && gwUserId) {
        // History に gw_user_id 列は無いため、Players 経由で照合
        var rowPlayerId = String(row[map['player_id']]);
        if (!_isPlayerLinkedToGwUserId(rowPlayerId, gwUserId)) continue;
      }

      list.push({
        historyId:   String(row[map['history_id']]),
        playerId:    String(row[map['player_id']]),
        userId:      String(row[map['user_id']] || ''),
        courseId:    String(row[map['course_id']]),
        courseName:  String(row[map['course_name']] || ''),
        compId:      String(row[map['comp_id']] || ''),
        groupName:   String(row[map['group_name']] || ''),
        playDate:    String(row[map['play_date']] || ''),
        totalStroke: Number(row[map['total_stroke']]) || 0,
        totalPutt:   Number(row[map['total_putt']])   || 0,
        vsPar:       Number(row[map['vs_par']])       || 0,
        playedHoles: Number(row[map['played_holes']]) || 0,
        inputMode:   String(row[map['input_mode']] || '')
      });
    }

    // ── 2) 期間フィルタ ──
    list = _applyPeriodFilter(list, period);

    // ── 3) 日付降順ソート ──
    list.sort(function (a, b) {
      return (b.playDate > a.playDate) ? 1 : -1;
    });

    // ── 4) recent10 はソート後に先頭10件 ──
    if (period === 'recent10') {
      list = list.slice(0, 10);
    }

    // ── 5) 統計算出 ──
    var stats = _calcHistoryStats(list);

    return {
      ok:    true,
      list:  list,
      stats: stats
    };
  } catch (err) {
    return {
      ok:    false,
      msg:   'getHistoryList失敗: ' + String(err.message || err),
      list:  [],
      stats: { rounds: 0, best: null, avgStroke: null, avgPutt: null }
    };
  }
}


// ════════════════════════════════════════════════════════════════
// 【SECTION D-3】★ GLand_getHistoryDetail - 履歴詳細（同組4名）
//
// 設計意図【既存挙動完全継承】：
//   - 指定 historyId と同じ courseId × groupName × playDate のラウンドを
//     最大4名分まで集めて返す（同組メンバーの比較ビュー）
//   - 自分の履歴は isPrimary: true でマーク
//   - 各メンバーは Players からニックネーム/本名を引いて添える
//
// 入力（script.js History._loadDetailInto から）:
//   payload = { historyId }
//
// 出力:
//   {
//     ok, historyId, courseName, playDate, groupName, pars,
//     mates: [
//       { playerId, nickname, realName, totalStroke, totalPutt, vsPar, holeScores, isPrimary }
//     ]
//   }
// ════════════════════════════════════════════════════════════════
function GLand_getHistoryDetail(payload, meta) {
  payload = payload || {};
  var historyId = String(payload.historyId || '');
  if (!historyId) return { ok: false, msg: 'historyId が必要です' };

  try {
    var hSh = _sheet(SHEET_HISTORY);
    if (hSh.getLastRow() < 2) return { ok: false, msg: '履歴がありません' };

    var hMap = _headerMap(hSh);
    var hData = hSh.getDataRange().getValues();

    // ── 1) 対象履歴行を検索 ──
    var target = null;
    for (var i = 1; i < hData.length; i++) {
      if (String(hData[i][hMap['history_id']]) === historyId) {
        target = hData[i];
        break;
      }
    }
    if (!target) return { ok: false, msg: '該当履歴が見つかりません' };

    var courseId  = String(target[hMap['course_id']]);
    var groupName = String(target[hMap['group_name']] || '');
    var playDate  = String(target[hMap['play_date']] || '');

    // ── 2) 同じ course×group×playDate のラウンドを最大4名分収集 ──
    var mates = [];
    var playerIds = []; // 後で Players シートから一括ルックアップするための配列
    for (var j = 1; j < hData.length; j++) {
      var row = hData[j];
      if (String(row[hMap['course_id']])  !== courseId)  continue;
      if (String(row[hMap['group_name']]) !== groupName) continue;
      if (String(row[hMap['play_date']])  !== playDate)  continue;

      // hole_scores_json をパース
      var holeScores = _safeJsonParse(row[hMap['hole_scores_json']], []);

      mates.push({
        playerId:    String(row[hMap['player_id']]),
        historyId:   String(row[hMap['history_id']]),
        totalStroke: Number(row[hMap['total_stroke']]) || 0,
        totalPutt:   Number(row[hMap['total_putt']])   || 0,
        vsPar:       Number(row[hMap['vs_par']])       || 0,
        holeScores:  holeScores,
        isPrimary:   String(row[hMap['history_id']]) === historyId,
        nickname:    '',  // 後で埋める
        realName:    ''   // 後で埋める
      });
      playerIds.push(String(row[hMap['player_id']]));

      if (mates.length >= 4) break;
    }

    // ── 3) Players シートから一括でニックネーム/本名を取得 ──
    if (playerIds.length > 0) {
      var pSh = _sheet(SHEET_PLAYERS);
      var pMap = _headerMap(pSh);
      var pData = pSh.getDataRange().getValues();
      var nameMap = {}; // playerId → {nickname, realName}
      for (var k = 1; k < pData.length; k++) {
        var pid = String(pData[k][pMap['player_id']]);
        if (playerIds.indexOf(pid) >= 0) {
          nameMap[pid] = {
            nickname: String(pData[k][pMap['nickname']]  || ''),
            realName: String(pData[k][pMap['real_name']] || '')
          };
        }
      }
      mates.forEach(function (m) {
        if (nameMap[m.playerId]) {
          m.nickname = nameMap[m.playerId].nickname;
          m.realName = nameMap[m.playerId].realName;
        }
      });
    }

    // ── 4) isPrimary を先頭に並べる（既存挙動継承） ──
    mates.sort(function (a, b) {
      if (a.isPrimary && !b.isPrimary) return -1;
      if (!a.isPrimary && b.isPrimary) return  1;
      return 0;
    });

    // ── 5) PAR配列を取得 ──
    var courseInfo = _loadCourseInfo(courseId);

    return {
      ok:         true,
      historyId:  historyId,
      courseName: String(target[hMap['course_name']] || courseInfo.courseName || ''),
      playDate:   playDate,
      groupName:  groupName,
      pars:       courseInfo.pars,
      mates:      mates
    };
  } catch (err) {
    return { ok: false, msg: 'getHistoryDetail失敗: ' + String(err.message || err) };
  }
}
