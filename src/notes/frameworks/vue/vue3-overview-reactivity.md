# Vue 3 總覽與響應式

> 以「Vue 2 怎麼寫、Vue 3 怎麼寫、為什麼改」的角度整理。範例預設用 `<script setup>`。版本資訊變動快，動手前用 `npm view vue version` 再確認。

## 從 Vue 2 到 Vue 3

### 版本現況（2026 年 10 月）

| 項目 | 現況 |
| --- | --- |
| Vue 穩定版 | 3.5.x |
| Vue 3.6 | Release Candidate，含 Vapor Mode 與 alien-signals 響應式核心，尚未正式發布 |
| Vue 2 | 2023-12-31 終止維護，最後版本 2.7.16 |
| 狀態管理 | Pinia 4（只支援 Vue 3，需 3.5.11 以上）；Vuex 進入維護狀態 |
| 路由 | Vue Router 5（對 4 的使用者沒有破壞性變更） |
| 建置工具 | Vite；Vue CLI 進入維護 |
| 全端框架 | Nuxt 4 |

### 心智模型的變化

| 面向 | Vue 2 | Vue 3 |
| --- | --- | --- |
| 應用程式實例 | 全域 `Vue`，設定污染所有實例 | `createApp()` 產生獨立 app |
| 響應式實作 | `Object.defineProperty`，無法偵測新增屬性與陣列索引 | `Proxy`，可偵測新增、刪除、索引、Map / Set |
| 邏輯組織 | Options API，依選項類型分散 | Composition API，依功能聚合（Options API 仍可用） |
| 邏輯重用 | mixins | composables |
| 元件根節點 | 只能一個 | 可多個（Fragments） |
| 全域 API | 掛在 `Vue` 上 | 具名匯出，可 tree-shaking |
| TypeScript | 可整合，但推導限制較多；不必使用 class component | 原生支援 |
| 建置工具 / 狀態管理 | Vue CLI / Vuex | Vite / Pinia |
| 瀏覽器 | 含 IE11 | 不支援 IE11 |

建立專案：`npm create vue@latest`（create-vue，以 Vite 為基礎，可勾選 TypeScript、Router、Pinia、Vitest、ESLint）。

### 應用程式入口

```js
// Vue 2
new Vue({ router, store, render: (h) => h(App) }).$mount('#app')

// Vue 3
import { createApp } from 'vue'
import { createPinia } from 'pinia'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.component('BaseButton', BaseButton)
app.mount('#app')
```

所有掛在 `Vue` 上的設定都移到 app 實例。好處：同頁可有多個互不干擾的應用，測試不互相污染。`app.mount` 是渲染到目標元素「裡面」，Vue 2 是「取代」該元素。

| Vue 2 全域 API | Vue 3 對應 |
| --- | --- |
| `Vue.use` / `component` / `directive` | `app.use` / `app.component` / `app.directive` |
| `Vue.mixin` | `app.mixin`（不建議） |
| `Vue.prototype.$x` | `app.config.globalProperties.$x`，或 `app.provide` |
| `Vue.config.errorHandler` | `app.config.errorHandler` |
| `Vue.nextTick` / `Vue.observable` | `import { nextTick, reactive } from 'vue'` |
| `Vue.set` / `Vue.delete` | 已移除，直接賦值或 `delete` |
| `Vue.extend` / `Vue.filter` | 已移除（改用 `defineComponent` / 函式） |

## 破壞性變更總表

### 模板與指令

| 項目 | Vue 2 | Vue 3 |
| --- | --- | --- |
| 元件 `v-model` | prop `value`、事件 `input` | prop `modelValue`、事件 `update:modelValue` |
| `.sync` | `:title.sync="x"` | 已移除，改 `v-model:title="x"` |
| `model` 選項 | 自訂 prop 與事件名 | 已移除，改 `v-model:參數` |
| `v-if` 與 `v-for` 同用 | `v-for` 優先 | **`v-if` 優先**，讀不到迴圈變數 |
| `<template v-for>` 的 key | 寫在子元素 | 寫在 `<template>` 上 |
| `v-if` / `v-else` 的 key | 手動加 | 自動產生 |
| `.native` | 監聽根元素原生事件 | 已移除，未宣告在 `emits` 的監聽器自動落到根元素 |
| 按鍵修飾符 | 可用 keyCode | 只能用名稱，如 `@keyup.enter` |
| filters | `{{ price \| currency }}` | 已移除 |
| `slot` / `slot-scope` | 2.6 起棄用 | 已移除，只能 `v-slot` / `#` |
| 非布林屬性值為 `false` | 移除該屬性 | 渲染為 `attr="false"`，要移除用 null / undefined；disabled 等布林屬性仍依布林規則處理 |

