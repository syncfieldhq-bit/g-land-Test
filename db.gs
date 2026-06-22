/* =============================================================
 * G-WORLD v70 — db.gs  (Spreadsheet CRUD)
 *
 *  方針：
 *   - 1 リクエスト内で同一シートを何度も読まないように getValues() を最小化。
 *   - Users / Rounds / Scores は全件 1 回読み → メモリ上で走査 → 必要セルだけ setValue。
 *   - v70 新規 : dbBatchUpsertScores (apiBatchSaveScores 用)。
 *   - v69 互換 : familyKana 列を自動追加して下位互換。
 * ============================================================= */

/* ===== USERS ===== */
function _usersHeader_() {
  const sh = _db().getSheetByName(SHEET.USERS);
  const head = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  if (head.indexOf('familyKana') < 0) {
    const firstNameCol = head.indexOf('firstName');
    const insertAt = firstNameCol >= 0 ? firstNameCol + 1 : sh.getLastColumn() + 1;
    sh.insertColumnBefore(insertAt);
    sh.getRange(1, insertAt).setValue('familyKana');
    return sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  }
  return head;
}
function _userColIdx_(head) {
  return {
    userId      : head.indexOf('userId'),
    nickname    : head.indexOf('nickname'),
    familyName  : head.indexOf('familyName'),
    familyKana  : head.indexOf('familyKana'),
    firstName   : head.indexOf('firstName'),
    courseAdjust: head.indexOf('courseAdjust'),
    createdAt   : head.indexOf('createdAt'),
    updatedAt   : head.indexOf('updatedAt')
  };
}

function dbCreateUser(nickname, familyName, firstName, familyKana) {
  const sh = _db().getSheetByName(SHEET.USERS);
  const head = _usersHeader_();
  const col = _userColIdx_(head);
  const id = 'U-' + Utilities.getUuid().slice(0,8);
  const now = new Date();
  const row = new Array(head.length).fill('');
  if (col.userId       >= 0) row[col.userId]       = id;
  if (col.nickname     >= 0) row[col.nickname]     = nickname || '';
  if (col.familyName   >= 0) row[col.familyName]   = familyName || '';
  if (col.familyKana   >= 0) row[col.familyKana]   = familyKana || '';
  if (col.firstName    >= 0) row[col.firstName]    = firstName || '';
  if (col.courseAdjust >= 0) row[col.courseAdjust] = 0;
  if (col.createdAt    >= 0) row[col.createdAt]    = now;
  if (col.updatedAt    >= 0) row[col.updatedAt]    = now;
  sh.appendRow(row);
  /* 直接組み立てて返す (再 read を回避) */
  return {
    userId:id, nickname:nickname||'', familyName:familyName||'',
    familyKana:familyKana||'', firstName:firstName||'',
    courseAdjust:0, createdAt:now.getTime(), updatedAt:now.getTime()
  };
}
function dbGetUser(userId) {
  if (!userId) return null;
  const head = _usersHeader_();
  const data = _db().getSheetByName(SHEET.USERS).getDataRange().getValues();
  const col = _userColIdx_(head);
  for (let i=1;i<data.length;i++) {
    if (data[i][col.userId]===userId) return _row2user_(data[i], col);
  }
  return null;
}
function dbUpdateUser(userId, patch) {
  const sh = _db().getSheetByName(SHEET.USERS);
  const head = _usersHeader_();
  const col = _userColIdx_(head);
  const data = sh.getDataRange().getValues();
  for (let i=1;i<data.length;i++) {
    if (data[i][col.userId]===userId) {
      const rowNo = i + 1;
      const updates = []; /* [col1based, value] */
      if (patch.nickname     != null && col.nickname     >= 0) updates.push([col.nickname     + 1, patch.nickname]);
      if (patch.familyName   != null && col.familyName   >= 0) updates.push([col.familyName   + 1, patch.familyName]);
      if (patch.familyKana   != null && col.familyKana   >= 0) updates.push([col.familyKana   + 1, patch.familyKana]);
      if (patch.firstName    != null && col.firstName    >= 0) updates.push([col.firstName    + 1, patch.firstName]);
      if (patch.courseAdjust != null && col.courseAdjust >= 0) updates.push([col.courseAdjust + 1, patch.courseAdjust]);
      if (col.updatedAt >= 0) updates.push([col.updatedAt + 1, new Date()]);
      /* セット (個別 setValue は Range I/O 1 回ずつだが Users は浅いので許容範囲) */
      updates.forEach(function(u){ sh.getRange(rowNo, u[0]).setValue(u[1]); });
      /* 返値をメモリ上で組立 */
      const merged = data[i].slice();
      updates.forEach(function(u){ merged[u[0]-1] = u[1]; });
      return _row2user_(merged, col);
    }
  }
  return null;
}
function _row2user_(r, col) {
  if (!col) {
    return { userId:r[0], nickname:r[1], familyName:r[2], familyKana:'',
             firstName:r[3], courseAdjust:Number(r[4]||0),
             createdAt:r[5]&&r[5].getTime?r[5].getTime():r[5],
             updatedAt:r[6]&&r[6].getTime?r[6].getTime():r[6] };
  }
  function dt(v){ return v && v.getTime ? v.getTime() : (v || null); }
  return {
    userId      : col.userId       >= 0 ? r[col.userId]       : '',
    nickname    : col.nickname     >= 0 ? r[col.nickname]     : '',
    familyName  : col.familyName   >= 0 ? r[col.familyName]   : '',
    familyKana  : col.familyKana   >= 0 ? (r[col.familyKana] || '') : '',
    firstName   : col.firstName    >= 0 ? r[col.firstName]    : '',
    courseAdjust: col.courseAdjust >= 0 ? Number(r[col.courseAdjust]||0) : 0,
    createdAt   : col.createdAt    >= 0 ? dt(r[col.createdAt]) : null,
    updatedAt   : col.updatedAt    >= 0 ? dt(r[col.updatedAt]) : null
  };
}

