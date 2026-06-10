/******************************************************************
 * G-WORLD - G-TOWN Widget (Coming Soon プレースホルダ)
 ******************************************************************/
(function () {
  'use strict';

  var GTown = GW.Widgets.extend({
    __widgetName__: 'GTown',
    render: function () {
      // 静的画面のためレンダリング不要
    }
  });

  GW.Core.WidgetRegistry.register('GTown', GTown);
})();
