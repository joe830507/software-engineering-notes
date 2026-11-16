# Vue 3 Composables 與生態系

## Composables

### 從 mixin 到 composable

Composable 是「用 Composition API 封裝並重用有狀態邏輯的函式」，取代 mixins，也是 Vue 3 生態系的共同語言。

```js
// composables/useMouse.js
import { ref, onMounted, onUnmounted } from 'vue'

export function useMouse() {
  const x = ref(0)
  const y = ref(0)
  function update(e) { x.value = e.pageX; y.value = e.pageY }

  onMounted(() => window.addEventListener('mousemove', update))
  onUnmounted(() => window.removeEventListener('mousemove', update))

  return { x, y }
}
```

```vue
<script setup>
const { x, y } = useMouse()
</script>
```

對照 mixin 三問題：來源清楚（看 import 與解構）、沒有命名衝突（解構可改名）、依賴明確（透過參數傳入）。

### 撰寫慣例

| 慣例 | 原因 |
| --- | --- |
| 函式名以 `use` 開頭 | 辨識用途，工具也依此判斷 |
| 回傳由 ref 組成的普通物件 | 呼叫端解構後仍有響應性 |
| 參數接受 ref、getter 或一般值，內部用 `toValue` 讀取 | 呼叫端有彈性，且能追蹤變化 |
| 副作用在 `onUnmounted` 或 watcher 清理函式中清除 | 避免記憶體洩漏 |
| 只在 `<script setup>` / `setup()` 同步階段呼叫 | 生命週期鉤子與 watcher 才能綁到元件 |

### 完整範例：useFetch

```js
import { ref, watchEffect, toValue } from 'vue'

export function useFetch(url) {
  const data = ref(null)
  const error = ref(null)
  const loading = ref(false)

  watchEffect(async (onCleanup) => {
    const controller = new AbortController()
    onCleanup(() => controller.abort())

    data.value = null
    error.value = null
    loading.value = true
    try {
      // toValue 在第一個 await 之前執行，所以 url 的變化會被追蹤
      const res = await fetch(toValue(url), { signal: controller.signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const result = await res.json()
      if (!controller.signal.aborted) data.value = result
    } catch (e) {
      if (!controller.signal.aborted) error.value = e
    } finally {
      // 被取消的請求不應該關掉新請求的 loading
      if (!controller.signal.aborted) loading.value = false
    }
  })

  return { data, error, loading }
}

// 使用：傳 getter，cardId 變更時自動重新請求
const { data: txns, error, loading } = useFetch(() => `/api/cards/${cardId.value}/transactions`)
```

### 共享狀態、取代 filters 與 event bus

**共享狀態**：把狀態宣告在函式外面，所有呼叫端共用同一份。適合小型跨元件狀態；需要 DevTools、SSR 或複雜狀態時用 Pinia。

```js
const items = ref([])   // 模組層級，全應用共用
export function useNotifications() {
  const push = (message) => items.value.push({ id: Date.now(), message })
  const remove = (id) => (items.value = items.value.filter((n) => n.id !== id))
  return { items: readonly(items), push, remove }
}
```

**取代 filters**：寫一般函式，如 `const formatter = new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD' })`，模板中 `{{ currency(amount) }}`。

**取代 event bus**（`$on` / `$off` / `$once` 已移除）：

| 情境 | 替代方案 |
| --- | --- |
| 父子之間 | props 與 emits |
| 祖先與子孫 | provide / inject |
| 跨頁面、需持久的共享狀態 | Pinia |
| 純粹一次性通知 | 第三方事件庫，如 mitt |

多數 event bus 其實是共享狀態，改 Pinia 後資料流更清楚。

**VueUse**：社群 composable 集合（`useLocalStorage`、`useDebounceFn`、`useIntersectionObserver`、`useEventListener`…）。動手前先查有沒有，原始碼也是學習範本。

### 官方補充：composable 規範

依官方 Composables 文件（vuejs.org/guide/reusability/composables.html）：

- 回傳**普通物件包著 ref**，不要回傳 `reactive()`，否則呼叫端解構會失去響應性。
- 在 `watchEffect` 內呼叫 `toValue`，依賴才會被追蹤。
- 操作 DOM 的副作用放在 `onMounted`（SSR 時不會執行），並在 `onUnmounted` 清理。
- 只能在 `<script setup>` 或 `setup()` 中**同步**呼叫；`<script setup>` 是唯一允許在 `await` 之後呼叫的地方。
- 官方對 mixins 的態度是「不再建議」，僅為遷移保留。

## Vite 與 Vue Router

### Vite

取代 Vue CLI。開發時利用瀏覽器原生 ES modules 按需編譯，啟動與熱更新遠快於 webpack。

