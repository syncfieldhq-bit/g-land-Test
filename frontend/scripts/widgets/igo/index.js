(function () {
  'use strict';
  var Igo = GW.Widgets.extend({
    __widgetName__: 'Igo',
    render: function () {
      console.log('Igo widget rendered');
      // ここに囲碁固有のロジックを書く
    }
  });
  GW.Core.WidgetRegistry.register('Igo', Igo);
})();
