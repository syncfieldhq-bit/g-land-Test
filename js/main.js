/* =================================================================
   §4. State
   ================================================================= */
const State = {
  me: {
    id: 'me',
    lastname: '',
    firstname: '',
    isPublic: false
  },
  round: {
    courseId: 'rokko-kokusai-public',
    courseName: COURSE.name,
    startedAt: null,
    finishedAt: null,
    currentHole: 1,
    groupId: '',
    groupName: '',
    /* v31: 司令塔機能 */
    lockerNum: '',
    pmStart: '',
    /* v32: 9H/18H モード ＆ 休憩時間 */
    holesMode: '18',       /* '18' | '9' */
    restStart: '',         /* 休憩開始 HH:MM */
    restEnd: ''            /* 休憩終了 HH:MM */
  },
  players: [],
  ui: {
    displayMode: 'number',     // 'number' | 'diff' | 'symbol'
    showPuttInTable: false,
    sortMeFirst: true,
    useLadiesTee: false,
    inputMode: 'simple',       // 'simple' | 'counter'
    /* v31: ゲームモード（一般 / 初心者カウンター） */
    gameMode: 'standard'       // 'standard' | 'beginner'
  },
  settings: {
    puttEnabled: true,
    autoNext: true
  },
  history: []
};

/* =================================================================
   §5. Storage
   ================================================================= */
const Storage = {
  KEY_PROFILE: 'gworld_v13_profile',
  KEY_STATE:   'gworld_v13_state',
  KEY_HISTORY: 'gworld_v13_history',
  KEY_SETTINGS:'gworld_v13_settings',
  saveProfile() {
    try { localStorage.setItem(this.KEY_PROFILE, JSON.stringify(State.me)); }
    catch(e) { console.warn('saveProfile failed', e); }
  },
  loadProfile() {
    try {
      const s = localStorage.getItem(this.KEY_PROFILE);
      if (s) Object.assign(State.me, JSON.parse(s));
    } catch(e) {}
  },
  saveState() {
    try {
      const snap = {
        round: State.round,
        players: State.players,
        ui: State.ui,
        savedAt: Date.now()
      };
      localStorage.setItem(this.KEY_STATE, JSON.stringify(snap));
    } catch(e) {}
  },
  loadState() {
    try {
      const s = localStorage.getItem(this.KEY_STATE);
      if (s) {
        const snap = JSON.parse(s);
        if (snap.round) Object.assign(State.round, snap.round);
        if (snap.players) State.players = snap.players;
        if (snap.ui) Object.assign(State.ui, snap.ui);
        return true;
      }
    } catch(e) {}
    return false;
  },
  clearState() { try { localStorage.removeItem(this.KEY_STATE); } catch(e){} },
  saveHistory() {
    try { localStorage.setItem(this.KEY_HISTORY, JSON.stringify(State.history)); } catch(e){}
  },
  loadHistory() {
    try {
      const s = localStorage.getItem(this.KEY_HISTORY);
      if (s) State.history = JSON.parse(s);
    } catch(e) {}
  },
  saveSettings() {
    try { localStorage.setItem(this.KEY_SETTINGS, JSON.stringify(State.settings)); } catch(e){}
  },
  loadSettings() {
    try {
      const s = localStorage.getItem(this.KEY_SETTINGS);
      if (s) Object.assign(State.settings, JSON.parse(s));
    } catch(e) {}
  },
  clearAll() {
    [this.KEY_PROFILE, this.KEY_STATE, this.KEY_HISTORY, this.KEY_SETTINGS].forEach(k => {
      try { localStorage.removeItem(k); } catch(e){}
    });
  }
};

/* =================================================================
   §6. ユーティリティ
   ================================================================= */

/* =================================================================
   v31: 司令塔 + 親指モーダル + 直接編集 ヘルパ
   ================================================================= */
function v31IsBeginner() {
  return State.ui && State.ui.gameMode === 'beginner';
}
function v31IsStandard() {
  return !v31IsBeginner();
}
function v31ApplyBodyClass() {
  document.body.classList.toggle('v31-mode-beginner', v31IsBeginner());
  document.body.classList.toggle('v31-mode-standard', v31IsStandard());
}
function v31SmartPmDefault() {
  const d = new Date();
  d.setMinutes(d.getMinutes() + 45);
  const m = Math.round(d.getMinutes() / 5) * 5;
  d.setMinutes(m);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return hh + ':' + mm;
}

/* =================================================================
   v32: 9H/18H モード判定 / ロック判定 / アクティブホール数
   ================================================================= */
function v32IsHalfMode() {
  return State.round && State.round.holesMode === '9';
}
function v32MaxHole() {
  return v32IsHalfMode() ? 9 : 18;
}
function v32IsHoleLocked(hi /* 0-indexed */) {
  return v32IsHalfMode() && hi >= 9;
}
function v32ApplyHolesBodyClass() {
  document.body.classList.toggle('v32-holes-9', v32IsHalfMode());
  document.body.classList.toggle('v32-holes-18', !v32IsHalfMode());
}

/* 休憩時間（分）を計算 */
function v32RestMinutes() {
  const s = (State.round && State.round.restStart) || '';
  const e = (State.round && State.round.restEnd) || '';
  if (!s || !e) return null;
  const [sh, sm] = s.split(':').map(Number);
  const [eh, em] = e.split(':').map(Number);
  if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return null;
  const min = (eh * 60 + em) - (sh * 60 + sm);
  return (min >= 0) ? min : null;
}

/* 9H完結のスコアサブセット計算（前半9H のみ） */
function v32HalfTotalScore(p) {
  return p.scores.slice(0, 9).reduce((s, v) => s + (v || 0), 0);
}
function v32HalfTotalPutts(p) {
  return p.putts.slice(0, 9).reduce((s, v) => s + (v || 0), 0);
}
function v32HalfPlayed(p) {
  return p.scores.slice(0, 9).filter(v => v != null).length;
}
function v32HalfPar() {
  return COURSE.holes.slice(0, 9).reduce((s, h) => s + h.par, 0);
}
function v32HalfTotalDiff(p) {
  const t = v32HalfTotalScore(p);
  if (t === 0) return null;
  return t - v32HalfPar();
}
function v32HalfAllDone() {
  if (!v32IsHalfMode()) return false;
  return State.players.length > 0 &&
         State.players.every(p => v32HalfPlayed(p) === 9);
}


const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]
  ));
}
function uuid() {
  return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function genGroupId() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const nums = '23456789';
  let a = '';
  for (let i = 0; i < 3; i++) a += letters[Math.floor(Math.random() * letters.length)];
  let b = '';
  for (let i = 0; i < 4; i++) b += nums[Math.floor(Math.random() * nums.length)];
  return a + '-' + b;
}
function fullName(p) {
  if (!p) return '';
  const ln = (p.lastname || '').trim();
  const fn = (p.firstname || '').trim();
  if (!ln && !fn) return p.name || '名前未設定';
  if (!fn) return ln;
  if (!ln) return fn;
  return ln + ' ' + fn;
}
function fullNameMe() {
  return fullName(State.me) || 'ゲスト';
}
function diffText(d) {
  if (d == null) return '—';
  if (d === 0) return 'E';
  return (d > 0 ? '+' : '') + d;
}
function totalScore(p) { return p.scores.reduce((s,v) => s + (v||0), 0); }
function totalPutts(p) { return p.putts.reduce((s,v) => s + (v||0), 0); }
function playedHoles(p) { return p.scores.filter(v => v != null).length; }
function totalDiff(p) {
  let d = 0, played = false;
  p.scores.forEach((v, i) => {
    if (v != null) { d += v - COURSE.holes[i].par; played = true; }
  });
  return played ? d : null;
}
function fmtDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = n => ('0' + n).slice(-2);
  return d.getFullYear() + '/' + pad(d.getMonth()+1) + '/' + pad(d.getDate()) +
         ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}
function getYard(hole) {
  return State.ui.useLadiesTee ? hole.ladiesYard : hole.regYard;
}

/* =================================================================
   §7. 初期化
   ================================================================= */
function initState() {
  Storage.loadProfile();
  Storage.loadHistory();
  Storage.loadSettings();
  const restored = Storage.loadState();

  if (!restored || State.players.length === 0) {
    State.players = [{
      id: State.me.id,
      lastname: State.me.lastname,
      firstname: State.me.firstname,
      isMe: true,
      isProxy: false,
      scores: Array(18).fill(null),
      putts: Array(18).fill(0)
    }];
    State.round.startedAt = Date.now();
    State.round.currentHole = 1;
    State.round.groupId = genGroupId();
    State.round.groupName = (fullNameMe() || 'ゲスト') + 'のラウンド・' + new Date().toLocaleDateString('ja-JP');
  } else {
    const me = State.players.find(p => p.isMe);
    if (me) {
      me.lastname = State.me.lastname;
      me.firstname = State.me.firstname;
    }
  }
  /* v33: 最終同期 — 自分エントリ未存在なら作成、存在すれば名前同期 */
  try { if (typeof v33SyncMeToPlayer === 'function') v33SyncMeToPlayer(); } catch(e) {}
}

/* =================================================================
   §8. レンダリング - トップバー & ヒーロー（現在地・◀▶のみ）
   ================================================================= */
function renderTopAndHero() {
  $('#topCourse').textContent = COURSE.name;
  $('#topMeta').textContent = 'スタンドアロン · オフライン入力 · ' +
    (State.ui.useLadiesTee ? 'LADIES TEE' : 'REG TEE');

  const cur = State.round.currentHole;
  const hole = COURSE.holes[cur - 1];
  $('#heroHoleNum').textContent = cur;
  $('#heroPar').textContent = hole.par;

  $('#heroYardReg').textContent = 'REG ' + hole.regYard + 'y';
  $('#heroYardLadies').textContent = 'L ' + hole.ladiesYard + 'y';
  $('#heroHdcp').textContent = 'HDCP ' + hole.hdcp + (hole.wc ? ' · 🚻W.C近' : '');

  $('#currentHoleBadge').textContent = '現在 ' + cur + 'H';

  $('#btnHolePrev').disabled = cur <= 1;
  $('#btnHoleNext').disabled = cur >= 18;
  $('#btnHolePrev').style.opacity = cur <= 1 ? '.3' : '1';
  $('#btnHoleNext').style.opacity = cur >= 18 ? '.3' : '1';

  $('#teeToggleLabel').textContent = State.ui.useLadiesTee ? 'LADIES' : 'REGティ';
  const teeBtn = $('#btnTeeToggle');
  if (State.ui.useLadiesTee) teeBtn.classList.add('ladies');
  else teeBtn.classList.remove('ladies');
}

/* =================================================================
   §9. レンダリング - スコアテーブル（v45: OUT/IN/TOTAL 集計列を追加）
   - スコア保存・GAS連携ロジックは一切触れず、表示（innerHTML 構築）のみ拡張
   - 18Hモード: 1-9H | OUT | 10-18H | IN | TOTAL
   - 9Hモード : 1-9H | OUT（TOTAL判定）
   ================================================================= */
function renderTable() {
  const t = $('#scoreTable');
  const holes = COURSE.holes;

  let orderedPlayers = State.players.slice();
  if (State.ui.sortMeFirst) {
    orderedPlayers.sort((a, b) => {
      if (a.isMe && !b.isMe) return -1;
      if (!a.isMe && b.isMe) return 1;
      return 0;
    });
  }
  const idxMap = orderedPlayers.map(p => State.players.indexOf(p));

  /* v45: 9H モード判定と OUT/IN PAR 計算をローカルヘルパーで処理
     — 既存 totalScore/totalDiff はそのまま使う */
  const v45Is9H = (function(){
    try { return (State && State.round && State.round.holesMode === '9'); } catch(_) { return false; }
  })();
  const v45HasIn = !v45Is9H && holes.length > 9;
  function v45SumScores(p, from, to) {
    /* from/to は 0-based, to 是 exclusive */
    let sum = 0;
    let any = false;
    for (let i = from; i < to && i < p.scores.length; i++) {
      const v = p.scores[i];
      if (v != null && v > 0) { sum += v; any = true; }
    }
    return any ? sum : null;
  }
  function v45SumPar(from, to) {
    let s = 0;
    for (let i = from; i < to && i < holes.length; i++) s += (holes[i].par || 0);
    return s;
  }
  function v45DiffHtml(score, par) {
    if (score == null) return '<div class="diff even">—</div>';
    const d = score - par;
    let cls = 'even';
    if (d < 0) cls = 'minus';
    else if (d > 0) cls = 'plus';
    return '<div class="diff ' + cls + '">' + diffText(d) + '</div>';
  }

  let html = '';

  /* ヘッダー：ホール番号（+ OUT / IN / TOTAL） */
  html += '<thead><tr>';
  html += '<th class="col-fixed">プレイヤー</th>';
  holes.forEach((h) => {
    const cur = h.no === State.round.currentHole ? ' current-hole' : '';
    const outEnd = (h.no === 9) ? ' out-end' : '';
    const wcMark = h.wc ? '<span class="wc-mark">🚻</span>' : '';
    html += '<th class="' + (cur + outEnd).trim() + '" data-hole="' + h.no + '">' +
            '<span class="hole-label">' + h.no + 'H</span>' +
            '<span class="yard-label">' + getYard(h) + 'y</span>' +
            wcMark +
            '</th>';
    /* 9Hの直後に OUT 列 */
    if (h.no === 9 && v45HasIn) {
      html += '<th class="col-total col-out">OUT</th>';
    }
  });
  if (v45HasIn) {
    html += '<th class="col-total col-in">IN</th>';
    html += '<th class="col-total col-grand">TOTAL</th>';
  } else {
    /* 9H モード: 単一合計を OUT 名引きで表示 */
    html += '<th class="col-total col-out">OUT</th>';
  }
  html += '</tr>';

  /* PAR行 */
  html += '<tr>';
  html += '<th class="col-fixed par-row">PAR</th>';
  holes.forEach(h => {
    const cur = h.no === State.round.currentHole ? ' current-hole' : '';
    const outEnd = (h.no === 9) ? ' out-end' : '';
    html += '<th class="par-row ' + (cur + outEnd).trim() + '">' + h.par + '</th>';
    if (h.no === 9 && v45HasIn) {
      html += '<th class="par-row col-total col-out">' + v45SumPar(0, 9) + '</th>';
    }
  });
  if (v45HasIn) {
    html += '<th class="par-row col-total col-in">' + v45SumPar(9, 18) + '</th>';
    html += '<th class="par-row col-total col-grand">' + COURSE.par + '</th>';
  } else {
    html += '<th class="par-row col-total col-out">' + COURSE.par + '</th>';
  }
  html += '</tr></thead>';

  /* tbody */
  html += '<tbody>';
  orderedPlayers.forEach((p, displayIdx) => {
    const realIdx = idxMap[displayIdx];
    const meClass = p.isMe ? ' is-me' : '';
    html += '<tr class="player-row' + meClass + '" data-pi="' + realIdx + '">';
    html += '<td class="col-fixed">' +
            '<div class="player-cell" data-pi="' + realIdx + '" data-action="player-tap">' +
            '<span class="name">' + escapeHtml(fullName(p)) + '</span>' +
            (p.isMe ? '<span class="you-tag">自分</span>' : (p.isProxy ? '<span class="proxy-tag">代理</span>' : '')) +
            '</div></td>';

    p.scores.forEach((sc, hi) => {
      const par = holes[hi].par;
      const cur = (hi + 1) === State.round.currentHole ? ' current-hole' : '';
      const outEnd = ((hi + 1) === 9) ? ' out-end' : '';
      let cls = 'score-cell';
      let txt = '';
      if (sc == null) {
        cls += ' empty';
        txt = '·';
      } else {
        const d = sc - par;
        if (d <= -3) cls += ' under-3';
        else if (d === -2) cls += ' under-2';
        else if (d === -1) cls += ' under-1';
        else if (d === 0) cls += ' par';
        else if (d === 1) cls += ' over-1';
        else if (d >= 2) cls += ' over-2';

        if (State.ui.displayMode === 'symbol') {
          txt = getDiffSymbol(sc, par);
        } else if (State.ui.displayMode === 'diff') {
          txt = diffText(d);
        } else {
          txt = sc;
        }
      }
      const puttMini = (State.ui.showPuttInTable && p.putts[hi] > 0 && sc != null)
        ? '<span class="putt-mini">p' + p.putts[hi] + '</span>' : '';
      /* v35: 一意ID をtdに必ず付与 — タップ伝搬を確実化 */
      const cellId = 'cell-p' + realIdx + '-h' + hi;
      html += '<td class="' + (cls + cur + outEnd).trim() + '" id="' + cellId + '" data-pi="' + realIdx + '" data-hi="' + hi + '" data-action="cell-tap">' + txt + puttMini + '</td>';

      /* v45: 9Hセルの直後に OUT 合計セル */
      if ((hi + 1) === 9 && v45HasIn) {
        const outSum = v45SumScores(p, 0, 9);
        const outPar = v45SumPar(0, 9);
        html += '<td class="col-total col-out">' +
                '<div class="total-score">' + (outSum != null ? outSum : '—') + '</div>' +
                v45DiffHtml(outSum, outPar) +
                '</td>';
      }
    });

    /* v45: IN / TOTAL セル（18H時） / 9H時は OUT を 集計として表示 */
    if (v45HasIn) {
      const inSum  = v45SumScores(p, 9, holes.length);
      const inPar  = v45SumPar(9, holes.length);
      const grand  = totalScore(p) || null;
      const grandDiff = totalDiff(p);
      let gCls = 'even';
      if (grandDiff != null && grandDiff < 0) gCls = 'minus';
      else if (grandDiff != null && grandDiff > 0) gCls = 'plus';
      const gTxt = grandDiff == null ? '—' : diffText(grandDiff);
      html += '<td class="col-total col-in">' +
              '<div class="total-score">' + (inSum != null ? inSum : '—') + '</div>' +
              v45DiffHtml(inSum, inPar) +
              '</td>';
      html += '<td class="col-total col-grand">' +
              '<div class="total-score">' + (grand != null && grand > 0 ? grand : '—') + '</div>' +
              '<div class="diff ' + gCls + '">' + gTxt + '</div>' +
              '</td>';
    } else {
      /* 9H モード: 単一合計を OUT として表示 */
      const total = totalScore(p);
      const diff = totalDiff(p);
      let diffCls = 'even';
      if (diff != null && diff < 0) diffCls = 'minus';
      else if (diff != null && diff > 0) diffCls = 'plus';
      const diffTxt = diff == null ? '—' : diffText(diff);
      html += '<td class="col-total col-out">' +
              '<div class="total-score">' + (total || '—') + '</div>' +
              '<div class="diff ' + diffCls + '">' + diffTxt + '</div>' +
              '</td>';
    }
    html += '</tr>';
  });
  html += '</tbody>';

  t.innerHTML = html;

  t.querySelectorAll('[data-action="cell-tap"]').forEach(td => {
    td.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const pi = +td.dataset.pi;
      const hi = +td.dataset.hi;
      /* v31: 直接編集（モーダルを開かずその場で数値入力） */
      v31OpenInlineEdit(td, pi, hi);
    });
  });
  t.querySelectorAll('[data-action="player-tap"]').forEach(td => {
    td.addEventListener('click', (e) => {
      e.stopPropagation();
      const pi = +td.dataset.pi;
      onPlayerTap(pi);
    });
  });

  $('#currentHoleBadge').textContent = '現在 ' + State.round.currentHole + 'H';

  centerCurrentHole();
  /* v31: モーダル内スコアテーブルにミラー反映 + 直接編集再バインド */
  try {
    const mt = document.getElementById('v31ModalScoreTable');
    if (mt) {
      mt.innerHTML = t.innerHTML;
      mt.querySelectorAll('[data-action="cell-tap"]').forEach(td => {
        td.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const pi = +td.dataset.pi;
          const hi = +td.dataset.hi;
          v32SetActiveCell(pi, hi);
          v31OpenInlineEdit(td, pi, hi);
        });
      });
    }
  } catch(e) {}
  /* v32: ライブスコアカード描画 + クロスハイライト */
  try { v32RenderLiveScore(); } catch(e) {}
  try { v32ApplyCrossHighlight(); } catch(e) {}
  /* v33: プレイヤーリスト（司令塔の同伴者）も同期 — プロフィール変更即時反映 */
  try { v31RenderPlayerList(); } catch(e) {}
  /* v35: 再描画後もアクティブセルのハイライトを維持 */
  try { v35HighlightActiveCell(); } catch(e) {}

}

function centerCurrentHole() {
  const exec = () => {
    const cur = document.querySelector('.scoretable thead th.current-hole[data-hole]');
    const scroller = $('#tableScroll');
    if (!cur || !scroller) return;
    const sw = scroller.clientWidth;
    const cl = cur.offsetLeft;
    const cw = cur.offsetWidth;
    const target = cl - sw / 2 + cw / 2;
    scroller.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
  };
  requestAnimationFrame(exec);
  setTimeout(exec, 250);
  setTimeout(exec, 600);
}

/* =================================================================
   §10. プレイヤー操作（自分フォーカス・編集）
   ================================================================= */
function onPlayerTap(pi) {
  const p = State.players[pi];
  if (!p) return;
  if (p.isMe) {
    State.ui.sortMeFirst = true;
    Storage.saveState();
    renderTable();
    setTimeout(() => {
      const row = document.querySelector('tr.is-me');
      if (row) {
        row.classList.add('row-flash');
        setTimeout(() => row.classList.remove('row-flash'), 1100);
      }
    }, 100);
    showToast('⭐ 自分の行を最上部にフォーカスしました');
    return;
  }
  openEditPlayerModal(pi);
}

function focusMe() {
  State.ui.sortMeFirst = true;
  Storage.saveState();
  renderTable();
  setTimeout(() => {
    const row = document.querySelector('tr.is-me');
    if (row) {
      row.classList.add('row-flash');
      setTimeout(() => row.classList.remove('row-flash'), 1100);
    }
  }, 100);
  showToast('⭐ 自分の行を最上部に並べました');
}

function makeMe(pi) {
  const p = State.players[pi];
  if (!p) return;
  if (p.isMe) { showToast('既に自分です'); return; }
  State.players.forEach(x => { x.isMe = false; });
  p.isMe = true;
  p.isProxy = false;
  State.me.lastname = p.lastname || '';
  State.me.firstname = p.firstname || '';
  Storage.saveProfile();
  Storage.saveState();
  closeAllModals();
  renderTable();
  showToast('⭐ ' + fullName(p) + ' さんを「自分」に設定しました');
}

/* =================================================================
   §11. スコア入力モーダル（シンプル/カウンター切替対応）
   ================================================================= */
let modalHole = 1;
let modalPlayerIdx = 0;
let modalStroke = 0;
let modalPutt = 0;

