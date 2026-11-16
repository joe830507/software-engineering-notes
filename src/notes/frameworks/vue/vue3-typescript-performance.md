# Vue 3 TypeScript 與效能

## TypeScript 整合

### Props、Emits 與 ref 型別

Vue 3 以 TypeScript 重寫，`<script setup lang="ts">` 型別推導相當完整。

```vue
<script setup lang="ts">
import type { Txn } from '@/types'

interface Props {
  txn: Txn
  editable?: boolean
  status?: 'pending' | 'posted' | 'reversed'
}
const { txn, editable = false, status = 'pending' } = defineProps<Props>()

const emit = defineEmits<{
  save: [txn: Txn]
  cancel: []
}>()
</script>
```

3.3 起 `defineProps` 的型別參數可用從其他檔案匯入的型別。

```ts
const count = ref(0)                    // Ref<number>
const user = ref<User | null>(null)     // 聯合型別需明確指定
const list = ref<Txn[]>([])

const form: Form = reactive({ cardNo: '', amount: 0 })   // 標註在變數上
const total = computed(() => list.value.reduce((s, t) => s + t.amount, 0))  // ComputedRef<number>
```

### 模板 ref、事件與 Provide / Inject

```ts
const inputEl = useTemplateRef<HTMLInputElement>('amount')
const dialog = useTemplateRef<InstanceType<typeof BaseDialog>>('dialog')
onMounted(() => inputEl.value?.focus())   // 掛載前為 null，需可選串連

function onInput(event: Event) {
  const value = (event.target as HTMLInputElement).value
}
```

```ts
// keys.ts
export interface ThemeContext {
  theme: Readonly<Ref<'light' | 'dark'>>
  toggle: () => void
}
export const themeKey: InjectionKey<ThemeContext> = Symbol('theme')

provide(themeKey, { theme: readonly(theme), toggle })
const ctx = inject(themeKey)    // ThemeContext | undefined
```

### Composable 型別與全域屬性

```ts
export function useFetch<T>(url: MaybeRefOrGetter<string>) {
  const data = ref<T | null>(null)
  // 內部以 toValue(url) 讀取
  return { data }
}
const { data } = useFetch<Txn[]>(() => `/api/cards/${cardId.value}/transactions`)
```

仍用 Options API 時要用 `defineComponent` 包起來才有推導。擴充 `globalProperties`：

```ts
import type { AxiosInstance } from 'axios'
export {} // 確保此檔是模組，以下擴充原模組宣告

declare module 'vue' {
  interface ComponentCustomProperties { $http: AxiosInstance }
}
```

路由 `meta` 型別則擴充 `vue-router` 模組的 `RouteMeta`。

### 型別檢查流程

**Vite 只轉譯、不做型別檢查**，型別錯誤要靠編輯器與 `vue-tsc` 發現：

```json
{ "scripts": { "type-check": "vue-tsc --noEmit", "build": "vue-tsc --noEmit && vite build" } }
```

歷史相容性紀錄：原稿在 vue-tsc 3.3.12 搭配 TypeScript 7.0.2 時遇到 `Package subpath './lib/tsc' is not defined by "exports"`。這不代表後續版本都不支援；建立專案時應確認 vue-tsc 與 TypeScript 的相容版本，鎖定版本並實際執行型別檢查，不應永久固定在 TypeScript 6。

## 編譯器最佳化

### 編譯器為你做的事

模板編譯器分析模板後產生帶提示的 render function，讓執行期跳過不必要的比對，這也是模板通常比手寫 render function 快的原因。

| 最佳化 | 作用 |
| --- | --- |
| 靜態提升 | 不含動態綁定的節點只建立一次，之後重複使用 |
| Patch flags | 在動態節點標記「哪種內容會變」（文字、class、特定 props），比對只檢查標記部分 |
| Block tree | 把動態節點收集成扁平陣列，更新不必走訪整棵樹 |
| 事件處理函式快取 | 行內事件處理函式不會每次渲染重建 |

這些最佳化能跳過靜態內容，但不能保證更新成本只與動態節點數成正比；列表比對、元件更新、計算與 DOM 操作仍有成本，應量測實際瓶頸。

### 你可以做的事

| 手段 | 適用情境 |
| --- | --- |
| 路由層級懶載入 | 所有專案的基本功 |
| `defineAsyncComponent` | 首屏用不到的大型元件（圖表、編輯器） |
| `shallowRef`、`markRaw` | 大型唯讀資料、第三方函式庫實例 |
| `v-memo` | 大型 `v-for` 中多數項目更新時不會變 |
| `v-once` | 只渲染一次的內容 |
| 虛擬捲動 | 上千筆以上的清單 |
| 讓 props 保持穩定 | 避免把每列都會變的值傳給所有子元件 |