### 元件與實例

| 項目 | Vue 2 | Vue 3 |
| --- | --- | --- |
| `$on` / `$off` / `$once` | 可做 event bus | 已移除 |
| `$listeners` | 獨立物件 | 併入 `$attrs` |
| `$attrs` | 不含 class / style | 含 class、style 與事件監聽器 |
| `$children` | 可用 | 已移除，改模板 ref |
| `$scopedSlots` | 獨立物件 | 併入 `$slots`，全是函式 |
| `$set` / `$delete` / `$destroy` | 可用 | 已移除（`app.unmount()`） |
| `data` | 根實例可為物件 | 一律函式 |
| mixin 的 `data` 合併 | 深層 | 淺層 |
| 非同步元件 | `() => import(...)` | 要 `defineAsyncComponent`（路由例外） |
| 函式型元件 | `functional: true` | 純函式 |
| render function | `render(h)` | `import { h } from 'vue'`，props 結構攤平 |
| 監聽陣列 | 變異方法會觸發 | 只在整個取代時觸發，變異要 `deep: true` |

### 生命週期、指令鉤子與轉場

| Vue 2 | Vue 3 Options | Vue 3 Composition |
| --- | --- | --- |
| `beforeCreate` / `created` | 同名 | 不需要，`setup` 即是 |
| `beforeMount` / `mounted` | 同名 | `onBeforeMount` / `onMounted` |
| `beforeUpdate` / `updated` | 同名 | `onBeforeUpdate` / `onUpdated` |
| `beforeDestroy` / `destroyed` | `beforeUnmount` / `unmounted` | `onBeforeUnmount` / `onUnmounted` |
| `activated` / `deactivated` / `errorCaptured` | 同名 | `onActivated` / `onDeactivated` / `onErrorCaptured` |

| Vue 2 指令鉤子 | Vue 3 |
| --- | --- |
| `bind` / `inserted` | `beforeMount` / `mounted` |
| `update` / `componentUpdated` | `updated`（`update` 已移除） |
| `unbind` | `unmounted`；新增 `created`、`beforeUpdate`、`beforeUnmount` |

轉場 class：`v-enter` → `v-enter-from`，`v-leave` → `v-leave-from`，其餘不變。`<TransitionGroup>` 不再預設渲染 `<span>`，需要用 `tag`。

## Composition API 與 script setup

### 為什麼需要它

Options API 依「選項類型」分類，一個功能的 data、computed、methods、watch 散落各處，元件一大就難讀。重用只能靠 mixins，而 mixins 有三個問題：

- **來源不明**：模板裡的屬性看不出來自哪個 mixin。
- **命名衝突**：同名屬性後者靜默覆蓋前者。
- **隱性耦合**：mixin 之間透過 `this` 互相依賴。

Composition API 讓你依「功能」組織程式碼，並把邏輯抽成普通函式重用。

### 兩種寫法對照

```vue
<script setup>
import { ref, computed, watch, onMounted } from 'vue'

const props = defineProps({ initial: { type: Number, default: 0 } })
const emit = defineEmits(['change'])

const count = ref(props.initial)
const double = computed(() => count.value * 2)

watch(count, (value) => emit('change', value))
onMounted(() => console.log('mounted'))

function increment() { count.value++ }
</script>

<template>
  <button @click="increment">{{ count }} / {{ double }}</button>
</template>
```

- 沒有 `this`：狀態是變數，方法是函式。
- 響應式狀態用 `ref()`，script 中用 `.value`，模板中自動解包。
- 生命週期是 `onXxx` 函式，可呼叫多次。
- 頂層宣告的變數、函式、import 的元件，模板直接可用，不需 `return` 或 `components`。

### `<script setup>` 與 `setup()` 的關係

