# G-WORLD 拡張手順書

> 新機能を追加する時の手順を、シナリオ別にまとめた実践マニュアル

## 🎨 シナリオ1：スコア記号を変えたい

**例**：BIRDIE の記号を 🐦 から 🦆 に変更したい

### 手順
1. `scripts/core/constants.js` を開く
2. `SCORE_SYMBOLS` の `'-1'` を編集：
   ```javascript
   export const SCORE_SYMBOLS = {
     '-1': '🦆',  // ← ここだけ変更
     ...
   };
   ```
3. 保存して `git push`

**影響範囲**：他のファイルは触らなくてOK！

---

## ⛳ シナリオ2：新しいゴルフ場を追加したい

**例**：「淡路ゴルフ倶楽部」を追加

### 手順
1. `scripts/core/constants.js` を開く
2. `COURSES` 配列に1つ追加：
   ```javascript
   export const COURSES = [
     ...
     {
       id: 'awaji-gc',
       icon: '⛳',
       name: '淡路ゴルフ倶楽部',
       subtitle: '18H',
       variants: [
         { v: '18H', label: '🔵 18ホール', holes: 18 }
       ],
       pars: [4, 4, 3, 5, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 5, 4, 4]
     }
   ];
   ```
3. 保存して `git push`

**影響範囲**：コース選択画面に自動的に表示される。

---

## 🧩 シナリオ3：新しい画面を追加したい

**例**：「練習場記録」画面を追加

### 手順

#### Step 1: 画面モジュールを作成
`scripts/screens/practice.js` を新規作成：
```javascript
import { State } from '../core/state.js';

export const PracticeScreen = {
  render(container) {
    container.innerHTML = `
      <h2>🏌️ 練習場記録</h2>
      <p>ここに練習内容を記録します</p>
    `;
  }
};
```

#### Step 2: ルート定義を追加
`scripts/core/constants.js` の `ROUTES` に追加：
```javascript
export const ROUTES = {
  HOME: 'home',
  GLAND: 'gland',
  MYPAGE: 'mypage',
  PRACTICE: 'practice'  // ← 追加
};
```

#### Step 3: bootstrap で登録
`scripts/app/bootstrap.js` の `initRouter()` に追加：
```javascript
import { PracticeScreen } from '../screens/practice.js';

function initRouter() {
  Router.register(ROUTES.HOME, HomeScreen);
  Router.register(ROUTES.GLAND, GLandScreen);
  Router.register(ROUTES.PRACTICE, PracticeScreen);  // ← 追加
  ...
}
```

#### Step 4: HTMLにナビボタン追加
`index.html` のフッターナビに：
```html
<button data-route="practice">
  <span class="nav-icon">🏌️</span>
  <span class="nav-label">練習</span>
</button>
```

これだけで新画面が動く！

---

## 🧮 シナリオ4：スコア計算ロジックを変えたい

**例**：「ハンディキャップ計算」を追加

### 手順
1. `scripts/core/calculator.js` に新メソッド追加：
   ```javascript
   export const Calculator = {
     ...
     /** 新規：ハンディキャップ計算 */
     calcHandicap(scores, pars) {
       // 純粋関数として実装（DOM・localStorage 触らない）
       return ...;
     }
   };
   ```

2. 使う側で import するだけ：
   ```javascript
   import { Calculator } from '../core/calculator.js';
   const hc = Calculator.calcHandicap(scores, pars);
   ```

**メリット**：純粋関数だから GAS 側でも同じコードがそのまま使える。

---

## 🌐 シナリオ5：GAS連携を追加したい（Phase 7 の本丸）

### Step 1: API レイヤーを作る
`scripts/core/api.js` を新規作成：
```javascript
import { CONFIG } from './config.js';

export const Api = {
  async call(action, payload) {
    const res = await fetch(CONFIG.GAS_URL, {
      method: 'POST',
      body: JSON.stringify({ action, payload })
    });
    return res.json();
  }
};
```

### Step 2: Storage を「ローカル+リモート」併用に
`scripts/core/storage.js` の `appendRound` を拡張：
```javascript
import { Api } from './api.js';
import { EventBus } from './event-bus.js';
import { EVENTS } from './constants.js';

appendRound(round) {
  // ローカル保存（即座）
  const history = this.get(KEYS.RECENT_ROUNDS, []) || [];
  history.unshift(round);
  this.set(KEYS.RECENT_ROUNDS, history.slice(0, 30));

  // リモート保存（バックグラウンド）
  Api.call('round.save', round).then(() => {
    EventBus.emit('round:synced');
  });

  return history;
}
```

**ポイント**：
- 既存の `Store.appendRound` を呼ぶコードは1行も変えない
- ローカル保存は即座、リモートはバックグラウンド
- オフラインでも完全動作

---

## 📡 シナリオ6：EventBus でモジュール間連携

**例**：スコアが更新されたら、ヘッダーに合計を表示

### 発火側（score.js 内）
```javascript
import { EventBus } from '../core/event-bus.js';
import { EVENTS } from '../core/constants.js';

EventBus.emit(EVENTS.SCORE_UPDATED, {
  hole: 1,
  stroke: 4,
  total: 36
});
```

### 購読側（ヘッダーを更新したい画面）
```javascript
EventBus.on(EVENTS.SCORE_UPDATED, (data) => {
  document.getElementById('header-total').textContent = data.total;
});
```

**メリット**：score.js は header の存在を知らないままで通信できる。

---

## 🎯 拡張時のチェックリスト

新機能を追加した後、以下を確認：

- [ ] `constants.js` に新しい定数を追加したか
- [ ] 純粋ロジックは `core/` に置いたか
- [ ] UI部品は再利用しやすい単位で `widgets/` に分けたか
- [ ] 画面遷移は `bootstrap.js` の `initRouter()` で登録したか
- [ ] data-action ハンドラは `wiring.js` に追加したか
- [ ] ドキュメント（このファイル）を更新したか

---

## 🏗️ アンチパターン（やってはいけないこと）

❌ **core/ から widgets/ や screens/ を import する**
→ 依存が逆転する。core/ は何にも依存しない。

❌ **HTMLにJavaScriptを書く（onclick="..."等）**
→ data-action 属性に統一する。

❌ **マジックナンバーをコード内に書く**
→ `constants.js` に追加する。

❌ **State を直接書き換える（screens から）**
→ `State.saveProfile(...)` 等の API 経由で。
