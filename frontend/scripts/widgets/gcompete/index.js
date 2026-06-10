/******************************************************************
 * G-WORLD - G-COMPETE Widget (Coming Soon プレースホルダ)
 *
 * 設計意図：
 *   - Router.routes.gcompete.active = false のため、本来ここは呼ばれない
 *   - 万一フッターナビ以外から遷移が来た場合の保険として実装
 ******************************************************************/
(function () {
  'use strict';

  var GCompete = GW.Widgets.extend({
    __widgetName__: 'GCompete',
    render: function () {
      // 静的画面のためレンダリング不要
    }
  });

  GW.Core.WidgetRegistry.register('GCompete', GCompete);
})();
