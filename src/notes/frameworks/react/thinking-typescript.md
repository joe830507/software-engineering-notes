# 以 React 思考與 TypeScript

## 以 React 思考

### 從設計稿到元件：五個步驟

以「可搜尋的商品表」為例：

1. **把 UI 拆成元件階層**：依「單一職責」（一個元件只做一件事）、CSS 選擇器、設計稿的分層、資料模型的結構來切。
   `FilterableProductTable` ▸ `SearchBar`、`ProductTable` ▸ `ProductCategoryRow`、`ProductRow`
2. **先做靜態版**：只用 props 往下傳資料，**完全不用 state**。互動是之後的事。靜態版需要大量打字、很少思考；加互動則相反。
3. **找出 UI 狀態的最小完整表示**：只存「**會變且無法由其他資料算出**」的東西（用 DRY 原則：不要重複）。
   - 隨時間不變？→ 不是 state。
   - 由父元件透過 props 傳來？→ 不是 state。
   - 可由現有 state 或 props 算出來？→ **不是 state**。
   - 本例：搜尋文字、「只顯示有庫存」勾選 → state；商品清單（props）、過濾後清單（算出來）→ 不是 state。
4. **決定 state 放在哪**：找出所有用到這個 state 的元件，放到它們**最近的共同父元件**（或更上層）。
5. **加上反向資料流**：子元件透過 `onXxx` prop 通知父元件更新 state；輸入框用**受控元件**（`value` 與 `onChange`）。

```jsx
function SearchBar({ filterText, inStockOnly, onFilterTextChange, onInStockOnlyChange }) {
  return (
    <form>
      <input value={filterText} onChange={(e) => onFilterTextChange(e.target.value)} />
      <label>
        <input type="checkbox" checked={inStockOnly} onChange={(e) => onInStockOnlyChange(e.target.checked)} />
        只顯示有庫存
      </label>
    </form>
  )
}
```

### 單向資料流

資料由父往子（props），事件由子往父（callback）。這讓資料流向容易追蹤。

## 專案實務

### 目錄與命名

- 元件檔案 `PascalCase.tsx`，Hook `useXxx.ts`。依**功能（feature）**分資料夾，而不是依型別（components / hooks / utils 全擠一起）。
- 一個元件 = 一個公開入口；內部輔助元件放同檔案或同資料夾，不外洩。
- 樣式：CSS Modules、Tailwind、CSS-in-JS（建置期方案）擇一，團隊一致。

### 常見反模式

| 反模式 | 為什麼不好 |
|---|---|
| 在 render 中修改 props / state / 外部變數 | 違反純粹性，StrictMode 會暴露 |
| 用陣列索引當 `key` | 排序 / 刪除時狀態錯位 |
| 元件內定義元件 | 每次 render 重新掛載 |
| `useEffect` 算衍生資料或同步 state | 多一次 render，容易出錯 |
| 把 props 複製成 state | 之後 props 變了，state 不跟著變 |
| 過度使用 Context 存頻繁變動的資料 | 所有消費者都重新 render |
| 一個超大元件做所有事 | 難測試、難重用，應拆分 |
| 關掉 `exhaustive-deps` | 隱藏過期閉包 bug |

### 測試

- **React Testing Library** + Vitest / Jest：以「使用者看到的東西」測試（`getByRole`、`getByText`），不測內部 state。
- 非同步用 `findBy*`、`waitFor`；使用者互動用 `@testing-library/user-event`。
- API 以 **MSW** 攔截，不要 mock 掉 `fetch` 本身。
- 端到端用 Playwright。

## TypeScript

### 元件 props

```tsx
type ButtonProps = {
  label: string
  variant?: 'primary' | 'ghost'
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void
  children?: React.ReactNode
}

function Button({ label, variant = 'primary', onClick }: ButtonProps) {
  return <button className={variant} onClick={onClick}>{label}</button>
}
```

- 用 `type` 或 `interface` 都可以；團隊一致即可。
- 可直接為 props 加型別；React.FC 也是有效選擇，現行型別不會隱含 children，應自行宣告。
- `children` 型別：`React.ReactNode`（最通用）、`React.ReactElement`（只允許元素）。
- **擴充原生元素的 props**：`React.ComponentProps<'button'>` 或 `React.ComponentPropsWithoutRef<'input'>`。

