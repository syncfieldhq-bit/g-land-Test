/******************************************************************
 * G-WORLD Frontend - Namespace Bootstrap
 * v1.0.0
 *
 * このファイルは全 JS の最先頭で読み込まれる。
 * window.GW という唯一の名前空間を確立し、後続ファイルが
 * GW.Core.XXX / GW.Modules.XXX に登録できる土台を作る。
 *
 * 【設計憲法 第3条】グローバル汚染ゼロ。すべて GW 配下に格納。
 ******************************************************************/
(function () {
  'use strict';

  // ルート名前空間（グローバルに公開する唯一のオブジェクト）
  window.GW = window.GW || {};

  GW.Core    = GW.Core    || {};
  GW.Modules = GW.Modules || {};

  // 状態オブジェクト（boot bundle 反映後に各種データが入る）
  GW.Core.State = GW.Core.State || {};

  // バージョン識別（デバッグ用にコンソールで確認可能）
  GW.__namespace_ready__ = true;
})();
