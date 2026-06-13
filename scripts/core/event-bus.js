// =============================================================
// event-bus.js - シンプルなイベントバス（疎結合通信）
// =============================================================
const _listeners = new Map();

export const EventBus = {
  on(event, handler) {
    if (!_listeners.has(event)) _listeners.set(event, new Set());
    _listeners.get(event).add(handler);
    return () => this.off(event, handler);
  },
  off(event, handler) {
    _listeners.get(event)?.delete(handler);
  },
  emit(event, data) {
    const set = _listeners.get(event);
    if (!set) return;
    for (const h of set) {
      try { h(data); } catch (e) { console.warn('[EventBus]', event, e); }
    }
  },
  once(event, handler) {
    const off = this.on(event, (data) => { off(); handler(data); });
  },
  clear(event) {
    if (event) _listeners.delete(event);
    else _listeners.clear();
  },
};
