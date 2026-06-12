/******************************************************************
 * G-WORLD Frontend Engine - Stage 2 Ultra Complete Edition
 * v1.2.0 - 全機能完全実装・同伴者ポップアップ実装
 *
 * 【変更履歴 Stage 2 Ultra】
 *   - ニックネーム→ヘッダー・同伴者リスト完全反映（完了）
 *   - カウンターモード（初心者用）完全復元（完了）
 *   - シンプルモード（経験者用）完全復元（完了）
 *   - 同伴者名入力：スコアカード名前欄タップ→ポップアップ（新規）
 *   - コース選択画面アクション完全実装（完了）
 *   - 登録→コース選択→スコア入力 完全フローの完成
 *   - 将来拡張対応（詳細ログ・イラスト入力の布石）
 *
 * 【構成】このファイルは2セクションに分かれます
 *   ─ 前半：GW.Core 層（基盤・全モジュール共通）
 *   ─ 後半：GW.Modules 層（各機能モジュール）
 *
 * 【設計憲法 7条】全コメントは日本語。「何を」より「なぜ」を残す。
 * 【設計憲法 第3条】グローバル汚染ゼロ。すべて GW 配下に格納。
 ******************************************************************/

(function () {
  'use strict';

  // ════════════════════════════════════════════════════════════════
  // ルート名前空間（グローバルに公開する唯一のオブジェクト）
  // ════════════════════════════════════════════════════════════════
  window.GW = window.GW || {};

  // 後半ファイル（モジュール層）から参照されるため、先に殻だけ作っておく
  GW.Core    = GW.Core    || {};
  GW.Modules = GW.Modules || {};

  // ════════════════════════════════════════════════════════════════
  // 【SECTION 1】GW.Core.Config - 全アプリ定数
  // ════════════════════════════════════════════════════════════════
  GW.Core.Config = {
    /** GAS Web App URL */
    GAS_URL: 'https://script.google.com/macros/s/AKfycbyJbjVYmqATkJe2Ial5XOK_CYXCfkPWEIpKOtZziwDQ490l-AfNNF43gwls20y1N2FHgg/exec',

    /** API バージョン */
    API_VERSION: 'v1',

    /** アプリバージョン */
    APP_VERSION: '1.2.0',

    /** キャッシュ有効期間（24時間） */
    CACHE_TTL_MS: 24 * 60 * 60 * 1000,

    /** SaveQueueの並列数上限 */
    SAVE_PARALLEL: 2,

    /** SaveQueueのリトライ上限 */
    SAVE_RETRY_MAX: 3,

    /** スコア保存のデバウンス遅延（ms）*/
    SCORE_DEBOUNCE_MS: 150,

    /** 同伴メンバー表のポーリング間隔（ms）*/
    MATES_POLL_MS: 30000,

    /**
     * データ保全のご案内モーダルを表示する利用回数
     * 設計憲法・第1条：押し付けず、節目ごとに穏やかに再案内
     */
    BACKUP_PROMPT_AT: [7, 14, 21, 30, 60],

    /** localStorage キー一覧 */
    KEYS: {
      USER_ID:       'gw_user_id',
      USE_COUNT:     'gw_use_count',
      STATE:         'gw_state',
      LAST_ACTIVE:   'gw_last_active',
      LAST_PROMPT:   'gw_last_backup_prompt',
      PROFILE:       'gw_profile',
      PLAYER:        'gw_player',
      DEVICE_ID:     'gw_device_id',
      DISPLAY_MODE:  'gw_display_mode',
      INPUT_MODE:    'gw_input_mode',    // 'simple' | 'counter'
      PUTT_MODE:     'gw_putt_mode',     // 'on' | 'off'
      PWA_SKIP:      'gw_pwa_skip_until',
      BOOT_BUNDLE:   'gw_boot_bundle',
      SCORES_PREFIX: 'gw_scores_',
      MATES_PREFIX:  'gw_mates_'
    }
  };

  // ════════════════════════════════════════════════════════════════
  // 【SECTION 2】GW.Core.Storage - localStorage 抽象化
  // ════════════════════════════════════════════════════════════════
  GW.Core.Storage = {
    get: function (key, defaultValue) {
      try {
        var v = localStorage.getItem(key);
        return v === null ? (defaultValue === undefined ? null : defaultValue) : v;
      } catch (e) {
        return defaultValue === undefined ? null : defaultValue;
      }
    },

    set: function (key, value) {
      try {
        localStorage.setItem(key, String(value));
        return true;
      } catch (e) {
        return false;
      }
    },

    getJSON: function (key, defaultValue) {
      try {
        var raw = localStorage.getItem(key);
        if (raw === null) return defaultValue === undefined ? null : defaultValue;
        return JSON.parse(raw);
      } catch (e) {
        return defaultValue === undefined ? null : defaultValue;
      }
    },

    setJSON: function (key, obj) {
      try {
        localStorage.setItem(key, JSON.stringify(obj));
        return true;
      } catch (e) {
        return false;
      }
    },

    remove: function (key) {
      try { localStorage.removeItem(key); } catch (e) {}
    },

    removeByPrefix: function (prefix) {
      try {
        var toDelete = [];
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (k && k.indexOf(prefix) === 0) toDelete.push(k);
        }
        toDelete.forEach(function (k) { localStorage.removeItem(k); });
      } catch (e) {}
    }
  };

  // ════════════════════════════════════════════════════════════════
  // 【SECTION 3】GW.Core.Cache - キャッシュ層
  // ════════════════════════════════════════════════════════════════
  GW.Core.Cache = {
    saveBoot: function (bundle) {
      GW.Core.Storage.setJSON(GW.Core.Config.KEYS.BOOT_BUNDLE, {
        courses:        bundle.courses        || [],
        activeCourseId: bundle.activeCourseId || '',
        isFinalized:    !!bundle.isFinalized,
        savedAt:        Date.now()
      });
    },

    loadBoot: function () {
      var data = GW.Core.Storage.getJSON(GW.Core.Config.KEYS.BOOT_BUNDLE);
      if (!data || !data.savedAt) return null;
      if (Date.now() - data.savedAt > GW.Core.Config.CACHE_TTL_MS) return null;
      return data;
    },

    saveMyScores: function (playerId, scores) {
      if (!playerId) return;
      GW.Core.Storage.setJSON(GW.Core.Config.KEYS.SCORES_PREFIX + playerId, {
        scores:  scores,
        savedAt: Date.now()
      });
    },

    loadMyScores: function (playerId) {
      if (!playerId) return null;
      var data = GW.Core.Storage.getJSON(GW.Core.Config.KEYS.SCORES_PREFIX + playerId);
      if (!data || !data.savedAt) return null;
      if (Date.now() - data.savedAt > GW.Core.Config.CACHE_TTL_MS) return null;
      return data.scores;
    },

    saveMates: function (courseId, groupName, payload) {
      var key = GW.Core.Config.KEYS.MATES_PREFIX + courseId + '_' + groupName;
      GW.Core.Storage.setJSON(key, { data: payload, savedAt: Date.now() });
    },

    loadMates: function (courseId, groupName) {
      var key = GW.Core.Config.KEYS.MATES_PREFIX + courseId + '_' + groupName;
      var data = GW.Core.Storage.getJSON(key);
      if (!data || !data.savedAt) return null;
      if (Date.now() - data.savedAt > GW.Core.Config.CACHE_TTL_MS) return null;
      return data.data;
    },

    clearAll: function () {
      GW.Core.Storage.remove(GW.Core.Config.KEYS.BOOT_BUNDLE);
      GW.Core.Storage.removeByPrefix(GW.Core.Config.KEYS.SCORES_PREFIX);
      GW.Core.Storage.removeByPrefix(GW.Core.Config.KEYS.MATES_PREFIX);
    }
  };

  // ════════════════════════════════════════════════════════════════
  // 【SECTION 4】GW.Core.Queue - SaveQueue
  // ════════════════════════════════════════════════════════════════
  GW.Core.Queue = {
    _queue:         [],
    _inflight:      0,
    _totalDone:     0,
    _hasError:      false,
    _indicatorTimer: null,

    add: function (action, payload, onSuccess, onError, dedupeKey) {
      this._enqueue({
        action:    action,
        payload:   payload || {},
        onSuccess: onSuccess || null,
        onError:   onError || function (err) {
          console.warn('[GW.Queue] background error:', action, err);
        },
        dedupeKey: dedupeKey || null,
        retries:   0
      });
    },

    _enqueue: function (job) {
      if (job.dedupeKey) {
        for (var i = this._queue.length - 1; i >= 0; i--) {
          if (this._queue[i].dedupeKey === job.dedupeKey) {
            this._queue.splice(i, 1);
          }
        }
      }
      this._queue.push(job);
      this._updateIndicator();
      this._pump();
    },

    _pump: function () {
      while (this._inflight < GW.Core.Config.SAVE_PARALLEL && this._queue.length > 0) {
        var job = this._queue.shift();
        this._execute(job);
      }
    },

    _execute: function (job) {
      var self = this;
      self._inflight++;
      self._updateIndicator();

      GW.Core.Api.call(job.action, job.payload)
        .then(function (data) {
          if (job.onSuccess) {
            try { job.onSuccess(data); } catch (e) {
              console.warn('[GW.Queue] onSuccess err:', e);
            }
          }
          self._totalDone++;
        })
        .catch(function (err) {
          console.warn('[GW.Queue] job failed:', job.action, err);
          if (job.retries < GW.Core.Config.SAVE_RETRY_MAX) {
            job.retries++;
            var delay = 500 * Math.pow(3, job.retries - 1);
            setTimeout(function () {
              self._queue.unshift(job);
              self._pump();
            }, delay);
          } else {
            self._hasError = true;
            if (job.onError) {
              try { job.onError(err); } catch (e) {}
            }
            self._totalDone++;
          }
        })
        .then(function () {
          self._inflight--;
          self._updateIndicator();
          self._pump();
        });
    },

    _updateIndicator: function () {
      var el = document.getElementById('gw-save-indicator');
      if (!el) return;
      var pending = this._queue.length + this._inflight;
      if (pending > 0) {
        el.textContent = '同期中... (' + pending + ')';
        el.classList.add('show');
        el.classList.toggle('error', this._hasError);
        clearTimeout(this._indicatorTimer);
      } else {
        if (this._totalDone > 0 && !this._hasError) {
          el.textContent = '✓ 同期完了';
          el.classList.add('show');
          el.classList.remove('error');
        } else if (this._hasError) {
          el.textContent = '⚠ 一部送信失敗';
          el.classList.add('show', 'error');
        }
        clearTimeout(this._indicatorTimer);
        var self2 = this;
        this._indicatorTimer = setTimeout(function () {
          el.classList.remove('show');
          if (!self2._hasError) self2._totalDone = 0;
        }, 2200);
      }
    },

    resume: function () {
      this._pump();
    },

    status: function () {
      return {
        queued:   this._queue.length,
        inflight: this._inflight,
        done:     this._totalDone,
        hasError: this._hasError
      };
    }
  };

  // ════════════════════════════════════════════════════════════════
  // 【SECTION 5】GW.Core.Api - GAS API 通信レイヤ
  // ════════════════════════════════════════════════════════════════
  GW.Core.Api = {
    call: function (action, payload) {
      var body = JSON.stringify({
        action:     action,
        payload:    payload || {},
        apiVersion: GW.Core.Config.API_VERSION,
        meta: {
          deviceId:  GW.Core.Auth.getDeviceId(),
          gwUserId:  GW.Core.Auth.getUserId() || '',
          useCount:  GW.Core.Auth.getUseCount(),
          state:     GW.Core.Auth.getState(),
          ts:        Date.now()
        }
      });

      var fetchOpts = {
        method: 'POST',
        body:   body
      };
      try { fetchOpts.keepalive = true; } catch (e) {}

      return fetch(GW.Core.Config.GAS_URL, fetchOpts)
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (res && res.ok === true) {
            return res;
          }
          if (res && res.success === true) {
            return res.data;
          }
          var errMsg = (res && (res.error || res.msg)) || 'unknown server error';
          throw new Error(errMsg);
        });
    },

    fire: function (action, payload, onSuccess, onError, dedupeKey) {
      GW.Core.Queue.add(action, payload, onSuccess, onError, dedupeKey);
    }
  };

  // ════════════════════════════════════════════════════════════════
  // 【SECTION 6】GW.Core.Auth - 認証・ID管理
  // ════════════════════════════════════════════════════════════════
  GW.Core.Auth = {
    boot: function () {
      var uid = GW.Core.Storage.get(GW.Core.Config.KEYS.USER_ID);
      if (!uid) {
        uid = this._generateGuestId();
        GW.Core.Storage.set(GW.Core.Config.KEYS.USER_ID, uid);
        GW.Core.Storage.set(GW.Core.Config.KEYS.STATE, 'guest');
      }

      if (!GW.Core.Storage.get(GW.Core.Config.KEYS.DEVICE_ID)) {
        var did = 'D-' + Date.now().toString(36).toUpperCase() + '-' +
                  Math.floor(Math.random() * 0xFFFFFF).toString(16).toUpperCase();
        GW.Core.Storage.set(GW.Core.Config.KEYS.DEVICE_ID, did);
      }

      var count = Number(GW.Core.Storage.get(GW.Core.Config.KEYS.USE_COUNT, '0')) + 1;
      GW.Core.Storage.set(GW.Core.Config.KEYS.USE_COUNT, count);

      GW.Core.Storage.set(GW.Core.Config.KEYS.LAST_ACTIVE, String(Date.now()));

      return {
        userId:   uid,
        state:    GW.Core.Storage.get(GW.Core.Config.KEYS.STATE, 'guest'),
        useCount: count,
        deviceId: GW.Core.Storage.get(GW.Core.Config.KEYS.DEVICE_ID)
      };
    },

    _generateGuestId: function () {
      var seg = function () {
        return Math.floor(Math.random() * 0xFFFFFF).toString(16).toUpperCase().padStart(6, '0');
      };
      return 'GW-G-' + seg().substring(0, 4) + seg().substring(0, 4);
    },

    getUserId: function () {
      return GW.Core.Storage.get(GW.Core.Config.KEYS.USER_ID);
    },

    getState: function () {
      return GW.Core.Storage.get(GW.Core.Config.KEYS.STATE, 'guest');
    },

    isGuest: function () {
      return this.getState() === 'guest';
    },

    getUseCount: function () {
      return Number(GW.Core.Storage.get(GW.Core.Config.KEYS.USE_COUNT, '0'));
    },

    getDeviceId: function () {
      return GW.Core.Storage.get(GW.Core.Config.KEYS.DEVICE_ID);
    },

    getProfile: function () {
      return GW.Core.Storage.getJSON(GW.Core.Config.KEYS.PROFILE, {});
    },

    setProfile: function (profile) {
      GW.Core.Storage.setJSON(GW.Core.Config.KEYS.PROFILE, profile);
    },

    shouldShowBackupPrompt: function () {
      if (!this.isGuest()) return false;
      var count = this.getUseCount();
      var milestone = GW.Core.Config.BACKUP_PROMPT_AT.indexOf(count) >= 0;
      if (!milestone) return false;
      var lastPrompt = Number(GW.Core.Storage.get(GW.Core.Config.KEYS.LAST_PROMPT, '0'));
      if (lastPrompt && Date.now() - lastPrompt < 24 * 60 * 60 * 1000) {
        return false;
      }
      return true;
    },

    dismissBackupPrompt: function () {
      GW.Core.Storage.set(GW.Core.Config.KEYS.LAST_PROMPT, String(Date.now()));
    },

    linkBackup: function (provider, providerUid) {
      var self = this;
      var oldId = this.getUserId();

      return GW.Core.Api.call('core.linkBackup', {
        oldGwUserId:   oldId,
        provider:      provider,
        providerUid:   providerUid,
        deviceId:      this.getDeviceId(),
        profile:       this.getProfile()
      }).then(function (res) {
        if (res && res.ok && res.newGwUserId) {
          GW.Core.Storage.set(GW.Core.Config.KEYS.USER_ID, res.newGwUserId);
          GW.Core.Storage.set(GW.Core.Config.KEYS.STATE, 'backed_up');
          GW.Core.UI.toast('✅ データを保全しました');
          return res;
        }
        throw new Error((res && res.error) || 'バックアップ連携に失敗しました');
      });
    },

    reset: function () {
      Object.keys(GW.Core.Config.KEYS).forEach(function (k) {
        var key = GW.Core.Config.KEYS[k];
        if (typeof key === 'string') {
          if (key.endsWith('_')) {
            GW.Core.Storage.removeByPrefix(key);
          } else {
            GW.Core.Storage.remove(key);
          }
        }
      });
      GW.Core.Cache.clearAll();
    }
  };

  // ════════════════════════════════════════════════════════════════
  // 【SECTION 7】GW.Core.UI - UI共通部品
  // ════════════════════════════════════════════════════════════════
  GW.Core.UI = {
    _toastTimer: null,
    _confirmCallback: null,

    toast: function (msg, duration) {
      var t = document.getElementById('gw-toast');
      if (!t) return;
      t.textContent = msg;
      t.classList.add('show');
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(function () {
        t.classList.remove('show');
      }, duration || 1800);
    },

    confirm: function (title, body, onOk) {
      document.getElementById('gw-confirm-title').textContent = title || '確認';
      document.getElementById('gw-confirm-body').innerHTML =
        this._escapeHtml(body || '').replace(/\n/g, '<br>');
      this._confirmCallback = onOk || null;
      document.getElementById('gw-modal-confirm').classList.add('show');
    },

    _closeConfirm: function () {
      document.getElementById('gw-modal-confirm').classList.remove('show');
      this._confirmCallback = null;
    },

    _execConfirm: function () {
      var cb = this._confirmCallback;
      this._closeConfirm();
      if (typeof cb === 'function') cb();
    },

    showModal: function (modalId) {
      var el = document.getElementById(modalId);
      if (el) el.classList.add('show');
    },

    hideModal: function (modalId) {
      var el = document.getElementById(modalId);
      if (el) el.classList.remove('show');
    },

    haptic: function () {
      if (navigator.vibrate) {
        try { navigator.vibrate(10); } catch (e) {}
      }
    },

    escapeHtml: function (s) {
      return String(s == null ? '' : s).replace(/[&<>'\"']/g, function (m) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', '\u0027': '&#39;' })[m];
      });
    },

    _escapeHtml: function (s) {
      return this.escapeHtml(s);
    },

    setBootText: function (text) {
      var el = document.getElementById('gw-boot-sub');
      if (el) el.textContent = text;
    },

    hideBoot: function () {
      var el = document.getElementById('gw-boot-overlay');
      if (el) el.classList.add('hidden');
    },

    showStartupError: function (message, detail) {
      var banner = document.getElementById('gw-startup-error');
      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'gw-startup-error';
        banner.className = 'gw-startup-error';
        document.body.appendChild(banner);
      }
      var detailHtml = detail
        ? '<div style=\"font-size:11px;opacity:0.85;margin-top:4px;\">' + this._escapeHtml(detail) + '</div>'
        : '';
      banner.innerHTML =
        '<button class=\"err-close\" data-action=\"close-startup-error\">×</button>' +
        '<div class=\"err-title\">⚠ 起動エラー</div>' +
        '<div>' + this._escapeHtml(message) + '</div>' +
        detailHtml;
    }
  };

  // ════════════════════════════════════════════════════════════════
  // 【SECTION 8】GW.Core.Router - 画面遷移・フッターナビ制御
  // ════════════════════════════════════════════════════════════════
  GW.Core.Router = {
    current: 'home',

    routes: {
      home:     { screen: 'gw-screen-home',     module: 'Home',     active: true },
      gland:    { screen: 'gw-screen-gland',    module: 'GLand',    active: true },
      gcompete: { screen: 'gw-screen-gcompete', module: 'GCompete', active: false },
      gtown:    { screen: 'gw-screen-gtown',    module: 'GTown',    active: false },
      mypage:   { screen: 'gw-screen-mypage',   module: 'MyPage',   active: true }
    },

    go: function (route, params) {
      var def = this.routes[route];
      if (!def) {
        console.warn('[GW.Router] unknown route:', route);
        return;
      }

      if (!def.active) {
        var labels = { gcompete: 'G-COMPETE', gtown: 'G-TOWN' };
        GW.Core.UI.toast('🔔 ' + (labels[route] || route) + ' は近日公開予定です');
        this._highlightNav(route);
        var self2 = this;
        setTimeout(function () { self2._highlightNav(self2.current); }, 800);
        return;
      }

      var keys = Object.keys(this.routes);
      for (var i = 0; i < keys.length; i++) {
        var s = document.getElementById(this.routes[keys[i]].screen);
        if (s) s.classList.remove('active');
      }
      var target = document.getElementById(def.screen);
      if (target) target.classList.add('active');

      this._highlightNav(route);
      this.current = route;

      try {
        if (location.hash !== '#' + route) {
          history.replaceState(null, '', '#' + route);
        }
      } catch (e) {}

      var modName = def.module;
      var mod = GW.Modules[modName];
      if (mod && typeof mod.render === 'function') {
        try {
          mod.render(params || {});
        } catch (e) {
          console.error('[GW.Router] module render error:', modName, e);
        }
      }

      var fab = document.getElementById('gw-fab-jump');
      if (fab) {
        var shouldShow = (route === 'gland' && GW.Modules.GLand && GW.Modules.GLand.isInRound && GW.Modules.GLand.isInRound());
        fab.classList.toggle('gw-hidden', !shouldShow);
      }
    },

    _highlightNav: function (route) {
      var btns = document.querySelectorAll('.gw-footer-nav button[data-route]');
      for (var i = 0; i < btns.length; i++) {
        btns[i].classList.toggle('active', btns[i].getAttribute('data-route') === route);
      }
    },

    resolveInitial: function () {
      try {
        var hash = (location.hash || '').replace(/^#/, '');
        if (hash && this.routes[hash]) return hash;
      } catch (e) {}
      return 'home';
    }
  };

  // ════════════════════════════════════════════════════════════════
  // 【SECTION 9】GW.Core.Action - data-action 集中処理
  // ════════════════════════════════════════════════════════════════
  GW.Core.Action = {
    _handlers: {},

    register: function (action, handler) {
      this._handlers[action] = handler;
    },

    registerMany: function (map) {
      var self = this;
      Object.keys(map).forEach(function (k) { self._handlers[k] = map[k]; });
    },

    bind: function () {
      var self = this;
      document.body.addEventListener('click', function (e) {
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
          if (el.getAttribute && el.getAttribute('data-no-close') === '1') {
            e.stopPropagation();
            return;
          }
          el = el.parentNode;
        }
      });

      var navBtns = document.querySelectorAll('.gw-footer-nav button[data-route]');
      for (var i = 0; i < navBtns.length; i++) {
        navBtns[i].addEventListener('click', function (e) {
          var route = this.getAttribute('data-route');
          GW.Core.UI.haptic();
          GW.Core.Router.go(route);
        });
      }

      var portalCards = document.querySelectorAll('.gw-portal-module[data-route]');
      for (var j = 0; j < portalCards.length; j++) {
        portalCards[j].addEventListener('click', function (e) {
          var route = this.getAttribute('data-route');
          GW.Core.UI.haptic();
          GW.Core.Router.go(route);
        });
      }

      // ── 共通アクション ──
      this.registerMany({
        'confirm-ok':     function () { GW.Core.UI._execConfirm(); },
        'confirm-cancel': function () { GW.Core.UI._closeConfirm(); },
        'open-backup-modal':    function () { GW.Modules.MyPage.openBackupModal(); },
        'dismiss-backup-modal': function () {
          GW.Core.Auth.dismissBackupPrompt();
          GW.Core.UI.hideModal('gw-modal-backup');
        },
        'link-backup': function () {
          GW.Core.UI.hideModal('gw-modal-backup');
          GW.Core.UI.toast('🚧 連携機能は次期リリースで利用可能になります');
        },
        'show-pwa-guide':  function () { GW.Modules.MyPage.showPWAGuide(); },
        'close-pwa-modal': function () { GW.Core.UI.hideModal('gw-modal-pwa'); },
        'pwa-install':    function () { GW.Modules.MyPage.triggerPWAInstall(); },
        'close-startup-error': function () {
          var el = document.getElementById('gw-startup-error');
          if (el) el.remove();
        },
        'logout': function () {
          GW.Core.UI.confirm(
            'プレイヤーリセット',
            '現在のプレイヤー情報をクリアして、別のプレイヤーで使用を開始します。\n\n※バックアップ済みの場合、再連携で復元可能です。',
            function () {
              GW.Core.Auth.reset();
              location.reload();
            }
          );
        },
        // ── ホーム画面からのエントリーポイント ──
        'start-round': function () {
          GW.Core.Router.go('gland');
        },
        // ── ホールピッカー ──
        'open-hole-picker': function () {
          if (GW.Modules.GLand && GW.Modules.GLand.Score) {
            GW.Modules.GLand.Score._openHolePicker();
          }
        },
        'close-hole-picker': function () {
          if (GW.Modules.GLand && GW.Modules.GLand.Score) {
            GW.Modules.GLand.Score._closeHolePicker();
          }
        },
        'gland-jump-hole': function (el) {
          var hole = parseInt(el.getAttribute('data-hole'), 10);
          if (GW.Modules.GLand && GW.Modules.GLand.Score) {
            GW.Modules.GLand.Score._jumpToHole(hole);
          }
        },
        'close-hole-zoom': function () {
          if (GW.Modules.GLand && GW.Modules.GLand.Score) {
            GW.Modules.GLand.Score._closeHoleZoom();
          }
        },
        // ── スコア入力（+/-ボタン）─
        'gland-stroke-plus':  function () {
          if (GW.Modules.GLand && GW.Modules.GLand.Score) {
            GW.Modules.GLand.Score._chgStroke(1);
          }
        },
        'gland-stroke-minus': function () {
          if (GW.Modules.GLand && GW.Modules.GLand.Score) {
            GW.Modules.GLand.Score._chgStroke(-1);
          }
        },
        'gland-putt-plus':  function () {
          if (GW.Modules.GLand && GW.Modules.GLand.Score) {
            GW.Modules.GLand.Score._chgPutt(1);
          }
        },
        'gland-putt-minus': function () {
          if (GW.Modules.GLand && GW.Modules.GLand.Score) {
            GW.Modules.GLand.Score._chgPutt(-1);
          }
        },
        // ── カウンターモード：ショット+1 / パット+1 / CLR ★Stage2正しい実装 ──
        'gland-counter-shot': function () {
          if (GW.Modules.GLand) {
            GW.Modules.GLand._counterShotAdd();
          }
        },
        'gland-counter-putt': function () {
          if (GW.Modules.GLand) {
            GW.Modules.GLand._counterPuttAdd();
          }
        },
        'gland-counter-clr': function () {
          if (GW.Modules.GLand) {
            GW.Modules.GLand._counterClr();
          }
        },
        // ── ホール移動 ──
        'gland-prev-hole': function () {
          if (GW.Modules.GLand && GW.Modules.GLand.Score) {
            GW.Modules.GLand.Score._prevHole();
          }
        },
        'gland-next-hole': function () {
          if (GW.Modules.GLand && GW.Modules.GLand.Score) {
            GW.Modules.GLand.Score._nextHole();
          }
        },
        // ── 入力モード切替（シンプル/カウンター） ★Stage2完全復元 ──
        'gland-mode-simple': function () {
          GW.Modules.GLand._setInputMode('simple');
        },
        'gland-mode-counter': function () {
          GW.Modules.GLand._setInputMode('counter');
        },
        // ── パット記録 ON/OFF ──
        'gland-putt-on': function () {
          GW.Modules.GLand._setPuttMode('on');
        },
        'gland-putt-off': function () {
          GW.Modules.GLand._setPuttMode('off');
        },
        // ── 表示モード切替 ──
        'gland-disp-stroke':  function () {
          if (GW.Modules.GLand && GW.Modules.GLand.Score) {
            GW.Modules.GLand.Score._setDisplayMode('stroke');
          }
        },
        'gland-disp-pardiff': function () {
          if (GW.Modules.GLand && GW.Modules.GLand.Score) {
            GW.Modules.GLand.Score._setDisplayMode('pardiff');
          }
        },
        'gland-disp-symbol': function () {
          if (GW.Modules.GLand && GW.Modules.GLand.Score) {
            GW.Modules.GLand.Score._setDisplayMode('symbol');
          }
        },
        // ── サブタブ ──
        'switch-subtab-score': function () {
          GW.Modules.GLand._switchSubtab('score');
        },
        'switch-subtab-hist': function () {
          GW.Modules.GLand._switchSubtab('hist');
        },
        // ── QRスキャナー ──
        'open-qr-scanner': function () {
          GW.Core.UI.showModal('gw-modal-qr-scanner');
        },
        'close-qr-scanner': function () {
          GW.Core.UI.hideModal('gw-modal-qr-scanner');
        },
        'qr-start-camera': function () {
          GW.Modules.QRScanner.start();
        },
        'qr-submit-manual': function () {
          var id = document.getElementById('gw-qr-manual-id').value.trim();
          if (id) GW.Modules.QRScanner.submitManual(id);
        },
        // ── 登録 ──
        'register-profile': function () {
          if (GW.Modules.GLand) {
            GW.Modules.GLand._register();
          }
        },
        // ── コース選択（トグル） ──
        'cs-toggle': function (el) {
          var courseId = el.getAttribute('data-course-id');
          var wrap = document.querySelector('.gw-cs-course-wrap[data-course-id=\"' + courseId + '\"]');
          if (!wrap) return;
          var subOptions = wrap.querySelector('.gw-cs-sub-options');
          var isExpanded = wrap.querySelector('.gw-cs-course-card.expanded');
          
          // 全て閉じる
          document.querySelectorAll('.gw-cs-course-card').forEach(function(card) {
            card.classList.remove('expanded');
          });
          document.querySelectorAll('.gw-cs-sub-options').forEach(function(opt) {
            opt.classList.add('gw-hidden');
          });
          
          // 選択したものだけ開く
          if (!isExpanded) {
            el.classList.add('expanded');
            if (subOptions) subOptions.classList.remove('gw-hidden');
          }
        },
        // ── コース確定 ──
        'cs-confirm': function (el) {
          var courseId = el.getAttribute('data-course-id');
          var variant = el.getAttribute('data-variant');
          if (GW.Modules.GLand) {
            GW.Modules.GLand._selectCourse(courseId, variant);
          }
        },
        // ── 戻る ──
        'cs-back': function () {
          if (GW.Modules.GLand) {
            GW.Modules.GLand._showRegister();
          }
        },
        // ── 終了 ──
        'finish-round': function () {
          if (GW.Modules.GLand && GW.Modules.GLand.Score) {
            GW.Modules.GLand.Score._finishRound();
          }
        },
        // ── 同伴者名ポップアップ ★新規追加 ──
        'open-companion-modal': function (el) {
          var playerId = el.getAttribute('data-player-id') || '';
          var playerName = el.getAttribute('data-player-name') || '';
          var isNew = el.getAttribute('data-is-new') === 'true';
          
          var modal = document.getElementById('gw-modal-companion-name');
          var input = document.getElementById('gw-companion-name-input');
          var title = document.getElementById('gw-companion-modal-title');
          var confirmBtn = document.getElementById('gw-companion-confirm-btn');
          
          if (!modal || !input) return;
          
          input.value = playerName || '';
          title.textContent = isNew ? '同伴者を追加' : '名前を編集';
          modal.dataset.playerId = playerId;
          modal.dataset.isNew = isNew ? 'true' : 'false';
          
          modal.classList.add('show');
          setTimeout(function () { input.focus(); }, 100);
        },
        'close-companion-modal': function () {
          var modal = document.getElementById('gw-modal-companion-name');
          if (modal) modal.classList.remove('show');
        },
        'confirm-companion-name': function () {
          var modal = document.getElementById('gw-modal-companion-name');
          var input = document.getElementById('gw-companion-name-input');
          if (!modal || !input) return;
          
          var name = input.value.trim();
          var playerId = modal.dataset.playerId || '';
          var isNew = modal.dataset.isNew === 'true';
          
          if (!name) {
            GW.Core.UI.toast('名前を入力してください');
            return;
          }
          
          if (isNew) {
            // 新規同伴者を追加
            GW.Modules.GLand._addCompanion(name);
          } else {
            // 既存プレイヤーの名前を更新
            GW.Modules.GLand._updateCompanionName(playerId, name);
          }
          
          modal.classList.remove('show');
        },
        // ── 同伴者を削除 ──
        'remove-companion': function (el) {
          var playerId = el.getAttribute('data-player-id');
          if (!playerId) return;
          
          GW.Core.UI.confirm(
            '同伴者を削除',
            'この同伴者をスコア表から削除しますか？',
            function () {
              GW.Modules.GLand._removeCompanion(playerId);
            }
          );
        },
        // ── ホーム画面初期化（名前反映） ──
        'home-init-name': function () {
          GW.Modules.Home._updateDisplayedName();
        }
      });
    }
  };

  // ════════════════════════════════════════════════════════════════
  // 【SECTION 10】GW.Core.SW - Service Worker 登録
  // ════════════════════════════════════════════════════════════════
  GW.Core.SW = {
    register: function () {
      if (!('serviceWorker' in navigator)) {
        console.log('[GW.SW] not supported');
        return Promise.resolve(null);
      }
      return navigator.serviceWorker.register('./service-worker.js')
        .then(function (reg) {
          console.log('[GW.SW] registered:', reg.scope);
          return reg;
        })
        .catch(function (err) {
          console.warn('[GW.SW] register failed:', err);
          return null;
        });
    }
  };

  // ════════════════════════════════════════════════════════════════
  // 【SECTION 11】GW.bootstrap - アプリ全体の起動シーケンス
  // ════════════════════════════════════════════════════════════════
  GW.bootstrap = function () {
    var bootStart = Date.now();
    console.log('[GW] bootstrap start, version:', GW.Core.Config.APP_VERSION);

    GW.Core.SW.register();

    var authState = GW.Core.Auth.boot();
    console.log('[GW] auth state:', authState);

    GW.Core.Action.bind();

    // ── ホーム画面レンダリング ──
    GW.Modules.Home.render();

    GW.Core.UI.setBootText('キャッシュを確認中...');
    var cached = GW.Core.Cache.loadBoot();
    if (cached && cached.courses && cached.courses.length > 0) {
      console.log('[GW] STAGE 1: instant boot from cache');
      _applyBootBundle(cached);
      GW.Core.UI.hideBoot();

      var initialRoute = GW.Core.Router.resolveInitial();
      GW.Core.Router.go(initialRoute);

      console.log('[GW] ⚡ instant boot complete in ' + (Date.now() - bootStart) + 'ms');

      setTimeout(_refreshBootInBackground, 100);
      setTimeout(_maybeShowBackupPrompt, 3000);
      return;
    }

    GW.Core.UI.setBootText('サーバーへ接続中...');

    var overallTimer = setTimeout(function () {
      GW.Core.UI.showStartupError(
        'サーバー応答が遅すぎます',
        '25秒以内に初期化が完了しませんでした'
      );
      GW.Core.UI.hideBoot();
    }, 25000);

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
        console.warn('[GW] boot fetch failed:', err);
        GW.Core.UI.showStartupError(
          'サーバーに接続できません',
          'ネットワークを確認して、画面を再読み込みしてください'
        );
        GW.Core.UI.hideBoot();
        GW.Core.Router.go('home');
      });
  };

  // ── 内部ヘルパー ──
  function _applyBootBundle(res) {
    GW._bootData = res;
    // コース選択ボタンを動的に有効化（もし必要なら）
    if (res.courses && res.courses.length > 0) {
      // キャッシュictoCourses が利用可能
    }
  }

  function _refreshBootInBackground() {
    GW.Core.Api.call('gland.boot', {})
      .then(function (res) {
        if (res && res.ok) {
          GW.Core.Cache.saveBoot(res);
          _applyBootBundle(res);
        }
      })
      .catch(function () {});
  }

  function _maybeShowBackupPrompt() {
    if (GW.Core.Auth.shouldShowBackupPrompt()) {
      GW.Core.UI.showModal('gw-modal-backup');
    }
  }

  // ── 起動 ──
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', GW.bootstrap);
  } else {
    GW.bootstrap();
  }

}());

