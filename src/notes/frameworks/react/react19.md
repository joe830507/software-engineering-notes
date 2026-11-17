# React 19 新功能

> 涵蓋 React 19.0（2024/12）到 19.3（2026/09）。官方版本頁目前的最新版為 **19.3**。

## Actions 與表單

### Action 的概念

在 Transition 中執行的函式（可以是 `async`）稱為 **Action**。React 會自動管理它的：

- **pending 狀態**（進行中）
- **樂觀更新**（`useOptimistic`）
- **錯誤處理**（拋出錯誤時交給最近的 Error Boundary）
- **表單提交**與重置

### `<form action={fn}>`

```jsx
async function updateName(formData) {
  const name = formData.get('name')
  await save(name)
}

<form action={updateName}>
  <input name="name" />
  <button type="submit">儲存</button>
</form>
```

- `action` 可以直接傳函式（取代 `onSubmit` + `preventDefault`）。函式接收 `FormData`。
- 成功後**非受控**輸入框會自動重置。
- `<button formAction={fn}>`、`<input type="submit" formAction>` 也能指定各自的 Action。
- 在 Server Components / Server Functions 的框架中，`action` 可以是 Server Function，並支援漸進式增強（沒載入 JS 也能提交）。

### useActionState

```jsx
import { useActionState } from 'react'

async function increment(prevState, formData) {
  const next = await api.add(prevState.count)       // 可以是 async，可以有副作用
  return { count: next }
}

function Counter() {
  const [state, formAction, isPending] = useActionState(increment, { count: 0 })
  return (
    <form action={formAction}>
      <p>{state.count}</p>
      <button disabled={isPending}>+1</button>
    </form>
  )
}
```

- 回傳 `[目前 state, dispatchAction, isPending]`。
- `reducerAction(previousState, payload)` 與 `useReducer` 的 reducer 類似，但**可以是 async、可以有副作用**；StrictMode 不會重複呼叫它。
- 多次 dispatch 會**依序排隊**執行，每次都收到上一次的結果。
- `dispatchAction` 必須在 **Action 內**呼叫（`<form action>` 或 `startTransition`）。
- 若 reducerAction 拋錯，佇列中的 action 全部取消，並顯示最近的 Error Boundary。
- 這個 Hook 以前在 Canary 版叫 `useFormState`（已改名）。

### useFormStatus（react-dom）

```jsx
import { useFormStatus } from 'react-dom'

function SubmitButton() {
  const { pending } = useFormStatus()        // 讀「父層 <form>」的狀態
  return <button disabled={pending}>送出</button>
}
```

- 必須在 `<form>` **內部的子元件**呼叫，讀不到同一個元件自己 render 的 `<form>`。
- 設計系統的按鈕可以不用透過 props 就知道表單狀態。

### useOptimistic：樂觀更新

```jsx
const [optimisticLiked, setOptimisticLiked] = useOptimistic(liked)
const [isPending, startTransition] = useTransition()

function toggle() {
  if (isPending) return
  startTransition(async () => {
    setOptimisticLiked(!liked)          // 立即顯示新值
    await saveLike(!liked)
    startTransition(() => setLiked(!liked)) // await 後重新標記為 Transition
  })
}

// 放在元件的回傳 JSX 中；此例假設 liked 只由這個操作更新
<button disabled={isPending} onClick={toggle} aria-pressed={optimisticLiked}>
  {optimisticLiked ? '已按讚' : '按讚'}
</button>
```

- 在 Action 進行期間顯示**暫時的值**；Action 結束後回到傳入的 `value`（成功時是新的真實值，失敗時自動回滾）。
- 第二個參數可傳 `reducer`：`useOptimistic(todos, (current, newTodo) => [...current, { ...newTodo, pending: true }])`，真實資料在 Action 進行中改變時，React 會用新的資料重新套用 reducer。
- **`set` 必須在 Action 內呼叫**，否則會警告，樂觀值只閃一下。
- 失敗時自己用 `try/catch` 顯示錯誤訊息。

## use

### 在 render 中讀取資源

