/******************************************************************
 * G-WORLD Frontend Engine
 * v1.0.0 - G-LAND MVP (永久無料インフラ)
 *
 * 【構成】このファイルは2セクションに分かれます
 *   ─ 前半（このファイルの上半分）: GW.Core 層（基盤・全モジュール共通）
 *   ─ 後半（このファイルの下半分）: GW.Modules 層（各機能モジュール）
 *
 * 【設計憲法 7条】全コメントは日本語。「何を」より「なぜ」を残す。
 * 【設計憲法 第3条】グローバル汚染ゼロ。すべて GW 配下に格納。
 *
 * 【既存資産の継承】
 *   - SaveQueue (Fire-and-Forget + 指数バックオフ)
 *   - BootCache (24h TTL + 段階的読込)
 *   - updateScoreCellsOnly (DOM差分更新)
 *   ───────  これらは v4.7 で完成度が高いため、ロジックを継承する  ──────
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
  //
  // 設計意図：
  //   定数を一箇所に集約することで、デプロイ時の変更を1ファイル/1箇所で完結。
  //   将来のSQL移行・API URL変更にも強い。
  // ════════════════════════════════════════════════════════════════
  GW.Core.Config = {
    /**
     * GAS Web App URL
     *
     * 【デプロイ時の唯一の書換ポイント】
     *   コード.gs をデプロイすると新しい URL が払い出される。
     *   そのURLをここに貼り付けるだけで本番切替が完了する。
     *
     *   ※ 開発期間中は v4.7 と同じURLを使用（既存データ完全保全のため）
     */
    GAS_URL: 'https://script.google.com/macros/s/AKfycbyJbjVYmqATkJe2Ial5XOK_CYXCfkPWEIpKOtZziwDQ490l-AfNNF43gwls20y1N2FHgg/exec',

    /** API バージョン。サーバ側との整合確認に使用 */
    API_VERSION: 'v1',

    /** アプリバージョン（ユーザーに見せる用） */
    APP_VERSION: '1.0.0',

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

    /** localStorage キー一覧（タイプミス防止のため一箇所に集約） */
    KEYS: {
      USER_ID:       'gw_user_id',
      USE_COUNT:     'gw_use_count',
      STATE:         'gw_state',                // 'guest' | 'backed_up'
      LAST_ACTIVE:   'gw_last_active',
      LAST_PROMPT:   'gw_last_backup_prompt',
      PROFILE:       'gw_profile',
      PLAYER:        'gw_player',               // 現在のラウンドのプレイヤー情報
      DEVICE_ID:     'gw_device_id',
      DISPLAY_MODE:  'gw_display_mode',
      INPUT_MODE:    'gw_input_mode',
      PWA_SKIP:      'gw_pwa_skip_until',
      BOOT_BUNDLE:   'gw_boot_bundle',
      SCORES_PREFIX: 'gw_scores_',
      MATES_PREFIX:  'gw_mates_'
    }
  };

  // ════════════════════════════════════════════════════════════════
  // 【SECTION 2】GW.Core.Storage - localStorage 抽象化
  //
  // 設計意図：
  //   - localStorage アクセスは try/catch 必須（プライベートモード対策）
  //   - JSON のシリアライズ/デシリアライズも一元化
  //   - 将来 IndexedDB へ移行する際の差し替えポイントになる
  // ════════════════════════════════════════════════════════════════
  GW.Core.Storage = {
    /** 値を取得（無ければデフォルト） */
    get: function (key, defaultValue) {
      try {
        var v = localStorage.getItem(key);
        return v === null ? (defaultValue === undefined ? null : defaultValue) : v;
      } catch (e) {
        return defaultValue === undefined ? null : defaultValue;
      }
    },

    /** 値を保存 */
    set: function (key, value) {
      try {
        localStorage.setItem(key, String(value));
        return true;
      } catch (e) {
        // QuotaExceededError 等は静かに失敗（ユーザー体験を壊さない）
        return false;
      }
    },

    /** JSONオブジェクトを取得 */
    getJSON: function (key, defaultValue) {
      try {
        var raw = localStorage.getItem(key);
        if (raw === null) return defaultValue === undefined ? null : defaultValue;
        return JSON.parse(raw);
      } catch (e) {
        return defaultValue === undefined ? null : defaultValue;
      }
    },

    /** JSONオブジェクトを保存 */
    setJSON: function (key, obj) {
      try {
        localStorage.setItem(key, JSON.stringify(obj));
        return true;
      } catch (e) {
        return false;
      }
    },

    /** キーを削除 */
    remove: function (key) {
      try {
        localStorage.removeItem(key);
      } catch (e) {}
    },

    /** プレフィックスに一致するキーを一括削除（モジュール切替時等で使用） */
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
  // 【SECTION 3】GW.Core.Cache - キャッシュ層（既存BootCache継承）
  //
  // 設計意図：
  //   - 24時間TTL付きキャッシュ
  //   - boot bundle / スコア / 同伴メンバーを分けて格納
  //   - キーは Config.KEYS で集中管理し、タイプミス防止
  // ════════════════════════════════════════════════════════════════
  GW.Core.Cache = {
    /** boot bundle（コース・設定）を保存 */
    saveBoot: function (bundle) {
      GW.Core.Storage.setJSON(GW.Core.Config.KEYS.BOOT_BUNDLE, {
        courses:        bundle.courses        || [],
        activeCourseId: bundle.activeCourseId || '',
        isFinalized:    !!bundle.isFinalized,
        savedAt:        Date.now()
      });
    },

    /** boot bundle を取得（期限切れなら null）*/
    loadBoot: function () {
      var data = GW.Core.Storage.getJSON(GW.Core.Config.KEYS.BOOT_BUNDLE);
      if (!data || !data.savedAt) return null;
      if (Date.now() - data.savedAt > GW.Core.Config.CACHE_TTL_MS) return null;
      return data;
    },

    /** 自分のスコアをキャッシュ */
    saveMyScores: function (playerId, scores) {
      if (!playerId) return;
      GW.Core.Storage.setJSON(GW.Core.Config.KEYS.SCORES_PREFIX + playerId, {
        scores:  scores,
        savedAt: Date.now()
      });
    },

    /** 自分のスコアをキャッシュから取得 */
    loadMyScores: function (playerId) {
      if (!playerId) return null;
      var data = GW.Core.Storage.getJSON(GW.Core.Config.KEYS.SCORES_PREFIX + playerId);
      if (!data || !data.savedAt) return null;
      if (Date.now() - data.savedAt > GW.Core.Config.CACHE_TTL_MS) return null;
      return data.scores;
    },

    /** 同伴メンバー情報をキャッシュ */
    saveMates: function (courseId, groupName, payload) {
      var key = GW.Core.Config.KEYS.MATES_PREFIX + courseId + '_' + groupName;
      GW.Core.Storage.setJSON(key, { data: payload, savedAt: Date.now() });
    },

    /** 同伴メンバー情報をキャッシュから取得 */
    loadMates: function (courseId, groupName) {
      var key = GW.Core.Config.KEYS.MATES_PREFIX + courseId + '_' + groupName;
      var data = GW.Core.Storage.getJSON(key);
      if (!data || !data.savedAt) return null;
      if (Date.now() - data.savedAt > GW.Core.Config.CACHE_TTL_MS) return null;
      return data.data;
    },

    /** 全キャッシュをクリア（リセット時のみ使用） */
    clearAll: function () {
      GW.Core.Storage.remove(GW.Core.Config.KEYS.BOOT_BUNDLE);
      GW.Core.Storage.removeByPrefix(GW.Core.Config.KEYS.SCORES_PREFIX);
      GW.Core.Storage.removeByPrefix(GW.Core.Config.KEYS.MATES_PREFIX);
    }
  };

  // ════════════════════════════════════════════════════════════════
  // 【SECTION 4】GW.Core.Queue - SaveQueue（既存資産継承・名前空間化）
  //
  // 設計意図【既存v4.7から継承】：
  //   - 全書込通信はこのキューに登録し、UIをブロックしない（Fire-and-Forget）
  //   - 最大2並列、失敗時は指数バックオフで3回まで自動リトライ
  //   - dedupeKey で同一スコアの古いリクエストを破棄
  //   - keepalive:true でページ離脱中も送信完了させる
  //
  // GAS制限回避：
  //   1スコアごとにPOSTすると6分制限に近づくため、フロントでデバウンス。
  //   失敗時のリトライは指数バックオフ（500ms → 1.5s → 4.5s）。
  // ════════════════════════════════════════════════════════════════
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

  // ════════════════════════════════════════════════════════════════
  // 【SECTION 5】GW.Core.Api - GAS API 通信レイヤ
  //
  // 設計意図：
  //   - action ルーター方式に対応（funcName ではなく action パラメータを送る）
  //   - 通信は2系統に分離：
  //       ◆ Promise版 GW.Core.Api.call()  → 戻り値が即必要な処理（起動時等）
  //       ◆ Fire&Forget GW.Core.Api.fire() → 戻り値不要な書込処理
  //   - すべてのリクエストに apiVersion / device_id / gw_user_id を自動付与
  //   - keepalive:true でページ離脱時も最後まで送信完了
  // ════════════════════════════════════════════════════════════════
  GW.Core.Api = {
    /**
     * Promise版API呼び出し
     *   起動時のboot bundle取得、QR解決、履歴取得など、戻り値が即欲しい処理用。
     *
     * @param {string} action - アクション名（例: 'gland.boot'）
     * @param {Object} [payload] - リクエストボディ
     * @returns {Promise<Object>} - サーバの data フィールド
     */
    call: function (action, payload) {
      var body = JSON.stringify({
        action:     action,
        payload:    payload || {},
        apiVersion: GW.Core.Config.API_VERSION,
        // サーバ側で識別・記録するためのメタ情報
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
      // 離脱中も送信を完了させる（GAS制限内では効果あり）
      try { fetchOpts.keepalive = true; } catch (e) {}

      return fetch(GW.Core.Config.GAS_URL, fetchOpts)
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (res && res.ok === true) {
            return res; // 全体を返す（ok以外のメタも使うため）
          }
          // 旧API互換：success フィールド形式も受け入れる
          if (res && res.success === true) {
            return res.data;
          }
          var errMsg = (res && (res.error || res.msg)) || 'unknown server error';
          throw new Error(errMsg);
        });
    },

    /**
     * Fire-and-Forget版API呼び出し
     *   スコア保存・履歴記録など、UIをブロックしてはいけない処理用。
     *   内部で GW.Core.Queue にジョブを積むだけ。
     *
     * @param {string} action
     * @param {Object} [payload]
     * @param {Function} [onSuccess]
     * @param {Function} [onError]
     * @param {string} [dedupeKey]
     */
    fire: function (action, payload, onSuccess, onError, dedupeKey) {
      GW.Core.Queue.add(action, payload, onSuccess, onError, dedupeKey);
    }
  };

  // ════════════════════════════════════════════════════════════════
  // 【SECTION 6】GW.Core.Auth - 認証・ID管理（★G-WORLD の心臓部）
  //
  // 設計意図【設計憲法・第1条・第7条】：
  //   - GW_USER_ID は端末ローカル発行（GW-G-*）でスタート → 永久無料・即利用可
  //   - 利用回数 7,14,21,30,60 回到達時に「データ保全のご案内」モーダル
  //   - "認証"・"ログイン" という言葉は使わない。"バックアップ" "データ保全" で統一
  //   - 機種変更時の引き継ぎは backup_links 経由で GW-G-* → GW-B-* に変換
  //   - ローカルIDの段階でも全機能が完全に動く（押し付けゼロ）
  // ════════════════════════════════════════════════════════════════
  GW.Core.Auth = {
    /**
     * 起動時に呼ばれる初期化
     *   - GW_USER_ID が無ければ新規発行（GW-G-*）
     *   - 利用回数を+1
     *   - 最終アクセス時刻を更新
     */
    boot: function () {
      // ── GW_USER_ID ──
      var uid = GW.Core.Storage.get(GW.Core.Config.KEYS.USER_ID);
      if (!uid) {
        uid = this._generateGuestId();
        GW.Core.Storage.set(GW.Core.Config.KEYS.USER_ID, uid);
        GW.Core.Storage.set(GW.Core.Config.KEYS.STATE, 'guest');
      }

      // ── デバイスID（端末識別、永久不変） ──
      if (!GW.Core.Storage.get(GW.Core.Config.KEYS.DEVICE_ID)) {
        var did = 'D-' + Date.now().toString(36).toUpperCase() + '-' +
                  Math.floor(Math.random() * 0xFFFFFF).toString(16).toUpperCase();
        GW.Core.Storage.set(GW.Core.Config.KEYS.DEVICE_ID, did);
      }

      // ── 利用回数を+1 ──
      var count = Number(GW.Core.Storage.get(GW.Core.Config.KEYS.USE_COUNT, '0')) + 1;
      GW.Core.Storage.set(GW.Core.Config.KEYS.USE_COUNT, count);

      // ── 最終アクセス更新 ──
      GW.Core.Storage.set(GW.Core.Config.KEYS.LAST_ACTIVE, String(Date.now()));

      return {
        userId:   uid,
        state:    GW.Core.Storage.get(GW.Core.Config.KEYS.STATE, 'guest'),
        useCount: count,
        deviceId: GW.Core.Storage.get(GW.Core.Config.KEYS.DEVICE_ID)
      };
    },

    /** ゲストモードIDを発行 */
    _generateGuestId: function () {
      // UUID風8桁。Math.randomベースだが、衝突時はサーバが backup_links 経由で吸収するため許容
      var seg = function () {
        return Math.floor(Math.random() * 0xFFFFFF).toString(16).toUpperCase().padStart(6, '0');
      };
      return 'GW-G-' + seg().substring(0, 4) + seg().substring(0, 4);
    },

    /** GW_USER_ID を取得 */
    getUserId: function () {
      return GW.Core.Storage.get(GW.Core.Config.KEYS.USER_ID);
    },

    /** 状態取得（'guest' or 'backed_up'） */
    getState: function () {
      return GW.Core.Storage.get(GW.Core.Config.KEYS.STATE, 'guest');
    },

    /** ゲストモードかどうか */
    isGuest: function () {
      return this.getState() === 'guest';
    },

    /** 利用回数を取得 */
    getUseCount: function () {
      return Number(GW.Core.Storage.get(GW.Core.Config.KEYS.USE_COUNT, '0'));
    },

    /** デバイスIDを取得 */
    getDeviceId: function () {
      return GW.Core.Storage.get(GW.Core.Config.KEYS.DEVICE_ID);
    },

    /** プロフィール情報を取得 */
    getProfile: function () {
      return GW.Core.Storage.getJSON(GW.Core.Config.KEYS.PROFILE, {});
    },

    /** プロフィール情報を保存 */
    setProfile: function (profile) {
      GW.Core.Storage.setJSON(GW.Core.Config.KEYS.PROFILE, profile);
    },

    /**
     * データ保全モーダルを表示すべきタイミング判定
     *   設計憲法・第1条：押し付けず、節目（7, 14, 21, 30, 60回）でのみ提示
     *   かつ、過去24時間以内に提示済みなら再提示しない（うるさくならないよう配慮）
     */
    shouldShowBackupPrompt: function () {
      // 既にバックアップ済みなら不要
      if (!this.isGuest()) return false;

      var count = this.getUseCount();
      var milestone = GW.Core.Config.BACKUP_PROMPT_AT.indexOf(count) >= 0;
      if (!milestone) return false;

      // 24時間以内に提示済みならスキップ
      var lastPrompt = Number(GW.Core.Storage.get(GW.Core.Config.KEYS.LAST_PROMPT, '0'));
      if (lastPrompt && Date.now() - lastPrompt < 24 * 60 * 60 * 1000) {
        return false;
      }
      return true;
    },

    /** 「あとで」を選択された記録 */
    dismissBackupPrompt: function () {
      GW.Core.Storage.set(GW.Core.Config.KEYS.LAST_PROMPT, String(Date.now()));
    },

    /**
     * バックアップ連携を完了させる（ゲスト → バックアップ済みへ遷移）
     *
     * 実装フェーズ：
     *   現在は「ご案内のみ」段階のため、実プロバイダ連携は将来実装。
     *   この関数はインターフェース確定用のスタブ。
     *   将来 Google/LINE/Apple SDK を組み込む際の差し替えポイント。
     */
    linkBackup: function (provider, providerUid) {
      var self = this;
      var oldId = this.getUserId();

      return GW.Core.Api.call('core.linkBackup', {
        oldGwUserId:   oldId,
        provider:      provider,    // 'google' | 'line' | 'apple'
        providerUid:   providerUid,
        deviceId:      this.getDeviceId(),
        profile:       this.getProfile()
      }).then(function (res) {
        if (res && res.ok && res.newGwUserId) {
          // 新IDで上書き
          GW.Core.Storage.set(GW.Core.Config.KEYS.USER_ID, res.newGwUserId);
          GW.Core.Storage.set(GW.Core.Config.KEYS.STATE, 'backed_up');
          GW.Core.UI.toast('✅ データを保全しました');
          return res;
        }
        throw new Error((res && res.error) || 'バックアップ連携に失敗しました');
      });
    },

    /**
     * ログアウト（別プレイヤーで使う）
     *   端末ローカルのGW_USER_IDをクリアして再発行を促す。
     *   ※バックアップ済みの場合は警告を出すべきだが、初期実装ではシンプルに。
     */
    reset: function () {
      // GW.Core.Config.KEYS の全てをクリア
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
  // 【SECTION 7】GW.Core.UI - UI共通部品（Toast / Modal / Confirm / Loading）
  //
  // 設計意図：
  //   - 全モジュールが共通で使う UI 部品の集約
  //   - alert()/confirm()/prompt() は iOS PWA で表示崩れの原因になるため
  //     必ずこのモジュール経由でモーダル表示する
  // ════════════════════════════════════════════════════════════════
  GW.Core.UI = {
    _toastTimer: null,
    _confirmCallback: null,

    /** トースト表示 */
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

    /** 確認モーダル（OK/キャンセル） */
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

    /** モーダル表示（汎用） */
    showModal: function (modalId) {
      var el = document.getElementById(modalId);
      if (el) el.classList.add('show');
    },

    /** モーダル非表示 */
    hideModal: function (modalId) {
      var el = document.getElementById(modalId);
      if (el) el.classList.remove('show');
    },

    /**
     * ハプティックフィードバック（短い振動）
     *   ボタン押下時の物理的フィードバックを再現
     */
    haptic: function () {
      if (navigator.vibrate) {
        try { navigator.vibrate(10); } catch (e) {}
      }
    },

    /** HTMLエスケープ（XSS対策・全モジュール共通） */
    escapeHtml: function (s) {
      return this._escapeHtml(s);
    },
    _escapeHtml: function (s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m];
      });
    },

    /** 起動オーバーレイの表示テキストを更新 */
    setBootText: function (text) {
      var el = document.getElementById('gw-boot-sub');
      if (el) el.textContent = text;
    },

    /** 起動オーバーレイを隠す */
    hideBoot: function () {
      var el = document.getElementById('gw-boot-overlay');
      if (el) el.classList.add('hidden');
    },

    /** 起動エラーバナーを表示 */
    showStartupError: function (message, detail) {
      var banner = document.getElementById('gw-startup-error');
      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'gw-startup-error';
        banner.className = 'gw-startup-error';
        document.body.appendChild(banner);
      }
      var detailHtml = detail
        ? '<div style="font-size:11px;opacity:0.85;margin-top:4px;">' + this._escapeHtml(detail) + '</div>'
        : '';
      banner.innerHTML =
        '<button class="err-close" data-action="close-startup-error">×</button>' +
        '<div class="err-title">⚠ 起動エラー</div>' +
        '<div>' + this._escapeHtml(message) + '</div>' +
        detailHtml;
    }
  };

  // ════════════════════════════════════════════════════════════════
  // 【SECTION 8】GW.Core.Router - 画面遷移・フッターナビ制御
  //
  // 設計意図【設計憲法・第3条】：
  //   - 5つの画面 (home/gland/gcompete/gtown/mypage) を排他的に切替
  //   - フッターナビ button[data-route] とセクション #gw-screen-{route} の対応
  //   - G-COMPETE / G-TOWN は Coming Soon トースト表示で即帰還
  //   - ハッシュ (#home / #gland 等) でディープリンク対応（PWA共有時用）
  // ════════════════════════════════════════════════════════════════
  GW.Core.Router = {
    /** 現在のルート名 */
    current: 'home',

    /** ルート定義（モジュールへのマッピング） */
    routes: {
      home:     { screen: 'gw-screen-home',     module: 'Home',     active: true },
      gland:    { screen: 'gw-screen-gland',    module: 'GLand',    active: true },
      gcompete: { screen: 'gw-screen-gcompete', module: 'GCompete', active: false }, // プレースホルダ
      gtown:    { screen: 'gw-screen-gtown',    module: 'GTown',    active: false }, // プレースホルダ
      mypage:   { screen: 'gw-screen-mypage',   module: 'MyPage',   active: true }
    },

    /**
     * 画面遷移
     *   @param {string} route - ルート名
     *   @param {Object} [params] - モジュールに渡すパラメータ（任意）
     */
    go: function (route, params) {
      var def = this.routes[route];
      if (!def) {
        console.warn('[GW.Router] unknown route:', route);
        return;
      }

      // ── Coming Soon モジュール（G-COMPETE / G-TOWN）はトースト表示のみ ──
      if (!def.active) {
        var labels = { gcompete: 'G-COMPETE', gtown: 'G-TOWN' };
        GW.Core.UI.toast('🔔 ' + (labels[route] || route) + ' は近日公開予定です');
        // フッターナビの見た目だけ一瞬反映するが、すぐに元に戻す
        this._highlightNav(route);
        var self = this;
        setTimeout(function () { self._highlightNav(self.current); }, 800);
        return;
      }

      // ── 通常遷移 ──
      // 全画面を非表示
      var keys = Object.keys(this.routes);
      for (var i = 0; i < keys.length; i++) {
        var s = document.getElementById(this.routes[keys[i]].screen);
        if (s) s.classList.remove('active');
      }
      // 対象画面を表示
      var target = document.getElementById(def.screen);
      if (target) target.classList.add('active');

      // フッターナビのハイライト
      this._highlightNav(route);

      // 現在ルートを更新
      this.current = route;

      // URLハッシュも更新（リロード時に同じ画面に戻れるように）
      try {
        if (location.hash !== '#' + route) {
          history.replaceState(null, '', '#' + route);
        }
      } catch (e) {}

      // ── モジュール側の init/render を呼び出す ──
      var modName = def.module;
      var mod = GW.Modules[modName];
      if (mod && typeof mod.render === 'function') {
        try {
          mod.render(params || {});
        } catch (e) {
          console.error('[GW.Router] module render error:', modName, e);
        }
      }

      // FABはG-LANDスコア入力時のみ表示
      var fab = document.getElementById('gw-fab-jump');
      if (fab) {
        var shouldShow = (route === 'gland' && GW.Modules.GLand && GW.Modules.GLand.isInRound && GW.Modules.GLand.isInRound());
        fab.classList.toggle('gw-hidden', !shouldShow);
      }
    },

    /** フッターナビのactive表示を更新 */
    _highlightNav: function (route) {
      var btns = document.querySelectorAll('.gw-footer-nav button[data-route]');
      for (var i = 0; i < btns.length; i++) {
        btns[i].classList.toggle('active', btns[i].getAttribute('data-route') === route);
      }
    },

    /** URLハッシュ・パラメータからルートを決定 */
    resolveInitial: function () {
      try {
        var hash = (location.hash || '').replace(/^#/, '');
        if (hash && this.routes[hash]) return hash;
      } catch (e) {}
      return 'home';
    }
  };

  // ════════════════════════════════════════════════════════════════
  // 【SECTION 9】GW.Core.Action - data-action 集中処理（CSP対応）
  //
  // 設計意図：
  //   - HTML の onclick="..." を全廃し、button[data-action="xxx"] で統一
  //   - body にひとつイベントリスナを登録して伝播で処理（軽量）
  //   - 将来のCSP(Content Security Policy)強化にも対応できる
  // ════════════════════════════════════════════════════════════════
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

  // ════════════════════════════════════════════════════════════════
  // 【SECTION 10】GW.Core.SW - Service Worker 登録
  //
  // 設計意図：
  //   - ゴルフ場での電波弱地帯対応の核心
  //   - 登録失敗してもアプリは普通に動く（致命的でない）
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
  //
  // 起動順序：
  //   1) Service Worker 登録（バックグラウンドで進行）
  //   2) Auth 初期化（GW_USER_ID 取得 / 利用回数+1）
  //   3) Action ハンドラ登録（イベント受付開始）
  //   4) キャッシュからの即時起動 STAGE1
  //   5) Router で初期画面表示
  //   6) バックグラウンドでサーバから最新boot bundle取得 STAGE2
  //   7) 必要なら「データ保全のご案内」モーダル表示
  // ════════════════════════════════════════════════════════════════
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
  // 【SECTION 12】グローバルイベント
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

  // ──────────────────────────────────────────────────────────
  // この時点で GW.Core 層は完全に整いました。
  // ファイル後半（script.js 後半）で GW.Modules 層を実装します。
  // ──────────────────────────────────────────────────────────

  // ============================================================
  // ↓↓↓ ここから先は【投稿 3/5】で実装する GW.Modules 層 ↓↓↓
  // ============================================================

  // ════════════════════════════════════════════════════════════════
  // 【GW.Modules.GLand】G-LAND モジュール本体
  //
  // 設計意図：
  //   - スコア入力・履歴・同伴メンバー表の3機能を統括
  //   - 各機能はサブモジュール（Score / History / Mates）として分離
  //   - Router からは render() のみが呼ばれる
  //   - 他モジュールへの直接参照禁止（Router 経由）
  //
  // 状態管理：
  //   - GW.Modules.GLand.state にラウンド進行中のデータを保持
  //   - サーバ送信前のローカル状態は state.scores が唯一の真実
  // ════════════════════════════════════════════════════════════════
  GW.Modules.GLand = {

    // ── ラウンド進行中の状態（モジュール内のみで使用） ──
    state: {
      player:        null,          // 現在のプレイヤー情報 {playerId, userId, nickname, ...}
      scores:        [],            // 18ホール分のスコア [{stroke, putt}, ...]
      currentHole:   0,             // 現在表示中のホール（0-17）
      groupMates:    [],            // 同伴メンバー
      displayMode:   'stroke',      // 'stroke' | 'pardiff' | 'symbol'
      subtab:        'score',       // 'score' | 'hist'
      _saveTimer:    {},            // ホール別のデバウンスタイマー
      _matesTimer:   null,          // 同伴メンバー表ポーリングタイマー
      _historyExpanded: {}          // 履歴アコーディオン展開状態
    },

    /**
     * ★Router からの唯一のエントリポイント
     *   画面に入る時に呼ばれる。
     *   - プレイヤー未登録なら登録カードを表示
     *   - 登録済みならスコア入力UIを表示
     */
    render: function (params) {
      // 表示モードを localStorage から復元
      var savedDisp = GW.Core.Storage.get(GW.Core.Config.KEYS.DISPLAY_MODE);
      if (savedDisp && ['stroke', 'pardiff', 'symbol'].indexOf(savedDisp) >= 0) {
        this.state.displayMode = savedDisp;
      }

      // プレイヤー情報をlocalStorageから復元
      var savedPlayer = GW.Core.Storage.getJSON(GW.Core.Config.KEYS.PLAYER);
      if (savedPlayer && savedPlayer.playerId) {
        this.state.player = savedPlayer;
        this._enterMain();
      } else {
        this._showRegister();
      }
    },

    /** 現在ラウンド中か？（Router から FAB 表示判定に使われる） */
    isInRound: function () {
      return !!(this.state.player && this.state.player.playerId);
    },

    /** ===== 登録カード（プレイヤー未登録時） ===== */
    _showRegister: function () {
      document.getElementById('gw-gland-register').classList.remove('gw-hidden');
      document.getElementById('gw-gland-main').classList.add('gw-hidden');

      // コース選択肢を構築
      var courseSel = document.getElementById('gw-reg-course');
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

      // プロフィール情報があれば入力欄に復元（前回の入力を覚えている）
      var prof = GW.Core.Auth.getProfile();
      if (prof.nickname) document.getElementById('gw-reg-nick').value = prof.nickname;
      if (prof.realName) document.getElementById('gw-reg-real').value = prof.realName;
      if (prof.groupName) document.getElementById('gw-reg-group').value = prof.groupName;
    },

    /**
     * 登録ボタン押下時の処理
     *   設計憲法・第1条：楽観的UI - 仮IDで即遷移、サーバ応答で正式IDに置換
     */
    _register: function () {
      var courseId  = document.getElementById('gw-reg-course').value;
      var nickname  = document.getElementById('gw-reg-nick').value.trim();
      var realName  = document.getElementById('gw-reg-real').value.trim();
      var groupName = document.getElementById('gw-reg-group').value.trim();

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
      this.state.player = {
        playerId:   tmpPlayerId,
        userId:     GW.Core.Auth.getUserId(),
        gwUserId:   GW.Core.Auth.getUserId(),
        nickname:   nickname,
        realName:   realName,
        groupName:  groupName,
        courseId:   courseId,
        isTemporary: true
      };
      GW.Core.Storage.setJSON(GW.Core.Config.KEYS.PLAYER, this.state.player);
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
            self.state.player.playerId = res.playerId;
            self.state.player.isTemporary = false;
            GW.Core.Storage.setJSON(GW.Core.Config.KEYS.PLAYER, self.state.player);
          } else {
            GW.Core.UI.toast(res && res.msg ? res.msg : '登録失敗');
          }
          return;
        }
        // 正式IDに差し替え
        self.state.player.playerId = res.playerId;
        if (res.userId) self.state.player.userId = res.userId;
        self.state.player.isTemporary = false;
        GW.Core.Storage.setJSON(GW.Core.Config.KEYS.PLAYER, self.state.player);
      });
    },

    /** ===== メイン画面（スコア入力エリア）に入る ===== */
    _enterMain: function () {
      document.getElementById('gw-gland-register').classList.add('gw-hidden');
      document.getElementById('gw-gland-main').classList.remove('gw-hidden');

      // ヘッダーのコース名・グループ名を反映
      this._updateHeaderInfo();

      // スコアをキャッシュから復元
      var cachedScores = GW.Core.Cache.loadMyScores(this.state.player.playerId);
      if (cachedScores && cachedScores.length === 18) {
        this.state.scores = cachedScores;
      } else {
        this.state.scores = [];
        for (var i = 0; i < 18; i++) {
          this.state.scores.push({ stroke: 0, putt: 0 });
        }
      }

      // 現在ホールをリセット
      this.state.currentHole = 0;

      // プレイヤー名を表示
      document.getElementById('gw-me-name').textContent =
        this.state.player.nickname + '(' + this.state.player.groupName + ')';

      // サブタブ初期化
      this.state.subtab = 'score';
      this.Score._render();

      // FAB 表示
      var fab = document.getElementById('gw-fab-jump');
      if (fab) fab.classList.remove('gw-hidden');

      // 仮IDのうちはサーバー取得スキップ
      var self = this;
      if (!this.state.player.isTemporary) {
        GW.Core.Api.call('gland.getMyScores', { playerId: this.state.player.playerId })
          .then(function (res) {
            var scores = res && res.scores ? res.scores : null;
            if (scores && scores.length >= 18) {
              var changed = false;
              for (var i = 0; i < 18; i++) {
                if (!self.state.scores[i] ||
                    self.state.scores[i].stroke !== scores[i].stroke ||
                    self.state.scores[i].putt   !== scores[i].putt) {
                  changed = true;
                  break;
                }
              }
              if (changed) {
                self.state.scores = scores;
                self.Score._updateCells();
                GW.Core.Cache.saveMyScores(self.state.player.playerId, scores);
              }
            }
          })
          .catch(function () {});
      }
    },

    /** ヘッダー情報を更新 */
    _updateHeaderInfo: function () {
      var cnEl = document.getElementById('gw-header-course');
      var gnEl = document.getElementById('gw-header-group');
      if (cnEl && this.state.player) {
        var course = ((GW.Core.State && GW.Core.State.courses) || [])
          .find(function (c) { return c.id === this.state.player.courseId; }, this);
        cnEl.textContent = course ? course.name : '';
      }
      if (gnEl && this.state.player) {
        gnEl.textContent = this.state.player.groupName || '';
      }
    },

    /** サブタブ切替（'score' or 'hist'） */
    _switchSubtab: function (tab) {
      this.state.subtab = tab;
      document.getElementById('gw-subtab-score').classList.toggle('active', tab === 'score');
      document.getElementById('gw-subtab-hist').classList.toggle('active', tab === 'hist');
      document.getElementById('gw-subtab-content-score').classList.toggle('gw-hidden', tab !== 'score');
      document.getElementById('gw-subtab-content-hist').classList.toggle('gw-hidden', tab !== 'hist');

      // FAB はスコア入力サブタブの時のみ
      var fab = document.getElementById('gw-fab-jump');
      if (fab) fab.classList.toggle('gw-hidden', tab !== 'score');

      if (tab === 'hist') {
  // 履歴サブモジュールを呼び出す
  this.History.render();
}

    },

    /** ネットワーク復帰時の処理（Core から呼ばれる） */
    onOnline: function () {
      if (!this.state.player || !this.state.player.playerId) return;
      if (this.state.player.isTemporary) return;
      var self = this;
      GW.Core.Api.call('gland.getMyScores', { playerId: this.state.player.playerId })
        .then(function (res) {
          var scores = res && res.scores ? res.scores : null;
          if (scores && scores.length >= 18) {
            self.state.scores = scores;
            self.Score._updateCells();
            GW.Core.Cache.saveMyScores(self.state.player.playerId, scores);
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

    // ════════════════════════════════════════════════════════════════
    // 【GW.Modules.GLand.Score】スコア入力サブモジュール
    //
    // ★v4.7 の最大の白眉「updateScoreCellsOnly」をそのまま継承
    //   - スコア変更時に DOM 全体を再構築せず、関係セルだけを差分更新
    //   - 60fps を維持する超軽量UI実装
    //
    // 設計意図：
    //   - chgStroke/chgPutt は即時UI反映 + 裏で Fire-and-Forget 保存
    //   - スコア表示は3モード（stroke / pardiff / symbol）切替可能
    //   - ホール切替は前/次ボタン + ホールピッカー（モーダル）の2系統
    // ════════════════════════════════════════════════════════════════
    Score: {
      // PARに対する記号（旧 SYM_* 定数を継承）
      SYM_ALBATROSS: '\u2606',
      SYM_EAGLE:     '\u25CE',
      SYM_BIRDIE:    '\u25CB',
      SYM_PAR:       '\u2014',
      SYM_BOGEY:     '\u25B3',
      SYM_DBOGEY:    '\u25A1',

      /** スコア入力UIを描画（ホール切替時に呼ばれる） */
      _render: function () {
        var st = GW.Modules.GLand.state;
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

            // 同伴メンバー表のプレースホルダ（Mates サブモジュール実装は次回）
            '<div class="gw-mate-table-wrap" id="gw-mate-table-wrap">' +
              '<h4 style="margin:0 0 10px;color:var(--gold-bri);">同伴メンバー スコア表（横スクロール可）</h4>' +
              '<div id="gw-mate-table-body">' +
                '<div style="color:var(--text-sub);font-size:14px;padding:10px;">準備中...</div>' +
              '</div>' +
            '</div>' +
          '</div>';

        document.getElementById('gw-hole-list').innerHTML = html;
        this._updateTotal();
        this._buildHolePicker();
      },

      /** スコア入力UIを生成（数字±方式・既存資産継承） */
      _renderStrokeInputUI: function (i, par, s) {
        var st = GW.Modules.GLand.state;
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
        var st = GW.Modules.GLand.state;
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
        var st = GW.Modules.GLand.state;
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
       * 設計意図：
       *   スコア変更ごとに renderHoles() を呼ぶと、ボタン全体が再生成されて
       *   60fps を維持できない。ここでは更新が必要なセルだけをピンポイント
       *   で書き換えることで、操作感を劇的に向上させる。
       *
       * 更新対象：
       *   - 打数セル (#gw-stk-{i})
       *   - パットセル (#gw-put-{i})
       *   - vs PAR タグ (#gw-vt-{i})
       *   - 合計表示 (#gw-me-total)
       *   - ホールピッカーの該当ボタン
       *   - （Mates 表の自分の列：次回 Mates サブモジュールで実装）
       */
      _updateCells: function () {
        var st = GW.Modules.GLand.state;
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

        // ── Mates 表の自分の列を即時更新は次回（Mates サブモジュール実装時） ──
      },

      /** 合計とPAR差を更新 */
      _updateTotal: function () {
        var st = GW.Modules.GLand.state;
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
       *   設計憲法・第2条：GAS制限回避のため、連続操作はデバウンス
       *   - 仮IDの場合はサーバー送信スキップ（registerPlayer完了後に再送）
       */
      _saveScore: function (i) {
        var st = GW.Modules.GLand.state;

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
        var st = GW.Modules.GLand.state;
        this._autoSaveIfBlank();
        if (st.currentHole > 0) {
          st.currentHole--;
          this._render();
        }
      },

      /** 次のホールへ */
      _nextHole: function () {
        var st = GW.Modules.GLand.state;
        this._autoSaveIfBlank();
        if (st.currentHole < 17) {
          st.currentHole++;
          this._render();
        }
      },

      /**
       * 未入力ホールを自動でパー埋め
       *   ホール切替時、現在ホールが未入力なら PAR/2パットで自動保存
       *   （既存資産継承：操作を強制せず、自然にスコアが埋まる）
       */
      _autoSaveIfBlank: function () {
        var st = GW.Modules.GLand.state;
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
        GW.Modules.GLand.state.displayMode = mode;
        GW.Core.Storage.set(GW.Core.Config.KEYS.DISPLAY_MODE, mode);
        this._render();  // モード切替時はフル再描画（ボタン状態反映のため）
      },

      /** スコア値を表示用にフォーマット（モードに応じて） */
      _formatScore: function (stroke, par) {
        var st = GW.Modules.GLand.state;
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
        var st = GW.Modules.GLand.state;
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
        var st = GW.Modules.GLand.state;
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
        var st = GW.Modules.GLand.state;
        this._autoSaveIfBlank();
        st.currentHole = Math.max(0, Math.min(17, Number(idx) || 0));
        this._closeHolePicker();
        this._render();
      },

      /** ピッカーを開く */
      _openHolePicker: function () {
        this._buildHolePicker();
        document.getElementById('gw-hole-picker').classList.add('show');
      },

      /** ピッカーを閉じる */
      _closeHolePicker: function () {
        document.getElementById('gw-hole-picker').classList.remove('show');
      },

      /** ホール拡大表示（Mates 表のヘッダタップで開く - 次回実装時に呼ばれる） */
      _openHoleZoom: function (holeNo) {
        var idx = holeNo - 1;
        var pars = (GW.Core.State && GW.Core.State.pars) || new Array(18).fill(4);
        var par = pars[idx] || 4;
        document.getElementById('gw-hz-num').textContent = holeNo + 'H';
        document.getElementById('gw-hz-par').textContent = 'PAR ' + par;
        document.getElementById('gw-hz-list').innerHTML =
          '<div style="color:var(--text-sub);text-align:center;padding:14px;">同伴メンバー表示は準備中</div>';
        document.getElementById('gw-hole-zoom').classList.add('show');
        GW.Core.UI.haptic();
      },

      _closeHoleZoom: function () {
        document.getElementById('gw-hole-zoom').classList.remove('show');
      },

      /** 同伴メンバー表のスクロール位置を現在ホールに合わせる（Mates 実装時に活用） */
      _centerCurrentHole: function () {
        try {
          var wrap = document.getElementById('gw-mate-table-wrap');
          if (!wrap) return;
          var cur = GW.Modules.GLand.state.currentHole;
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
        var st = GW.Modules.GLand.state;
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
    },  // ── Score サブモジュールここまで ──

    // ════════════════════════════════════════════════════════════════
        // ════════════════════════════════════════════════════════════════
    // 【GW.Modules.GLand.History】履歴サブモジュール
    //
    // 設計意図：
    //   - サーバの 'gland.getHistoryList' / 'gland.getHistoryDetail' を呼び出す
    //   - 統計カード（ラウンド数 / ベスト / 平均打 / 平均パット）を表示
    //   - 履歴行は折りたたみ式（タップで詳細展開）
    //   - 詳細は同組4名のスコアテーブル（既存挙動継承）
    //
    // パフォーマンス：
    //   - 一覧取得は1回、詳細はタップ時のみ取得（遅延ロード）
    //   - 展開状態は state._historyExpanded に保持（再描画時も維持）
    //
    // 設計憲法・第7条：
    //   - "履歴" "ラウンド" の表現は維持。"保存" を強調しない（押し付けない）
    // ════════════════════════════════════════════════════════════════
    History: {

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
        var st = GW.Modules.GLand.state;
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

        var courseId = document.getElementById('gw-hist-course').value || '';
        var period   = document.getElementById('gw-hist-period').value || 'all';

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

        var st = GW.Modules.GLand.state;
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
        var st = GW.Modules.GLand.state;
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
        var st = GW.Modules.GLand.state;
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
                display = GW.Modules.GLand.Score._formatScore(stroke, pars[hh]);
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
    },  // ── History サブモジュールここまで ──

    Mates: {

      /** 同伴メンバー表をロード（スコア入力タブ表示時に呼ばれる） */
      load: function () {
        var st = GW.Modules.GLand.state;
        if (!st.player || !st.player.courseId || !st.player.groupName) return;

        // ── 仮IDのうちは自分のみで描画 ──
        if (String(st.player.playerId).indexOf('P_TMP_') === 0) {
          var pars = (GW.Core.State && GW.Core.State.pars) || new Array(18).fill(4);
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
          return;
        }

        // ── キャッシュから即描画 ──
        var cached = GW.Core.Cache.loadMates(st.player.courseId, st.player.groupName);
        if (cached) {
          st.groupMates = cached.members || [];
          this._render(cached);
        }

        // ── サーバから最新取得 ──
        var self = this;
        GW.Core.Api.call('gland.getMates', {
          courseId:  st.player.courseId,
          groupName: st.player.groupName,
          playerId:  st.player.playerId
        }).then(function (res) {
          if (res && res.members) {
            self._render(res);
            GW.Core.Cache.saveMates(st.player.courseId, st.player.groupName, res);
          }
        }).catch(function () {});

        // ── 30秒ポーリング（スコア入力タブの時のみ）──
        this._scheduleNextPoll();
      },

      /** 次回ポーリングをスケジュール */
      _scheduleNextPoll: function () {
        var st = GW.Modules.GLand.state;
        if (st._matesTimer) clearTimeout(st._matesTimer);
        // スコア入力サブタブ かつ ホーム画面でない時のみポーリング継続
        if (st.subtab !== 'score') return;
        if (GW.Core.Router.current !== 'gland') return;

        var self = this;
        st._matesTimer = setTimeout(function () {
          self.load();
        }, GW.Core.Config.MATES_POLL_MS);
      },

      /** ポーリング停止（タブ切替時等） */
      stopPolling: function () {
        var st = GW.Modules.GLand.state;
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
        if (!body) return;
        if (!data || !data.members || !data.members.length) {
          body.innerHTML = '<div style="color:var(--text-sub);font-size:14px;padding:10px;">' +
                           '同伴メンバーなし</div>';
          return;
        }

        var st = GW.Modules.GLand.state;
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
        var rows = members.map(function (m) {
          var total = 0;
          var trClass = m.isMe ? ' class="me"' : '';
          var starMark = m.isMe ? '★ ' : '';
          var displayName = m.realName || m.nickname || '?';
          var tds = '<td class="player-name-cell">' + starMark + esc(displayName) + '</td>';
          for (var k3 = 0; k3 < 18; k3++) {
            var v = (m.strokes && m.strokes[k3]) || 0;
            total += v;
            var display = v > 0
              ? GW.Modules.GLand.Score._formatScore(v, pars[k3])
              : '-';
            var st2 = (k3 === cur) ? ' current-c' : '';
            tds += '<td class="hole-col-' + k3 + st2 + '">' + display + '</td>';
          }
          tds += '<td class="total-col">' + (total || '-') + '</td>';
          return '<tr' + trClass + '>' + tds + '</tr>';
        }).join('');

        body.innerHTML = '<table class="gw-mate-table">' + head + parRow + rows + '</table>';

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
        var st = GW.Modules.GLand.state;
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

      /**
       * 現在ホールを表の中央にスクロール
       *   設計意図：18ホール表は横スクロール必須。自動センタリングで操作性確保
       */
      _centerCurrentHole: function () {
        try {
          var wrap = document.getElementById('gw-mate-table-wrap');
          if (!wrap) return;
          var cur = GW.Modules.GLand.state.currentHole;
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
        var st = GW.Modules.GLand.state;
        var idx = holeNo - 1;
        var pars = (GW.Core.State && GW.Core.State.pars) || new Array(18).fill(4);
        var par = pars[idx] || 4;
        var esc = GW.Core.UI.escapeHtml;

        document.getElementById('gw-hz-num').textContent = holeNo + 'H';
        document.getElementById('gw-hz-par').textContent = 'PAR ' + par;

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
        document.getElementById('gw-hz-list').innerHTML = html;
        document.getElementById('gw-hole-zoom').classList.add('show');
        GW.Core.UI.haptic();
      }
    },  // ── Mates サブモジュールここまで ──
    /**
     * data-action ハンドラ登録
     *   GW.Core.Action に Score サブモジュールのアクションを登録
     */
    _registerActions: function () {
      GW.Core.Action.registerMany({
        // ── 登録カード ──
        'register':            function () { GW.Modules.GLand._register(); },

        // ── スコア入力 ──
        'gland-stroke-minus':  function () { GW.Modules.GLand.Score._chgStroke(-1); },
        'gland-stroke-plus':   function () { GW.Modules.GLand.Score._chgStroke(+1); },
        'gland-putt-minus':    function () { GW.Modules.GLand.Score._chgPutt(-1); },
        'gland-putt-plus':     function () { GW.Modules.GLand.Score._chgPutt(+1); },
        'gland-prev-hole':     function () { GW.Modules.GLand.Score._prevHole(); },
        'gland-next-hole':     function () { GW.Modules.GLand.Score._nextHole(); },

        // ── 表示モード切替 ──
        'gland-disp-stroke':   function () { GW.Modules.GLand.Score._setDisplayMode('stroke'); },
        'gland-disp-pardiff':  function () { GW.Modules.GLand.Score._setDisplayMode('pardiff'); },
        'gland-disp-symbol':   function () { GW.Modules.GLand.Score._setDisplayMode('symbol'); },

        // ── ホールピッカー ──
        'open-hole-picker':    function () { GW.Modules.GLand.Score._openHolePicker(); },
        'close-hole-picker':   function () { GW.Modules.GLand.Score._closeHolePicker(); },
        'gland-jump-hole':     function (el) {
          var h = Number(el.getAttribute('data-hole'));
          GW.Modules.GLand.Score._jumpToHole(h);
        },

        // ── ホール拡大表示 ──
        'close-hole-zoom':     function () { GW.Modules.GLand.Score._closeHoleZoom(); },

        // ── ラウンド終了 ──
        'finish-round':        function () { GW.Modules.GLand.Score._finishRound(); },

        // ── サブタブ切替 ──
        'gland-subtab-score':  function () { GW.Modules.GLand._switchSubtab('score'); },
        'gland-subtab-hist':   function () { GW.Modules.GLand._switchSubtab('hist'); },
                // ── 履歴サブモジュール ──
        'gland-hist-toggle':   function (el) {
          var hid = el.getAttribute('data-history-id');
          if (hid) GW.Modules.GLand.History._toggleDetail(hid);
        },
        'gland-hist-refresh':  function () {
          GW.Modules.GLand.History._loadList();
        },


        // ── ラウンド開始（ポータルCTAから） ──
        'start-round':         function () {
          GW.Core.Router.go('gland');
        }
      });

      // サブタブのクリックは HTML 側で data-subtab を使っているため、対応する data-action を補完
      var subtabBtns = document.querySelectorAll('[data-subtab]');
      for (var i = 0; i < subtabBtns.length; i++) {
        subtabBtns[i].addEventListener('click', function () {
          var t = this.getAttribute('data-subtab');
          GW.Modules.GLand._switchSubtab(t);
        });
      }
            // ── 履歴フィルタの change イベント ──
      var histCourseSel = document.getElementById('gw-hist-course');
      var histPeriodSel = document.getElementById('gw-hist-period');
      if (histCourseSel) {
        histCourseSel.addEventListener('change', function () {
          GW.Modules.GLand.History._onFilterChange();
        });
      }
      if (histPeriodSel) {
        histPeriodSel.addEventListener('change', function () {
          GW.Modules.GLand.History._onFilterChange();
        });
      }

    },

    /** モジュール初期化（起動時に1回だけ呼ばれる想定） */
    init: function () {
      this._registerActions();
    }
  };

  // ★モジュール定義時に init を即実行（Action 登録のため）
  GW.Modules.GLand.init();

   // ★Score サブモジュールへの Mates 連携を追加注入
  //
  // Score._updateCells() の最後で Mates.updateMyColumn() を呼ぶ。
  // また Score._render() の最後で Mates.load() を呼ぶ。
  // これらは Mates が後から定義されたため、ここでフックを追加する。
  // ════════════════════════════════════════════════════════════════
  (function injectMatesHooks() {
    var Score = GW.Modules.GLand.Score;

    // _updateCells に Mates 連携を追加
    var origUpdateCells = Score._updateCells;
    Score._updateCells = function () {
      origUpdateCells.call(this);
      try {
        GW.Modules.GLand.Mates.updateMyColumn();
      } catch (e) {}
    };

    // _render の最後で Mates.load() を呼ぶ
    var origRender = Score._render;
    Score._render = function () {
      origRender.call(this);
      try {
        if (GW.Modules.GLand.state.subtab === 'score') {
          GW.Modules.GLand.Mates.load();
        }
      } catch (e) {}
    };

    // _openHoleZoom を Mates 版に差し替え（プレースホルダから本実装へ昇格）
    Score._openHoleZoom = function (holeNo) {
      GW.Modules.GLand.Mates.openZoom(holeNo);
    };
  })();

  // ════════════════════════════════════════════════════════════════
  // ★Mates アクションを GW.Core.Action に登録
  // ════════════════════════════════════════════════════════════════
  GW.Core.Action.registerMany({
    'gland-hole-zoom': function (el) {
      var h = Number(el.getAttribute('data-hole'));
      GW.Modules.GLand.Mates.openZoom(h);
    }
  });

  // ════════════════════════════════════════════════════════════════
  // ★サブタブ切替時の Mates ポーリング制御
  //
  // GW.Modules.GLand._switchSubtab を拡張し、
  // 履歴タブに移った時は Mates ポーリングを止める
  // ════════════════════════════════════════════════════════════════
  (function injectSubtabHook() {
    var origSwitch = GW.Modules.GLand._switchSubtab;
    GW.Modules.GLand._switchSubtab = function (tab) {
      origSwitch.call(this, tab);
      if (tab !== 'score') {
        GW.Modules.GLand.Mates.stopPolling();
      }
    };

    // Router 経由で別画面に移った時もポーリング停止
    var origGo = GW.Core.Router.go;
    GW.Core.Router.go = function (route, params) {
      if (route !== 'gland' && GW.Modules.GLand.Mates) {
        GW.Modules.GLand.Mates.stopPolling();
      }
      return origGo.call(this, route, params);
    };
  })();

  // ════════════════════════════════════════════════════════════════
  // 【GW.Modules.Home】ポータル画面モジュール
  //
  // 設計意図：
  //   - 挨拶 + ユーザー名 + 状態バッジ
  //   - 「ラウンドを開始」CTAボタン → G-LAND遷移
  //   - 4モジュール（G-LAND/G-COMPETE/G-TOWN/マイページ）への導線カード
  //   - 最近のラウンド一覧（履歴から最新数件を取得）
  // ════════════════════════════════════════════════════════════════
  GW.Modules.Home = {

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
  };

  // ════════════════════════════════════════════════════════════════
  // 【GW.Modules.GCompete】Coming Soon モジュール（プレースホルダ）
  //
  // 設計意図：
  //   - Router.routes.gcompete.active = false のため、本来ここは呼ばれない
  //   - 万一フッターナビ以外から遷移が来た場合の保険として実装
  // ════════════════════════════════════════════════════════════════
  GW.Modules.GCompete = {
    render: function () {
      // 静的画面のためレンダリング不要
    }
  };

  // ════════════════════════════════════════════════════════════════
  // 【GW.Modules.GTown】Coming Soon モジュール（プレースホルダ）
  // ════════════════════════════════════════════════════════════════
  GW.Modules.GTown = {
    render: function () {
      // 静的画面のためレンダリング不要
    }
  };

  // ════════════════════════════════════════════════════════════════
  // 【GW.Modules.MyPage】マイページモジュール
  //
  // 設計意図【設計憲法・第7条】：
  //   - 「データ保全のご案内」を主役にしつつ、押し付けない
  //   - 利用回数・状態を可視化（信頼感の演出）
  //   - PWAインストール案内をここに集約
  //   - "認証" "ログイン" の文言は一切使わない
  // ════════════════════════════════════════════════════════════════
  GW.Modules.MyPage = {

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
  };

  // ════════════════════════════════════════════════════════════════
  // 全モジュール定義完了。最初の Home 描画を発火。
  // bootstrap → Router.go('home') が走ると Home.render() が呼ばれる。
  // ════════════════════════════════════════════════════════════════

  console.log('[GW] all modules loaded:', Object.keys(GW.Modules));

  // ──────────────────────────────────────────────────────────
  // 即時実行関数を閉じる（ファイル末尾）
  // ──────────────────────────────────────────────────────────
})();
