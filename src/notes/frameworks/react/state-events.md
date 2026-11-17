# 事件、State 與渲染機制

## 事件處理

### 基本寫法

```jsx
function Button({ onClick, children }) {
  return <button onClick={onClick}>{children}</button>
}

function Toolbar() {
  function handleClick(e) {
    e.stopPropagation()          // 停止冒泡
    alert('clicked')
  }
  return <Button onClick={handleClick}>送出</Button>   // 傳「函式」，不是呼叫結果
}
```

- **傳函式本身，不要呼叫它**：`onClick={handleClick}` ✅；`onClick={handleClick()}` ❌（render 時就執行了）。
- 需要帶參數用箭頭函式包：`onClick={() => handleDelete(id)}`。
- 命名慣例：事件處理函式 `handleXxx`；元件接收的事件 prop 命名 `onXxx`（如 `onSelect`），呼叫它的是 `handleXxx`。
- 事件會**向上冒泡**（除了 `onScroll`）；`e.stopPropagation()` 停止、`e.preventDefault()` 阻止瀏覽器預設行為（如表單送出）。
- 要在**捕獲階段**處理用 `onClickCapture`。
- 事件處理函式**可以有副作用**（改 state、呼叫 API），它們不在 render 期間執行，所以不需要純粹。

## State：元件的記憶

### useState

```jsx
import { useState } from 'react'

function Counter() {
  const [count, setCount] = useState(0)    // [目前值, 更新函式]
  return <button onClick={() => setCount(count + 1)}>{count}</button>
}
```

為什麼需要 state：區域變數在每次 render 都會重置，而且改了也**不會觸發重新 render**。state 讓 React 能①在 render 之間**保留**資料；②**觸發** render。

Hook 規則：

- 只能在**元件或自訂 Hook 的頂層**呼叫，不能放在 `if`、迴圈、巢狀函式、`try`、early return 之後。
- 原因：React 靠「呼叫順序」對應每個 Hook 與其儲存的值（內部像一個依序讀取的陣列）。
- 同一個元件可以用多個 `useState`；**state 是元件實例私有的**，同一元件畫兩次，各自獨立。

### 初始值與惰性初始化

```jsx
const [todos, setTodos] = useState(createInitialTodos())   // ❌ 每次 render 都呼叫（結果被忽略）
const [todos, setTodos] = useState(createInitialTodos)     // ✅ 傳初始化函式；StrictMode 開發檢查可能呼叫兩次
```

## 渲染與提交

### 三個步驟

1. **觸發（Trigger）**：初次 `root.render()`；或元件（或祖先）的 state 更新。
2. **渲染（Render）**：React **呼叫元件函式**，算出新的 JSX 樹。初次從根開始；更新時從被觸發的元件往下遞迴。這是**純計算**，不碰 DOM。
3. **提交（Commit）**：把差異套用到 DOM。初次 `appendChild`；更新只改變有差異的部分。完成後瀏覽器繪製。

重點：

- 「render」不等於「更新 DOM」。render 之後如果結果相同，React 不碰 DOM。
- **父元件 render，子元件預設也會 render**（不管 props 有沒有變），除非用 `memo`（見〈Hook 與效能速查〉）。
- 開發環境 StrictMode 會多 render 一次，用來抓不純的程式。
- 更新 DOM 後，`Effect` 才會執行（通常讓瀏覽器先繪製，但互動觸發時可能在繪製前執行；`useLayoutEffect` 會阻塞繪製）。

## State 是快照

### 一次 render 就是一張照片

```jsx
function Counter() {
  const [number, setNumber] = useState(0)
  return (
    <button onClick={() => {
      setNumber(number + 1)
      setNumber(number + 1)
      setNumber(number + 1)
    }}>+3</button>      // 只會 +1！三次都是 0 + 1
  )
}
```

- 呼叫 `setState` **不會改變目前這次 render 中的變數**，而是**安排下一次 render**，用新值。
- 事件處理函式內看到的 state 是**這一次 render 的值**（閉包），即使過了 `setTimeout` 或 `await` 也一樣：

```jsx
<button onClick={() => {
  setNumber(number + 5)
  setTimeout(() => alert(number), 3000)   // 仍是「按下時」的 number（舊值）
}}>
```

