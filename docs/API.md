# G-WORLD API リファレンス

> 各モジュールの公開APIを一覧化したクイックリファレンス

## 📐 core/config.js

```javascript
import { CONFIG, STORAGE_KEYS, PARS, getPar } from './core/config.js';
```

| API | 説明 |
|-----|------|
| `CONFIG.APP_VERSION` | アプリバージョン文字列 |
| `CONFIG.GAS_URL` | GAS Web App の URL |
| `STORAGE_KEYS.*` | localStorage キー定数 |
| `PARS` | 18ホール PAR 配列（デフォルト） |
| `getPar(hole)` | ホール番号から PAR を取得 |

---

## 🎨 core/constants.js（★Phase 6 新規）

```javascript
import {
  SCORE_NAMES, SCORE_SYMBOLS, DIFF_COLORS,
  COURSES, getCourse, getCourseName, getParFor,
  UI_LIMITS, DISPLAY_MODES, INPUT_MODES,
  ROUTES, EVENTS
} from './core/constants.js';
```

| API | 説明 |
|-----|------|
| `SCORE_NAMES` | diff → 名称（BIRDIE, PAR, BOGEY） |
| `SCORE_SYMBOLS` | diff → 絵文字（🐦, ⚪, 🔴） |
| `COURSES` | コース定義配列（id, name, pars 等） |
| `getCourse(id)` | コース定義を取得 |
| `getCourseName(id)` | コース名を取得 |
| `getParFor(id, hole)` | コース別 PAR を取得 |
| `UI_LIMITS.*` | 表示制限値 |
| `ROUTES.*` | ルート名定数（HOME, GLAND, MYPAGE） |
| `EVENTS.*` | EventBus イベント名定数 |

---

## 📡 core/event-bus.js（★Phase 6 新規）

```javascript
import { EventBus } from './core/event-bus.js';

const unsubscribe = EventBus.on('event:name', (payload) => { ... });
EventBus.emit('event:name', { data: 'xxx' });
EventBus.off('event:name', handler);
EventBus.once('event:name', (p) => { ... });  // 1回だけ
```

| API | 説明 |
|-----|------|
| `on(event, handler)` | 購読（解除関数を返す） |
| `once(event, handler)` | 1回だけ購読 |
| `off(event, handler)` | 購読解除 |
| `emit(event, payload)` | 発火 |
| `clear(event?)` | 全リスナー削除 |
| `inspect()` | 購読状況スナップショット |

---

## 🧮 core/calculator.js（純粋関数）

```javascript
import { Calculator } from './core/calculator.js';
```

### 基本集計
| API | 戻り値 | 説明 |
|-----|--------|------|
| `totalStrokes(scores)` | number | 合計打数 |
| `totalPar(scores, pars?)` | number | 入力済みホールの PAR 合計 |
| `parDiff(scores, pars?)` | number | PAR 差 |
| `formatParDiff(diff)` | string | 'E' / '+3' / '-2' |

### ホール単位
| API | 戻り値 | 説明 |
|-----|--------|------|
| `holeTotal(shots, putts)` | number | ショット + パット |
| `holeParDiff(stroke, hole, pars?)` | number\|null | 1ホールの PAR 差 |
| `holeScoreName(stroke, hole, pars?)` | string | 'BIRDIE' 等 |
| `holeScoreSymbol(stroke, hole, pars?)` ★ | string | '🐦' 等 |
| `diffColorClass(diff)` ★ | string | CSSクラス名 |

### OUT/IN
| API | 戻り値 |
|-----|--------|
| `outSummary(scores, pars?)` | `{strokes, par, diff, played}` |
| `inSummary(scores, pars?)` | `{strokes, par, diff, played}` |

### 全体集計・ランキング
| API | 戻り値 |
|-----|--------|
| `summarize(player, pars?)` | プレイヤー1人分の完全集計 |
| `rankPlayers(players, pars?)` | 順位付き配列 |

