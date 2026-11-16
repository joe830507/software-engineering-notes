# 問題排查與工程實務

> 資深面試看的不是你知道多少 API，而是**遇到問題時的思路**：先量測、再假設、再驗證，並且能說出取捨。回答時用「現象 → 排查步驟 → 根因 → 修正 → 預防」的結構。

## 效能與記憶體問題

### 點按鈕後要卡一兩秒才有反應

1. **重現與量測**：用 Chrome DevTools 的 Performance 面板錄製操作，看主執行緒上有沒有超過 50 毫秒的**長任務**；同時看真實使用者監控（RUM）的 INP 數據，確認影響範圍，是全部使用者還是低階手機。
2. **找出長任務的來源**：展開火焰圖，看是哪個函式佔用時間。常見原因：
   - 點擊後同步處理大量資料（排序、過濾幾萬筆）。
   - 一次渲染上千個 DOM 節點，或觸發 layout thrashing。
   - 框架層面不必要的重新渲染：狀態放得太高，整棵元件樹都重新渲染。
   - 第三方腳本（廣告、追蹤）佔用主執行緒。
3. **修正**：
   - 先給回饋，後做重活：先更新按鈕狀態（loading），再用 `scheduler.yield()` 或 `setTimeout` 讓出主執行緒，讓瀏覽器有機會繪製。
   - 把大工作切塊，或移到 Web Worker。
   - 長列表用虛擬捲動；React 用 `memo`、`useMemo`、`useTransition` 把非緊急更新降低優先順序。
4. **預防**：在 CI 加入效能預算（Lighthouse CI），正式環境持續監控 INP。

### 單頁應用用久了越來越慢，最後分頁當掉

1. **確認是洩漏**：用 Performance 面板勾選 Memory 錄製，重複進出同一個頁面多次，觀察 JS heap 是否呈現**鋸齒狀但持續上升**（垃圾回收後的底部一直變高）。
2. **找出洩漏的物件**：Memory 面板做三次 heap snapshot（操作前、操作一次、操作多次），用 Comparison 檢視新增卻沒被回收的物件；篩選 `Detached` 可以找到脫離 DOM 卻還被引用的節點。點選物件看 **Retainers**（保留路徑），找出是誰抓住它。
3. **常見根因**：全域事件監聽沒移除、`setInterval` 沒清除、WebSocket 或訂閱沒取消、全域的 store 或快取無限成長、閉包抓住了大物件。
4. **修正與預防**：所有訂閱都要在卸載時清理，用 `AbortController` 統一管理；快取設上限；Code review 時檢查「有 `addEventListener` 就要有對應的移除」；在 E2E 測試中做基本的記憶體回歸檢查。

## 錯誤與非同步問題

### 正式環境大量 `Cannot read properties of undefined`，開發環境重現不了

1. **先把錯誤看清楚**：錯誤監控（Sentry 這類工具）要上傳 **source map**，才能把壓縮後的堆疊對應回原始碼位置；看錯誤集中在哪些瀏覽器、版本、頁面、使用者操作路徑（breadcrumbs）。
2. **常見根因**：
   - 後端回應的資料結構和預期不同（欄位是 null、陣列是空的、API 版本不一致）。
   - 競爭條件：資料還沒載入完使用者就操作；或舊的請求比新的請求晚回來，覆蓋了新資料。
   - 部署時新舊版本混用：使用者手上是舊的 HTML，去載入已經被刪除的舊 chunk，或新的 JS 配舊的 API 快取。
   - 瀏覽器擴充套件修改了 DOM。
3. **修正**：
   - 在**資料邊界**做驗證（用 Zod 解析 API 回應），讓錯誤在進入系統時就被發現，而不是在畫面深處爆掉。
   - 用 `AbortController` 取消過時的請求，或比對請求序號，丟棄舊的回應。
   - 部署時保留前幾個版本的靜態檔，chunk 載入失敗時提示使用者重新整理。
4. **不推薦的做法**：到處加 `?.` 把錯誤「藏起來」。這會讓畫面顯示錯誤資料，問題更難發現。

### 搜尋框輸入時，舊的請求比新的晚回來

這是典型的競爭條件。三層處理：

1. **減少請求**：輸入做防抖。
2. **取消過時的請求**：每次發新請求前，取消上一個請求的 `AbortController`。
3. **忽略過時的回應**：就算無法取消，也要確認回應對應的是「最新的查詢」才更新畫面。