### 更新函式（updater）

要「根據前一個 state 算下一個」時，傳**函式**：

```jsx
setNumber((n) => n + 1)
setNumber((n) => n + 1)
setNumber((n) => n + 1)     // 結果 +3
```

- React **批次處理**：事件處理函式內所有 `set` 先排進佇列，**結束後才一起 render 一次**（React 18 起，連 Promise、`setTimeout`、原生事件中也自動批次）。
- 佇列處理方式：依序套用，值就直接取代；函式就接收「目前累積值」，回傳新值。
- 命名慣例：updater 的參數用 state 名稱首字母（`n`、`todos` → `t`）。
- updater 必須是**純函式**（StrictMode 會呼叫兩次檢查）。

### `set` 傳入同樣的值

React 用 `Object.is` 比較新舊值，**相同就略過子元件的 render 與 Effect**。不過 React 有時仍會多呼叫這個元件一次，才確定可以略過。這也是為什麼**物件與陣列要複製後再改**：原地修改後參考相同，React 會以為沒變。

## 更新物件與陣列

### 原則：把 state 當作不可變（immutable）

- 物件和陣列雖然「可以」被改，但**不要直接改**：React 比較的是參考（reference），原地修改後參考沒變，不會 render，而且會破壞快照、memo、時光回溯等機制。
- 做法：建立**新的**物件／陣列，再傳給 `set`。

### 物件

```jsx
setPerson({ ...person, name: 'Amy' })                         // 淺層複製再覆寫
setPerson({ ...person, address: { ...person.address, city: 'Taipei' } })   // 巢狀要每層都複製
```

- 展開 `...` 是**淺層複製**，只複製一層；巢狀每一層都要複製。
- 巢狀太深就**攤平 state 結構**，或用 **Immer**（`useImmerReducer` / `produce`）寫「看起來是修改」的程式碼。
- 動態 key：`setForm({ ...form, [e.target.name]: e.target.value })`。

### 陣列

| 動作 | ❌ 會改動原陣列 | ✅ 回傳新陣列 |
|---|---|---|
| 新增 | `push`、`unshift` | `[...arr, item]`、`[item, ...arr]` |
| 刪除 | `pop`、`shift`、`splice` | `arr.filter(x => x.id !== id)` |
| 取代 | `arr[i] = x`、`splice` | `arr.map(x => x.id === id ? {...x, ...changes} : x)` |
| 排序、反轉 | `sort`、`reverse` | `[...arr].sort(...)`、`arr.toSorted(...)`、`toReversed()` |
| 插入 | `splice` | `[...arr.slice(0, i), item, ...arr.slice(i)]` |

- ES2023 新方法 `toSorted`、`toSpliced`、`with` 都回傳新陣列。
- 陣列裡的物件要改，也要複製那個物件（`map` 裡回傳 `{...item, done: true}`）。
- 就算複製了陣列，裡面的物件仍是**同一份參考**：`const next = [...arr]; next[0].x = 1` ❌ 仍是改到原物件。

## 面試速查

**Q：為什麼 `setCount(count + 1)` 連續呼叫三次只加 1？**
每次 render 的 `count` 是固定的快照（例如 0），三次都是 `setCount(0 + 1)`。要累加用 `setCount(c => c + 1)`。

**Q：`setState` 是同步還是非同步？**
它不會立即改變目前 render 中的值，而是排入佇列，在事件處理完後批次 render。React 18 的 createRoot 擴大了自動批次範圍，但不保證跨 await 或不同使用者事件合成一次；需要立即同步更新 DOM 才用 `flushSync`（很少用）。

**Q：為什麼不能直接改 state 物件？**
參考沒變，React 判斷「沒有更新」而不 render；同時破壞快照語意、`memo` 與依賴比較。

**Q：render 一次就會更新 DOM 嗎？**
不會。React 先在 render 階段計算新樹，在 commit 階段只套用差異；結果相同則不動 DOM。

**Q：Hook 為什麼不能放在條件或迴圈裡？**
React 以呼叫順序記錄各個 Hook 的狀態；順序在 render 之間不一致，狀態就會錯位。