function openScoreModal(pi, hi) {
  /* v31: ビギナーモード時は強制的に自分にフォーカス */
  if (v31IsBeginner()) {
    const meIdx = State.players.findIndex(p => p.isMe);
    if (meIdx >= 0) pi = meIdx;
  }
  /* v32: 9Hモード時、hi >= 9 は強制的に 9H にクランプ */
  if (v32IsHalfMode() && hi >= 9) {
    hi = 8;
    showToast('🏁 9Hモードでは 10H 以降にはアクセスできません');
  }
  modalPlayerIdx = pi;
  modalHole = hi + 1;
  /* v32: アクティブセル更新 */
  v32SetActiveCell(pi, hi);
  /* v35: アクティブセル同期（モーダル開時） */
  v35ActivePi = pi;
  v35ActiveHi = hi;
  const p = State.players[pi];
  const h = COURSE.holes[hi];

  /* 既存スコアがあれば優先、なければ入力モードに応じた初期値を設定 */
  if (p.scores[hi] != null) {
    /* 既存スコアあり：そのまま表示（モード問わず） */
    modalStroke = p.scores[hi];
    modalPutt = p.putts[hi] || 0;
  } else {
    /* 未入力：モードに応じた初期値 */
    if (State.ui.inputMode === 'simple') {
      /* シンプル(±)モード：PARが基準、パットは2が基準 */
      modalStroke = h.par;
      modalPutt = 2;
    } else {
      /* カウンター(＋−)モード：0から開始 */
      modalStroke = 0;
      modalPutt = 0;
    }
  }

  renderModalPlayerTabs();
  applyInputMode();
  updateModalDisplay();
  applyPuttSectionEnabled();
  $('#scoreModal').classList.add('show');
}

function renderModalPlayerTabs() {
  let ordered = State.players.slice();
  if (State.ui.sortMeFirst) {
    ordered.sort((a, b) => (a.isMe === b.isMe) ? 0 : (a.isMe ? -1 : 1));
  }
  const html = ordered.map(p => {
    const realIdx = State.players.indexOf(p);
    const active = realIdx === modalPlayerIdx ? ' active' : '';
    const dot = p.isMe ? '<span class="you-dot"></span>' : '';
    return '<button class="player-tab' + active + '" data-pi="' + realIdx + '">' + dot + escapeHtml(fullName(p)) + '</button>';
  }).join('');
  const tabs = $('#modalPlayerTabs');
  tabs.innerHTML = html;
  tabs.querySelectorAll('.player-tab').forEach(t => {
    t.addEventListener('click', () => {
      saveCurrentModalScore();
      modalPlayerIdx = +t.dataset.pi;
      /* v32: アクティブセル更新（行ハイライト追従） */
      v32SetActiveCell(modalPlayerIdx, modalHole - 1);
      const p = State.players[modalPlayerIdx];
      const h = COURSE.holes[modalHole - 1];
      /* v14：モードに応じた初期値 */
      if (p.scores[modalHole - 1] != null) {
        modalStroke = p.scores[modalHole - 1];
        modalPutt = p.putts[modalHole - 1] || 0;
      } else if (State.ui.inputMode === 'simple') {
        modalStroke = h.par;
        modalPutt = 2;
      } else {
        modalStroke = 0;
        modalPutt = 0;
      }
      renderModalPlayerTabs();
      updateModalDisplay();
    });
  });
}

/* 入力モードUI反映（メイン画面トグル＋モーダル内バッジ＋body class） */
function applyInputMode() {
  const mode = State.ui.inputMode;
  const isSimple = (mode === 'simple');

  /* body クラス（CSSでクイックPARボタン表示制御） */
  document.body.classList.toggle('input-mode-simple', isSimple);
  document.body.classList.toggle('input-mode-counter', !isSimple);

  /* メイン画面のトグル */
  const mainTog = $('#inputModeMainToggle');
  if (mainTog) {
    mainTog.querySelectorAll('button').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === mode);
    });
  }

  /* モーダル内バッジ */
  const badge = $('.modal-mode-badge');
  const icon = $('#modalModeIcon');
  const label = $('#modalModeLabel');
  const hint = $('#modalModeHint');
  if (badge && icon && label && hint) {
    if (isSimple) {
      badge.classList.add('is-simple');
      icon.textContent = '⚡';
      label.textContent = 'シンプル（±）モード';
      hint.textContent = 'PAR基準・±で調整';
    } else {
      badge.classList.remove('is-simple');
      icon.textContent = '🔢';
      label.textContent = 'カウンター（＋−）モード';
      hint.textContent = '0から1打ずつカウント';
    }
  }
}

function updateModalDisplay() {
  const p = State.players[modalPlayerIdx];
  const h = COURSE.holes[modalHole - 1];
  $('#scoreModalTitle').textContent = fullName(p) + ' のスコア入力';
  $('#modalHoleNum').textContent = h.no + 'H';
  $('#modalHolePar').textContent = 'PAR ' + h.par + ' · ' + getYard(h) + 'y · HDCP ' + h.hdcp;
  $('#modalStroke').textContent = modalStroke || '0';
  $('#modalPutt').textContent = modalPutt;

  const diff = modalStroke ? modalStroke - h.par : null;
  const diffEl = $('#modalStrokeDiff');
  if (diff == null) {
    diffEl.textContent = '未入力';
    diffEl.className = 'stroke-diff';
  } else {
    const sym = getDiffSymbol(modalStroke, h.par);
    if (diff === 0) {
      diffEl.innerHTML = 'PAR (E) <span class="stroke-symbol">' + sym + '</span>';
      diffEl.className = 'stroke-diff even';
    } else if (diff < 0) {
      diffEl.innerHTML = diff + ' <span class="stroke-symbol">' + sym + '</span>';
      diffEl.className = 'stroke-diff minus';
    } else {
      diffEl.innerHTML = '+' + diff + ' <span class="stroke-symbol">' + sym + '</span>';
      diffEl.className = 'stroke-diff plus';
    }
  }

  $('#modalHolePrev').disabled = modalHole <= 1;
  $('#modalHoleNext').disabled = modalHole >= 18;

  $('#btnStrokeMinus').disabled = modalStroke <= 0;
  $('#btnStrokePlus').disabled = modalStroke >= 20;

  $('#btnPuttMinus').disabled = modalPutt <= 0;
  $('#btnPuttPlus').disabled = modalPutt >= 10;

  /* v31: モーダルバッジ・親指ラベル同期 */
  try { v31UpdateModalBadges(); } catch(e) {}
  try { v31UpdateThumbLabels(); } catch(e) {}
  /* v32: クロスハイライト同期（modalHole / modalPlayerIdx の現在位置） */
  try {
    v32SetActiveCell(modalPlayerIdx, modalHole - 1);
    v32ApplyCrossHighlight();
  } catch(e) {}
  /* v32: モーダル内 9H/18H バッジ */
  try {
    const mb = document.getElementById('v32ModalHolesBadge');
    if (mb) mb.textContent = v32IsHalfMode() ? '🏁 9H' : '🏁 18H';
  } catch(e) {}

  const confirmBtn = $('#btnConfirm');
  if (modalHole >= COURSE.holes.length) {
    confirmBtn.classList.add('final');
    confirmBtn.textContent = '🏁 最終ホール確定';
  } else {
    confirmBtn.classList.remove('final');
    confirmBtn.textContent = State.settings.autoNext ? '確定して次のホール ▶' : '確定する';
  }
  /* v33: 親指グリッド上の情報バッジ更新 */
  try { v33UpdateThumbInfo(); } catch(e) {}
}

function applyPuttSectionEnabled() {
  const sec = $('#puttSection');
  const toggle = $('#puttToggleMini');
  if (State.settings.puttEnabled) {
    sec.classList.remove('disabled');
    toggle.textContent = 'ON';
    toggle.classList.remove('off');
  } else {
    sec.classList.add('disabled');
    toggle.textContent = 'OFF';
    toggle.classList.add('off');
  }
}

function saveCurrentModalScore() {
  /* シンプル・カウンターとも modalStroke / modalPutt が現在値 */
  const p = State.players[modalPlayerIdx];
  p.scores[modalHole - 1] = modalStroke > 0 ? modalStroke : null;
  p.putts[modalHole - 1] = modalPutt;
  Storage.saveState();
}

/* PARに戻す（シンプルモード専用クイックアクション） */
function resetToPar() {
  const h = COURSE.holes[modalHole - 1];
  modalStroke = h.par;
  updateModalDisplay();
  showToast('🎯 ストロークを PAR ' + h.par + ' に戻しました');
}

function resetPuttTo2() {
  modalPutt = 2;
  updateModalDisplay();
  showToast('🎯 パットを 2 に戻しました');
}

function closeAllModals() {
  $$('.modal-backdrop').forEach(m => m.classList.remove('show'));
}

/* =================================================================
   §12. QRモーダル（本物のQRコード・名前リスト埋込み）
   ================================================================= */
function buildJoinUrl() {
  /* URLにグループID + 名前リストを埋込 */
  const names = State.players.map(p => fullName(p)).filter(n => n && n !== '名前未設定');
  const namesStr = names.join(',');
  const gid = State.round.groupId || genGroupId();
  const params = new URLSearchParams();
  params.set('gid', gid);
  if (namesStr) params.set('names', namesStr);
  const base = location.origin + location.pathname;
  return base + '#join?' + params.toString();
}

function openInviteQR() {
  $('#qrGroupName').textContent = State.round.groupName;
  $('#qrGroupId').textContent = 'GID: ' + State.round.groupId;
  const url = buildJoinUrl();
  $('#qrJoinUrl').textContent = url;
  renderQR(url);
  $('#qrModal').classList.add('show');
}

function renderQR(text) {
  /* qrcode-generator (Arase) を使用 */
  try {
    const qr = qrcode(0, 'M');  // typeNumber: 0 = auto, ECC: M
    qr.addData(text);
    qr.make();
    const size = qr.getModuleCount();
    const margin = 4;
    const total = size + margin * 2;
    let paths = '';
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (qr.isDark(y, x)) {
          paths += 'M' + (x + margin) + ',' + (y + margin) + 'h1v1h-1z';
        }
      }
    }
    const svg =
      '<svg viewBox="0 0 ' + total + ' ' + total + '" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">' +
      '<rect width="100%" height="100%" fill="#FFFFFF"/>' +
      '<path fill="#0F5132" d="' + paths + '"/>' +
      '</svg>';
    $('#qrCanvas').innerHTML = svg;
  } catch (err) {
    console.error('QR generation failed:', err);
    $('#qrCanvas').innerHTML = '<div style="padding:20px;color:#D63B3B;font-size:12px;">QR生成エラー: ' + escapeHtml(err.message) + '</div>';
  }
}

async function copyJoinLink() {
  const url = buildJoinUrl();
  try {
    await navigator.clipboard.writeText(url);
    showToast('🔗 リンクをコピーしました');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = url;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); showToast('🔗 リンクをコピーしました'); }
    catch { showToast('コピー失敗: ' + url, 'error'); }
    document.body.removeChild(ta);
  }
}

async function shareJoinLink() {
  const url = buildJoinUrl();
  if (navigator.share) {
    try {
      await navigator.share({
        title: 'G-WORLD ' + State.round.groupName,
        text: '六甲国際パブリック・スコア共有',
        url: url
      });
    } catch {}
  } else {
    copyJoinLink();
  }
}

/* =================================================================
   §13. 同伴者追加・編集
   ================================================================= */
function openAddCompanion() {
  $('#addLastname').value = '';
  $('#addFirstname').value = '';
  $('#addModal').classList.add('show');
  setTimeout(() => $('#addLastname').focus(), 300);
}

function submitAddCompanion() {
  const ln = $('#addLastname').value.trim();
  const fn = $('#addFirstname').value.trim();
  /* v16: 姓（名字）が必須・名は任意 */
  if (!ln) {
    showToast('姓（名字）を入力してください', 'error');
    return;
  }
  if (State.players.length >= 16) {
    showToast('最大16名まで追加できます', 'error');
    return;
  }
  const newPlayer = {
    id: uuid(),
    lastname: ln,
    firstname: fn,
    isMe: false,
    isProxy: true,
    scores: Array(18).fill(null),
    putts: Array(18).fill(0)
  };
  State.players.push(newPlayer);
  Storage.saveState();
  closeAllModals();
  renderTable();
  showToast('✓ ' + ln + ' ' + fn + ' さんを追加しました');
}

let editPlayerIdx = -1;
function openEditPlayerModal(pi) {
  editPlayerIdx = pi;
  const p = State.players[pi];
  $('#editPlayerTitle').textContent = fullName(p) + ' を編集';
  $('#editLastname').value = p.lastname || '';
  $('#editFirstname').value = p.firstname || '';
  $('#btnDeletePlayer').style.display = p.isMe ? 'none' : 'block';
  $('#btnMakeMe').style.display = p.isMe ? 'none' : 'block';
  $('#editPlayerModal').classList.add('show');
}

function submitEditPlayer() {
  if (editPlayerIdx < 0) return;
  const p = State.players[editPlayerIdx];
  const ln = $('#editLastname').value.trim();
  const fn = $('#editFirstname').value.trim();
  /* v16: 姓（名字）が必須・名は任意 */
  if (!ln) {
    showToast('姓（名字）を入力してください', 'error');
    return;
  }
  p.lastname = ln;
  p.firstname = fn;
  if (p.isMe) {
    State.me.lastname = ln;
    State.me.firstname = fn;
    Storage.saveProfile();
  }
  Storage.saveState();
  closeAllModals();
  renderTable();
  showToast('✓ プレイヤー情報を更新しました');
}

function deleteCurrentPlayer() {
  if (editPlayerIdx < 0) return;
  const p = State.players[editPlayerIdx];
  if (p.isMe) { showToast('自分は削除できません', 'error'); return; }
  if (!confirm('「' + fullName(p) + '」を削除しますか？このプレイヤーのスコア記録も失われます。')) return;
  State.players.splice(editPlayerIdx, 1);
  Storage.saveState();
  closeAllModals();
  renderTable();
  showToast('プレイヤーを削除しました');
}

/* =================================================================
   §14. ホール移動・確定
   ================================================================= */
function moveHole(delta) {
  const next = State.round.currentHole + delta;
  if (next < 1 || next > 18) return;
  State.round.currentHole = next;
  Storage.saveState();
  renderTopAndHero();
  renderTable();
}

function confirmAndNext() {
  saveCurrentModalScore();
  if (modalHole < COURSE.holes.length) {
    if (State.settings.autoNext) {
      State.round.currentHole = modalHole + 1;
      modalHole = State.round.currentHole;
      const p = State.players[modalPlayerIdx];
      const h = COURSE.holes[modalHole - 1];
      /* v14：次ホールもモードに応じた初期値 */
      if (p.scores[modalHole - 1] != null) {
        modalStroke = p.scores[modalHole - 1];
        modalPutt = p.putts[modalHole - 1] || 0;
      } else if (State.ui.inputMode === 'simple') {
        modalStroke = h.par;
        modalPutt = 2;
      } else {
        modalStroke = 0;
        modalPutt = 0;
      }
      Storage.saveState();
      renderTopAndHero();
      renderTable();
      updateModalDisplay();
      showToast('✓ ' + (modalHole - 1) + 'H 確定 → ' + modalHole + 'H へ');
    } else {
      Storage.saveState();
      renderTopAndHero();
      renderTable();
      closeAllModals();
      showToast('✓ ' + modalHole + 'H 確定');
    }
  } else {
    Storage.saveState();
    renderTopAndHero();
    renderTable();
    closeAllModals();
    showToast('🏁 全ホール完了！「ラウンド終了＆保存」で記録できます');
  }
}

/* =================================================================
   §15. ラウンド終了・保存
   ================================================================= */
function saveRound() {
  const playedAny = State.players.some(p => playedHoles(p) > 0);
  if (!playedAny) {
    showToast('まだスコアが入力されていません', 'warning');
    return;
  }
  if (!confirm('このラウンドを保存して終了しますか？新しいラウンドが開始されます。')) return;

  State.round.finishedAt = Date.now();
  const record = {
    id: 'r' + Date.now(),
    course: COURSE.name,
    startedAt: State.round.startedAt,
    finishedAt: State.round.finishedAt,
    groupId: State.round.groupId,
    groupName: State.round.groupName,
    par: COURSE.par,
    tee: State.ui.useLadiesTee ? 'LADIES' : 'REG',
    players: State.players.map(p => ({
      lastname: p.lastname,
      firstname: p.firstname,
      name: fullName(p),
      isMe: p.isMe,
      total: totalScore(p),
      diff: totalDiff(p),
      putts: totalPutts(p),
      played: playedHoles(p),
      scores: p.scores.slice(),
      puttsArr: p.putts.slice()
    }))
  };
  State.history.unshift(record);
  if (State.history.length > 50) State.history = State.history.slice(0, 50);
  Storage.saveHistory();

  State.round.startedAt = Date.now();
  State.round.finishedAt = null;
  State.round.currentHole = 1;
  State.round.groupId = genGroupId();
  State.round.groupName = (fullNameMe() || 'ゲスト') + 'のラウンド・' + new Date().toLocaleDateString('ja-JP');
  State.players.forEach(p => {
    p.scores = Array(18).fill(null);
    p.putts = Array(18).fill(0);
  });
  Storage.saveState();

  renderTopAndHero();
  renderTable();
  showToast('🏁 ラウンドを保存しました！マイページで履歴を確認できます');
}

/* =================================================================
   §16. トースト
   ================================================================= */
let toastTimer = null;
function showToast(msg, type) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast' + (type ? ' ' + type : '');
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

/* =================================================================
   §17. ルーター（hash-based）+ QR参加フロー
   ================================================================= */
const Router = {
  routes: ['home', 'gworld', 'compete', 'mypage', 'join'],
  go(name) {
    if (!this.routes.includes(name)) name = 'gworld';
    $$('.screen').forEach(s => s.classList.remove('active'));
    $('#screen-' + name).classList.add('active');
    $$('.footer-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    if (location.hash !== '#' + name && name !== 'join') {
      history.replaceState(null, '', '#' + name);
    }
    if (name === 'home') renderHome();
    if (name === 'mypage') renderMyPage();
    if (name === 'gworld') {
      try { v33SyncMeToPlayer(); } catch(e) {}
      renderTopAndHero();
      renderTable();
      try { v31RenderPlayerList(); } catch(e) {}
    }
    window.scrollTo(0, 0);
  },
  handleInitial() {
    const h = location.hash.replace('#', '');
    /* 新フォーマット: #join?gid=XXX&names=A,B,C */
    if (h.startsWith('join?') || h.startsWith('join=')) {
      handleJoinFromQR(h);
      return;
    }
    if (this.routes.includes(h)) {
      this.go(h);
    } else {
      this.go('gworld');
    }
  }
};

/* QR読込からの参加フロー */
function handleJoinFromQR(hashStr) {
  let gid = '';
  let names = [];
  /* hashStr: "join?gid=XXX&names=A,B" or "join=XXX" (旧形式) */
  if (hashStr.startsWith('join?')) {
    const qs = hashStr.substring(5);
    const params = new URLSearchParams(qs);
    gid = params.get('gid') || '';
    const namesParam = params.get('names') || '';
    if (namesParam) names = namesParam.split(',').map(s => s.trim()).filter(s => s);
  } else if (hashStr.startsWith('join=')) {
    gid = hashStr.substring(5);
  }

  /* 既存自分が有効ならそのまま参加できる選択肢を提示しつつ、name select画面を表示 */
  showJoinScreen(gid, names);
}

function showJoinScreen(gid, names) {
  $('#joinGroupId').textContent = gid ? ('GID: ' + gid) : '';

  /* 名前リスト描画 */
  const listEl = $('#joinNameList');
  if (!names || names.length === 0) {
    listEl.innerHTML =
      '<div class="join-empty">' +
      '<div style="font-size:48px; margin-bottom:8px;">⚠️</div>' +
      '<div style="font-size:14px; font-weight:800;">招待者の名前リストが空です</div>' +
      '<div style="font-size:12px; color:var(--ink-soft); margin-top:6px;">下のボタンから手動で本名を入力してください</div>' +
      '</div>';
  } else {
    listEl.innerHTML = names.map((name, i) => {
      return '<button class="join-name-card" data-name="' + escapeHtml(name) + '">' +
             '<span class="num">' + (i + 1) + '</span>' +
             '<span class="nm">' + escapeHtml(name) + '</span>' +
             '<span class="arrow">▶</span>' +
             '</button>';
    }).join('');
  }

  /* イベント登録 */
  listEl.querySelectorAll('.join-name-card').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.name;
      acceptJoinAsName(gid, names, name);
    });
  });

  /* 「自分の名前がリストにない」ボタン */
  $('#btnJoinManual').onclick = () => acceptJoinAsName(gid, names, null);

  /* スキップしてゲストで参加 */
  $('#btnJoinSkip').onclick = () => {
    history.replaceState(null, '', '#gworld');
    Router.go('gworld');
    showToast('スキップしました');
  };

  /* join画面表示 */
  $$('.screen').forEach(s => s.classList.remove('active'));
  $('#screen-join').classList.add('active');
}

function acceptJoinAsName(gid, allNames, myName) {
  /* セットアップ: 新ラウンドを作成し、ホストの名前リスト全員を登録、自分を選択した名前にする */
  State.round.groupId = gid || genGroupId();
  State.round.groupName = 'グループ ' + State.round.groupId + ' のラウンド';
  State.round.startedAt = Date.now();
  State.round.currentHole = 1;

  /* プレイヤーリスト再構築 */
  const players = [];
  if (allNames && allNames.length > 0) {
    allNames.forEach((nm) => {
      const parts = nm.trim().split(/\s+/);
      const ln = parts[0] || '';
      const fn = parts.slice(1).join(' ') || '';
      const isMe = (myName === nm);
      players.push({
        id: isMe ? 'me' : uuid(),
        lastname: ln,
        firstname: fn,
        isMe: isMe,
        isProxy: !isMe,
        scores: Array(18).fill(null),
        putts: Array(18).fill(0)
      });
    });
  }

  /* 自分が名前リストに無い場合 → manualモーダルへ */
  const hasMe = players.some(p => p.isMe);
  if (!hasMe) {
    if (myName == null) {
      /* 手動入力モーダル（姓未指定） */
      openManualNameModal((ln, fn) => {
        players.unshift({
          id: 'me',
          lastname: ln,
          firstname: fn,
          isMe: true,
          isProxy: false,
          scores: Array(18).fill(null),
          putts: Array(18).fill(0)
        });
        finalizeJoin(players, ln, fn);
      });
      return;
    } else {
      /* v15: 姓のみ指定された招待の場合、姓を事前入力して名のみ入力させる */
      const parts = myName.trim().split(/\s+/);
      const prefillLn = parts[0] || '';
      const prefillFn = parts.slice(1).join(' ');
      if (!prefillFn) {
        /* 姓のみ → 手動入力モーダル（姓を事前入力） */
        openManualNameModal((ln, fn) => {
          /* リスト内の該当プレイヤーを更新して自分にする */
          const target = players.find(p => p.lastname === prefillLn && !p.firstname);
          if (target) {
            target.lastname = ln;
            target.firstname = fn;
            target.id = 'me';
            target.isMe = true;
            target.isProxy = false;
          } else {
            players.unshift({
              id: 'me',
              lastname: ln,
              firstname: fn,
              isMe: true,
              isProxy: false,
              scores: Array(18).fill(null),
              putts: Array(18).fill(0)
            });
          }
          finalizeJoin(players, ln, fn);
        }, prefillLn);
        return;
      }
    }
  } else {
    const me = players.find(p => p.isMe);
    finalizeJoin(players, me.lastname, me.firstname);
    return;
  }

  /* ここに来たら：myName指定だが見つからなかった → 全員代理として登録 */
  finalizeJoin(players, '', '');
}

