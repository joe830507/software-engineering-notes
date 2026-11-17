# Ref 與 Effect

## Ref

### useRef：不觸發 render 的記憶

```jsx
const timerRef = useRef(null)             // { current: null }

function start() { timerRef.current = setInterval(tick, 1000) }
function stop()  { clearInterval(timerRef.current) }
```

| | `useState` | `useRef` |
|---|---|---|
| 值改變會 render？ | 會 | **不會** |
| 讀寫時機 | render 期間用 state；用 `set` 更新 | **只在事件處理函式或 Effect 讀寫**，不要在 render 期間讀寫 `ref.current` |
| 可變性 | 不可變（需 `set`） | 可直接改 `current` |

- 適合：timer ID、DOM 節點、不影響畫面輸出的值（上一次的值、是否已初始化）。
- **render 期間不要讀寫 `ref.current`**，否則元件不純粹，行為難預測（唯一例外：惰性初始化 `if (ref.current === null) ref.current = new X()`）。
- 畫面上要顯示的資料，用 state，不是 ref。

### 操作 DOM

```jsx
function Form() {
  const inputRef = useRef(null)
  return (
    <>
      <input ref={inputRef} />
      <button onClick={() => inputRef.current.focus()}>聚焦</button>
    </>
  )
}
```

- 適合用 ref 做的事：`focus()`、`scrollIntoView()`、量尺寸、操作媒體（`video.play()`）、整合非 React 函式庫。
- **不要用 ref 去改 React 管理的 DOM（增刪節點、改文字）**，React 之後更新時會出錯。若真要改，限制在 React 不會更新的屬性。
- DOM ref 在 **commit 階段**設定。初次 render 時通常是 null；後續 render 可能仍指向上次提交的節點，因此不能在 render 中依賴它。

### ref 當作 prop（React 19）

React 19 起，**函式元件可以直接接收 `ref` 當 prop**，不再需要 `forwardRef`：

```jsx
function MyInput({ ref, ...props }) {
  return <input ref={ref} {...props} />
}
<MyInput ref={inputRef} />
```

- `forwardRef` 仍可使用，但之後會被棄用。
- 想**限制**父元件能對子元件 DOM 做什麼：用 `useImperativeHandle` 只暴露指定方法（`focus`、`scrollIntoView`），不要暴露整個 DOM。

### Callback ref 與動態清單

```jsx
// 為清單中的每個項目建立 ref：用 callback ref 存進 Map
<li ref={(node) => {
  const map = getMap()
  map.set(item.id, node)
  return () => map.delete(item.id)       // React 19：可回傳清理函式
}} />
```

- ref callback 在掛載時以 DOM 節點呼叫；**React 19 起可回傳清理函式**（取代舊的「卸載時以 `null` 呼叫」）。
- 不能在迴圈中呼叫 `useRef`；這種「ref 清單」都靠 callback ref。
- **`flushSync`**：事件處理函式內要「立刻讀到更新後的 DOM」（例如新增項目後滾到底）時使用，但少用。

## Effect

### Effect 是什麼

**Effect 讓元件與「React 以外的系統」同步**：瀏覽器 API、網路、第三方函式庫、非 React 元件。
Effect 在 **commit 之後**執行，是「因為 render 本身造成」的副作用，而不是「因某個使用者操作」造成的（後者放事件處理函式）。

```jsx
useEffect(() => {
  const conn = createConnection(serverUrl, roomId)
  conn.connect()
  return () => conn.disconnect()          // 清理（cleanup）
}, [serverUrl, roomId])                   // 依賴陣列
```

三個部分：

1. **Setup**：連接 / 訂閱 / 啟動。
2. **Cleanup**：關閉 / 取消訂閱 / 還原，**要與 setup 對稱**。
3. **依賴（dependencies）**：Effect 內用到、來自 render 的所有反應式值（props、state、元件內宣告的變數與函式）。

### 依賴陣列的三種形式

| 寫法 | 何時執行 |
|---|---|
| `useEffect(fn)` | 每次提交之後（被中斷或捨棄的 render 不會執行 Effect） |
| `useEffect(fn, [])` | 掛載後執行，卸載時清理；StrictMode 開發檢查與重新掛載可能再次執行 |
| `useEffect(fn, [a, b])` | 掛載後，以及 `a` 或 `b` 改變後（比較用 `Object.is`） |

- **依賴不是你「選」的**，而是由程式碼決定：Effect 內用了什麼反應式值，就要列什麼。用 `eslint-plugin-react-hooks` 檢查，**不要關掉 lint 規則**。
- 流程：依賴變了 → 先跑**上一輪的 cleanup**（用舊值）→ 再跑新一輪的 setup（用新值）。
- Effect 只是「同步」，要想成**「怎麼開始 + 怎麼停止同步」**，而不是「掛載 / 更新 / 卸載」生命週期。

