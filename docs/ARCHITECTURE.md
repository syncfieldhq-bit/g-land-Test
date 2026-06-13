# G-WORLD アーキテクチャ図

> Phase 6 リファクタリング後の設計書

## 🏗️ レイヤー構造

G-WORLD は **6層** の責務分離アーキテクチャです。
各層は **下位層のみに依存** し、上位層は知らない（依存性逆転の原則）。

```
┌─────────────────────────────────────┐
│  L6  scripts/main.js                │  ← エントリー（15行）
└─────────────────────────────────────┘
           ↓
┌─────────────────────────────────────┐
│  L5  scripts/app/                   │  ← 起動・配線
│      ├── bootstrap.js               │
│      └── wiring.js                  │
└─────────────────────────────────────┘
           ↓
┌─────────────────────────────────────┐
│  L4  scripts/screens/               │  ← 画面（widgets を組み合わせる）
│      ├── home.js                    │
│      ├── gland.js                   │
│      └── mypage.js                  │
└─────────────────────────────────────┘
           ↓
┌─────────────────────────────────────┐
│  L3  scripts/widgets/               │  ← 再利用可能なUI部品
│      ├── score.js                   │
│      ├── hole-grid.js               │
│      └── companion-modal.js         │
└─────────────────────────────────────┘
           ↓
┌─────────────────────────────────────┐
│  L2  scripts/ui/                    │  ← 汎用UIユーティリティ
│      ├── toast.js                   │
│      └── modal.js                   │
└─────────────────────────────────────┘
           ↓
┌─────────────────────────────────────┐
│  L1  scripts/core/                  │  ← 純粋ロジック・データ管理
│      ├── config.js                  │
│      ├── constants.js  ★Phase 6   │
│      ├── event-bus.js  ★Phase 6   │
│      ├── calculator.js              │
│      ├── state.js                   │
│      ├── storage.js                 │
│      ├── router.js                  │
│      └── events.js                  │
└─────────────────────────────────────┘
```

## 📋 各層の責務

### L1: core/ - 基盤層
- **外部依存ゼロ**（DOM・localStorage 以外触らない）
- 純粋関数中心（Calculator は GAS でもそのまま動く）
- 全モジュールが参照する基盤

### L2: ui/ - UIユーティリティ層
- DOM 操作の汎用ヘルパー
- どの画面からも呼べる（Toast, Modal）

### L3: widgets/ - UI部品層
- 1つの目的を持つ再利用可能なUI
- 例：スコア入力、ホールジャンプ、同伴者編集

### L4: screens/ - 画面層
- widgets を組み合わせて1画面を構成
- 画面固有のレイアウトとデータフロー

### L5: app/ - アプリケーション層
- 起動シーケンス（bootstrap.js）
- ユーザー操作と画面の配線（wiring.js）

### L6: main.js - エントリーポイント
- bootstrap を呼ぶだけ（15行）

## 🔄 モジュール間通信パターン

### 直接呼び出し（同じ層・下位層への呼び出し）
```javascript
import { Calculator } from '../core/calculator.js';
const total = Calculator.totalStrokes(scores);
```

### EventBus（疎結合・横断的通知）
```javascript
// 発火側
import { EventBus } from './core/event-bus.js';
import { EVENTS } from './core/constants.js';
EventBus.emit(EVENTS.SCORE_UPDATED, { hole: 1, stroke: 4 });

// 購読側
EventBus.on(EVENTS.SCORE_UPDATED, (data) => { ... });
```

## 🎯 設計原則

1. **依存方向の一方向化**
   - 上位層 → 下位層のみ（逆は禁止）
   - core/ は何にも依存しない

2. **設定の外部化**
   - UI 表示ルール・コース定義は `core/constants.js` に集約
   - コード本体を触らず、設定だけで挙動を変えられる

3. **純粋関数の優遇**
   - Calculator は localStorage も DOM も触らない
   - 同じ入力 → 同じ出力（テストしやすい）

4. **EventBus による疎結合**
   - モジュール A が B を直接知らなくても通信できる
   - Phase 7 で GAS 連携を追加する時、既存コードを壊さない

## 📁 ディレクトリ構成

```
/g-land-Test/
├── index.html
├── styles/
│   └── base.css
├── scripts/
│   ├── main.js                  ← L6 エントリー
│   ├── app/                     ← L5 アプリ層
│   │   ├── bootstrap.js
│   │   └── wiring.js
│   ├── screens/                 ← L4 画面層
│   │   ├── home.js
│   │   ├── gland.js
│   │   └── mypage.js
│   ├── widgets/                 ← L3 UI部品層
│   │   ├── score.js
│   │   ├── hole-grid.js
│   │   └── companion-modal.js
│   ├── ui/                      ← L2 UIユーティリティ
│   │   ├── toast.js
│   │   └── modal.js
│   └── core/                    ← L1 基盤層
│       ├── config.js
│       ├── constants.js   ★Phase 6
│       ├── event-bus.js   ★Phase 6
│       ├── calculator.js
│       ├── state.js
│       ├── storage.js
│       ├── router.js
│       └── events.js
└── docs/
    ├── ARCHITECTURE.md          ← このファイル
    ├── EXTENDING.md             ← 拡張手順
    └── API.md                   ← API リファレンス
```
