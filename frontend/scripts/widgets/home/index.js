/******************************************************************
 * G-WORLD - Home (Portal) Widget
 *
 * 設計意図：
 *   - 挨拶 + ユーザー名 + 状態バッジ
 *   - 「ラウンドを開始」CTAボタン → G-LAND遷移
 *   - 4モジュール（G-LAND/G-COMPETE/G-TOWN/マイページ）への導線カード
 *   - 最近のラウンド一覧（履歴から最新数件を取得）
 ******************************************************************/
(function () {
  'use strict';

  var Home = GW.Widgets.extend({
    __widgetName__: 'Home',

    /** Router からのエントリポイント */
    render: function () {
      this._renderGreeting();
      this._renderRecent();
    },

    /** 挨拶とユーザー名・状態バッジを描画 */
    _renderGreeting: function () {
      var nowHour = new Date().getHours();
      var greet;
      if (nowHour < 5)       greet = 'おはようございます';
      else if (nowHour < 11) greet = 'おはようございます';
      else if (nowHour < 17) greet = 'こんにちは';
      else                   greet = 'こんばんは';

      var msgEl = document.getElementById('gw-greet-msg');
      if (msgEl) msgEl.textContent = greet;

      // プロフィール名（あれば表示、無ければ「ゲストさん」）
      var prof = GW.Core.Auth.getProfile();
      var name = prof.nickname || prof.realName || 'ゲスト';
      var nameEl = document.getElementById('gw-greet-name');
      if (nameEl) nameEl.textContent = name + 'さん';

      // 状態バッジ
      var stateEl = document.getElementById('gw-state-badge');
      if (stateEl) {
        if (GW.Core.Auth.isGuest()) {
          stateEl.textContent = 'ゲストモード';
          stateEl.className = 'gw-state-badge guest';
        } else {
          stateEl.textContent = '✓ データ保全済み';
          stateEl.className = 'gw-state-badge backed-up';
        }
      }
    },

    /** 最近のラウンド3件を表示（履歴APIから取得） */
    _renderRecent: function () {
      var listEl = document.getElementById('gw-portal-recent-list');
      if (!listEl) return;

      // プレイヤー未登録 or 仮IDなら省略
      var player = GW.Core.Storage.getJSON(GW.Core.Config.KEYS.PLAYER);
      if (!player || !player.playerId ||
          String(player.playerId).indexOf('P_TMP_') === 0) {
        listEl.innerHTML = '<div style="color:var(--text-sub);font-size:13px;">' +
                           'まだラウンド記録がありません</div>';
        return;
      }

      var esc = GW.Core.UI.escapeHtml;
      GW.Core.Api.call('gland.getHistoryList', {
        playerId: player.playerId,
        gwUserId: GW.Core.Auth.getUserId(),
        period:   'recent10',
        courseId: ''
      }).then(function (res) {
        if (!res || !res.ok || !res.list || !res.list.length) {
          listEl.innerHTML = '<div style="color:var(--text-sub);font-size:13px;">' +
                             'まだラウンド記録がありません</div>';
          return;
        }
        // 最大3件
        var top3 = res.list.slice(0, 3);
        var html = top3.map(function (h) {
          var vsPar = h.vsPar === 0 ? 'E' : (h.vsPar > 0 ? '+' + h.vsPar : String(h.vsPar));
          return '<div style="display:flex;justify-content:space-between;align-items:center;' +
                 'padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.08);">' +
                   '<div>' +
                     '<div style="font-size:13px;font-weight:700;color:var(--gold-bri);">' +
                       esc(h.playDate) + '</div>' +
                     '<div style="font-size:11px;color:var(--text-sub);">' +
                       esc(h.courseName) + ' / ' + h.playedHoles + 'H</div>' +
                   '</div>' +
                   '<div style="font-size:18px;font-weight:900;color:#fff;">' +
                     h.totalStroke +
                     '<span style="font-size:11px;color:var(--text-sub);margin-left:4px;">(' +
                     vsPar + ')</span>' +
                   '</div>' +
                 '</div>';
        }).join('');
        listEl.innerHTML = html;
      }).catch(function () {
        listEl.innerHTML = '<div style="color:var(--text-sub);font-size:13px;">' +
                           '読み込みエラー</div>';
      });
    }
  });

  // ── レジストリへ登録 ──
  GW.Core.WidgetRegistry.register('Home', Home);
})();