`<script setup>` 是 `setup()` 的編譯期語法糖（少寫程式碼、執行期效能更好、型別推導更完整）。沒有糖時要在 `setup(props, { emit, attrs, slots, expose })` 裡 `return { count, increment }` 模板才能用。除非要與 Options API 混用，一律用 `<script setup>`。

`setup` 在 `beforeCreate` 之前、**每個元件實例只執行一次**。這是和 React hooks 最大的不同：不會每次渲染重跑，不需像 React effect 一樣手動維護依賴陣列；但若先把響應式值存成普通變數，再交給非同步回呼，仍可能使用過期資料。

### Options → Composition 對照

| Options API | Composition API |
| --- | --- |
| `data()` | `ref()`、`reactive()` |
| `computed` / `methods` / `watch` | `computed()` / 普通函式 / `watch()`、`watchEffect()` |
| `props` / `emits` | `defineProps()` / `defineEmits()` |
| `this.$refs.x` | `useTemplateRef('x')` |
| `this.$attrs` / `$slots` | `useAttrs()` / `useSlots()` |
| `this.$router` / `$route` / `$store` | `useRouter()` / `useRoute()` / `useXxxStore()` |
| `provide` / `inject` 選項 | `provide()` / `inject()` |
| `mixins` | composables |
| `name`、`inheritAttrs` | `defineOptions()` |
| 父用 ref 存取子成員 | 子必須 `defineExpose()` 公開 |

### 編譯器巨集與生命週期

巨集不需 import，只能在 `<script setup>` 頂層使用：`defineProps`、`defineEmits`、`defineExpose`、`withDefaults`（3.2）、`defineOptions`、`defineSlots`（3.3）、`defineModel`（3.4）。

生命週期注意：

- 鉤子必須在 `setup` **同步**執行期間註冊，Vue 靠「目前正在執行 setup 的實例」決定鉤子歸屬。寫在 `setTimeout` 回呼或 `setup()` 函式的 `await` 之後會失敗。
- 例外：`<script setup>` **頂層** `await`，編譯器會在每個 await 後還原實例，後面的鉤子仍有效；巢狀函式裡的 await 之後一樣失效。
- 同一鉤子可註冊多次，依序執行，讓每個 composable 管理自己的清理。
- 頂層 `await` 會讓元件變非同步元件，必須搭配 `<Suspense>`。

## ref、reactive 與解包

### 從 defineProperty 到 Proxy

Vue 2 初始化時遍歷 `data` 加 getter/setter，造成以下操作都不會觸發更新：

```js
this.user.age = 30        // 原本不存在的屬性
delete this.user.name
this.items[0] = newItem   // 索引賦值
this.items.length = 0
```

所以才需要 `$set` / `$delete`。Vue 3 用 `Proxy` 攔截整個物件，四種寫法全部可用，Map / Set 也能追蹤。另外響應式轉換是**惰性**的，巢狀物件被存取時才轉 Proxy，大型資料初始化成本降低。

### `ref` 與 `reactive`

```js
const count = ref(0)
const user = ref({ name: 'Joe', tags: [] })
count.value++                 // script 中要 .value
user.value.name = 'Amy'       // 內部深層響應式
user.value = { name: 'Bob', tags: [] }  // 可整個取代

const state = reactive({ count: 0, user: { name: 'Joe' } })
state.count++                 // 不需要 .value
```

`ref` 需要 `.value` 是因為 JS 無法攔截基本型別變數的讀寫，必須用物件包起來，由 getter / setter 做依賴追蹤。

`reactive` 的三個限制：

```js
// 一：只能用於物件、陣列、Map、Set
reactive(0)                          // 無效
// 二：不能整個取代，會失去連結
let state = reactive({ count: 0 })
state = reactive({ count: 1 })       // 普通變數重新賦值不會通知原有依賴；持有舊 Proxy 的使用端也不會自動切換
// 三：解構後失去響應性
const { count } = state              // 只是普通數字
```

**該用哪個**：官方建議以 `ref` 為主（無上述限制、行為一致、`.value` 一眼看出響應式變數）。`reactive` 適合關聯緊密、不會被整個取代的狀態，如表單。

### 解包規則