### 開發環境為什麼 Effect 跑兩次

StrictMode 在開發模式下，掛載後會**模擬卸載再重新掛載**一次（setup → cleanup → setup），用來檢查你有沒有寫對稱的 cleanup。
- 正式環境沒有這輪額外檢查，但依賴變更、重新掛載或 Activity 恢復仍可能重新執行。
- 正確的做法是**補上 cleanup**，不是想辦法擋掉第二次。

### 常見用途與清理寫法

```jsx
// 訂閱事件
useEffect(() => {
  const onResize = () => setWidth(window.innerWidth)
  window.addEventListener('resize', onResize)
  return () => window.removeEventListener('resize', onResize)
}, [])

// 資料抓取：處理競態（race condition）
useEffect(() => {
  let ignore = false
  fetchResults(query).then((json) => { if (!ignore) setResults(json) })
  return () => { ignore = true }          // 舊請求的結果被忽略；或用 AbortController 取消
}, [query])
```

- 抓資料用 Effect 的缺點：競態、沒有快取、瀑布式請求、SSR 不友善。**優先用框架內建或 TanStack Query / SWR**，必要時才自己寫 Effect。

## 你可能不需要 Effect

### 判斷原則

Effect 是「離開 React 的出口」。**如果沒有外部系統，通常就不該用 Effect**。多餘的 Effect 會讓程式更慢（多一次 render）、更容易出錯。

| 情境 | ❌ 用 Effect | ✅ 做法 |
|---|---|---|
| 依 props / state **算出**新資料 | `useEffect(() => setFull(a + b), [a, b])` | 直接在 render 期間算：`const full = a + b` |
| 昂貴的計算 | Effect + state | `useMemo`（或 React Compiler 自動處理） |
| props 變了要**重置 state** | Effect 裡 `setComment('')` | 給元件 `key={userId}` |
| 依 props 調整**部分** state | Effect | 優先重新設計 state（存 id 而非物件）；真的要才在 render 中以條件 `set` |
| 使用者操作造成的事（購買、送出） | Effect 監看 state | **事件處理函式**直接處理 |
| 多個 state 連鎖更新 | 多個 Effect 互相觸發 | 在事件處理函式一次算完，或合併成一個 state |
| 通知父元件 | Effect 裡呼叫 `onChange` | 在**同一個事件處理函式**裡呼叫 `onChange` 與 `setState`，或提升 state |
| 把資料傳給父元件 | 子元件 Effect 抓資料再往上丟 | 父元件抓資料，往下傳 |
| 訂閱**外部 store** | Effect + state | `useSyncExternalStore` |
| 初始化 App（只做一次） | 用 `[]` Effect | 模組頂層、或用變數守衛；注意不要被執行兩次造成問題 |

### 判斷：這段程式「為什麼」要執行？

- **因為使用者做了某個操作** → 事件處理函式。
- **因為元件需要在畫面上顯示** → Effect（且是同步外部系統才用）。

## Effect 的生命週期

### 每個 Effect 描述單一同步流程

- 一個 Effect 做**一件事**；不相關的邏輯拆成不同的 Effect（如「記錄 analytics」與「連線聊天室」）。
- 元件的生命週期（掛載 / 更新 / 卸載）與 Effect 的生命週期（開始 / 停止同步）不同：Effect 可以在元件存活期間**多次**開始與停止。
- 想像：「元件現在的 props 要求我與 roomId='travel' 的聊天室同步」→ `roomId` 改成 `'music'` → 先停止同步 travel，再開始同步 music。

### 反應式值（reactive values）

- props、state、以及元件內宣告的變數與函式都是反應式的。
- **全域變數、`ref.current`、模組層級的值不是反應式的**，不必列入依賴（但 `ref.current` 的變化也不會觸發 Effect）。
- 把「函式 / 物件」放在元件內再當依賴 → 每次 render 都是新的 → Effect 每次都重跑。解法：①搬進 Effect 內；②搬到元件外；③`useCallback` / `useMemo` 穩定它。

## 分離事件與 Effect

### useEffectEvent（React 19.2 穩定）

Effect 中常有「只想讀**最新值**、但不想因它改變而重新同步」的邏輯，例如「連線成功時用**目前主題**顯示通知」：

```jsx
function ChatRoom({ roomId, theme }) {
  const onConnected = useEffectEvent(() => {
    showNotification('Connected!', theme)          // 永遠讀到最新的 theme
  })

  useEffect(() => {
    const conn = createConnection(roomId)
    conn.on('connected', () => onConnected())
    conn.connect()
    return () => conn.disconnect()
  }, [roomId])                                      // theme 變了不會重連
}
```

規則：

