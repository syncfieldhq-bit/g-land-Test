/******************************************************************
 * G-WORLD Backend - Golf (G-LAND) API
 *
 * 【SECTION C-1〜C-5】G-LAND 層の公開 API（フロントから呼ばれる）
 *
 * 含まれる関数：
 *   - GLand_boot         : Core_boot のエイリアス（命名の対称性）
 *   - GLand_register     : プレイヤー登録（gw_user_id 紐付け）
 *   - GLand_saveScore    : スコア更新（高頻度・LockService不要）
 *   - GLand_getMyScores  : 自分の18ホールスコア取得
 *   - GLand_getMates     : 同伴メンバーのスコア取得
 *
 * 【設計憲法 第1条 / 第2条】
 *   - スコア保存は LockService を使わない（dedupe前提・高頻度）
 *   - register は LockService を3秒で取得（既存挙動継承）
 *   - 既存データを失わないため、Players には gw_user_id 列を末尾追加して紐付け
 *
 * 【script.js 側との整合】
 *   - GW.Core.Api.fire('gland.register',  { courseId, nickname, realName, groupName, gwUserId })
 *   - GW.Core.Api.fire('gland.saveScore', { playerId, hole, stroke, putt })
 *   - GW.Core.Api.call('gland.getMyScores', { playerId })
 *   - GW.Core.Api.call('gland.getMates',    { courseId, groupName, playerId })
 *
 * 【依存】
 *   - services_SheetService.gs    : _sheet, _headerMap, _emptyRow, _getConfig
 *   - services_IdentityService.gs : _resolveOrCreateIdentity
 *   - repositories_GolfRepository.gs : _initEmptyScores, _loadPars
 *   - api_CoreApi.gs              : Core_boot（GLand_boot からエイリアスで呼出）
 *   - config_Config.gs            : SHEET_PLAYERS, SHEET_SCORES, SHEET_COURSES, LOCK_WAIT_MS
 *   - utils_Utils.gs              : _today
 ******************************************************************/


// ════════════════════════════════════════════════════════════════
// 【SECTION C-1】GLand_boot - Core_boot のエイリアス
//
// 設計意図：
//   - ROUTES 内で 'gland.boot' と 'core.boot' の両方を受け付けるため
//   - 命名の対称性と将来の差別化余地（G-LAND専用の起動情報追加）
// ════════════════════════════════════════════════════════════════
function GLand_boot(payload, meta) {
  return Core_boot(payload, meta);
}


