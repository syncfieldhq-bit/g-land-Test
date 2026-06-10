/******************************************************************
 * G-WORLD Frontend - Action Bus
 *
 * 【SECTION 9】GW.Core.Action - data-action 集中処理（CSP対応）
 *
 * 設計意図：
 *   - HTML の onclick="..." を全廃し、button[data-action="xxx"] で統一
 *   - body にひとつイベントリスナを登録して伝播で処理（軽量）
 *   - 将来のCSP(Content Security Policy)強化にも対応できる
 ******************************************************************/
(function () {
  'use strict';

  GW.Core.Action = {
    /** ハンドラ辞書（モジュール側から登録） */
    _handlers: {},

    /** ハンドラを登録 */
    register: function (action, handler) {
      this._handlers[action] = handler;
    },

    /** 複数ハンドラを一括登録 */
    registerMany: function (map) {
      var self = this;
      Object.keys(map).forEach(function (k) { self._handlers[k] = map[k]; });
    },

    /** body全体に1つだけリスナを設置（起動時に1回呼ぶ） */
    bind: function () {
      var self = this;
      document.body.addEventListener('click', function (e) {
        // data-action を持つ最も近い要素を探す
        var el = e.target;
        while (el && el !== document.body) {
          if (el.getAttribute && el.getAttribute('data-action')) {
            var action = el.getAttribute('data-action');
            var handler = self._handlers[action];
            if (handler) {
              e.preventDefault();
              try { handler(el, e); } catch (err) {
                console.error('[GW.Action] handler error:', action, err);
              }
              return;
            }
          }
          // data-no-close="1" のついた要素まで来たら、外側の click も抑制
          if (el.getAttribute && el.getAttribute('data-no-close') === '1') {
            e.stopPropagation();
            return;
          }
          el = el.parentNode;
        }
      });

      // ── フッターナビは data-route で処理 ──
      var navBtns = document.querySelectorAll('.gw-footer-nav button[data-route]');
      for (var i = 0; i < navBtns.length; i++) {
        navBtns[i].addEventListener('click', function (e) {
          var route = this.getAttribute('data-route');
          GW.Core.UI.haptic();
          GW.Core.Router.go(route);
        });
      }

      // ── ポータル内のモジュールカードも data-route で処理 ──
      var portalCards = document.querySelectorAll('.gw-portal-module[data-route]');
      for (var j = 0; j < portalCards.length; j++) {
        portalCards[j].addEventListener('click', function (e) {
          var route = this.getAttribute('data-route');
          GW.Core.UI.haptic();
          GW.Core.Router.go(route);
        });
      }

      // ── 共通アクション（Coreで完結するもの）の登録 ──
      this.registerMany({
        // 確認モーダル
        'confirm-ok':     function () { GW.Core.UI._execConfirm(); },
        'confirm-cancel': function () { GW.Core.UI._closeConfirm(); },

        // データ保全モーダル
        'open-backup-modal':    function () { GW.Modules.MyPage.openBackupModal(); },
        'dismiss-backup-modal': function () {
          GW.Core.Auth.dismissBackupPrompt();
          GW.Core.UI.hideModal('gw-modal-backup');
        },
        'link-backup': function () {
          // 初期実装：UI上の流れだけ示し、サーバ連携は将来
          GW.Core.UI.hideModal('gw-modal-backup');
          GW.Core.UI.toast('🚧 連携機能は次期リリースで利用可能になります');
        },

        // PWAモーダル
        'show-pwa-guide':  function () { GW.Modules.MyPage.showPWAGuide(); },
        'close-pwa-modal': function () { GW.Core.UI.hideModal('gw-modal-pwa'); },
        'pwa-install':    function () { GW.Modules.MyPage.triggerPWAInstall(); },

        // 起動エラー閉じる
        'close-startup-error': function () {
          var el = document.getElementById('gw-startup-error');
          if (el) el.remove();
        },

        // ログアウト（マイページから）
        'logout': function () {
          GW.Core.UI.confirm(
            'プレイヤーリセット',
            '現在のプレイヤー情報をクリアして、別のプレイヤーで使用を開始します。\n\n※バックアップ済みの場合、再連携で復元可能です。',
            function () {
              GW.Core.Auth.reset();
              location.reload();
            }
          );
        }
      });
    }
  };
})();
