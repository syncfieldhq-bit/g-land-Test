/******************************************************************
 * G-WORLD - Golf History Submodule
 *
 * 設計意図：
 *   - サーバの 'gland.getHistoryList' / 'gland.getHistoryDetail' を呼び出す
 *   - 統計カード（ラウンド数 / ベスト / 平均打 / 平均パット）を表示
 *   - 履歴行は折りたたみ式（タップで詳細展開）
 *   - 詳細は同組4名のスコアテーブル（既存挙動継承）
 *
 * パフォーマンス：
 *   - 一覧取得は1回、詳細はタップ時のみ取得（遅延ロード）
 *   - 展開状態は state._historyExpanded に保持（再描画時も維持）
 *
 * 設計憲法・第7条：
 *   - "履歴" "ラウンド" の表現は維持。"保存" を強調しない（押し付けない）
 ******************************************************************/
(function () {
  'use strict';

  GW.Widgets.Golf = GW.Widgets.Golf || {};

  GW.Widgets.Golf.History = {
    /**
     * 履歴タブが表示された時に呼ばれる
     *   - コースフィルタの選択肢を構築
     *   - 履歴一覧を取得して描画
     */
    render: function () {
      this._buildCourseFilter();
      this._loadList();
    },

    /** コースフィルタのselect要素に選択肢を投入 */
    _buildCourseFilter: function () {
      var sel = document.getElementById('gw-hist-course');
      if (!sel) return;
      // 既存選択値を保持して再構築
      var keep = sel.value || '';
      var courses = (GW.Core.State && GW.Core.State.courses) || [];
      var opts = '<option value="">すべて</option>' +
        courses.map(function (c) {
          return '<option value="' + GW.Core.UI.escapeHtml(c.id) + '">' +
                 GW.Core.UI.escapeHtml(c.name) + '</option>';
        }).join('');
      sel.innerHTML = opts;
      // 以前の選択を復元
      if (keep) {
        try { sel.value = keep; } catch (e) {}
      }
    },

    /**
     * 履歴一覧を取得して描画
     *   フィルタ条件（コース・期間）は select 要素から取得
     *   通信中はローディング表示
     */
    _loadList: function () {
      var st = GW.Widgets.Golf.state;
      var listEl = document.getElementById('gw-hist-list');

      // プレイヤー未登録 → 案内表示
      if (!st.player || !st.player.playerId) {
        if (listEl) {
          listEl.innerHTML = '<div class="gw-history-empty">' +
            'まずはスコア入力を開始してください' +
            '</div>';
        }
        this._renderStats(null);
        return;
      }

      var courseSel = document.getElementById('gw-hist-course');
      var periodSel = document.getElementById('gw-hist-period');
      var courseId = courseSel ? courseSel.value : '';
      var period   = periodSel ? periodSel.value : 'all';

      if (listEl) {
        listEl.innerHTML = '<div class="gw-history-empty">読み込み中...</div>';
      }

      var self = this;
      GW.Core.Api.call('gland.getHistoryList', {
        playerId: st.player.playerId,
        gwUserId: GW.Core.Auth.getUserId(),
        period:   period,
        courseId: courseId
      }).then(function (res) {
        if (!res || !res.ok) {
          if (listEl) {
            listEl.innerHTML = '<div class="gw-history-empty">取得失敗</div>';
          }
          self._renderStats(null);
          return;
        }
        self._renderStats(res.stats || null);
        self._renderList(res.list || []);
      }).catch(function () {
        if (listEl) {
          listEl.innerHTML = '<div class="gw-history-empty">通信エラー</div>';
        }
        self._renderStats(null);
      });
    },

    /**
     * 4種の統計カードを更新
     *   - ラウンド数 / ベスト（18Hのみ）/ 平均打数 / 平均パット
     *   - データが無ければ "-" 表示
     */
    _renderStats: function (stats) {
      function setVal(id, val) {
        var el = document.getElementById(id);
        if (!el) return;
        el.textContent = (val !== null && val !== undefined && val !== '') ? val : '-';
      }
      if (!stats || !stats.rounds) {
        setVal('gw-stat-rounds', 0);
        setVal('gw-stat-best', '-');
        setVal('gw-stat-avg-stroke', '-');
        setVal('gw-stat-avg-putt', '-');
        return;
      }
      setVal('gw-stat-rounds',     stats.rounds);
      setVal('gw-stat-best',       stats.best);
      setVal('gw-stat-avg-stroke', stats.avgStroke);
      setVal('gw-stat-avg-putt',   stats.avgPutt);
    },

    /**
     * 履歴行を描画
     *   - 18ホール完走のうち最小スコアに "BEST" バッジ
     *   - 9H/中断にも HALF/Nラウンド バッジを付与
     *   - クリックで詳細展開（_toggleDetail へ）
     */
    _renderList: function (list) {
      var wrap = document.getElementById('gw-hist-list');
      if (!wrap) return;

      if (!list || !list.length) {
        wrap.innerHTML = '<div class="gw-history-empty">' +
          '履歴データがまだありません<br><br>' +
          'スコア入力タブの「終了して履歴に保存」で記録できます' +
          '</div>';
        return;
      }

      // 18H完走でベストスコアを特定
      var best = null;
      list.forEach(function (h) {
        if (h.playedHoles === 18 && (best === null || h.totalStroke < best)) {
          best = h.totalStroke;
        }
      });

      var st = GW.Widgets.Golf.state;
      var esc = GW.Core.UI.escapeHtml;
      var html = '';
      list.forEach(function (h) {
        var isBest = (h.playedHoles === 18 && h.totalStroke === best);
        var vsParStr = h.vsPar === 0 ? 'E' : (h.vsPar > 0 ? '+' + h.vsPar : String(h.vsPar));
        var expanded = !!st._historyExpanded[h.historyId];

        // ホール数バッジ
        var badge = '';
        if (h.playedHoles === 9) {
          badge = ' <span style="background:#5dade2;color:#fff;font-size:10px;' +
                  'padding:2px 6px;border-radius:6px;margin-left:4px;">HALF</span>';
        } else if (h.playedHoles > 0 && h.playedHoles < 18 && h.playedHoles !== 9) {
          badge = ' <span style="background:#7a8a82;color:#fff;font-size:10px;' +
                  'padding:2px 6px;border-radius:6px;margin-left:4px;">' +
                  h.playedHoles + 'H</span>';
        }

        var bestMark = isBest ? ' <span style="color:#ffd700;font-weight:900;">★BEST</span>' : '';
        var bestCls  = isBest ? ' best' : '';

        html +=
          '<div class="gw-hist-row' + bestCls + '" ' +
            'data-action="gland-hist-toggle" data-history-id="' + esc(h.historyId) + '">' +
            '<div class="top">' +
              '<span class="date">' + esc(h.playDate) + badge + bestMark + '</span>' +
              '<span class="total">' + h.totalStroke +
                '<span class="vs">(' + vsParStr + ')</span></span>' +
            '</div>' +
            '<div class="bottom">' +
              '<span class="course">' + esc(h.courseName) + '</span>' +
              '<span>' + esc(h.groupName || '(未所属)') +
                ' / ' + h.playedHoles + 'H / Putt ' + h.totalPutt + '</span>' +
            '</div>' +
          '</div>' +
          '<div id="gw-hd-' + esc(h.historyId) + '" class="gw-hist-detail' +
            (expanded ? '' : ' gw-hidden') + '"></div>';
      });

      wrap.innerHTML = html;

      // 展開済みのものは詳細を再ロード（再描画時の状態維持）
      var self = this;
      list.forEach(function (h) {
        if (st._historyExpanded[h.historyId]) {
          self._loadDetailInto(h.historyId);
        }
      });
    },

    /**
     * 履歴詳細の展開/折りたたみ切替
     *   - 初回展開時にサーバから詳細を取得（遅延ロード）
     *   - 状態は state._historyExpanded に保持
     */
    _toggleDetail: function (historyId) {
      var st = GW.Widgets.Golf.state;
      var el = document.getElementById('gw-hd-' + historyId);
      if (!el) return;

      var wasHidden = el.classList.contains('gw-hidden');
      if (wasHidden) {
        // ── 展開 ──
        st._historyExpanded[historyId] = true;
        el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-sub);">' +
                       '読み込み中...</div>';
        el.classList.remove('gw-hidden');
        this._loadDetailInto(historyId);
      } else {
        // ── 折りたたみ ──
        st._historyExpanded[historyId] = false;
        el.classList.add('gw-hidden');
        el.innerHTML = '';
      }
      GW.Core.UI.haptic();
    },

    /**
     * 詳細データをサーバから取得して該当 div に描画
     *   - 再描画時にも呼ばれる（展開状態維持のため）
     */
    _loadDetailInto: function (historyId) {
      var el = document.getElementById('gw-hd-' + historyId);
      if (!el) return;
      var self = this;

      GW.Core.Api.call('gland.getHistoryDetail', { historyId: historyId })
        .then(function (res) {
          if (!res || !res.ok) {
            el.innerHTML = '<div style="padding:14px;color:#ff8888;">取得失敗</div>';
            return;
          }
          el.innerHTML = self._buildDetailHtml(res);
        })
        .catch(function () {
          el.innerHTML = '<div style="padding:14px;color:#ff8888;">通信エラー</div>';
        });
    },

    /**
     * 詳細テーブルHTMLを構築
     *   - 同組4名のホール別スコアを表形式で表示
     *   - 自分の行には * マーク + ハイライト
     *   - PAR行を最上部に
     *   - 表示モード（stroke/pardiff/symbol）を反映
     */
    _buildDetailHtml: function (detail) {
      if (!detail || !detail.mates || !detail.mates.length) {
        return '<div style="padding:14px;color:var(--text-sub);">詳細データなし</div>';
      }

      var esc = GW.Core.UI.escapeHtml;
      var st = GW.Widgets.Golf.state;
      var Score = GW.Widgets.Golf.Score;
      var pars = detail.pars || new Array(18).fill(4);

      // ── PAR行 ──
      var parRow = '<tr class="par-row"><td>PAR</td>';
      var parSum = 0;
      for (var h = 0; h < 18; h++) {
        parRow += '<td>' + pars[h] + '</td>';
        parSum += pars[h];
      }
      parRow += '<td class="total-col">' + parSum + '</td></tr>';

      // ── ヘッダ行 ──
      var headRow = '<tr><th>プレイヤー</th>';
      for (var h2 = 0; h2 < 18; h2++) headRow += '<th>' + (h2 + 1) + '</th>';
      headRow += '<th>計</th></tr>';

      // ── 各メンバー行 ──
      var memberRows = '';
      detail.mates.forEach(function (m) {
        var cls = m.isPrimary ? ' class="primary"' : '';
        var star = m.isPrimary ? '* ' : '';
        var dispName = m.realName || m.nickname || '(名前なし)';
        var row = '<tr' + cls + '><td>' + star + esc(dispName) + '</td>';
        var sum = 0;
        for (var hh = 0; hh < 18; hh++) {
          var sc = (m.holeScores && m.holeScores[hh]) ? m.holeScores[hh] : { stroke: 0 };
          var stroke = sc.stroke || 0;
          sum += stroke;

          // 表示モードに応じて整形
          var display;
          if (stroke > 0) {
            if (st.displayMode === 'stroke') {
              display = stroke;
            } else {
              display = Score._formatScore(stroke, pars[hh]);
            }
          } else {
            display = '-';
          }
          row += '<td>' + display + '</td>';
        }
        row += '<td class="total-col">' + (sum || '-') + '</td></tr>';
        memberRows += row;
      });

      return '' +
        '<div class="header">' +
          '<span>' + esc(detail.courseName) +
            ' / ' + esc(detail.groupName) + '</span>' +
          '<span>' + esc(detail.playDate) + '</span>' +
        '</div>' +
        '<div class="gw-hist-detail-table-wrap">' +
          '<table>' + headRow + parRow + memberRows + '</table>' +
        '</div>';
    },

    /** フィルタ変更時にリストを再ロード */
    _onFilterChange: function () {
      this._loadList();
    }
  };
})();