function finalizeJoin(players, myLastname, myFirstname) {
  State.players = players;
  State.me.lastname = myLastname || '';
  State.me.firstname = myFirstname || '';
  State.ui.sortMeFirst = true;
  Storage.saveProfile();
  Storage.saveState();

  /* ハッシュを #gworld に置換 */
  history.replaceState(null, '', '#gworld');
  Router.go('gworld');

  /* 自分の1Hセルを自動で開いて入力モードで起動 */
  const meIdx = State.players.findIndex(p => p.isMe);
  if (meIdx >= 0) {
    setTimeout(() => {
      showToast('🎉 ようこそ ' + fullName(State.players[meIdx]) + ' さん！スコア入力を開始');
      openScoreModal(meIdx, 0);
    }, 500);
  } else {
    showToast('参加しました！');
  }
}

function openManualNameModal(callback, prefillLastname) {
  /* v15: 招待者の「姓」が指定されていれば事前入力＋ヒント文更新 */
  $('#manualLastname').value = prefillLastname || '';
  $('#manualFirstname').value = '';
  const hint = $('#manualNameHint');
  if (hint && prefillLastname) {
    hint.innerHTML = '招待された「<b>' + escapeHtml(prefillLastname) + '</b>」さんですね。<br>必要に応じて<b>名</b>を追加入力してください（任意）。';
  } else if (hint) {
    hint.innerHTML = '招待ホストが入力した<b>姓（名字）</b>を入力してください。<br><b>名</b>は任意です（あとから編集も可能です）。';
  }
  $('#manualNameModal').classList.add('show');
  /* 姓が事前入力済みなら 名 にフォーカス */
  setTimeout(() => {
    if (prefillLastname) $('#manualFirstname').focus();
    else $('#manualFirstname').focus();
  }, 300);

  $('#btnManualSubmit').onclick = () => {
    const ln = $('#manualLastname').value.trim();
    const fn = $('#manualFirstname').value.trim();
    /* v16: 姓（名字）が必須・名は任意 */
    if (!ln) {
      showToast('姓（名字）を入力してください', 'error');
      return;
    }
    closeAllModals();
    callback(ln, fn);
  };
}

/* =================================================================
   §18. ホーム画面
   ================================================================= */
function renderHome() {
  $('#homeName').textContent = (fullNameMe() || 'ゲスト') + ' さん';
  const wrap = $('#resumeBannerWrap');
  const playedAny = State.players.some(p => playedHoles(p) > 0);
  if (playedAny) {
    wrap.innerHTML =
      '<div class="resume-banner" id="resumeBtn">' +
        '<div class="ic">⛳</div>' +
        '<div class="txt">' +
          '<div class="ttl">進行中のラウンドを続ける</div>' +
          '<div class="sub">' + escapeHtml(COURSE.name) + ' · 現在 ' + State.round.currentHole + 'H</div>' +
        '</div>' +
        '<div class="arrow">▶</div>' +
      '</div>';
    $('#resumeBtn').addEventListener('click', () => Router.go('gworld'));
  } else {
    wrap.innerHTML = '';
  }
}

/* =================================================================
   §19. マイページ
   ================================================================= */
function renderMyPage() {
  $('#myNameDisp').textContent = fullNameMe() || 'ゲスト';
  $('#myFullnameDisp').textContent = (State.me.lastname && State.me.firstname)
    ? (State.me.lastname + ' ' + State.me.firstname)
    : '本名未登録';
  $('#profLastname').value = State.me.lastname || '';
  $('#profFirstname').value = State.me.firstname || '';
  $('#profPublic').checked = !!State.me.isPublic;

  const list = $('#historyList');
  if (!State.history.length) {
    list.innerHTML = '<div style="text-align:center; padding:24px 0; color:var(--ink-soft); font-size:13px;">まだラウンド履歴はありません</div>';
    return;
  }
  list.innerHTML = State.history.map((r, idx) => {
    const me = r.players.find(p => p.isMe) || r.players[0];
    const diff = me.diff == null ? '—' : diffText(me.diff);
    const diffCls = me.diff == null ? '' : (me.diff < 0 ? 'minus' : (me.diff > 0 ? 'plus' : 'even'));
    return '<div class="history-card" data-rid="' + r.id + '">' +
             '<div>' +
               '<div class="date">' + fmtDate(r.finishedAt || r.startedAt) + '</div>' +
               '<div class="course">' + escapeHtml(r.course) + ' · ' + escapeHtml(me.name) + '</div>' +
             '</div>' +
             '<div class="score-big">' + (me.total || '—') +
               '<span class="diff ' + diffCls + '">' + diff + '</span>' +
             '</div>' +
             '<button class="delete-btn" data-idx="' + idx + '" title="削除">×</button>' +
           '</div>';
  }).join('');
  list.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = +btn.dataset.idx;
      if (confirm('この履歴を削除しますか？')) {
        State.history.splice(idx, 1);
        Storage.saveHistory();
        renderMyPage();
        showToast('履歴を削除しました');
      }
    });
  });
}

function saveProfile() {
  const ln = $('#profLastname').value.trim();
  const fn = $('#profFirstname').value.trim();
  /* v16: 姓（名字）が必須・名は任意 */
  if (!ln) {
    showToast('姓（名字）を入力してください', 'error');
    return;
  }
  State.me.lastname = ln;
  State.me.firstname = fn;
  State.me.isPublic = $('#profPublic').checked;
  Storage.saveProfile();
  const me = State.players.find(p => p.isMe);
  if (me) {
    me.lastname = ln;
    me.firstname = fn;
  }
  Storage.saveState();
  renderMyPage();
  renderTable();
  showToast('✓ プロフィールを保存しました');
}

/* =================================================================
   §20. コース詳細モーダル（ヘッダー📖統合先）
   ================================================================= */
function openCourseDetail() {
  renderYardTable();
  renderRulesList();
  $('#detailModal').classList.add('show');
}

function renderYardTable() {
  const yt = $('#yardTable');
  const half = 9;
  const outs = COURSE.holes.slice(0, half);
  const ins = COURSE.holes.slice(half);

  let html = '';

  /* GOING OUT */
  html += '<thead><tr><th class="label-col" style="text-align:center;">GOING OUT</th>';
  for (let i = 1; i <= 9; i++) html += '<th>' + i + '</th>';
  html += '<th>OUT</th></tr></thead><tbody>';

  /* W.C 行 */
  html += '<tr class="wc-row"><td class="label-col">⭐W.C</td>';
  outs.forEach(h => { html += '<td>' + (h.wc ? '●' : '') + '</td>'; });
  html += '<td>—</td></tr>';

  /* REG */
  let outRegYd = 0;
  html += '<tr><td class="label-col">REG (白)</td>';
  outs.forEach(h => { html += '<td class="reg">' + h.regYard + '</td>'; outRegYd += h.regYard; });
  html += '<td class="reg"><b>' + outRegYd + '</b></td></tr>';

  /* LADIES */
  let outLdYd = 0;
  html += '<tr><td class="label-col">LADIES (赤)</td>';
  outs.forEach(h => { html += '<td class="ladies">' + h.ladiesYard + '</td>'; outLdYd += h.ladiesYard; });
  html += '<td class="ladies"><b>' + outLdYd + '</b></td></tr>';

  /* PAR */
  let outPar = 0;
  html += '<tr><td class="label-col">PAR</td>';
  outs.forEach(h => { html += '<td>' + h.par + '</td>'; outPar += h.par; });
  html += '<td><b>' + outPar + '</b></td></tr>';

  /* HDCP */
  html += '<tr><td class="label-col">HDCP</td>';
  outs.forEach(h => { html += '<td>' + h.hdcp + '</td>'; });
  html += '<td>—</td></tr>';

  /* COMING IN */
  html += '<tr class="sum-row"><td class="label-col">COMING IN</td>';
  for (let i = 10; i <= 18; i++) html += '<td>' + i + '</td>';
  html += '<td>IN</td></tr>';

  html += '<tr class="wc-row"><td class="label-col">⭐W.C</td>';
  ins.forEach(h => { html += '<td>' + (h.wc ? '●' : '') + '</td>'; });
  html += '<td>—</td></tr>';

  let inRegYd = 0;
  html += '<tr><td class="label-col">REG (黄)</td>';
  ins.forEach(h => { html += '<td class="reg">' + h.regYard + '</td>'; inRegYd += h.regYard; });
  html += '<td class="reg"><b>' + inRegYd + '</b></td></tr>';

  let inLdYd = 0;
  html += '<tr><td class="label-col">LADIES (緑)</td>';
  ins.forEach(h => { html += '<td class="ladies">' + h.ladiesYard + '</td>'; inLdYd += h.ladiesYard; });
  html += '<td class="ladies"><b>' + inLdYd + '</b></td></tr>';

  let inPar = 0;
  html += '<tr><td class="label-col">PAR</td>';
  ins.forEach(h => { html += '<td>' + h.par + '</td>'; inPar += h.par; });
  html += '<td><b>' + inPar + '</b></td></tr>';

  html += '<tr><td class="label-col">HDCP</td>';
  ins.forEach(h => { html += '<td>' + h.hdcp + '</td>'; });
  html += '<td>—</td></tr>';

  html += '<tr class="sum-row"><td class="label-col">TOTAL</td>';
  html += '<td colspan="3">REG: <b>' + (outRegYd + inRegYd) + '</b>y</td>';
  html += '<td colspan="3">LADIES: <b>' + (outLdYd + inLdYd) + '</b>y</td>';
  html += '<td colspan="3">PAR: <b>' + (outPar + inPar) + '</b></td>';
  html += '<td>—</td></tr>';

  html += '</tbody>';
  yt.innerHTML = html;
}

function renderRulesList() {
  const list = $('#rulesList');
  let html = '';
  LOCAL_RULES.forEach(rule => {
    html += '<li data-num="' + rule.num + '">';
    if (rule.title) {
      html += '<span class="rule-title">' + escapeHtml(rule.title) + '</span>';
    }
    if (rule.subItems && rule.subItems.length) {
      html += '<ul class="sub-rules">';
      rule.subItems.forEach(s => {
        html += '<li data-sub="' + escapeHtml(s.sub) + '">' + escapeHtml(s.text) + '</li>';
      });
      html += '</ul>';
    }
    if (rule.text) {
      html += escapeHtml(rule.text);
    }
    html += '</li>';
  });
  list.innerHTML = html;
}

/* =================================================================
   §21. 設定モーダル
   ================================================================= */
function openSettings() {
  /* v43: 使用ティはココから削除したため setLadiesTee はガード */
  try { const el = document.getElementById('setPuttEnabled'); if (el) el.checked = State.settings.puttEnabled; } catch(_) {}
  try { const el = document.getElementById('setAutoNext');    if (el) el.checked = State.settings.autoNext; } catch(_) {}
  try { const el = document.getElementById('setShowPutt');    if (el) el.checked = State.ui.showPuttInTable; } catch(_) {}
  try { const el = document.getElementById('setLadiesTee');   if (el) el.checked = State.ui.useLadiesTee; } catch(_) {}
  $('#settingsModal').classList.add('show');
}

function saveSettings() {
  /* v43: 使用ティはココから削除したため setLadiesTee はガード、
     タッチしたときに State.ui.useLadiesTee を上書きしない */
  try { const el = document.getElementById('setPuttEnabled'); if (el) State.settings.puttEnabled = el.checked; } catch(_) {}
  try { const el = document.getElementById('setAutoNext');    if (el) State.settings.autoNext = el.checked; } catch(_) {}
  try { const el = document.getElementById('setShowPutt');    if (el) State.ui.showPuttInTable = el.checked; } catch(_) {}
  /* setLadiesTee は削除済み — ティー状態は #v38DashTee / #v31TeeSegments で管理 */
  Storage.saveSettings();
  Storage.saveState();
  applyPuttSectionEnabled();
  renderTopAndHero();
  renderTable();
  closeAllModals();
  showToast('✓ 設定を保存しました');
}

/* =================================================================
   §22. イベントバインド
   ================================================================= */

/* =================================================================
   v31: 司令塔 同伴者リスト描画 / モーダルバッジ更新 / 親指ラベル更新 / 直接編集
   ================================================================= */
function v31RenderPlayerList() {
  const wrap = document.getElementById('v31PlayerList');
  if (!wrap) return;
  const players = State.players.slice().sort((a,b) => (a.isMe === b.isMe) ? 0 : (a.isMe ? -1 : 1));
  wrap.innerHTML = '';
  if (players.length === 0) {
    wrap.innerHTML = '<div style="font-size:12px;color:var(--v31-ink-soft);padding:8px 4px;">同伴者が登録されていません。「＋追加」ボタンから登録してください。</div>';
    return;
  }
  players.forEach((p) => {
    const realIdx = State.players.indexOf(p);
    const card = document.createElement('div');
    card.className = 'v31-player-card' + (p.isMe ? ' is-me' : '');
    card.innerHTML =
      '<span class="v31-pc-ico">' + (p.isMe ? '🏌️' : '👤') + '</span>' +
      '<span class="v31-pc-name">' + escapeHtml(fullName(p) || '(名前未設定)') + '</span>' +
      (p.isMe ? '<span class="v31-pc-tag">自分</span>' : '<button class="v31-pc-edit" type="button" data-edit-pi="' + realIdx + '">編集</button>');
    wrap.appendChild(card);
  });
  wrap.querySelectorAll('[data-edit-pi]').forEach(b => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const pi = parseInt(b.dataset.editPi, 10);
      try { openEditPlayerModal(pi); } catch(e) {}
    });
  });
}

function v31UpdateModalBadges() {
  const pm = document.getElementById('v31ModalPm');
  if (pm) pm.textContent = (State.round && State.round.pmStart) ? State.round.pmStart : '— : —';
  const mb = document.getElementById('v31ModalModeBadge');
  if (mb) mb.textContent = v31IsBeginner() ? '🔰 初心者' : '🏌️ 一般';
}

function v31UpdateThumbLabels() {
  const pPlus = document.getElementById('v31ShotPlusLbl');
  const pMinus = document.getElementById('v31ShotMinusLbl');
  if (v31IsBeginner()) {
    if (pPlus) pPlus.textContent = '自分の打数';
    if (pMinus) pMinus.textContent = '自分の打数';
  } else {
    if (pPlus) pPlus.textContent = 'ストローク';
    if (pMinus) pMinus.textContent = 'ストローク';
  }
  /* 標準モード時、自分以外を編集中はパット±を無効化 */
  const ppPlus = document.getElementById('v31PuttPlus');
  const ppMinus = document.getElementById('v31PuttMinus');
  const cur = State.players[modalPlayerIdx];
  const allowPutt = v31IsStandard() && cur && cur.isMe;
  if (ppPlus)  ppPlus.classList.toggle('v31-disabled', !allowPutt);
  if (ppMinus) ppMinus.classList.toggle('v31-disabled', !allowPutt);
  if (v31IsBeginner()) {
    if (ppPlus)  ppPlus.classList.add('v31-disabled');
    if (ppMinus) ppMinus.classList.add('v31-disabled');
  }
}

function v31SyncSettingsUI() {
  /* 設定モーダル開時に現在の値を反映 */
  const inp = document.getElementById('v31PmStartInput');
  if (inp) inp.value = (State.round && State.round.pmStart) ? State.round.pmStart : v31SmartPmDefault();

  const disp = State.ui.displayMode || 'number';
  document.querySelectorAll('#v31DispSegments button').forEach(b => {
    b.classList.toggle('active', b.dataset.disp === disp);
  });
  const tee = State.ui.useLadiesTee ? 'ladies' : 'reg';
  document.querySelectorAll('#v31TeeSegments button').forEach(b => {
    b.classList.toggle('active', b.dataset.tee === tee);
  });
  /* PM未設定なら自動で「現在時刻+45分」を表示（保存はしない） */
  if (inp && !State.round.pmStart) inp.value = v31SmartPmDefault();
}

/* ============================================================
   v31: 直接編集（inline-edit）— セルをタップしてその場で数値入力
   ============================================================ */
let v31CurrentEdit = null;

function v31CloseInlineEdit(commit) {
  if (!v31CurrentEdit) return;
  const { cell, input, quick, pi, hi } = v31CurrentEdit;
  const rawVal = (input.value || '').trim();
  try { cell.classList.remove('v31-editing'); } catch(e) {}
  try { input.remove(); } catch(e) {}
  try { if (quick && quick.parentNode) quick.remove(); } catch(e) {}
  v31CurrentEdit = null;

  if (commit) {
    /* v36: 共通 updateScore 経由で配列書き込み + 自動保存 + 再描画 */
    v36UpdateScore(pi, hi, { stroke: rawVal });
  } else {
    try { renderTable(); } catch(e) {}
  }
  /* v32: ライブスコアカード再描画 + クロスハイライト + 9H完了チェック */
  try { v32RenderLiveScore(); } catch(e) {}
  try { v32ApplyCrossHighlight(); } catch(e) {}
  try { v32CheckHalfComplete(); } catch(e) {}
}

function v31OpenInlineEdit(cell, pi, hi) {
  if (v31CurrentEdit) v31CloseInlineEdit(true);
  const p = State.players[pi];
  if (!p) return;
  const h = COURSE.holes[hi];

  /* v32: 9Hモード時の 10H〜18H ロック */
  if (v32IsHoleLocked(hi)) {
    showToast('🏁 9Hモードでは 10H 以降は入力できません');
    return;
  }

  if (v31IsBeginner() && !p.isMe) {
    showToast('🔰 初心者モードでは自分のスコアのみ編集できます');
    return;
  }

  cell.classList.add('v31-editing');
  const cur = (p.scores[hi] != null) ? p.scores[hi] : '';

  const input = document.createElement('input');
  input.type = 'number';
  input.inputMode = 'numeric';
  input.min = '1'; input.max = '20';
  input.value = cur;
  input.className = 'v31-inline-edit';
  cell.appendChild(input);

  const quick = document.createElement('div');
  quick.className = 'v31-inline-quick';
  quick.innerHTML =
    '<button type="button" data-act="par">🎯 PAR' + h.par + '</button>' +
    '<button type="button" data-act="clear">クリア</button>' +
    '<button type="button" data-act="ok">✓ OK</button>';
  document.body.appendChild(quick);

  const place = () => {
    const r = cell.getBoundingClientRect();
    const qw = quick.offsetWidth || 200;
    quick.style.top = (window.scrollY + r.bottom + 4) + 'px';
    let left = window.scrollX + r.left;
    if (left + qw > window.innerWidth - 8) left = window.innerWidth - qw - 8;
    if (left < 8) left = 8;
    quick.style.left = left + 'px';
  };
  place(); setTimeout(place, 0);

  v31CurrentEdit = { cell, input, quick, pi, hi };

  quick.addEventListener('mousedown', (e) => e.preventDefault());
  quick.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    e.stopPropagation();
    const act = b.dataset.act;
    if (act === 'par')   { input.value = h.par; input.focus(); }
    else if (act === 'clear') { input.value = ''; input.focus(); }
    else if (act === 'ok')    { v31CloseInlineEdit(true); }
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); v31CloseInlineEdit(true); }
    else if (e.key === 'Escape') { e.preventDefault(); v31CloseInlineEdit(false); }
  });
  input.addEventListener('blur', () => {
    setTimeout(() => {
      if (v31CurrentEdit && document.activeElement !== v31CurrentEdit.input) {
        v31CloseInlineEdit(true);
      }
    }, 200);
  });

  setTimeout(() => { input.focus(); input.select(); }, 50);
}

/* 外側クリックで直接編集を終了 */
document.addEventListener('click', (e) => {
  if (!v31CurrentEdit) return;
  const { cell, quick, input } = v31CurrentEdit;
  if (cell.contains(e.target)) return;
  if (quick && quick.contains(e.target)) return;
  if (e.target === input) return;
  v31CloseInlineEdit(true);
}, true);


/* =================================================================
   v32: アクティブセル管理（行/縦ハイライトのアンカー）
   ================================================================= */
let v32ActivePi = -1;
let v32ActiveHi = -1;

function v32SetActiveCell(pi, hi) {
  v32ActivePi = pi;
  v32ActiveHi = hi;
}

/* =================================================================
   v32: クロスハイライト（行 + 縦）
   #v32LiveTable / #v31ModalScoreTable / #scoreTable 全てに適用
   ================================================================= */
function v32ApplyCrossHighlight() {
  const tables = ['#v32LiveTable', '#v31ModalScoreTable', '#scoreTable'];
  tables.forEach(sel => {
    const t = document.querySelector(sel);
    if (!t) return;
    /* クリア */
    t.querySelectorAll('.col-row-hl, .col-col-hl, .is-input-row').forEach(el => {
      el.classList.remove('col-row-hl', 'col-col-hl', 'is-input-row');
    });
    if (v32ActivePi < 0 || v32ActiveHi < 0) return;
    /* 行（プレイヤー）ハイライト */
    const row = t.querySelector('tr.player-row[data-pi="' + v32ActivePi + '"]');
    if (row) {
      row.classList.add('is-input-row');
      row.querySelectorAll('td').forEach(td => td.classList.add('col-row-hl'));
    }
    /* 縦（ホール）ハイライト */
    const cells = t.querySelectorAll('td[data-hi="' + v32ActiveHi + '"], th[data-hole="' + (v32ActiveHi + 1) + '"]');
    cells.forEach(c => c.classList.add('col-col-hl'));
  });
}

/* =================================================================
   v32: ライブスコアカード描画
   #scoreTable（聖域 v16 が描画したもの）を #v32LiveTable にミラー
   ================================================================= */
function v32RenderLiveScore() {
  const src = document.getElementById('scoreTable');
  const dst = document.getElementById('v32LiveTable');
  if (!src || !dst) return;
  dst.innerHTML = src.innerHTML;
  /* セルタップで直接編集（v31OpenInlineEdit 使用） */
  dst.querySelectorAll('[data-action="cell-tap"]').forEach(td => {
    td.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const pi = +td.dataset.pi;
      const hi = +td.dataset.hi;
      v32SetActiveCell(pi, hi);
      v31OpenInlineEdit(td, pi, hi);
    });
  });
  /* メタ表示更新 */
  const lm = document.getElementById('v32LiveMode');
  if (lm) lm.textContent = v32IsHalfMode() ? '9H' : '18H';
  const lh = document.getElementById('v32LiveHole');
  if (lh) lh.textContent = (State.round.currentHole || 1) + 'H';
  /* サマリー */
  const sum = document.getElementById('v32LiveSummary');
  if (sum) {
    if (State.players.length === 0) {
      sum.classList.remove('show');
      sum.innerHTML = '';
    } else {
      const half = v32IsHalfMode();
      const lines = State.players.slice()
        .sort((a,b) => (a.isMe === b.isMe) ? 0 : (a.isMe ? -1 : 1))
        .map(p => {
          const tot   = half ? v32HalfTotalScore(p) : totalScore(p);
          const dif   = half ? v32HalfTotalDiff(p)  : totalDiff(p);
          const pl    = half ? v32HalfPlayed(p)     : playedHoles(p);
          const dtxt  = dif == null ? '—' : diffText(dif);
          return '<span style="display:inline-block;margin-right:14px;">' +
                 (p.isMe ? '🏌️ ' : '👤 ') +
                 '<b>' + escapeHtml(fullName(p) || '(未設定)') + '</b>: ' +
                 (tot || '—') + ' (' + dtxt + ') / ' + pl + 'H' +
                 '</span>';
        }).join('');
      sum.innerHTML = '合計: ' + lines;
      sum.classList.add('show');
    }
  }
}

/* =================================================================
   v32: 休憩時間表示更新
   ================================================================= */
