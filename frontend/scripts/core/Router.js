/******************************************************************
 * G-WORLD Frontend - Router
 *
 * 【SECTION 8】GW.Core.Router - 画面遷移・フッターナビ制御
 *
 * 設計意図【設計憲法・第3条】：
 *   - 5つの画面 (home/gland/gcompete/gtown/mypage) を排他的に切替
 *   - フッターナビ button[data-route] とセクション #gw-screen-{route} の対応
 *   - G-COMPETE / G-TOWN は Coming Soon トースト表示で即帰還
 *   - ハッシュ (#home / #gland 等) でディープリンク対応（PWA共有時用）
 ******************************************************************/
(function () {
  'use strict';

  GW.Core.Router = {
    /** 現在のルート名 */
    current: 'home',

    /** ルート定義（モジュールへのマッピング） */
    routes: {
      home:     { screen: 'gw-screen-home',     module: 'Home',     active: true },
      gland:    { screen: 'gw-screen-gland',    module: 'GLand',    active: true },
      gcompete: { screen: 'gw-screen-gcompete', module: 'GCompete', active: false }, // プレースホルダ
      gtown:    { screen: 'gw-screen-gtown',    module: 'GTown',    active: false }, // プレースホルダ
      mypage:   { screen: 'gw-screen-mypage',   module: 'MyPage',   active: true }
    },

    /**
     * 画面遷移
     *   @param {string} route - ルート名
     *   @param {Object} [params] - モジュールに渡すパラメータ（任意）
     */
    go: function (route, params) {
      var def = this.routes[route];
      if (!def) {
        console.warn('[GW.Router] unknown route:', route);
        return;
      }

      // ── Coming Soon モジュール（G-COMPETE / G-TOWN）はトースト表示のみ ──
      if (!def.active) {
        var labels = { gcompete: 'G-COMPETE', gtown: 'G-TOWN' };
        GW.Core.UI.toast('🔔 ' + (labels[route] || route) + ' は近日公開予定です');
        // フッターナビの見た目だけ一瞬反映するが、すぐに元に戻す
        this._highlightNav(route);
        var self = this;
        setTimeout(function () { self._highlightNav(self.current); }, 800);
        return;
      }

      // ── 通常遷移 ──
      // 全画面を非表示
      var keys = Object.keys(this.routes);
      for (var i = 0; i < keys.length; i++) {
        var s = document.getElementById(this.routes[keys[i]].screen);
        if (s) s.classList.remove('active');
      }
      // 対象画面を表示
      var target = document.getElementById(def.screen);
      if (target) target.classList.add('active');

      // フッターナビのハイライト
      this._highlightNav(route);

      // 現在ルートを更新
      this.current = route;

      // URLハッシュも更新（リロード時に同じ画面に戻れるように）
      try {
        if (location.hash !== '#' + route) {
          history.replaceState(null, '', '#' + route);
        }
      } catch (e) {}

      // ── モジュール側の init/render を呼び出す ──
      var modName = def.module;
      var mod = GW.Modules[modName];
      if (mod && typeof mod.render === 'function') {
        try {
          mod.render(params || {});
        } catch (e) {
          console.error('[GW.Router] module render error:', modName, e);
        }
      }

      // FABはG-LANDスコア入力時のみ表示
      var fab = document.getElementById('gw-fab-jump');
      if (fab) {
        var shouldShow = (route === 'gland' && GW.Modules.GLand && GW.Modules.GLand.isInRound && GW.Modules.GLand.isInRound());
        fab.classList.toggle('gw-hidden', !shouldShow);
      }
    },

    /** フッターナビのactive表示を更新 */
    _highlightNav: function (route) {
      var btns = document.querySelectorAll('.gw-footer-nav button[data-route]');
      for (var i = 0; i < btns.length; i++) {
        btns[i].classList.toggle('active', btns[i].getAttribute('data-route') === route);
      }
    },

    /** URLハッシュ・パラメータからルートを決定 */
    resolveInitial: function () {
      try {
        var hash = (location.hash || '').replace(/^#/, '');
        if (hash && this.routes[hash]) return hash;
      } catch (e) {}
      return 'home';
    }
  };
})();
