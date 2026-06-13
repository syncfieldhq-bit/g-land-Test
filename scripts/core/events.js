/**
 * ═══════════════════════════════════════════════════════
 * scripts/core/events.js - data-action 集中処理
 *
 * 役割：
 *   - document.body に1つだけイベントリスナーを張る
 *   - data-action="xxx" を持つ要素のクリックを捕捉
 *   - 登録されたハンドラを呼び出す
 *
 * メリット：
 *   - 各画面が動的に描画されても、新たに addEventListener しなくて良い
 *   - パフォーマンス向上（リスナー数を最小化）
 *
 * 使い方:
 *   import { Events } from './core/events.js';
 *   Events.register('save', (el) => { ... });
 *   Events.bind(); // 1回だけ呼ぶ
 *
 *   // HTML: <button data-action="save">保存</button>
 * ═══════════════════════════════════════════════════════
 */

export const Events = {
  /** 登録されたハンドラ：{ actionName: handler } */
  _handlers: {},

  /** 既にbind済みかのフラグ */
  _bound: false,

  /**
   * 1つのアクションハンドラを登録
   */
  register(action, handler) {
    this._handlers[action] = handler;
  },

  /**
   * 複数のアクションをまとめて登録
   */
  registerMany(map) {
    Object.keys(map).forEach((k) => {
      this._handlers[k] = map[k];
    });
  },

  /**
   * グローバルクリックリスナーをbind（起動時に1回だけ呼ぶ）
   */
  bind() {
    if (this._bound) return;
    this._bound = true;

    document.body.addEventListener('click', (e) => {
      // クリックされた要素から親方向に data-action / data-route を探す
      let el = e.target;
      while (el && el !== document.body) {
        // data-route がある場合：ルーターに任せる
        const route = el.getAttribute && el.getAttribute('data-route');
        if (route) {
          e.preventDefault();
          this._handleRoute(route);
          return;
        }

        // data-action がある場合：登録ハンドラを呼ぶ
        const action = el.getAttribute && el.getAttribute('data-action');
        if (action) {
          const handler = this._handlers[action];
          if (handler) {
            e.preventDefault();
            try {
              handler(el, e);
            } catch (err) {
              console.error('[Events] handler error:', action, err);
            }
            return;
          }
        }
        el = el.parentNode;
      }
    });

    console.log('[core/events] bind complete');
  },

  /**
   * data-route 用の内部ハンドラ
   * Router が登録されたら自動的に呼べるよう、外部から差し込み可能にする
   */
  _routeHandler: null,

  setRouteHandler(handler) {
    this._routeHandler = handler;
  },

  _handleRoute(route) {
    if (this._routeHandler) {
      this._routeHandler(route);
    } else {
      console.warn('[Events] route handler not set:', route);
    }
  }
};

console.log('[core/events] loaded');
