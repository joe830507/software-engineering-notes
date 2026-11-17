# State 設計、Reducer 與 Context

## 用 State 思考 UI

### 五個步驟

1. **找出元件的各種視覺狀態**（空、輸入中、送出中、成功、錯誤）。
2. **找出什麼會觸發狀態改變**（人為輸入 vs 電腦事件如網路回應）。
3. **用 `useState` 表達記憶體中的 state**，先寫最少的必要資訊。
4. **移除不必要的 state 變數**，避免互相矛盾的狀態。
5. **把事件處理函式接起來**，讓事件更新 state。

### 命令式 vs 宣告式

- 命令式：「按下送出 → 停用按鈕 → 顯示 spinner → 若失敗顯示錯誤…」，每一步手動改 DOM，狀態組合一多就容易漏。
- 宣告式：「`status` 是 `'submitting'` 時，畫面長這樣」，把所有可能的狀態各描述一次，React 負責切換。

### 用 status 取代多個布林

```jsx
// ❌ 容易出現矛盾組合：isSending 與 isSent 同時為 true
const [isSending, setIsSending] = useState(false)
const [isSent, setIsSent] = useState(false)

// ✅ 一個 status，不可能矛盾
const [status, setStatus] = useState('typing')    // 'typing' | 'submitting' | 'success'
```

## 設計 State 的結構

### 五個原則

| 原則 | 說明 |
|---|---|
| **合併相關的 state** | 兩個值總是一起變（x、y 座標），合成一個物件 |
| **避免矛盾** | 如上面的 `isSending` / `isSent`，改用 `status` |
| **避免多餘（redundant）** | 能從別的 state / props **算出來**的，不要存（如 `fullName = first + ' ' + last`） |
| **避免重複** | 同一份資料不要在兩處存（如 `items` 和 `selectedItem`，改存 `selectedId`） |
| **避免深層巢狀** | 攤平成 `{ byId, ids }` 的正規化結構，更新容易 |

### 不要把 props 複製成 state

```jsx
function Message({ messageColor }) {
  const [color, setColor] = useState(messageColor)   // ❌ 之後 props 改了，state 不會跟著變
}
```

只有「只想用 props 當**初始值**，之後忽略更新」時才這樣做，且命名要表達（`initialColor`）。否則直接用 props，或在需要時 render 期間算出來。

### 儲存 id 而不是物件

```jsx
const [selectedId, setSelectedId] = useState(null)
const selected = items.find((i) => i.id === selectedId)     // 每次 render 從最新資料算出
```

## 元件間共享 State

### 狀態提升（Lifting State Up）

兩個元件要同步 → 把 state **移到最近的共同父元件**，用 props 往下傳，並傳回呼叫用的 `onXxx`。

```jsx
function Accordion() {
  const [activeIndex, setActiveIndex] = useState(0)
  return (
    <>
      <Panel isActive={activeIndex === 0} onShow={() => setActiveIndex(0)}>…</Panel>
      <Panel isActive={activeIndex === 1} onShow={() => setActiveIndex(1)}>…</Panel>
    </>
  )
}
```

- **受控（controlled）**元件：資訊由 props 驅動，父元件掌控。**不受控（uncontrolled）**：資訊在自己內部 state。
- 受控較彈性但需要更多樣板；不受控較簡單。實務上常在元件內部各自選擇。
- 每筆資料要有「**單一真實來源（single source of truth）**」，放在哪個元件由你決定，其他都是衍生。

## 保留與重置 State

### State 屬於「樹中的位置」

React 把 state 綁在**元件在 UI 樹的位置**，不是在程式碼裡。

- **相同位置的相同元件 → 保留 state**；不同元件型別或不同位置 → **重置（重新掛載）**。
- 同一個位置，從 `<Counter />` 換成 `<p>`，整個子樹的 state 都被丟掉。

```jsx
{isFancy ? <Counter isFancy /> : <Counter />}   // 同位置同型別 → state 保留（即使 props 不同）
```

### 不要在元件內定義元件

```jsx
function Parent() {
  function Child() { ... }    // ❌ 每次 Parent render 都產生新的 Child 型別 → 每次都重置 state
  return <Child />
}
```

### 重置 state 的兩種方式

1. **放在不同位置**渲染（`{isA && <Form />}` `{!isA && <Form />}`）。
2. **用 `key` 強制重置**：key 改變 = 視為不同元件。

```jsx
<Chat key={contact.id} contact={contact} />    // 切換聯絡人時，輸入框的草稿不會殘留
```

## Reducer

### 為什麼用 `useReducer`

當事件處理函式分散在各處、狀態更新邏輯複雜時，把「**發生了什麼（action）**」與「**怎麼更新（reducer）**」分開：