function v32UpdateRestDisplay() {
  const el = document.getElementById('v32RestDisplay');
  if (!el) return;
  const mins = v32RestMinutes();
  if (mins == null) {
    el.textContent = '— 分';
  } else if (mins === 0) {
    el.textContent = '0 分';
  } else {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    el.textContent = (h > 0 ? h + '時間' : '') + (m > 0 ? m + '分' : (h > 0 ? '' : '0分'));
  }
}

/* =================================================================
   v32: 9H 完了チェック → 完了バナー表示
   ================================================================= */
function v32CheckHalfComplete() {
  const banner = document.getElementById('v329hCompleteBanner');
  if (!banner) return;
  if (v32HalfAllDone()) {
    banner.classList.add('show');
  } else {
    banner.classList.remove('show');
  }
}

/* =================================================================
   v32: 9H 集計画面 表示
   ================================================================= */
function v32ShowHalfSummary() {
  const overlay = document.getElementById('v32HalfSummary');
  const playersBox = document.getElementById('v32HsPlayers');
  const timeBox = document.getElementById('v32HsTime');
  if (!overlay || !playersBox || !timeBox) return;

  /* プレイヤー */
  const halfPar = v32HalfPar();
  const sorted = State.players.slice()
    .sort((a,b) => (a.isMe === b.isMe) ? 0 : (a.isMe ? -1 : 1));
  playersBox.innerHTML = sorted.map(p => {
    const tot = v32HalfTotalScore(p);
    const dif = v32HalfTotalDiff(p);
    const pl = v32HalfPlayed(p);
    const pt = v32HalfTotalPutts(p);
    let dcls = 'even', dtxt = '—';
    if (dif != null) {
      if (dif < 0) { dcls = 'minus'; dtxt = diffText(dif); }
      else if (dif > 0) { dcls = 'plus'; dtxt = diffText(dif); }
      else { dcls = 'even'; dtxt = 'E'; }
    }
    return '<div class="v32-hs-player-row">' +
      '<span>' + (p.isMe ? '🏌️' : '👤') + '</span>' +
      '<span class="v32-hs-name">' + escapeHtml(fullName(p) || '(未設定)') +
        ' <small style="opacity:.7;font-weight:600;">/ ' + pl + 'H · パット' + pt + '</small></span>' +
      '<span class="v32-hs-total">' + (tot || '—') + '</span>' +
      '<span class="v32-hs-diff ' + dcls + '">' + dtxt + '</span>' +
    '</div>';
  }).join('');

  /* タイム情報 */
  const pm = (State.round.pmStart || '— : —');
  const rs = (State.round.restStart || '—');
  const re = (State.round.restEnd || '—');
  const rmins = v32RestMinutes();
  const restTxt = (rmins == null) ? '—' : (rmins + '分');
  timeBox.innerHTML =
    '<div style="font-size:13px;line-height:1.8;">' +
    '⛳ PMスタート: <b>' + pm + '</b><br>' +
    '☕ 休憩: <b>' + rs + ' 〜 ' + re + '</b>（' + restTxt + '）<br>' +
    '🏁 PAR(前半9H): <b>' + halfPar + '</b>' +
    '</div>';

  overlay.classList.add('show');
}

/* =================================================================
   v32: 9H完結データ保存（v16 saveRound は無改変、保存記録に holesMode を後付け追加）
   ================================================================= */
function v32SaveHalfRound() {
  const playedAny = State.players.some(p => v32HalfPlayed(p) > 0);
  if (!playedAny) {
    showToast('まだスコアが入力されていません', 'warning');
    return;
  }
  if (!confirm('この 9H ハーフラウンドを保存して終了しますか？\n（18Hに切り替えれば新規ラウンド開始）')) return;

  State.round.finishedAt = Date.now();
  const halfPar = v32HalfPar();
  const record = {
    id: 'r' + Date.now(),
    course: COURSE.name,
    startedAt: State.round.startedAt,
    finishedAt: State.round.finishedAt,
    groupId: State.round.groupId,
    groupName: State.round.groupName,
    par: halfPar,
    tee: State.ui.useLadiesTee ? 'LADIES' : 'REG',
    /* v32: ハーフ完結データであることを明示 */
    holesMode: '9',
    isHalfRound: true,
    pmStart: State.round.pmStart || '',
    restStart: State.round.restStart || '',
    restEnd: State.round.restEnd || '',
    restMinutes: v32RestMinutes(),
    players: State.players.map(p => ({
      lastname: p.lastname,
      firstname: p.firstname,
      name: fullName(p),
      isMe: p.isMe,
      total: v32HalfTotalScore(p),
      diff: v32HalfTotalDiff(p),
      putts: v32HalfTotalPutts(p),
      played: v32HalfPlayed(p),
      scores: p.scores.slice(0, 9),
      puttsArr: p.putts.slice(0, 9)
    }))
  };
  State.history.unshift(record);
  if (State.history.length > 50) State.history = State.history.slice(0, 50);
  Storage.saveHistory();

  /* 新規ラウンドへ */
  State.round.startedAt = Date.now();
  State.round.finishedAt = null;
  State.round.currentHole = 1;
  State.round.groupId = genGroupId();
  State.round.groupName = (fullNameMe() || 'ゲスト') + 'のハーフ・' + new Date().toLocaleDateString('ja-JP');
  State.players.forEach(p => {
    p.scores = Array(18).fill(null);
    p.putts = Array(18).fill(0);
  });
  Storage.saveState();

  renderTopAndHero();
  renderTable();
  v32RenderLiveScore();
  v32CheckHalfComplete();
  document.getElementById('v32HalfSummary').classList.remove('show');
  showToast('🏁 9H完結データを保存しました！マイページで確認できます');
}

/* =================================================================
   v32: 起動時の v32 同期処理（バインド完了後に呼ぶ）
   ================================================================= */
function v32InitAfterBind() {
  /* holesMode を UI に反映 */
  const cur = (State.round && State.round.holesMode) || '18';
  document.querySelectorAll('#v32HolesToggle button').forEach(b => {
    b.classList.toggle('active', b.dataset.holes === cur);
  });
  v32ApplyHolesBodyClass();
  /* ステータスバッジ */
  const sb = document.getElementById('v32StatusBadge');
  const sbn = document.getElementById('v32SbNum');
  if (sb && sbn) {
    sb.classList.toggle('is-half', cur === '9');
    sbn.textContent = cur;
  }
  /* モーダルバッジ */
  const mb = document.getElementById('v32ModalHolesBadge');
  if (mb) mb.textContent = (cur === '9') ? '🏁 9H' : '🏁 18H';
  /* PM/休憩 既存値反映 */
  const pmInp = document.getElementById('v32MainPmStart');
  if (pmInp) pmInp.value = (State.round.pmStart || '');
  const rs = document.getElementById('v32RestStart');
  if (rs) rs.value = (State.round.restStart || '');
  const re = document.getElementById('v32RestEnd');
  if (re) re.value = (State.round.restEnd || '');
  v32UpdateRestDisplay();
  v32RenderLiveScore();
  v32CheckHalfComplete();
}


/* =================================================================
   v33: 親指グリッド情報バッジ更新
   ================================================================= */
function v33UpdateThumbInfo() {
  const p = State.players[modalPlayerIdx];
  const h = COURSE.holes[modalHole - 1];
  if (!h) return;
  const holeEl = document.getElementById('v33HoleBadge');
  const parEl  = document.getElementById('v33ParBadge');
  const nameEl = document.getElementById('v33PlayerBadge');
  const strkEl = document.getElementById('v33StrokeBadge');
  if (holeEl) holeEl.textContent = h.no + 'H';
  if (parEl)  parEl.textContent  = 'PAR ' + h.par + ' · ' + getYard(h) + 'y';
  if (nameEl) nameEl.textContent = p ? (fullName(p) || '(未設定)') : '—';
  if (strkEl) {
    if (!modalStroke || modalStroke <= 0) {
      strkEl.textContent = '0';
    } else {
      const diff = modalStroke - h.par;
      const sign = diff === 0 ? 'E' : (diff > 0 ? '+' + diff : '' + diff);
      strkEl.textContent = modalStroke + ' (' + sign + ')';
    }
  }
}

/* =================================================================
   v33: ＋/− 即時反映 — v16 計算エンジンを経由してスコア配列に書き込み
   ================================================================= */
function v33CommitImmediate() {
  try { saveCurrentModalScore(); } catch(e) {}
  try { renderTable(); } catch(e) {}
  try { v33UpdateThumbInfo(); } catch(e) {}
  try {
    v32SetActiveCell(modalPlayerIdx, modalHole - 1);
    v32ApplyCrossHighlight();
  } catch(e) {}
}

/* =================================================================
   v33: 全プレイヤー入力済み判定（現在ホール）
   ================================================================= */
function v33AllPlayersDoneForCurrentHole() {
  if (!State.players || State.players.length === 0) return false;
  const hi = modalHole - 1;
  return State.players.every(p => p.scores[hi] != null && p.scores[hi] > 0);
}

/* =================================================================
   v33: 「確定・次へ」ゲート
   全員入力完了なら次ホール（v16 confirmAndNext）、未完了なら次の未入力者へ
   ================================================================= */
function v33ConfirmAndAdvance() {
  v33CommitImmediate();
  if (v33AllPlayersDoneForCurrentHole()) {
    if (v32IsHalfMode() && modalHole >= 9) {
      try { Storage.saveState(); } catch(e) {}
      try { closeAllModals(); } catch(e) {}
      try { renderTable(); } catch(e) {}
      try { v32CheckHalfComplete(); } catch(e) {}
      setTimeout(() => {
        if (v32HalfAllDone()) v32ShowHalfSummary();
        else showToast('🏁 9Hハーフラウンド完了');
      }, 250);
      return;
    }
    try { confirmAndNext(); } catch(e) { console.warn(e); }
    try { v33UpdateThumbInfo(); } catch(e) {}
    try {
      v32SetActiveCell(modalPlayerIdx, modalHole - 1);
      v32ApplyCrossHighlight();
    } catch(e) {}
    /* v35: アクティブセルを次ホールの現在プレイヤーへ */
    v35ActivePi = modalPlayerIdx;
    v35ActiveHi = modalHole - 1;
    try { v35HighlightActiveCell(); } catch(e) {}
  } else {
    const hi = modalHole - 1;
    let nextIdx = -1;
    for (let off = 1; off <= State.players.length; off++) {
      const i = (modalPlayerIdx + off) % State.players.length;
      const pp = State.players[i];
      if (!pp.scores[hi] || pp.scores[hi] <= 0) { nextIdx = i; break; }
    }
    if (nextIdx >= 0) {
      v33SwitchToPlayer(nextIdx);
      const remaining = State.players.filter(p => !p.scores[hi] || p.scores[hi] <= 0).length;
      showToast('⚠ 残り ' + remaining + ' 名未入力 → ' + fullName(State.players[nextIdx]) + ' さんへ');
    }
  }
}

/* =================================================================
   v33: プレイヤー切替（保存→フォーカス移動→ハイライト同期）
   ================================================================= */
function v33SwitchToPlayer(targetIdx) {
  if (targetIdx < 0 || targetIdx >= State.players.length) return;
  try { saveCurrentModalScore(); } catch(e) {}
  try { renderTable(); } catch(e) {}
  modalPlayerIdx = targetIdx;
  const p = State.players[targetIdx];
  const h = COURSE.holes[modalHole - 1];
  if (p && h) {
    if (p.scores[modalHole - 1] != null) {
      modalStroke = p.scores[modalHole - 1];
      modalPutt = p.putts[modalHole - 1] || 0;
    } else if (State.ui.inputMode === 'simple') {
      modalStroke = h.par;
      modalPutt = 2;
    } else {
      modalStroke = 0;
      modalPutt = 0;
    }
  }
  try { v32SetActiveCell(targetIdx, modalHole - 1); } catch(e) {}
  try { v32ApplyCrossHighlight(); } catch(e) {}
  try { updateModalDisplay(); } catch(e) {}
  try { v33UpdateThumbInfo(); } catch(e) {}
}

/* =================================================================
   v33: 次プレイヤー候補（未入力者優先）
   ================================================================= */
function v33PickNextPlayer() {
  if (!State.players.length) return -1;
  const hi = modalHole - 1;
  for (let off = 1; off <= State.players.length; off++) {
    const i = (modalPlayerIdx + off) % State.players.length;
    if (!State.players[i].scores[hi] || State.players[i].scores[hi] <= 0) return i;
  }
  return (modalPlayerIdx + 1) % State.players.length;
}

/* =================================================================
   v33: プロフィール → 同伴者リスト「自分」 同期
   ================================================================= */
function v33SyncMeToPlayer() {
  if (!State.players || State.players.length === 0) {
    State.players = [{
      id: State.me.id || 'me',
      lastname: State.me.lastname || '',
      firstname: State.me.firstname || '',
      isMe: true,
      isProxy: false,
      scores: Array(18).fill(null),
      putts: Array(18).fill(0)
    }];
  }
  let me = State.players.find(p => p.isMe);
  if (!me) {
    me = {
      id: State.me.id || 'me',
      lastname: State.me.lastname || '',
      firstname: State.me.firstname || '',
      isMe: true,
      isProxy: false,
      scores: Array(18).fill(null),
      putts: Array(18).fill(0)
    };
    State.players.unshift(me);
  } else {
    if (State.me.lastname || State.me.firstname) {
      me.lastname  = State.me.lastname  || '';
      me.firstname = State.me.firstname || '';
    }
  }
  try { Storage.saveState(); } catch(e) {}
}


/* =================================================================
   v34: 後半スタート時間 大型表示の同期更新
   ================================================================= */
function v34UpdatePmBigDisplay() {
  const big = document.getElementById('v34PmBigTime');
  const sub = document.getElementById('v34PmBigSub');
  if (!big) return;
  const pm = (State.round && State.round.pmStart) ? State.round.pmStart : '';
  if (pm) {
    big.textContent = pm;
    if (sub) sub.textContent = '✓ 後半スタート予定をセット済';
  } else {
    big.textContent = '— : —';
    if (sub) sub.textContent = 'タップして時刻を調整';
  }
}

/* =================================================================
   v34: 起動時に「現在時刻 + 45分」を後半スタート時間に自動セット
   既存値がある場合は維持
   ================================================================= */
function v34InitPmDefault() {
  if (!State.round) return;
  if (State.round.pmStart && State.round.pmStart.length > 0) {
    /* 既存値あり */
    v34UpdatePmBigDisplay();
    return;
  }
  /* 既存値なし → +45分 で自動セット */
  try {
    const v = v31SmartPmDefault();
    State.round.pmStart = v;
    Storage.saveState();
  } catch(e) {}
  v34UpdatePmBigDisplay();
  /* メイン入力欄にも反映 */
  const inp = document.getElementById('v32MainPmStart');
  if (inp) inp.value = State.round.pmStart || '';
}


/* =================================================================
   v35: アクティブセル管理 — 「入力待機状態」を保持し ＋−ボタンと連動
   ================================================================= */
let v35ActivePi = -1;
let v35ActiveHi = -1;

function v35GetCellId(pi, hi) {
  return 'cell-p' + pi + '-h' + hi;
}

function v35SetActiveCell(pi, hi) {
  v35ActivePi = pi;
  v35ActiveHi = hi;
  if (v32IsHoleLocked(hi)) {
    showToast('🏁 9Hモードでは 10H 以降は入力できません');
    v35ActivePi = -1; v35ActiveHi = -1;
    return false;
  }
  const p = State.players[pi];
  if (v31IsBeginner() && p && !p.isMe) {
    showToast('🔰 初心者モードでは自分のスコアのみ編集できます');
    v35ActivePi = -1; v35ActiveHi = -1;
    return false;
  }
  try { v32SetActiveCell(pi, hi); } catch(e) {}
  try { v32ApplyCrossHighlight(); } catch(e) {}
  modalPlayerIdx = pi;
  modalHole = hi + 1;
  const h = COURSE.holes[hi];
  if (p) {
    if (p.scores[hi] != null) {
      modalStroke = p.scores[hi];
      modalPutt = p.putts[hi] || 0;
    } else if (State.ui.inputMode === 'simple') {
      modalStroke = h ? h.par : 4;
      modalPutt = 2;
    } else {
      modalStroke = 0; modalPutt = 0;
    }
  }
  try { updateModalDisplay(); } catch(e) {}
  try { v33UpdateThumbInfo(); } catch(e) {}
  v35HighlightActiveCell();
  return true;
}

function v35HighlightActiveCell() {
  document.querySelectorAll('.v35-selected-cell').forEach(el =>
    el.classList.remove('v35-selected-cell')
  );
  if (v35ActivePi < 0 || v35ActiveHi < 0) return;
  ['#scoreTable', '#v31ModalScoreTable', '#v32LiveTable'].forEach(sel => {
    const t = document.querySelector(sel);
    if (!t) return;
    const cell = t.querySelector('[data-pi="' + v35ActivePi + '"][data-hi="' + v35ActiveHi + '"]');
    if (cell) cell.classList.add('v35-selected-cell');
  });
}

/* ＋−ボタン即時反映（アクティブセル連動） */
function v35IncrementStroke(delta) {
  if (v35ActivePi < 0 || v35ActiveHi < 0) {
    v35ActivePi = modalPlayerIdx;
    v35ActiveHi = modalHole - 1;
  }
  const pi = v35ActivePi, hi = v35ActiveHi;
  const p = State.players[pi];
  if (!p) return;
  let cur;
  if (p.scores[hi] != null) {
    cur = p.scores[hi];
  } else if (State.ui.inputMode === 'simple') {
    cur = COURSE.holes[hi].par;
  } else {
    cur = 0;
  }
  const next = Math.max(0, Math.min(20, cur + delta));
  /* v36: 共通 updateScore 経由 */
  v36UpdateScore(pi, hi, { stroke: next });
}

function v35IncrementPutt(delta) {
  if (v35ActivePi < 0 || v35ActiveHi < 0) {
    v35ActivePi = modalPlayerIdx;
    v35ActiveHi = modalHole - 1;
  }
  if (!State.settings.puttEnabled) {
    showToast('入力設定でパットを ON にしてください');
    return;
  }
  if (v31IsBeginner()) {
    showToast('🔰 初心者モードではパットは記録しません');
    return;
  }
  const pi = v35ActivePi, hi = v35ActiveHi;
  const p = State.players[pi];
  if (!p) return;
  if (v31IsStandard() && !p.isMe) {
    showToast('パットは自分(佐藤さん)のみ記録します');
    return;
  }
  const cur = p.putts[hi] || 0;
  const next = Math.max(0, Math.min(10, cur + delta));
  /* v36: 共通 updateScore 経由 */
  v36UpdateScore(pi, hi, { putt: next });
}

/* document-level セルタップ委譲 */
function v35BindDocumentCellTap() {
  if (v35BindDocumentCellTap._done) return;
  v35BindDocumentCellTap._done = true;
  document.addEventListener('click', (e) => {
    if (e.target && e.target.classList && (
        e.target.classList.contains('v31-inline-edit') ||
        (e.target.closest && e.target.closest('.v31-inline-quick'))
    )) return;
    const td = e.target.closest && e.target.closest('td[data-action="cell-tap"]');
    if (!td) return;
    const pi = parseInt(td.dataset.pi, 10);
    const hi = parseInt(td.dataset.hi, 10);
    if (isNaN(pi) || isNaN(hi)) return;
    e.stopPropagation();
    const ok = v35SetActiveCell(pi, hi);
    if (!ok) return;
    try { v31OpenInlineEdit(td, pi, hi); } catch(e) {}
  }, true);
}


/* =================================================================
   v36: 共通スコア更新関数（デュアル入力の終端を統合）
   方式A（直接タップ）と方式B（ボタン連続）の両方がここを通る
   v16計算エンジンには触れず、配列書き込み＋永続化＋再描画
   ================================================================= */
function v36UpdateScore(pi, hi, opts) {
  opts = opts || {};
  const p = State.players[pi];
  if (!p) return false;

  if (v32IsHoleLocked(hi)) {
    if (!opts.silent) showToast('🏁 9Hモードでは 10H 以降は入力できません');
    return false;
  }
  if (v31IsBeginner() && !p.isMe) {
    if (!opts.silent) showToast('🔰 初心者モードでは自分のスコアのみ');
    return false;
  }

  /* 1) 配列書き込み（v16互換のデータ構造） */
  if ('stroke' in opts) {
    const s = opts.stroke;
    if (s == null || s === '' || isNaN(s) || parseInt(s,10) <= 0) {
      p.scores[hi] = null;
    } else {
      p.scores[hi] = Math.max(1, Math.min(20, parseInt(s, 10)));
      if (p.putts[hi] == null) p.putts[hi] = 0;
    }
  }
  if ('putt' in opts) {
    if (v31IsStandard() && !p.isMe) {
      /* 自分以外: パット書き込み不可 */
    } else if (v31IsBeginner()) {
      /* ビギナー: パット記録しない */
    } else {
      const pt = opts.putt;
      if (pt == null || isNaN(pt) || pt < 0) {
        p.putts[hi] = 0;
      } else {
        p.putts[hi] = Math.max(0, Math.min(10, parseInt(pt, 10)));
      }
    }
  }

  /* 2) リアルタイム永続化 */
  try { Storage.saveState(); } catch(e) {}

  /* 3) モーダル変数同期 */
  modalPlayerIdx = pi;
  modalHole = hi + 1;
  if (p.scores[hi] != null) {
    modalStroke = p.scores[hi];
    modalPutt = p.putts[hi] || 0;
  }

  /* 4) アクティブセル同期 */
  v35ActivePi = pi;
  v35ActiveHi = hi;

  /* 5) 再描画 */
  if (opts.doRender !== false) {
    try { renderTable(); } catch(e) {}
    try { updateModalDisplay(); } catch(e) {}
    try { v33UpdateThumbInfo(); } catch(e) {}
    try { v35HighlightActiveCell(); } catch(e) {}
  }

  /* 6) 自動保存フラッシュ */
  if (!opts.silent) v36AutosaveFlash();

  return true;
}

/* 自動保存トースト */
let v36AutosaveTimer = null;
function v36AutosaveFlash() {
  let el = document.getElementById('v36AutosaveFlash');
  if (!el) {
    el = document.createElement('div');
    el.id = 'v36AutosaveFlash';
    el.className = 'v36-autosave-flash';
    el.textContent = '💾 自動保存';
    document.body.appendChild(el);
  }
  el.classList.add('show');
  if (v36AutosaveTimer) clearTimeout(v36AutosaveTimer);
  v36AutosaveTimer = setTimeout(() => el.classList.remove('show'), 1000);
}

/* =================================================================
   v36: 「次のホールへ」— 純粋なホール移動（保存は不要、入力時に自動保存済）
   ================================================================= */
function v36MoveToNextHole() {
  const maxH = v32IsHalfMode() ? 9 : 18;
  if (modalHole >= maxH) {
    if (v32IsHalfMode() && v32HalfAllDone()) {
      try { closeAllModals(); } catch(e) {}
      setTimeout(() => v32ShowHalfSummary(), 200);
      return;
    }
    showToast('🏁 最終ホールです（' + maxH + 'H）');
    return;
  }
  /* v16聖域 moveHole(1) でホール移動 */
  try { moveHole(1); } catch(e) {}
  modalHole = State.round.currentHole;
  v35ActivePi = modalPlayerIdx;
  v35ActiveHi = modalHole - 1;

  /* 初期値ロード */
  const p = State.players[modalPlayerIdx];
  const h = COURSE.holes[modalHole - 1];
  if (p && h) {
    if (p.scores[modalHole - 1] != null) {
      modalStroke = p.scores[modalHole - 1];
      modalPutt = p.putts[modalHole - 1] || 0;
    } else if (State.ui.inputMode === 'simple') {
      modalStroke = h.par;
      modalPutt = 2;
    } else {
      modalStroke = 0;
      modalPutt = 0;
    }
  }
  try { updateModalDisplay(); } catch(e) {}
  try { v33UpdateThumbInfo(); } catch(e) {}
  try { v35HighlightActiveCell(); } catch(e) {}
  try { v32SetActiveCell(v35ActivePi, v35ActiveHi); } catch(e) {}
  try { v32ApplyCrossHighlight(); } catch(e) {}
  showToast('▶ ' + modalHole + 'H へ');
}