| 情境 | 自動解包？ |
| --- | --- |
| 模板中的頂層 ref `{{ count }}` | 是 |
| 模板中物件屬性裡的 ref `{{ obj.count + 1 }}` | 否（得到 `[object Object]1`） |
| ref 作為 `reactive` 物件的屬性 | 是 |
| ref 放在 `reactive` 陣列或 Map 裡 | 否 |
| script 中 | 否，一律 `.value` |

### toRef、toRefs、toValue

```js
const state = reactive({ count: 0, name: 'Joe' })

const { count, name } = toRefs(state)   // 解構後仍有響應性
const nameRef = toRef(state, 'name')
const upper = toRef(() => state.name.toUpperCase())  // getter → 唯讀 ref（3.3）

toValue(count)             // ref → 值
toValue(() => state.name)  // getter → 值
toValue(42)                // 一般值 → 值
```

`toRefs` 常用在 composable 回傳 `reactive` 物件；`toValue` 用在 composable 參數，讓呼叫端可傳 ref、getter 或一般值。

## computed、watch 與進階 API

### computed

```js
const total = computed(() => price.value * qty.value)   // 唯讀 ref

const fullName = computed({                              // 可寫
  get: () => `${first.value} ${last.value}`,
  set: (v) => { [first.value, last.value] = v.split(' ') },
})
```

getter 必須是純函式，不要修改狀態或發請求。3.4 起 getter 會收到前一次的值。

### watch

來源有四種形式：

```js
watch(count, (value, old) => {})                          // ref
watch(() => state.page, (page) => {})                     // getter
watch(state, (value) => {})                               // reactive：自動深層
watch([count, () => state.page], ([c, p], [oc, op]) => {})  // 多來源
```

最常見錯誤：

```js
watch(state.page, () => {})        // 錯：傳進去的只是數字
watch(() => state.page, () => {})  // 對
```

選項：`immediate`、`deep`（3.5 起可傳數字指定深度）、`once`（3.4）、`flush`。

| `flush` | 時機 | 用途 |
| --- | --- | --- |
| `'pre'`（預設） | 元件更新前 | 一般情況 |
| `'post'` | 元件更新後 | 需讀更新後的 DOM |
| `'sync'` | 同步 | 少用，失去批次 |

getter 回傳物件時，預設只在物件被「取代」時觸發，要偵測內部變化必須加 `deep`。3.5 起 `watch` 回傳 `{ stop, pause, resume }`。

在 `setup` 同步階段建立的 watcher 會在元件卸載時自動停止；在 `setTimeout` 或 `setup()` 的 `await` 之後建立的不會，要手動 `stop()`（`<script setup>` 頂層 await 例外）。

### watchEffect 與清理副作用

```js
watchEffect(async () => {
  const res = await fetch(`/api/users/${userId.value}`)   // userId 在 await 前讀，會被追蹤
  user.value = await res.json()
})
```

| | `watch` | `watchEffect` |
| --- | --- | --- |
| 依賴來源 | 明確指定 | 自動追蹤 |
| 首次執行 | 預設不執行 | 立刻執行 |
| 取得舊值 | 可以 | 不行 |
| 適用 | 精確控制觸發條件 | 依賴多、想簡潔 |

陷阱：`watchEffect` 只追蹤**第一個 `await` 之前**同步讀取的資料。

清理（取消上一次的非同步工作）有兩種寫法：

```js
// 寫法一：回呼的第三個參數
watch(userId, async (id, oldId, onCleanup) => {
  const controller = new AbortController()
  onCleanup(() => controller.abort())
  const res = await fetch(`/api/users/${id}`, { signal: controller.signal })
  user.value = await res.json()
})

// 寫法二：onWatcherCleanup（3.5），必須在回呼同步階段呼叫
import { onWatcherCleanup } from 'vue'
watch(userId, (id) => {
  const controller = new AbortController()
  onWatcherCleanup(() => controller.abort())
  fetch(`/api/users/${id}`, { signal: controller.signal })
})
```

### nextTick 與進階 API

狀態變更後 DOM 不會立刻更新（同一輪批次處理），要在更新後執行：`await nextTick()`。