```jsx
function tasksReducer(tasks, action) {
  switch (action.type) {
    case 'added':   return [...tasks, { id: action.id, text: action.text, done: false }]
    case 'changed': return tasks.map((t) => (t.id === action.task.id ? action.task : t))
    case 'deleted': return tasks.filter((t) => t.id !== action.id)
    default:        throw Error('Unknown action: ' + action.type)
  }
}

const [tasks, dispatch] = useReducer(tasksReducer, initialTasks)
dispatch({ type: 'added', id: nextId++, text })      // 事件處理函式只負責「說發生什麼」
```

- reducer 是**純函式**：(目前 state, action) → 新 state；不 mutate、不做副作用（StrictMode 會呼叫兩次）。
- action 描述「**使用者做了什麼**」（`deleted`），而不是「怎麼改 state」（`set_tasks`）；一個 action 可以影響多個 state 欄位。
- 命名慣例：`type` 用過去式動詞或事件；action 物件加其餘欄位。
- `useReducer` 與 `useState` 本質相同；`useState` 內部也能看成簡化的 reducer。逐步調試時，可以在 reducer 內 `console.log` 查看每個 action。

### useState vs useReducer

| | useState | useReducer |
|---|---|---|
| 程式碼量 | 少 | 多（要寫 reducer） |
| 可讀性 | 簡單更新很清楚 | 更新邏輯複雜時更清楚 |
| 除錯 | 要找出是哪個 `set` 出錯 | 集中在 reducer，容易加 log |
| 測試 | — | reducer 是純函式，好測試 |

## Context

### 為什麼需要

props 一層一層傳太深（prop drilling）時，Context 讓**任何深度的子孫**直接讀取上層提供的值。

```jsx
// 1. 建立
const ThemeContext = createContext('light')        // 預設值（沒有 Provider 時用）

// 2. 提供（React 19：Context 本身就是 Provider）
<ThemeContext value="dark">
  <Page />
</ThemeContext>

// 3. 使用
function Button() {
  const theme = useContext(ThemeContext)           // 或 use(ThemeContext)
  return <button className={theme}>…</button>
}
```

- React 19 之前要寫 `<ThemeContext.Provider value=...>`，19 起可直接寫 `<ThemeContext value=...>`。
- 讀取到的是**往上最近的** Provider 的值；沒有就用預設值。
- 可以**巢狀、覆寫**：在子樹內再包一個 Provider，只影響那一塊。
- Context 的 `value` 改變時，**所有讀取它的元件都會重新 render**（即使有 `memo`）。

### 使用時機與替代方案

先考慮：①**props 傳遞**（最清楚，數據流顯而易見）；②**`children` 組合**（把元件當 props 傳下去，避免中間層知道不需要的資料）；③再用 Context。

適合 Context 的情境：主題、目前使用者、路由、**多層共享的 state**。

### Reducer + Context：擴大規模

```jsx
const TasksContext = createContext(null)
const TasksDispatchContext = createContext(null)

function TasksProvider({ children }) {
  const [tasks, dispatch] = useReducer(tasksReducer, initialTasks)
  return (
    <TasksContext value={tasks}>
      <TasksDispatchContext value={dispatch}>{children}</TasksDispatchContext>
    </TasksContext>
  )
}
export const useTasks = () => useContext(TasksContext)
export const useTasksDispatch = () => useContext(TasksDispatchContext)
```

- **把 state 與 dispatch 放在兩個 Context**：只用 dispatch 的元件不會因該 Context 通知而重 render；一般父層渲染仍可能讓它重新執行。
- `dispatch` 的參考穩定，不需要 `useCallback`。
- 抽成 Provider 元件 + 自訂 Hook，使用端只需 `useTasks()`。
- 大型 App 的全域 state 也可考慮 Zustand、Jotai、Redux Toolkit 等函式庫；資料抓取與伺服器狀態優先用 TanStack Query、SWR 或框架內建。

### Context 的效能提醒

- Provider 的 `value` 如果每次 render 都是新物件（`value={{ user, setUser }}`），消費者**每次**都會重新 render；用 `useMemo` 穩定，或拆分 Context。
- 狀態**頻繁更新**的資料（滑鼠座標）不適合放 Context。

## 面試速查

**Q：什麼時候該把 state 提升？**
兩個元件需要共享、同步同一份資料時，放到最近的共同父元件；其他資料能留在區域就留在區域，避免不必要的 render。

**Q：怎麼讓元件在 props 改變時重置內部 state？**
給元件一個 `key`（例如 `key={userId}`）。key 改變，React 視為不同元件並重新掛載。比起用 Effect 同步 state 更直接。

**Q：`useReducer` 和 `useState` 怎麼選？**
簡單、獨立的值用 `useState`；多個欄位互相關聯、更新邏輯多、或想把邏輯抽出測試時用 `useReducer`。

**Q：Context 會造成什麼效能問題？如何緩解？**
value 變動時所有消費者都會 render。緩解：拆成多個 Context（資料與 dispatch 分開）、穩定 value（`useMemo`）、把會變的狀態往下移、或用狀態管理函式庫的選擇器訂閱。
