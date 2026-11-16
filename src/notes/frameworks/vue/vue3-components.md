# Vue 3 元件

> 元件的觀念沒變，但 props、事件、`v-model`、`$attrs` 的細節幾乎都調整過。

## Props 與 Emits

### Props

```vue
<script setup>
const props = defineProps({
  title: { type: String, required: true },
  count: { type: Number, default: 0 },
  tags: { type: Array, default: () => [] },
})
</script>
```

型別宣告（需 `lang="ts"`），編譯器自動產生執行期檢查：

```vue
<script setup lang="ts">
interface Props { title: string; count?: number; tags?: string[] }
const props = defineProps<Props>()
</script>
```

預設值：3.5 之前用 `withDefaults(defineProps<Props>(), { count: 0, tags: () => [] })`；3.5 起可直接解構並用 JS 預設值（Reactive Props Destructure）：

```ts
const { title, count = 0, tags = [] } = defineProps<Props>()
```

解構出來的變數仍是響應式（編譯器改寫成 `props.count`），但**傳給 `watch` 或 composable 時必須包成 getter**：

```js
watch(count, () => {})       // 錯：編譯器直接報錯
watch(() => count, () => {}) // 對
useFetch(() => `/api/items?tag=${tags[0]}`)
```

Props 仍是單向資料流，子元件不應重新賦值；要改用事件或 v-model。物件與陣列的巢狀內容仍可能被修改，因為共用參考，通常也應交給父層更新。型別宣告產生的 prop 檢查不是完整資料驗證，不能取代 API 邊界驗證。

### Emits

建議**所有事件都宣告**：文件化、可驗證參數、決定監聽器是否落到根元素。

```vue
<script setup lang="ts">
const emit = defineEmits<{
  change: [id: number]
  submit: [payload: { amount: number; memo?: string }]
}>()
</script>
```

陣列寫法 `defineEmits(['change'])`；物件寫法可驗證（回傳 false 時開發環境警告）：`defineEmits({ submit: (p) => typeof p.amount === 'number' })`。一個元件只能呼叫一次 `defineEmits`。

## v-model、attrs 與 slots

### 元件 v-model

遷移時改動最多的地方：

| | Vue 2 | Vue 3 |
| --- | --- | --- |
| 預設 prop / 事件 | `value` / `input` | `modelValue` / `update:modelValue` |
| 自訂名稱 | `model` 選項 | `v-model:名稱` |
| 多個雙向綁定 | `.sync` | 多個 `v-model:名稱` |
| 自訂修飾符 | 不支援 | 支援 |

3.4 起用 `defineModel`，回傳 ref，讀到父層的值，寫入自動發事件：

```vue
<script setup>
const model = defineModel({ type: String, default: '' })
</script>
<template><input v-model="model" /></template>
```

注意：defineModel 的 default 不會主動寫回父層。若父層綁定未初始化的 ref，可能父層是 undefined、子層卻已有預設值。可在父層初始化，或依契約使用 required。多個 v-model 與自訂修飾符如下；兩段 script setup 分屬不同元件，不能放在同一個 SFC：

```vue
<script setup>
const start = defineModel('start', { required: true })
const end = defineModel('end', { required: true })
</script>
<!-- 父層 <DateRange v-model:start="from" v-model:end="to" /> -->
```

```vue
<script setup>
// 父層 <NameInput v-model.capitalize="name" />
const [model, modifiers] = defineModel({
  set(value) {
    return modifiers.capitalize && value
      ? value.charAt(0).toUpperCase() + value.slice(1)
      : value
  },
})
</script>
```

3.4 之前要手動：`defineProps({ modelValue: String })` + `emit('update:modelValue', $event.target.value)`。

### Fallthrough attributes 與多根節點

父層傳給元件、但沒宣告為 prop / emit 的屬性，自動套用到根元素。Vue 3 變化：

- `$attrs` 含 `class`、`style` 與所有未宣告的事件監聽器；`$listeners` 已併入。
- `.native` 已移除：沒在 `emits` 宣告的監聽器自動變成根元素的原生監聽器。

這是 `emits` 一定要宣告的原因：元件發出 `click` 卻沒宣告，父層 `@click` 會同時被當原生監聽器綁在根元素，**觸發兩次**。

關閉自動繼承並手動指定位置：

```vue
<script setup>
defineOptions({ inheritAttrs: false })
</script>
<template>
  <label class="field"><span>金額</span><input v-bind="$attrs" /></label>
</template>
```

`useAttrs()` 回傳的物件**不是響應式**，不能 watch。多根節點（Fragments）時 Vue 不知道 attrs 套哪裡會警告，必須 `v-bind="$attrs"` 明確指定。

### Slots

