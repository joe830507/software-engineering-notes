# 瀏覽器與 DOM

> 標示「瀏覽器程式」的範例只能在瀏覽器執行，不能直接用 Node.js 跑。

## 載入與渲染

### `<script>` 的 `async` 與 `defer`

一般的 `<script>` 會**暫停 HTML 解析**，等下載和執行完才繼續。`defer` 和 `async` 都會讓下載與 HTML 解析同時進行，差別在執行時機：`defer` 等 HTML 解析完才執行，而且依照在頁面上出現的順序；`async` 下載完就立刻執行，會打斷解析，順序不保證。

| | 下載時是否阻塞解析 | 執行時機 | 順序 |
| --- | --- | --- | --- |
| 一般 | 是 | 下載完立即執行 | 依出現順序 |
| `defer` | 否 | HTML 解析完、`DOMContentLoaded` 之前 | 依出現順序 |
| `async` | 否 | 下載完立即執行 | 不保證 |
| `type="module"` | 否 | 預設同 `defer` | 依出現順序（加 `async` 則同 `async`） |

選擇原則：會操作 DOM 或彼此有相依的主程式用 `defer`（或 `type="module"`）；獨立的第三方腳本，例如統計分析，用 `async`。

### 從輸入網址到畫面顯示

分成網路和渲染兩段。

1. **網路**：檢查快取 → DNS 解析網域 → 建立 TCP 連線（HTTP/3 用 QUIC 走 UDP）→ TLS 握手 → 送出 HTTP 請求 → 接收回應。
2. **渲染**：解析 HTML 建立 DOM 樹 → 解析 CSS 建立 CSSOM 樹 → 合併成渲染樹（只包含要顯示的節點）→ 版面配置（Layout，計算每個元素的位置與大小）→ 繪製（Paint，產生繪製指令）→ 合成（Composite，把不同圖層合成到畫面上，交給 GPU）。

CSS 會阻塞渲染，因為沒有 CSSOM 就無法建立渲染樹；同步的 JavaScript 會阻塞 HTML 解析，因為它可能修改 DOM。所以 CSS 放在 `<head>`、JavaScript 加 `defer`。

### `DOMContentLoaded` 與 `load`

`DOMContentLoaded` 在 HTML 解析完成、DOM 樹建立好之後觸發，不等圖片和樣式表下載（但會等 `defer` 腳本執行完）；`load` 要等頁面上所有資源（圖片、iframe、樣式表）都載入完成才觸發。操作 DOM 只需要等前者。

### Reflow 與 Repaint

Reflow（重排，也叫 Layout）是重新計算元素的位置和大小，Repaint（重繪）是重新繪製元素的外觀。

- 改變寬高、位置、字體大小、增刪節點會觸發 reflow，而 reflow 一定會接著 repaint。
- 只改顏色、背景、陰影只觸發 repaint。
- 只改 `transform` 和 `opacity` 通常只觸發合成，成本最低，所以動畫要優先用這兩個屬性。

減少方法：

1. **避免讀寫交錯**：讀取 `offsetHeight`、`getBoundingClientRect()` 這類版面資訊會強制瀏覽器立即計算版面（forced synchronous layout）。在迴圈裡「寫入樣式、讀取尺寸」交錯進行，會導致每一次都重算，叫 layout thrashing。正確做法是先全部讀完，再全部寫入。
2. 批次修改樣式：改 `class` 而不是逐一改 `style`。
3. 大量插入節點用 `DocumentFragment` 或一次設定 `innerHTML`。
4. 動畫用 `transform` / `opacity`，必要時加 `will-change` 讓元素提升成獨立圖層。
5. 長列表用虛擬捲動，只渲染看得見的項目。

```js
// 瀏覽器程式：layout thrashing 與修正
const boxes = document.querySelectorAll(".box");
// 不好：每次迴圈都讀取版面又寫入，強制重算 N 次
boxes.forEach((b) => { b.style.width = b.offsetWidth + 10 + "px"; });
// 好：先讀完，再寫入，只重算一次
const widths = [...boxes].map((b) => b.offsetWidth);
boxes.forEach((b, i) => { b.style.width = widths[i] + 10 + "px"; });
```

## 事件

### 捕獲與冒泡

DOM 事件傳遞分三個階段：**捕獲階段**從 `window` 往下傳到目標元素的父節點；**目標階段**到達觸發事件的元素；**冒泡階段**再從目標往上傳回 `window`。`addEventListener` 預設在冒泡階段觸發，第三個參數設為 `{ capture: true }` 則在捕獲階段觸發。

- `event.target` 是實際觸發事件的元素；`event.currentTarget` 是目前執行監聽器的元素。
- `stopPropagation()` 停止往下一個節點傳遞；`stopImmediatePropagation()` 連同一個元素上其他的監聽器也不執行；`preventDefault()` 取消瀏覽器的預設行為（例如連結跳轉、表單送出），和傳遞無關。
- 不是所有事件都會冒泡，例如 `focus`、`blur`、`mouseenter` 不冒泡，要用 `focusin`、`focusout`、`mouseover` 代替。