function bindEvents() {
  /* 表示モード切替（3モード） */
  $('#displayToggle').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-mode]');
    if (!btn) return;
    State.ui.displayMode = btn.dataset.mode;
    $$('#displayToggle button').forEach(b => b.classList.toggle('active', b === btn));
    Storage.saveState();
    renderTable();
    const labels = { number: '数字表示', diff: 'スコア差(±)表示', symbol: '記号表示（★◎◯―△□）' };
    showToast(labels[State.ui.displayMode] + 'に切替');
  });

  /* ヒーロー：前後ホール（◀▶のみ・iマーク削除済） */
  $('#btnHolePrev').addEventListener('click', () => moveHole(-1));
  $('#btnHoleNext').addEventListener('click', () => moveHole(1));

  /* ヘッダー本マーク = 詳細統合 */
  $('#btnTopDetail').addEventListener('click', openCourseDetail);
  $('#btnCourseDetail').addEventListener('click', openCourseDetail);

  /* 設定 */
  $('#btnSettings').addEventListener('click', openSettings);
  $('#btnSaveSettings').addEventListener('click', saveSettings);

  /* ティ切替 */
  $('#btnTeeToggle').addEventListener('click', () => {
    State.ui.useLadiesTee = !State.ui.useLadiesTee;
    Storage.saveState();
    renderTopAndHero();
    renderTable();
    showToast(State.ui.useLadiesTee ? '🌸 LADIESティに切替' : '⛳ REGティに切替');
  });

  /* 招待QR */
  $('#btnInviteQR').addEventListener('click', openInviteQR);
  $('#btnCopyLink').addEventListener('click', copyJoinLink);
  $('#btnShareLink').addEventListener('click', shareJoinLink);

  /* 同伴者追加 */
  $('#btnAddCompanion').addEventListener('click', openAddCompanion);
  $('#btnAddSubmit').addEventListener('click', submitAddCompanion);

  /* プレイヤー編集 */
  $('#btnEditSubmit').addEventListener('click', submitEditPlayer);
  $('#btnDeletePlayer').addEventListener('click', deleteCurrentPlayer);
  $('#btnMakeMe').addEventListener('click', () => {
    if (editPlayerIdx >= 0) makeMe(editPlayerIdx);
  });

  /* ラウンド保存 */
  $('#btnSaveRound').addEventListener('click', saveRound);

  /* 入力モード切替（メイン画面トグル） */
  $('#inputModeMainToggle').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-mode]');
    if (!btn) return;
    const newMode = btn.dataset.mode;
    if (newMode === State.ui.inputMode) return;
    State.ui.inputMode = newMode;
    Storage.saveState();
    applyInputMode();
    const labels = {
      simple: '⚡ シンプル(±)モードに切替：PAR基準から素早く調整',
      counter: '🔢 カウンター(＋−)モードに切替：0から1打ずつカウント'
    };
    showToast(labels[newMode]);
  });

  /* PARクイックボタン（シンプルモード専用） */
  $('#btnQuickPar').addEventListener('click', resetToPar);
  $('#btnQuickPutt').addEventListener('click', resetPuttTo2);

  /* カウンターモード */
  $('#btnStrokeMinus').addEventListener('click', () => {
    if (modalStroke > 0) modalStroke--;
    updateModalDisplay();
  });
  $('#btnStrokePlus').addEventListener('click', () => {
    if (modalStroke < 20) modalStroke++;
    updateModalDisplay();
  });
  $('#btnPuttMinus').addEventListener('click', () => {
    if (!State.settings.puttEnabled) return;
    if (modalPutt > 0) modalPutt--;
    updateModalDisplay();
  });
  $('#btnPuttPlus').addEventListener('click', () => {
    if (!State.settings.puttEnabled) return;
    if (modalPutt < 10) modalPutt++;
    updateModalDisplay();
  });
  $('#btnClear').addEventListener('click', () => {
    /* クリア動作はモード依存：シンプル時はPAR/2に戻す、カウンター時は0/0 */
    const h = COURSE.holes[modalHole - 1];
    if (State.ui.inputMode === 'simple') {
      modalStroke = h.par;
      modalPutt = 2;
      showToast('シンプルモード：PAR / 2パットにリセット');
    } else {
      modalStroke = 0;
      modalPutt = 0;
      showToast('カウンターモード：0 にリセット');
    }
    updateModalDisplay();
  });
  $('#btnConfirm').addEventListener('click', confirmAndNext);

  $('#modalHolePrev').addEventListener('click', () => {
    if (modalHole > 1) {
      saveCurrentModalScore();
      modalHole--;
      State.round.currentHole = modalHole;
      const p = State.players[modalPlayerIdx];
      const h = COURSE.holes[modalHole - 1];
      /* v14：モードに応じた初期値 */
      if (p.scores[modalHole - 1] != null) {
        modalStroke = p.scores[modalHole - 1];
        modalPutt = p.putts[modalHole - 1] || 0;
      } else if (State.ui.inputMode === 'simple') {
        modalStroke = h.par;
        modalPutt = 2;
      } else {
        modalStroke = 0;
        modalPutt = 0;
      }
      Storage.saveState();
      renderTopAndHero();
      renderTable();
      updateModalDisplay();
    }
  });
  $('#modalHoleNext').addEventListener('click', () => {
    if (modalHole < 18) {
      saveCurrentModalScore();
      modalHole++;
      State.round.currentHole = modalHole;
      const p = State.players[modalPlayerIdx];
      const h = COURSE.holes[modalHole - 1];
      /* v14：モードに応じた初期値 */
      if (p.scores[modalHole - 1] != null) {
        modalStroke = p.scores[modalHole - 1];
        modalPutt = p.putts[modalHole - 1] || 0;
      } else if (State.ui.inputMode === 'simple') {
        modalStroke = h.par;
        modalPutt = 2;
      } else {
        modalStroke = 0;
        modalPutt = 0;
      }
      Storage.saveState();
      renderTopAndHero();
      renderTable();
      updateModalDisplay();
    }
  });
  $('#puttToggleMini').addEventListener('click', () => {
    State.settings.puttEnabled = !State.settings.puttEnabled;
    Storage.saveSettings();
    applyPuttSectionEnabled();
  });

  /* モーダル閉じる */
  $$('.modal-backdrop').forEach(bd => {
    bd.addEventListener('click', (e) => { if (e.target === bd) closeAllModals(); });
  });
  $$('[data-close]').forEach(btn => btn.addEventListener('click', closeAllModals));

  /* フッタータブ */
  $$('.footer-tab').forEach(t => {
    t.addEventListener('click', () => Router.go(t.dataset.tab));
  });

  /* ホームメニュー */
  $$('#screen-home [data-go]').forEach(c => {
    c.addEventListener('click', () => Router.go(c.dataset.go));
  });
  $$('#screen-home [data-soon]').forEach(c => {
    c.addEventListener('click', () => {
      showToast('🔒 ' + c.dataset.soon + ' は近日公開予定です 🚀', 'warning');
    });
  });

  /* G-COMPETE */
  $$('#screen-compete [data-action="invite-qr"]').forEach(c => {
    c.addEventListener('click', openInviteQR);
  });
  $$('#screen-compete [data-soon]').forEach(c => {
    c.addEventListener('click', () => {
      showToast('🔒 ' + c.dataset.soon + ' は近日公開予定です 🚀', 'warning');
    });
  });

  /* マイページ */
  $('#btnSaveProfile').addEventListener('click', saveProfile);
  $('#btnClearAll').addEventListener('click', () => {
    if (!confirm('全てのデータ（プロフィール・ラウンド・履歴）を削除します。本当によろしいですか？')) return;
    Storage.clearAll();
    location.reload();
  });

  /* hash変化 */
  window.addEventListener('hashchange', () => Router.handleInitial());

  /* リサイズ */
  window.addEventListener('resize', () => {
    if ($('#screen-gworld').classList.contains('active')) centerCurrentHole();
  });
  window.addEventListener('orientationchange', () => {
    setTimeout(centerCurrentHole, 300);
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && $('#screen-gworld').classList.contains('active')) {
      centerCurrentHole();
    }
  });

  /* v15: アコーディオン設定パネル開閉 */
  const accordion = $('#settingsAccordion');
  const accordionToggle = $('#accordionToggle');
  const accordionArrow = $('#accordionArrow');
  if (accordion && accordionToggle && accordionArrow) {
    accordionToggle.addEventListener('click', () => {
      const isOpen = accordion.classList.contains('is-open');
      if (isOpen) {
        accordion.classList.remove('is-open');
        accordionToggle.setAttribute('aria-expanded', 'false');
        accordionArrow.textContent = '▼ 設定を開く';
      } else {
        accordion.classList.add('is-open');
        accordionToggle.setAttribute('aria-expanded', 'true');
        accordionArrow.textContent = '▼ 閉じる';
      }
    });
  }


  /* ============================================================
     v31: 司令塔 UI バインド
     ============================================================ */
  /* モード切替トグル */
  (function v31BindMode() {
    const wrap = document.getElementById('v31ModeToggle');
    if (!wrap) return;
    const cur = (State.ui && State.ui.gameMode) || 'standard';
    wrap.querySelectorAll('button[data-gmode]').forEach(b => {
      b.classList.toggle('active', b.dataset.gmode === cur);
    });
    wrap.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-gmode]');
      if (!b) return;
      const m = b.dataset.gmode;
      if (m === State.ui.gameMode) return;
      State.ui.gameMode = m;
      Storage.saveState();
      wrap.querySelectorAll('button[data-gmode]').forEach(x => {
        x.classList.toggle('active', x.dataset.gmode === m);
      });
      v31ApplyBodyClass();
      v31UpdateModalBadges();
      v31UpdateThumbLabels();
      const labels = {
        standard: '🏌️ 一般モード（4人ストローク＋自分パット）',
        beginner: '🔰 初心者モード（自分のストロークのみ）'
      };
      showToast(labels[m] || '');
    });
  })();

  /* ロッカー入力 */
  (function v31BindLocker() {
    const inp = document.getElementById('v31LockerInput');
    if (!inp) return;
    inp.value = (State.round && State.round.lockerNum) || '';
    const save = () => {
      State.round.lockerNum = (inp.value || '').trim();
      Storage.saveState();
    };
    inp.addEventListener('input', save);
    inp.addEventListener('blur', save);
  })();

  /* 同伴者追加（既存 btnAddCompanion に委譲） */
  (function v31BindAddCompanion() {
    const b = document.getElementById('v31AddCompanion');
    if (!b) return;
    b.addEventListener('click', () => {
      const o = document.getElementById('btnAddCompanion');
      if (o) o.click();
    });
  })();

  /* コース詳細（既存 btnCourseDetail に委譲） */
  (function v31BindCourseDetail() {
    const b = document.getElementById('v31CourseDetailBtn');
    if (!b) return;
    b.addEventListener('click', () => {
      const o = document.getElementById('btnCourseDetail');
      if (o) o.click();
    });
  })();

  /* ラウンド開始（モーダル起動） */
  (function v31BindStart() {
    const b = document.getElementById('v31StartRound');
    if (!b) return;
    b.addEventListener('click', () => {
      if (!State.players || State.players.length === 0) {
        showToast('⚠ 同伴者を先に登録してください', 'error');
        return;
      }
      let pi = State.players.findIndex(p => p.isMe);
      if (pi < 0) pi = 0;
      const hi = Math.max(0, (State.round.currentHole || 1) - 1);
      try { openScoreModal(pi, hi); } catch(e) {}
    });
  })();

  /* 設定モーダルを開く */
  (function v31BindOpenSettings() {
    const b = document.getElementById('v31OpenSettings');
    if (!b) return;
    b.addEventListener('click', () => {
      try { openSettings(); } catch(e) {}
      setTimeout(v31SyncSettingsUI, 50);
    });
  })();

  /* 設定モーダル内: PMスタート */
  (function v31BindPmStart() {
    const inp = document.getElementById('v31PmStartInput');
    const smart = document.getElementById('v31PmSmartFill');
    const clr = document.getElementById('v31PmClear');
    if (inp) {
      const save = () => {
        State.round.pmStart = (inp.value || '').trim();
        Storage.saveState();
        v31UpdateModalBadges();
      };
      inp.addEventListener('input', save);
      inp.addEventListener('change', save);
    }
    if (smart) {
      smart.addEventListener('click', () => {
        const v = v31SmartPmDefault();
        if (inp) inp.value = v;
        State.round.pmStart = v;
        Storage.saveState();
        v31UpdateModalBadges();
        showToast('⛳ PMスタート: ' + v);
      });
    }
    if (clr) {
      clr.addEventListener('click', () => {
        if (inp) inp.value = '';
        State.round.pmStart = '';
        Storage.saveState();
        v31UpdateModalBadges();
      });
    }
  })();

  /* 設定モーダル内: 表示モードセグメント */
  (function v31BindDispSeg() {
    const wrap = document.getElementById('v31DispSegments');
    if (!wrap) return;
    wrap.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-disp]');
      if (!b) return;
      const m = b.dataset.disp;
      State.ui.displayMode = m;
      Storage.saveState();
      wrap.querySelectorAll('button').forEach(x => x.classList.toggle('active', x.dataset.disp === m));
      renderTable();
      const labels = { number: '数字', diff: 'スコア差(±)', symbol: '記号' };
      showToast(labels[m] + '表示に切替');
    });
  })();

  /* 設定モーダル内: ティ切替セグメント */
  (function v31BindTeeSeg() {
    const wrap = document.getElementById('v31TeeSegments');
    if (!wrap) return;
    wrap.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-tee]');
      if (!b) return;
      const tee = b.dataset.tee;
      State.ui.useLadiesTee = (tee === 'ladies');
      Storage.saveState();
      wrap.querySelectorAll('button').forEach(x => x.classList.toggle('active', x.dataset.tee === tee));
      renderTopAndHero();
      renderTable();
      showToast(tee === 'ladies' ? '🌸 LADIESティに切替' : '⛳ REGティに切替');
    });
  })();

  /* 設定モーダル内: 招待QR */
  (function v31BindInviteQR() {
    const b = document.getElementById('v31OpenInviteQR');
    if (!b) return;
    b.addEventListener('click', () => {
      const o = document.getElementById('btnInviteQR');
      if (o) o.click();
    });
  })();

  /* ============================================================
     v31: モーダル内 親指グリッド（v16 既存ボタンへ委譲）
     ============================================================ */
  /* ============================================================
     v33: 親指グリッド — ＋/− 即時反映、プレイヤー切替、確定ゲート
     ============================================================ */
  (function v33BindThumb() {
    const sp = document.getElementById('v31ShotPlus');
    const sm = document.getElementById('v31ShotMinus');
    const pp = document.getElementById('v31PuttPlus');
    const pm = document.getElementById('v31PuttMinus');
    const pn = document.getElementById('v31PlayerNext');
    const cf = document.getElementById('v31Confirm');

    /* v35: アクティブセル連動 — タップ選択中のセルを書き換える */
    if (sp) sp.addEventListener('click', () => v35IncrementStroke(+1));
    if (sm) sm.addEventListener('click', () => v35IncrementStroke(-1));
    if (pp) pp.addEventListener('click', () => v35IncrementPutt(+1));
    if (pm) pm.addEventListener('click', () => v35IncrementPutt(-1));

    if (pn) pn.addEventListener('click', () => {
      if (v31IsBeginner()) { showToast('🔰 初心者モードでは自分のみ'); return; }
      if (!State.players.length) return;
      const nxt = v33PickNextPlayer();
      if (nxt >= 0) {
        v33SwitchToPlayer(nxt);
        v35ActivePi = nxt;
        v35ActiveHi = modalHole - 1;
        v35HighlightActiveCell();
      }
    });

    if (cf) cf.addEventListener('click', () => v36MoveToNextHole());
  })();


  /* ============================================================
     v31: 起動時の同期処理
     ============================================================ */
  v31ApplyBodyClass();
  v31RenderPlayerList();
  v31UpdateModalBadges();
  v31UpdateThumbLabels();


  /* ============================================================
     v32: 9H/18H 切替バインド
     ============================================================ */
  (function v32BindHolesToggle() {
    const wrap = document.getElementById('v32HolesToggle');
    if (!wrap) return;
    wrap.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-holes]');
      if (!b) return;
      const mode = b.dataset.holes;
      if (mode === State.round.holesMode) return;
      /* 18→9 切替時、10H以降の入力がある場合は警告 */
      if (mode === '9') {
        const hasBack = State.players.some(p =>
          p.scores.slice(9).some(v => v != null)
        );
        if (hasBack) {
          if (!confirm('10H以降に入力済みのスコアがあります。\n9Hモードに切り替えると、それらは集計に含まれません。\n（データ自体は保持されます）\n切り替えてよろしいですか？')) {
            return;
          }
        }
      }
      State.round.holesMode = mode;
      /* 9Hモード時、currentHole を 1-9 にクランプ */
      if (mode === '9' && State.round.currentHole > 9) {
        State.round.currentHole = 9;
      }
      Storage.saveState();
      wrap.querySelectorAll('button').forEach(x =>
        x.classList.toggle('active', x.dataset.holes === mode)
      );
      v32ApplyHolesBodyClass();
      /* ステータスバッジ更新 */
      const sb = document.getElementById('v32StatusBadge');
      const sbn = document.getElementById('v32SbNum');
      if (sb) sb.classList.toggle('is-half', mode === '9');
      if (sbn) sbn.textContent = mode;
      /* モーダルバッジ */
      const mb = document.getElementById('v32ModalHolesBadge');
      if (mb) mb.textContent = (mode === '9') ? '🏁 9H' : '🏁 18H';
      /* 再描画 */
      try { renderTopAndHero(); } catch(e) {}
      renderTable();
      v32RenderLiveScore();
      v32CheckHalfComplete();
      showToast(mode === '9' ? '🏁 9Hハーフモードに切替（10H以降ロック）' : '🏁 18Hフルラウンドモードに切替');
    });
  })();

  /* v34: 後半スタート時間 & 休憩時間 メイン直接入力 */
  (function v34BindMainTime() {
    const pmInp = document.getElementById('v32MainPmStart');
    const pmSmart = document.getElementById('v32MainPmSmart');
    const pmClear = document.getElementById('v34PmClear');
    const rs = document.getElementById('v32RestStart');
    const re = document.getElementById('v32RestEnd');

    const savePm = () => {
      State.round.pmStart = (pmInp.value || '').trim();
      Storage.saveState();
      v31UpdateModalBadges();
      v34UpdatePmBigDisplay();
    };
    const saveRs = () => {
      State.round.restStart = (rs.value || '').trim();
      Storage.saveState();
      v32UpdateRestDisplay();
    };
    const saveRe = () => {
      State.round.restEnd = (re.value || '').trim();
      Storage.saveState();
      v32UpdateRestDisplay();
    };
    if (pmInp) {
      pmInp.value = State.round.pmStart || '';
      pmInp.addEventListener('input', savePm);
      pmInp.addEventListener('change', savePm);
    }
    if (pmSmart) {
      pmSmart.addEventListener('click', () => {
        const v = v31SmartPmDefault();
        if (pmInp) pmInp.value = v;
        State.round.pmStart = v;
        Storage.saveState();
        v31UpdateModalBadges();
        v34UpdatePmBigDisplay();
        showToast('⛳ 後半スタート: ' + v);
      });
    }
    if (pmClear) {
      pmClear.addEventListener('click', () => {
        if (pmInp) pmInp.value = '';
        State.round.pmStart = '';
        Storage.saveState();
        v31UpdateModalBadges();
        v34UpdatePmBigDisplay();
        showToast('⛳ 後半スタート時間をクリア');
      });
    }
    if (rs) { rs.value = State.round.restStart || ''; rs.addEventListener('input', saveRs); rs.addEventListener('change', saveRs); }
    if (re) { re.value = State.round.restEnd   || ''; re.addEventListener('input', saveRe); re.addEventListener('change', saveRe); }
    v32UpdateRestDisplay();
    v34UpdatePmBigDisplay();
  })();

  /* 9H完了バナータップで集計画面 */
  (function v32BindHalfBanner() {
    const b = document.getElementById('v329hCompleteBanner');
    if (!b) return;
    b.addEventListener('click', () => v32ShowHalfSummary());
  })();

  /* 9H 集計画面の各種ボタン */
  (function v32BindHalfSummary() {
    const close = document.getElementById('v32HsClose');
    const back  = document.getElementById('v32HsBack');
    const save  = document.getElementById('v32HsSave');
    const overlay = document.getElementById('v32HalfSummary');
    if (close && overlay) close.addEventListener('click', () => overlay.classList.remove('show'));
    if (back  && overlay) back.addEventListener('click',  () => overlay.classList.remove('show'));
    if (save) save.addEventListener('click', v32SaveHalfRound);
    /* オーバーレイ背景タップで閉じる */
    if (overlay) overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.remove('show');
    });
  })();

  /* v33: 招待QR（同伴者追加直下）→ btnInviteQR 委譲 */
  (function v33BindInviteQR() {
    const b = document.getElementById('v33InviteQR');
    if (!b) return;
    b.addEventListener('click', () => {
      const o = document.getElementById('btnInviteQR');
      if (o) o.click();
    });
  })();

  /* v33: プロフィール保存後 → 同伴者リスト即時反映 */
  (function v33HookSaveProfile() {
    const b = document.getElementById('btnSaveProfile');
    if (!b) return;
    b.addEventListener('click', () => {
      setTimeout(() => {
        try { v33SyncMeToPlayer(); } catch(e) {}
        try { v31RenderPlayerList(); } catch(e) {}
        try { renderTable(); } catch(e) {}
      }, 50);
    });
  })();

  /* v33: タブ切替(g-world)時にも同期 */
  (function v33HookTabSwitch() {
    document.querySelectorAll('.footer-tab[data-tab="gworld"]').forEach(t => {
      t.addEventListener('click', () => {
        setTimeout(() => {
          try { v33SyncMeToPlayer(); } catch(e) {}
          try { v31RenderPlayerList(); } catch(e) {}
        }, 50);
      });
    });
  })();

  /* v35: document-level セルタップ委譲 — タップ伝搬を確実化 */
  try { v35BindDocumentCellTap(); } catch(e) {}

  /* v32/v33/v34: 起動同期 */
  try { v33SyncMeToPlayer(); } catch(e) {}
  v32InitAfterBind();
  try { v31RenderPlayerList(); } catch(e) {}
  try { v33UpdateThumbInfo(); } catch(e) {}
  /* v34: 起動時に後半スタート時間を「現在時刻+45分」で自動セット（既存値があれば維持） */
  try { v34InitPmDefault(); } catch(e) {}
}

/* =================================================================
   §23. アプリ起動
   ================================================================= */