```js
// vite.config.js
export default defineConfig({
  plugins: [vue()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { proxy: { '/api': { target: 'http://localhost:8080', changeOrigin: true } } },
})
```

| 項目 | Vue CLI | Vite |
| --- | --- | --- |
| 設定檔 | `vue.config.js` | `vite.config.js` |
| 環境變數前綴 | `VUE_APP_` | `VITE_` |
| 讀取環境變數 | `process.env.VUE_APP_API` | `import.meta.env.VITE_API` |
| 判斷環境 | `process.env.NODE_ENV` | `import.meta.env.DEV` / `PROD` |
| `index.html` | `public/` | 專案根目錄，`<script type="module">` 引入入口 |
| 匯入 `.vue` | 可省略副檔名 | 必須寫 `.vue` |
| 批次匯入 | `require.context` | `import.meta.glob` |
| `require()` | 可用 | 不可用，一律 `import` |

### Vue Router 基本用法

Vue Router 5 把檔案式路由併入核心，對 4 的使用者沒有破壞性變更。

```js
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: () => import('@/views/HomeView.vue') },
    { path: '/txns/:id', name: 'txn-detail', component: () => import('@/views/TxnDetail.vue'),
      props: true, meta: { requiresAuth: true } },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('@/views/NotFound.vue') },
  ],
})
```

| 項目 | Vue Router 3 | Vue Router 4 / 5 |
| --- | --- | --- |
| 建立 | `new VueRouter({})` | `createRouter({})` |
| 模式 | `mode: 'history'` / `'hash'` | `createWebHistory()` / `createWebHashHistory()` |
| base | `base: '/app/'` | `createWebHistory('/app/')` |
| 萬用路由 | `path: '*'` | `path: '/:pathMatch(.*)*'` |
| 等待初始導航 | `router.onReady(cb)` | `await router.isReady()` |
| `<router-link>` 的 `tag` / `exact` | 支援 | 已移除（用 `v-slot` + `custom`；精確啟用狀態用 isExactActive / router-link-exact-active；一般 active 也可包含祖先路由） |
| 導航 | 部分同步 | 一律非同步，`push` 回傳 Promise |

### 使用與導航守衛

```vue
<script setup>
const route = useRoute()
const router = useRouter()

// 同一元件被重用、只有參數改變時，用 watch 重新載入
watch(() => route.params.id, (newId) => load(newId), { immediate: true })
</script>
```

`route` 是響應式物件，**不要解構**。導航守衛改用回傳值決定結果（`next` 回呼仍可用，但 Router 5 已標示棄用，未來會移除）：

```js
router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.meta.requiresAuth && !auth.isLoggedIn) {
    return { name: 'login', query: { redirect: to.fullPath } }   // 回傳位置 = 重新導向
  }
  // 不回傳或 true = 放行；false = 取消
})
```

元件內守衛用 `onBeforeRouteLeave`、`onBeforeRouteUpdate`。

## Pinia

### 與 Vuex 的差別

官方推薦的狀態管理，取代 Vuex。Pinia 4（2026-07）相對 3 沒有 API 變更，破壞性變更只有兩項：套件只提供 ES modules、`@vue/devtools-api` 8 須一起安裝。

- 沒有 mutations，狀態可直接改或在 action 中改。
- 沒有巢狀模組與命名空間，每個 store 獨立，需要時互相引用。
- action 同步非同步皆可，不需 `dispatch` / `commit`。
- 完整的 TypeScript 型別推導。

| Vuex | Pinia |
| --- | --- |
| `state` / `getters` | `state` / `getters`（setup store 用 `ref` / `computed`） |
| `mutations` | 無，直接修改或寫在 action |
| `modules` + `namespaced` | 多個獨立 store |
| `commit` / `dispatch` | `store.x()` 或直接賦值 |
| `mapState` / `mapGetters` / `mapActions` | `<script setup>` 用 `storeToRefs` / 直接解構；Options API 用 Pinia 的 `mapState` / `mapActions` |
| `rootState` | 在 action 內呼叫另一個 `useXxxStore()` |

### 兩種 store 寫法

```js
// Option store：結構接近 Vuex
export const useCartStore = defineStore('cart', {
  state: () => ({ items: [] }),
  getters: {
    total: (state) => state.items.reduce((s, i) => s + i.price * i.qty, 0),
    average() { return this.items.length ? this.total / this.items.length : 0 },  // 用 this 就不能是箭頭函式
  },
  actions: {
    add(item) { this.items.push(item) },
    async checkout() { await api.checkout(this.items); this.items = [] },
  },
})

// Setup store：寫法與 composable 相同，彈性較高
export const useCartStore = defineStore('cart', () => {
  const items = ref([])
  const total = computed(() => items.value.reduce((s, i) => s + i.price * i.qty, 0))
  function add(item) { items.value.push(item) }
  async function checkout() { await api.checkout(items.value); items.value = [] }
  return { items, total, add, checkout }   // 要公開的都要 return
})
```

