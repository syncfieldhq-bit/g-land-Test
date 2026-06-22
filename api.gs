/* =============================================================
 * G-WORLD v70 — api.gs  (JSON API エンジン)
 *
 *  方針：
 *   - サーバ側は「JSON を返す API」に専念。画面表示ロジックは持たない。
 *   - 読み取り系 (apiGetUser / apiListScores / apiBootstrap / apiJoinRound)
 *     は LockService を取得しない → 並列読み出しが可能で爆速。
 *   - 書込み系 (apiRegisterUser / apiStartRound / apiPatchRound /
 *     apiSaveScore / apiBatchSaveScores / apiUpdateUser) のみ書込みロック。
 *   - 楽観的 UI 用の `apiBatchSaveScores` を新設 (複数ホール一括保存)。
 *   - 戻り値スキーマ : 必ず `{ ok:boolean, ... }` を返す。
 * ============================================================= */

const _LOCK_WAIT_MS = 3000;   /* 5s → 3s に短縮 */

function _withWriteLock_(fn) {
  const lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(_LOCK_WAIT_MS)) return { ok:false, error:'ロック取得失敗 (混雑中)' };
    return fn();
  } catch(err) {
    return { ok:false, error:String(err) };
  } finally {
    try { lock.releaseLock(); } catch(_){}
  }
}
function _safe_(fn) {
  try { return fn(); }
  catch(err) { return { ok:false, error:String(err) }; }
}

/* ========== USER ========== */
function apiRegisterUser(payload) {
  return _withWriteLock_(function(){
    if (!payload || !payload.nickname || !payload.familyName || !payload.firstName)
      return { ok:false, error:'ニックネーム・姓・名はすべて必須です' };
    const user = dbCreateUser(
      String(payload.nickname).trim(),
      String(payload.familyName).trim(),
      String(payload.firstName).trim(),
      String(payload.familyKana || '').trim()
    );
    dbLog('user.register', { userId:user.userId });
    return { ok:true, user:user };
  });
}
function apiGetUser(userId) {
  return _safe_(function(){
    const u = dbGetUser(userId);
    return u ? { ok:true, user:u } : { ok:false, error:'user not found' };
  });
}
function apiUpdateUser(userId, patch) {
  return _withWriteLock_(function(){
    const u = dbUpdateUser(userId, patch||{});
    return u ? { ok:true, user:u } : { ok:false, error:'user not found' };
  });
}

/* ========== ROUND ========== */
function apiStartRound(payload) {
  return _withWriteLock_(function(){
    if (!payload || !payload.ownerUserId) return { ok:false, error:'ownerUserId 必須' };
    const r = dbStartRound(payload);
    dbLog('round.start', r);
    return { ok:true, round:r };
  });
}
function apiPatchRound(roundId, patch) {
  return _withWriteLock_(function(){
    return { ok: !!dbPatchRound(roundId, patch||{}) };
  });
}
function apiJoinRound(groupId) {
  return _safe_(function(){
    const r = dbFindRoundByGroup(groupId);
    if (!r) return { ok:false, error:'合流できるラウンドが見つかりません' };
    return { ok:true, round:r };
  });
}

/* ========== SCORE ========== */
function apiSaveScore(roundId, playerName, playerType, holeNo, par, stroke, putt) {
  return _withWriteLock_(function(){
    if (!roundId || !playerName || !holeNo) return { ok:false, error:'roundId/playerName/holeNo 必須' };
    const res = dbUpsertScore(
      String(roundId), String(playerName), playerType||'companion',
      Number(holeNo), Number(par)||0,
      (stroke===''||stroke==null)?null:Number(stroke),
      (putt===''||putt==null)?null:Number(putt)
    );
    dbLog('score.save', { roundId:roundId, h:holeNo, p:playerName, s:stroke, pt:putt, mode:res.mode });
    return { ok:true, mode:res.mode };
  });
}

/**
 * v70 新規 : 楽観的 UI のリトライキュー用に複数スコアを 1 ラウンドトリップで保存。
 * payload.items = [{ playerName, playerType, holeNo, par, stroke, putt }, ...]
 * 戻り値 : { ok:true, results:[{ holeNo, playerName, mode }, ...] }
 *         (個別失敗があれば mode='error' + error 付き)
 */
function apiBatchSaveScores(roundId, items) {
  return _withWriteLock_(function(){
    if (!roundId)                  return { ok:false, error:'roundId 必須' };
    if (!Array.isArray(items))     return { ok:false, error:'items は配列必須' };
    if (items.length === 0)        return { ok:true,  results:[] };
    /* 一回の openById / sheet 取得で全件処理 → I/O コスト最小化 */
    const results = dbBatchUpsertScores(String(roundId), items);
    dbLog('score.batch', { roundId:roundId, n:items.length });
    return { ok:true, results:results };
  });
}

function apiListScores(roundId) {
  return _safe_(function(){
    return { ok:true, scores: dbListScores(roundId) };
  });
}

/* ========== BOOTSTRAP : 起動時 1 リクエストで初期データ取得 ========== */
function apiBootstrap(payload) {
  return _safe_(function(){
    const out = { ok:true, serverTime: Date.now() };
    if (payload && payload.userId)  out.user   = dbGetUser(payload.userId);
    if (payload && payload.roundId) {
      out.round  = dbGetRound(payload.roundId);
      out.scores = dbListScores(payload.roundId);
    }
    if (payload && payload.joinId) {
      const r = dbFindRoundByGroup(payload.joinId);
      if (r) out.joinedRound = r;
    }
    return out;
  });
}

/**
 * v70 新規 : サーバ往復計測用 (UI に応答時間を表示するための ping)。
 * 楽観的 UI が真に「待たない」ことをユーザに体感してもらう。
 */
function apiPing() {
  return { ok:true, serverTime: Date.now() };
}