function boot() {
  initState();
  bindEvents();
  applyInputMode();  /* v14: 起動時に入力モードを適用（body class設定など） */
  Router.handleInitial();
  console.log('G-WORLD v38.0 (V37基盤 + ダッシュボード + ボトムシートパネル)', new Date().toISOString());
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}



/* ============================================================
   v38: UI刷新 — セルタップ式ボトムシート + ダッシュボード
   v16計算エンジンは無変更。すべて v36UpdateScore 経由で保存。
   ============================================================ */

const V38 = {
  panelOpen: false,
  pi: 0,
  hi: 0,
  // パネル内モード(ダッシュボードと連動): 'simple' | 'counter' | 'stroke_putt'
  inputMode: 'simple',
};

/* --- 入力モード判定(stroke_putt は State.ui.inputMode='simple' かつ自分セルで有効) --- */
function v38GetInputMode() {
  // V38.inputMode を最優先(ユーザがパネル内タブで切り替えたもの)
  return V38.inputMode || State.ui.inputMode || 'simple';
}

/* --- ダッシュボード更新 --- */
function v38UpdateDashboard() {
  try {
    // ティー
    const teeVal = State.ui.useLadiesTee ? 'LADIES' : 'REG';
    const teeEl = document.getElementById('v38DashTeeVal');
    if (teeEl) teeEl.textContent = teeVal;

    // スコア表示モード
    const disp = State.ui.displayMode || 'number';
    const dispLbl = disp === 'symbol' ? '記号' : (disp === 'diff' ? '±差分' : '数字');
    const dispEl = document.getElementById('v38DashDispVal');
    if (dispEl) dispEl.textContent = dispLbl;

    // PMスタート
    const pmEl = document.getElementById('v38DashPm');
    if (pmEl) pmEl.textContent = State.round.pmStart || '— : —';

    // ロッカー
    const lk = (State.round.lockerNum || '').toString().trim();
    const lkEl = document.getElementById('v38DashLocker');
    if (lkEl) lkEl.textContent = lk || '—';

    // モード
    const gameLbl = (State.ui.gameMode === 'beginner') ? '初心者' : '一般';
    const gEl = document.getElementById('v38DashGame');
    if (gEl) gEl.textContent = gameLbl;

    const hLbl = (State.round.holesMode === '9') ? '9H' : '18H';
    const hEl = document.getElementById('v38DashHoles');
    if (hEl) hEl.textContent = hLbl;

    const iLbl = (v38GetInputMode() === 'counter') ? 'カウンター'
               : (v38GetInputMode() === 'stroke_putt') ? '数字+パット'
               : 'シンプル';
    const iEl = document.getElementById('v38DashInput');
    if (iEl) iEl.textContent = iLbl;
  } catch(e) { /* noop */ }
}

/* --- ティー切替 --- */
function v38ToggleTee() {
  State.ui.useLadiesTee = !State.ui.useLadiesTee;
  try { Storage.saveState(); } catch(e) {}
  try { renderTopAndHero(); } catch(e) {}
  try { renderTable(); } catch(e) {}
  v38UpdateDashboard();
  showToast(State.ui.useLadiesTee ? '⛳ LADIES TEE に切替' : '⛳ REG TEE に切替');
}

/* --- 表示モード切替(数字→±→記号→数字) --- */
function v38CycleDisplayMode() {
  const order = ['number', 'diff', 'symbol'];
  const cur = State.ui.displayMode || 'number';
  const next = order[(order.indexOf(cur) + 1) % order.length];
  State.ui.displayMode = next;
  try { Storage.saveState(); } catch(e) {}
  try { renderTable(); } catch(e) {}
  v38UpdateDashboard();
  const lbl = next === 'symbol' ? '記号' : (next === 'diff' ? '±差分' : '数字');
  showToast('🔢 スコア表示: ' + lbl);
}

/* ============================================================
   v38 ボトムシートパネル — open/close
   ============================================================ */
function v38OpenInputPanel(pi, hi) {
  // ロック判定
  try {
    if (v32IsHoleLocked && v32IsHoleLocked(hi)) {
      showToast('🏁 9Hモードでは 10H 以降は入力できません');
      return;
    }
  } catch(e) {}
  // ビギナーは自分のみ
  if (v31IsBeginner && v31IsBeginner()) {
    const me = State.players[pi];
    if (!me || !me.isMe) {
      const meIdx = State.players.findIndex(p => p.isMe);
      if (meIdx >= 0) pi = meIdx;
      else { showToast('🔰 自分のプレイヤーが見つかりません'); return; }
    }
  }

  V38.pi = pi;
  V38.hi = hi;
  V38.inputMode = State.ui.inputMode || 'simple';

  // モーダル変数同期(既存ロジックとの互換)
  modalPlayerIdx = pi;
  modalHole = hi + 1;
  v35ActivePi = pi; v35ActiveHi = hi;
  try { v32SetActiveCell(pi, hi); } catch(e) {}
  try { v32ApplyCrossHighlight(); } catch(e) {}

  // 描画
  v38RenderPanelHead();
  v38RenderPanelModeTabs();
  v38RenderPanelBody();

  // 開く
  const panel = document.getElementById('v38InputPanel');
  const bd = document.getElementById('v38PanelBackdrop');
  if (panel) panel.classList.add('is-open');
  if (bd) bd.classList.add('is-open');
  V38.panelOpen = true;
}

function v38ClosePanel() {
  const panel = document.getElementById('v38InputPanel');
  const bd = document.getElementById('v38PanelBackdrop');
  if (panel) panel.classList.remove('is-open');
  if (bd) bd.classList.remove('is-open');
  V38.panelOpen = false;
}

/* --- ヘッダー(ホール・PAR・プレイヤー・現在値) --- */
function v38RenderPanelHead() {
  const p = State.players[V38.pi];
  const h = COURSE.holes[V38.hi];
  if (!p || !h) return;
  const cur = (p.scores[V38.hi] != null) ? p.scores[V38.hi] : null;

  const setText = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };
  setText('v38PanelHole', (V38.hi + 1) + 'H');
  setText('v38PanelPar', 'PAR ' + h.par);
  setText('v38PanelPlayer', fullName(p) || ('プレイヤー' + (V38.pi+1)));
  setText('v38PanelScore', cur != null ? String(cur) : '—');
}

/* --- モード切替タブ(パネル内) --- */
function v38RenderPanelModeTabs() {
  const tabs = document.getElementById('v38PanelModeTabs');
  if (!tabs) return;
  const cur = v38GetInputMode();
  tabs.querySelectorAll('.v38-pmt-btn').forEach(b => {
    if (b.dataset.pmode === cur) b.classList.add('is-active');
    else b.classList.remove('is-active');
  });
}

/* --- 本体(モード別UI) --- */
function v38RenderPanelBody() {
  const body = document.getElementById('v38PanelBody');
  if (!body) return;
  const mode = v38GetInputMode();
  if (mode === 'counter') {
    body.innerHTML = v38BuildCounterHtml();
  } else if (mode === 'stroke_putt') {
    body.innerHTML = v38BuildKeypadHtml();
  } else {
    body.innerHTML = v38BuildSimpleHtml();
  }
  v38BindPanelBodyEvents(body, mode);
}

/* === シンプルモード: 天気予報パネル風 === */
function v38BuildSimpleHtml() {
  const h = COURSE.holes[V38.hi];
  const par = h ? h.par : 4;
  // 上段: ±2, ±1, 0(PAR), の主要5ボタン
  // 下段: −3, −2 を超える稀ケース用補助 + クリア + 数値直接
  const items = [
    { diff: -2, lbl: 'イーグル', cls: 'v38-sb-eagle', val: par - 2 },
    { diff: -1, lbl: 'バーディ', cls: 'v38-sb-birdie', val: par - 1 },
    { diff:  0, lbl: 'パー',     cls: 'v38-sb-par',    val: par     },
    { diff:  1, lbl: 'ボギー',   cls: 'v38-sb-bogey',  val: par + 1 },
    { diff:  2, lbl: 'Dボギー',  cls: 'v38-sb-dbogey', val: par + 2 },
  ];
  let h1 = '<div class="v38-simple-grid">';
  items.forEach(it => {
    const v = Math.max(1, it.val);
    h1 += '<button type="button" class="v38-simple-btn ' + it.cls + '" data-sv="' + v + '">';
    h1 += '<span class="v38-sb-val">' + v + '</span>';
    h1 += '<span class="v38-sb-lbl">' + it.lbl + '</span>';
    h1 += '</button>';
  });
  h1 += '</div>';
  // 下段: +3 / +4 / +5 / 10
  h1 += '<div class="v38-simple-row2">';
  [par+3, par+4, par+5, 10].forEach(v => {
    h1 += '<button type="button" class="v38-simple-btn" data-sv="' + v + '">';
    h1 += '<span class="v38-sb-val">' + v + '</span>';
    h1 += '<span class="v38-sb-lbl">+' + (v - par) + '</span>';
    h1 += '</button>';
  });
  h1 += '</div>';
  /* v41.1: クイック行を物理削除 */
  return h1;
}

/* === カウンターモード: 巨大±のみ === */
function v38BuildCounterHtml() {
  const p = State.players[V38.pi];
  const cur = (p && p.scores[V38.hi] != null) ? p.scores[V38.hi] : 0;
  let h = '<div class="v38-counter">';
  h += '<button type="button" class="v38-counter-btn v38-cb-minus" data-act="minus">−</button>';
  h += '<div class="v38-counter-display">';
  h += '  <span class="v38-cd-val" id="v38CounterVal">' + cur + '</span>';
  h += '  <span class="v38-cd-lbl">タップしてカウント</span>';
  h += '</div>';
  h += '<button type="button" class="v38-counter-btn v38-cb-plus" data-act="plus">＋</button>';
  h += '</div>';
  /* v41.1: クイック行を物理削除 */
  return h;
}

/* === ストローク+パットモード: 数字キーパッド + パット行 === */
function v38BuildKeypadHtml() {
  const p = State.players[V38.pi];
  const h = COURSE.holes[V38.hi];
  const par = h ? h.par : 4;
  const curPutt = (p && p.putts && p.putts[V38.hi] != null) ? p.putts[V38.hi] : 0;
  const canPutt = !v31IsBeginner() && (p.isMe || State.ui.inputMode !== 'simple');

  let html = '<div class="v38-keypad">';
  ['1','2','3','4','5','6','7','8','9'].forEach(n => {
    html += '<button type="button" class="v38-key" data-num="' + n + '">' + n + '</button>';
  });
  html += '<button type="button" class="v38-key v38-key-fn v38-key-clear" data-act="clear">🗑</button>';
  html += '<button type="button" class="v38-key" data-num="10">10</button>';
  html += '<button type="button" class="v38-key v8-key-fn v38-key-par" data-act="par">PAR ' + par + '</button>';
  html += '</div>';

  if (canPutt) {
    html += '<div class="v38-putt-block">';
    html += '  <div class="v38-putt-head"><span class="v38-putt-head-lbl">🏌️ パット数</span>';
    html += '    <span class="v38-putt-head-val" id="v38PuttVal">' + curPutt + '</span></div>';
    html += '  <div class="v38-putt-btns">';
    for (let i = 0; i <= 5; i++) {
      const act = (i === curPutt) ? ' is-active' : '';
      html += '<button type="button" class="v38-pb' + act + '" data-putt="' + i + '">' + i + '</button>';
    }
    html += '  </div>';
    html += '</div>';
  }
  /* v41.1: クイック行を物理削除 */
  return html;
}

/* --- パネル本体イベントバインド --- */
function v38BindPanelBodyEvents(body, mode) {
  body.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const act = btn.dataset.act;
      const sv = btn.dataset.sv;
      const num = btn.dataset.num;
      const putt = btn.dataset.putt;

      if (sv != null) {
        // シンプルモード: 直接値設定
        v36UpdateScore(V38.pi, V38.hi, { stroke: parseInt(sv, 10) });
        v38AfterInputFeedback();
        return;
      }
      if (num != null) {
        // 数字キー
        v36UpdateScore(V38.pi, V38.hi, { stroke: parseInt(num, 10) });
        v38AfterInputFeedback();
        return;
      }
      if (putt != null) {
        v36UpdateScore(V38.pi, V38.hi, { putt: parseInt(putt, 10) });
        v38AfterInputFeedback();
        return;
      }
      if (act === 'plus') {
        const p = State.players[V38.pi];
        const cur = (p.scores[V38.hi] != null) ? p.scores[V38.hi] : 0;
        v36UpdateScore(V38.pi, V38.hi, { stroke: Math.min(20, cur + 1) });
        v38AfterInputFeedback();
        return;
      }
      if (act === 'minus') {
        const p = State.players[V38.pi];
        const cur = (p.scores[V38.hi] != null) ? p.scores[V38.hi] : 0;
        const nv = cur - 1;
        if (nv <= 0) v36UpdateScore(V38.pi, V38.hi, { stroke: null });
        else v36UpdateScore(V38.pi, V38.hi, { stroke: nv });
        v38AfterInputFeedback();
        return;
      }
      if (act === 'par') {
        const h = COURSE.holes[V38.hi];
        v36UpdateScore(V38.pi, V38.hi, { stroke: h.par });
        v38AfterInputFeedback();
        return;
      }
      if (act === 'clear') {
        v36UpdateScore(V38.pi, V38.hi, { stroke: null });
        v38AfterInputFeedback();
        return;
      }
      if (act === 'close') {
        v38ClosePanel();
        return;
      }
    });
  });
}

/* --- 入力後の即時フィードバック(画面更新+スコア表示) --- */
function v38AfterInputFeedback() {
  // 自動保存は v36UpdateScore 内で完結。ここでは UI 反映のみ。
  try { renderTable(); } catch(e) {}
  try { v32RenderLiveScore(); } catch(e) {}
  try { v32ApplyCrossHighlight(); } catch(e) {}
  v38RenderPanelHead();
  // モード別のローカル表示更新
  const mode = v38GetInputMode();
  if (mode === 'counter') {
    const p = State.players[V38.pi];
    const cur = (p && p.scores[V38.hi] != null) ? p.scores[V38.hi] : 0;
    const el = document.getElementById('v38CounterVal');
    if (el) el.textContent = cur;
  } else if (mode === 'stroke_putt') {
    const p = State.players[V38.pi];
    const cp = (p && p.putts && p.putts[V38.hi] != null) ? p.putts[V38.hi] : 0;
    const el = document.getElementById('v38PuttVal');
    if (el) el.textContent = cp;
    // パットボタンのアクティブ状態同期
    const body = document.getElementById('v38PanelBody');
    if (body) {
      body.querySelectorAll('.v38-pb').forEach(b => {
        if (parseInt(b.dataset.putt,10) === cp) b.classList.add('is-active');
        else b.classList.remove('is-active');
      });
    }
  }
  try { v32CheckHalfComplete(); } catch(e) {}
}

/* --- パネルナビゲーション(前/次ホール・前/次プレイヤー) --- */
function v38PanelMoveHole(delta) {
  const ni = V38.hi + delta;
  if (ni < 0) { showToast('最初のホールです'); return; }
  const maxH = (State.round.holesMode === '9') ? 9 : COURSE.holes.length;
  if (ni >= maxH) {
    showToast('最終ホールです');
    return;
  }
  v38OpenInputPanel(V38.pi, ni);
}
function v38PanelMovePlayer(delta) {
  if (v31IsBeginner()) {
    showToast('🔰 初心者モードでは自分のみ');
    return;
  }
  const n = State.players.length;
  if (n === 0) return;
  const ni = (V38.pi + delta + n) % n;
  v38OpenInputPanel(ni, V38.hi);
}

/* ============================================================
   v38 セルタップを v31OpenInlineEdit から v38OpenInputPanel へ完全切り替え
   ============================================================ */
function v38OverrideCellTap() {
  // v31OpenInlineEdit を v38OpenInputPanel ラッパに差し替え
  // (既存 renderTable 内の呼び出しはそのまま、関数だけ置換)
  if (typeof window !== 'undefined') {
    window.v31OpenInlineEdit = function(cell, pi, hi) {
      // セルパラメータは無視してパネル起動
      v38OpenInputPanel(pi, hi);
    };
  }
}

/* ============================================================
   v38 イベント結線
   ============================================================ */
function v38BindEvents() {
  // ダッシュボードカード
  const teeBtn = document.getElementById('v38DashTee');
  if (teeBtn) teeBtn.addEventListener('click', v38ToggleTee);
  const dispBtn = document.getElementById('v38DashDisp');
  if (dispBtn) dispBtn.addEventListener('click', v38CycleDisplayMode);

  // パネル モードタブ
  const tabs = document.getElementById('v38PanelModeTabs');
  if (tabs) {
    tabs.addEventListener('click', (e) => {
      const b = e.target.closest('.v38-pmt-btn');
      if (!b) return;
      const m = b.dataset.pmode;
      V38.inputMode = m;
      // シンプル/カウンター は State.ui.inputMode にも反映(stroke_putt はパネル限定)
      if (m === 'simple' || m === 'counter') {
        State.ui.inputMode = m;
        try { Storage.saveState(); } catch(e) {}
      }
      v38UpdateDashboard();
      v38RenderPanelModeTabs();
      v38RenderPanelBody();
    });
  }

  // 閉じる
  const closeBtn = document.getElementById('v38PanelClose');
  if (closeBtn) closeBtn.addEventListener('click', v38ClosePanel);
  const bd = document.getElementById('v38PanelBackdrop');
  if (bd) bd.addEventListener('click', v38ClosePanel);

  // フットナビ
  const ph = document.getElementById('v38PanelPrevHole');
  if (ph) ph.addEventListener('click', () => v38PanelMoveHole(-1));
  const nh = document.getElementById('v38PanelNextHole');
  if (nh) nh.addEventListener('click', () => v38PanelMoveHole(1));
  const pp = document.getElementById('v38PanelPrevPlayer');
  if (pp) pp.addEventListener('click', () => v38PanelMovePlayer(-1));
  const np = document.getElementById('v38PanelNextPlayer');
  if (np) np.addEventListener('click', () => v38PanelMovePlayer(1));

  // ロッカー入力変更時にダッシュボードも更新
  const lk = document.getElementById('v31LockerInput');
  if (lk) {
    ['input','change','blur'].forEach(ev =>
      lk.addEventListener(ev, () => { v38UpdateDashboard(); })
    );
  }

  // セルタップを上書き
  v38OverrideCellTap();
}

/* ============================================================
   v38 初期化フック(boot後)
   ============================================================ */
function v38Boot() {
  v38BindEvents();
  v38UpdateDashboard();
  // 既存の inputMode が未定義なら 'simple' を強制
  if (!State.ui.inputMode) State.ui.inputMode = 'simple';
  V38.inputMode = State.ui.inputMode;
}

/* DOMContentLoaded 後に確実に実行 */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(v38Boot, 100);
  });
} else {
  setTimeout(v38Boot, 100);
}

/* PMスタート・ロッカー・ティー・表示モードが変わったら都度更新 */
(function v38InstallObservers() {
  // saveSettings 後のフック
  if (typeof window !== 'undefined') {
    const origSave = window.saveSettings;
    if (typeof origSave === 'function') {
      window.saveSettings = function() {
        const r = origSave.apply(this, arguments);
        try { v38UpdateDashboard(); } catch(e) {}
        return r;
      };
    }
  }
  // PMスタート変更時(v34PmAdd45 / v34PmClear)
  const obsIds = ['v34PmAdd45', 'v34PmClear', 'v31PmStartInput', 'v32MainPmStart'];
  obsIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      ['click','input','change','blur'].forEach(ev =>
        el.addEventListener(ev, () => setTimeout(v38UpdateDashboard, 50))
      );
    }
  });
})();



/* ============================================================
   v38.1: ダッシュボード操作化 + 一括登録 + レイヤー整理
   ============================================================ */

/* --- ダッシュボード: 後半スタート(タップで現在時刻+45分を再計算) --- */
function v381TogglePmStart() {
  const now = new Date();
  now.setMinutes(now.getMinutes() + 45);
  const hh = String(now.getHours()).padStart(2,'0');
  const mm = String(now.getMinutes()).padStart(2,'0');
  const next = hh + ':' + mm;
  // クリック2回目で空にする(トグル)
  if (State.round.pmStart === next) {
    State.round.pmStart = '';
    showToast('⏰ 後半スタート時間をクリア');
  } else {
    State.round.pmStart = next;
    showToast('⏰ 後半スタート ' + next + ' に更新');
  }
  try { Storage.saveState(); } catch(e) {}
  try { syncLockerPmDisplay(); } catch(e) {}
  v38UpdateDashboard();
  // 既存UI連動
  const pm1 = document.getElementById('v34PmBigTime');
  if (pm1) pm1.textContent = State.round.pmStart || '— : —';
  const pm2 = document.getElementById('v31PmStartInput');
  if (pm2) pm2.value = State.round.pmStart || '';
  const pm3 = document.getElementById('v32MainPmStart');
  if (pm3) pm3.value = State.round.pmStart || '';
}

/* --- ダッシュボード: ロッカー番号(プロンプトで入力) --- */
function v381EditLocker() {
  const cur = State.round.lockerNum || '';
  const v = window.prompt('🔐 ロッカー番号を入力（クリアは空欄でOK）', cur);
  if (v === null) return; // キャンセル
  const clean = (v + '').trim().replace(/[^0-9A-Za-z\-]/g, '').slice(0, 6);
  State.round.lockerNum = clean;
  try { Storage.saveState(); } catch(e) {}
  try { syncLockerPmDisplay(); } catch(e) {}
  v38UpdateDashboard();
  const lk = document.getElementById('v31LockerInput');
  if (lk) lk.value = clean;
  showToast(clean ? '🔐 ロッカー ' + clean : '🔐 ロッカークリア');
}

/* --- ダッシュボード: モード総合切替(ゲーム→ホール→入力 を順にトグル) --- */
function v381CycleMode() {
  // 簡易仕様: 3クリックで gameMode → holesMode → inputMode を順に切替
  // 1回目: gameMode toggle, 2回目: holesMode toggle, 3回目: inputMode rotate
  if (!window._v381ModeStep) window._v381ModeStep = 0;
  const step = window._v381ModeStep % 3;
  window._v381ModeStep++;
  if (step === 0) {
    State.ui.gameMode = (State.ui.gameMode === 'beginner') ? 'standard' : 'beginner';
    showToast('🏌️ ゲーム: ' + (State.ui.gameMode === 'beginner' ? '初心者' : '一般'));
  } else if (step === 1) {
    State.round.holesMode = (State.round.holesMode === '9') ? '18' : '9';
    showToast('🏁 ' + State.round.holesMode + 'H モード');
  } else {
    const order = ['simple','counter','stroke_putt'];
    const cur = V38.inputMode || State.ui.inputMode || 'simple';
    const next = order[(order.indexOf(cur) + 1) % order.length];
    V38.inputMode = next;
    if (next !== 'stroke_putt') State.ui.inputMode = next;
    showToast('⌨ 入力: ' + (next === 'counter' ? 'カウンター' : next === 'stroke_putt' ? '数字+パット' : 'シンプル'));
  }
  try { Storage.saveState(); } catch(e) {}
  try { renderTable(); } catch(e) {}
  try { v32RenderLiveScore(); } catch(e) {}
  try { v32UpdateHolesUI && v32UpdateHolesUI(); } catch(e) {}
  v38UpdateDashboard();
}

/* --- パルスアニメーション付きでカード更新 --- */
function v381PulseCard(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('is-toggling');
  setTimeout(() => el.classList.remove('is-toggling'), 320);
}

/* ============================================================
   v38.1: 同伴者一括登録
   ============================================================ */
