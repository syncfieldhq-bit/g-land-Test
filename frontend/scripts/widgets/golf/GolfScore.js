/******************************************************************
 * G-WORLD - Golf Score Submodule
 *
 * ★v4.7 の最大の白眉「updateScoreCellsOnly」をそのまま継承
 *   - スコア変更時に DOM 全体を再構築せず、関係セルだけを差分更新
 *   - 60fps を維持する超軽量UI実装
 *
 * 設計意図：
 *   - chgStroke/chgPutt は即時UI反映 + 裏で Fire-and-Forget 保存
 *   - スコア表示は3モード（stroke / pardiff / symbol）切替可能
 *   - ホール切替は前/次ボタン + ホールピッカー（モーダル）の2系統
 ******************************************************************/
(function () {
  'use strict';

  GW.Widgets.Golf = GW.Widgets.Golf || {};

  GW.Widgets.Golf.Score = {
    // PARに対する記号（旧 SYM_* 定数を継承）
    SYM_ALBATROSS: '\u2606',
    SYM_EAGLE:     '\u25CE',
    SYM_BIRDIE:    '\u25CB',
    SYM_PAR:       '\u2014',
    SYM_BOGEY:     '\u25B3',
    SYM_DBOGEY:    '\u25A1',

    /** スコア入力UIを描画（ホール切替時に呼ばれる） */
    _render: function () {
      var st = GW.Widgets.Golf.state;
      var i = st.currentHole;
      if (typeof i !== 'number' || i < 0 || i > 17) {
        i = 0;
        st.currentHole = 0;
      }

      var pars = (GW.Core.State && GW.Core.State.pars) || new Array(18).fill(4);
      var par = pars[i] || 4;
      var s = st.scores[i] || { stroke: 0, putt: 0 };

      // 入力UI（数字±方式）
      var inputUI = this._renderStrokeInputUI(i, par, s);

      var prevDisabled = (i === 0) ? 'disabled' : '';
      var nextDisabled = (i === 17) ? 'disabled' : '';

      var html =
        '<div>' +
          '<div class="gw-hole-card" id="gw-hc-' + i + '">' +
            '<div class="gw-hole-head">' +
              '<div class="gw-hole-no">' + (i + 1) + 'H</div>' +
              '<div class="gw-hole-par">PAR ' + par + '</div>' +
              '<div id="gw-vt-' + i + '">' + this._vsparTag(s.stroke, par) + '</div>' +
            '</div>' +
            inputUI +
          '</div>' +

          '<div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:10px;">' +
            '<button class="gw-btn-ghost" style="flex:1;font-size:18px;font-weight:900;min-height:60px;" ' +
              ' data-action="gland-prev-hole" ' + prevDisabled + '>&lt; 前</button>' +
            '<div style="display:flex;align-items:center;justify-content:center;flex:0 0 100px;' +
              ' text-align:center;font-size:16px;font-weight:700;color:var(--gold-bri);' +
              ' background:rgba(0,0,0,0.35);padding:10px;border-radius:10px;">' +
              (i + 1) + ' / 18 H</div>' +
            '<button class="gw-btn-ghost" style="flex:1;font-size:18px;font-weight:900;min-height:60px;" ' +
              ' data-action="gland-next-hole" ' + nextDisabled + '>次 &gt;</button>' +
          '</div>' +

          '<div style="display:flex;gap:4px;margin-bottom:14px;background:rgba(0,0,0,0.3);padding:4px;border-radius:10px;">' +
            '<button data-action="gland-disp-stroke" ' +
              'class="' + (st.displayMode === 'stroke' ? 'active ' : '') + 'gw-disp-btn" ' +
              'style="flex:1;padding:8px;border:0;border-radius:7px;font-weight:700;font-size:12px;min-height:38px;' +
                (st.displayMode === 'stroke' ? 'background:linear-gradient(180deg,var(--gold-bri),var(--gold));color:#000;' : 'background:transparent;color:#fff;') +
              '">数字</button>' +
            '<button data-action="gland-disp-pardiff" ' +
              'class="' + (st.displayMode === 'pardiff' ? 'active ' : '') + 'gw-disp-btn" ' +
              'style="flex:1;padding:8px;border:0;border-radius:7px;font-weight:700;font-size:12px;min-height:38px;' +
                (st.displayMode === 'pardiff' ? 'background:linear-gradient(180deg,var(--gold-bri),var(--gold));color:#000;' : 'background:transparent;color:#fff;') +
              '">±表記</button>' +
            '<button data-action="gland-disp-symbol" ' +
              'class="' + (st.displayMode === 'symbol' ? 'active ' : '') + 'gw-disp-btn" ' +
              'style="flex:1;padding:8px;border:0;border-radius:7px;font-weight:700;font-size:12px;min-height:38px;' +
                (st.displayMode === 'symbol' ? 'background:linear-gradient(180deg,var(--gold-bri),var(--gold));color:#000;' : 'background:transparent;color:#fff;') +
              '">記号</button>' +
          '</div>' +

          // 同伴メンバー表のプレースホルダ（Mates サブモジュールで描画される）
          '<div class="gw-mate-table-wrap" id="gw-mate-table-wrap">' +
            '<h4 style="margin:0 0 10px;color:var(--gold-bri);">同伴メンバー スコア表（横スクロール可）</h4>' +
            '<div id="gw-mate-table-body">' +
              '<div style="color:var(--text-sub);font-size:14px;padding:10px;">準備中...</div>' +
            '</div>' +
          '</div>' +
        '</div>';

      var hostEl = document.getElementById('gw-hole-list');
      if (hostEl) hostEl.innerHTML = html;
      this._updateTotal();
      this._buildHolePicker();

      // ★ Mates 連携：DOM 反映を待ってから Mates.load() を呼ぶ
      setTimeout(function () {
        try {
          if (GW.Widgets.Golf.Mates) GW.Widgets.Golf.Mates.load();
        } catch (e) {
          console.warn('[GW.Golf.Score] Mates.load failed:', e);
        }
      }, 50);
    },

    /** スコア入力UIを生成（数字±方式・既存資産継承） */
    _renderStrokeInputUI: function (i, par, s) {
      var st = GW.Widgets.Golf.state;
      var dispStroke = s.stroke > 0 ? s.stroke : par;
      var dispPutt = s.putt > 0 ? s.putt : 2;

      var stkShow;
      if (st.displayMode === 'stroke') {
        stkShow = dispStroke;
      } else {
        stkShow = s.stroke > 0
          ? this._formatScore(s.stroke, par)
          : (st.displayMode === 'pardiff' ? 'E' : this.SYM_PAR);
      }

      return '' +
        '<div class="gw-stroke-row">' +
          '<button class="gw-btn-yellow" data-action="gland-stroke-minus">-</button>' +
          '<div class="lbl">打数</div>' +
          '<div class="val" id="gw-stk-' + i + '">' + stkShow + '</div>' +
          '<button class="gw-btn-yellow" data-action="gland-stroke-plus">+</button>' +
        '</div>' +
        '<div class="gw-stroke-row">' +
          '<button class="gw-btn-orange" data-action="gland-putt-minus">-</button>' +
          '<div class="lbl">パット</div>' +
          '<div class="val" id="gw-put-' + i + '">' + dispPutt + '</div>' +
          '<button class="gw-btn-orange" data-action="gland-putt-plus">+</button>' +
        '</div>';
    },

    /**
     * ストローク変更（±1）
     *   設計憲法・第1条：即時UI反映 + Fire-and-Forget 保存
     */
    _chgStroke: function (delta) {
      var st = GW.Widgets.Golf.state;
      var i = st.currentHole;
      if (!st.scores[i]) st.scores[i] = { stroke: 0, putt: 0 };

      var pars = (GW.Core.State && GW.Core.State.pars) || new Array(18).fill(4);
      var par = pars[i] || 4;
      var base = st.scores[i].stroke > 0 ? st.scores[i].stroke : par;
      var next = Math.max(1, Math.min(20, base + delta));
      st.scores[i].stroke = next;

      // パットが0なら2にデフォルト（既存挙動継承）
      if (!st.scores[i].putt || st.scores[i].putt <= 0) {
        st.scores[i].putt = 2;
      }

      // ★ピンポイント更新（DOM再構築なし）
      this._updateCells();
      GW.Core.UI.haptic();
      this._saveScore(i);
    },

    /** パット変更（±1） */
    _chgPutt: function (delta) {
      var st = GW.Widgets.Golf.state;
      var i = st.currentHole;
      if (!st.scores[i]) st.scores[i] = { stroke: 0, putt: 0 };

      var pars = (GW.Core.State && GW.Core.State.pars) || new Array(18).fill(4);
      var par = pars[i] || 4;
      var base = st.scores[i].putt > 0 ? st.scores[i].putt : 2;
      var next = Math.max(0, Math.min(10, base + delta));
      st.scores[i].putt = next;

      // ストロークが未入力ならパーで埋める
      if (!st.scores[i].stroke || st.scores[i].stroke <= 0) {
        st.scores[i].stroke = par;
      }

      this._updateCells();
      GW.Core.UI.haptic();
      this._saveScore(i);
    },

    /**
     * ★【v4.7 継承】updateScoreCellsOnly - DOM差分更新の中核
     *
     * 更新対象：
     *   - 打数セル (#gw-stk-{i})
     *   - パットセル (#gw-put-{i})
     *   - vs PAR タグ (#gw-vt-{i})
     *   - 合計表示 (#gw-me-total)
     *   - ホールピッカーの該当ボタン
     *   - Mates 表の自分の列（updateMyColumn）
     */
    _updateCells: function () {
      var st = GW.Widgets.Golf.state;
      var i = st.currentHole;
      var sc = st.scores[i] || { stroke: 0, putt: 0 };
      var pars = (GW.Core.State && GW.Core.State.pars) || new Array(18).fill(4);
      var par = pars[i] || 4;

      // ── 打数セル ──
      var stkEl = document.getElementById('gw-stk-' + i);
      if (stkEl) {
        if (st.displayMode === 'stroke') {
          stkEl.textContent = sc.stroke > 0 ? sc.stroke : par;
        } else {
          stkEl.textContent = sc.stroke > 0
            ? this._formatScore(sc.stroke, par)
            : (st.displayMode === 'pardiff' ? 'E' : this.SYM_PAR);
        }
      }

      // ── パットセル ──
      var putEl = document.getElementById('gw-put-' + i);
      if (putEl) putEl.textContent = (sc.putt || 0);

      // ── vs PAR タグ ──
      var vtEl = document.getElementById('gw-vt-' + i);
      if (vtEl) vtEl.innerHTML = this._vsparTag(sc.stroke, par);

      // ── 合計表示 ──
      this._updateTotal();

      // ── ホールピッカーの該当ボタン更新 ──
      this._refreshHolePickerOne(i);

      // ── Mates 表の自分の列を即時更新 ──
      try {
        if (GW.Widgets.Golf.Mates) GW.Widgets.Golf.Mates.updateMyColumn();
      } catch (e) {
        console.warn('[GW.Golf.Score] Mates.updateMyColumn failed:', e);
      }
    },

    /** 合計とPAR差を更新 */
    _updateTotal: function () {
      var st = GW.Widgets.Golf.state;
      var pars = (GW.Core.State && GW.Core.State.pars) || new Array(18).fill(4);

      var total = 0;
      var playedPar = 0;
      for (var i = 0; i < 18; i++) {
        var sc = st.scores[i] || { stroke: 0 };
        total += sc.stroke || 0;
        if (sc.stroke > 0) playedPar += pars[i];
      }

      var el = document.getElementById('gw-me-total');
      if (el) {
        if (playedPar === 0) {
          el.textContent = total + ' / -';
        } else {
          var diff = total - playedPar;
          var display = diff === 0 ? 'E' : (diff > 0 ? '+' + diff : String(diff));
          el.textContent = total + ' (' + display + ')';
        }
      }
    },

    /**
     * スコア保存（Fire-and-Forget + 150msデバウンス）
     *   - 仮IDの場合はサーバー送信スキップ（registerPlayer完了後に再送）
     */
    _saveScore: function (i) {
      var st = GW.Widgets.Golf.state;

      // ローカルキャッシュには即時保存（オフライン耐性）
      GW.Core.Cache.saveMyScores(st.player.playerId, st.scores);

      clearTimeout(st._saveTimer[i]);
      st._saveTimer[i] = setTimeout(function () {
        // 仮IDなら送信スキップ（オフライン中も同様）
        if (String(st.player.playerId).indexOf('P_TMP_') === 0) return;

        GW.Core.Api.fire('gland.saveScore', {
          playerId: st.player.playerId,
          hole:     i + 1,
          stroke:   st.scores[i].stroke,
          putt:     st.scores[i].putt
        }, null, null, 'score-' + st.player.playerId + '-' + i);
      }, GW.Core.Config.SCORE_DEBOUNCE_MS);
    },

    /** 前のホールへ */
    _prevHole: function () {
      var st = GW.Widgets.Golf.state;
      this._autoSaveIfBlank();
      if (st.currentHole > 0) {
        st.currentHole--;
        this._render();
      }
    },

    /** 次のホールへ */
    _nextHole: function () {
      var st = GW.Widgets.Golf.state;
      this._autoSaveIfBlank();
      if (st.currentHole < 17) {
        st.currentHole++;
        this._render();
      }
    },

    /**
     * 未入力ホールを自動でパー埋め
     *   ホール切替時、現在ホールが未入力なら PAR/2パットで自動保存
     */
    _autoSaveIfBlank: function () {
      var st = GW.Widgets.Golf.state;
      if (!st.player || !st.player.playerId) return;
      var i = st.currentHole;
      var cur = st.scores[i] || { stroke: 0, putt: 0 };
      if (cur.stroke > 0) return;
      var pars = (GW.Core.State && GW.Core.State.pars) || new Array(18).fill(4);
      var par = pars[i] || 4;
      st.scores[i] = { stroke: par, putt: 2 };

      GW.Core.Cache.saveMyScores(st.player.playerId, st.scores);
      if (String(st.player.playerId).indexOf('P_TMP_') === 0) return;
      GW.Core.Api.fire('gland.saveScore', {
        playerId: st.player.playerId,
        hole:     i + 1,
        stroke:   par,
        putt:     2
      }, null, null, 'score-' + st.player.playerId + '-' + i);
    },

    /** 表示モード変更 */
    _setDisplayMode: function (mode) {
      if (['stroke', 'pardiff', 'symbol'].indexOf(mode) < 0) mode = 'stroke';
      GW.Widgets.Golf.state.displayMode = mode;
      GW.Core.Storage.set(GW.Core.Config.KEYS.DISPLAY_MODE, mode);
      this._render();  // モード切替時はフル再描画（ボタン状態反映のため）
    },

    /** スコア値を表示用にフォーマット（モードに応じて） */
    _formatScore: function (stroke, par) {
      var st = GW.Widgets.Golf.state;
      if (!stroke || stroke <= 0) return '-';
      if (st.displayMode === 'pardiff') {
        var d = stroke - par;
        if (d === 0) return 'E';
        return d > 0 ? '+' + d : String(d);
      }
      if (st.displayMode === 'symbol') {
        var ds = stroke - par;
        if (ds <= -3) return this.SYM_ALBATROSS;
        if (ds === -2) return this.SYM_EAGLE;
        if (ds === -1) return this.SYM_BIRDIE;
        if (ds === 0)  return this.SYM_PAR;
        if (ds === 1)  return this.SYM_BOGEY;
        if (ds === 2)  return this.SYM_DBOGEY;
        return '+' + ds;
      }
      return String(stroke);
    },

    /** vs PAR タグ（ALBATROSS〜D.BOGEYのカラフルなバッジ） */
    _vsparTag: function (stroke, par) {
      if (!stroke) return '';
      var d = stroke - par;
      if (d <= -3) return '<span class="gw-vspar albatross">ALBATROSS ' + this.SYM_ALBATROSS + '</span>';
      if (d === -2) return '<span class="gw-vspar eagle">EAGLE ' + this.SYM_EAGLE + '</span>';
      if (d === -1) return '<span class="gw-vspar birdie">BIRDIE ' + this.SYM_BIRDIE + '</span>';
      if (d === 0)  return '<span class="gw-vspar par">PAR ' + this.SYM_PAR + '</span>';
      if (d === 1)  return '<span class="gw-vspar bogey">BOGEY ' + this.SYM_BOGEY + '</span>';
      if (d === 2)  return '<span class="gw-vspar dbogey">D.BOGEY ' + this.SYM_DBOGEY + '</span>';
      return '<span class="gw-vspar over">+' + d + '</span>';
    },

    /** ホールピッカー（モーダル） を構築 */
    _buildHolePicker: function () {
      var st = GW.Widgets.Golf.state;
      var grid = document.getElementById('gw-hole-picker-grid');
      if (!grid) return;
      var pars = (GW.Core.State && GW.Core.State.pars) || new Array(18).fill(4);

      var html = '';
      for (var i = 0; i < 18; i++) {
        var sc = st.scores[i] || { stroke: 0 };
        var par = pars[i] || 4;
        var cls = 'gw-hp-btn';
        if (i === st.currentHole) cls += ' cur';
        else if (sc.stroke > 0) cls += ' done';

        var info;
        if (i === st.currentHole) {
          info = 'NOW';
        } else if (sc.stroke > 0) {
          var d = sc.stroke - par;
          info = (d > 0 ? '+' : '') + d;
        } else {
          info = 'PAR' + par;
        }
        html += '<button class="' + cls + '" data-action="gland-jump-hole" data-hole="' + i + '">' +
                (i + 1) + '<br><small>' + info + '</small></button>';
      }
      grid.innerHTML = html;
    },

    /** ホールピッカーの該当ボタンだけを更新（軽量） */
    _refreshHolePickerOne: function (i) {
      var st = GW.Widgets.Golf.state;
      var grid = document.getElementById('gw-hole-picker-grid');
      if (!grid) return;
      var btns = grid.querySelectorAll('button.gw-hp-btn');
      if (!btns || !btns[i]) return;

      var sc = st.scores[i] || { stroke: 0 };
      var pars = (GW.Core.State && GW.Core.State.pars) || new Array(18).fill(4);
      var par = pars[i] || 4;
      var cls = 'gw-hp-btn';
      if (i === st.currentHole) cls += ' cur';
      else if (sc.stroke > 0) cls += ' done';

      var info;
      if (i === st.currentHole) {
        info = 'NOW';
      } else if (sc.stroke > 0) {
        var d = sc.stroke - par;
        info = (d > 0 ? '+' : '') + d;
      } else {
        info = 'PAR' + par;
      }
      btns[i].className = cls;
      btns[i].innerHTML = (i + 1) + '<br><small>' + info + '</small>';
    },

    /** ホール選択（ピッカーから呼ばれる） */
    _jumpToHole: function (idx) {
      var st = GW.Widgets.Golf.state;
      this._autoSaveIfBlank();
      st.currentHole = Math.max(0, Math.min(17, Number(idx) || 0));
      this._closeHolePicker();
      this._render();
    },

    /** ピッカーを開く */
    _openHolePicker: function () {
      this._buildHolePicker();
      var el = document.getElementById('gw-hole-picker');
      if (el) el.classList.add('show');
    },

    /** ピッカーを閉じる */
    _closeHolePicker: function () {
      var el = document.getElementById('gw-hole-picker');
      if (el) el.classList.remove('show');
    },

    /** ホール拡大表示を閉じる */
    _closeHoleZoom: function () {
      var el = document.getElementById('gw-hole-zoom');
      if (el) el.classList.remove('show');
    },

    /** 同伴メンバー表のスクロール位置を現在ホールに合わせる */
    _centerCurrentHole: function () {
      try {
        var wrap = document.getElementById('gw-mate-table-wrap');
        if (!wrap) return;
        var cur = GW.Widgets.Golf.state.currentHole;
        var th = wrap.querySelector('th.hole-col-' + cur);
        if (!th) return;
        var wrapRect = wrap.getBoundingClientRect();
        var thRect = th.getBoundingClientRect();
        var targetLeft = wrap.scrollLeft + (thRect.left - wrapRect.left)
                       - (wrap.clientWidth / 2) + (thRect.width / 2);
        wrap.scrollTo({ left: Math.max(0, targetLeft), behavior: 'smooth' });
      } catch (e) {}
    },

    /**
     * ラウンド終了：履歴に保存（Fire-and-Forget + モーダル確認）
     *   設計憲法：confirm() ではなく GW.Core.UI.confirm() を使う
     */
    _finishRound: function () {
      var st = GW.Widgets.Golf.state;
      if (!st.player || !st.player.playerId) {
        GW.Core.UI.toast('プレイヤー情報なし');
        return;
      }
      if (String(st.player.playerId).indexOf('P_TMP_') === 0) {
        GW.Core.UI.toast('登録処理中。数秒後に再度お試しください');
        return;
      }

      var playedHoles = st.scores.filter(function (s) { return s.stroke > 0; }).length;
      if (playedHoles === 0) {
        GW.Core.UI.toast('スコアが1ホールも入力されていません');
        return;
      }

      var msg;
      if (playedHoles === 18) {
        msg = '18ホール完了！\n履歴に保存しますか？';
      } else if (playedHoles === 9) {
        msg = 'ハーフ(9ホール)まで入力済みです。\n履歴に保存しますか？';
      } else {
        msg = '現在 ' + playedHoles + '/18 ホール入力済みです。\nこの時点までを履歴に保存しますか？';
      }

      GW.Core.UI.confirm('履歴に保存', msg, function () {
        GW.Core.Api.fire('gland.saveSnapshot', {
          playerId: st.player.playerId,
          gwUserId: GW.Core.Auth.getUserId()
        }, function (res) {
          if (!res || !res.ok) {
            GW.Core.UI.toast(res && res.msg ? res.msg : '保存失敗');
            return;
          }
          var holeLabel = res.playedHoles === 18 ? '18H完了'
                        : (res.playedHoles === 9 ? 'HALF(9H)' : res.playedHoles + 'H');
          GW.Core.UI.toast('✅ 保存完了 (' + res.totalStroke + '打 / ' + holeLabel + ')');
        });
        GW.Core.UI.toast('💾 履歴に保存しました');
        GW.Core.UI.haptic();
      });
    }
  };
})();