// ════════════════════════════════════════════════════════════════
// 【SECTION 12】GW.Modules層 - 機能モジュール群
// ════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // ════════════════════════════════════════════════════════════════
  // 【MODULE 1】GW.Modules.Home - ホーム画面
  // ════════════════════════════════════════════════════════════════
  GW.Modules.Home = {
    render: function () {
      this._updateDisplayedName();
      this._renderRecentRounds();
    },

    /** ホーム画面の名前を即座に反映 ★Stage2重点対応 */
    _updateDisplayedName: function () {
      var profile = GW.Core.Auth.getProfile();
      var name = profile && profile.nickname ? profile.nickname : '';
      var state = GW.Core.Auth.getState();

      // グリーティング
      var greetMsg = document.getElementById('gw-greet-msg');
      var greetName = document.getElementById('gw-greet-name');
      var stateBadge = document.getElementById('gw-state-badge');

      if (greetMsg) {
        if (name) {
          greetMsg.textContent = 'こんにちは';
          if (greetName) greetName.textContent = name + 'さん';
        } else {
          greetMsg.textContent = 'ようこそ';
          if (greetName) greetName.textContent = 'ゲストさん';
        }
      }

      if (stateBadge) {
        stateBadge.className = 'gw-state-badge ' + (name ? 'user' : 'guest');
        stateBadge.textContent = name ? 'プレイヤーモード' : 'ゲストモード';
      }
    },

    _renderRecentRounds: function () {
      var list = document.getElementById('gw-portal-recent-list');
      if (!list) return;
      // 最近のラウンドをlocalStorageから取得（簡略実装）
      var profile = GW.Core.Auth.getProfile();
      var recent = profile && profile.recentRounds ? profile.recentRounds : [];
      
      if (recent.length === 0) {
        list.innerHTML = '<div style=\"color:var(--text-sub);font-size:13px;padding:10px;\">まだラウンド記録がありません</div>';
        return;
      }
      
      var html = '<div style=\"display:flex;flex-direction:column;gap:8px;\">';
      for (var i = 0; i < Math.min(recent.length, 5); i++) {
        var r = recent[i];
        html += '<div class=\"gw-recent-item\">' +
          '<span style=\"font-size:12px;color:var(--text-sub);\">' + (r.date || '') + '</span>' +
          '<span style=\"font-size:14px;color:var(--gold-bri);\">' + (r.course || '') + '</span>' +
          '<span style=\"font-size:13px;\">' + (r.total !== undefined ? r.total + '打' : '-') + '</span>' +
        '</div>';
      }
      html += '</div>';
      list.innerHTML = html;
    }
  };

  // ════════════════════════════════════════════════════════════════
  // 【MODULE 2】GW.Modules.GLand - メインスコア管理
  // ════════════════════════════════════════════════════════════════
  GW.Modules.GLand = {
    // 状態管理
    _state: {
      inputMode:   GW.Core.Storage.get(GW.Core.Config.KEYS.INPUT_MODE, 'simple'),
      puttMode:    GW.Core.Storage.get(GW.Core.Config.KEYS.PUTT_MODE, 'off'),
      displayMode: 'stroke',
      currentHole: 1,
      totalHoles:  18,
      profile:     null,
      courseId:    null,
      variant:     null,
      players:     [],   // {id, name, scores: [], putts: [], isMe}
      inRound:     false,
      subtab:      'score'
    },

    /** レンダリング入口 */
    render: function () {
      var profile = GW.Core.Auth.getProfile();
      this._state.profile = profile;
      
      // ホームに戻るボタンから来た場合
      this._renderByState();
    },

    _renderByState: function () {
      var profile = this._state.profile;
      
      // 登録済みか判定
      if (!profile || !profile.nickname) {
        this._showRegister();
      } else if (!this._state.courseId) {
        // 登録済みだがコース未選択
        this._showCourseSelect();
      } else {
        // コース選択済み → スコア入力メイン画面
        this._showMain();
      }
    },

    /** 登録カード表示 */
    _showRegister: function () {
      var regCard  = document.getElementById('gw-gland-register');
      var csScreen = document.getElementById('gw-gland-course-select');
      var mainArea = document.getElementById('gw-gland-main');

      if (regCard)  regCard.classList.remove('gw-hidden');
      if (csScreen) csScreen.classList.add('gw-hidden');
      if (mainArea) mainArea.classList.add('gw-hidden');

      // 既存プロファイルがあれば名を事前入力
      var profile = this._state.profile;
      var nickInput = document.getElementById('gw-input-nickname');
      var realInput = document.getElementById('gw-input-realname');
      if (nickInput && profile && profile.nickname) nickInput.value = profile.nickname;
      if (realInput && profile && profile.realname) realInput.value = profile.realname;

      this._updateHeaderName();
    },

    /** 登録処理（ニックネームを保存 → コース選択へ） ★Stage2重点対応 */
    _register: function () {
      var nickInput = document.getElementById('gw-input-nickname');
      var realInput = document.getElementById('gw-input-realname');
      if (!nickInput) return;

      var nickname = nickInput.value.trim();
      if (!nickname) {
        GW.Core.UI.toast('ニックネームを入力してください');
        nickInput.focus();
        return;
      }

      var profile = {
        nickname: nickname,
        realname: realInput ? realInput.value.trim() : '',
        registeredAt: Date.now()
      };

      GW.Core.Auth.setProfile(profile);
      this._state.profile = profile;

      // ★ヘッダー・同伴者リストに名前を即座反映
      this._updateHeaderName();
      this._updatePlayerBarName();

      GW.Core.UI.toast('登録完了！');
      
      // コース選択画面へ
      this._showCourseSelect();
    },

    /** ヘッダーにプレイヤー名を表示 ★Stage2重点対応 */
    _updateHeaderName: function () {
      var profile = this._state.profile;
      var name = profile && profile.nickname ? profile.nickname : '';

      var headerGroup = document.getElementById('gw-header-group');
      if (headerGroup) {
        if (name) {
          headerGroup.textContent = name + ' / ' + (this._state.courseId ? this._getCourseName() : 'コース未選択');
        } else {
          headerGroup.textContent = '';
        }
      }

      // ホーム画面も更新
      GW.Modules.Home._updateDisplayedName();
    },

    /** プレイヤー欄にプレイヤー名を表示 ★Stage2重点対応 */
    _updatePlayerBarName: function () {
      var profile = this._state.profile;
      var name = profile && profile.nickname ? profile.nickname : '-';
      
      var meNameEl = document.getElementById('gw-me-name');
      if (meNameEl) meNameEl.textContent = name;
    },

    /** コース選択画面を表示 */
    _showCourseSelect: function () {
      var regCard  = document.getElementById('gw-gland-register');
      var csScreen = document.getElementById('gw-gland-course-select');
      var mainArea = document.getElementById('gw-gland-main');

      if (regCard)  regCard.classList.add('gw-hidden');
      if (csScreen) csScreen.classList.remove('gw-hidden');
      if (mainArea) mainArea.classList.add('gw-hidden');

      // コース選択画面にお名前を反映
      var profile = this._state.profile;
      var greetNameEl = document.getElementById('gw-cs-greet-name');
      if (greetNameEl) {
        greetNameEl.textContent = profile && profile.nickname ? profile.nickname + 'さん' : 'プレイヤー';
      }

      // ヘッダーも更新
      this._updateHeaderName();
    },

    /** コース選択処理 */
    _selectCourse: function (courseId, variant) {
      this._state.courseId = courseId;
      this._state.variant  = variant;

      var totalHoles = (variant === '9H') ? 9 : 18;
      this._state.totalHoles = totalHoles;

      // ヘッダーにコース名を表示
      this._updateHeaderName();

      // 自分自身のプレイヤーを初期化
      var profile = this._state.profile;
      var mePlayer = {
        id:     GW.Core.Auth.getUserId(),
        name:   profile && profile.nickname ? profile.nickname : '自分',
        scores: this._createEmptyScores(totalHoles),
        putts:  this._state.puttMode === 'on' ? this._createEmptyScores(totalHoles, 0) : null,
        isMe:   true,
        parDiff: 0,
        totalStrokes: 0
      };

      this._state.players = [mePlayer];
      this._state.currentHole = 1;
      this._state.inRound = true;
      this._state.displayMode = 'stroke';

      GW.Core.UI.toast(this._getCourseName() + ' ' + variant + ' を選択しました');

      // メイン画面へ
      this._showMain();
    },

    /** メイン画面（スコア入力）を表示 */
    _showMain: function () {
      var regCard  = document.getElementById('gw-gland-register');
      var csScreen = document.getElementById('gw-gland-course-select');
      var mainArea = document.getElementById('gw-gland-main');

      if (regCard)  regCard.classList.add('gw-hidden');
      if (csScreen) csScreen.classList.add('gw-hidden');
      if (mainArea) mainArea.classList.remove('gw-hidden');

      // プレイヤー欄を更新
      this._updatePlayerBarName();

      // 入力モード切替ボタン状態更新
      this._syncModeButtons();

      // スコア入力UI描画
      this._renderScoreUI();

      // 同伴者リスト描画
      this._renderCompanionList();
    },

    /** 入力モード切替（シンプル/カウンター） ★Stage2完全復元 */
    _setInputMode: function (mode) {
      this._state.inputMode = mode;
      GW.Core.Storage.set(GW.Core.Config.KEYS.INPUT_MODE, mode);
      this._syncModeButtons();
      this._renderScoreUI();
      GW.Core.UI.toast(mode === 'simple' ? 'シンプルモード' : 'カウンターモード');
    },

    /** パット記録モード切替 */
    _setPuttMode: function (mode) {
      this._state.puttMode = mode;
      GW.Core.Storage.set(GW.Core.Config.KEYS.PUTT_MODE, mode);
      this._syncPuttButtons();
      this._renderScoreUI();
      GW.Core.UI.toast('パット記録: ' + (mode === 'on' ? 'ON' : 'OFF'));
    },

    _syncModeButtons: function () {
      var simpleBtn = document.getElementById('gw-mode-simple');
      var counterBtn = document.getElementById('gw-mode-counter');
      if (simpleBtn) simpleBtn.classList.toggle('active', this._state.inputMode === 'simple');
      if (counterBtn) counterBtn.classList.toggle('active', this._state.inputMode === 'counter');
    },

    _syncPuttButtons: function () {
      var offBtn = document.getElementById('gw-putt-off');
      var onBtn  = document.getElementById('gw-putt-on');
      if (offBtn) offBtn.classList.toggle('active', this._state.puttMode === 'off');
      if (onBtn)  onBtn.classList.toggle('active', this._state.puttMode === 'on');
    },

    _syncDispButtons: function () {
      var strokeBtn  = document.getElementById('gw-disp-stroke');
      var pardiffBtn = document.getElementById('gw-disp-pardiff');
      var symbolBtn  = document.getElementById('gw-disp-symbol');
      if (strokeBtn)  strokeBtn.classList.toggle('active', this._state.displayMode === 'stroke');
      if (pardiffBtn) pardiffBtn.classList.toggle('active', this._state.displayMode === 'pardiff');
      if (symbolBtn)  symbolBtn.classList.toggle('active', this._state.displayMode === 'symbol');
    },

    _switchSubtab: function (tab) {
      this._state.subtab = tab;
      var scoreTab = document.getElementById('gw-subtab-score');
      var histTab  = document.getElementById('gw-subtab-hist');
      var scoreContent = document.getElementById('gw-subtab-content-score');
      var histContent  = document.getElementById('gw-subtab-content-hist');

      if (scoreTab) scoreTab.classList.toggle('active', tab === 'score');
      if (histTab)  histTab.classList.toggle('active', tab === 'hist');
      if (scoreContent) scoreContent.classList.toggle('gw-hidden', tab !== 'score');
      if (histContent)  histContent.classList.toggle('gw-hidden', tab !== 'hist');
    },

    /** スコア入力UI描画（シンプル or カウンター） ★Stage2完全復元 */
    _renderScoreUI: function () {
      var area = document.getElementById('gw-input-area');
      if (!area) return;

      var hole = this._state.currentHole;
      var me = this._getMePlayer();
      var stroke = me && me.scores ? (me.scores[hole - 1] || null) : null;
      var putt = (this._state.puttMode === 'on' && me && me.putts) ? (me.putts[hole - 1] || null) : null;

      if (this._state.inputMode === 'counter') {
        area.innerHTML = this._buildCounterUI(hole, stroke);
      } else {
        area.innerHTML = this._buildSimpleUI(hole, stroke, putt);
      }

      // ヘッダーコース名更新
      this._updateHeaderName();
    },

    /** シンプルモードUI生成 ★Stage2正しい実装：PARからスタート→-/+調整、パットは内訳記録 */
    _buildSimpleUI: function (hole, stroke, putt) {
      var totalHoles = this._state.totalHoles;
      var par = this._getHolePar ? this._getHolePar(hole) : 4;
      // ★シンプルモードはPAR値をデフォルト表示（未入力時はPAR）
      var dispStroke = (stroke !== null && stroke !== undefined) ? stroke : par;
      var parDiff = dispStroke - par;
      var parDiffStr = '';
      if (parDiff === 0) parDiffStr = '（PAR）';
      else parDiffStr = '（' + (parDiff > 0 ? '+' : '') + parDiff + '）';

      return '<div class=\"gw-simple-input\">' +
        '<div class=\"gw-simple-hole-info\">' +
          '<button class=\"gw-hole-nav-btn\" data-action=\"gland-prev-hole\" ' + (hole <= 1 ? 'disabled' : '') + '>◀</button>' +
          '<div class=\"gw-simple-hole-center\">' +
            '<div class=\"gw-simple-hole-num\">Hole ' + hole + '</div>' +
            '<div class=\"gw-simple-par\">PAR ' + par + '</div>' +
          '</div>' +
          '<button class=\"gw-hole-nav-btn\" data-action=\"gland-next-hole\" ' + (hole >= totalHoles ? 'disabled' : '') + '>▶</button>' +
        '</div>' +
        '<div class=\"gw-simple-score-display\" id=\"gw-simple-score-display\">' +
          '<div class=\"gw-simple-score-val\">' + dispStroke + '</div>' +
          '<div class=\"gw-simple-pardiff\">' + parDiffStr + '</div>' +
        '</div>' +
        '<div class=\"gw-simple-buttons\">' +
          '<button class=\"gw-btn-minus\" data-action=\"gland-stroke-minus\">−</button>' +
          '<button class=\"gw-btn-plus\"  data-action=\"gland-stroke-plus\">+</button>' +
        '</div>' +
        (this._state.puttMode === 'on' ? '<div class=\"gw-simple-putt-section\">' +
          '<div class=\"gw-simple-putt-label\">内訳：パット数 <b>' + (putt !== null && putt !== undefined ? putt : 0) + '</b></div>' +
          '<div class=\"gw-simple-putt-row\">' +
            '<button class=\"gw-btn-putt-minus\" data-action=\"gland-putt-minus\">− パット</button>' +
            '<button class=\"gw-btn-putt-plus\"  data-action=\"gland-putt-plus\">+ パット</button>' +
          '</div>' +
        '</div>' : '') +
        '<div class=\"gw-simple-holes-grid\">' + this._buildHolesGridSimple() + '</div>' +
      '</div>';
    },

    /** カウンターモードUI生成（初心者用） ★Stage2正しい実装：ショット数+パット数を別々にカウント→自動合算 */
    _buildCounterUI: function (hole, stroke) {
      var totalHoles = this._state.totalHoles;
      var par = this._getHolePar ? this._getHolePar(hole) : 4;
      var me = this._getMePlayer();
      var shots = (me && me.shots) ? (me.shots[hole - 1] || 0) : 0;
      var putts = (me && me.putts) ? (me.putts[hole - 1] || 0) : 0;
      var total = shots + putts;

      // PAR差表示
      var parDiff = total - par;
      var parDiffStr = '';
      if (total > 0) {
        if (parDiff === 0) parDiffStr = '（PAR）';
        else parDiffStr = '（' + (parDiff > 0 ? '+' : '') + parDiff + '）';
      }

      return '<div class=\"gw-counter-area\">' +
        '<div class=\"gw-counter-hole-row\">' +
          '<button class=\"gw-hole-nav-btn\" data-action=\"gland-prev-hole\" ' + (hole <= 1 ? 'disabled' : '') + '>◀</button>' +
          '<div class=\"gw-counter-hole-center\">' +
            '<div class=\"gw-counter-hole-num\">Hole ' + hole + '</div>' +
            '<div class=\"gw-counter-par\">PAR ' + par + '</div>' +
          '</div>' +
          '<button class=\"gw-hole-nav-btn\" data-action=\"gland-next-hole\" ' + (hole >= totalHoles ? 'disabled' : '') + '>▶</button>' +
        '</div>' +

        // ★合計スコア表示（自動合算）
        '<div class=\"gw-counter-total-display\">' +
          '<div class=\"gw-counter-total-label\">合計スコア</div>' +
          '<div class=\"gw-counter-total-val\">' + (total > 0 ? total : '0') + '</div>' +
          '<div class=\"gw-counter-total-pardiff\">' + parDiffStr + '</div>' +
          '<div class=\"gw-counter-breakdown\">' +
            '<span class=\"gw-counter-breakdown-item shot-item\">🏌️ ショット: <b>' + shots + '</b></span>' +
            '<span class=\"gw-counter-breakdown-plus\">+</span>' +
            '<span class=\"gw-counter-breakdown-item putt-item\">⛳ パット: <b>' + putts + '</b></span>' +
          '</div>' +
        '</div>' +

        // ★ショット+1 / パット+1 を別ボタンに（ジミーちゃん仕様）
        '<div class=\"gw-counter-dual-buttons\">' +
          '<button class=\"gw-counter-btn-big shot\" data-action=\"gland-counter-shot\">' +
            '<div class=\"gw-cbb-icon\">🏌️</div>' +
            '<div class=\"gw-cbb-label\">ショット</div>' +
            '<div class=\"gw-cbb-plus\">+1</div>' +
          '</button>' +
          '<button class=\"gw-counter-btn-big putt\" data-action=\"gland-counter-putt\">' +
            '<div class=\"gw-cbb-icon\">⛳</div>' +
            '<div class=\"gw-cbb-label\">パット</div>' +
            '<div class=\"gw-cbb-plus\">+1</div>' +
          '</button>' +
        '</div>' +

        // CLR（このホールをリセット）
        '<div class=\"gw-counter-clr-row\">' +
          '<button class=\"gw-counter-btn-clr\" data-action=\"gland-counter-clr\">🔄 このホールをクリア</button>' +
        '</div>' +

        '<div class=\"gw-simple-holes-grid\">' + this._buildHolesGridSimple() + '</div>' +
      '</div>';
    },

    _buildHolesGridSimple: function () {
      var total = this._state.totalHoles;
      var me = this._getMePlayer();
      var html = '';
      for (var h = 1; h <= total; h++) {
        var score = me && me.scores ? me.scores[h - 1] : null;
        var cls = score !== null ? 'gw-hole-btn-filled' : 'gw-hole-btn-empty';
        var label = score !== null ? score : '-';
        html += '<button class=\"gw-hole-btn ' + cls + '\" data-action=\"gland-jump-hole\" data-hole=\"' + h + '\">' + label + '</button>';
      }
      return html;
    },

    /** スコア加算（シンプルモード） ★Stage2正しい実装：PARからのスタートで-/+ */
    _chgStroke: function (delta) {
      var hole = this._state.currentHole;
      var me = this._getMePlayer();
      if (!me || !me.scores) return;

      var par = this._getHolePar ? this._getHolePar(hole) : 4;
      var cur = me.scores[hole - 1];
      // 未入力ならPARからスタート
      if (cur === null || cur === undefined) cur = par;
      var next = Math.max(1, cur + delta);
      me.scores[hole - 1] = next;

      this._recalcMeTotals();
      this._renderScoreUI();
      this._renderCompanionList();
      this._autoSaveMyScore();
      GW.Core.UI.haptic();
    },

    /** パット加算 */
    _chgPutt: function (delta) {
      if (this._state.puttMode !== 'on') return;
      var hole = this._state.currentHole;
      var me = this._getMePlayer();
      if (!me || !me.putts) return;

      var cur = me.putts[hole - 1];
      if (cur === null || cur === undefined) cur = 0;
      me.putts[hole - 1] = Math.max(0, cur + delta);

      this._renderScoreUI();
      this._autoSaveMyScore();
      GW.Core.UI.haptic();
    },

    /** カウンターモード：ショット +1（フェアウェイ・グリーンに乗るまで） ★Stage2正しい実装 */
    _counterShotAdd: function () {
      var hole = this._state.currentHole;
      var me = this._getMePlayer();
      if (!me) return;

      // shots配列を初期化（存在しなければ）
      if (!me.shots) me.shots = this._createEmptyScores(this._state.totalHoles, 0);
      if (!me.putts) me.putts = this._createEmptyScores(this._state.totalHoles, 0);

      var cur = me.shots[hole - 1];
      if (cur === null || cur === undefined) cur = 0;
      me.shots[hole - 1] = cur + 1;

      // 自動合算：shots + putts = scores（スコアカードに反映）
      me.scores[hole - 1] = (me.shots[hole - 1] || 0) + (me.putts[hole - 1] || 0);

      this._recalcMeTotals();
      this._renderScoreUI();
      this._renderCompanionList();
      this._autoSaveMyScore();
      GW.Core.UI.haptic();
    },

    /** カウンターモード：パット +1 ★Stage2正しい実装 */
    _counterPuttAdd: function () {
      var hole = this._state.currentHole;
      var me = this._getMePlayer();
      if (!me) return;

      if (!me.shots) me.shots = this._createEmptyScores(this._state.totalHoles, 0);
      if (!me.putts) me.putts = this._createEmptyScores(this._state.totalHoles, 0);

      var cur = me.putts[hole - 1];
      if (cur === null || cur === undefined) cur = 0;
      me.putts[hole - 1] = cur + 1;

      // 自動合算：shots + putts = scores（スコアカードに反映）
      me.scores[hole - 1] = (me.shots[hole - 1] || 0) + (me.putts[hole - 1] || 0);

      this._recalcMeTotals();
      this._renderScoreUI();
      this._renderCompanionList();
      this._autoSaveMyScore();
      GW.Core.UI.haptic();
    },

    /** カウンターモード：CLR（このホールをクリア） ★Stage2正しい実装 */
    _counterClr: function () {
      var hole = this._state.currentHole;
      var me = this._getMePlayer();
      if (!me) return;

      if (!me.shots) me.shots = this._createEmptyScores(this._state.totalHoles, 0);
      if (!me.putts) me.putts = this._createEmptyScores(this._state.totalHoles, 0);

      me.shots[hole - 1] = 0;
      me.putts[hole - 1] = 0;
      me.scores[hole - 1] = null;  // 未入力扱い

      this._recalcMeTotals();
      this._renderScoreUI();
      this._renderCompanionList();
      this._autoSaveMyScore();
      GW.Core.UI.haptic();
    },

    /** ホール移動 */
    _prevHole: function () {
      if (this._state.currentHole > 1) {
        this._state.currentHole--;
        this._renderScoreUI();
      }
    },

    _nextHole: function () {
      if (this._state.currentHole < this._state.totalHoles) {
        this._state.currentHole++;
        this._renderScoreUI();
      }
    },

    _jumpToHole: function (hole) {
      if (hole >= 1 && hole <= this._state.totalHoles) {
        this._state.currentHole = hole;
        this._renderScoreUI();
      }
    },

    _setDisplayMode: function (mode) {
      this._state.displayMode = mode;
      GW.Core.Storage.set(GW.Core.Config.KEYS.DISPLAY_MODE, mode);
      this._syncDispButtons();
      this._renderScoreUI();
      this._renderCompanionList();
    },

    _formatStroke: function (stroke, hole, mode) {
      if (stroke === null || stroke === undefined) return '-';
      if (mode === 'stroke') return stroke;
      if (mode === 'pardiff') {
        var par = this._getHolePar ? this._getHolePar(hole) : 4;
        var diff = stroke - par;
        if (diff === 0) return 'E';
        return (diff > 0 ? '+' : '') + diff;
      }
      if (mode === 'symbol') {
        var par = this._getHolePar ? this._getHolePar(hole) : 4;
        var diff = stroke - par;
        if (diff <= -3) return '🦅'; // イーグル以上
        if (diff === -2) return '🐦'; // バーディ
        if (diff === -1) return '🟢'; // パーに負ける
        if (diff === 0) return '⚪';  // パー
        if (diff === 1) return '🔴'; // ボギー
        if (diff === 2) return '🟠'; // ダブルボギー
        return '⚫';
      }
      return stroke;
    },

    _openHolePicker: function () {
      GW.Core.UI.showModal('gw-hole-picker-modal');
    },

    _closeHolePicker: function () {
      GW.Core.UI.hideModal('gw-hole-picker-modal');
    },

    _closeHoleZoom: function () {
      GW.Core.UI.hideModal('gw-hole-zoom-modal');
    },

    _finishRound: function () {
      var me = this._getMePlayer();
      if (!me) return;

      var total = me.totalStrokes || 0;
      var diff  = me.parDiff || 0;

      GW.Core.UI.confirm(
        'ラウンドを終了',
        '合計: ' + total + '打 (PAR ' + (diff >= 0 ? '+' : '') + diff + ')\n\nこのラウンドを保存しますか？',
        function () {
          // 保存処理
          var profile = GW.Core.Auth.getProfile();
          if (!profile.recentRounds) profile.recentRounds = [];
          profile.recentRounds.unshift({
            date:   new Date().toLocaleDateString('ja-JP'),
            course: GW.Modules.GLand._getCourseName(),
            total:  total,
            diff:   diff
          });
          profile.recentRounds = profile.recentRounds.slice(0, 20);
          GW.Core.Auth.setProfile(profile);

          GW.Core.UI.toast('✅ ラウンドを保存しました');
          GW.Core.Router.go('home');
        }
      );
    },

    // ── 内部ヘルパー ──
    _getMePlayer: function () {
      return this._state.players.find(function (p) { return p.isMe; }) || null;
    },

    _createEmptyScores: function (count, defaultVal) {
      var arr = [];
      for (var i = 0; i < count; i++) arr.push(defaultVal !== undefined ? defaultVal : null);
      return arr;
    },

    _recalcMeTotals: function () {
      var me = this._getMePlayer();
      if (!me || !me.scores) return;
      var total = 0;
      var parTotal = 0;
      for (var i = 0; i < me.scores.length; i++) {
        var s = me.scores[i];
        if (s !== null && s !== undefined) {
          total += s;
          var par = this._getHolePar ? this._getHolePar(i + 1) : 4;
          parTotal += par;
        }
      }
      me.totalStrokes = total;
      me.parDiff = total - parTotal;

      var totalEl = document.getElementById('gw-me-total');
      if (totalEl) {
        totalEl.textContent = total + ' / ' + (me.parDiff >= 0 ? '+' : '') + me.parDiff;
      }
    },

    _getCourseName: function () {
      var names = {
        'rokko-international': '六甲国際パブリック',
        'rokko-west': '西コース',
        'rokko-east': '東コース'
      };
      return names[this._state.courseId] || this._state.courseId || '不明';
    },

    _getHolePar: function (hole) {
      // 簡易PAR表（六甲国際パブリック想定）
      var pars = [4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4, 4];
      if (hole >= 1 && hole <= 18) return pars[hole - 1] || 4;
      return 4;
    },

    _autoSaveMyScore: function () {
      var me = this._getMePlayer();
      if (!me) return;
      GW.Core.Cache.saveMyScores(me.id, me.scores);
    },

    // ── 同伴者リスト描画 ★Stage2新規追加 ──
    _renderCompanionList: function () {
      var body = document.getElementById('gw-mate-table-body');
      if (!body) return;

      var players = this._state.players;
      var totalHoles = this._state.totalHoles;
      var mode = this._state.displayMode;
      var currentHole = this._state.currentHole;

      if (players.length === 0) {
        body.innerHTML = '<div style=\"color:var(--text-sub);font-size:14px;padding:10px;\">同伴者がいません</div>';
        return;
      }

      var html = '<table class=\"gw-companion-table\">';
      
      // ヘッダー行
      html += '<thead><tr>' +
        '<th class=\"gw-ct-name\">プレイヤー</th>';
      for (var h = 1; h <= totalHoles; h++) {
        html += '<th class=\"gw-ct-hole ' + (h === currentHole ? 'current' : '') + '\">' + h + '</th>';
      }
      html += '<th class=\"gw-ct-total\">TOTAL</th></tr></thead>';

      // ボディ行
      html += '<tbody>';
      for (var i = 0; i < players.length; i++) {
        var p = players[i];
        var rowClass = p.isMe ? 'gw-ct-row-me' : 'gw-ct-row-mate';
        
        // プレイヤー名セル（タップで名前編集ポップアップ ★Stage2重点対応）
        var nameCell = '<td class=\"gw-ct-name-cell\" ' + 
          'data-action=\"open-companion-modal\" ' +
          'data-player-id=\"' + p.id + '\" ' +
          'data-player-name=\"' + GW.Core.UI.escapeHtml(p.name) + '\" ' +
          'data-is-new=\"false\"' +
          '>' +
          '<span class=\"gw-ct-name-text\">' + GW.Core.UI.escapeHtml(p.name) + '</span>' +
          (p.isMe ? ' <span class=\"gw-ct-me-badge\">自分</span>' : '') +
        '</td>';

        html += '<tr class=\"' + rowClass + '\">' + nameCell;

        for (var h2 = 1; h2 <= totalHoles; h2++) {
          var s = p.scores && p.scores[h2 - 1] !== null && p.scores[h2 - 1] !== undefined ? p.scores[h2 - 1] : null;
          var disp = s !== null ? this._formatStroke(s, h2, mode) : '-';
          html += '<td class=\"gw-ct-hole ' + (h2 === currentHole ? 'current' : '') + '\">' + disp + '</td>';
        }

        var total = p.totalStrokes !== undefined ? p.totalStrokes : this._calcTotal(p.scores);
        html += '<td class=\"gw-ct-total\">' + (total > 0 ? total : '-') + '</td>';
        html += '</tr>';
      }
      html += '</tbody></table>';

      // 「+ 同伴者を追加」ボタンを末尾に
      html += '<button class=\"gw-add-companion-btn\" ' +
        'data-action=\"open-companion-modal\" ' +
        'data-player-id=\"\" ' +
        'data-player-name=\"\" ' +
        'data-is-new=\"true\">+ 同伴者を追加</button>';

      body.innerHTML = html;
    },

    /** 新規同伴者を追加（ポップアップから呼び出し） ★Stage2重点対応 */
    _addCompanion: function (name) {
      var id = 'mate-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 0xFFFF).toString(16);
      var newPlayer = {
        id: id,
        name: name,
        scores: this._createEmptyScores(this._state.totalHoles),
        putts: this._state.puttMode === 'on' ? this._createEmptyScores(this._state.totalHoles, 0) : null,
        isMe: false,
        parDiff: 0,
        totalStrokes: 0
      };

      this._state.players.push(newPlayer);
      GW.Core.UI.toast(name + ' を追加しました');
      this._renderCompanionList();
    },

    /** 同伴者の名前を更新（ポップアップから呼び出し） ★Stage2重点対応 */
    _updateCompanionName: function (playerId, name) {
      var player = this._state.players.find(function (p) { return p.id === playerId; });
      if (player) {
        player.name = name;
        GW.Core.UI.toast('名前を変更しました');
        
        // ヘッダーも更新
        this._updateHeaderName();
        
        this._renderCompanionList();
      }
    },

    /** 同伴者を削除 */
    _removeCompanion: function (playerId) {
      var idx = this._state.players.findIndex(function (p) { return p.id === playerId; });
      if (idx >= 0) {
        var removed = this._state.players.splice(idx, 1);
        GW.Core.UI.toast((removed[0] && removed[0].name) + ' を削除しました');
        this._renderCompanionList();
      }
    },

    _calcTotal: function (scores) {
      if (!scores) return 0;
      var total = 0;
      for (var i = 0; i < scores.length; i++) {
        if (scores[i] !== null && scores[i] !== undefined) total += scores[i];
      }
      return total;
    },

    /** ラウンド中か判定（FAB表示制御用） */
    isInRound: function () {
      return this._state.inRound && !!this._state.courseId;
    }
  };

  // ════════════════════════════════════════════════════════════════
  // 【MODULE 3】GW.Modules.QRScanner - QRコードスキャナー
  // ════════════════════════════════════════════════════════════════
  GW.Modules.QRScanner = {
    _stream: null,

    start: function () {
      var video = document.getElementById('gw-qr-video');
      var manualInput = document.getElementById('gw-qr-manual-id');
      if (!video) return;

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        GW.Core.UI.toast('カメラ機能に対応していません');
        if (manualInput) manualInput.parentElement.classList.remove('gw-hidden');
        return;
      }

      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        .then(function (stream) {
          GW.Modules.QRScanner._stream = stream;
          video.srcObject = stream;
          video.play();
          GW.Modules.QRScanner._startDetection();
        })
        .catch(function (err) {
          console.warn('[QRScanner] camera error:', err);
          GW.Core.UI.toast('カメラを起動できませんでした');
          if (manualInput) manualInput.parentElement.classList.remove('gw-hidden');
        });
    },

    _startDetection: function () {
      var video = document.getElementById('gw-qr-video');
      if (!video) return;

      var canvas = document.createElement('canvas');
      var ctx = canvas.getContext('2d');
      var self = this;

      function tick() {
        if (!video.readyState || video.readyState < 2) {
          requestAnimationFrame(tick);
          return;
        }
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // 简易QRコード検出（實際運用ではライブラリを使用）
        // 这里是占位符，实际実装需要zxing-js/library或其他库
        requestAnimationFrame(tick);
      }

      requestAnimationFrame(tick);
    },

    submitManual: function (groupId) {
      if (!groupId) {
        GW.Core.UI.toast('グループIDを入力してください');
        return;
      }

      GW.Core.UI.hideModal('gw-modal-qr-scanner');
      this.stopCamera();

      GW.Core.UI.toast('グループに参加しました: ' + groupId);
      // 実際のグループ参加処理はここに実装
    },

    stopCamera: function () {
      if (this._stream) {
        this._stream.getTracks().forEach(function (track) { track.stop(); });
        this._stream = null;
      }
      var video = document.getElementById('gw-qr-video');
      if (video) video.srcObject = null;
    }
  };

  // ════════════════════════════════════════════════════════════════
  // 【MODULE 4】GW.Modules.MyPage - マイページ
  // ════════════════════════════════════════════════════════════════
  GW.Modules.MyPage = {
    render: function () {
      this._renderProfile();
      this._renderUsage();
    },

    _renderProfile: function () {
      var profile = GW.Core.Auth.getProfile();
      var nameEl = document.getElementById('gw-myp-nickname');
      if (nameEl) nameEl.textContent = profile && profile.nickname ? profile.nickname : '未設定';

      var realEl = document.getElementById('gw-myp-realname');
      if (realEl) realEl.textContent = profile && profile.realname ? profile.realname : '未入力';

      var uidEl = document.getElementById('gw-myp-uid');
      if (uidEl) uidEl.textContent = GW.Core.Auth.getUserId() || '-';

      var stateEl = document.getElementById('gw-myp-state');
      if (stateEl) {
        var state = GW.Core.Auth.getState();
        stateEl.textContent = state === 'guest' ? 'ゲスト' : state === 'backed_up' ? 'バックアップ済み' : state;
      }
    },

    _renderUsage: function () {
      var countEl = document.getElementById('gw-myp-use-count');
      if (countEl) countEl.textContent = GW.Core.Auth.getUseCount() + ' 回';
    },

    openBackupModal: function () {
      GW.Core.UI.showModal('gw-modal-backup');
    },

    showPWAGuide: function () {
      GW.Core.UI.showModal('gw-modal-pwa');
    },

    triggerPWAInstall: function () {
      // PWAインストールプロンプトはブラウザが自動表示するため、ここでは何もしない
      GW.Core.UI.toast('画面に従ってください');
    }
  };

  // ════════════════════════════════════════════════════════════════
  // 【MODULE 5】GW.Modules.GCompete - 仮stub（Coming Soon）
  // ════════════════════════════════════════════════════════════════
  GW.Modules.GCompete = { render: function () {} };

  // ════════════════════════════════════════════════════════════════
  // 【MODULE 6】GW.Modules.GTown - 仮stub（Coming Soon）
  // ════════════════════════════════════════════════════════════════
  GW.Modules.GTown = { render: function () {} };

}());