function v381OpenBatchAdd() {
  // 入力欄クリア
  for (let i = 1; i <= 3; i++) {
    const ln = document.querySelector('.v381-batch-ln[data-batch-idx="' + i + '"]');
    const fn = document.querySelector('.v381-batch-fn[data-batch-idx="' + i + '"]');
    if (ln) ln.value = '';
    if (fn) fn.value = '';
    const row = document.querySelector('.v381-batch-row[data-batch-idx="' + i + '"]');
    if (row) row.classList.remove('is-filled');
  }
  v381UpdateBatchCount();
  const m = document.getElementById('addModal');
  if (m) m.classList.add('show');
  setTimeout(() => {
    const first = document.querySelector('.v381-batch-ln[data-batch-idx="1"]');
    if (first) first.focus();
  }, 300);
}

function v381UpdateBatchCount() {
  let n = 0;
  for (let i = 1; i <= 3; i++) {
    const ln = document.querySelector('.v381-batch-ln[data-batch-idx="' + i + '"]');
    const row = document.querySelector('.v381-batch-row[data-batch-idx="' + i + '"]');
    if (ln && ln.value.trim()) {
      n++;
      if (row) row.classList.add('is-filled');
    } else if (row) {
      row.classList.remove('is-filled');
    }
  }
  const c = document.getElementById('v381BatchCount');
  if (c) c.textContent = n;
  const sv = document.getElementById('v381BatchSave');
  if (sv) sv.disabled = (n === 0);
  return n;
}

function v381BatchClear() {
  for (let i = 1; i <= 3; i++) {
    const ln = document.querySelector('.v381-batch-ln[data-batch-idx="' + i + '"]');
    const fn = document.querySelector('.v381-batch-fn[data-batch-idx="' + i + '"]');
    if (ln) ln.value = '';
    if (fn) fn.value = '';
  }
  v381UpdateBatchCount();
  showToast('🗑 入力欄をクリア');
}

function v381BatchSave() {
  // 入力された行だけを追加
  const added = [];
  let skipped = 0;
  for (let i = 1; i <= 3; i++) {
    const lnEl = document.querySelector('.v381-batch-ln[data-batch-idx="' + i + '"]');
    const fnEl = document.querySelector('.v381-batch-fn[data-batch-idx="' + i + '"]');
    if (!lnEl) continue;
    const ln = lnEl.value.trim();
    const fn = fnEl ? fnEl.value.trim() : '';
    if (!ln) { skipped++; continue; }
    if (State.players.length >= 16) {
      showToast('最大16名まで', 'error');
      break;
    }
    const newPlayer = {
      id: uuid(),
      lastname: ln,
      firstname: fn,
      isMe: false,
      isProxy: true,
      scores: Array(18).fill(null),
      putts: Array(18).fill(0)
    };
    State.players.push(newPlayer);
    added.push(ln + (fn ? ' ' + fn : ''));
  }
  if (added.length === 0) {
    showToast('⚠ 1名以上の姓を入力してください', 'error');
    return;
  }
  try { Storage.saveState(); } catch(e) {}
  try { closeAllModals(); } catch(e) {}
  try { renderTable(); } catch(e) {}
  try { v31RenderPlayerList && v31RenderPlayerList(); } catch(e) {}
  try { v33SyncMeToPlayer && v33SyncMeToPlayer(); } catch(e) {}
  showToast('✓ ' + added.length + '名を追加: ' + added.join(' / '));
}

/* ============================================================
   v38.1: renderTable の後処理で「自分の行」をマーキング
   ============================================================ */
function v381MarkMyRow() {
  try {
    const tables = document.querySelectorAll('.scoretable');
    tables.forEach(t => {
      t.querySelectorAll('tr').forEach(tr => {
        tr.classList.remove('row-me');
      });
      // td[data-pi="N"] から自分のインデックスを特定
      const meIdx = State.players.findIndex(p => p.isMe);
      if (meIdx < 0) return;
      const meCell = t.querySelector('td[data-pi="' + meIdx + '"]');
      if (meCell && meCell.parentElement) {
        meCell.parentElement.classList.add('row-me');
      }
    });
  } catch(e) {}
}

/* ============================================================
   v38.1 初期化フック
   ============================================================ */
function v381Boot() {
  // ダッシュボード操作化のバインド
  const teeBtn = document.getElementById('v38DashTee');
  if (teeBtn) {
    teeBtn.onclick = (e) => { e.preventDefault(); v381PulseCard('v38DashTee'); v38ToggleTee(); };
  }
  const dispBtn = document.getElementById('v38DashDisp');
  if (dispBtn) {
    dispBtn.onclick = (e) => { e.preventDefault(); v381PulseCard('v38DashDisp'); v38CycleDisplayMode(); };
  }
  // PMカードを button化(divだったので onclick直付け)
  const pmCard = document.querySelector('.v38-dc-pm');
  if (pmCard) {
    pmCard.style.cursor = 'pointer';
    pmCard.setAttribute('role', 'button');
    pmCard.onclick = (e) => { e.preventDefault(); v381TogglePmStart(); };
  }
  // ロッカーカード
  const lkCard = document.querySelector('.v38-dc-locker');
  if (lkCard) {
    lkCard.style.cursor = 'pointer';
    lkCard.setAttribute('role', 'button');
    lkCard.onclick = (e) => { e.preventDefault(); v381EditLocker(); };
  }
  // モードカード
  const mdCard = document.querySelector('.v38-dc-mode');
  if (mdCard) {
    mdCard.style.cursor = 'pointer';
    mdCard.setAttribute('role', 'button');
    mdCard.onclick = (e) => { e.preventDefault(); v381CycleMode(); };
  }

  // 一括登録: openAddCompanion を上書き
  if (typeof window !== 'undefined') {
    window.openAddCompanion = v381OpenBatchAdd;
  }
  // 旧btnAddCompanion クリックも v381OpenBatchAdd へ
  const oldBtn = document.getElementById('btnAddCompanion');
  if (oldBtn) {
    oldBtn.onclick = (e) => { e.preventDefault(); v381OpenBatchAdd(); };
  }
  // 一括登録パネル内のイベント
  const clearBtn = document.getElementById('v381BatchClear');
  if (clearBtn) clearBtn.onclick = v381BatchClear;
  const saveBtn = document.getElementById('v381BatchSave');
  if (saveBtn) saveBtn.onclick = v381BatchSave;
  // 入力欄監視
  document.querySelectorAll('.v381-batch-ln, .v381-batch-fn').forEach(inp => {
    inp.addEventListener('input', v381UpdateBatchCount);
    inp.addEventListener('blur', v381UpdateBatchCount);
  });
  // Enter で次の欄へ
  for (let i = 1; i <= 3; i++) {
    const ln = document.querySelector('.v381-batch-ln[data-batch-idx="' + i + '"]');
    const fn = document.querySelector('.v381-batch-fn[data-batch-idx="' + i + '"]');
    if (ln) ln.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); if (fn) fn.focus(); }
    });
    if (fn) fn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const nextLn = document.querySelector('.v381-batch-ln[data-batch-idx="' + (i+1) + '"]');
        if (nextLn) nextLn.focus();
        else v381BatchSave();
      }
    });
  }

  // 旧btnAddSubmit を一括保存に置換
  const oldSubmit = document.getElementById('btnAddSubmit');
  if (oldSubmit) oldSubmit.onclick = v381BatchSave;

  // renderTable の後にマーキング(MutationObserverで監視)
  const observer = new MutationObserver(() => v381MarkMyRow());
  document.querySelectorAll('.scoretable').forEach(t => {
    observer.observe(t, { childList: true, subtree: true });
  });
  v381MarkMyRow();

  v38UpdateDashboard();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => setTimeout(v381Boot, 250));
} else {
  setTimeout(v381Boot, 250);
}

/* renderTable 終了後の自動マーキング再実行 */
(function v381HookRenderTable() {
  if (typeof window === 'undefined' || !window.renderTable) return;
  const orig = window.renderTable;
  window.renderTable = function() {
    const r = orig.apply(this, arguments);
    try { v381MarkMyRow(); } catch(e) {}
    return r;
  };
})();

console.log('G-WORLD v38.0 最終完全統合版 (レイヤー修正+ノッチ対策+操作ダッシュボード+一括登録)');



/* ============================================================
   v38.2 最終調整: PMスピナー + バインド保険
   既存ロジック(計算/保存)は一切変更しない
   ============================================================ */

/* --- iOS 標準時間スピナーで PM スタートを設定 --- */
function v382OpenPmPicker() {
  const modal = document.getElementById('v382PmPicker');
  const input = document.getElementById('v382PmInput');
  if (!modal || !input) return;

  // 初期値: 既存値があればそれ、なければ「現在時刻 + 45分」
  let initVal = State.round.pmStart || '';
  if (!initVal) {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 45);
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    initVal = hh + ':' + mm;
  }
  input.value = initVal;
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');

  // iOS で即フォーカス → スピナー展開
  setTimeout(() => {
    try {
      input.focus();
      // iOS: click も併用するとスピナーが確実に開く
      if (typeof input.showPicker === 'function') {
        try { input.showPicker(); } catch(e) {}
      } else {
        input.click();
      }
    } catch(e) {}
  }, 80);
}

function v382ClosePmPicker() {
  const modal = document.getElementById('v382PmPicker');
  if (!modal) return;
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
}

function v382SavePmFromPicker(val) {
  const v = (val == null) ? document.getElementById('v382PmInput').value : val;
  const clean = (v || '').trim();
  // 正規表現でHH:MM形式チェック
  if (clean && !/^\d{1,2}:\d{2}$/.test(clean)) {
    showToast('時間形式が不正です(HH:MM)', 'error');
    return;
  }
  State.round.pmStart = clean;
  try { Storage.saveState(); } catch(e) {}
  try { syncLockerPmDisplay && syncLockerPmDisplay(); } catch(e) {}
  // 既存UIすべて同期
  const pm1 = document.getElementById('v34PmBigTime');
  if (pm1) pm1.textContent = clean || '— : —';
  const pm2 = document.getElementById('v31PmStartInput');
  if (pm2) pm2.value = clean || '';
  const pm3 = document.getElementById('v32MainPmStart');
  if (pm3) pm3.value = clean || '';
  try { v38UpdateDashboard(); } catch(e) {}
  v382ClosePmPicker();
  showToast(clean ? '⏰ 後半スタート ' + clean : '⏰ 後半スタートをクリア');
}

/* --- バインド保険: ダッシュボードカード再結線(複数回実行OK) --- */
function v382RewireDashboard() {
  // 既存の onclick を保ちつつ、PMだけ v382OpenPmPicker に上書き
  const pmCard = document.querySelector('.v38-dc-pm');
  if (pmCard) {
    pmCard.style.cursor = 'pointer';
    pmCard.setAttribute('role', 'button');
    pmCard.onclick = (e) => { e.preventDefault(); v382OpenPmPicker(); };
  }
  // ティー/表示モードのバインド保険
  const teeBtn = document.getElementById('v38DashTee');
  if (teeBtn && typeof v38ToggleTee === 'function') {
    teeBtn.onclick = (e) => {
      e.preventDefault();
      try { v381PulseCard && v381PulseCard('v38DashTee'); } catch(_) {}
      v38ToggleTee();
    };
  }
  const dispBtn = document.getElementById('v38DashDisp');
  if (dispBtn && typeof v38CycleDisplayMode === 'function') {
    dispBtn.onclick = (e) => {
      e.preventDefault();
      try { v381PulseCard && v381PulseCard('v38DashDisp'); } catch(_) {}
      v38CycleDisplayMode();
    };
  }
  // ロッカー
  const lkCard = document.querySelector('.v38-dc-locker');
  if (lkCard && typeof v381EditLocker === 'function') {
    lkCard.style.cursor = 'pointer';
    lkCard.setAttribute('role', 'button');
    lkCard.onclick = (e) => { e.preventDefault(); v381EditLocker(); };
  }
  // モード
  const mdCard = document.querySelector('.v38-dc-mode');
  if (mdCard && typeof v381CycleMode === 'function') {
    mdCard.style.cursor = 'pointer';
    mdCard.setAttribute('role', 'button');
    mdCard.onclick = (e) => { e.preventDefault(); v381CycleMode(); };
  }
}

/* --- PMスピナーモーダルのイベント結線 --- */
function v382BindPmPicker() {
  const cancel = document.getElementById('v382PmCancel');
  if (cancel) cancel.onclick = v382ClosePmPicker;
  const save = document.getElementById('v382PmSave');
  if (save) save.onclick = () => v382SavePmFromPicker();
  const now45 = document.getElementById('v382PmNow45');
  if (now45) now45.onclick = () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 45);
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const inp = document.getElementById('v382PmInput');
    if (inp) inp.value = hh + ':' + mm;
  };
  const clr = document.getElementById('v382PmClear');
  if (clr) clr.onclick = () => {
    const inp = document.getElementById('v382PmInput');
    if (inp) inp.value = '';
  };
  // 背景タップで閉じる(カード内部は無効化)
  const bd = document.getElementById('v382PmPicker');
  if (bd) {
    bd.onclick = (e) => {
      if (e.target === bd) v382ClosePmPicker();
    };
  }
}

/* --- 横画面切替時の保険(必要に応じてダッシュボードのインライン display を解除) --- */
function v382HandleOrientation() {
  // CSSメディアクエリで制御するので JS は基本不要。
  // ただし、ボトムシートが横画面で開いている時に画面が変わった際の再配置のみ実行。
  if (V38 && V38.panelOpen) {
    try { v38RenderPanelHead && v38RenderPanelHead(); } catch(e) {}
  }
}

/* --- v38.2 ブート --- */
function v382Boot() {
  v382RewireDashboard();
  v382BindPmPicker();
  // 画面回転検知
  window.addEventListener('orientationchange', () => setTimeout(v382HandleOrientation, 200));
  window.addEventListener('resize', () => {
    // 連打抑制
    if (window._v382ResizeT) clearTimeout(window._v382ResizeT);
    window._v382ResizeT = setTimeout(v382HandleOrientation, 200);
  });
}

/* DOMContentLoaded 後 + boot 完了タイミング後の二重保険 */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => setTimeout(v382Boot, 500));
} else {
  setTimeout(v382Boot, 500);
}
/* さらに、ページ完全読み込み後にも再結線(SafariのFOUT対策) */
window.addEventListener('load', () => setTimeout(v382RewireDashboard, 800));

console.log('G-WORLD v38.0 最終調整 (z-index10000 + 横画面FS + iOS時間スピナー)');



/* ============================================================
   v38.0 ラウンド準備画面: スコア表示モードトグル結線
   既存の v38CycleDisplayMode と同じロジックを共有
   ============================================================ */
function v38PrepRenderDispToggle() {
  const cur = (State && State.ui && State.ui.displayMode) || 'number';
  const wrap = document.getElementById('v38PrepDispToggle');
  if (!wrap) return;
  wrap.querySelectorAll('button').forEach(b => {
    if (b.dataset.disp === cur) b.classList.add('active');
    else b.classList.remove('active');
  });
}

function v38PrepBindDispToggle() {
  const wrap = document.getElementById('v38PrepDispToggle');
  if (!wrap) return;
  wrap.querySelectorAll('button').forEach(b => {
    b.onclick = (e) => {
      e.preventDefault();
      const m = b.dataset.disp;
      if (!m) return;
      State.ui.displayMode = m;
      try { Storage.saveState(); } catch(_) {}
      try { renderTable(); } catch(_) {}
      try { v38UpdateDashboard && v38UpdateDashboard(); } catch(_) {}
      v38PrepRenderDispToggle();
      const labels = { number: '数字', diff: 'スコア差', symbol: '記号' };
      showToast('🔢 ' + labels[m] + 'に切替');
    };
  });
  v38PrepRenderDispToggle();
}

/* renderTable / v38CycleDisplayMode の後に同期するためのフック */
(function v38PrepHookDispSync() {
  if (typeof window === 'undefined') return;
  if (window.v38CycleDisplayMode) {
    const orig = window.v38CycleDisplayMode;
    window.v38CycleDisplayMode = function() {
      const r = orig.apply(this, arguments);
      try { v38PrepRenderDispToggle(); } catch(_) {}
      return r;
    };
  }
})();

/* DOM 準備後に結線 */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => setTimeout(v38PrepBindDispToggle, 600));
} else {
  setTimeout(v38PrepBindDispToggle, 600);
}
window.addEventListener('load', () => setTimeout(v38PrepBindDispToggle, 900));

console.log('G-WORLD v38.0 ラウンド準備画面 配置整理版');

/* ============================================================
   v41 / v41.1: 入力パネル #v38InputPanel レイアウト結線
   ============================================================ */
(function(){
  if (window.__V41_BOUND__) return;
  window.__V41_BOUND__ = true;
  const $ = (id) => document.getElementById(id);
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function safeFullName(p) {
    try { if (typeof fullName === 'function') return fullName(p); } catch(_) {}
    return ((p && (p.lastName||'')) + (p && (p.firstName||''))) || 'ゲスト';
  }
  function curHole() { try { return (typeof V38 !== 'undefined' && V38) ? V38.hi : ((modalHole || 1) - 1); } catch(_) { return 0; } }
  function curPi()   { try { return (typeof V38 !== 'undefined' && V38) ? V38.pi : (modalPlayerIdx || 0); } catch(_) { return 0; } }
  function holeObj() { try { return COURSE.holes[curHole()] || {}; } catch(_) { return {}; } }

  function pickYards(h) {
    if (!h) return null;
    try {
      const tee = (State && State.round && State.round.tee) || ((State && State.ui && State.ui.useLadiesTee) ? 'LADIES' : 'REG');
      const teeKeys = [tee, 'REG', 'WHT', 'WHITE', 'BLU', 'BLUE', 'BLK', 'BLACK', 'LADIES', 'RED', 'YEL', 'YELLOW', 'GRN', 'GREEN'];
      if (h.yards && typeof h.yards === 'object') {
        for (const k of teeKeys) {
          const v = h.yards[k];
          if (typeof v === 'number' && v > 0) return v;
          if (typeof v === 'string' && v.trim() && !isNaN(parseInt(v, 10))) return parseInt(v, 10);
        }
        for (const k in h.yards) {
          const v = h.yards[k];
          if (typeof v === 'number' && v > 0) return v;
          if (typeof v === 'string' && v.trim() && !isNaN(parseInt(v, 10))) return parseInt(v, 10);
        }
      }
      const flat = [h.yardage, h.yard, h.distance, h.regYard, h.ladiesYard];
      for (const v of flat) {
        if (typeof v === 'number' && v > 0) return v;
        if (typeof v === 'string' && v.trim() && !isNaN(parseInt(v, 10))) return parseInt(v, 10);
      }
    } catch(_) {}
    return null;
  }

  const V41_RESTROOM_HOLES = [3, 5, 8, 12, 14, 17];
  function hasRestroom(n) { return V41_RESTROOM_HOLES.indexOf(n) >= 0; }

  function renderHoleBar() {
    const hi = curHole();
    const h  = holeObj();
    try { const e = $('v38PanelHole'); if (e) e.textContent = (hi + 1) + 'H'; } catch(_) {}
    try { const e = $('v38PanelPar');  if (e) e.textContent = 'PAR ' + (h && h.par != null ? h.par : '—'); } catch(_) {}
    try {
      const y = pickYards(h);
      const e = $('v41HoleYards');
      if (e) e.textContent = (y != null && y !== '' && !isNaN(parseInt(y, 10))) ? String(y) : '—';
    } catch(_) {}
    try {
      const e = $('v41HoleRestroom');
      if (e) e.classList.toggle('is-hidden', !hasRestroom(hi + 1));
    } catch(_) {}
    try {
      const maxH = (State && State.round && State.round.holesMode === '9') ? 9
                 : (COURSE && COURSE.holes ? COURSE.holes.length : 18);
      const p = $('v38PanelPrevHole'); if (p) p.disabled = (hi <= 0);
      const n = $('v38PanelNextHole'); if (n) n.disabled = (hi >= maxH - 1);
    } catch(_) {}
  }

  function renderPlayerGrid() {
    const g = $('v41PlayerGrid'); if (!g) return;
    const hi = curHole();
    const activeIdx = curPi();
    let players = [];
    try { players = (State.players || []).slice(); } catch(_) {}
    try { players.sort((a,b) => (a.isMe === b.isMe) ? 0 : (a.isMe ? -1 : 1)); } catch(_) {}
    let html = '';
    for (let col = 0; col < 4; col++) {
      const p = players[col];
      const realIdx = p ? State.players.indexOf(p) : -1;
      const isActive = (realIdx === activeIdx);
      const isEmpty  = !p;
      const colCls = 'v41-pg-col' + (isActive ? ' is-active' : '') + (isEmpty ? ' is-empty' : '');
      const name = isEmpty ? '名前未設定' : safeFullName(p);
      const sub  = isEmpty ? '' : (p.isMe ? 'PLAYER ME' : 'PLAYER ' + (col + 1));
      const score = (p && p.scores && p.scores[hi] != null) ? p.scores[hi] : null;
      html += '<div class="' + colCls + '" data-pi="' + realIdx + '">';
      html +=   '<div class="v41-pg-cell v41-pg-name" data-pi="' + realIdx + '">';
      html +=     '<div>' + esc(name) + '</div>';
      if (sub) html += '<div class="v41-pg-name-sub">' + sub + '</div>';
      html +=   '</div>';
      const ec = (score == null) ? ' is-empty' : '';
      html +=   '<div class="v41-pg-cell v41-pg-score' + ec + '" data-pi="' + realIdx + '">';
      html +=     (score == null ? '–' : esc(score));
      html +=   '</div>';
      html += '</div>';
    }
    g.innerHTML = html;
  }

  function syncTabs() {
    try {
      const tabs = $('v38PanelModeTabs'); if (!tabs) return;
      let mode = 'simple';
      try { if (State && State.ui && State.ui.inputMode) mode = State.ui.inputMode; } catch(_) {}
      tabs.querySelectorAll('.v38-pmt-btn').forEach((b) => {
        b.classList.toggle('is-active', (b.dataset && b.dataset.pmode === mode));
      });
    } catch(_) {}
  }

  function v41Refresh() {
    try { renderHoleBar(); }    catch(e) { console.warn('[v41] hb', e); }
    try { renderPlayerGrid(); } catch(e) { console.warn('[v41] pg', e); }
    try { syncTabs(); }         catch(_) {}
  }
  window.v41Refresh = v41Refresh;

  function autoAdvance() {
    try {
      const hi = curHole();
      const players = State.players || [];
      if (players.length === 0) return;
      const allDone = players.every(p => p.scores[hi] != null && p.scores[hi] > 0);
      if (allDone) {
        const maxH = (State.round.holesMode === '9') ? 9 : COURSE.holes.length;
        if (hi + 1 < maxH) {
          if (typeof v38PanelMoveHole === 'function') v38PanelMoveHole(+1);
          else if (typeof v38OpenInputPanel === 'function') v38OpenInputPanel(curPi(), hi + 1);
        } else { try { showToast('🏁 最終ホールまで入力完了'); } catch(_) {} }
        return;
      }
      const pi = curPi();
      for (let off = 1; off <= players.length; off++) {
        const i = (pi + off) % players.length;
        const pp = players[i];
        if (!pp.scores[hi] || pp.scores[hi] <= 0) {
          if (typeof v38OpenInputPanel === 'function') v38OpenInputPanel(i, hi);
          return;
        }
      }
    } catch(e) { console.warn('[v41] autoAdvance', e); }
  }

  try {
    const origFB = (typeof v38AfterInputFeedback === 'function') ? v38AfterInputFeedback : null;
    window.v38AfterInputFeedback = function() {
      try { if (origFB) origFB.apply(this, arguments); } catch(e) { console.warn('[v41] origFB', e); }
      try { v41Refresh(); } catch(_) {}
      if (window.__V41_HL_LOCK__) return;
      try {
        const p = State.players[curPi()];
        if (p && p.scores[curHole()] != null && p.scores[curHole()] > 0) {
          const mode = (State.ui && State.ui.inputMode) || 'simple';
          if (mode !== 'counter') setTimeout(autoAdvance, 180);
        }
      } catch(_) {}
    };
  } catch(_) {}

  try {
    const origOpen = (typeof v38OpenInputPanel === 'function') ? v38OpenInputPanel : null;
    if (origOpen) {
      window.v38OpenInputPanel = function(pi, hi) {
        try { origOpen(pi, hi); } catch(e) { console.warn('[v41] origOpen', e); }
        setTimeout(v41Refresh, 30);
      };
    }
  } catch(_) {}

  function bindAll() {
    const g = $('v41PlayerGrid');
    if (g && !g.dataset.v41Bound) {
      g.dataset.v41Bound = '1';
      g.addEventListener('click', (e) => {
        const cell = e.target.closest('[data-pi]');
        if (!cell || !g.contains(cell)) return;
        const pi = parseInt(cell.dataset.pi, 10);
        if (isNaN(pi) || pi < 0) return;
        e.preventDefault(); e.stopPropagation();
        try { if (typeof v38OpenInputPanel === 'function') v38OpenInputPanel(pi, curHole()); }
        catch(err) { console.warn('[v41] selPlayer', err); }
      });
    }
    const cf = $('v41ConfirmBtn');
    if (cf && !cf.dataset.v41Bound) {
      cf.dataset.v41Bound = '1';
      cf.addEventListener('click', (e) => {
        e.preventDefault();
        if (cf.dataset.busy === '1') return;
        cf.dataset.busy = '1';
        setTimeout(() => { cf.dataset.busy = '0'; }, 200);
        try {
          const hi = curHole();
          const players = (State && State.players) || [];
          const allDone = players.length > 0 && players.every(p => p.scores[hi] != null && p.scores[hi] > 0);
          if (allDone) { if (typeof v38PanelMoveHole === 'function') v38PanelMoveHole(+1); }
          else { autoAdvance(); }
        } catch(err) { console.warn('[v41] cf', err); }
      });
    }
    const tabs = $('v38PanelModeTabs');
    if (tabs && !tabs.dataset.v41Bound) {
      tabs.dataset.v41Bound = '1';
      tabs.addEventListener('click', (e) => {
        const btn = e.target.closest('.v38-pmt-btn');
        if (!btn || !tabs.contains(btn)) return;
        let lockedPi = 0, lockedHi = 0;
        try { lockedPi = curPi();  } catch(_) {}
        try { lockedHi = curHole(); } catch(_) {}
        window.__V41_HL_LOCK__ = true;
        setTimeout(() => {
          try {
            if (typeof V38 !== 'undefined' && V38) { V38.pi = lockedPi; V38.hi = lockedHi; }
            try { modalPlayerIdx = lockedPi; modalHole = lockedHi + 1; } catch(_) {}
            try { if (typeof v32SetActiveCell === 'function')      v32SetActiveCell(lockedPi, lockedHi); } catch(_) {}
            try { if (typeof v32ApplyCrossHighlight === 'function') v32ApplyCrossHighlight(); } catch(_) {}
          } catch(_) {}
          try { syncTabs(); } catch(_) {}
          try { v41Refresh(); } catch(_) {}
          window.__V41_HL_LOCK__ = false;
        }, 20);
        setTimeout(() => { try { syncTabs(); } catch(_) {} },  60);
        setTimeout(() => { try { syncTabs(); } catch(_) {} }, 150);
      }, true);
    }
    try {
      const panel = $('v38InputPanel');
      if (panel && !panel.dataset.v41ObsBound) {
        panel.dataset.v41ObsBound = '1';
        const mo = new MutationObserver((muts) => {
          for (const m of muts) {
            if (m.attributeName === 'class' && panel.classList.contains('is-open')) {
              setTimeout(() => { try { v41Refresh(); } catch(_) {} }, 30);
              setTimeout(() => { try { syncTabs();   } catch(_) {} }, 50);
            }
          }
        });
        mo.observe(panel, { attributes: true, attributeFilter: ['class'] });
      }
    } catch(_) {}
    setTimeout(() => { try { v41Refresh(); } catch(_) {} }, 100);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindAll);
  else bindAll();
  window.addEventListener('load', () => setTimeout(() => { try { v41Refresh(); } catch(_) {} }, 300));
  console.log('[v41.1] input panel bound');
})();

