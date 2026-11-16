# Vue 2 遷移與學習路線

## 遷移策略

### 為什麼要遷移

Vue 2 已於 2023-12-31 終止維護，不再有安全性修補與瀏覽器相容性更新，周邊套件也陸續停止支援（例如 Pinia 3 起只支援 Vue 3）。繼續留在 Vue 2 的成本逐年上升。

### 三種策略

| 策略 | 做法 | 適合 | 風險 |
| --- | --- | --- | --- |
| 漸進升級 | 先升到 Vue 2.7 清理舊寫法，再經 migration build 切到 Vue 3 | 中大型、仍持續開發的專案 | 時程長，需要紀律 |
| Migration build 直接切換 | 直接換 `@vue/compat`，依警告逐一修正 | 依賴少、測試完整 | UI 元件庫可能不相容 |
| 重寫或逐頁替換 | 新專案用 Vue 3，舊頁面逐步搬 | 技術債過高、或正好要改版 | 成本最高，並存期維護兩套 |

多數情況建議第一種。

## 漸進升級步驟

### 步驟 1～2：盤點與升級到 2.7

**步驟 1：盤點依賴。** 列出所有直接依賴 Vue 的套件，確認有無 Vue 3 版本。UI 元件庫是關鍵，沒有 Vue 3 版或升級幅度很大時，先評估替換成本。

**步驟 2：升級到 Vue 2.7。** 2.7 把 Composition API 與 `<script setup>` 移植回 Vue 2，可在不換大版本下先改寫。此階段可完成：

- mixins → composables；filters → 函式；event bus → store 或 provide / inject
- `slot` / `slot-scope` → `v-slot`
- 整理 `beforeDestroy` / `destroyed` 邏輯、移除 `$children`
- Vue CLI → Vite；Vuex → Pinia 2（支援 Vue 2.7）

注意 2.7 移植的**只有 API**，響應式底層仍是 `Object.defineProperty`：新增屬性與索引賦值仍需 `$set`，`reactive()` 回傳的是原物件而非 Proxy，Map / Set 無法追蹤。`$set` / `$delete` 要到切換 Vue 3 之後才能移除。

### 步驟 3～6：切換與收尾

**步驟 3：切換到 Vue 3 + migration build。** `@vue/compat` 是可設為 Vue 2 行為模式的 Vue 3 建置，遇到不相容用法時在主控台警告：

```js
// vite.config.js
export default defineConfig({
  resolve: { alias: { vue: '@vue/compat' } },
  plugins: [vue({ template: { compilerOptions: { compatConfig: { MODE: 2 } } } })],
})
```

同時把入口改成 `createApp`，並升級 Vue Router、Pinia、測試工具。

**步驟 4：依警告逐一修正。** 每類警告有代號，修完一類就可關閉該項相容行為。

**步驟 5：元件逐一切到 Vue 3 模式。** 個別元件設 `compatConfig: { MODE: 3 }`，確認純 Vue 3 行為正常。

**步驟 6：移除 migration build。** 警告清完後拿掉別名與 `compatConfig`，換回正式 `vue`。

Migration build 的限制：依賴 Vue 2 內部 API 的套件無法運作，多數 Vue 2 版 UI 元件庫都屬此類。它是過渡工具，不應長期留在正式環境。

## 遷移檢查清單

### 應用程式層級

- [ ] `new Vue()` → `createApp()`
- [ ] `Vue.use` / `component` / `directive` → app 實例方法
- [ ] `Vue.prototype` → `app.config.globalProperties` 或 `app.provide`
- [ ] 環境變數前綴 `VUE_APP_` → `VITE_`
- [ ] `require` / `require.context` → `import` / `import.meta.glob`

### 元件層級

- [ ] 元件 `v-model`：`value` / `input` → `modelValue` / `update:modelValue`
- [ ] `.sync` → `v-model:名稱`
- [ ] 所有自訂事件宣告在 `emits`；移除 `.native`
- [ ] `$listeners` 併入 `$attrs`，檢查 `class` / `style` 套用位置
- [ ] `beforeDestroy` / `destroyed` → `beforeUnmount` / `unmounted`
- [ ] 移除 `$set`、`$delete`、`$on`、`$off`、`$once`、`$children`
- [ ] filters → 函式或 computed
- [ ] 檢查同一元素上 `v-if` 與 `v-for` 並用處（優先順序反了）
- [ ] `<template v-for>` 的 key 移到 `<template>`
- [ ] 非同步元件改 `defineAsyncComponent`
- [ ] 自訂指令鉤子改名；轉場 class `-enter` / `-leave` → `-enter-from` / `-leave-from`
- [ ] `>>>`、`/deep/`、`::v-deep` → `:deep()`
- [ ] 監聽陣列的 watcher 視需要加 `deep: true`