```tsx
type Props = React.ComponentProps<'button'> & { loading?: boolean }
function SpinnerButton({ loading, children, ...rest }: Props) {
  return <button {...rest} disabled={loading || rest.disabled}>{children}</button>
}
```

### Hook 的型別

```tsx
// useState：能推斷就不用寫；null 或聯合型別要明確
const [count, setCount] = useState(0)                        // number
const [user, setUser] = useState<User | null>(null)
type Status = 'idle' | 'loading' | 'error'
const [status, setStatus] = useState<Status>('idle')

// useRef：19 起必須給初始值
const inputRef = useRef<HTMLInputElement>(null)              // DOM ref：初始 null
const timerRef = useRef<number | null>(null)                 // 可變值

// useReducer：用「判別聯合」描述 action
type Action = { type: 'added'; text: string } | { type: 'deleted'; id: number }
function reducer(state: Todo[], action: Action): Todo[] { /* switch (action.type) */ return state }

// useContext：建立時給預設值或 null，再用自訂 Hook 收斂 null 檢查
const ThemeContext = createContext<'light' | 'dark' | null>(null)
function useTheme() {
  const v = useContext(ThemeContext)
  if (v === null) throw new Error('useTheme 必須在 ThemeProvider 內使用')
  return v
}
```

- `useMemo`、`useCallback` 的型別多半可由函式推斷；`useCallback` 參數需明確標型別（`(e: string) => ...`）。
- `useActionState<State, Payload>(action, initial)` 的 state 型別要與 action 回傳型別一致。

### 事件型別

```tsx
function handleChange(e: React.ChangeEvent<HTMLInputElement>) { setValue(e.target.value) }
function handleSubmit(e: React.FormEvent<HTMLFormElement>) { e.preventDefault() }
function handleKey(e: React.KeyboardEvent<HTMLInputElement>) { if (e.key === 'Enter') {} }
```

- 事件型別是 `React.XxxEvent<元素型別>`；**直接寫在 JSX 的行內函式**可以讓 TS 推斷，不必手標。
- 把事件處理函式抽成獨立函式時，才需要自己標型別。

### 泛型元件

```tsx
type ListProps<T> = {
  items: T[]
  getKey: (item: T) => string | number
  render: (item: T) => React.ReactNode
}
function List<T>({ items, getKey, render }: ListProps<T>) {
  return <ul>{items.map((i) => <li key={getKey(i)}>{render(i)}</li>)}</ul>
}
<List items={users} getKey={(u) => u.id} render={(u) => u.name} />    // T 自動推斷成 User
```

### 其他

- **判別聯合 props**：用一個欄位決定其他欄位是否存在，避免不合法組合：

```tsx
type Props =
  | { status: 'success'; data: User }
  | { status: 'error'; error: Error }
  | { status: 'loading' }
```

- `as const` 把物件 / 陣列固定成字面量型別；`satisfies` 驗證結構但保留推斷。
- 避免 `any`，不確定時用 `unknown` 再縮小範圍。
- `strict: true`、`noUncheckedIndexedAccess` 能減少執行期錯誤。
- `tsconfig`：`"jsx": "react-jsx"`（自動引入，不用 `import React`）。

## 面試速查

**Q：怎麼決定一份資料是不是 state？**
問三個問題：會隨時間改變嗎？是從 props 來的嗎？能由其他 state 或 props 算出來嗎？只有「會變、不是 props、無法算出」的才是 state。

**Q：受控元件與非受控元件？**
受控：值由 state 驅動（`value` + `onChange`），React 是唯一真實來源；非受控：值保留在 DOM，用 ref 或 `FormData` 讀取。表單即時驗證、連動用受控；簡單提交可用非受控 + `<form action>`。

**Q：為什麼不建議用 `React.FC`？**
這是團隊風格選擇。現行 React.FC 不隱含 children；一般函式加 props 型別通常更簡潔，也方便撰寫泛型元件。

**Q：怎麼讓元件 props 繼承原生 HTML 元素的屬性？**
`React.ComponentProps<'button'>`（含 ref）或 `ComponentPropsWithoutRef<'button'>`，再與自己的 props 交叉（`&`）。

**Q：React 的資料流方向？**
單向：props 由上往下，事件（callback）由下往上。共享狀態放在最近的共同祖先，必要時用 Context 或外部 store。