---

## 💾 core/storage.js

```javascript
import { Store } from './core/storage.js';
```

### 基本I/O
| API | 説明 |
|-----|------|
| `Store.get(key, default?)` | JSON 取得 |
| `Store.set(key, value)` | JSON 保存 |
| `Store.getStr(key, default?)` | 文字列取得 |
| `Store.setStr(key, value)` | 文字列保存 |
| `Store.remove(key)` | 削除 |
| `Store.clear()` | 全削除 |

### ラウンド管理
| API | 説明 |
|-----|------|
| `Store.saveRoundDraft(draft)` | 進行中ラウンド保存 |
| `Store.loadRoundDraft()` | ドラフト読込 |
| `Store.clearRoundDraft()` | ドラフト削除 |
| `Store.appendRound(round)` | 履歴に追加 |
| `Store.getRoundHistory()` | 履歴取得 |
| `Store.clearRoundHistory()` | 履歴全消去 |

---

## 🔄 core/state.js

```javascript
import { State } from './core/state.js';
```

| プロパティ | 説明 |
|-----------|------|
| `State.profile` | プロファイル |
| `State.inputMode` | 'simple' \| 'counter' |
| `State.puttMode` | 'on' \| 'off' |
| `State.currentRoute` | 現在のルート |
| `State.currentHole` | 現在のホール |
| `State.totalHoles` | 総ホール数 |
| `State.courseId` | コースID |
| `State.players` | プレイヤー配列 |

| メソッド | 説明 |
|---------|------|
| `State.init()` | localStorage から復元 |
| `State.saveProfile(profile)` | プロファイル保存 |
| `State.saveInputMode(mode)` | 入力モード保存 |
| `State.savePuttMode(mode)` | パットモード保存 |
| `State.reset()` | 全リセット |
| `State.snapshot()` | デバッグ用スナップショット |

---

## 🧭 core/router.js

```javascript
import { Router } from './core/router.js';
```

| API | 説明 |
|-----|------|
| `Router.register(name, module, containerId?)` | 画面モジュール登録 |
| `Router.go(name, params?)` | 画面遷移 |
| `Router.resolveInitial()` | URLハッシュから初期画面決定 |

---

## ⚡ core/events.js

```javascript
import { Events } from './core/events.js';
```

| API | 説明 |
|-----|------|
| `Events.register(action, handler)` | 単一登録 |
| `Events.registerMany(map)` | 一括登録 |
| `Events.bind()` | グローバルリスナー起動 |
| `Events.setRouteHandler(fn)` | data-route のハンドラ設定 |

---

## 🎭 ui/toast.js

```javascript
import { toast, hideToast } from './ui/toast.js';

toast('保存しました');
toast('エラー', { type: 'error', duration: 3000 });
```

---

## 🪟 ui/modal.js

```javascript
import { showModal, hideModal, confirm } from './ui/modal.js';

const ok = await confirm('削除しますか？', '元に戻せません');
showModal('my-modal-id');
hideModal('my-modal-id');
```

---

## 🧩 widgets/

### widgets/score.js
```javascript
import { renderScore } from './widgets/score.js';
renderScore(container);
```

### widgets/hole-grid.js
```javascript
import { renderHoleGrid } from './widgets/hole-grid.js';
renderHoleGrid(container, { onJump: (hole) => { ... } });
```

### widgets/companion-modal.js
```javascript
import { openCompanionModal } from './widgets/companion-modal.js';

openCompanionModal({
  mode: 'add' | 'edit',
  player: { id, name, isMe },
  onSave: (name) => { ... },
  onDelete: () => { ... }
});
```

---

## 🚀 app/

### app/bootstrap.js
```javascript
import { bootstrap } from './app/bootstrap.js';
bootstrap();  // 起動
```

### app/wiring.js
```javascript
import { wireActions } from './app/wiring.js';
wireActions();  // data-action ハンドラを一括登録
```
