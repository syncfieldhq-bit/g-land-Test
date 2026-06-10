/******************************************************************
 * G-WORLD Golf Widget - Courses Configuration
 *
 * ゴルフコースの宣言的定義。
 * 新コース追加はこのオブジェクトに1エントリ追加するだけで完結する。
 *
 * 【プロパティ】
 *   key      - コース識別子（HTML の data-course-id と一致）
 *   name     - 表示名
 *   variants - 選択可能なバリアント配列（"9H" / "18H" / "OUT" / "IN" 等）
 ******************************************************************/
(function () {
  'use strict';

  // GW.Widgets.Golf 名前空間を確立
  GW.Widgets.Golf = GW.Widgets.Golf || {};

  GW.Widgets.Golf.Courses = {
    'rokko-international': {
      key:      'rokko-international',
      name:     '六甲国際パブリック',
      variants: ['9H', '18H']
    },
    'rokko-west': {
      key:      'rokko-west',
      name:     '西コース',
      variants: ['OUT', 'IN']
    },
    'rokko-east': {
      key:      'rokko-east',
      name:     '東コース',
      variants: ['OUT', 'IN']
    }
  };
})();