// ════════════════════════════════════════════════════════════════
// 【SECTION C-2】GLand_register - プレイヤー登録
//
// 設計意図【既存挙動完全継承 + GW_USER_ID対応】：
//   - 既存と同様、Players シートに新規行を追加
//   - 同名(course×nickname×group)プレイヤーは重複登録を防止し、既存IDを返す
//   - Scores シートに18ホール分の空行を一括投入（既存挙動）
//   - ★新規：末尾の gw_user_id 列に紐付け
//   - LockService 3秒（既存と同じ）
//
// 入力（script.js GW.Widgets.Golf.Widget._register から）:
//   payload = {
//     courseId:  "G001",
//     nickname:  "タロウ",
//     realName:  "山田 太郎",
//     groupName: "Aチーム",
//     gwUserId:  "GW-G-XXXX" or "GW-B-XXXXXXXX"
//   }
//
// 出力:
//   { ok: true, playerId, userId, gwUserId }   ※成功
//   { ok: false, msg, playerId? }              ※失敗（同名既存ならIDも返す）
// ════════════════════════════════════════════════════════════════
function GLand_register(payload, meta) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(LOCK_WAIT_MS);

    payload = payload || {};
    var courseId  = String(payload.courseId  || '').trim();
    var nickname  = String(payload.nickname  || '').trim();
    var realName  = String(payload.realName  || '').trim();
    var groupName = String(payload.groupName || '').trim();
    var gwUserId  = String(payload.gwUserId  || (meta && meta.gwUserId) || '').trim();

    // ── バリデーション ──
    if (!courseId)  return { ok: false, msg: 'courseId が必要です' };
    if (!nickname)  return { ok: false, msg: 'nickname が必要です' };
    if (!realName)  return { ok: false, msg: 'realName が必要です' };
    if (!groupName) return { ok: false, msg: 'groupName が必要です' };

    var sh = _sheet(SHEET_PLAYERS);
    var map = _headerMap(sh);
    var data = sh.getDataRange().getValues();

    // ── 同名既存チェック（course × nickname × group） ──
    //    既存挙動完全継承。重複登録を防ぐ。
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][map['course_id']]) === courseId &&
          String(data[i][map['nickname']]) === nickname &&
          String(data[i][map['group_name']]) === groupName) {
        // 既存IDを返し、必要なら gw_user_id を上書き
        var existingPid = String(data[i][map['player_id']]);
        if (map['gw_user_id'] !== undefined && gwUserId &&
            String(data[i][map['gw_user_id']]) !== gwUserId) {
          // gw_user_id が空 or 異なる場合、新しいIDで上書き
          sh.getRange(i + 1, map['gw_user_id'] + 1).setValue(gwUserId);
        }
        return {
          ok:       false,
          msg:      '同名のプレイヤーが既に登録されています',
          playerId: existingPid,
          existing: true
        };
      }
    }

    // ── 新規 player_id 発行（旧形式互換： "P" + timestamp + random） ──
    //    既存データとの整合性を保つため、IDフォーマットは変更しない
    var playerId = 'P' + new Date().getTime() + Math.floor(Math.random() * 1000);

    // ── user_id (旧フィールド) も発行 ──
    //    既存スキーマ維持のため空にしない
    var userId = gwUserId || ('U' + new Date().getTime() + Math.floor(Math.random() * 1000));

    // ── Players シートに新規行追加 ──
    var row = _emptyRow(map);
    row[map['player_id']]   = playerId;
    row[map['timestamp']]   = new Date();
    row[map['course_id']]   = courseId;
    row[map['nickname']]    = nickname;
    row[map['real_name']]   = realName;
    row[map['group_name']]  = groupName;

    // ── 既存維持フィールド（未使用でも空文字で埋める） ──
    if (map['user_role']    !== undefined) row[map['user_role']]    = 'student';
    if (map['teacher_id']   !== undefined) row[map['teacher_id']]   = '';
    if (map['user_id']      !== undefined) row[map['user_id']]      = userId;
    if (map['my_club_json'] !== undefined) row[map['my_club_json']] = '';
    if (map['input_mode']   !== undefined) row[map['input_mode']]   = 'par_diff';
    if (map['status']       !== undefined) row[map['status']]       = 'active';

    // ★ gw_user_id 紐付け（GW-G-* または GW-B-*） ──
    if (map['gw_user_id'] !== undefined) {
      row[map['gw_user_id']] = gwUserId;
    }

    sh.appendRow(row);

    // ── identity への自動登録 + display_name 更新 ──
    if (gwUserId) {
      _resolveOrCreateIdentity(gwUserId, {
        gwUserId:    gwUserId,
        displayName: nickname,
        realName:    realName,
        deviceId:    (meta && meta.deviceId) || '',
        useCount:    (meta && meta.useCount) || 0
      });
    }

    // ── Scores シートに18ホール分の空行を一括投入 ──
    _initEmptyScores(playerId);

    return {
      ok:       true,
      playerId: playerId,
      userId:   userId,
      gwUserId: gwUserId,
      message:  '登録が完了しました'
    };
  } catch (err) {
    return { ok: false, msg: '登録失敗: ' + String(err.message || err) };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}