```jsx
import { use } from 'react'

function Comments({ commentsPromise }) {
  const comments = use(commentsPromise)       // pending 時元件「懸置」，交給 Suspense
  return comments.map((c) => <p key={c.id}>{c.text}</p>)
}

<Suspense fallback={<Spinner />}>
  <Comments commentsPromise={commentsPromise} />
</Suspense>
```

- `use(promise)`：讀取 Promise 的結果；pending 時顯示最近 `<Suspense>` 的 fallback；被 reject 時交給最近的 **Error Boundary**。
- `use(context)`：功能像 `useContext`，但**可以在 `if` 與迴圈中呼叫**。
- `use` 是 React 的資源讀取 API，具有不同於一般 Hook 的呼叫規則；仍**只能在元件或 Hook 內**呼叫，**不能放在 `try/catch`**。
- ⚠️ **Promise 必須穩定**：在 Client Component 的 render 中 `use(fetch(...))` 每次 render 都是新 Promise，會無限重試。要由 Server Component、框架、或支援 Suspense 的快取函式庫提供（並**快取**）。
- Server Component 傳給 Client Component 的 Promise，其結果值必須可序列化。

### use(browser())（19.3）

```jsx
import { use } from 'react'
import { browser } from 'react-dom'

function LocalTime() {
  use(browser())            // 伺服器端：懸置，HTML 顯示 fallback；瀏覽器端：不懸置
  return <time>{new Date().toLocaleString()}</time>
}
```

- 取代「`useState(mounted)` + `useEffect`」或 `typeof window` 檢查，讓只能在瀏覽器渲染的元件**退出 SSR**，並由 Suspense 負責 loading。
- 因為是 `use`，可以放在條件中（有初始資料就不懸置）。

## 元件與 DOM 的新寫法

### ref 當 prop 與 ref 清理

```jsx
function Input({ ref, ...props }) { return <input ref={ref} {...props} /> }   // 不需要 forwardRef

<div ref={(node) => {
  observer.observe(node)
  return () => observer.unobserve(node)       // 新：ref callback 可回傳清理函式
}} />
```

### Context 直接當 Provider

```jsx
<ThemeContext value="dark">…</ThemeContext>        // 取代 <ThemeContext.Provider value="dark">
```

### 文件 metadata 與資源

- 在任何元件內寫 `<title>`、`<meta>`、`<link>`，React 通常會提升到 `<head>`（支援 SSR 與串流），但 itemProp 等情境有例外；stylesheet 需符合 precedence 等特殊處理條件。
- `<link rel="stylesheet" href="/styles.css" precedence="default" />`：React 管理樣式表載入順序與去重，並讓 Suspense 等樣式載入完成。
- `<script async src="/analytics.js" />`：可在元件內宣告，自動去重。
- `react-dom` 的資源預載 API：`preload`、`preinit`、`prefetchDNS`、`preconnect`。

### 其他改進

- **自訂元素（Web Components）**完整支援。
- **更好的錯誤回報**：hydration 不符只顯示一則含 diff 的訊息；`createRoot` 新增 `onCaughtError` / `onUncaughtError`。
- **移除**：`propTypes` 與函式元件的 `defaultProps`（改用 ES 預設參數與 TypeScript；class 元件仍保留 `defaultProps`）、字串 ref、legacy Context、`ReactDOM.render` / `hydrate`（改用 `createRoot` / `hydrateRoot`）、`react-test-renderer/shallow`。
- `useRef` 在 TypeScript 中必須傳初始值。

## React 19.2 與 19.3

### Activity（19.2）

```jsx
<Activity mode={isVisible ? 'visible' : 'hidden'}>
  <Sidebar />
</Activity>
```

- `hidden` 時：子樹被隱藏（`display: none`）、**Effect 被清理**、以低優先權繼續 render；**保留 state 與 DOM**。
- 用途：預先 render 使用者可能前往的頁面、保留分頁切換時的輸入內容、返回導航時還原狀態。比條件渲染（卸載後 state 全失）更細緻。

### useEffectEvent（19.2）

見〈Ref 與 Effect〉。讓 Effect 讀取最新的 props / state，卻不因它們改變而重新同步。

### Performance Tracks（19.2）