### 事件代理（事件委派）

利用事件冒泡，把監聽器註冊在**父元素**上，而不是每個子元素上，再透過 `event.target` 判斷實際點到的是哪個子元素。好處是：監聽器數量從 N 個變成 1 個，節省記憶體；動態新增的子元素自動有效，不需要重新綁定。

```js
// 瀏覽器程式
document.querySelector("#todo-list").addEventListener("click", (e) => {
  const button = e.target.closest("button[data-action]"); // 點到按鈕裡的圖示也能找到按鈕
  if (!button || !e.currentTarget.contains(button)) return;
  const id = button.closest("li").dataset.id;
  if (button.dataset.action === "delete") console.log("刪除", id);
});
```

用 `closest` 而不是直接比對 `e.target`，因為使用者可能點到按鈕裡的 `<span>` 或 `<svg>`。

### 防抖與節流

兩者都是限制函式執行頻率。

- **防抖（debounce）**：「停下來一段時間後才執行一次」，持續觸發會一直重新計時。適合搜尋框輸入、視窗調整大小結束後重新計算。
- **節流（throttle）**：「一段時間內最多執行一次」，持續觸發也會固定頻率執行。適合捲動事件、滑鼠移動、按鈕防連點。

類比：防抖像電梯門，有人進來就重新等；節流像公車，固定時間發一班，不管等車的人多少。

## 儲存與框架

### 瀏覽器儲存

| | 容量 | 生命週期 | 會隨請求送到伺服器 | API |
| --- | --- | --- | --- | --- |
| Cookie | 約 4KB | 依 `Expires` / `Max-Age` | 會 | 字串操作 |
| `localStorage` | 約 5～10MB | 永久，直到手動清除 | 否 | 同步 |
| `sessionStorage` | 約 5MB | 分頁關閉即清除 | 否 | 同步 |
| IndexedDB | 依磁碟空間，可達數 GB | 永久 | 否 | 非同步 |

- **身分驗證的 token 不要放 `localStorage`**：任何 XSS 都能用 JavaScript 讀到。比較安全的做法是放在設了 `HttpOnly`、`Secure`、`SameSite` 的 Cookie 裡，JavaScript 讀不到。
- `localStorage` 是同步 API，大量讀寫會阻塞主執行緒；大量結構化資料用 IndexedDB。

### 虛擬 DOM

用 JavaScript 物件描述畫面結構。狀態改變時，框架產生新的虛擬 DOM 樹，和舊的比較（diff），算出最小的差異，再一次套用到真實 DOM。它**不一定比直接操作 DOM 快**，手寫最佳化的 DOM 操作一定更快；它的價值是讓開發者用宣告式的方式寫畫面，同時保有「不差」的效能，並且可以跨平台（例如 React Native）。

- diff 演算法用三個假設把複雜度從 O(n³) 降到 O(n)：只比較同層節點、型別不同直接整棵替換、用 `key` 辨識列表中的同一個項目。
- 這就是列表要給**穩定的 `key`**、不要用陣列索引的原因：插入或刪除項目時索引會變，導致錯誤重用元件、狀態錯亂。
- 新的框架方向：Svelte、Solid、Vue 的 Vapor 模式用編譯期分析加上細粒度響應式（signals），直接更新受影響的 DOM 節點，不需要虛擬 DOM。

## 瀏覽器 API

### `IntersectionObserver`

非同步地偵測元素是否進入可視範圍，取代在捲動事件裡呼叫 `getBoundingClientRect()` 計算的舊做法，不會阻塞主執行緒也不會觸發強制版面計算。常見用途：圖片懶載入、無限捲動、曝光追蹤、進場動畫。圖片懶載入現在也可以直接用 HTML 的 `loading="lazy"`。

### Web Components

瀏覽器原生的元件化技術，由三個部分組成：

- **Custom Elements**：定義自己的 HTML 標籤。
- **Shadow DOM**：封裝樣式和結構，不會被外部 CSS 影響。
- **HTML Template**：`<template>` 與 `<slot>`。

好處是不依賴框架、可以在任何框架中使用，適合做跨團隊的設計系統。缺點是伺服器端渲染較麻煩（雖然已有 Declarative Shadow DOM），表單整合和無障礙支援需要額外處理。

### Service Worker

在背景執行、介於網頁和網路之間的腳本，可以攔截網頁發出的請求，自行決定從快取回應還是從網路取得。它是 PWA 的基礎，用來實作離線瀏覽、快取策略（快取優先、網路優先、stale-while-revalidate）、推播通知、背景同步。只能在 HTTPS（或 localhost）下運作，而且不能存取 DOM。
