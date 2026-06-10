/******************************************************************
 * G-WORLD Backend - Golf Repository
 *
 * G-LAND のシート直接アクセス層（リポジトリ）
 *
 * 設計意図【関心の分離】：
 *   - API層（GolfApi / GolfHistoryApi）は本ファイルの関数だけを呼ぶ
 *   - シート構造変更時の修正箇所を本ファイルに集約
 *   - 列順依存ゼロ（全て _headerMap 経由でアクセス）
 *
 * 含まれる関数：
 *   - _loadAllCourses           : Courses シート全件を JS オブジェクト配列で返す
 *   - _loadPars                 : 指定 courseId の18ホール PAR 配列を取得
 *   - _loadCourseInfo           : 指定 courseId のコース情報（PAR配列付き）を取得
 *   - _loadPlayerById           : 指定 playerId のプレイヤー情報を取得
 *   - _backfillPlayerGwUserId   : Players の指定行に gw_user_id を後付け補完
 *   - _initEmptyScores          : Scores シートに18ホール分の空行を一括投入
 *   - _collectScoresForSnapshot : 指定 playerId の全スコアを集約（履歴保存用）
 *
 * 【依存】
 *   - services_SheetService.gs : _sheet, _headerMap, _safeJsonParse
 *   - utils_Utils.gs           : _today
 *   - config_Config.gs         : SHEET_COURSES, SHEET_PLAYERS, SHEET_SCORES
 *
 * 【呼出元】
 *   - api_CoreApi.gs           : Core_boot → _loadAllCourses
 *   - api_GolfApi.gs           : GLand_register → _initEmptyScores
 *                                GLand_getMates → _loadPars
 *   - api_GolfHistoryApi.gs    : GLand_saveSnapshot → _loadPlayerById /
 *                                                     _backfillPlayerGwUserId /
 *                                                     _loadCourseInfo /
 *                                                     _collectScoresForSnapshot
 *                                GLand_getHistoryDetail → _loadCourseInfo
 ******************************************************************/


// ════════════════════════════════════════════════════════════════
// 【Courses 系】
// ════════════════════════════════════════════════════════════════

/**
 * Courses シートから全コースを読込んで JS オブジェクト配列に変換
 *
 * 出力形式：
 *   [
 *     { id: 'G001', name: '六甲国際', pars: [4,5,3,4,...18個] },
 *     ...
 *   ]
 *
 * 注意：
 *   - lc < 20 のシートは PAR列が足りていないため空配列を返す
 *   - 空のIDセル（data[i][0] が falsy）はスキップ
 */
function _loadAllCourses() {
  var ss = SpreadsheetApp.openById(SS_ID);
  var sh = ss.getSheetByName(SHEET_COURSES);
  if (!sh) return [];

  var lr = sh.getLastRow();
  var lc = sh.getLastColumn();
  if (lr < 2 || lc < 20) return [];

  var data = sh.getRange(1, 1, lr, lc).getValues();
  var list = [];
  for (var i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    list.push({
      id:   String(data[i][0]),
      name: String(data[i][1] || ''),
      pars: data[i].slice(2, 20).map(function (v) { return Number(v) || 4; })
    });
  }
  return list;
}

/**
 * 指定 courseId の18ホール PAR 配列を取得
 *   - 見つからない場合は全PAR=4
 *
 * @param {string} courseId
 * @returns {number[]} 18要素の PAR 配列
 */
function _loadPars(courseId) {
  var pars = [];
  try {
    var cSh = _sheet(SHEET_COURSES);
    var cData = cSh.getDataRange().getValues();
    for (var r = 1; r < cData.length; r++) {
      if (String(cData[r][0]) === String(courseId)) {
        for (var k = 2; k < 20; k++) {
          pars.push(Number(cData[r][k]) || 4);
        }
        break;
      }
    }
  } catch (e) {}
  if (!pars.length) {
    for (var d = 0; d < 18; d++) pars.push(4);
  }
  return pars;
}

/**
 * コース情報を取得（PAR配列付き）
 *   - 見つからなければデフォルト（全PAR=4 / 名前空）
 *
 * @param {string} courseId
 * @returns {Object} { courseId, courseName, pars: [18個] }
 */
function _loadCourseInfo(courseId) {
  var sh = _sheet(SHEET_COURSES);
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(courseId)) {
      var pars = [];
      for (var k = 2; k < 20; k++) pars.push(Number(data[i][k]) || 4);
      return {
        courseId:   String(data[i][0]),
        courseName: String(data[i][1] || ''),
        pars:       pars
      };
    }
  }
  // ── フォールバック ──
  var defPars = [];
  for (var d = 0; d < 18; d++) defPars.push(4);
  return { courseId: courseId, courseName: '', pars: defPars };
}


// ════════════════════════════════════════════════════════════════
// 【Players 系】
// ════════════════════════════════════════════════════════════════

/**
 * playerId からプレイヤー情報を取得
 *   - 戻り値は { playerId, courseId, nickname, realName, groupName, userId, gwUserId, inputMode }
 *   - 見つからなければ null
 *
 * 注意：
 *   - user_id / gw_user_id / input_mode 列が存在しないシートでも安全に動作
 *     （map[key] !== undefined チェックで列の有無を確認）
 *
 * @param {string} playerId
 * @returns {Object|null}
 */
