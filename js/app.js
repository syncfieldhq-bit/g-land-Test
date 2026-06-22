<script>
/* =============================================================
 * G-WORLD v70 — app_js (差分更新エンジン + 楽観的UI)
 *
 * 主な変更
 *  1) renderTable() を「初回骨組構築 + 以降セル差分更新」に分離
 *      - tbl.innerHTML = '...' 全書き換えを廃止
 *      - dom.cells[playerName][holeIdx] に td 参照を保持
 *      - 値が同じセルは触らない → リフロー最小
 *  2) Store.subscribe(fn, keys) を活用しキー別に再描画
 *      - scores → セル/合計のみ
 *      - players/holeMode/tee → 骨組再構築
 *      - scoreMode → セル表示形式のみ
 *  3) 確定ボタン : 通信を待たず即時に次ホールへ (state.js 側でリトライ保証)
 * ============================================================= */
(function(){
  'use strict';
  const $  = function(q, c){ return (c||document).querySelector(q); };
  const $$ = function(q, c){ return Array.prototype.slice.call((c||document).querySelectorAll(q)); };

  /* DOM 参照キャッシュ : テーブル差分更新用 */
  const dom = {
    table   : null,
    thead   : null,
    tbody   : null,
    cells   : Object.create(null),    /* [name][idx0] = td */
    sumOut  : Object.create(null),    /* [name] = td */
    sumIn   : Object.create(null),    /* [name] = td */
    sumTot  : Object.create(null),    /* [name] = td */
    sumTotD : Object.create(null),    /* [name] = small (E/+X/-X) */
    /* 構造ハッシュ : 同一なら骨組再利用 */
    structKey : ''
  };

  document.addEventListener('DOMContentLoaded', function(){
    bindAll();
    /* 細かい subscribe : 必要な描画のみ呼び出す */
    Store.subscribe(function(s, keys, meta){ renderTableDiff(s, keys, meta); },
                    ['scores','players','holeMode','tee','scoreMode']);
    Store.subscribe(renderHome,    ['nickname','familyName']);
    Store.subscribe(renderPrep,    ['players','lockerNo']);
    Store.subscribe(renderCardDash,['tee','scoreMode','holeMode','lockerNo','cot']);
    Store.subscribe(renderMyPage,  ['nickname','familyName','familyKana','firstName','courseAdjust']);
    Store.subscribe(syncSegments,  ['tee','holeMode','inputMode','scoreMode']);
    Store.subscribe(function(s){ if (panel.open) renderPanel(); }, ['inputMode','scoreMode']);
    /* 初回フルレンダ */
    renderAll(Store.get());
    Store.boot();
    routeInitial();
  });

  /* ---------- ユーティリティ ---------- */
  function calcCotPlus45(){
    const now = new Date();
    now.setMinutes(now.getMinutes() + 45);
    return String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
  }

  /* ---------- スクリーン制御 ---------- */
  const SCREENS = ['register','home','prep','card','compete','mypage'];
  function setScreen(name){
    if (SCREENS.indexOf(name) < 0) name = 'home';
    document.body.classList.remove('boot');
    SCREENS.forEach(function(s){ document.body.classList.remove('scr-' + s); });
    document.body.classList.add('scr-' + name);
    $$('#bottomNav button').forEach(function(b){
      GWDom.setClass(b, 'active', b.getAttribute('data-nav') === name);
    });
    window.scrollTo(0, 0);
  }
  window.gwSetScreen = setScreen;
  function routeInitial(){ setScreen(Store.get().userId ? 'home' : 'register'); }

  /* ---------- イベントバインド ---------- */
  function bindAll(){
    bindRegister(); bindNav(); bindSegments(); bindPrep();
    bindCardScreen(); bindPanel(); bindModals(); bindMyPage();
    bindCompete(); bindHome(); bindOrientation();
  }

  function bindRegister(){
    $('#regSubmit').addEventListener('click', function(){
      const nick   = $('#regNick').value.trim();
      const family = $('#regFamily').value.trim();
      const kanaEl = document.getElementById('regKana');
      const kana   = kanaEl ? kanaEl.value.trim() : '';
      const first  = $('#regFirst').value.trim();
      if (!nick || !family || !first) return toast('ニックネーム・姓・名 を全て入力してください', true);
      if (!kana) return toast('ふりがなを入力してください', true);
      /* 楽観的UI : 通信前にローカル状態を一旦反映 */
      Store.setSelf({
        userId:'(pending)', nickname:nick,
        familyName:family, familyKana:kana, firstName:first, courseAdjust:0
      });
      setScreen('home');
      toast('ようこそ ' + nick + ' さん!');
      gwApi('apiRegisterUser', { nickname:nick, familyName:family, familyKana:kana, firstName:first })
        .then(function(r){
          if (!r || !r.ok) return toast('登録失敗: ' + (r && r.error || '通信エラー'), true);
          Store.setSelf(r.user);
        });
    });
  }

  function bindNav(){
    $('#bottomNav').addEventListener('click', function(e){
      const btn = e.target.closest('button[data-nav]');
      if (!btn) return;
      const target = btn.getAttribute('data-nav');
      if (target === 'gworld') setScreen(Store.get().roundId ? 'card' : 'prep');
      else setScreen(target);
    });
  }

  function bindSegments(){
    document.body.addEventListener('click', function(e){
      const btn = e.target.closest('[data-bind] [data-val]');
      if (!btn) return;
      const seg = btn.closest('[data-bind]');
      const key = seg.getAttribute('data-bind');
      const val = btn.getAttribute('data-val');
      const cast = (key === 'holeMode') ? Number(val) : val;
      Store.set({ [key]: cast });
    });
  }

  function bindPrep(){
    $('#prepLocker').addEventListener('input', function(e){
      Store.set({ lockerNo: e.target.value.replace(/[^0-9]/g,'').slice(0,6) });
    });
    $('#btnShowInviteQR').addEventListener('click', openInviteQR);
    $('#btnOpenCamera').addEventListener('click', openCameraScanner);
    $('#btnStartRound').addEventListener('click', startRound);
    $('#btnOpenCourseInfo').addEventListener('click', function(){
      fillCourseInfo(); openModal('gmCourse');
    });
  }

  /* ============================================================
   * カメラQRスキャナ (機能維持)
   * ============================================================ */
  let scannerStream = null;
  let scannerRAF    = null;
  function openCameraScanner(){
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return toast('このブラウザはカメラに対応していません', true);
    }
    if (typeof jsQR !== 'function') {
      return toast('QRデコーダーの読込に失敗しました', true);
    }
    openModal('gmScanner');
    $('#scannerStatus').textContent = '📡 カメラを起動中…';
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } }, audio: false
    }).then(function(stream){
      scannerStream = stream;
      const video = $('#scannerVideo');
      video.srcObject = stream;
      video.setAttribute('playsinline', true);
      video.play();
      $('#scannerStatus').textContent = '🔍 QRコードをスキャン中…';
      scanLoop();
    }).catch(function(err){
      console.warn('camera error', err);
      $('#scannerStatus').textContent = '✗ カメラへのアクセスが拒否されました';
      toast('カメラへのアクセスを許可してください', true);
    });
    $('#gmMask').addEventListener('click', stopScannerOnce, { once:true });
  }
  function stopScannerOnce(e){
    if (e.target === $('#gmMask') || e.target.hasAttribute('data-close')) stopScanner();
  }
  function stopScanner(){
    if (scannerRAF){ cancelAnimationFrame(scannerRAF); scannerRAF = null; }
    if (scannerStream){
      scannerStream.getTracks().forEach(function(t){ t.stop(); });
      scannerStream = null;
    }
  }
  function scanLoop(){
    const video  = $('#scannerVideo');
    const canvas = $('#scannerCanvas');
    if (!video || !canvas || !scannerStream) return;
    if (video.readyState === video.HAVE_ENOUGH_DATA){
      canvas.width  = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(img.data, img.width, img.height, { inversionAttempts:'dontInvert' });
      if (code && code.data){ handleScannedQR(code.data); return; }
    }
    scannerRAF = requestAnimationFrame(scanLoop);
  }
  function handleScannedQR(text){
    stopScanner(); closeModal();
    if (!text) return;
    let name = null, userId = null, groupId = null;
    let m;
    if (m = text.match(/[?&]u=([^&]+)/)) userId = decodeURIComponent(m[1]);
    if (m = text.match(/[?&]n=([^&]+)/)) name   = decodeURIComponent(m[1]);
    if (m = text.match(/[?&]join=([^&]+)/)) groupId = decodeURIComponent(m[1]);
    if (!name && text.indexOf('{') === 0) {
      try {
        const j = JSON.parse(text);
        userId  = j.u || j.userId || userId;
        name    = j.n || j.name   || name;
        groupId = j.g || j.groupId || groupId;
      } catch(_){}
    }
    if (!name && !userId && !groupId && text.length <= 16 && text.length > 0) name = text;
    let known = {};
    try { known = JSON.parse(localStorage.getItem('gw_known_companions') || '{}'); } catch(_){}
    function resolveKnown(rec){
      if (!rec) return null;
      if (typeof rec === 'string') return { name: rec, kana: '' };
      return { name: rec.name || '', kana: rec.kana || '' };
    }
    const k1 = resolveKnown(userId ? known[userId] : null);
    if (k1 && k1.name) { addCompanionAndJump(k1.name, k1.kana); return; }
    const k2 = resolveKnown(name ? known['name:' + name] : null);
    if (k2 && k2.name) { addCompanionAndJump(k2.name, k2.kana); return; }
    $('#cmpFamily').value = name || '';
    $('#cmpKana').value   = '';
    $('#cmpFirst').value  = '';
    $('#btnCmpSave').dataset.userId  = userId  || '';
    $('#btnCmpSave').dataset.groupId = groupId || '';
    openModal('gmCompanionReg');
    setTimeout(function(){ $('#cmpFamily').focus(); }, 200);
  }
  function addCompanionAndJump(displayName, kana){
    if (!displayName) return;
    Store.addCompanion(displayName, kana || '');
    toast('同伴者「' + displayName + '」を追加しました');
    const s = Store.get();
    if (!s.roundId) startRound(); else setScreen('card');
  }

  /* ---------- ラウンド開始 (楽観的 UI) ---------- */
  function startRound(){
    const s = Store.get();
    if (!s.userId) return toast('プロフィール登録が必要です', true);
    if (s.roundId) { setScreen('card'); return; }
    /* 通信前に楽観的に画面遷移 → roundId が来たら裏で反映 */
    setScreen('card');
    toast('ラウンドを開始しました');
    gwApi('apiStartRound', {
      ownerUserId:s.userId, tee:s.tee, holeMode:s.holeMode,
      inputMode:s.inputMode, scoreMode:s.scoreMode, lockerNo:s.lockerNo
    }).then(function(r){
      if (!r || !r.ok) return toast('開始失敗: ' + (r && r.error||''), true);
      Store.set({ roundId:r.round.roundId, groupId:r.round.groupId });
    });
  }

  function bindHome(){
    $('#screen-home').addEventListener('click', function(e){
      const c = e.target.closest('.home-card[data-nav]');
      if (!c || c.classList.contains('disabled')) return;
      const nav = c.getAttribute('data-nav');
      if (nav === 'gworld') setScreen(Store.get().roundId ? 'card' : 'prep');
      else setScreen(nav);
    });
  }
  function bindCompete(){ $('#btnCmpInvite').addEventListener('click', openInviteQR); }

  /* ---------- スコアカード ---------- */
  function bindCardScreen(){
    $('#btnCloseCard').addEventListener('click', function(){ setScreen('prep'); });
    $('#dashTeeBtn').addEventListener('click', function(){
      const next = Store.get().tee === 'reg' ? 'ladies' : 'reg';
      Store.set({ tee: next });
      toast('使用ティー: ' + (next === 'ladies' ? 'LADIES' : 'REG'));
    });
    $('#dashScoreBtn').addEventListener('click', function(){
      const order = ['number','diff','symbol'];
      const cur   = Store.get().scoreMode;
      const next  = order[(order.indexOf(cur) + 1) % order.length];
      Store.set({ scoreMode: next });
      toast('スコア表示: ' + ({number:'ストローク',diff:'＋/ー',symbol:'◯ー△'})[next]);
    });
    $('#dashHolesBtn').addEventListener('click', function(){
      const next = Store.get().holeMode === 18 ? 9 : 18;
      Store.set({ holeMode: next });
      toast('ホール数: ' + next + 'H');
    });
    $('#dashLockerBtn').addEventListener('click', function(){
      $('#dashLockerInput').value = Store.get().lockerNo || '';
      openModal('gmDashLocker');
    });
    $('#dashCotBtn').addEventListener('click', function(){
      const saved = Store.get().cot;
      $('#dashCotInput').value = saved ? saved : calcCotPlus45();
      openModal('gmDashCot');
    });

    /* スコアカードのセル → 入力パネル (イベント委譲) */
    $('#cardTable').addEventListener('click', function(e){
      const startBtn = e.target.closest('.start-btn');
      if (startBtn) {
        openPanelByHoleNo(startBtn.getAttribute('data-player'), 1, false);
        return;
      }
      const td = e.target.closest('td.editable');
      if (!td) return;
      const name   = td.getAttribute('data-player');
      const holeNo = Number(td.getAttribute('data-hole-no'));
      if (!holeNo) return;
      openPanelByHoleNo(name, holeNo, true);
    });
  }

  /* ---------- 入力パネル ---------- */
  function bindPanel(){
    $('#panelMask').addEventListener('click', minimizePanel);
    $('#btnPanelConfirm').addEventListener('click', confirmPanel);
    $('#pnPrev').addEventListener('click', function(e){ e.stopPropagation(); moveHole(-1); });
    $('#pnNext').addEventListener('click', function(e){ e.stopPropagation(); moveHole(+1); });
    $('#pnClose').addEventListener('click', function(e){ e.stopPropagation(); minimizePanel(); });
    $('#floatingBar').addEventListener('click', resumePanel);
    $$('#inputPanel .pi-simple .pi-btn').forEach(function(btn){
      btn.addEventListener('click', function(e){
        e.stopPropagation();
        const hole = panel.hole; if (!hole) return;
        const d = Number(btn.getAttribute('data-delta'));
        setPanelStroke(hole.par + d);
      });
    });
    $('#pcMinus').addEventListener('click', function(e){ e.stopPropagation(); setPanelStroke(Math.max(0, panel.stroke - 1)); });
    $('#pcPlus').addEventListener('click',  function(e){ e.stopPropagation(); setPanelStroke(panel.stroke + 1); });
    $$('.pp-btn').forEach(function(btn){
      btn.addEventListener('click', function(e){
        e.stopPropagation();
        setPanelPutt(Number(btn.getAttribute('data-putt')));
      });
    });
    initSwipe($('#inputPanel'));
  }

  /* ---------- モーダル ---------- */
  function bindModals(){
    $('#gmMask').addEventListener('click', function(e){
      if (e.target === $('#gmMask') || e.target.hasAttribute('data-close')) closeModal();
    });
    $('#btnSaveSettings').addEventListener('click', function(){
      const uid = Store.get().userId;
      if (!uid) return toast('未登録です', true);
      const patch = {
        nickname:$('#setNick').value.trim(),
        familyName:$('#setFamily').value.trim(),
        firstName:$('#setFirst').value.trim(),
        courseAdjust:Number($('#setAdjust').value)||0
      };
      /* 楽観的反映 */
      Store.setSelf(Object.assign({ userId: uid, familyKana: Store.get().familyKana }, patch));
      toast('設定を保存しました');
      closeModal();
      gwApi('apiUpdateUser', uid, patch).then(function(r){
        if (r && r.ok) Store.setSelf(r.user);
        else toast('保存失敗 (再送される場合があります)', true);
      });
    });
    $('#btnSaveLocker').addEventListener('click', function(){
      const v = $('#dashLockerInput').value.replace(/[^0-9]/g,'').slice(0,6);
      Store.set({ lockerNo: v });
      toast('ロッカー番号: ' + (v || '―'));
      closeModal();
    });
    $('#btnSaveCot').addEventListener('click', function(){
      const v = $('#dashCotInput').value || '06:45';
      Store.set({ cot: v });
      toast('後半スタート: ' + v);
      closeModal();
    });
    $('#btnCmpSave').addEventListener('click', function(){
      const family = $('#cmpFamily').value.trim();
      const kanaEl = document.getElementById('cmpKana');
      const kana   = kanaEl ? kanaEl.value.trim() : '';
      const first  = $('#cmpFirst').value.trim();
      if (!family) return toast('姓は必須です', true);
      if (!kana)   return toast('ふりがなを入力してください', true);
      const displayName = first ? (family + ' ' + first) : family;
      const userId = $('#btnCmpSave').dataset.userId || '';
      try {
        const known = JSON.parse(localStorage.getItem('gw_known_companions') || '{}');
        const record = { name: displayName, kana: kana };
        if (userId) known[userId] = record;
        known['name:' + displayName] = record;
        localStorage.setItem('gw_known_companions', JSON.stringify(known));
      } catch(_){}
      closeModal();
      addCompanionAndJump(displayName, kana);
    });
  }

  function openModal(id){
    $('#gmMask').classList.add('show');
    $$('.gm').forEach(function(m){ m.classList.remove('active'); });
    $('#' + id).classList.add('active');
  }
  function closeModal(){ $('#gmMask').classList.remove('show'); }

  function bindMyPage(){
    $('#btnMySave').addEventListener('click', function(){
      const family = $('#myFamily').value.trim();
      const kana = $('#myKana').value.trim();
      const first = $('#myFirst').value.trim();
      const nick = $('#myNick').value.trim();
      if (!family || !kana || !first || !nick) {
        return toast('姓・ふりがな・名・ニックネームを全て入力してください', true);
      }
      const uid = Store.get().userId;
      if (!uid) return toast('未登録です', true);
      const patch = { nickname:nick, familyName:family, familyKana:kana,
                      firstName:first, courseAdjust:Number($('#myAdjust').value)||0 };
      /* 楽観的反映 → 待たずに toast */
      Store.setSelf(Object.assign({ userId: uid }, patch));
      toast('プロフィールを保存しました');
      gwApi('apiUpdateUser', uid, patch).then(function(r){
        if (r && r.ok) Store.setSelf(r.user);
        else toast('保存失敗 (バックグラウンドで再試行)', true);
      });
    });
    $('#btnMyReset').addEventListener('click', function(){
      if (!confirm('ローカルデータを全消去してよろしいですか？')) return;
      localStorage.clear();
      location.reload();
    });
  }

  function bindOrientation(){
    function handleOrientation(){
      const isLandscape = window.matchMedia('(orientation: landscape)').matches;
      document.body.classList.toggle('is-landscape', isLandscape);
      if (isLandscape) $('#floatingBar').classList.remove('show');
      /* 描画は構造変更ではないので骨組は維持 */
    }
    handleOrientation();
    window.addEventListener('orientationchange', handleOrientation);
    window.addEventListener('resize', handleOrientation);
  }

  /* ============================================================
   * Rendering : 初回のみ呼ぶフル描画
   * ============================================================ */
  function renderAll(s){
    renderHome(s);
    renderPrep(s);
    renderCardDash(s);
    renderTableFull(s);  /* ←骨組構築 */
    renderMyPage(s);
    syncSegments(s);
    if (panel.open) renderPanel();
  }

  function syncSegments(s){
    $$('[data-bind]').forEach(function(seg){
      const key = seg.getAttribute('data-bind');
      const val = String(s[key]);
      $$('[data-val]', seg).forEach(function(b){
        GWDom.setClass(b, 'active', b.getAttribute('data-val') === val);
      });
    });
    GWDom.setText($('#prepHolesNum'), s.holeMode);
    if (panel.open) syncPanelTab(s.inputMode);
  }

  function renderHome(s){
    GWDom.setText($('#homeUserName'), s.nickname || s.familyName || 'ゲスト');
  }

  function renderPrep(s){
    GWDom.setValue($('#prepLocker'), s.lockerNo || '');
    const wrap = $('#prepPlayers');
    /* 同伴者リストは件数が少ないので構造変化時のみ rebuild */
    const sig = s.players.map(function(p){ return p.type+'|'+p.name+'|'+(p.kana||''); }).join('§');
    if (wrap.dataset.sig === sig) return;
    wrap.dataset.sig = sig;
    /* DocumentFragment で 1 commit */
    const frag = document.createDocumentFragment();
    s.players.forEach(function(p){
      const row = document.createElement('div');
      row.className = 'pp-row-item' + (p.type === 'me' ? ' me' : '');
      const kana = (p.kana||'').trim();
      row.innerHTML =
        '<div style="display:flex;flex-wrap:nowrap;align-items:center;gap:12px;padding:8px 0;overflow:hidden;">' +
          '<span style="font-size:24px;flex-shrink:0;">' + (p.type === 'me' ? '🏌️‍♂️' : '👤') + '</span>' +
          '<div style="flex-grow:1;overflow-x:auto;white-space:nowrap;padding-bottom:5px;">' +
            '<span style="font-size:26px;font-weight:bold;">' + escapeHtml(p.name) + '</span>' +
            '<span style="font-size:26px;color:#555;margin-left:10px;">' + escapeHtml(kana) + '</span>' +
          '</div>' +
        '</div>' +
        '<span class="pp-tag">' + (p.type === 'me' ? '自分' : '同伴') + '</span>';
      frag.appendChild(row);
    });
    wrap.replaceChildren(frag);
    if (window.GW_BOOT && GW_BOOT.webAppUrl) {
      GWQR.render($('#freeQR'), GW_BOOT.webAppUrl, 90);
    }
  }

  function renderCardDash(s){
    GWDom.setText($('#dashTee'),    s.tee === 'ladies' ? 'LADIES' : 'REG');
    GWDom.setText($('#dashScore'),  ({ number:'ストローク', diff:'＋/ー', symbol:'◯ー△' })[s.scoreMode] || 'ストローク');
    GWDom.setText($('#dashHoles'),  (s.holeMode || 18) + 'H');
    GWDom.setText($('#dashLocker'), s.lockerNo || '―');
    GWDom.setText($('#dashCot'),    s.cot || '06:45');
  }

  window.gwSetSync = function(label){
    const el = $('#dashSync'); if (!el) return;
    GWDom.setText(el, label);
    el.parentNode.classList.toggle('synced', /✓/.test(label));
  };

  function renderMyPage(s){
    GWDom.setText($('#myName'), s.familyName ? (s.familyName + (s.firstName ? (' ' + s.firstName) : '')) : '未登録');
    GWDom.setText($('#mySub'),  s.nickname ? ('@' + s.nickname) : '本名未登録');
    GWDom.setValue($('#myNick'),   s.nickname || '');
    GWDom.setValue($('#myFamily'), s.familyName || '');
    GWDom.setValue($('#myKana'),   s.familyKana || '');
    GWDom.setValue($('#myFirst'),  s.firstName || '');
    GWDom.setValue($('#myAdjust'), s.courseAdjust || 0);
  }

  /* ============================================================
   * スコアカード描画 : 骨組構築 + セル差分更新
   * ============================================================ */
  function _buildStructKey(s){
    /* 同じならテーブル骨組は再利用可能 */
    const names = s.players.map(function(p){ return p.type+':'+p.name; }).join('|');
    return s.holeMode + '/' + s.tee + '/' + names;
  }

  function renderTableFull(s){
    const t = $('#cardTable'); if (!t) return;
    dom.table = t;
    dom.thead = t.tHead || t.querySelector('thead');
    dom.tbody = t.tBodies[0] || t.querySelector('tbody');
    if (!dom.thead) { dom.thead = document.createElement('thead'); t.appendChild(dom.thead); }
    if (!dom.tbody) { dom.tbody = document.createElement('tbody'); t.appendChild(dom.tbody); }
    dom.cells   = Object.create(null);
    dom.sumOut  = Object.create(null);
    dom.sumIn   = Object.create(null);
    dom.sumTot  = Object.create(null);
    dom.sumTotD = Object.create(null);

    const lim = Store.calc.holeCount();
    const cols = [];
    for (let i=0;i<lim;i++) {
      const h = COURSE.holes[i];
      cols.push({ kind:'hole', holeNo:h.no, par:h.par,
                  label:h.no + 'H',
                  sub:(s.tee === 'ladies' ? h.ladiesYard : h.regYard) + 'y' });
      if (i === 8 && lim >= 9) cols.push({ kind:'out', label:'OUT' });
      if (i === 17) cols.push({ kind:'in',  label:'IN' });
    }
    if (lim === 9) cols.push({ kind:'in', label:'OUT' });

    /* thead */
    const trH = document.createElement('tr');
    trH.innerHTML = '<th class="player-name">プレイヤー</th>' +
      cols.map(function(c){
        const cls = c.kind === 'out' ? 'cell-out' : c.kind === 'in' ? 'cell-in' : '';
        return '<th class="' + cls + '">' + c.label + (c.sub ? '<small>'+c.sub+'</small>' : '') + '</th>';
      }).join('') + '<th class="total-score">TOTAL</th>';
    dom.thead.replaceChildren(trH);

    /* tbody : par 行 + 各プレイヤー */
    const frag = document.createDocumentFragment();
    const trP = document.createElement('tr');
    trP.className = 'row-par';
    trP.innerHTML = '<td class="player-name"><strong>PAR</strong></td>' +
      cols.map(function(c){
        if (c.kind === 'hole') return '<td>' + c.par + '</td>';
        if (c.kind === 'out')  return '<td class="cell-out">' + Store.calc.outPar() + '</td>';
        if (c.kind === 'in')   return '<td class="cell-in">'  + Store.calc.inPar()  + '</td>';
      }).join('') + '<td class="total-score">' + COURSE.par + '</td>';
    frag.appendChild(trP);

    s.players.forEach(function(p){
      const tr = document.createElement('tr');
      if (p.type === 'me') tr.classList.add('row-me');
      /* 1セル目 : プレイヤー名 + 開始ボタン */
      const tdName = document.createElement('td');
      tdName.className = 'player-name';
      tdName.innerHTML = '<div>' + escapeHtml(p.name) +
        '<span class="player-tag">' + (p.type === 'me' ? '自分' : '代理') + '</span></div>' +
        '<button class="start-btn" data-player="' + escapeAttr(p.name) + '">▶ 入力開始</button>';
      tr.appendChild(tdName);

      dom.cells[p.name] = new Array(18).fill(null);

      cols.forEach(function(c){
        const td = document.createElement('td');
        if (c.kind === 'hole') {
          const idx0 = c.holeNo - 1;
          const locked = Store.calc.isHoleLocked(idx0);
          td.className = locked ? 'score-locked' : 'editable';
          td.setAttribute('data-player', p.name);
          td.setAttribute('data-hole-no', c.holeNo);
          dom.cells[p.name][idx0] = td;
        } else if (c.kind === 'out') {
          td.className = 'cell-out';
          dom.sumOut[p.name] = td;
        } else if (c.kind === 'in') {
          td.className = 'cell-in';
          dom.sumIn[p.name] = td;
        }
        tr.appendChild(td);
      });

      const tdTot = document.createElement('td');
      tdTot.className = 'total-score';
      const small  = document.createElement('small');
      const totVal = document.createTextNode('0');
      tdTot.appendChild(totVal);
      tdTot.appendChild(document.createElement('br'));
      tdTot.appendChild(small);
      dom.sumTot[p.name]  = totVal;          /* TextNode 直接書換え = 最速 */
      dom.sumTotD[p.name] = small;
      tr.appendChild(tdTot);

      frag.appendChild(tr);
    });
    dom.tbody.replaceChildren(frag);
    dom.structKey = _buildStructKey(s);

    /* 値書き込み */
    _paintAllCells(s);
  }

  function _paintAllCells(s){
    s.players.forEach(function(p){ _paintPlayerCells(s, p.name); });
  }

  function _paintPlayerCells(s, name){
    const slot = s.scores[name] || { stroke:[], putt:[] };
    const lim  = Store.calc.holeCount();
    const cells = dom.cells[name];
    if (!cells) return;
    for (let i=0;i<lim;i++) {
      const td = cells[i];
      if (!td) continue;
      const v   = slot.stroke[i];
      const par = COURSE.holes[i].par;
      const html = formatCell(v, par, s.scoreMode);
      if (td.innerHTML !== html) td.innerHTML = html;
    }
    /* 合計 */
    if (dom.sumOut[name]) GWDom.setText(dom.sumOut[name], Store.calc.outScore(name));
    if (dom.sumIn [name]) GWDom.setText(dom.sumIn [name], Store.calc.inScore(name));
    const tot = Store.calc.totalScore(name);
    const d   = Store.calc.totalDiff(name);
    const ds  = d === 0 ? 'E' : (d > 0 ? '+' + d : String(d));
    if (dom.sumTot[name])  dom.sumTot[name].nodeValue = String(tot);
    if (dom.sumTotD[name]) dom.sumTotD[name].textContent = ds;
  }

  function renderTableDiff(s, keys, meta){
    if (!dom.table) { renderTableFull(s); return; }
    /* 構造変化 (プレイヤー追加/ホール数/ティー切替) → 全骨組再構築 */
    const newKey = _buildStructKey(s);
    if (newKey !== dom.structKey) { renderTableFull(s); return; }
    /* セル特定差分 (1ホール書込みの場合) */
    if (meta && meta.player) {
      _paintPlayerCells(s, meta.player);
      return;
    }
    /* scoreMode 変更 / 起動時など → 全セル再描画 (構造は再利用) */
    _paintAllCells(s);
  }

  function formatCell(v, par, mode){
    if (v == null) return '<span style="color:#bbb">―</span>';
    if (mode === 'symbol') return getDiffSymbol(v, par);
    if (mode === 'diff') {
      const d = v - par;
      if (d === 0) return 'E';
      if (d  >  0) return '<span class="diff-pos">+' + d + '</span>';
      return '<span class="diff-neg">' + d + '</span>';
    }
    return String(v);
  }

  /* ============================================================
   * 入力パネル — ホール番号を Single Source of Truth に
   * ============================================================ */
  let panel = {
    open   : false,
    holeNo : 1,
    hole   : null,
    name   : '',
    stroke : 0,
    putt   : 0,
    modify : false
  };

  function openPanelByHoleNo(playerName, holeNo, modify){
    const s = Store.get();
    if (!s.roundId) { startRound(); /* 楽観的:背景でロイック起動 */ }
    const hole = getHoleByNo(holeNo);
    if (!hole) { toast('ホール ' + holeNo + ' が見つかりません', true); return; }

    panel.open   = true;
    panel.holeNo = hole.no;
    panel.hole   = hole;
    panel.name   = playerName;
    panel.modify = !!modify;

    const idx0 = hole.no - 1;
    const sl = (s.scores[playerName]||{}).stroke || [];
    const pl = (s.scores[playerName]||{}).putt   || [];
    const existing = sl[idx0];
    if (existing != null)            panel.stroke = existing;
    else if (s.inputMode === 'simple') panel.stroke = hole.par;
    else                             panel.stroke = 0;
    panel.putt = pl[idx0] != null ? pl[idx0] : 0;

    Store.set({ currentHole: hole.no });
    syncPanelTab(s.inputMode);
    renderPanel();
    const ps = $('#panelScroll'); if (ps) ps.scrollTop = 0;
    $('#inputPanel').classList.add('open');
    $('#panelMask').classList.add('show');
    $('#floatingBar').classList.remove('show');
    updateNavButtons();
  }
  function minimizePanel(){
    $('#inputPanel').classList.remove('open');
    $('#panelMask').classList.remove('show');
    if (panel.open && panel.hole) {
      GWDom.setText($('#fbHoleLabel'), panel.hole.no + 'H (' + panel.name + ')');
      $('#floatingBar').classList.add('show');
    }
  }
  function resumePanel(){
    if (!panel.hole || !panel.name) return;
    $('#floatingBar').classList.remove('show');
    renderPanel();
    $('#inputPanel').classList.add('open');
    $('#panelMask').classList.add('show');
    updateNavButtons();
  }
  function closePanel(){
    panel.open = false;
    $('#inputPanel').classList.remove('open');
    $('#panelMask').classList.remove('show');
    $('#floatingBar').classList.remove('show');
  }
  function updateNavButtons(){
    const lim = Store.calc.holeCount();
    const no  = panel.hole ? panel.hole.no : 1;
    $('#pnPrev').classList.toggle('disabled', no <= 1);
    $('#pnNext').classList.toggle('disabled', no >= lim);
  }
  function setPanelStroke(v){ panel.stroke = Math.max(0, Math.min(20, v)); renderPanel(); }
  function setPanelPutt(v)  { panel.putt   = Math.max(0, Math.min(10, v)); renderPanel(); }

  function syncPanelTab(mode){
    $$('#inputPanel .panel-tabs button').forEach(function(b){
      GWDom.setClass(b, 'active', b.getAttribute('data-val') === mode);
    });
    $$('#inputPanel .pi-pane').forEach(function(p){ p.classList.remove('active'); });
    if (mode === 'counter') $('.pi-counter', $('#inputPanel')).classList.add('active');
    else                    $('.pi-simple',  $('#inputPanel')).classList.add('active');
  }

  function renderPanel(){
    if (!panel.hole) return;
    const s = Store.get();
    const hole = panel.hole;
    GWDom.setText($('#phHoleNo'), hole.no);
    GWDom.setText($('#phPar'),    hole.par);
    GWDom.setText($('#phYard'),   (s.tee === 'ladies' ? hole.ladiesYard : hole.regYard));
    GWDom.setClass($('#phWc'), 'has', !!hole.wc);

    GWDom.setText($('#prStroke'), panel.stroke > 0 ? panel.stroke : '―');
    GWDom.setText($('#prPutt'),   panel.putt   > 0 ? panel.putt   : '―');

    /* 累積 PAR 差 (パネル内専用カード) */
    const sl = (s.scores[panel.name]||{}).stroke || [];
    let diff = 0;
    for (let i=0;i<18;i++) {
      const v = (i === hole.no - 1) ? (panel.stroke || null) : sl[i];
      if (v != null) diff += v - COURSE.holes[i].par;
    }
    const dCell = $('#prDiff');
    dCell.classList.remove('over','under');
    if (diff === 0) { GWDom.setText(dCell, 'E'); }
    else if (diff > 0){ GWDom.setText(dCell, '+' + diff); dCell.classList.add('over'); }
    else { GWDom.setText(dCell, String(diff)); dCell.classList.add('under'); }

    for (let d = -2; d <= 6; d++) {
      const el = $('#ps' + (d >= 0 ? d : '-' + Math.abs(d)));
      if (el) GWDom.setText(el, hole.par + d);
    }
    const cur = panel.stroke;
    $$('#inputPanel .pi-simple .pi-btn').forEach(function(b){
      const d = Number(b.getAttribute('data-delta'));
      GWDom.setClass(b, 'active', cur === hole.par + d);
    });
    GWDom.setText($('#pcNum'), panel.stroke);
    $$('.pp-btn').forEach(function(b){
      GWDom.setClass(b, 'active', Number(b.getAttribute('data-putt')) === panel.putt);
    });
    GWDom.setText($('#ppCur'), panel.putt);
  }

  /* ★ 楽観的UI 本丸 : 即UI遷移 → 背景送信 (state.js が再送保証) */
  function confirmPanel(){
    if (!panel.hole) return;
    if (panel.stroke <= 0) return toast('ストロークを入力してください', true);
    const isModify = panel.modify;
    const name     = panel.name;
    const holeNo   = panel.hole.no;
    const idx0     = holeNo - 1;
    const stroke   = panel.stroke;
    const putt     = panel.putt;
    const lim      = Store.calc.holeCount();

    /* ①即時 UI 遷移 (絶対に通信を待たない) */
    if (isModify) {
      minimizePanel();
    } else if (holeNo < lim) {
      openPanelByHoleNo(name, holeNo + 1, false);
    } else {
      minimizePanel();
      toast('全ホール入力完了！お疲れさまでした');
    }
    /* ②保存は背景 (state.js が失敗時にリトライキューへ) */
    Store.setScore(name, idx0, stroke, putt).then(function(r){
      const mode = (r && r.ok) ? (r.mode === 'insert' ? '新規' : '更新') : '保存';
      if (window.gwSetSync) gwSetSync('✓ ' + mode + ' ' + holeNo + 'H');
    });
  }

  function moveHole(delta){
    if (!panel.hole) return;
    const lim = Store.calc.holeCount();
    const nextNo = panel.hole.no + delta;
    if (nextNo < 1 || nextNo > lim) return;
    openPanelByHoleNo(panel.name, nextNo, panel.modify);
  }

  /* ---------- スワイプ ---------- */
  function initSwipe(el){
    let sx = 0, sy = 0, t0 = 0, active = false;
    el.addEventListener('touchstart', function(e){
      if (e.target.closest(
        '.panel-navbar,.panel-confirm,.pi-btn,.pp-btn,.pi-cc,.panel-tabs button,.pi-counter-row,input,select'
      )) { active = false; return; }
      const t = e.touches[0];
      sx = t.clientX; sy = t.clientY; t0 = Date.now(); active = true;
    }, { passive:true });
    el.addEventListener('touchend', function(e){
      if (!active) return; active = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - sx;
      const dy = t.clientY - sy;
      if (Date.now() - t0 > 700) return;
      if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        moveHole(dx < 0 ? +1 : -1);
      }
    });
  }

  /* ---------- 招待QR / 設定 / コース ---------- */
  function openInviteQR(){
    const s = Store.get();
    if (!s.roundId) { startRound(); setTimeout(openInviteQR, 600); return; }
    const base = (GW_BOOT.webAppUrl || location.href);
    const myName = s.familyName || s.nickname || '';
    const params = [
      'join=' + encodeURIComponent(s.groupId),
      'u='    + encodeURIComponent(s.userId || ''),
      'n='    + encodeURIComponent(myName)
    ].join('&');
    const url = base + '?' + params;
    GWQR.render($('#inviteQR'), url, 220);
    GWDom.setText($('#inviteUrl'), url);
    openModal('gmInvite');
  }
  function fillCourseInfo(){
    buildYardageTable();
    GWDom.setText($('#ciRulesHeader'), LOCAL_RULES_HEADER);
    const rulesEl = $('#ciLocalRules');
    const rulesHtml = LOCAL_RULES.map(function(r){
      let inner = '<div class="ci-rule-num">' + r.num + '</div>';
      if (r.title) inner += '<div class="ci-rule-title">' + escapeHtml(r.title) + '</div>';
      if (r.items) inner += r.items.map(function(s){ return '<div class="ci-rule-sub">' + escapeHtml(s) + '</div>'; }).join('');
      else if (r.text) inner += '<div>' + escapeHtml(r.text) + '</div>';
      return '<div class="ci-rule-item">' + inner + '</div>';
    }).join('');
    GWDom.setHTML(rulesEl, rulesHtml);
    const notesHtml = OTHER_NOTES.map(function(n){ return '<div>・' + escapeHtml(n) + '</div>'; }).join('');
    GWDom.setHTML($('#ciOtherNotes'), notesHtml);
  }
  function buildYardageTable(){
    const t = $('#ciYardageTable'); if (!t) return;
    const holes = COURSE.holes;
    const out = holes.slice(0, 9);
    const inn = holes.slice(9, 18);
    const outRegSum    = out.reduce(function(a,h){ return a + h.regYard;    }, 0);
    const outLadiesSum = out.reduce(function(a,h){ return a + h.ladiesYard; }, 0);
    const outParSum    = out.reduce(function(a,h){ return a + h.par; }, 0);
    const innRegSum    = inn.reduce(function(a,h){ return a + h.regYard;    }, 0);
    const innLadiesSum = inn.reduce(function(a,h){ return a + h.ladiesYard; }, 0);
    const innParSum    = inn.reduce(function(a,h){ return a + h.par; }, 0);
    function wcRow(set, label){
      return '<tr class="ci-r-wc"><th>' + label + '</th>' +
        set.map(function(h){ return '<td>' + (h.wc ? '<span class="ci-wc-dot">●</span>' : '') + '</td>'; }).join('') +
        '<td>—</td></tr>';
    }
    function dataRow(set, sum, label, key, cls){
      return '<tr class="' + cls + '"><th>' + label + '</th>' +
        set.map(function(h){ return '<td>' + h[key] + '</td>'; }).join('') +
        '<td>' + sum + '</td></tr>';
    }
    function headerRow(numbers, lastLabel){
      return '<tr><th>HOLE</th>' +
        numbers.map(function(n){ return '<th>' + n + '</th>'; }).join('') +
        '<th>' + lastLabel + '</th></tr>';
    }
    const outNums = [1,2,3,4,5,6,7,8,9];
    const innNums = [10,11,12,13,14,15,16,17,18];
    let html = '<thead>' + headerRow(outNums, 'GOING OUT') + '</thead><tbody>';
    html += wcRow(out, '⭐ W.C');
    html += dataRow(out, outRegSum,    'REG (白)',     'regYard',    'ci-r-reg-w');
    html += dataRow(out, outLadiesSum, 'LADIES (赤)',  'ladiesYard', 'ci-r-ladies-r');
    html += dataRow(out, outParSum,    'PAR',          'par',        'ci-r-par');
    html += dataRow(out, '—',          'HDCP',         'hdcp',       'ci-r-hdcp');
    html += '</tbody>';
    html += '<thead>' + headerRow(innNums, 'COMING IN') + '</thead><tbody>';
    html += wcRow(inn, '⭐ W.C');
    html += dataRow(inn, innRegSum,    'REG (黄)',     'regYard',    'ci-r-reg-y');
    html += dataRow(inn, innLadiesSum, 'LADIES (緑)',  'ladiesYard', 'ci-r-ladies-g');
    html += dataRow(inn, innParSum,    'PAR',          'par',        'ci-r-par');
    html += dataRow(inn, '—',          'HDCP',         'hdcp',       'ci-r-hdcp');
    html += '<tr class="ci-r-total"><th>TOTAL</th>' +
            '<td colspan="3">REG: ' + COURSE.regYard + 'y</td>' +
            '<td colspan="3">LADIES: ' + COURSE.ladiesYard + 'y</td>' +
            '<td colspan="3">PAR: ' + COURSE.par + '</td></tr>';
    html += '</tbody>';
    GWDom.setHTML(t, html);
  }

  function escapeAttr(s){ return escapeHtml(s); }

  let toastTimer = null;
  function toast(msg, isErr){
    const el = $('#toast'); el.textContent = msg;
    el.classList.toggle('err', !!isErr);
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ el.classList.remove('show'); }, 2400);
  }
  window.gwToast = toast;
})();
</script>
