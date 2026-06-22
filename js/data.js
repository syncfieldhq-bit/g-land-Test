<script>
/* =============================================================
 * G-WORLD v70 — data_js : コース定数 / QR / 差分更新ヘルパ
 * ============================================================= */

window.COURSE = {
  name:'六甲国際パブリックコース', nameEn:'Rokko Kokusai Public Course',
  zip:'〒651-1263', address:'神戸市北区山田町西下字押部道16-1',
  tel:'078-583-0351', fax:'078-583-0355',
  url:'http://www.rok-pc.com',
  par:72, regYard:6047, regRating:68.2, ladiesYard:5067, ladiesRating:64.8,
  /* holes 配列 : index = no - 1, 必ず no と一致 */
  holes:[
    {no:1, par:4,regYard:352,ladiesYard:321,hdcp:11,wc:false},
    {no:2, par:4,regYard:352,ladiesYard:344,hdcp:9, wc:false},
    {no:3, par:4,regYard:263,ladiesYard:247,hdcp:13,wc:true},
    {no:4, par:5,regYard:469,ladiesYard:410,hdcp:5, wc:false},
    {no:5, par:4,regYard:358,ladiesYard:343,hdcp:7, wc:true},
    {no:6, par:3,regYard:154,ladiesYard:118,hdcp:17,wc:false},
    {no:7, par:5,regYard:455,ladiesYard:338,hdcp:3, wc:false},
    {no:8, par:3,regYard:158,ladiesYard:100,hdcp:15,wc:true},
    {no:9, par:4,regYard:414,ladiesYard:350,hdcp:1, wc:false},
    {no:10,par:4,regYard:375,ladiesYard:321,hdcp:10,wc:false},
    {no:11,par:4,regYard:390,ladiesYard:322,hdcp:2, wc:false},
    {no:12,par:4,regYard:289,ladiesYard:247,hdcp:14,wc:true},
    {no:13,par:5,regYard:502,ladiesYard:447,hdcp:4, wc:false},
    {no:14,par:4,regYard:343,ladiesYard:246,hdcp:12,wc:true},
    {no:15,par:3,regYard:140,ladiesYard:118,hdcp:18,wc:false},
    {no:16,par:5,regYard:483,ladiesYard:363,hdcp:6, wc:false},
    {no:17,par:3,regYard:180,ladiesYard:135,hdcp:16,wc:true},
    {no:18,par:4,regYard:370,ladiesYard:297,hdcp:8, wc:false}
  ]
};

window.getHoleByNo = function(no){
  const n = Number(no);
  if (!n || n < 1 || n > 18) return null;
  const h = COURSE.holes[n - 1];
  if (!h || h.no !== n) {
    return COURSE.holes.find(function(x){ return x.no === n; }) || null;
  }
  return h;
};

window.LOCAL_RULES = [
  {
    num: 1, title: '境界',
    items: [
      'イ. アウトオブバウンズ(OB)の境界は白杭、又は赤白杭で標示する。',
      'ロ. 修理地は青杭、又は白線でその限界を標示する。',
      'ハ. ラテラル・ウォーターハザードの限界は赤杭で標示する。'
    ]
  },
  { num: 2, text: '下記の物件は動かせない障害物とする。撒水栓・排水路・カートの軌条及び支柱・樹木の支柱・U字排水溝・舗装道路（舗装道路に接した排水溝は一体の障害物とする）。' },
  { num: 3, text: '全ホールに於いて第1打がOB又はロストボールの場合は、前方の特設ティーよりプレーイング4を以ってプレーしなければならない。' },
  { num: 4, text: '球が電線に触れたときは、そのストロークを取消し、罰なしに打直さなければならない。' },
  { num: 5, text: 'ローカル・ルールの追加、又は訂正は随時掲示し、掲示の日からその効力を発生する。' }
];
window.LOCAL_RULES_HEADER = '本ルールに適応なき事項は全てJGAのゴルフ規則による。';
window.OTHER_NOTES = [
  'ハーフ 2時間10分以内でプレーしましょう。',
  'ボールマーク・バンカーは各自で直しましょう。',
  '場内での負傷・紛失・盗難等の事故は当事者の責任となります。',
  '利用約款規則に従ってプレーすること。',
  '⭐ 避難小屋(W.C)：3H, 5H, 8H, 12H, 14H, 17H 付近に設置。'
];

window.getDiffSymbol = function(score, par){
  if (score == null) return '';
  const d = score - par;
  if (d <= -3) return '★';
  if (d === -2) return '◎';
  if (d === -1) return '◯';
  if (d === 0)  return '―';
  if (d === 1)  return '△';
  if (d === 2)  return '□';
  return '+' + d;
};
window.getYard = function(hole, tee){
  if (!hole) return 0;
  return tee === 'ladies' ? hole.ladiesYard : hole.regYard;
};

/* ============================================================
 * QR 描画 : <img> を一度だけ生成し、src 差分更新で全消去回避
 * ============================================================ */
window.GWQR = {
  render: function(el, text, size){
    size = size || 200;
    if (!el) return;
    const newSrc = 'https://api.qrserver.com/v1/create-qr-code/?size=' +
                   size + 'x' + size + '&margin=0&data=' + encodeURIComponent(text);
    let img = el.querySelector('img');
    if (!img) {
      img = document.createElement('img');
      img.alt = 'QR';
      img.referrerPolicy = 'no-referrer';
      img.decoding = 'async';
      img.loading  = 'lazy';
      el.appendChild(img);
    }
    img.width  = size;
    img.height = size;
    if (img.dataset.src !== newSrc) {     /* 差分検出 */
      img.dataset.src = newSrc;
      img.src = newSrc;
    }
  }
};

/* ============================================================
 * 軽量 DOM 差分ユーティリティ
 *   - 同じ値ならば touch しない (リフロー抑制)
 * ============================================================ */
window.GWDom = {
  setText: function(el, v){
    if (!el) return;
    const s = (v == null) ? '' : String(v);
    if (el.textContent !== s) el.textContent = s;
  },
  setHTML: function(el, html){
    if (!el) return;
    if (el.innerHTML !== html) el.innerHTML = html;
  },
  setClass: function(el, cls, on){
    if (!el) return;
    if (el.classList.contains(cls) !== !!on) el.classList.toggle(cls, !!on);
  },
  setAttr: function(el, k, v){
    if (!el) return;
    if (el.getAttribute(k) !== String(v)) el.setAttribute(k, v);
  },
  setValue: function(el, v){
    if (!el) return;
    const s = (v == null) ? '' : String(v);
    if (document.activeElement === el) return;     /* 入力中は触らない */
    if (el.value !== s) el.value = s;
  }
};

window.escapeHtml = function(s){
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
};
</script>