// ════════════════════════════════════════════════════════════════
// 【SECTION C-3】★ GLand_saveScore - スコア更新
//
// 設計意図【設計憲法・第1条 / 第2条】：
//   - 高頻度で呼ばれる（ボタン押下毎にデバウンス150ms後に発火）
//   - LockService は使わない
//       理由：同一 playerId × hole の更新は、フロントの SaveQueue dedupeKey
//             ('score-{playerId}-{hole}') で1つに集約済み。
//             ロック取得のオーバーヘッドの方が大きい。
//   - 行特定は player_id + hole の組み合わせで一意
//   - 既存挙動完全継承（旧 updateScore と互換）
//
// 入力（script.js Score._saveScore から）:
//   payload = { playerId, hole, stroke, putt }
//
// 出力:
//   { ok: true } または { ok: false, msg }
// ════════════════════════════════════════════════════════════════
function GLand_saveScore(payload, meta) {
  // ── finalized 状態（順位確定）なら編集不可 ──
  //    現バージョンでは確定機能は無いが、将来 GCompete で復活させる
  if (_getConfig('finalized') === 'true') {
    return { ok: false, msg: '順位確定済み・編集不可' };
  }

  payload = payload || {};
  var playerId = String(payload.playerId || '');
  var hole     = Number(payload.hole);
  var stroke   = Number(payload.stroke);
  var putt     = Number(payload.putt);

  if (!playerId) return { ok: false, msg: 'playerId が必要です' };
  if (!hole || hole < 1 || hole > 18) return { ok: false, msg: 'hole は 1〜18 の範囲です' };
  if (isNaN(stroke)) stroke = 0;
  if (isNaN(putt))   putt   = 0;

  try {
    var sh = _sheet(SHEET_SCORES);
    var map = _headerMap(sh);
    var data = sh.getDataRange().getValues();
    var today = _today();

    // ── 対象行を検索（player_id × hole） ──
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][map['player_id']]) === playerId &&
          Number(data[i][map['hole']]) === hole) {
        // ── 既存行を更新 ──
        sh.getRange(i + 1, map['stroke']     + 1).setValue(stroke);
        sh.getRange(i + 1, map['putt']       + 1).setValue(putt);
        sh.getRange(i + 1, map['updated_at'] + 1).setValue(new Date());
        if (map['date'] !== undefined) {
          sh.getRange(i + 1, map['date'] + 1).setValue(today);
        }
        return { ok: true };
      }
    }

    // ── 対象行が無ければ新規追加（保険） ──
    //    通常は register 時に 18 行確保するためここには来ないが、
    //    既存データ移行時の取りこぼし対策として残す
    var row = _emptyRow(map);
    row[map['player_id']]  = playerId;
    row[map['hole']]       = hole;
    row[map['stroke']]     = stroke;
    row[map['putt']]       = putt;
    row[map['updated_at']] = new Date();
    if (map['date'] !== undefined) row[map['date']] = today;
    if (map['input_mode'] !== undefined) row[map['input_mode']] = 'par_diff';
    sh.appendRow(row);

    return { ok: true, created: true };
  } catch (err) {
    return { ok: false, msg: '保存失敗: ' + String(err.message || err) };
  }
}


// ════════════════════════════════════════════════════════════════
// 【SECTION C-4】GLand_getMyScores - 自分の18ホールスコア取得
//
// 設計意図：
//   - フロントの STAGE2（バックグラウンド更新）から呼ばれる
//   - 18ホール分の {stroke, putt} 配列を返す
//   - スコアが無いホールは {stroke:0, putt:0} で埋める（既存挙動）
//
// 入力（script.js _enterMain / onOnline から）:
//   payload = { playerId }
//
// 出力:
//   { ok: true, scores: [{stroke, putt}, ...18個] }
// ════════════════════════════════════════════════════════════════
function GLand_getMyScores(payload, meta) {
  payload = payload || {};
  var playerId = String(payload.playerId || '');
  if (!playerId) {
    return { ok: false, error: 'playerId が必要です', scores: [] };
  }

  try {
    var sh = _sheet(SHEET_SCORES);
    var map = _headerMap(sh);
    var data = sh.getDataRange().getValues();

    // ── 18個の空スコアで初期化 ──
    var scores = [];
    for (var h = 0; h < 18; h++) {
      scores.push({ stroke: 0, putt: 0 });
    }

    // ── 該当 player_id の全行をスキャン ──
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][map['player_id']]) === playerId) {
        var hn = Number(data[i][map['hole']]);
        if (hn >= 1 && hn <= 18) {
          scores[hn - 1] = {
            stroke: Number(data[i][map['stroke']]) || 0,
            putt:   Number(data[i][map['putt']])   || 0
          };
        }
      }
    }

    return { ok: true, scores: scores };
  } catch (err) {
    return {
      ok:     false,
      error:  'getMyScores失敗: ' + String(err.message || err),
      scores: []
    };
  }
}


