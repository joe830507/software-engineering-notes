# Hook 與效能速查

## Hook 總覽

### 分類速查

| 分類 | Hook | 用途 |
|---|---|---|
| State | `useState`、`useReducer` | 元件的記憶 |
| Context | `useContext` | 讀取祖先提供的值 |
| Ref | `useRef`、`useImperativeHandle` | 不觸發 render 的值、DOM、暴露方法 |
| Effect | `useEffect`、`useLayoutEffect`、`useInsertionEffect`、`useEffectEvent` | 與外部系統同步 |
| 效能 | `useMemo`、`useCallback`、`useTransition`、`useDeferredValue` | 快取與讓更新不阻塞 |
| 資源 | `use` | 在 render 中讀 Promise / Context |
| Action（19） | `useActionState`、`useOptimistic`、`useFormStatus`（react-dom） | 表單與非同步更新 |
| 其他 | `useId`、`useSyncExternalStore`、`useDebugValue` | 唯一 ID、訂閱外部 store |

### Hook 規則

1. **只在頂層呼叫**：不放在條件、迴圈、巢狀函式、`try/catch` 內。
2. **只在 React 函式元件或自訂 Hook 中呼叫**。
3. 例外：`use` 可以在條件與迴圈中呼叫（但仍不能在 `try/catch`）。

## 記憶化：memo、useMemo、useCallback

### 先理解 render 的成本

- 父元件 render → 子元件預設都會重新 render（即使 props 沒變）。大多數情況這很快，**不需要最佳化**。
- 先量測（React DevTools Profiler）再最佳化；過早最佳化讓程式更難讀。
- **React Compiler**（1.0 已穩定，須在建置設定中啟用）會在建置時自動加上等價的記憶化，之後多數手動 `useMemo` / `useCallback` / `memo` 都不需要寫（見下）。

### useMemo：快取計算結果

```jsx
const visible = useMemo(() => filterTodos(todos, tab), [todos, tab])
```

- 用於：①**明顯昂貴**的計算（`console.time` 量到 ≥ 1ms）；②要傳給 `memo` 元件或當其他 Hook 依賴、需要**穩定參考**的物件 / 陣列。
- 計算函式必須是純函式，且不接受參數（開發環境 StrictMode 可能呼叫兩次檢查）。
- 這只是效能提示，React 不保證永遠不丟掉快取，不可依賴它維持語意。

### useCallback：快取函式

```jsx
const handleSubmit = useCallback((order) => post('/api', { productId, order }), [productId])
```

- 等價於 `useMemo(() => fn, deps)`，專門快取函式本身。
- 只有函式要傳給 **`memo` 子元件**，或**當作其他 Hook 的依賴**時才有意義；單純傳給 DOM 元素的 `onClick` 沒有必要。
- 在 `setState` 用 updater（`setTodos(t => [...t, x])`）可以少一個依賴。

### memo：略過沒變的子元件

```jsx
const List = memo(function List({ items, onSelect }) { ... })
```

- 預設逐個 prop 用 Object.is 比較，未變時通常略過父層造成的 render；自身 state 或 Context 更新仍會 render。
- **傳入的物件、陣列、函式每次 render 都是新的 → memo 失效**：要搭配 `useMemo` / `useCallback`，或把值往下傳原始型別。
- 如果元件讀取了 Context，Context 變動它仍會 render。
- 不要為了「看起來有最佳化」在每個元件都包 `memo`。

### 更好的做法（先於記憶化）

1. **把 state 往下移**：只有需要它的元件持有 state，其他不受影響。
2. **用 `children` 組合**：把不變的子樹以 `children` 傳進來，元件 state 變動時 `children` 的參考不變，不會重新 render。
3. 避免不必要的 Effect 與 state（見〈Ref 與 Effect〉）。

## React Compiler

- 建置期工具（Babel / 框架外掛），**自動為元件與 Hook 加上記憶化**，目標是不需手寫 `useMemo`、`useCallback`、`memo`。
- 前提：程式碼遵守 **React 規則**（純函式 render、Hook 規則、不 mutate props / state）。編譯器可略過無法安全最佳化的元件，但不會修復原本違反 React 規則的程式錯誤。
- 以 ESLint 規則（`eslint-plugin-react-hooks`）找出違規。舊的手動記憶化可保留，不需大規模移除。
- 能避免的是「不必要的重新 render」；**不會**取代好的資料結構與架構。

## 讓更新不阻塞：Transition 與 Deferred

### useTransition

```jsx
const [isPending, startTransition] = useTransition()

function selectTab(next) {
  startTransition(() => setTab(next))     // 這次更新是「非緊急」，可被中斷
}
```

- 把更新標記為 **Transition**：低優先權、可被使用者輸入**打斷**，期間顯示舊 UI，不會出現不必要的載入 fallback。
- `isPending`：Transition 進行中，可用來顯示輕量的載入提示。
- 傳給 `startTransition` 的函式叫 **Action**，可以是 `async`。**`await` 之後的 `set` 需要再包一次 `startTransition`**（目前的已知限制）。
- 只能包住你拿得到 `set` 的更新；不能控制文字輸入（輸入框要即時反應）。
- 沒有 `useTransition`（例如在資料函式庫中）用獨立的 `startTransition`。