- 只能在 **Effect（或其他 Effect Event）內呼叫**，**不能**在 render 時呼叫、也不能傳給別的元件或 Hook。
- **不要放進依賴陣列**，它的參考刻意每次 render 都變。
- **別拿它來「消除 lint 警告」**：只用在**概念上是「事件」**（從 Effect 觸發、不需重新同步）的邏輯，否則會藏住 bug。
- 以前的做法是用 `ref` 存最新值，或把值硬塞進依賴造成多餘重連。

## 移除 Effect 的依賴

### 原則

依賴是「程式碼的事實」，不能用「省略」解決。要減少依賴，就**改變程式碼**，讓它真的不需要那個值：

1. **只在事件處理函式用到** → 搬出 Effect。
2. **想只在某些變動時執行** → 拆成多個 Effect，或確認是否真的屬於 Effect。
3. **Effect 內用 state 更新 state，且依賴自己** → 用 updater（`setCount(c => c + 1)`）移除對 `count` 的依賴。
4. **讀最新值但不想因它重跑** → `useEffectEvent`。
5. **依賴是物件／函式**，每次 render 都新建 → 把「建立」搬進 Effect 內，或改用原始值（`roomId`、`serverUrl`）當依賴。
6. **依賴空陣列但 lint 抱怨** → 先檢查：真的沒有任何反應式值嗎？

```jsx
// ❌ options 每次 render 都是新物件 → Effect 每次重連
const options = { serverUrl, roomId }
useEffect(() => { connect(options) }, [options])

// ✅ 把物件建立搬進 Effect，依賴只剩原始值
useEffect(() => {
  const options = { serverUrl, roomId }
  const connection = createConnection(options.serverUrl, options.roomId)
  connection.connect()
  return () => connection.disconnect()
}, [serverUrl, roomId])
```

## 自訂 Hook

### 抽出重複的邏輯

自訂 Hook 讓你重用**有狀態的邏輯**（不是 state 本身）。**每次呼叫都獨立擁有自己的 state**。

```jsx
function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(true)
  useEffect(() => {
    const on = () => setIsOnline(true), off = () => setIsOnline(false)
    setIsOnline(navigator.onLine)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  return isOnline
}
// 更好：用 useSyncExternalStore 訂閱瀏覽器 API
```

規則與慣例：

- **名稱必須以 `use` 開頭**（`useFormInput`），lint 才能辨識並檢查 Hook 規則。
- 只有「真的呼叫了 Hook」的函式才叫 Hook；沒用到 Hook 的工具函式不要加 `use`。
- 自訂 Hook 讓**呼叫端更像描述意圖**（「我要線上狀態」），而不是實作細節（「訂閱 online 事件」）。
- **自訂 Hook 內的 Effect 要回歸「同步」的語意**；把 `useEffect` 包得過於「通用」的 Hook（`useMount`）是反模式，會繞過 lint 規則。
- 可以把一般回呼傳進自訂 Hook（不要傳入已建立的 Effect Event），如 `useChatRoom({ roomId, onMessage })`，在 Hook 內用 `useEffectEvent` 包起 `onMessage`。
- 每個 render 呼叫自訂 Hook，會**共用的只有「程式碼」，沒有狀態**；要共用狀態要用 Context 或外部 store。

## StrictMode

開發環境 `<StrictMode>` 啟用額外檢查（不影響正式環境、不渲染額外 UI）：

- 元件函式與 updater、reducer **多呼叫一次**，抓不純的 render。
- Effect **多執行一輪** setup → cleanup → setup，抓遺漏的 cleanup。
- **ref callback** 也會多跑一輪，抓遺漏的 ref cleanup。
- 警告已棄用的 API。

**不要為了讓雙重執行消失而關掉 StrictMode**；那些重複就是在提示 bug。

## 面試速查

**Q：`useEffect` 的依賴陣列怎麼決定？**
由 Effect 內使用到的反應式值決定（props、state、元件內變數與函式）。不是自己挑，要靠 lint 規則；想少依賴就改寫程式（搬出 Effect、updater、`useEffectEvent`、`key`）。

**Q：Effect 與事件處理函式如何取捨？**
因為「使用者做了某事」→ 事件處理函式；因為「元件顯示在畫面上，需要與外部系統同步」→ Effect。

**Q：為什麼開發環境 Effect 會跑兩次？**
StrictMode 故意模擬卸載再掛載，驗證 cleanup 是否正確。正式環境不會發生。修法是補 cleanup。

**Q：怎麼避免 useEffect 內 fetch 的競態？**
用 `ignore` 旗標或 `AbortController` 在 cleanup 中忽略 / 取消舊請求；或直接用 TanStack Query / SWR / 框架資料載入。

**Q：什麼時候用 ref 而不是 state？**
值不影響畫面輸出、改動不需要觸發 render（timer id、DOM 節點、上一次的值）時用 ref；要顯示在畫面上的用 state。

**Q：`forwardRef` 還需要嗎？**
React 19 起函式元件可直接收 `ref` prop，不再需要；舊程式仍可運作，但官方方向是移除。
