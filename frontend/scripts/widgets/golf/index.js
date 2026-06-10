/******************************************************************
 * G-WORLD - Golf Widget Entry
 *
 * GolfWidget / GolfScore / GolfMates / GolfHistory を結合し、
 * GW.Modules.GLand として WidgetRegistry に登録する。
 *
 * 【読込順序】
 *   1. courses.config.js  (定数)
 *   2. GolfWidget.js      (本体 + state)
 *   3. GolfScore.js
 *   4. GolfMates.js
 *   5. GolfHistory.js
 *   6. index.js           ← 本ファイル（最後に必ず読む）
 ******************************************************************/
(function () {
  'use strict';

  var Golf = GW.Widgets.Golf;
  if (!Golf || !Golf.Widget) {
    console.error('[GW.Golf] Widget not loaded. Check script order.');
    return;
  }

  // ── サブモジュールを Widget 本体に結線 ──
  Golf.Widget.Score   = Golf.Score;
  Golf.Widget.Mates   = Golf.Mates;
  Golf.Widget.History = Golf.History;

  // ── Router 互換のため、サブモジュールは内部参照も維持 ──
  //   旧コードが GW.Modules.GLand.Score のように直接アクセスしていたパターンを救う
  Golf.Widget.state = Golf.state;

  // ── レジストリへ登録（Router の 'GLand' から呼ばれる） ──
  GW.Core.WidgetRegistry.register('GLand', Golf.Widget);

  // ── Router.go() 拡張：G-LAND 以外へ遷移時に Mates ポーリングを停止 ──
  var origGo = GW.Core.Router.go;
  GW.Core.Router.go = function (route, params) {
    if (route !== 'gland' && Golf.Mates) {
      Golf.Mates.stopPolling();
    }
    return origGo.call(this, route, params);
  };

  console.log('[GW.Golf] integrated:', {
    widget:  !!Golf.Widget,
    score:   !!Golf.Score,
    mates:   !!Golf.Mates,
    history: !!Golf.History,
    courses: Object.keys(Golf.Courses || {}).length
  });
})();