### 在元件中使用

```vue
<script setup>
const cart = useCartStore()
const { items, total } = storeToRefs(cart)   // 狀態與 getter 要用 storeToRefs 解構才保有響應性
const { add, checkout } = cart               // action 可直接解構
</script>
```

其他：`cart.$patch({ items: [] })`、`cart.$patch((s) => s.items.push(x))`、`cart.$reset()`（僅 option store）、`cart.$subscribe(...)`。遷移既有專案時可先把 store 換成 Pinia、元件維持 Options API（用 `mapState` / `mapActions`），不必兩邊同時改寫。

伺服器資料（請求、快取、重新驗證）不適合全塞進 store，可評估 Pinia Colada 或 TanStack Query。

## 測試與開發工具

### Vitest 與 Vue Test Utils 2

```js
import { mount } from '@vue/test-utils'

it('點擊後數字加一並發出 change 事件', async () => {
  const wrapper = mount(Counter, { props: { initial: 1 } })
  await wrapper.get('button').trigger('click')
  expect(wrapper.text()).toContain('2')
  expect(wrapper.emitted('change')[0]).toEqual([2])
})
```

| VTU 1 | VTU 2 |
| --- | --- |
| `propsData` | `props` |
| `createLocalVue()` | 已移除，改 `global.plugins` |
| `mocks`、`stubs` 在頂層 | 移到 `global` 之下 |
| `wrapper.destroy()` | `wrapper.unmount()` |
| `find(Component)` | `find` 只查 DOM，元件用 `findComponent` |

需要 router 或 store 時：

```js
mount(CartView, { global: { plugins: [createTestingPinia({ createSpy: vi.fn }), router] } })
```

`createTestingPinia` 的兩個預設行為：沒開 Vitest `globals: true` 時**必須傳 `createSpy: vi.fn`**，否則拋錯；所有 action 預設被換成 spy 不會真的執行（要執行加 `stubActions: false`）。Composable 與 store 是普通函式，多數可不掛載元件直接測。E2E 常用 Playwright 或 Cypress。

### 官方的測試與狀態管理建議

**測試**（vuejs.org/guide/scaling-up/testing.html）：

- 單元測試首選 Vitest（Jest 僅用於遷移既有測試）；元件測試用 `@vue/test-utils`；E2E 首選 Playwright，Cypress 也列為選項。
- 官方指出 `@testing-library/vue` 在測試含 Suspense 的非同步元件時有問題。
- 元件測試原則：優先保留真實子元件測整合互動；第三方或昂貴依賴可依測試邊界使用 stub、不要只靠快照，測試渲染結果與發出的事件，而非內部私有狀態。
- 用到生命週期鉤子或 provide / inject 的 composable，需要一個宿主元件才能測（官方文件提供 `withSetup` 輔助函式的寫法）。

**狀態管理**（vuejs.org/guide/scaling-up/state-management.html）：

- 簡單情境用自己寫的全域 `reactive()` store 就夠，並建議把修改封裝成具名 action 方法。
- **SSR 警告**：單例 store 會在多個請求間共用，造成跨請求狀態污染。
- 大型應用建議 Pinia（核心團隊維護，提供慣例、DevTools、HMR、SSR 支援）。

**版本政策**：官方說明 Vue 沒有固定發布週期，minor 版本約每 3 到 6 個月一次且必經 beta。

### 開發工具

| 工具 | 說明 |
| --- | --- |
| Vue - Official（VS Code） | 前身 Volar，取代 Vetur |
| vue-tsc | 命令列 SFC 型別檢查，用於 CI |
| Vue DevTools | Vue 3 需用新版，也可用 Vite 外掛形式嵌入 |
| eslint-plugin-vue | 使用 Vue 3 規則集 |
| Nuxt 4 | 需要 SSR、SSG 或全端時 |

UI 元件庫的 Vue 2 版本不能用在 Vue 3，要換對應版本（Element UI → Element Plus、Vuetify 2 → 3）。遷移既有專案時，這通常是工作量最大的一項。

### 自我檢查

- 能說出 composable 的五個撰寫慣例與原因，並解釋為什麼參數要接受 getter。
- 能說明模組層級狀態與函式內狀態的差別。
- 能列出 Vue CLI 到 Vite 的五項差異。
- 能寫出萬用路由與回傳值形式的導航守衛。
- 能說明 Pinia 與 Vuex 的差別與 `storeToRefs` 的用途。
