<script>
/* =============================================================
 * G-WORLD v70 — state_js : 楽観的 UI Store + リトライキュー + Promise API
 *
 *  ★ v70 で強化したポイント
 *   1) google.script.run を Promise 化 (旧仕様互換)
 *   2) gwApi() : リトライ + タイムアウト + 並列発火対応
 *   3) Store.subscribe(fn, keys?) : 差分通知 (キー指定可能)
 *      → app.js 側で「変更されたキーだけ再描画」を実現
 *   4) Store.setScore() :
 *      ・LocalStorage 即時反映 = 単一情報源
 *      ・通信失敗時は ".pending" キューへ → 復活時に自動再送
 *      ・呼出側は通信完了を待たずに UI 遷移可能 (Promise は背景処理)
 *   5) defaultState を hole 数 18 固定で確保 (resize 無し)
 * ============================================================= */
(function(){
  'use strict';

  const LS_KEY        = 'gworld_v52_state';   /* 互換維持 */
  const PENDING_KEY   = 'gworld_v70_pending'; /* リトライキュー */
  const SAVE_DEBOUNCE = 400;
  const API_TIMEOUT   = 20000;
  const SUBS          = [];                   /* { fn, keys } */
  let   saveTimer     = null;
  let   retryTimer    = null;

  /* ============================================================
   * Promise 化された GAS Runner
   * ============================================================ */
  function api(name){
    const args = Array.prototype.slice.call(arguments, 1);
    return new Promise(function(resolve){
      if (!window.google || !google.script || !google.script.run) {
        console.warn('[GW STUB]', name, args);
        return resolve({ ok:false, error:'google.script.run unavailable', _offline:true });
      }
      let settled = false;
      const to = setTimeout(function(){
        if (settled) return;
        settled = true;
        resolve({ ok:false, error:'timeout', _timeout:true });
      }, API_TIMEOUT);
      const runner = google.script.run
        .withSuccessHandler(function(r){
          if (settled) return; settled = true; clearTimeout(to);
          resolve(r || { ok:false, error:'empty response' });
        })
        .withFailureHandler(function(e){
          if (settled) return; settled = true; clearTimeout(to);
          resolve({ ok:false, error: (e && e.message) || String(e) });
        });
      try { runner[name].apply(runner, args); }
      catch(err){
        if (settled) return; settled = true; clearTimeout(to);
        resolve({ ok:false, error:String(err) });
      }
    });
  }
  window.gwApi = api;

  /* ============================================================
   * デフォルト state
   * ============================================================ */
  function defaultState(){
    return {
      userId:'', nickname:'',
      familyName:'', familyKana:'',
      firstName:'', courseAdjust:0,
      roundId:'', groupId:'',
      lockerNo:'',
      tee:'reg',
      holeMode:18,
      inputMode:'simple',
      scoreMode:'number',
      cot:'',
      players:[],
      scores:{},
      currentHole:1
    };
  }
  function loadLS(){ try{ return JSON.parse(localStorage.getItem(LS_KEY)||'{}')||{}; } catch(_){ return {}; } }
  function saveLS(){ try{ localStorage.setItem(LS_KEY, JSON.stringify(State)); } catch(_){} }
  function loadPending(){
    try { return JSON.parse(localStorage.getItem(PENDING_KEY)||'[]') || []; }
    catch(_){ return []; }
  }
  function savePending(q){
    try { localStorage.setItem(PENDING_KEY, JSON.stringify(q)); }
    catch(_){}
  }

  const State = Object.assign(defaultState(), loadLS());
  /* 旧モード値の互換マッピング */
  if (['weather','number'].indexOf(State.inputMode) >= 0) State.inputMode = 'simple';
  if (State.inputMode !== 'simple' && State.inputMode !== 'counter') State.inputMode = 'simple';

  function ensureScoreSlot(name){
    if (!State.scores[name]) {
      State.scores[name] = { stroke:new Array(18).fill(null), putt:new Array(18).fill(null) };
    }
  }

  /* ============================================================
   * Store
   * ============================================================ */
  const Store = {
    get(k){ return k ? State[k] : State; },

    set(patch){
      const changed = Object.keys(patch);
      Object.assign(State, patch);
      saveLS();
      this._notify(changed);
      /* 通信が必要な round patch のみデバウンス */
      const needRoundPatch = changed.some(function(k){
        return ['tee','holeMode','inputMode','scoreMode','lockerNo'].indexOf(k) >= 0;
      });
      if (needRoundPatch) this._scheduleRoundPatch();
    },

    /**
     * スコア確定 → 楽観的 UI
     *   ① 即 LocalStorage に反映 ＆ 購読者に通知 (UI 先行)
     *   ② サーバ送信は背景タスク。失敗時はリトライキューへ
     */
    setScore(playerName, holeIdx, stroke, putt){
      ensureScoreSlot(playerName);
      const slot = State.scores[playerName];
      slot.stroke[holeIdx] = stroke;
      slot.putt[holeIdx]   = putt;
      saveLS();
      /* 「スコアだけが変わった」と購読者に通知 → 差分描画される */
      this._notify(['scores'], { player:playerName, holeIdx:holeIdx });

      if (!State.roundId) {
        if (window.gwToast) gwToast('⚠ ラウンド未開始のためローカル保存のみ');
        return Promise.resolve({ ok:false, error:'no roundId' });
      }
      const playerType = (State.players.find(function(p){ return p.name === playerName; })||{}).type || 'companion';
      const par = COURSE.holes[holeIdx].par;
      const job = {
        roundId    : State.roundId,
        playerName : playerName,
        playerType : playerType,
        holeNo     : holeIdx + 1,
        par        : par,
        stroke     : stroke,
        putt       : putt,
        ts         : Date.now()
      };
      return _sendScore(job).then(function(r){
        if (r && r.ok) {
          if (window.gwSetSync) gwSetSync('✓ ' + (r.mode === 'insert' ? '新規' : '更新'));
        } else {
          _enqueuePending(job);
          if (window.gwSetSync) gwSetSync('⏳ 再送待ち');
          if (window.gwToast) gwToast('通信失敗→再送キューへ', true);
        }
        return r;
      });
    },

    setSelf(user){
      if (!user) return;
      const displayName = user.familyName || user.nickname || '自分';
      Object.assign(State, {
        userId      : user.userId,
        nickname    : user.nickname,
        familyName  : user.familyName,
        familyKana  : user.familyKana || '',
        firstName   : user.firstName,
        courseAdjust: user.courseAdjust || 0
      });
      const meIdx = State.players.findIndex(function(p){ return p.type === 'me'; });
      if (meIdx === -1) {
        State.players.unshift({ name:displayName, kana:State.familyKana, type:'me' });
      } else {
        State.players[meIdx].name = displayName;
        State.players[meIdx].kana = State.familyKana;
      }
      ensureScoreSlot(displayName);
      saveLS();
      this._notify(['userId','nickname','familyName','familyKana','firstName','courseAdjust','players']);
    },

    addCompanion(name, kana){
      name = (name||'').trim();
      kana = (kana||'').trim();
      if (!name) return;
      const existing = State.players.find(function(p){ return p.name === name; });
      if (existing){
        if (kana) existing.kana = kana;
        saveLS(); this._notify(['players']);
        return;
      }
      State.players.push({ name:name, kana:kana, type:'companion' });
      ensureScoreSlot(name);
      saveLS();
      this._notify(['players','scores']);
    },

    sortPlayers(){
      State.players.sort(function(a,b){
        if (a.type === 'me' && b.type !== 'me') return -1;
        if (b.type === 'me' && a.type !== 'me') return  1;
        return 0;
      });
    },

    /**
     * @param {function} fn 購読関数 fn(state, changedKeys, meta)
     * @param {string[]} [keys] このキー集合のいずれかが変わった時だけ呼ぶ
     */
    subscribe(fn, keys){
      const sub = { fn:fn, keys: (keys && keys.length) ? keys : null };
      SUBS.push(sub);
      return function(){ const i = SUBS.indexOf(sub); if (i >= 0) SUBS.splice(i,1); };
    },

    _notify(changedKeys, meta){
      this.sortPlayers();
      const keys = changedKeys || ['*'];
      const isAll = keys.indexOf('*') >= 0;
      SUBS.forEach(function(sub){
        try {
          if (!sub.keys || isAll) { sub.fn(State, keys, meta); return; }
          /* 1つでも一致すれば発火 */
          for (let i=0;i<keys.length;i++) {
            if (sub.keys.indexOf(keys[i]) >= 0) { sub.fn(State, keys, meta); return; }
          }
        } catch(e){ console.warn(e); }
      });
    },

    _scheduleRoundPatch(){
      clearTimeout(saveTimer);
      saveTimer = setTimeout(function(){
        if (!State.roundId) return;
        api('apiPatchRound', State.roundId, {
          tee:State.tee, holeMode:State.holeMode,
          inputMode:State.inputMode, scoreMode:State.scoreMode,
          lockerNo:State.lockerNo
        }).catch(function(){});
      }, SAVE_DEBOUNCE);
    }
  };

  /* ============================================================
   * 計算ヘルパ (純粋関数 — 副作用なし)
   * ============================================================ */
  Store.calc = {
    holeCount(){ return State.holeMode === 9 ? 9 : 18; },
    isHoleLocked(idx0){ return State.holeMode === 9 && idx0 >= 9; },
    totalScore(name){
      const s = State.scores[name]; if (!s) return 0;
      const lim = Store.calc.holeCount();
      let t = 0; for (let i=0;i<lim;i++) t += (s.stroke[i]||0);
      return t;
    },
    outScore(name){
      const s = State.scores[name]; if (!s) return 0;
      let t = 0; for (let i=0;i<9;i++) t += (s.stroke[i]||0);
      return t;
    },
    inScore(name){
      const s = State.scores[name]; if (!s) return 0;
      let t = 0; for (let i=9;i<18;i++) t += (s.stroke[i]||0);
      return t;
    },
    outPar(){ let t=0; for(let i=0;i<9;i++) t+=COURSE.holes[i].par; return t; },
    inPar (){ let t=0; for(let i=9;i<18;i++) t+=COURSE.holes[i].par; return t; },
    totalDiff(name){
      const s = State.scores[name]; if (!s) return 0;
      const lim = Store.calc.holeCount();
      let d = 0;
      for (let i=0;i<lim;i++) if (s.stroke[i] != null) d += s.stroke[i] - COURSE.holes[i].par;
      return d;
    }
  };

  /* ============================================================
   * ブート (1リクエストでまとめて初期化)
   * ============================================================ */
  Store.boot = function(){
    /* 既存ローカル状態は即時 paint させる */
    Store._notify(['*']);
    _flushPending();   /* 起動直後にもキュー再送 */

    const joinId = (window.GW_BOOT && GW_BOOT.joinId) || '';
    if (!State.userId && !joinId) return;

    api('apiBootstrap', { userId:State.userId, joinId:joinId })
      .then(function(r){
        if (!r || !r.ok) return;
        if (r.user)        Store.setSelf(r.user);
        if (r.joinedRound) {
          let im = r.joinedRound.inputMode || 'simple';
          if (['weather','number'].indexOf(im) >= 0) im = 'simple';
          if (im !== 'simple' && im !== 'counter') im = 'simple';
          Store.set({
            roundId : r.joinedRound.roundId,
            groupId : r.joinedRound.groupId,
            tee     : r.joinedRound.tee || 'reg',
            holeMode: Number(r.joinedRound.holeMode) || 18,
            inputMode:im,
            scoreMode:r.joinedRound.scoreMode || 'number',
            lockerNo:r.joinedRound.lockerNo || ''
          });
        }
      });
  };

  /* ============================================================
   * 通信レイヤー (Score)
   * ============================================================ */
  function _sendScore(job){
    return api('apiSaveScore',
      job.roundId, job.playerName, job.playerType,
      job.holeNo, job.par, job.stroke, job.putt
    );
  }
  function _enqueuePending(job){
    const q = loadPending();
    /* 同じ (player,holeNo) は最新で上書き → キュー肥大化を防止 */
    const dupIdx = q.findIndex(function(x){
      return x.playerName === job.playerName && x.holeNo === job.holeNo && x.roundId === job.roundId;
    });
    if (dupIdx >= 0) q[dupIdx] = job; else q.push(job);
    savePending(q);
    _scheduleRetry();
  }
  function _scheduleRetry(){
    clearTimeout(retryTimer);
    retryTimer = setTimeout(_flushPending, 5000);
  }
  function _flushPending(){
    const q = loadPending();
    if (!q.length) return;
    /* 1 ラウンドトリップで一括送信 */
    const byRound = {};
    q.forEach(function(j){ (byRound[j.roundId] = byRound[j.roundId] || []).push(j); });

    const promises = Object.keys(byRound).map(function(rid){
      const items = byRound[rid].map(function(j){
        return {
          playerName:j.playerName, playerType:j.playerType,
          holeNo:j.holeNo, par:j.par, stroke:j.stroke, putt:j.putt
        };
      });
      return api('apiBatchSaveScores', rid, items).then(function(r){
        return { rid:rid, r:r };
      });
    });
    Promise.all(promises).then(function(results){
      /* 成功した分だけキューから除去 */
      const success = {};
      results.forEach(function(x){
        if (x.r && x.r.ok && Array.isArray(x.r.results)) {
          x.r.results.forEach(function(it){
            success[x.rid + '|' + it.playerName + '|' + it.holeNo] = true;
          });
        }
      });
      const remaining = q.filter(function(j){
        return !success[j.roundId + '|' + j.playerName + '|' + j.holeNo];
      });
      savePending(remaining);
      if (remaining.length === 0 && q.length > 0 && window.gwSetSync) {
        gwSetSync('✓ 再送完了');
      } else if (remaining.length > 0) {
        _scheduleRetry();   /* まだ残っていれば再スケジュール */
      }
    });
  }
  /* オンライン復帰で flush */
  window.addEventListener('online', _flushPending);

  window.Store = Store;
})();
</script>