### useDeferredValue

```jsx
const deferredQuery = useDeferredValue(query)       // 輸入立即更新，搜尋結果「稍後」才跟上
const isStale = query !== deferredQuery
<SlowList query={deferredQuery} />                  // 昂貴子樹通常搭配 memo 或 Compiler 避免緊急更新時重算
```

- 用在「拿不到 `set`」的情況（值來自 props 或 Hook）。
- 先以舊值 render，背景再用新值 render，可被中斷。
- 19 起可提供初始值：`useDeferredValue(value, initialValue)`。
- 對比 debounce / throttle：沒有固定等待時間；它不會自動減少網路請求，若需限制請求頻率仍須 debounce 或快取。

## Suspense 與 lazy

### Suspense

```jsx
<Suspense fallback={<Spinner />}>
  <Comments />          {/* 內部「懸置」(suspend) 時顯示 fallback */}
</Suspense>
```

- 子元件在 render 中「等待」資料（`use(promise)`、`lazy`、支援 Suspense 的資料函式庫 / 框架）時，顯示最近的 `<Suspense>` 的 fallback。
- 可**巢狀**，由內而外決定載入的粒度；搭配 Transition，更新時**不會**把已顯示的內容換回 fallback。
- **Effect 內與事件處理函式內的資料抓取不會觸發 Suspense**。
- Suspense 讓載入狀態「宣告在元件樹中」，不用每個元件都寫 `isLoading`。

### lazy：程式碼分割

```jsx
const Chart = lazy(() => import('./Chart'))
<Suspense fallback={<Spinner />}><Chart /></Suspense>
```

- 在頂層宣告（不要在元件內）；元件第一次被 render 時才載入。
- 路由層級是最常見的切割點。

## 錯誤邊界

- 在 render 中拋出的錯誤，會讓整個樹卸載；用 **Error Boundary** 在局部攔截並顯示替代 UI。
- 目前只能用 **class 元件**（`getDerivedStateFromError` + `componentDidCatch`）實作，通常直接用 `react-error-boundary` 套件。
- **通常攔不到**事件處理函式、一般非同步回呼、SSR 與邊界自身錯誤；需在適當位置自行處理。例外是 Transition Action 拋錯，以及 use 讀取被拒絕的 Promise，React 可交給 Error Boundary。
- `createRoot` 的 `onCaughtError`、`onUncaughtError` 是 React 19 新增，`onRecoverableError` 在 React 18 已存在，可用來集中紀錄錯誤。

## 其他實用 Hook

### useId：產生 SSR 安全的唯一 ID

```jsx
const id = useId()
<label htmlFor={id}>Email</label><input id={id} />
```

用於無障礙屬性（`aria-describedby`、`htmlFor`）。**不要拿來當清單的 key**。

### useSyncExternalStore：訂閱外部 store

```jsx
const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true)
```

用於瀏覽器 API 或第三方 store（Redux、Zustand 底層都用它），可避免 tearing、支援 SSR。

### useLayoutEffect

在**瀏覽器繪製前**同步執行，用於量測 DOM 後立刻調整（tooltip 位置）。會阻塞繪製，盡量少用，優先用 `useEffect`。

### useImperativeHandle

```jsx
function MyInput({ ref }) {
  const inner = useRef(null)
  useImperativeHandle(ref, () => ({ focus: () => inner.current.focus() }), [])
  return <input ref={inner} />
}
```

只暴露需要的方法，而不是整個 DOM 節點。

### Fragment、Portal

- `<Fragment>`（`<>`）：包住多個子節點但不產生 DOM。React 19.3 起 Fragment 可以接 `ref`（見〈React 19 新功能〉）。
- `createPortal(children, domNode)`：把子樹渲染到另一個 DOM 節點（modal、tooltip），事件仍依 React 樹冒泡。

## 面試速查

**Q：`useMemo`、`useCallback`、`memo` 差在哪？**
`memo` 包元件，props 沒變就跳過 render；`useMemo` 快取計算值；`useCallback` 快取函式（= `useMemo(() => fn)`）。它們只在**昂貴計算**或**配合 `memo` 穩定 props 參考**時有意義。

**Q：什麼時候不該用記憶化？**
計算很便宜、傳給原生 DOM 元素的函式、沒有 `memo` 的子元件、依賴每次都變。先量測，並先用「state 下移」與「children 組合」。

**Q：`useTransition` 和 `useDeferredValue` 差別？**
`useTransition` 包的是**更新動作**（你有 `set`）；`useDeferredValue` 延遲的是**值**（來自 props 或其他 Hook）。兩者都讓背景渲染可被中斷，並盡量保留已顯示內容；新掛載的 Suspense 邊界仍可能顯示 fallback。

**Q：Suspense 能捕獲什麼？**
render 中「懸置」的元件（`lazy`、`use(promise)`、支援 Suspense 的資料來源）。不包含 Effect 或事件處理函式裡的 fetch，也不處理錯誤（要用 Error Boundary）。

**Q：React Compiler 解決了什麼？**
自動記憶化，減少手寫 `useMemo` / `useCallback` / `memo`。前提是元件遵守 React 規則；編譯器可略過無法安全最佳化的元件，但不會修好違規程式原本的 bug。
