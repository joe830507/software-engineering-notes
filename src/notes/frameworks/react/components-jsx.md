# React 總覽、JSX 與元件

> 整理自 [react.dev](https://react.dev) 官方文件（Learn 與 Reference，內容為 CC BY 4.0 授權），以 React 19.x（目前最新為 19.3）為準，用自己的話重新整理，範例為自行改寫。想完整學習請讀官方文件。

## 總覽

### React 是什麼

- 用**元件（component）**組成 UI 的函式庫：UI 是「狀態的函式」，`UI = f(state)`。
- **宣告式**：描述「某個狀態下畫面長怎樣」，不手動操作 DOM；狀態變了，React 負責算出差異並更新。
- React 本身只管 UI。路由、資料抓取、SSR、打包通常交給**框架**（Next.js、React Router、Expo 等）或自行組合工具（Vite + 路由 + 資料庫函式庫）。

### 起專案

```bash
# 官方建議：用框架（Next.js / React Router / Expo）。純前端 SPA 可用 Vite
npm create vite@latest my-app -- --template react-ts
cd my-app && npm install && npm run dev
```

- 手動加進既有專案：`npm i react react-dom`，在入口用 `createRoot` 掛載。
- Create React App 已不再維護，新專案不要用。

```jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

### 版本脈絡

| 版本 | 重點 |
|---|---|
| 18 | 並行渲染（Concurrent Rendering）、自動批次、`useTransition`、`useDeferredValue`、Suspense 資料抓取基礎 |
| 19 | Actions、`useActionState`、`useOptimistic`、`use`、`<form action>`、`ref` 當 prop、`<Context>` 直接當 Provider、文件 metadata |
| 19.2 | `<Activity>`、`useEffectEvent`、Performance Tracks、Partial Pre-rendering |
| 19.3 | `<ViewTransition>` 穩定版、Fragment Refs、`use(browser())` |

詳見〈React 19 新功能〉。

## JSX

### JSX 是什麼

JSX 是 JavaScript 的語法擴充，編譯後變成函式呼叫（`jsx(...)`）。它不是 HTML，規則更嚴格：

1. **一個 JSX 運算式只能有一個根**：要回傳多個相鄰節點，用 `<>...</>`（Fragment）包起來，不會多一層 DOM。元件也可以回傳陣列、字串、數字或 `null`。
2. **標籤都要關閉**：`<img />`、`<br />`。
3. **屬性用 camelCase**：`className`、`htmlFor`、`onClick`、`tabIndex`；`aria-*` 與 `data-*` 維持連字號。
4. `style` 要傳**物件**：`style={{ backgroundColor: 'red' }}`（外層是 JSX 花括號，內層是物件）。

```jsx
function Avatar({ person, size = 64 }) {
  return (
    <>
      <img className="avatar" src={person.imageUrl} alt={person.name} width={size} height={size} />
      <h1>{person.name}</h1>
    </>
  )
}
```

### 花括號 `{}`：在 JSX 裡寫 JavaScript

- 只有兩個位置可用：①標籤**內的文字**（`<h1>{title}</h1>`）；②緊接在 `=` 後的**屬性值**（`src={url}`）。
- 花括號內是**運算式**（會產生值），不能放 `if` / `for` 語句。
- 呈現規則：`null`、`undefined`、`true`、`false` 不渲染；物件不能直接當子節點；字串與數字會顯示。
- ⚠️ `{count && <List />}`：`count` 是 `0` 時會顯示 `0`。改成 `{count > 0 && <List />}`。

### 條件渲染

```jsx
// 1. 提早 return
if (!user) return null

// 2. 三元運算
<li>{isPacked ? <del>{name}</del> : name}</li>

// 3. && （左側務必是布林）
{isPacked && <span>✔</span>}

// 4. 先放進變數再渲染（邏輯複雜時）
let content = name
if (isPacked) content = <del>{name}</del>
return <li>{content}</li>
```

### 渲染清單與 key

```jsx
<ul>
  {people.map((p) => (
    <li key={p.id}>{p.name}</li>
  ))}
</ul>
```

- **`key` 必填**，要在**同一個陣列內唯一且穩定**，用資料本身的 id（資料庫 ID、`crypto.randomUUID()` 在建立資料時產生）。
- **不要用陣列索引當 key**（會排序、插入、刪除的清單），也**不要在 render 時才產生**（`Math.random()` 每次都換，整個清單重新掛載）。
- `key` 不會被傳進元件（不是 prop）。
- 需要包多個節點時用 `<Fragment key={...}>`，不能用簡寫 `<>`。

## 元件與 props

### 元件的定義

- 元件是**回傳 JSX 的函式**，名稱**首字母大寫**（小寫會被當成 HTML 標籤）。
- 元件**定義在頂層**，不要在元件內再定義元件（每次 render 都是新的元件，狀態會被重置）。
- 一個檔案可以有多個元件，但通常一個檔案一個主要元件；`export default` 一個、`export` 具名多個。

### props：傳資料給子元件

```jsx
function Card({ title, children, ...rest }) {   // 解構 + 其餘屬性
  return (
    <div className="card" {...rest}>
      <h2>{title}</h2>
      {children}                                   {/* 巢狀內容 */}
    </div>
  )
}

<Card title="Hi" id="c1"><p>內容</p></Card>
```

- props 是**唯讀快照**：**不要修改 props**。要「改」就是父元件重新傳不同值（靠 state）。
- 預設值寫在解構：`{ size = 100 }`。
- `children` 是特殊 prop，可傳入任意 JSX，用來做「容器元件」。
- 轉傳全部 props 用 `{...props}`，但別濫用，要讓讀的人看得出傳了什麼。

### 元件必須是純函式

**純粹（pure）**：①不改既有的外部變數（只改自己 render 期間建立的區域變數）；②**相同輸入，相同輸出**（同樣的 props、state、context 一定回傳同樣的 JSX）。

```jsx
let guest = 0
function Cup() {            // ❌ 修改外部變數，呼叫多次結果不同
  guest = guest + 1
  return <h2>Guest #{guest}</h2>
}
function Cup({ guest }) {   // ✅ 由 props 決定輸出
  return <h2>Guest #{guest}</h2>
}
```

- **React 在開發環境的 StrictMode 會多 render 一次**，用來發現不純的程式。
- 區域變動沒問題：在 render 中建立陣列再 `push` 沒問題（局部 mutation）。
- **副作用**（修改 DOM、呼叫 API、訂閱）不屬於 render：放在**事件處理函式**，或最後手段 **Effect**。
- 把 UI 看成「資料樹」：可以任意順序、甚至平行算出，React 才有並行渲染的空間。

## 面試速查

**Q：為什麼清單要有 key？**
React 用 key 判斷「這一項是不是上一輪那一項」，才能正確保留狀態、重排與增刪。沒有或不穩定的 key 會造成狀態錯位、輸入框內容跑掉、效能浪費。

**Q：JSX 和 HTML 的差別？**
JSX 只是語法糖，編譯成函式呼叫；規則較嚴格（多個節點要用 Fragment 包起來、標籤要關閉、camelCase 屬性、`className`）；花括號可嵌入運算式。

**Q：為什麼不能直接改 props？**
props 屬於「這次 render 的輸入快照」，元件必須純粹；子元件改它，父元件不知道，也不會觸發重新 render。要改就把 state 放在擁有資料的元件，由它往下傳。

**Q：`{count && <List />}` 有什麼陷阱？**
`count` 為 `0` 時 `&&` 回傳 `0`，React 會把 `0` 渲染出來。用 `count > 0 &&` 或三元運算。