Chrome DevTools 的效能面板會顯示 React 專用軌道（**Scheduler** 與 **Components**），可看出各優先權的工作、元件 render / Effect 的耗時。

### Partial Pre-rendering（19.2，React DOM）

先預渲染並把靜態部分放上 CDN，再以 **resume** 補上動態內容。

### ViewTransition（19.3 穩定）

```jsx
import { ViewTransition } from 'react'

{isShowing && (
  <ViewTransition>
    <Component />
  </ViewTransition>
)}
```

- 以瀏覽器的 View Transition API，讓元素的**進入（enter）、離開（exit）、更新（update）、共享（share，同名元素在不同位置移動）**自動帶動畫。
- **只有 Transition 內的更新才會動畫**：`startTransition`、Suspense 顯露、`useDeferredValue`。一般緊急更新不會。
- `addTransitionType('next')` 讓同樣的 state 改變依原因（前進 / 後退）套用不同動畫；也可用 `:active-view-transition-type()` 在 CSS 中區分。
- 目前只適用 DOM。

### Fragment Refs（19.3）

```jsx
const ref = useRef(null)
<Fragment ref={ref}>{posts.map((p) => <Heading key={p.id} {...p} />)}</Fragment>
```

`ref.current` 是 `FragmentInstance`，可以對這群 DOM 子節點**一起**做：`addEventListener`、`focus`、`blur`、`observeUsing`（IntersectionObserver / ResizeObserver）、`getClientRects`、`scrollIntoView` 等，不必多包一層 `<div>`，也不用改子元件去開放 `ref`。

### 其他項目

- **Trusted Types**（19.3）：網站啟用 Trusted Types（防 DOM 型 XSS）時，React 不再把值強制轉成字串，而是原樣交給 `innerHTML` 等注入點，讓 `TrustedHTML` 等物件能通過瀏覽器驗證。
- **Batching Suspense Boundaries for SSR**（19.2）：SSR 串流時，同時完成的 Suspense 邊界一起揭露，避免畫面抖動。

## Server Components 概念

> React Server Components（RSC）由**框架**（如 Next.js）實作，這裡只記觀念。

- **Server Component**：只在伺服器（或建置時）執行，可直接 `async/await` 讀資料庫，**不會把程式碼送到瀏覽器**；不能用 state、Effect、事件處理函式。
- **Client Component**：以 'use client' 建立客戶端模組邊界（其相依模組也屬於該邊界），能用 state 與事件；框架仍可在伺服器預渲染初始 HTML，不能假設 render 時一定有 window。
- Server Component 可以**把 Promise 傳給** Client Component，由 `use(promise)` 讀取。
- **Server Function**：`'use server'`，由客戶端呼叫、在伺服器執行（常作為 `<form action>`）。傳入與傳回的值必須可序列化。
- 序列化邊界：函式（除了 Server Function）、class 實例等不能從 Server 傳給 Client。

## 面試速查

**Q：React 19 最重要的改變？**
Actions（`useActionState`、`<form action>`、`useOptimistic`、`useFormStatus`）、`use`、`ref` 當 prop 與 ref 清理、`<Context>` 當 Provider、文件 metadata、Server Components / Functions 穩定。

**Q：`use` 與 `useContext` 的差別？**
`use` 可以在條件與迴圈中呼叫，並且能讀 Promise；`useContext` 只能在頂層呼叫、只讀 Context。

**Q：樂觀更新怎麼處理失敗？**
`useOptimistic` 只在 Action 進行期間顯示暫時值；Action 結束後回到真實 `value`，所以失敗會自動「回滾」。再用 `try/catch` 或錯誤邊界提示使用者。

**Q：React 19 怎麼處理表單提交？**
`<form action={fn}>`，`fn` 接 `FormData`；搭配 `useActionState` 管理結果與 pending；子按鈕以 `useFormStatus` 讀表單狀態；成功後非受控欄位自動重置。

**Q：Activity 與條件渲染的差別？**
條件渲染不顯示 = 卸載，state 與 DOM 都丟；`Activity hidden` = 保留 state 與 DOM、清理 Effect、低優先權繼續 render。
