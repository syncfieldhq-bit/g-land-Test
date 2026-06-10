/******************************************************************
 * G-WORLD - Golf Mates Submodule
 *
 * 設計意図：
 *   - 同組4名のスコアを横スクロールテーブルで表示
 *   - 30秒ポーリングでサーバから最新化
 *   - 自分の列は state.scores から即時反映（通信ゼロ）
 *   - ホールヘッダタップで拡大表示（老眼対応）
 ******************************************************************/
(function () {
  'use strict';

  GW.Widgets.Golf = GW.Widgets.Golf || {};

  GW.Widgets.Golf.Mates = {
    /** 同伴メンバー表をロード（スコア入力タブ表示時に呼ばれる） */
    load: function () {
      var st = GW.Widgets.Golf.state;
      console.log('[GW.Mates.load] called. player:', st.player && st.player.playerId);

      // ── ガード：プレイヤー情報チェック ──
      if (!st.player) {
        this._renderEmpty('プレイヤー情報がありません');
        return;
      }
      if (!st.player.courseId) {
        this._renderEmpty('コース未選択');
        return;
      }
      if (!st.player.groupName) {
        this._renderEmpty('グループ名未設定');
        return;
      }

      var pars = (GW.Core.State && GW.Core.State.pars) || new Array(18).fill(4);

      // ── 仮IDのうちは自分のみで描画 ──
      if (String(st.player.playerId).indexOf('P_TMP_') === 0) {
        var soloData = {
          pars: pars,
          members: [{
            playerId: st.player.playerId,
            nickname: st.player.nickname,
            realName: st.player.realName,
            strokes:  st.scores.map(function (s) { return s.stroke || 0; })
          }]
        };
        st.groupMates = soloData.members;
        this._render(soloData);
        this._scheduleNextPoll();
        return;
      }

      // ★ キャッシュ有無に関わらず、まず自分だけで暫定描画 ──
      var cached = GW.Core.Cache.loadMates(st.player.courseId, st.player.groupName);
      if (cached && cached.members && cached.members.length) {
        st.groupMates = cached.members;
        this._render(cached);
      } else {
        var fallback = {
          pars: pars,
          members: [{
            playerId: st.player.playerId,
            nickname: st.player.nickname,
            realName: st.player.realName,
            strokes:  st.scores.map(function (s) { return s.stroke || 0; })
          }]
        };
        st.groupMates = fallback.members;
        this._render(fallback);
      }

      // ── サーバから最新取得（バックグラウンド更新） ──
      var self = this;
      GW.Core.Api.call('gland.getMates', {
        courseId:  st.player.courseId,
        groupName: st.player.groupName,
        playerId:  st.player.playerId
      }).then(function (res) {
        if (res && res.ok && Array.isArray(res.members) && res.members.length > 0) {
          self._render(res);
          GW.Core.Cache.saveMates(st.player.courseId, st.player.groupName, res);
        }
      }).catch(function (err) {
        console.warn('[GW.Mates] サーバ問合せ失敗:', err);
      });

      // ── 30秒ポーリング ──
      this._scheduleNextPoll();
    },

    /** 空状態の描画 */
    _renderEmpty: function (msg) {
      var body = document.getElementById('gw-mate-table-body');
      if (!body) return;
      body.innerHTML = '<div style="color:var(--text-sub);font-size:13px;padding:10px;text-align:center;">' +
                       GW.Core.UI.escapeHtml(msg || '同伴メンバーなし') + '</div>';
    },

    /** 次回ポーリングをスケジュール */
    _scheduleNextPoll: function () {
      var st = GW.Widgets.Golf.state;
      if (st._matesTimer) clearTimeout(st._matesTimer);
      // スコア入力サブタブ かつ G-LAND画面の時のみポーリング継続
      if (st.subtab !== 'score') return;
      if (GW.Core.Router.current !== 'gland') return;

      var self = this;
      st._matesTimer = setTimeout(function () {
        self.load();
      }, GW.Core.Config.MATES_POLL_MS);
    },

    /** ポーリング停止（タブ切替時等） */
    stopPolling: function () {
      var st = GW.Widgets.Golf.state;
      if (st._matesTimer) {
        clearTimeout(st._matesTimer);
        st._matesTimer = null;
      }
    },

    /**
     * テーブルを描画
     *   - PAR行 + メンバー行 ×N
     *   - 現在ホールは current-h / current-c クラスでハイライト
     *   - 自分の行は class="me" で強調
     *   - 描画後に現在ホールを自動センタリング
     */
    _render: function (data) {
      var body = document.getElementById('gw-mate-table-body');
      if (!body) {
        console.error('[GW.Mates._render] gw-mate-table-body が DOM に存在しません');
        return;
      }

      if (!data || !data.members || !data.members.length) {
        body.innerHTML = '<div style="color:var(--text-sub);font-size:14px;padding:10px;">' +
                         '同伴メンバーなし</div>';
        return;
      }

      var st = GW.Widgets.Golf.state;
      var pars = data.pars || (GW.Core.State && GW.Core.State.pars) || new Array(18).fill(4);
      var cur = st.currentHole;
      var esc = GW.Core.UI.escapeHtml;

      // ── メンバーリストを正規化（自分は state.scores から最新値を反映）──
      var members = data.members.map(function (m) {
        if (m.playerId === st.player.playerId) {
          var strokes = [];
          for (var k = 0; k < 18; k++) {
            strokes.push((st.scores[k] && st.scores[k].stroke) || 0);
          }
          return Object.assign({}, m, { strokes: strokes, isMe: true });
        }
        return m;
      });
      st.groupMates = members;

      // ── ヘッダ行（ホール番号 1H〜18H + 計） ──
      var head = '<tr><th class="player-name-cell" style="text-align:center;">プレイヤー</th>';
      for (var k = 0; k < 18; k++) {
        var hi = (k === cur) ? ' current-h' : '';
        head += '<th class="hole-h hole-col-' + k + hi + '" ' +
                'data-action="gland-hole-zoom" data-hole="' + (k + 1) + '">' +
                (k + 1) + 'H</th>';
      }
      head += '<th class="total-col">計</th></tr>';

      // ── PAR行 ──
      var parRow = '<tr class="par-row"><td class="player-name-cell">PAR</td>';
      var parSum = 0;
      for (var k2 = 0; k2 < 18; k2++) {
        var pcls = (k2 === cur) ? ' current-c' : '';
        parRow += '<td class="hole-col-' + k2 + pcls + '">' + pars[k2] + '</td>';
        parSum += pars[k2];
      }
      parRow += '<td class="total-col">' + parSum + '</td></tr>';

      // ── 各メンバー行 ──
      var Score = GW.Widgets.Golf.Score;
      var rows = members.map(function (m) {
        var total = 0;
        var trClass = m.isMe ? ' class="me"' : '';
        var starMark = m.isMe ? '★ ' : '';
        var displayName = m.realName || m.nickname || '?';
        var tds = '<td class="player-name-cell">' + starMark + esc(displayName) + '</td>';
        for (var k3 = 0; k3 < 18; k3++) {
          var v = (m.strokes && m.strokes[k3]) || 0;
          total += v;
          var display = v > 0 ? Score._formatScore(v, pars[k3]) : '-';
          var st2 = (k3 === cur) ? ' current-c' : '';
          tds += '<td class="hole-col-' + k3 + st2 + '">' + display + '</td>';
        }
        tds += '<td class="total-col">' + (total || '-') + '</td>';
        return '<tr' + trClass + '>' + tds + '</tr>';
      }).join('');

      var html = '<table class="gw-mate-table">' + head + parRow + rows + '</table>';
      body.innerHTML = html;

      // ── 現在ホールをセンタリング ──
      var self = this;
      setTimeout(function () { self._centerCurrentHole(); }, 30);
    },

    /**
     * ★自分の列だけをローカル状態でその場更新（サーバ問合せ無し）
     *   Score._updateCells() から呼ばれる
     *   設計憲法・第1条：通信を1回も発生させずに UI を即時反映
     */
    updateMyColumn: function () {
      var st = GW.Widgets.Golf.state;
      if (!st.groupMates || !st.groupMates.length) return;
      var pars = (GW.Core.State && GW.Core.State.pars) || new Array(18).fill(4);

      var found = false;
      for (var i = 0; i < st.groupMates.length; i++) {
        if (st.groupMates[i].playerId === st.player.playerId) {
          var strokes = [];
          for (var k = 0; k < 18; k++) {
            strokes.push((st.scores[k] && st.scores[k].stroke) || 0);
          }
          st.groupMates[i].strokes = strokes;
          st.groupMates[i].isMe = true;
          found = true;
          break;
        }
      }
      if (found) {
        this._render({ pars: pars, members: st.groupMates });
      }
    },

    /** 現在ホールを表の中央にスクロール */
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
     * ホール拡大表示（老眼対応）
     *   表のヘッダタップで該当ホールのスコアを大きく表示
     */
    openZoom: function (holeNo) {
      var st = GW.Widgets.Golf.state;
      var idx = holeNo - 1;
      var pars = (GW.Core.State && GW.Core.State.pars) || new Array(18).fill(4);
      var par = pars[idx] || 4;
      var esc = GW.Core.UI.escapeHtml;

      var numEl = document.getElementById('gw-hz-num');
      var parEl = document.getElementById('gw-hz-par');
      var listEl = document.getElementById('gw-hz-list');
      var overlay = document.getElementById('gw-hole-zoom');
      if (!numEl || !parEl || !listEl || !overlay) return;

      numEl.textContent = holeNo + 'H';
      parEl.textContent = 'PAR ' + par;

      var html = '';
      (st.groupMates || []).forEach(function (m) {
        var stroke = (m.strokes && m.strokes[idx]) || 0;
        var meCls = m.isMe ? ' me' : '';
        var star = m.isMe ? '★ ' : '';
        var displayName = m.realName || m.nickname || '?';
        html += '<div class="gw-hz-row' + meCls + '">' +
                  '<div class="n">' + star + esc(displayName) + '</div>' +
                  '<div class="s">' + (stroke > 0 ? stroke : '-') + '</div>' +
                '</div>';
      });
      if (!html) {
        html = '<div style="color:var(--text-sub);text-align:center;padding:14px;">' +
               'メンバーなし</div>';
      }
      listEl.innerHTML = html;
      overlay.classList.add('show');
      GW.Core.UI.haptic();
    }
  };
})();