`v-slot`（`#`）是唯一寫法，`slot` 與 `slot-scope` 已移除。

```vue
<!-- DataTable.vue -->
<tbody>
  <tr v-for="row in rows" :key="row.id">
    <slot name="row" :row="row">{{ row.id }}</slot>
  </tr>
  <tr v-if="!rows.length"><slot name="empty">沒有資料</slot></tr>
</tbody>

<!-- 使用 -->
<DataTable :rows="txns">
  <template #row="{ row }"><td>{{ row.date }}</td><td>{{ row.amount }}</td></template>
</DataTable>
```

`$scopedSlots` 併入 `$slots`，全是函式；script 中用 `useSlots()`，判斷是否有傳入用 `v-if="$slots.footer"`。TS 可用 `defineSlots<{ row(props: { row: Txn }): any }>()` 宣告參數型別。

## ref、Provide / Inject 與動態元件

### 模板 ref 與 defineExpose

3.5 起用 `useTemplateRef`：

```vue
<script setup>
import { useTemplateRef, onMounted } from 'vue'
const inputEl = useTemplateRef('amount')
onMounted(() => inputEl.value.focus())
</script>
<template><input ref="amount" /></template>
```

優點：模板 ref 與一般狀態不混淆，能放進 composable；傳入的是註冊時的字串 key，不會自動追蹤 key 變化，動態管理節點可用函式 ref。舊寫法（宣告同名 ref 變數）仍可用。

`<script setup>` 元件預設**封閉**，父層用 ref 什麼都拿不到，必須 `defineExpose({ open, close })` 公開。`v-for` 中的 ref 得到陣列，但不保證順序與來源陣列一致。

### Provide / Inject

綁定本身不是響應式，但提供的值若是響應式物件，子孫讀到的就會更新。Vue 3 可直接提供 ref，任何型別都適用：

```js
// 祖先
const theme = ref('light')
const toggle = () => (theme.value = theme.value === 'light' ? 'dark' : 'light')
provide('theme', { theme: readonly(theme), toggle })   // 唯讀狀態 + 修改方法，修改集中在提供者

// 子孫
const { theme, toggle } = inject('theme')
```

全應用範圍用 `app.provide(key, value)`，這也是取代 `Vue.prototype.$x` 的建議做法。大型專案用 `Symbol` 當 key，TS 用 `InjectionKey`。

### 動態元件與非同步元件

`<script setup>` 中 `<component :is>` 要傳元件本身而非字串，元件物件用 `shallowRef` 避免被深層代理：

```js
const current = shallowRef(TabA)
```

非同步元件必須用 `defineAsyncComponent` 包起來（路由元件例外，仍直接寫 `() => import(...)`）：

```js
const HeavyChart = defineAsyncComponent({
  loader: () => import('./HeavyChart.vue'),
  loadingComponent: LoadingSpinner,
  errorComponent: LoadError,
  delay: 200,
  timeout: 10000,
})
```

### 官方補充：Provide / Inject 與非同步元件細節

**Provide / Inject**（vuejs.org/guide/components/provide-inject.html）：

- 同名 key 時**最近的祖先**勝出；注入在元件自己的 `data()` 之前解析。
- 注入的 ref **不會**自動解包；提供 `computed` 可得到響應式注入。
- 預設值若要用工廠函式，必須傳第三個參數 `true`：`inject('key', () => new X(), true)`。
- 函式庫建議把 `Symbol` key 放在獨立檔案匯出。
- 建議模式：狀態的修改留在提供者，並提供更新函式；用 `readonly()` 防止注入端直接改。

**非同步元件**（vuejs.org/guide/components/async.html）：

- `defineAsyncComponent` 選項：`loader`、`loadingComponent`、`delay`（預設 200ms）、`errorComponent`、`timeout`（預設 Infinity）。
- 在 `<Suspense>` 底下，非同步元件預設是「可被 Suspense 接管」的，**自己的 loading / error / delay / timeout 選項會被忽略**；要自己處理請設 `suspensible: false`。
- 延遲 hydration（3.5+，僅 SSR）：`hydrateOnIdle`、`hydrateOnVisible`、`hydrateOnMediaQuery`、`hydrateOnInteraction`，也可自訂策略；各自單獨匯入以利 tree-shaking。

**Suspense**（vuejs.org/guide/built-ins/suspense.html）官方原文仍標示為實驗性功能，不保證會成為穩定功能且 API 可能變動。它沒有內建錯誤處理，要在父層用 `onErrorCaptured`。`#default` 與 `#fallback` 各只接受一個直接子節點；事件有 `pending`、`resolve`、`fallback`；只有 `#default` 的根節點被替換時才會重新進入 pending；巢狀 Suspense 需 3.3 以上。

