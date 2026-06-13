// =============================================================
// bootstrap.js - アプリ起動シーケンス
// =============================================================
import { APP } from '../core/constants.js';
import { Router } from '../core/router.js';
import * as Store from '../core/storage.js';
import { State } from '../core/state.js';
import { renderHome } from '../screens/home.js';
import { renderGLand } from '../screens/gland.js';
import { renderGCompete } from '../screens/gcompete.js';
import { renderMyPage } from '../screens/mypage.js';
import { toast } from '../ui/toast.js';

export async function bootstrap() {
  console.log(`[G-WORLD] v${APP.VERSION} 起動中...`);

  try {
    // 1. 設定復元
    const settings = Store.getSettings();
    Object.entries(settings).forEach(([k, v]) => State.updateSetting(k, v));

    // 2. ドラフト復元
    const draft = Store.getRoundDraft();
    if (draft && draft.course) {
      try {
        State.restore(draft);
      } catch (e) {
        console.warn('[Bootstrap] draft restore failed', e);
      }
    }

    // 3. スクリーン登録
    Router.register('home', renderHome);
    Router.register('gland', renderGLand);
    Router.register('gcompete', renderGCompete);
    Router.register('mypage', renderMyPage);

    // 4. フッターナビバインド
    document.querySelectorAll('.gw-footer-nav [data-route]').forEach(el => {
      el.addEventListener('click', () => Router.go(el.dataset.route));
    });

    // 5. ルーター起動
    Router.start();

    // 6. ブートオーバーレイ消す
    const boot = document.getElementById('gw-boot-overlay');
    if (boot) {
      boot.classList.add('is-hidden');
      setTimeout(() => boot.remove(), 400);
    }

    console.log('[G-WORLD] 起動完了 ✅');
  } catch (e) {
    console.error('[Bootstrap] FATAL:', e);
    toast('起動に失敗しました: ' + e.message, 'error', 5000);
  }
}