```js
// 瀏覽器程式
let controller;
async function search(keyword) {
  controller?.abort();                       // 取消上一個請求
  controller = new AbortController();
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(keyword)}`, { signal: controller.signal });
    render(await res.json());
  } catch (e) {
    if (e.name !== "AbortError") throw e;    // 被取消的請求不是錯誤
  }
}
```

React Query、SWR 這類函式庫內建了這些處理，再加上快取與重複請求合併。資深工程師應該能說出為什麼要用它們，而不只是「大家都在用」。

### 設計前端的錯誤監控與上報

1. **蒐集**：
   - `window.addEventListener("error")`：未捕捉的同步錯誤；在捕獲階段監聽還能抓到資源（圖片、腳本）載入失敗。
   - `window.addEventListener("unhandledrejection")`：未處理的 Promise 失敗。
   - 框架的錯誤邊界：React 的 Error Boundary、Vue 的 `app.config.errorHandler`。
   - 主動上報：在 `catch` 裡呼叫上報函式，附上業務情境。
   - 跨網域腳本的錯誤只會顯示 `Script error.`，要在 `<script>` 加 `crossorigin` 並讓 CDN 回傳 CORS 標頭。
2. **附加資訊**：版本號、使用者 ID（去識別化）、頁面、瀏覽器、最近的操作紀錄（breadcrumbs）。
3. **上報**：用 `navigator.sendBeacon` 或 `fetch` 加上 `keepalive: true`，頁面關閉時也能送出；批次上報、取樣、相同錯誤去重，避免錯誤風暴把監控服務打掛。
4. **還原**：上傳 source map 到監控服務，但**不要公開部署到正式網站**，避免原始碼外流。
5. **告警**：依錯誤率和影響使用者數設定門檻，新版本上線後的錯誤率上升要能自動告警，搭配灰度發佈快速回滾。

## 工程實務

### 管理大型專案的程式碼品質

- **型別**：全面使用 TypeScript，開啟 `strict`，禁止新增 `any`（用 ESLint 規則管控）。
- **一致性**：ESLint 加 Prettier（或改用 Biome），在 commit hook 和 CI 裡強制執行，不在 code review 討論格式。
- **測試**：單元測試（Vitest）測純邏輯；元件測試（Testing Library）測使用者看得到的行為，不測實作細節；E2E（Playwright）只測關鍵流程。
- **相依套件**：鎖定版本（lock file）、定期更新（Renovate）、用 `npm audit` 或 Socket 等工具檢查漏洞和惡意套件；評估新套件時看維護狀況和大小。
- **架構**：用 monorepo（pnpm workspace、Turborepo、Nx）管理共用程式碼；用 ESLint 的 import 規則限制模組間的相依方向，避免核心模組依賴 UI 層。
- **效能預算**：打包體積在 CI 中檢查，超過門檻就失敗。

### 從 jQuery 舊專案逐步遷移到現代框架

1. **不要一次重寫**：大爆炸式重寫風險高，業務也不會停下來等你。採用**絞殺者模式**（strangler fig）：新功能用新框架寫，舊頁面逐頁替換。
2. **建立基礎**：先導入建置工具（Vite），讓新舊程式碼可以共存；導入 TypeScript 但允許 JavaScript 檔案（`allowJs`）；先補上關鍵流程的 E2E 測試，當作遷移的安全網。
3. **共存方式**：在舊頁面中掛載新框架的元件（掛到某個容器節點上）；或用路由切分，新頁面走新框架，舊頁面維持原樣；必要時用 Web Components 當作兩邊的橋樑。
4. **狀態與資料**：先把 API 呼叫抽成獨立的模組，新舊程式碼共用，避免兩套邏輯不一致。
5. **衡量進度**：追蹤 jQuery 使用量和舊頁面的數量，設定移除的里程碑。

### 評估是否採用新的語言特性或框架

- **相容性**：目標瀏覽器和 Node.js 版本是否支援（看 Can I Use、Node.green、Baseline 標示）。不支援的話，Babel 或 polyfill 能否補上，代價是多少體積。
- **成熟度**：TC39 提案到 Stage 4 才是確定的標準；Stage 3 的功能語法可能還會變（例如 decorators 曾經大改）。
- **收益**：解決了什麼實際問題？例如 `Temporal` 解決了時區處理的一整類 bug，收益明確。
- **團隊成本**：學習曲線、工具鏈支援（ESLint、TypeScript、測試框架）、招募市場。
- **退場成本**：如果之後要換掉，影響範圍多大。

### Node.js 與瀏覽器的差別

語言核心（ECMAScript）一樣，差別在宿主環境提供的 API 和事件迴圈的實作。

| | 瀏覽器 | Node.js |
| --- | --- | --- |
| 全域物件 | `window`（通用名稱 `globalThis`） | `global`（通用名稱 `globalThis`） |
| 特有 API | DOM、BOM、`localStorage` | `fs`、`process`、`Buffer`、`child_process` |
| 事件迴圈 | HTML 規格定義，包含渲染步驟 | libuv，分成 timers、poll、check 等階段 |
| 特有排程 | `requestAnimationFrame` | `setImmediate`、`process.nextTick` |
| 模組 | ES 模組 | ES 模組與 CommonJS |
| 安全模型 | 沙盒、同源政策 | 完整的系統權限（可用 `--permission` 限制） |

兩邊的 API 越來越一致：Node.js 已經內建 `fetch`、`WebSocket` 用戶端、`AbortController`、Web Streams、`structuredClone`、Web Crypto。

### 用一分鐘說明你對 JavaScript 的理解

這種開放題沒有標準答案，重點是**有結構**（特點、弱點與對策、趨勢），而且每一點都能被追問下去。不要背書，要講自己實際踩過的坑。

> JavaScript 是一個單執行緒、以事件迴圈處理非同步的動態語言。它的核心有三個特點：第一，函式是一等公民，加上詞法作用域，形成閉包，這是很多模式的基礎；第二，物件導向是以原型為基礎，`class` 是在原型之上的語法；第三，非同步模型從回呼、Promise 演進到 async/await，搭配 AbortController 處理取消。
>
> 它的弱點是動態型別和寬鬆的型別轉換，所以大型專案我會用 TypeScript，並在資料邊界做執行期驗證。效能上要注意不要阻塞主執行緒，記憶體上要注意閉包和監聽器造成的洩漏。
>
> 近幾年語言進步很快，像不可變陣列方法、Temporal、`using` 資源管理，都讓程式更安全，我會持續追蹤 TC39 的提案。