## 指令、Render function 與樣式

### 自訂指令

鉤子名稱與元件生命週期一致。`<script setup>` 中以 `v` 開頭的駝峰變數自動成為指令：

```vue
<script setup>
const vFocus = { mounted: (el) => el.focus() }
const vColor = (el, binding) => { el.style.color = binding.value }  // 只需 mounted + updated 時可簡寫
</script>
<template><input v-focus /><p v-color="'tomato'">文字</p></template>
```

全域註冊：`app.directive('focus', { mounted: (el) => el.focus() })`。

### Render function

日常仍以模板為主。主要變更：`h` 從 `vue` 匯入；props 結構攤平（不再分 `attrs`、`on`、`domProps`），事件用 `onXxx`；slots 都是函式。

```js
import { h } from 'vue'
export default {
  setup(props, { slots }) {
    return () => h('div', { class: 'box', id: 'a', onClick }, slots.default?.())
  },
}
```

函式型元件變成單純函式（`const Heading = (props, { slots }) => h(...)`）。Vue 3 有狀態元件效能已接近函式型，除非很簡單的包裝，不需特地使用。

### SFC 樣式功能

```vue
<style scoped>
.title { color: v-bind(color); }                 /* CSS 綁定響應式狀態（3.2） */
.wrapper :deep(.el-input__inner) { border-radius: 0; }  /* 取代 >>>、/deep/、::v-deep */
:slotted(p) { margin: 0; }                       /* 選取 slot 傳入的內容 */
:global(.dark) .title { color: white; }          /* scoped 內寫全域規則 */
</style>
```

### 泛型元件

3.3 起 `<script setup>` 支援泛型參數，適合表格、下拉這類通用元件：

```vue
<script setup lang="ts" generic="T extends { id: string | number }">
defineProps<{ items: T[]; selected?: T }>()
defineEmits<{ select: [item: T] }>()
</script>
```

`T` 會從 `items` 自動推導，`select` 事件參數也有正確型別。

## 內建元件

### Teleport

把模板的一部分渲染到 DOM 其他位置，同時保留元件邏輯階層，解決彈窗受父層 `overflow`、`z-index`、`transform` 影響。

```vue
<Teleport to="body">
  <div v-if="open" class="modal">…</div>
</Teleport>
```

- `to` 接受 CSS 選擇器或 DOM 元素；`:disabled` 可條件停用，內容留在原位。
- 目標元素必須在 Teleport 掛載前存在；3.5 起 defer 可等待同一次掛載 / 更新週期稍後渲染的目標，不能等待數秒後才出現的目標。
- props、事件、provide/inject 依邏輯階層運作，不受 DOM 位置影響。

### Suspense

協調非同步依賴，在全部就緒前顯示備用內容。**到 3.5 為止仍標示實驗性**，API 可能變動。

```vue
<Suspense>
  <UserProfile />        <!-- 內有頂層 await -->
  <template #fallback>載入中…</template>
</Suspense>
```

錯誤要在父層用 `onErrorCaptured` 攔截。不想依賴實驗性功能時，用 `v-if` + loading 狀態或資料請求函式庫。

### Transition 與 TransitionGroup

```css
.fade-enter-from, .fade-leave-to { opacity: 0; }      /* Vue 3：-from，不再是 v-enter / v-leave */
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
```

`<TransitionGroup>` 不再預設渲染 `<span>`，用 `tag="ul"` 指定；`<Transition>` slot 內只能有單一根元素（內容是元件時，該元件也須單根）。

### KeepAlive

快取被切換掉的元件實例，搭配 `onActivated` / `onDeactivated`：

```vue
<KeepAlive :include="['TxnList']" :max="10"><component :is="current" /></KeepAlive>
```

`include` / `exclude` 依元件 `name` 比對（`<script setup>` 自動以檔名當 name，或 `defineOptions({ name })`）。與 Vue Router 搭配，寫法改用 `RouterView` 的 slot：

```vue
<RouterView v-slot="{ Component }">
  <Transition name="fade" mode="out-in">
    <KeepAlive :include="['TxnList']">
      <component :is="Component" />
    </KeepAlive>
  </Transition>
</RouterView>
```

### 自我檢查

- 能寫出 `v-model` 在 3.4 前後的兩種實作。
- 能解釋為什麼解構後的 prop 傳給 `watch` 要包 getter。
- 能解釋不宣告 `emits` 的後果、`$attrs` 在 Vue 3 包含什麼。
- 能說明 `<script setup>` 為什麼需要 `defineExpose`。
- 能說明 Teleport 解決什麼問題，以及 Transition / KeepAlive / RouterView 的正確巢狀順序。
