/******************************************************************
 * G-WORLD - Golf (G-LAND) Widget Body
 *
 * 設計意図：
 *   - スコア入力・履歴・同伴メンバー表の3機能を統括
 *   - 各機能はサブモジュール（Score / History / Mates）として分離
 *   - Router からは render() のみが呼ばれる
 *   - 他モジュールへの直接参照禁止（Router 経由）
 *
 * 状態管理：
 *   - GW.Widgets.Golf.state にラウンド進行中のデータを保持
 *   - サーバ送信前のローカル状態は state.scores が唯一の真実
 *
 * 【サブモジュール構成】
 *   GolfWidget.js   - 本ファイル（プレイヤー登録 / メイン画面 / サブタブ切替）
 *   GolfScore.js    - スコア入力（v4.7の差分更新ロジック継承）
 *   GolfMates.js    - 同伴メンバー表
 *   GolfHistory.js  - 履歴サブモジュール
 *   index.js        - 全部結合してレジストリ登録
 ******************************************************************/
(function () {
  'use strict';

  GW.Widgets.Golf = GW.Widgets.Golf || {};

  // ── ラウンド進行中の状態（モジュール内のみで使用） ──
  GW.Widgets.Golf.state = {
    player:        null,          // 現在のプレイヤー情報
    scores:        [],            // 18ホール分のスコア [{stroke, putt}, ...]
    currentHole:   0,             // 現在表示中のホール（0-17）
    groupMates:    [],            // 同伴メンバー
    displayMode:   'stroke',      // 'stroke' | 'pardiff' | 'symbol'
    subtab:        'score',       // 'score' | 'hist'
    _saveTimer:    {},            // ホール別のデバウンスタイマー
    _matesTimer:   null,          // 同伴メンバー表ポーリングタイマー
    _historyExpanded: {}          // 履歴アコーディオン展開状態
  };

  /** ★Widget 本体（Router からの唯一のエントリポイント） */
  GW.Widgets.Golf.Widget = {
    __widgetName__: 'GLand',

    // state への参照（外部から書き換え禁止だがアクセス可）
    get state () { return GW.Widgets.Golf.state; },

    // サブモジュールへのアクセサ（index.js で結線される）
    Score:   null,
    Mates:   null,
    History: null,

    /**
     * ★Router からの唯一のエントリポイント
     *   画面に入る時に呼ばれる。
     *   - プレイヤー未登録なら登録カードを表示
     *   - 登録済みならスコア入力UIを表示
     */
    render: function (params) {
      var state = GW.Widgets.Golf.state;

      // 表示モードを localStorage から復元
      var savedDisp = GW.Core.Storage.get(GW.Core.Config.KEYS.DISPLAY_MODE);
      if (savedDisp && ['stroke', 'pardiff', 'symbol'].indexOf(savedDisp) >= 0) {
        state.displayMode = savedDisp;
      }

      // プレイヤー情報をlocalStorageから復元
      var savedPlayer = GW.Core.Storage.getJSON(GW.Core.Config.KEYS.PLAYER);
      if (savedPlayer && savedPlayer.playerId) {
        state.player = savedPlayer;
        this._enterMain();
      } else {
        this._showRegister();
      }
    },

    /** 現在ラウンド中か？（Router から FAB 表示判定に使われる） */
    isInRound: function () {
      var state = GW.Widgets.Golf.state;
      return !!(state.player && state.player.playerId);
    },

    /** ===== 登録カード（プレイヤー未登録時） ===== */
    _showRegister: function () {
      document.getElementById('gw-gland-register').classList.remove('gw-hidden');
      document.getElementById('gw-gland-main').classList.add('gw-hidden');

      // コース選択肢を構築
      var courseSel = document.getElementById('gw-reg-course');
      if (courseSel) {
        var courses = (GW.Core.State && GW.Core.State.courses) || [];
        var activeId = GW.Core.State && GW.Core.State.activeCourseId;
        if (courses.length > 0) {
          courseSel.innerHTML = courses.map(function (c) {
            var sel = (c.id === activeId) ? ' selected' : '';
            return '<option value="' + GW.Core.UI.escapeHtml(c.id) + '"' + sel + '>' +
                   GW.Core.UI.escapeHtml(c.name) + '</option>';
          }).join('');
        } else {
          courseSel.innerHTML = '<option value="">コースが登録されていません</option>';
        }
      }

      // プロフィール情報があれば入力欄に復元（前回の入力を覚えている）
      var prof = GW.Core.Auth.getProfile();
      var nickEl  = document.getElementById('gw-reg-nick');
      var realEl  = document.getElementById('gw-reg-real');
      var groupEl = document.getElementById('gw-reg-group');
      if (nickEl  && prof.nickname)  nickEl.value  = prof.nickname;
      if (realEl  && prof.realName)  realEl.value  = prof.realName;
      if (groupEl && prof.groupName) groupEl.value = prof.groupName;
    },

    /**
     * 登録ボタン押下時の処理
     *   設計憲法・第1条：楽観的UI - 仮IDで即遷移、サーバ応答で正式IDに置換
     */
    _register: function () {
      var state = GW.Widgets.Golf.state;
      var courseSel  = document.getElementById('gw-reg-course');
      var nickEl     = document.getElementById('gw-reg-nick');
      var realEl     = document.getElementById('gw-reg-real');
      var groupEl    = document.getElementById('gw-reg-group');

      var courseId  = courseSel ? courseSel.value : '';
      var nickname  = nickEl  ? nickEl.value.trim()  : '';
      var realName  = realEl  ? realEl.value.trim()  : '';
      var groupName = groupEl ? groupEl.value.trim() : '';

      if (!courseId || !nickname || !realName || !groupName) {
        GW.Core.UI.toast('全項目を入力してください');
        return;
      }

      // プロフィール情報を localStorage に保存（次回入力時の便利機能）
      GW.Core.Auth.setProfile({
        nickname:  nickname,
        realName:  realName,
        groupName: groupName
      });

      // ★楽観的UI: 仮IDを発行して即遷移
      var tmpPlayerId = 'P_TMP_' + Date.now() + Math.floor(Math.random() * 1000);
      state.player = {
        playerId:   tmpPlayerId,
        userId:     GW.Core.Auth.getUserId(),
        gwUserId:   GW.Core.Auth.getUserId(),
        nickname:   nickname,
        realName:   realName,
        groupName:  groupName,
        courseId:   courseId,
        isTemporary: true
      };
      GW.Core.Storage.setJSON(GW.Core.Config.KEYS.PLAYER, state.player);
      this._enterMain();

      // ★サーバには裏で登録依頼。応答で正式IDに差し替え
      var self = this;
      GW.Core.Api.fire('gland.register', {
        courseId:  courseId,
        nickname:  nickname,
        realName:  realName,
        groupName: groupName,
        gwUserId:  GW.Core.Auth.getUserId()
      }, function (res) {
        if (!res || !res.ok) {
          if (res && res.playerId) {
            // 同名既存：そのIDを採用
            state.player.playerId = res.playerId;
            state.player.isTemporary = false;
            GW.Core.Storage.setJSON(GW.Core.Config.KEYS.PLAYER, state.player);
          } else {
            GW.Core.UI.toast(res && res.msg ? res.msg : '登録失敗');
          }
          return;
        }
        // 正式IDに差し替え
        state.player.playerId = res.playerId;
        if (res.userId) state.player.userId = res.userId;
        state.player.isTemporary = false;
        GW.Core.Storage.setJSON(GW.Core.Config.KEYS.PLAYER, state.player);
      });
    },

    /** ===== メイン画面（スコア入力エリア）に入る ===== */
    _enterMain: function () {
      var state = GW.Widgets.Golf.state;
      document.getElementById('gw-gland-register').classList.add('gw-hidden');
      document.getElementById('gw-gland-main').classList.remove('gw-hidden');

      // ヘッダーのコース名・グループ名を反映
      this._updateHeaderInfo();

      // スコアをキャッシュから復元
      var cachedScores = GW.Core.Cache.loadMyScores(state.player.playerId);
      if (cachedScores && cachedScores.length === 18) {
        state.scores = cachedScores;
      } else {
        state.scores = [];
        for (var i = 0; i < 18; i++) {
          state.scores.push({ stroke: 0, putt: 0 });
        }
      }

      // 現在ホールをリセット
      state.currentHole = 0;

      // プレイヤー名を表示
      var meNameEl = document.getElementById('gw-me-name');
      if (meNameEl) {
        meNameEl.textContent = state.player.nickname + '(' + state.player.groupName + ')';
      }

      // サブタブ初期化
      state.subtab = 'score';
      if (this.Score) this.Score._render();

      // FAB 表示
      var fab = document.getElementById('gw-fab-jump');
      if (fab) fab.classList.remove('gw-hidden');

      // 仮IDのうちはサーバー取得スキップ
      var self = this;
      if (!state.player.isTemporary) {
        GW.Core.Api.call('gland.getMyScores', { playerId: state.player.playerId })
          .then(function (res) {
            var scores = res && res.scores ? res.scores : null;
            if (scores && scores.length >= 18) {
              var changed = false;
              for (var i = 0; i < 18; i++) {
                if (!state.scores[i] ||
                    state.scores[i].stroke !== scores[i].stroke ||
                    state.scores[i].putt   !== scores[i].putt) {
                  changed = true;
                  break;
                }
              }
              if (changed) {
                state.scores = scores;
                if (self.Score) self.Score._updateCells();
                GW.Core.Cache.saveMyScores(state.player.playerId, scores);
              }
            }
          })
          .catch(function () {});
      }
    },

    /** ヘッダー情報を更新 */
    _updateHeaderInfo: function () {
      var state = GW.Widgets.Golf.state;
      var cnEl = document.getElementById('gw-header-course');
      var gnEl = document.getElementById('gw-header-group');
      if (cnEl && state.player) {
        var courses = (GW.Core.State && GW.Core.State.courses) || [];
        var course = courses.find(function (c) { return c.id === state.player.courseId; });
        cnEl.textContent = course ? course.name : '';
      }
      if (gnEl && state.player) {
        gnEl.textContent = state.player.groupName || '';
      }
    },

    /** サブタブ切替（'score' or 'hist'） */
    _switchSubtab: function (tab) {
      var state = GW.Widgets.Golf.state;
      state.subtab = tab;

      var scoreBtn = document.getElementById('gw-subtab-score');
      var histBtn  = document.getElementById('gw-subtab-hist');
      var scoreCnt = document.getElementById('gw-subtab-content-score');
      var histCnt  = document.getElementById('gw-subtab-content-hist');
      if (scoreBtn) scoreBtn.classList.toggle('active', tab === 'score');
      if (histBtn)  histBtn.classList.toggle('active', tab === 'hist');
      if (scoreCnt) scoreCnt.classList.toggle('gw-hidden', tab !== 'score');
      if (histCnt)  histCnt.classList.toggle('gw-hidden', tab !== 'hist');

      // FAB はスコア入力サブタブの時のみ
      var fab = document.getElementById('gw-fab-jump');
      if (fab) fab.classList.toggle('gw-hidden', tab !== 'score');

      if (tab === 'hist') {
        // 履歴サブモジュールを呼び出す
        if (this.History) this.History.render();
      } else {
        // スコアタブに戻ったら Mates ポーリング再開のため再描画
        if (this.Score) this.Score._render();
      }

      // 履歴タブに移った時は Mates ポーリングを停止
      if (tab !== 'score' && this.Mates) {
        this.Mates.stopPolling();
      }
    },

    /** ネットワーク復帰時の処理（Core から呼ばれる） */
    onOnline: function () {
      var state = GW.Widgets.Golf.state;
      if (!state.player || !state.player.playerId) return;
      if (state.player.isTemporary) return;
      var self = this;
      GW.Core.Api.call('gland.getMyScores', { playerId: state.player.playerId })
        .then(function (res) {
          var scores = res && res.scores ? res.scores : null;
          if (scores && scores.length >= 18) {
            state.scores = scores;
            if (self.Score) self.Score._updateCells();
            GW.Core.Cache.saveMyScores(state.player.playerId, scores);
          }
        })
        .catch(function () {});
    },

    /** 画面リサイズ時の処理 */
    onResize: function () {
      if (this.Score && this.Score._centerCurrentHole) {
        this.Score._centerCurrentHole();
      }
    },

    /** モジュール初期化（index.js で結合直後に呼ばれる） */
    init: function () {
      this._registerActions();
    },

    /**
     * data-action ハンドラ登録
     *   GW.Core.Action に G-LAND の全アクションを登録
     */
    _registerActions: function () {
      var self = this;

      GW.Core.Action.registerMany({
        // ── 登録カード ──
        'register': function () { self._register(); },

        // ── スコア入力 ──
        'gland-stroke-minus': function () { self.Score._chgStroke(-1); },
        'gland-stroke-plus':  function () { self.Score._chgStroke(+1); },
        'gland-putt-minus':   function () { self.Score._chgPutt(-1); },
        'gland-putt-plus':    function () { self.Score._chgPutt(+1); },
        'gland-prev-hole':    function () { self.Score._prevHole(); },
        'gland-next-hole':    function () { self.Score._nextHole(); },

        // ── 表示モード切替 ──
        'gland-disp-stroke':  function () { self.Score._setDisplayMode('stroke'); },
        'gland-disp-pardiff': function () { self.Score._setDisplayMode('pardiff'); },
        'gland-disp-symbol':  function () { self.Score._setDisplayMode('symbol'); },

        // ── ホールピッカー ──
        'open-hole-picker':  function () { self.Score._openHolePicker(); },
        'close-hole-picker': function () { self.Score._closeHolePicker(); },
        'gland-jump-hole':   function (el) {
          var h = Number(el.getAttribute('data-hole'));
          self.Score._jumpToHole(h);
        },

        // ── ホール拡大表示（Mates 経由） ──
        'close-hole-zoom':   function () { self.Score._closeHoleZoom(); },
        'gland-hole-zoom':   function (el) {
          var h = Number(el.getAttribute('data-hole'));
          if (self.Mates) self.Mates.openZoom(h);
        },

        // ── ラウンド終了 ──
        'finish-round': function () { self.Score._finishRound(); },

        // ── サブタブ切替 ──
        'gland-subtab-score': function () { self._switchSubtab('score'); },
        'gland-subtab-hist':  function () { self._switchSubtab('hist'); },

        // ── 履歴サブモジュール ──
        'gland-hist-toggle': function (el) {
          var hid = el.getAttribute('data-history-id');
          if (hid && self.History) self.History._toggleDetail(hid);
        },
        'gland-hist-refresh': function () {
          if (self.History) self.History._loadList();
        },

        // ── ラウンド開始（ポータルCTAから） ──
        'start-round': function () { GW.Core.Router.go('gland'); },

        // ── コース選択（旧 cs-* アクション） ──
        'cs-toggle': function (el) {
          self._toggleCourseCard(el.getAttribute('data-course-id'));
        },
        'cs-confirm': function (el) {
          self._confirmCourseSelection(
            el.getAttribute('data-course-id'),
            el.getAttribute('data-variant')
          );
        },
        'cs-back': function () {
          // 登録画面へ戻る
          var csEl = document.getElementById('gw-gland-course-select');
          if (csEl) csEl.classList.add('gw-hidden');
          self._showRegister();
        }
      });

      // サブタブのクリックは HTML 側で data-subtab を使っているため、補完
      var subtabBtns = document.querySelectorAll('[data-subtab]');
      for (var i = 0; i < subtabBtns.length; i++) {
        subtabBtns[i].addEventListener('click', function () {
          var t = this.getAttribute('data-subtab');
          self._switchSubtab(t);
        });
      }

      // 履歴フィルタの change イベント
      var histCourseSel = document.getElementById('gw-hist-course');
      var histPeriodSel = document.getElementById('gw-hist-period');
      if (histCourseSel) {
        histCourseSel.addEventListener('change', function () {
          if (self.History) self.History._onFilterChange();
        });
      }
      if (histPeriodSel) {
        histPeriodSel.addEventListener('change', function () {
          if (self.History) self.History._onFilterChange();
        });
      }
    },

    /** コースカードの展開/折りたたみ（旧 gwCourseSelectModule の機能を吸収） */
    _toggleCourseCard: function (courseId) {
      var wraps = document.querySelectorAll('.gw-cs-course-wrap');
      Array.prototype.forEach.call(wraps, function (w) {
        var card = w.querySelector('.gw-cs-course-card');
        var subs = w.querySelector('.gw-cs-sub-options');
        if (!card || !subs) return;
        if (w.getAttribute('data-course-id') === courseId) {
          var isOpen = card.classList.contains('expanded');
          card.classList.toggle('expanded', !isOpen);
          subs.classList.toggle('gw-hidden', isOpen);
        } else {
          card.classList.remove('expanded');
          subs.classList.add('gw-hidden');
        }
      });
    },

    /** コース確定（サブ選択ボタンタップ時） */
    _confirmCourseSelection: function (courseId, variant) {
      var def = (GW.Widgets.Golf.Courses || {})[courseId];
      if (!def) {
        console.warn('[GW.Golf] unknown course:', courseId);
        return;
      }

      // パブリックトグル状態を取得
      var tg = document.getElementById('gw-cs-public-toggle');
      var isPublic = tg ? tg.checked : true;

      // 選択を localStorage に保存
      GW.Core.Storage.set('gw_public_board', isPublic ? 'true' : 'false');
      GW.Core.Storage.setJSON('gw_selected_course', {
        courseId:    courseId,
        courseName:  def.name,
        variant:     variant,
        boardMode:   isPublic ? 'public' : 'private',
        selectedAt:  Date.now()
      });

      GW.Core.UI.toast('⛳ ' + def.name + '(' + variant + ') を選択');
      GW.Core.UI.haptic();

      // メイン画面へ遷移（登録済みなら）
      var self = this;
      setTimeout(function () {
        var csEl = document.getElementById('gw-gland-course-select');
        if (csEl) csEl.classList.add('gw-hidden');
        if (self.state.player && self.state.player.playerId) {
          self._enterMain();
        } else {
          self._showRegister();
        }
      }, 600);
    }
  };
})();
