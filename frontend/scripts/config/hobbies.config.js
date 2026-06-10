/******************************************************************
 * G-WORLD - Hobbies Configuration
 *
 * 【趣味のOS】の中枢設定ファイル。
 *
 * ここに1行追加し、widgets/{key}/index.js を作るだけで、
 * 新しい趣味モジュールが G-World に登場する。
 *
 * 【プロパティ】
 *   key     - Router の route 名 / GW.Modules のキー
 *   label   - 表示名
 *   icon    - アイコン絵文字（将来 SVG パスに差し替え）
 *   screen  - 対応する <section id> （index.html に存在すること）
 *   active  - true: 通常遷移 / false: Coming Soon トースト表示
 *   order   - ポータル表示順
 ******************************************************************/
(function () {
  'use strict';

  GW.Core.Hobbies = [
    {
      key:    'gland',
      label:  'G-LAND',
      desc:   'スコア管理',
      icon:   '⛳',
      screen: 'gw-screen-gland',
      active: true,
      order:  10
    },
    {
      key:    'gcompete',
      label:  'G-COMPETE',
      desc:   'コンペ運営',
      icon:   '🏆',
      screen: 'gw-screen-gcompete',
      active: false, // Coming Soon
      order:  20
    },
    {
      key:    'gtown',
      label:  'G-TOWN',
      desc:   '地域とつながる',
      icon:   '🏘',
      screen: 'gw-screen-gtown',
      active: false, // Coming Soon
      order:  30
    },
    {
     key: 'igo', 
     label: 'G-IGO', 
     desc: '囲碁の棋譜',
     icon: '⚫', 
     screen: 'gw-screen-igo', 
     active: true, 
     order: 40
    }

    // ── 将来の趣味追加例（コメントアウトのまま保持） ──
    // {
    //   key:    'igo',
    //   label:  'G-IGO',
    //   desc:   '囲碁の棋譜・対局',
    //   icon:   '⚫',
    //   screen: 'gw-screen-igo',
    //   active: false,
    //   order:  40
    // },
    // {
    //   key:    'mountain',
    //   label:  'G-MOUNTAIN',
    //   desc:   '登山の記録',
    //   icon:   '⛰',
    //   screen: 'gw-screen-mountain',
    //   active: false,
    //   order:  50
    // },
    // {
    //   key:    'travel',
    //   label:  'G-TRAVEL',
    //   desc:   '旅行の記憶',
    //   icon:   '✈',
    //   screen: 'gw-screen-travel',
    //   active: false,
    //   order:  60
    // }
  ];
})();
