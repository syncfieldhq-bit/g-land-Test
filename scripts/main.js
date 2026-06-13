/**
 * ═══════════════════════════════════════════════════════
 * scripts/main.js - エントリーポイント（Phase 6 スリム版）
 *
 * 唯一の責務：bootstrap を呼ぶこと。それだけ。
 * 詳細なロジックは ./app/bootstrap.js へ。
 * ═══════════════════════════════════════════════════════
 */

import { bootstrap } from './app/bootstrap.js';

// DOM 準備完了を待って起動
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
