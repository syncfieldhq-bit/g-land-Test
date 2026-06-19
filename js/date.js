/* =================================================================
   G-LAND data.js - コースデータ・ローカルルール
   ================================================================= */

const COURSE = {
  name: '六甲国際パブリックコース',
  nameEn: 'Rokko Kokusai Public Course',
  zip: '〒651-1263',
  address: '神戸市北区山田町西下字押部道16-1',
  tel: '078-583-0351',
  fax: '078-583-0355',
  url: 'http://www.rok-pc.com',
  par: 72,
  regYard: 6047,
  regRating: 68.2,
  ladiesYard: 5067,
  ladiesRating: 64.8,
  teeColors: {
    out: { reg: '白マーク', ladies: '赤マーク' },
    in:  { reg: '黄マーク', ladies: '緑マーク' }
  },
  holes: [
    { no: 1,  par: 4, regYard: 352, ladiesYard: 321, hdcp: 11, wc: false },
    { no: 2,  par: 4, regYard: 352, ladiesYard: 344, hdcp: 9,  wc: false },
    { no: 3,  par: 4, regYard: 263, ladiesYard: 247, hdcp: 13, wc: true  },
    { no: 4,  par: 5, regYard: 469, ladiesYard: 410, hdcp: 5,  wc: false },
    { no: 5,  par: 4, regYard: 358, ladiesYard: 343, hdcp: 7,  wc: true  },
    { no: 6,  par: 3, regYard: 154, ladiesYard: 118, hdcp: 17, wc: false },
    { no: 7,  par: 5, regYard: 455, ladiesYard: 338, hdcp: 3,  wc: false },
    { no: 8,  par: 3, regYard: 158, ladiesYard: 100, hdcp: 15, wc: true  },
    { no: 9,  par: 4, regYard: 414, ladiesYard: 350, hdcp: 1,  wc: false },
    { no: 10, par: 4, regYard: 375, ladiesYard: 321, hdcp: 10, wc: false },
    { no: 11, par: 4, regYard: 390, ladiesYard: 322, hdcp: 2,  wc: false },
    { no: 12, par: 4, regYard: 289, ladiesYard: 247, hdcp: 14, wc: true  },
    { no: 13, par: 5, regYard: 502, ladiesYard: 447, hdcp: 4,  wc: false },
    { no: 14, par: 4, regYard: 343, ladiesYard: 246, hdcp: 12, wc: true  },
    { no: 15, par: 3, regYard: 140, ladiesYard: 118, hdcp: 18, wc: false },
    { no: 16, par: 5, regYard: 483, ladiesYard: 363, hdcp: 6,  wc: false },
    { no: 17, par: 3, regYard: 180, ladiesYard: 135, hdcp: 16, wc: true  },
    { no: 18, par: 4, regYard: 370, ladiesYard: 297, hdcp: 8,  wc: false }
  ]
};

const LOCAL_RULES_HEADER = '本ルールに適応なき事項は全てJGAのゴルフ規則による';

const LOCAL_RULES = [
  {
    num: 1,
    title: '境界',
    subItems: [
      { sub: 'イ.', text: 'アウトオブバウンズ（OB）の境界は白杭、又は赤白杭で標示する。' },
      { sub: 'ロ.', text: '修理地は青杭、又は白線でその限界を標示する。' },
      { sub: 'ハ.', text: 'ラテラル・ウォーターハザードの限界は赤杭で標示する。' }
    ]
  },
  {
    num: 2,
    title: null,
    text: '下記の物件は動かせない障害物とする。撒水栓・排水路・カートの軌条及び支柱・樹木の支柱・U字排水溝・舗装道路（舗装道路に接した排水溝は一体の障害物とする）。'
  },
  {
    num: 3,
    title: null,
    text: '全ホールに於いて第1打がOB又はロストボールの場合は、前方の特設ティーよりプレーイング4を以ってプレーしなければならない。'
  },
  {
    num: 4,
    title: null,
    text: '球が電線に触れたときは、そのストロークを取消し、罰なしに打直さなければならない。'
  },
  {
    num: 5,
    title: null,
    text: 'ローカル・ルールの追加、又は訂正は随時掲示し、掲示の日からその効力を発生する。'
  }
];

const DIFF_SYMBOL_MAP = {
  '-3': '★',
  '-2': '◎',
  '-1': '◯',
   '0': '―',
   '1': '△',
   '2': '□'
};

function getDiffSymbol(score, par) {
  if (score == null) return '';
  const d = score - par;
  if (d <= -3) return '★';
  if (d >= 3) return '+' + d;
  return DIFF_SYMBOL_MAP[String(d)] || String(d);
}