// =============================================================
// main.js - エントリーポイント（17行に集約）
// =============================================================
import { bootstrap } from './app/bootstrap.js';

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