/* ===== ROUNDS ===== */
function dbStartRound(p) {
  const sh = _db().getSheetByName(SHEET.ROUNDS);
  const id = 'R-' + Utilities.getUuid().slice(0,8);
  const gid = p.groupId || ('G-' + Utilities.getUuid().slice(0,6));
  const now = new Date();
  sh.appendRow([id, gid, p.ownerUserId||'', APP_META.course,
                p.tee||'reg', p.holeMode||18, p.inputMode||'simple',
                p.scoreMode||'number', p.lockerNo||'', now, '', 'active']);
  return { roundId:id, groupId:gid, startedAt:now.getTime() };
}
function dbPatchRound(roundId, patch) {
  const sh = _db().getSheetByName(SHEET.ROUNDS);
  const data = sh.getDataRange().getValues();
  const head = data[0];
  for (let i=1;i<data.length;i++) {
    if (data[i][0]===roundId) {
      Object.keys(patch).forEach(function(k){
        const col = head.indexOf(k);
        if (col>=0) sh.getRange(i+1,col+1).setValue(patch[k]);
      });
      return true;
    }
  }
  return false;
}
function dbGetRound(roundId) {
  const sh = _db().getSheetByName(SHEET.ROUNDS);
  const data = sh.getDataRange().getValues();
  if (data.length<2) return null;
  const head = data[0];
  for (let i=1;i<data.length;i++) {
    if (data[i][0]===roundId) {
      const o={}; head.forEach(function(h,idx){ o[h]=data[i][idx]; });
      return o;
    }
  }
  return null;
}
function dbFindRoundByGroup(groupId) {
  const data = _db().getSheetByName(SHEET.ROUNDS).getDataRange().getValues();
  for (let i=data.length-1;i>=1;i--) {
    if (data[i][1]===groupId && data[i][11]==='active') return dbGetRound(data[i][0]);
  }
  return null;
}

/* ===== SCORES ===== */
function dbUpsertScore(roundId, playerName, playerType, holeNo, par, stroke, putt) {
  const sh = _db().getSheetByName(SHEET.SCORES);
  const data = sh.getDataRange().getValues();
  const now = new Date();
  for (let i=1;i<data.length;i++) {
    if (data[i][0]===roundId && data[i][1]===playerName && Number(data[i][3])===Number(holeNo)) {
      const row = i + 1;
      /* 1 リクエストの中で 4 セル更新するより Range で一括書く方が速い */
      sh.getRange(row, 5, 1, 4).setValues([[par, stroke, putt, now]]);
      return { mode:'update' };
    }
  }
  sh.appendRow([roundId, playerName, playerType||'companion', holeNo, par, stroke, putt, now]);
  return { mode:'insert' };
}

/**
 * v70 新規 : 複数スコアを 1 シート読込で upsert する。
 * items = [{ playerName, playerType, holeNo, par, stroke, putt }, ...]
 * 返値 : [{ holeNo, playerName, mode }]
 */
function dbBatchUpsertScores(roundId, items) {
  const sh = _db().getSheetByName(SHEET.SCORES);
  const data = sh.getDataRange().getValues();
  const now = new Date();

  /* roundId 限定の行インデックスを (playerName + '#' + holeNo) で構築 */
  const indexMap = Object.create(null);
  for (let i=1;i<data.length;i++) {
    if (data[i][0]===roundId) {
      indexMap[data[i][1] + '#' + Number(data[i][3])] = i; /* 0-based row */
    }
  }

  const appendBuffer = [];
  const results = [];
  items.forEach(function(it){
    const key = it.playerName + '#' + Number(it.holeNo);
    const idx = indexMap[key];
    const par    = Number(it.par)||0;
    const stroke = (it.stroke==null || it.stroke==='') ? null : Number(it.stroke);
    const putt   = (it.putt  ==null || it.putt  ==='') ? null : Number(it.putt);
    if (idx != null) {
      const row = idx + 1;
      sh.getRange(row, 5, 1, 4).setValues([[par, stroke, putt, now]]);
      results.push({ holeNo:Number(it.holeNo), playerName:it.playerName, mode:'update' });
    } else {
      appendBuffer.push([roundId, it.playerName, it.playerType||'companion',
                         Number(it.holeNo), par, stroke, putt, now]);
      results.push({ holeNo:Number(it.holeNo), playerName:it.playerName, mode:'insert' });
    }
  });

  /* append は一括 (setValues) で I/O を 1 回に集約 */
  if (appendBuffer.length) {
    const lastRow = sh.getLastRow();
    sh.getRange(lastRow + 1, 1, appendBuffer.length, appendBuffer[0].length)
      .setValues(appendBuffer);
  }
  return results;
}

function dbListScores(roundId) {
  const data = _db().getSheetByName(SHEET.SCORES).getDataRange().getValues();
  const out = [];
  for (let i=1;i<data.length;i++) {
    if (data[i][0]===roundId) {
      out.push({
        playerName:data[i][1], playerType:data[i][2], holeNo:Number(data[i][3]),
        par:data[i][4]===''?null:Number(data[i][4]),
        stroke:data[i][5]===''?null:Number(data[i][5]),
        putt:data[i][6]===''?null:Number(data[i][6])
      });
    }
  }
  return out;
}
function dbLog(event, payload) {
  try { _db().getSheetByName(SHEET.LOG).appendRow([new Date(), event, JSON.stringify(payload||{})]); }
  catch(_) {}
}