| API | 用途 |
| --- | --- |
| `shallowRef` | 只追蹤 `.value` 取代，適合大型不可變資料或第三方實例（圖表、地圖） |
| `shallowReactive` | 只有第一層是響應式 |
| `triggerRef` | 手動觸發 shallowRef 更新 |
| `readonly` | 唯讀代理，常用於 provide 給子孫 |
| `markRaw` / `toRaw` | 標記永不轉響應式 / 取回原始物件 |
| `customRef` | 自訂追蹤與觸發，例如防抖 ref |
| `effectScope` | 集中管理一組 effect，主要給函式庫 |

```js
const rows = shallowRef([])
rows.value = await fetchLargeList()   // 整個取代會觸發
rows.value.push(item)                 // 不會觸發

export function useDebouncedRef(value, delay = 300) {
  let timer
  return customRef((track, trigger) => ({
    get() { track(); return value },
    set(v) {
      clearTimeout(timer)
      timer = setTimeout(() => { value = v; trigger() }, delay)
    },
  }))
}
```

## 官方觀點補充

### Composition API 的官方理由與 React Hooks 比較

依官方 Composition API FAQ（vuejs.org/guide/extras/composition-api-faq.html）：

- 採用理由：透過 composables 重用邏輯、依關注點彈性組織程式碼、更好的 TypeScript 推導、更小的打包體積（`<script setup>` 的模板直接內聯編譯，沒有實例代理）。
- **Options API 沒有被棄用**，官方表示沒有這個計畫；Class API 則不再建議。只用 Composition API 時可用編譯期旗標把 Options API 從打包中移除。
- Composition API 不是函式式程式設計，它建立在 Vue 可變、細粒度的響應式之上。

與 React Hooks 的差異：

| | React Hooks | Vue Composition API |
| --- | --- | --- |
| 執行次數 | 元件每次渲染重跑 | `setup` 只執行一次 |
| 閉包與依賴管理 | effect 等 API 需正確宣告依賴 | 響應式讀取自動追蹤；捕捉普通值仍可能過期 |
| 呼叫順序 | 敏感，不能放在條件式裡 | 不敏感，可條件呼叫 |
| 子元件避免重渲染 | 需要 `useMemo` / `useCallback` | 不需要，細粒度追蹤 |

### 官方對 ref / reactive 的說法

官方文件明確寫「建議以 `ref()` 作為宣告響應式狀態的主要 API」。`reactive()` 的限制（僅物件型別、不能整個取代、解構失去響應性）與原稿一致。另外：

- `reactive(raw) !== raw`，修改原始物件不會觸發更新；巢狀物件也會被代理。
- ref 在 `shallowReactive` 中不解包；模板運算式通常只解包頂層 ref；文字插值另有便利規則：最終結果本身是 ref 時，{{ obj.count }} 也顯示其值，但 {{ obj.count + 1 }} 不會先解包巢狀 ref 再相加。
- 外部狀態（例如 Immer 產生的不可變資料）建議搭配 `shallowRef`。
- DOM 更新會批次到 `nextTick`。

## 常見陷阱

### 響應性失效整理

| 陷阱 | 錯誤寫法 | 正確寫法 |
| --- | --- | --- |
| script 中忘記 `.value` | `if (count > 0)` | `if (count.value > 0)` |
| 解構 `reactive` | `const { page } = state` | `const { page } = toRefs(state)` |
| 取代 `reactive` | `state = reactive({...})` | `Object.assign(state, {...})` 或改用 `ref` |
| watch 傳屬性值 | `watch(state.page, cb)` | `watch(() => state.page, cb)` |
| 把 `.value` 當參數傳 | `useFetch(url.value)` | `useFetch(url)`，內部 `toValue` |
| Proxy 與原物件比較 | `reactive(obj) === obj` 為 false | 一律操作 Proxy |
| await 後才讀依賴 | `watchEffect` 內先 await 再讀 | 在 await 前讀，或改用 `watch` |

### 自我檢查

- 能解釋 `ref` 為什麼需要 `.value`。
- 能列出 `reactive` 的三個限制。
- 能說出解包規則表的五種情境。
- 能說明 `watch` 與 `watchEffect` 的差異。
- 能解釋為什麼 `watch(state.page, cb)` 無效。
- 能寫出取消過期請求的清理程式碼。
