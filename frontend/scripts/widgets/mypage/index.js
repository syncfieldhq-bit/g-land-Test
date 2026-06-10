/******************************************************************
 * G-WORLD - MyPage Widget
 *
 * 設計意図【設計憲法・第7条】：
 *   - 「データ保全のご案内」を主役にしつつ、押し付けない
 *   - 利用回数・状態を可視化（信頼感の演出）
 *   - PWAインストール案内をここに集約
 *   - "認証" "ログイン" の文言は一切使わない
 ******************************************************************/
(function () {
  'use strict';

  var MyPage = GW.Widgets.extend({
    __widgetName__: 'MyPage',

    /** Router からのエントリポイント */
    render: function () {
      this._renderProfile();
      this._renderState();
      this._renderUsage();
    },

    /** プロフィール部分（アバター・名前・ID） */
    _renderProfile: function () {
      var prof = GW.Core.Auth.getProfile();
      var name = prof.nickname || prof.realName || 'ゲスト';
      var initial = name.charAt(0).toUpperCase();

      var avatarEl = document.getElementById('gw-my-avatar');
      if (avatarEl) avatarEl.textContent = initial;

      var nameEl = document.getElementById('gw-my-name');
      if (nameEl) nameEl.textContent = name;

      var idEl = document.getElementById('gw-my-id');
      if (idEl) idEl.textContent = GW.Core.Auth.getUserId() || '';
    },

    /** データ保全状態を描画 */
    _renderState: function () {
      var isGuest = GW.Core.Auth.isGuest();

      // バッジ
      var stateEl = document.getElementById('gw-my-state');
      if (stateEl) {
        if (isGuest) {
          stateEl.textContent = 'ゲストモード';
          stateEl.className = 'gw-state-badge guest';
        } else {
          stateEl.textContent = '✓ データ保全済み';
          stateEl.className = 'gw-state-badge backed-up';
        }
      }

      // バックアップカードの表示制御
      var card = document.getElementById('gw-my-backup-card');
      var msgEl = document.getElementById('gw-my-backup-msg');
      var btnEl = document.getElementById('gw-my-backup-btn');
      if (!card || !msgEl || !btnEl) return;

      if (isGuest) {
        msgEl.innerHTML =
          '現在<b style="color:var(--gold-bri);">ゲストモード</b>です。' +
          'スコア・履歴はこの端末にのみ保存されています。<br>' +
          '無料でアカウント連携すると、機種変更時もデータを引き継げます。';
        btnEl.textContent = '📲 無料でデータを守る';
        btnEl.style.display = '';
      } else {
        msgEl.innerHTML =
          '✅ <b style="color:#5cd65c;">データ保全済み</b><br>' +
          '機種変更時も自動的にデータを引き継ぐことができます。安心してご利用ください。';
        btnEl.style.display = 'none';
      }
    },

    /** 利用状況を描画 */
    _renderUsage: function () {
      var countEl = document.getElementById('gw-my-use-count');
      if (countEl) countEl.textContent = GW.Core.Auth.getUseCount() + ' 回';

      var lastActive = Number(GW.Core.Storage.get(GW.Core.Config.KEYS.LAST_ACTIVE, '0'));
      var lastEl = document.getElementById('gw-my-last');
      if (lastEl) {
        if (lastActive > 0) {
          var d = new Date(lastActive);
          var s = d.getFullYear() + '/' +
                  String(d.getMonth() + 1).padStart(2, '0') + '/' +
                  String(d.getDate()).padStart(2, '0') + ' ' +
                  String(d.getHours()).padStart(2, '0') + ':' +
                  String(d.getMinutes()).padStart(2, '0');
          lastEl.textContent = s;
        } else {
          lastEl.textContent = '-';
        }
      }
    },

    /** データ保全モーダルを開く（マイページのボタン or 節目で自動表示） */
    openBackupModal: function () {
      GW.Core.UI.showModal('gw-modal-backup');
    },

    /** PWAインストール案内モーダルを表示 */
    showPWAGuide: function () {
      // 既にスタンドアロン起動中なら不要
      var isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                         window.navigator.standalone === true;
      if (isStandalone) {
        GW.Core.UI.toast('✅ 既にホーム画面から起動中です');
        return;
      }

      // OS別の手順を表示
      var ua = navigator.userAgent || '';
      var androidEl = document.getElementById('gw-pwa-android');
      var iosEl     = document.getElementById('gw-pwa-ios');
      var otherEl   = document.getElementById('gw-pwa-other');

      // いったん全て隠す
      if (androidEl) androidEl.classList.add('gw-hidden');
      if (iosEl)     iosEl.classList.add('gw-hidden');
      if (otherEl)   otherEl.classList.add('gw-hidden');

      if (/Android/i.test(ua)) {
        if (androidEl) androidEl.classList.remove('gw-hidden');
      } else if (/iPhone|iPad|iPod/i.test(ua)) {
        if (iosEl) iosEl.classList.remove('gw-hidden');
      } else {
        if (otherEl) otherEl.classList.remove('gw-hidden');
      }

      GW.Core.UI.showModal('gw-modal-pwa');
    },

    /** PWAインストールを実行（Android） */
    triggerPWAInstall: function () {
      var st = GW.Core.State || {};
      if (st.pwaPrompt) {
        st.pwaPrompt.prompt();
        st.pwaPrompt.userChoice.then(function () {
          st.pwaPrompt = null;
          GW.Core.UI.hideModal('gw-modal-pwa');
        });
      } else {
        GW.Core.UI.toast('ブラウザのメニューから「ホーム画面に追加」を選んでください');
      }
    }
  });

  GW.Core.WidgetRegistry.register('MyPage', MyPage);
})();
