/******************************************************************
 * G-WORLD Frontend - Save Queue
 *
 * 【SECTION 4】GW.Core.Queue - SaveQueue（既存資産継承・名前空間化）
 *
 * 設計意図【既存v4.7から継承】：
 *   - 全書込通信はこのキューに登録し、UIをブロックしない（Fire-and-Forget）
 *   - 最大2並列、失敗時は指数バックオフで3回まで自動リトライ
 *   - dedupeKey で同一スコアの古いリクエストを破棄
 *   - keepalive:true でページ離脱中も送信完了させる
 *
 * GAS制限回避：
 *   1スコアごとにPOSTすると6分制限に近づくため、フロントでデバウンス。
 *   失敗時のリトライは指数バックオフ（500ms → 1.5s → 4.5s）。
 ******************************************************************/
(function () {
  'use strict';

  GW.Core.Queue = {
    _queue:         [],
    _inflight:      0,
    _totalDone:     0,
    _hasError:      false,
    _indicatorTimer: null,

    /**
     * ジョブを追加（Fire-and-Forget の唯一の入口）
     *
     * @param {string} action - サーバ側のアクション名（例: 'gland.saveScore'）
     * @param {Object} payload - サーバに送るペイロード
     * @param {Function} [onSuccess] - 成功時コールバック（任意）
     * @param {Function} [onError] - 最終失敗時コールバック（任意）
     * @param {string} [dedupeKey] - 重複排除キー（同キーは古い方を破棄）
     */
    add: function (action, payload, onSuccess, onError, dedupeKey) {
      this._enqueue({
        action:    action,
        payload:   payload || {},
        onSuccess: onSuccess || null,
        onError:   onError || function (err) {
          // 既定のエラーハンドラ：コンソール出力のみ（ユーザー操作を妨げない）
          console.warn('[GW.Queue] background error:', action, err);
        },
        dedupeKey: dedupeKey || null,
        retries:   0
      });
    },

    _enqueue: function (job) {
      // dedupeKey が指定されていれば古いジョブを破棄
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

      // Promise版APIに委譲（戻り値・エラーを一元処理）
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
          // リトライ：指数バックオフ
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

    /** 現在のキュー状況をインジケータUIに反映 */
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
        // 全て完了 → ちょっと表示してから消す
        if (this._totalDone > 0 && !this._hasError) {
          el.textContent = '✓ 同期完了';
          el.classList.add('show');
          el.classList.remove('error');
        } else if (this._hasError) {
          el.textContent = '⚠ 一部送信失敗';
          el.classList.add('show', 'error');
        }
        clearTimeout(this._indicatorTimer);
        var self = this;
        this._indicatorTimer = setTimeout(function () {
          el.classList.remove('show');
          if (!self._hasError) self._totalDone = 0;
        }, 2200);
      }
    },

    /** オンライン復帰時等にキューを強制再開 */
    resume: function () {
      this._pump();
    },

    /** 現在のキュー状況を取得（デバッグ用） */
    status: function () {
      return {
        queued:   this._queue.length,
        inflight: this._inflight,
        done:     this._totalDone,
        hasError: this._hasError
      };
    }
  };
})();