### 生態系

- [ ] Vue Router：`createRouter`、history 模式、萬用路由、守衛改用回傳值
- [ ] Vuex → Pinia
- [ ] 測試：VTU 2（`propsData` → `props`、`createLocalVue` → `global.plugins`）
- [ ] UI 元件庫換 Vue 3 版本
- [ ] 編輯器擴充從 Vetur 換 Vue - Official

## 版本時間線與學習路線

### Vue 3 各版本重點

| 版本 | 發布 | 重點 |
| --- | --- | --- |
| 3.0 | 2020-09 | Composition API、Proxy 響應式、Teleport、Fragments、Suspense（實驗性） |
| 3.1 | 2021-06 | Migration build（`@vue/compat`） |
| 3.2 | 2021-08 | `<script setup>` 正式、CSS `v-bind()`、`v-memo`、`effectScope` |
| 3.3 | 2023-05 | `defineOptions`、`defineSlots`、泛型元件、`toValue` |
| 3.4 | 2023-12 | `defineModel` 正式、同名簡寫 `:id`、`watch` 的 `once` |
| 3.5 | 2024-09 | Props 解構、`useTemplateRef`、`useId`、`onWatcherCleanup`、Teleport `defer`、lazy hydration、響應式重構 |
| 3.6 | RC | Vapor Mode、alien-signals 核心 |

讀網路文章要留意日期：2021 年以前多半用 `setup()` 而非 `<script setup>`；2024-09 以前不會提到 `useTemplateRef` 與 props 解構。

### 五週學習路線

| 週 | 內容 | 產出 |
| --- | --- | --- |
| 1 | 總覽、Composition API | 改寫 `main.js`；一個 Vue 2 元件改成 `<script setup>` |
| 2 | 響應式、props / emits / v-model | 搜尋框與表單練習；`AmountInput` |
| 3 | slots、內建元件、composable 基礎 | `DataTable`、`Modal`；`useFetch` |
| 4 | 剩餘 composable、生態系 | 三個 composable；加入 Router 與 Pinia |
| 5 | TypeScript、效能、遷移 | 專題改 TS，`vue-tsc` 零錯誤；一份遷移評估 |

### 專題：交易查詢後台

| 頁面 | 功能 | 練到的重點 |
| --- | --- | --- |
| 登入 | 表單驗證、登入後導回原目標頁 | `reactive` 表單、導航守衛、Pinia |
| 交易清單 | 篩選、分頁、排序、條件同步到網址 | `useFetch`、`usePagination`、`watch`、`useRoute` |
| 交易明細 | 依路由參數載入、編輯備註 | 路由參數監聽、`defineModel`、樂觀更新 |
| 全域 | 通知、確認對話框、深色模式 | Teleport、provide / inject、共享狀態 composable |

技術要求：全部 `<script setup lang="ts">`；至少三個有單元測試的 composable；`DataTable` 是泛型元件、欄位以 slot 自訂；路由全懶載入、清單頁用 KeepAlive 保留篩選狀態；`vue-tsc` 與 ESLint 零錯誤。

### 總驗收

- 不查文件能寫出含 props、emits、`v-model`、slot 的 `<script setup>` 元件。
- 能解釋 `ref` 與 `reactive` 的差別與選擇原則，能指出響應性失效的原因。
- 能把 mixin 改成 composable 並說明好處。
- 能用 Pinia 與 Vue Router 現行 API 完成登入流程，並為元件、composable、store 寫測試。
- 能對一個 Vue 2 專案提出遷移策略、步驟與風險。

### 資源與校驗備註

| 資源 | 用途 |
| --- | --- |
| [Vue 官方文件](https://vuejs.org/) | 主要學習來源，API 偏好切到 Composition |
| [Vue 3 遷移指南](https://v3-migration.vuejs.org/) | 破壞性變更完整清單 |
| [Vue Router](https://router.vuejs.org/) / [Pinia](https://pinia.vuejs.org/) | 路由 / 狀態管理 |
| [Vitest](https://vitest.dev/) / [Vue Test Utils](https://test-utils.vuejs.org/) | 測試 |
| [VueUse](https://vueuse.org/) | Composable 集合 |
| [Vue SFC Playground](https://play.vuejs.org/) | 線上試寫，可看編譯結果 |

變動較快、建議優先核對：Vue 3.6 / Vapor Mode 的發布狀態與 API、Suspense 是否仍實驗性、Router 的 `next` 回呼是否已移除、vue-tsc 是否支援 TypeScript 7。原稿的範例已用 vue 3.5.43、vue-router 5.3.1、pinia 4.0.3、vitest 5.0.3 編譯與執行驗證（未在真實瀏覽器中驗證樣式與動畫、未量測效能數字）。
