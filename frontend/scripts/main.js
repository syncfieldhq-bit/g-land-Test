/******************************************************************
 * G-WORLD Frontend - Main Entry Point (Bootstrap)
 *
 * 【SECTION 11+12】GW.bootstrap - アプリ全体の起動シーケンス & グローバルイベント
 *
 * 起動順序：
 *   1) Service Worker 登録（バックグラウンドで進行）
 *   2) Auth 初期化（GW_USER_ID 取得 / 利用回数+1）
 *   3) Action ハンドラ登録（イベント受付開始）
 *   4) キャッシュからの即時起動 STAGE1
 *   5) Router で初期画面表示
 *   6) バックグラウンドでサーバから最新boot bundle取得 STAGE2
 *   7) 必要なら「データ保全のご案内」モーダル表示
 *
 * 【重要】本ファイルは Core 層 / Modules 層が読み込まれた後、
 *         最後に読み込まれる。DOMContentLoaded を待って起動する。
 ******************************************************************/
(function () {
  'use strict';

  GW.bootstrap = function () {
    var bootStart = Date.now();
    console.log('[GW] bootstrap start, version:', GW.Core.Config.APP_VERSION);

    // 1) Service Worker 登録（非同期で進む）
    GW.Core.SW.register();

    // 2) Auth 初期化
    var authState = GW.Core.Auth.boot();
    console.log('[GW] auth state:', authState);

    // 3) Action ハンドラ登録
    GW.Core.Action.bind();

    // 4) STAGE 1: キャッシュから即時起動を試みる
    GW.Core.UI.setBootText('キャッシュを確認中...');
    var cached = GW.Core.Cache.loadBoot();
    if (cached && cached.courses && cached.courses.length > 0) {
      console.log('[GW] STAGE 1: instant boot from cache');
      _applyBootBundle(cached);

      // 起動オーバーレイを即非表示
      GW.Core.UI.hideBoot();

      // 5) 初期画面に遷移
      var initialRoute = GW.Core.Router.resolveInitial();
      GW.Core.Router.go(initialRoute);

      console.log('[GW] ⚡ instant boot complete in ' + (Date.now() - bootStart) + 'ms');

      // 6) バックグラウンドで最新データ取得
      setTimeout(_refreshBootInBackground, 100);

      // 7) 必要ならデータ保全モーダル
      setTimeout(_maybeShowBackupPrompt, 3000);
      return;
    }

    // ── キャッシュが無い場合：サーバから取得 ──
    GW.Core.UI.setBootText('サーバーへ接続中...');

    // 25秒タイムアウト保険
    var overallTimer = setTimeout(function () {
      GW.Core.UI.showStartupError(
        'サーバー応答が遅すぎます',
        '25秒以内に初期化が完了しませんでした'
      );
      GW.Core.UI.hideBoot();
    }, 25000);

    // 5秒経過しても完了しない場合、スキップボタンを表示
    setTimeout(function () {
      var btn = document.getElementById('gw-boot-cancel');
      if (btn) {
        btn.style.display = 'inline-block';
        btn.addEventListener('click', function () {
          clearTimeout(overallTimer);
          GW.Core.UI.hideBoot();
          GW.Core.Router.go('home');
        });
      }
    }, 5000);

    GW.Core.Api.call('gland.boot', {})
      .then(function (res) {
        clearTimeout(overallTimer);
        if (!res || !res.ok) {
          GW.Core.UI.showStartupError(
            (res && res.error) || 'コース情報を取得できませんでした',
            (res && res.detail) || ''
          );
        } else {
          GW.Core.Cache.saveBoot(res);
          _applyBootBundle(res);
        }
        GW.Core.UI.hideBoot();
        var route = GW.Core.Router.resolveInitial();
        GW.Core.Router.go(route);
        console.log('[GW] boot complete in ' + (Date.now() - bootStart) + 'ms');

        setTimeout(_maybeShowBackupPrompt, 2500);
      })
      .catch(function (err) {
        clearTimeout(overallTimer);
        console.error('[GW] boot failed:', err);
        GW.Core.UI.showStartupError(
          'サーバーに接続できませんでした',
          String(err.message || err)
        );
        GW.Core.UI.hideBoot();
        // それでも UI は最低限見せる
        GW.Core.Router.go('home');
      });
  };

  /** boot bundle をアプリ状態に反映 */
  function _applyBootBundle(bundle) {
    GW.Core.State = GW.Core.State || {};
    GW.Core.State.courses        = bundle.courses        || [];
    GW.Core.State.activeCourseId = bundle.activeCourseId || (bundle.courses[0] && bundle.courses[0].id) || '';
    var active = GW.Core.State.courses.find(function (c) { return c.id === GW.Core.State.activeCourseId; })
              || GW.Core.State.courses[0];
    GW.Core.State.pars = active ? active.pars : new Array(18).fill(4);
  }

  /** バックグラウンドで最新データを取得（STAGE 2） */
  function _refreshBootInBackground() {
    GW.Core.Api.call('gland.boot', {})
      .then(function (res) {
        if (res && res.ok) {
          var changed = JSON.stringify(res.courses) !==
                        JSON.stringify(GW.Core.State.courses);
          GW.Core.Cache.saveBoot(res);
          _applyBootBundle(res);
          if (changed) {
            // データに変化があれば現在画面を再描画
            console.log('[GW] background refresh: data changed, re-rendering');
            GW.Core.Router.go(GW.Core.Router.current);
          }
        }
      })
      .catch(function () {
        // バックグラウンド失敗は静かに無視（UXを乱さない）
      });
  }

  /** 必要なら「データ保全のご案内」モーダルを表示 */
  function _maybeShowBackupPrompt() {
    if (GW.Core.Auth.shouldShowBackupPrompt()) {
      GW.Core.UI.showModal('gw-modal-backup');
    }
  }

  // ════════════════════════════════════════════════════════════════
  // グローバルイベント（旧 SECTION 12）
  // ════════════════════════════════════════════════════════════════

  /** オンライン復帰：キューを再開 */
  window.addEventListener('online', function () {
    GW.Core.UI.toast('🌐 接続復帰');
    GW.Core.Queue.resume();
    // 現在画面を再読込してもらう
    if (GW.Modules && GW.Modules.GLand && GW.Modules.GLand.onOnline) {
      GW.Modules.GLand.onOnline();
    }
  });

  /** オフライン検知：軽く通知 */
  window.addEventListener('offline', function () {
    GW.Core.UI.toast('⚠️ オフライン中（操作は記録されます）', 2500);
    var ind = document.getElementById('gw-save-indicator');
    if (ind) {
      ind.textContent = '⚡ オフライン';
      ind.classList.add('show', 'offline');
    }
  });

  /** 画面サイズ変更：スコア表のセンタリングを追従 */
  window.addEventListener('resize', function () {
    if (GW.Modules && GW.Modules.GLand && GW.Modules.GLand.onResize) {
      setTimeout(function () { GW.Modules.GLand.onResize(); }, 100);
    }
  });
  window.addEventListener('orientationchange', function () {
    if (GW.Modules && GW.Modules.GLand && GW.Modules.GLand.onResize) {
      setTimeout(function () { GW.Modules.GLand.onResize(); }, 200);
    }
  });

  /** PWAインストールプロンプトをキャッチして保持 */
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    GW.Core.State = GW.Core.State || {};
    GW.Core.State.pwaPrompt = e;
  });

  /** DOMContentLoaded を待ってから起動 */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', GW.bootstrap);
  } else {
    // 既に読込済みなら即起動
    setTimeout(GW.bootstrap, 0);
  }
})();