```vue
<!-- v-memo：只在依賴改變時更新；若內容還顯示可變的 item.name 等值，也必須納入依賴，否則畫面可能停在舊值 -->
<div v-for="item in list" :key="item.id" v-memo="[item.id === selectedId]">…</div>

<!-- 較差：activeId 變更時每一列都會更新 -->
<ListItem v-for="item in list" :key="item.id" :id="item.id" :active-id="activeId" />
<!-- 較好：只有 active 值改變的那兩列會更新 -->
<ListItem v-for="item in list" :key="item.id" :id="item.id" :active="item.id === activeId" />
```

### 官方效能指南補充

依 vuejs.org/guide/best-practices/performance.html 與 rendering-mechanism.html：

- **靜態快取**：連續的靜態元素會合併成一個靜態 vnode，以 `innerHTML` 掛載，更新時整段跳過。
- **Patch flags**：編碼成數字（如 `2 /* CLASS */`），執行期用位元運算判斷要比對什麼。
- **Tree flattening**：每個 block 只追蹤自己的動態後代；`v-if`、`v-for` 會建立子 block。這也讓 SSR hydration 可走快速路徑、部分 hydrate。
- **computed 穩定性（3.4+）**：只有計算值真的變了才觸發 effect。**每次都回傳新物件會抵銷這個好處**，必要時回傳舊值。
- **大型清單**：虛擬捲動（vue-virtual-scroller 等）；單次渲染超過約 10 萬個響應式屬性時，用 `shallowRef` / `shallowReactive` 並以替換根值的方式更新，例如 `list.value = [...list.value, item]`。
- 大型清單中避免不必要的元件抽象（renderless、高階元件）。
- 有建置步驟時，預編譯模板可省約 14kb（min+gzip）；路由與重型元件要懶載入。
- 效能分析：`app.config.performance = true` 會在 DevTools 的效能面板加上標記。

## 響應式核心演進與 Vapor Mode

### 響應式核心

- **3.4**：computed 只有計算結果真的改變時才觸發下游更新，減少不必要的重新渲染。
- **3.5**：響應式系統重構，官方公布記憶體用量大幅下降、大型深層陣列操作明顯加快，無行為變更。
- **3.6（RC）**：核心以 alien-signals 為基礎再次重寫。

這些改進都不需修改程式碼，升級即可受益。

### Vapor Mode

Vue 3.6 引入的新編譯模式：把單檔元件模板直接編譯成 DOM 操作，不經過虛擬 DOM 建立與比對，目標是更小的打包體積與更快的更新。**現況（2026-10）：功能完成，但 3.6 仍在 RC，API 與行為仍可能調整。**

```vue
<script setup vapor>
import { ref } from 'vue'
const count = ref(0)
</script>
<template><button @click="count++">{{ count }}</button></template>
```

- 全部元件都用 Vapor 時以 `createVaporApp` 建立，可完全不載入虛擬 DOM 執行期。
- 在既有虛擬 DOM 應用中混用，需安裝 `vaporInteropPlugin`。
- 只支援 `<script setup>`，不支援 Options API、`app.config.globalProperties`、`getCurrentInstance()`。

官方建議範圍：既有應用中對效能敏感的個別頁面，或全新小型應用。學習階段先把標準模式學好即可，因為 Vapor 元件寫法就是 `<script setup>`。

### SSR 相關新功能

- `useId()`（3.5）：產生伺服器與瀏覽器一致的唯一 id，用於表單與無障礙關聯。
- Lazy hydration（3.5）：非同步元件可指定在可見、閒置或互動時才 hydrate。

```js
const Comments = defineAsyncComponent({
  loader: () => import('./Comments.vue'),
  hydrate: hydrateOnVisible(),
})
```

### 自我檢查

- 能用型別宣告寫出 props、emits、slots，並為模板 ref 與元件 ref 標註型別。
- 能用 `InjectionKey` 寫出有型別的 provide / inject。
- 能說明為什麼 Vite 專案需要另外執行 `vue-tsc`。
- 能說明靜態提升、patch flags、block tree 各自的作用與 `v-memo` 的適用情境。
- 能說明 Vapor Mode 是什麼、目前的穩定性與限制。