function _loadPlayerById(playerId) {
  var sh = _sheet(SHEET_PLAYERS);
  var map = _headerMap(sh);
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][map['player_id']]) === String(playerId)) {
      return {
        playerId:  String(data[i][map['player_id']]),
        courseId:  String(data[i][map['course_id']] || ''),
        nickname:  String(data[i][map['nickname']] || ''),
        realName:  String(data[i][map['real_name']] || ''),
        groupName: String(data[i][map['group_name']] || ''),
        userId:    (map['user_id']      !== undefined) ? String(data[i][map['user_id']]      || '') : '',
        gwUserId:  (map['gw_user_id']   !== undefined) ? String(data[i][map['gw_user_id']]   || '') : '',
        inputMode: (map['input_mode']   !== undefined) ? String(data[i][map['input_mode']]   || '') : ''
      };
    }
  }
  return null;
}

/**
 * Players の指定行に gw_user_id を後付けで埋める
 *   - 既存データ救済：旧 player_id しか持たないプレイヤーに、新IDを紐付け
 *   - 既に gw_user_id が入っている行は上書きしない（既存挙動継承）
 *
 * @param {string} playerId
 * @param {string} gwUserId
 */
function _backfillPlayerGwUserId(playerId, gwUserId) {
  if (!playerId || !gwUserId) return;
  var sh = _sheet(SHEET_PLAYERS);
  var map = _headerMap(sh);
  if (map['gw_user_id'] === undefined) return; // 列が無いシートはスキップ
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][map['player_id']]) === String(playerId)) {
      if (!data[i][map['gw_user_id']]) {
        sh.getRange(i + 1, map['gw_user_id'] + 1).setValue(gwUserId);
      }
      return;
    }
  }
}


// ════════════════════════════════════════════════════════════════
// 【Scores 系】
// ════════════════════════════════════════════════════════════════

/**
 * Scores シートに18ホール分の空行を一括投入
 *   - 既存挙動完全継承：登録時に 18 行を確保
 *   - setValues で一括書込（性能配慮）
 *
 * @param {string} playerId - register 直後の正式プレイヤーID
 */
function _initEmptyScores(playerId) {
  var sh = _sheet(SHEET_SCORES);
  var map = _headerMap(sh);
  var maxIdx = 0;
  var keys = Object.keys(map);
  for (var k = 0; k < keys.length; k++) {
    if (map[keys[k]] > maxIdx) maxIdx = map[keys[k]];
  }

  var initRows = [];
  var now = new Date();
  var today = _today();
  for (var h = 1; h <= 18; h++) {
    var row = new Array(maxIdx + 1);
    for (var r = 0; r <= maxIdx; r++) row[r] = '';
    row[map['player_id']]  = playerId;
    row[map['hole']]       = h;
    row[map['stroke']]     = 0;
    row[map['putt']]       = 0;
    row[map['updated_at']] = now;
    if (map['date']       !== undefined) row[map['date']]       = today;
    if (map['input_mode'] !== undefined) row[map['input_mode']] = 'par_diff';
    initRows.push(row);
  }
  var startRow = Math.max(sh.getLastRow() + 1, 2);
  sh.getRange(startRow, 1, 18, maxIdx + 1).setValues(initRows);
}

/**
 * Scores シートから指定 playerId の全データを収集（履歴スナップショット用）
 *   - 18ホール分の {stroke, putt} 配列
 *   - shots_json があれば shotsDetail にも詰める
 *   - 最新の play_date を返す
 *
 * @param {string} playerId
 * @returns {Object} { holeScores: [{stroke, putt} x18], shotsDetail: [], playDate: 'YYYY-MM-DD' }
 */
function _collectScoresForSnapshot(playerId) {
  var sh = _sheet(SHEET_SCORES);
  var map = _headerMap(sh);
  var data = sh.getDataRange().getValues();

  var holeScores = [];
  for (var h = 0; h < 18; h++) holeScores.push({ stroke: 0, putt: 0 });

  var shotsDetail = [];
  var playDate = '';

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][map['player_id']]) !== String(playerId)) continue;
    var hn = Number(data[i][map['hole']]);
    if (hn < 1 || hn > 18) continue;

    holeScores[hn - 1] = {
      stroke: Number(data[i][map['stroke']]) || 0,
      putt:   Number(data[i][map['putt']])   || 0
    };

    if (map['date'] !== undefined && data[i][map['date']]) {
      playDate = String(data[i][map['date']]);
    }

    // 詳細ショットログがあれば収集（既存挙動継承）
    if (map['shots_json'] !== undefined && data[i][map['shots_json']]) {
      var shots = _safeJsonParse(data[i][map['shots_json']], null);
      if (Array.isArray(shots)) {
        shotsDetail.push({ hole: hn, shots: shots });
      }
    }
  }

  return {
    holeScores:  holeScores,
    shotsDetail: shotsDetail,
    playDate:    playDate
  };
}