/* v43: 最下部ナビゲーションバー IIFE は物理削除済み */

/* ============================================================
   v46: スコア入力モーダル ダッシュボード 6ボタン結線
   - 使用T  : v43DirectToggleTee（REG/LADIES ダイレクトトグル）
   - スコア表示: v38CycleDisplayMode（number/diff/symbol）
   - ホール数: State.round.holesMode を 18⇄9 トグル、ラウンド準備画面と同期
   - ロッカー: prompt で編集、準備画面の #v31LockerInput と双方同期
   - 入力人数: State.ui.gameMode を standard⇄beginner トグル
   - 後半スタート: 既存 v382OpenPmPicker を起動
   スコア保存/GAS連携には一切触れず、State 更新と UI 同期のみ
   ============================================================ */
(function(){
  if (window.__V46_DASH_BOUND__) return;
  window.__V46_DASH_BOUND__ = true;

  const $ = (id) => document.getElementById(id);

  function safePersist() {
    try { if (typeof Storage !== 'undefined' && Storage && Storage.saveState) Storage.saveState(); } catch(_) {}
    try { if (typeof Storage !== 'undefined' && Storage && Storage.saveSettings) Storage.saveSettings(); } catch(_) {}
  }
  function safeRender() {
    try { if (typeof renderTopAndHero === 'function') renderTopAndHero(); } catch(_) {}
    try { if (typeof renderTable === 'function') renderTable(); } catch(_) {}
    try { if (typeof v38UpdateDashboard === 'function') v38UpdateDashboard(); } catch(_) {}
    try { if (typeof v41Refresh === 'function') v41Refresh(); } catch(_) {}
    try { v46Refresh(); } catch(_) {}
  }
  function safeToast(msg) { try { if (typeof showToast === 'function') showToast(msg); } catch(_) {} }

  /* ===== v46 ボタンの表示値を State と同期 ===== */
  function v46Refresh() {
    try {
      const tee = (State && State.ui && State.ui.useLadiesTee) ? 'LADIES' : 'REG';
      const e = $('v46TeeVal'); if (e) e.textContent = tee;
    } catch(_) {}
    try {
      const disp = (State && State.ui && State.ui.displayMode) || 'number';
      const lbl = disp === 'symbol' ? '記号' : (disp === 'diff' ? '±差分' : '数字');
      const e = $('v46DispVal'); if (e) e.textContent = lbl;
    } catch(_) {}
    try {
      const h = (State && State.round && State.round.holesMode === '9') ? '9H' : '18H';
      const e = $('v46HolesVal'); if (e) e.textContent = h;
    } catch(_) {}
    try {
      const lk = (State && State.round && State.round.lockerNum != null) ? String(State.round.lockerNum).trim() : '';
      const e = $('v46LockerVal'); if (e) e.textContent = lk || '—';
    } catch(_) {}
    try {
      const isBeg = (State && State.ui && State.ui.gameMode === 'beginner');
      const e = $('v46GameVal'); if (e) e.textContent = isBeg ? '1人' : '4人';
    } catch(_) {}
    try {
      const pm = (State && State.round && State.round.pmStart) ? State.round.pmStart : '— : —';
      const e = $('v46PmVal'); if (e) e.textContent = pm;
    } catch(_) {}
  }
  window.v46Refresh = v46Refresh;

  /* 既存 v38UpdateDashboard ラップ: 呼ばれるたび v46 も同期 */
  try {
    const origUD = (typeof v38UpdateDashboard === 'function') ? v38UpdateDashboard : null;
    if (origUD) {
      window.v38UpdateDashboard = function() {
        let r;
        try { r = origUD.apply(this, arguments); } catch(e) { console.warn('[v46] orig UD', e); }
        try { v46Refresh(); } catch(_) {}
        return r;
      };
    }
  } catch(_) {}

  /* ===== 使用T （REG/LADIESトグル） ===== */
  function bindTee() {
    const b = $('v46BtnTee'); if (!b || b.dataset.v46Bound === '1') return;
    b.dataset.v46Bound = '1';
    b.addEventListener('click', (e) => {
      e.preventDefault();
      try {
        if (typeof v43DirectToggleTee === 'function') v43DirectToggleTee();
        else if (typeof v38ToggleTee === 'function') v38ToggleTee();
      } catch(err) { console.warn('[v46] tee', err); }
      v46Refresh();
    });
  }

  /* ===== スコア表示（3段階サイクル） ===== */
  function bindDisp() {
    const b = $('v46BtnDisp'); if (!b || b.dataset.v46Bound === '1') return;
    b.dataset.v46Bound = '1';
    b.addEventListener('click', (e) => {
      e.preventDefault();
      try {
        if (typeof v38CycleDisplayMode === 'function') v38CycleDisplayMode();
      } catch(err) { console.warn('[v46] disp', err); }
      v46Refresh();
    });
  }

  /* ===== ホール数 18H⇄9H ===== */
  function bindHoles() {
    const b = $('v46BtnHoles'); if (!b || b.dataset.v46Bound === '1') return;
    b.dataset.v46Bound = '1';
    b.addEventListener('click', (e) => {
      e.preventDefault();
      try {
        if (!State.round) State.round = {};
        const cur = (State.round.holesMode === '9') ? '9' : '18';
        const next = (cur === '9') ? '18' : '9';
        State.round.holesMode = next;
        /* 準備画面の #v32HolesToggle とも同期 */
        try {
          document.querySelectorAll('#v32HolesToggle button').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.holes === next);
          });
        } catch(_) {}
        /* body class も同期（既存 9Hロック UI トリガー） */
        try { document.body.classList.toggle('v32-holes-9', next === '9'); } catch(_) {}
        safePersist();
        safeRender();
        safeToast(next === '9' ? '🏁 9H ハーフラウンド' : '🏁 18H フルラウンド');
      } catch(err) { console.warn('[v46] holes', err); }
    });
  }

  /* ===== ロッカー番号 prompt 編集 ===== */
  function bindLocker() {
    const b = $('v46BtnLocker'); if (!b || b.dataset.v46Bound === '1') return;
    b.dataset.v46Bound = '1';
    b.addEventListener('click', (e) => {
      e.preventDefault();
      try {
        if (!State.round) State.round = {};
        const cur = State.round.lockerNum != null ? String(State.round.lockerNum) : '';
        const input = window.prompt('🔐 ロッカー番号を入力（6桁以内）', cur);
        if (input == null) return;
        const v = String(input).replace(/[^0-9A-Za-z\-]/g, '').slice(0, 6);
        State.round.lockerNum = v;
        /* 準備画面の #v31LockerInput と同期 */
        try {
          const lk = $('v31LockerInput');
          if (lk) {
            lk.value = v;
            lk.dispatchEvent(new Event('input', { bubbles: true }));
            lk.dispatchEvent(new Event('change', { bubbles: true }));
          }
        } catch(_) {}
        safePersist();
        safeRender();
        safeToast(v ? ('🔐 ロッカー ' + v) : '🔐 ロッカークリア');
      } catch(err) { console.warn('[v46] locker', err); }
    });
  }

  /* ===== 入力人数 4人⇄1人（standard ⇄ beginner） ===== */
  function bindGame() {
    const b = $('v46BtnGame'); if (!b || b.dataset.v46Bound === '1') return;
    b.dataset.v46Bound = '1';
    b.addEventListener('click', (e) => {
      e.preventDefault();
      try {
        if (!State.ui) State.ui = {};
        const next = (State.ui.gameMode === 'beginner') ? 'standard' : 'beginner';
        State.ui.gameMode = next;
        try { document.body.classList.toggle('v31-mode-beginner', next === 'beginner'); } catch(_) {}
        /* 準備画面の #v31ModeToggle と同期 */
        try {
          document.querySelectorAll('#v31ModeToggle button').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.gmode === next);
          });
        } catch(_) {}
        safePersist();
        safeRender();
        safeToast(next === 'beginner' ? '🔰 1人入力モード' : '🏌️ 4人入力モード');
      } catch(err) { console.warn('[v46] game', err); }
    });
  }

  /* ===== 後半スタート時間 — 既存 v382OpenPmPicker ===== */
  function bindPm() {
    const b = $('v46BtnPm'); if (!b || b.dataset.v46Bound === '1') return;
    b.dataset.v46Bound = '1';
    b.addEventListener('click', (e) => {
      e.preventDefault();
      try {
        if (typeof v382OpenPmPicker === 'function') {
          v382OpenPmPicker();
        } else {
          /* フォールバック: ネイティブ prompt */
          const cur = (State.round && State.round.pmStart) ? State.round.pmStart : '';
          const input = window.prompt('⏰ 後半スタート時間（HH:MM）', cur);
          if (input == null) return;
          State.round.pmStart = String(input).slice(0, 5);
          safePersist();
        }
      } catch(err) { console.warn('[v46] pm', err); }
      setTimeout(safeRender, 50);
    });
  }

  function bindAll() {
    bindTee();
    bindDisp();
    bindHoles();
    bindLocker();
    bindGame();
    bindPm();
    v46Refresh();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindAll);
  } else {
    bindAll();
  }
  window.addEventListener('load', () => setTimeout(bindAll, 200));
  setTimeout(bindAll, 500);
  setTimeout(bindAll, 1200);

  /* モーダル表示検知でもバインド・描画 */
  try {
    const sm = document.getElementById('scoreModal');
    if (sm) {
      const mo = new MutationObserver(() => { bindAll(); });
      mo.observe(sm, { attributes: true, attributeFilter: ['class'] });
    }
  } catch(_) {}

  /* 準備画面のロッカー入力を v46 ボタンへ同期させる */
  try {
    const lk = document.getElementById('v31LockerInput');
    if (lk) {
      ['input', 'change', 'blur'].forEach(ev => {
        lk.addEventListener(ev, () => v46Refresh());
      });
    }
  } catch(_) {}

  console.log('[v46] score-modal dashboard 3x2 bound');
})();

/* ============================================================
   v44: 数字パッドモードタブクリック時のアクティブセル同期修正
   - タブを押した瞬間、v35ActivePi/Hi を現在の V38.pi/V38.hi に値を上書きして
     「直前ボタン位置でフリーズ」を防ぐ
   - スコア保存・パネル描画ロジックとも無干渉、document capture レベルのリスナーのみ
   - v35HighlightActiveCell はほぼノーオプになる（v44.2 ハイライト無効化で見た目未変化）
   ============================================================ */
(function(){
  if (window.__V44_TAB_SYNC_BOUND__) return;
  window.__V44_TAB_SYNC_BOUND__ = true;

  function syncActiveCellToCurrent() {
    try {
      let pi = -1, hi = -1;
      if (typeof V38 !== 'undefined' && V38) {
        if (typeof V38.pi === 'number') pi = V38.pi;
        if (typeof V38.hi === 'number') hi = V38.hi;
      }
      if (pi < 0) {
        try { if (typeof modalPlayerIdx === 'number') pi = modalPlayerIdx; } catch(_) {}
      }
      if (hi < 0) {
        try { if (typeof modalHole === 'number') hi = modalHole - 1; } catch(_) {}
      }
      if (pi < 0 || hi < 0) return;
      try { v35ActivePi = pi; v35ActiveHi = hi; } catch(_) {}
      try { if (typeof v32SetActiveCell === 'function') v32SetActiveCell(pi, hi); } catch(_) {}
      try { if (typeof v35HighlightActiveCell === 'function') v35HighlightActiveCell(); } catch(_) {}
    } catch(_) {}
  }

  /* document capture でモードタブクリックを上位で捕捉 */
  document.addEventListener('click', (e) => {
    try {
      const tabs = document.getElementById('v38PanelModeTabs');
      if (!tabs) return;
      const btn = e.target.closest('.v38-pmt-btn');
      if (!btn || !tabs.contains(btn)) return;
      /* 既存ハンドラが走ったあと、複数タイミングで同期 */
      syncActiveCellToCurrent();
      setTimeout(syncActiveCellToCurrent,  30);
      setTimeout(syncActiveCellToCurrent,  80);
      setTimeout(syncActiveCellToCurrent, 180);
    } catch(_) {}
  }, true);

  /* パネルが開いたときも同期（初期タイミング保険）*/
  try {
    const panel = document.getElementById('v38InputPanel');
    if (panel) {
      const mo = new MutationObserver((muts) => {
        for (const m of muts) {
          if (m.attributeName === 'class' && panel.classList.contains('is-open')) {
            setTimeout(syncActiveCellToCurrent, 40);
            setTimeout(syncActiveCellToCurrent, 120);
          }
        }
      });
      mo.observe(panel, { attributes: true, attributeFilter: ['class'] });
    }
  } catch(_) {}

  /* 既存 v38RenderPanelBody を安全にラップして描画後も同期 */
  try {
    const orig = (typeof v38RenderPanelBody === 'function') ? v38RenderPanelBody : null;
    if (orig) {
      window.v38RenderPanelBody = function() {
        let r;
        try { r = orig.apply(this, arguments); } catch(e) { console.warn('[v44] orig RenderPanelBody', e); }
        try { setTimeout(syncActiveCellToCurrent, 10); } catch(_) {}
        return r;
      };
    }
  } catch(_) {}

  console.log('[v44] active-cell sync on mode tab click bound');
})();

/* ============================================================
   v43: スコア入力モーダル COT ボタン (#v38DashTee) の単独トグル修理
   - 「入力設定」の使用ティ項目と連動しない
   - タップでダイレクトに REG ⇄ LADIES を切替
   - 既存 .onclick バインドを全て置換し、他スクリプトによる上書きを防ぐ
   - 委譲型 保険ボタンも document レベルで付与し、ID 不在でもクラス一致で拾う
   - スコア保存・GAS連携等他のロジックには一切触れない
   ============================================================ */
(function(){
  if (window.__V43_TEE_BOUND__) return;
  window.__V43_TEE_BOUND__ = true;

  /* ダイレクトトグル — 安全に State.ui.useLadiesTee を反転し、UIを全面同期 */
  function v43DirectToggleTee() {
    try {
      /* 連打拒否（同一フレーム内の2重発火防止）*/
      const now = Date.now();
      if (window.__V43_TEE_LAST__ && now - window.__V43_TEE_LAST__ < 250) return;
      window.__V43_TEE_LAST__ = now;

      if (!State || !State.ui) {
        try { showToast('⚠ ティー状態未初期化'); } catch(_) {}
        return;
      }
      State.ui.useLadiesTee = !State.ui.useLadiesTee;

      /* 永続化 */
      try { if (Storage && Storage.saveState) Storage.saveState(); } catch(_) {}
      try { if (Storage && Storage.saveSettings) Storage.saveSettings(); } catch(_) {}

      /* 表示同期 — 現存する関数のみ安全に呼ぶ */
      try { if (typeof renderTopAndHero === 'function')   renderTopAndHero(); } catch(_) {}
      try { if (typeof renderTable === 'function')        renderTable(); } catch(_) {}
      try { if (typeof v32RenderLiveScore === 'function') v32RenderLiveScore(); } catch(_) {}
      try { if (typeof v38UpdateDashboard === 'function') v38UpdateDashboard(); } catch(_) {}
      try { if (typeof v41Refresh === 'function')         v41Refresh(); } catch(_) {}

      /* ラウンド準備画面のティーグリッド (#v31TeeSegments) を同期 */
      try {
        const segs = document.getElementById('v31TeeSegments');
        if (segs) {
          const target = State.ui.useLadiesTee ? 'ladies' : 'reg';
          segs.querySelectorAll('button[data-tee]').forEach(b => {
            b.classList.toggle('active', b.dataset.tee === target);
          });
        }
      } catch(_) {}

      /* 聖域の旧ラベルも同期 */
      try {
        const lbl = document.getElementById('teeToggleLabel');
        if (lbl) lbl.textContent = State.ui.useLadiesTee ? 'LADIES' : 'REGティ';
      } catch(_) {}

      /* トースト */
      try {
        showToast(State.ui.useLadiesTee ? '⛳ LADIES TEE に切替' : '⛳ REG TEE に切替');
      } catch(_) {}

      /* パルスエフェクト */
      try { if (typeof v381PulseCard === 'function') v381PulseCard('v38DashTee'); } catch(_) {}
    } catch(err) {
      console.warn('[v43] toggleTee failed', err);
    }
  }
  window.v43DirectToggleTee = v43DirectToggleTee;

  /* 既存の v38ToggleTee も v43 ロジックを利用するようレットラップ（追従処理を豊富化） */
  try {
    const orig = (typeof v38ToggleTee === 'function') ? v38ToggleTee : null;
    if (orig) {
      window.v38ToggleTee = function() {
        /* orig を使わず v43 だけを使う（連動ダブルトグルを防ぐ） */
        return v43DirectToggleTee();
      };
    } else {
      window.v38ToggleTee = v43DirectToggleTee;
    }
  } catch(_) {}

  /* ボタンへのバインド — 複数メソッドで保険 */
  function bindTeeButton() {
    try {
      const teeBtn = document.getElementById('v38DashTee');
      if (teeBtn && teeBtn.dataset.v43Bound !== '1') {
        teeBtn.dataset.v43Bound = '1';
        /* 既存 .onclick を v43 で上書き（他スクリプトによるリバインドより後で走る） */
        teeBtn.onclick = (e) => {
          try { e.preventDefault(); } catch(_) {}
          try { e.stopPropagation(); } catch(_) {}
          v43DirectToggleTee();
          return false;
        };
      }
    } catch(_) {}
  }

  /* document レベルの保険委譲（capture） — ID/クラス一致の両方で拾う */
  document.addEventListener('click', (e) => {
    try {
      const target = e.target.closest('#v38DashTee, .v38-dc-tee');
      if (!target) return;
      /* onclick で処理済みの場合は実行しない（v43Bound 設定後は onclick が走る） */
      if (target.dataset && target.dataset.v43Bound === '1') return;
      e.preventDefault();
      e.stopPropagation();
      v43DirectToggleTee();
    } catch(_) {}
  }, true);

  /* DOM 準備タイミングに関わらず何度もバインド試行 */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindTeeButton);
  } else {
    bindTeeButton();
  }
  window.addEventListener('load', () => setTimeout(bindTeeButton, 100));
  setTimeout(bindTeeButton, 300);
  setTimeout(bindTeeButton, 800);
  setTimeout(bindTeeButton, 1500);

  /* モーダル表示検知でもバインド（モーダルが遅延挑入の場合に備え） */
  try {
    const sm = document.getElementById('scoreModal');
    if (sm) {
      const mo = new MutationObserver(() => bindTeeButton());
      mo.observe(sm, { attributes: true, attributeFilter: ['class'] });
    }
  } catch(_) {}

  console.log('[v43] COT direct-toggle bound (#v38DashTee)');
})();