// ════════════════════════════════════════════════════════════════
// 【SECTION C-5】★ GLand_getMates - 同伴メンバースコア取得
//
// 設計意図【既存挙動完全継承】：
//   - 同じ course × 同じ group の最大4名のスコアを返す
//   - 自分は1番目（先頭）に並べる
//   - 各メンバーは {playerId, nickname, realName, strokes: [18個]} の形式
//   - PARの配列も同梱（フロントで現在ホールハイライトに使用）
//
// 入力（script.js Mates.load から）:
//   payload = { courseId, groupName, playerId }
//
// 出力:
//   {
//     ok: true,
//     pars: [4,5,3,4,...],
//     members: [
//       { playerId, nickname, realName, strokes: [18個] },
//       ...
//     ]
//   }
// ════════════════════════════════════════════════════════════════
function GLand_getMates(payload, meta) {
  payload = payload || {};
  var courseId   = String(payload.courseId || '');
  var groupName  = String(payload.groupName || '');
  var myPlayerId = String(payload.playerId || '');

  if (!courseId) {
    return { ok: false, error: 'courseId が必要です', pars: [], members: [] };
  }
  if (!groupName) {
    return { ok: false, error: 'groupName が必要です', pars: [], members: [] };
  }

  try {
    // ── 1) コースのPAR配列を取得 ──
    var pars = _loadPars(courseId);

    // ── 2) Players シートから同じ course×group のメンバーを最大4名収集 ──
    var pSh = _sheet(SHEET_PLAYERS);
    var pMap = _headerMap(pSh);
    var pData = pSh.getDataRange().getValues();

    var members = [];
    var memberIds = {};   // playerId → members 配列のインデックス
    for (var r = 1; r < pData.length; r++) {
      if (String(pData[r][pMap['course_id']]) !== courseId) continue;
      // group_name は trim 比較（既存挙動継承）
      if (String(pData[r][pMap['group_name']]).trim() !== groupName.trim()) continue;

      var pid = String(pData[r][pMap['player_id']]);
      if (!pid) continue;

      members.push({
        playerId: pid,
        nickname: String(pData[r][pMap['nickname']]  || ''),
        realName: String(pData[r][pMap['real_name']] || ''),
        strokes:  new Array(18).fill(0)
      });
      memberIds[pid] = members.length - 1;

      // 既存挙動：最大4名でストップ
      if (members.length >= 4) break;
    }

    // ── 3) Scores シートを1回だけ読込んで全メンバー分のスコアを埋める ──
    //    （メンバー数だけスキャンするより、シート1回読込みの方が高速）
    if (members.length > 0) {
      var sSh = _sheet(SHEET_SCORES);
      var sMap = _headerMap(sSh);
      var sData = sSh.getDataRange().getValues();

      for (var i = 1; i < sData.length; i++) {
        var pid2 = String(sData[i][sMap['player_id']]);
        if (!(pid2 in memberIds)) continue;

        var hn = Number(sData[i][sMap['hole']]);
        if (!hn || hn < 1 || hn > 18) continue;

        var st = Number(sData[i][sMap['stroke']]) || 0;
        members[memberIds[pid2]].strokes[hn - 1] = st;
      }
    }

    // ── 4) 自分を1番目に並べる（既存挙動） ──
    members.sort(function (a, b) {
      if (a.playerId === myPlayerId) return -1;
      if (b.playerId === myPlayerId) return  1;
      return 0;
    });

    return {
      ok:      true,
      pars:    pars,
      members: members
    };
  } catch (err) {
    return {
      ok:      false,
      error:   'getMates失敗: ' + String(err.message || err),
      pars:    [],
      members: []
    };
  }
}
