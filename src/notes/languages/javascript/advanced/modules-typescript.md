# 模組、工具鏈與 TypeScript

## 模組系統

### CommonJS 與 ES 模組

| | CommonJS（`require`） | ES 模組（`import`） |
| --- | --- | --- |
| 載入時機 | 執行期，同步載入 | 先靜態解析相依關係，再執行；支援非同步 |
| 匯出的內容 | `module.exports` 物件的**值**（複本） | **即時綁定**（live binding），原模組改了值，匯入端看得到 |
| 寫法限制 | 可以寫在 `if` 裡、路徑可以是變數 | 靜態 `import` 只能在頂層；動態需求用 `import()` |
| tree shaking | 難以做到 | 可以，因為相依關係是靜態可分析的 |
| 頂層 `this` | `module.exports` | `undefined` |
| 頂層 `await` | 不支援 | 支援 |
| 預設模式 | 非嚴格 | 自動嚴格模式 |

- Node.js 依副檔名（`.mjs` / `.cjs`）或 `package.json` 的 `"type"` 欄位判斷模組系統。
- Node.js 22.12 之後，CommonJS 可以直接 `require()` 一個同步的 ES 模組（沒有頂層 `await` 的），兩種系統混用的痛點大幅減少。
- 新專案一律用 ES 模組。

### 循環相依

兩種模組系統都不會無限迴圈，但都可能拿到「還沒初始化完成」的值：

- **CommonJS**：會拿到對方**目前已經匯出的部分**（可能是空物件）。
- **ES 模組**：因為是即時綁定，如果在對方初始化之前就存取，會碰到 TDZ 拋 `ReferenceError`；如果是在函式裡延後存取就沒問題。

解法是重新拆分模組，把共用的部分抽到第三個模組，或把存取延後到函式呼叫時。

## 工具鏈

### tree shaking

打包工具分析 ES 模組的 `import` / `export`，把沒有被用到的匯出移除，減少打包體積。失效的常見原因：

1. 使用 CommonJS 模組，無法靜態分析。
2. 模組有**副作用**（例如在頂層修改全域物件、引入 CSS），打包工具不敢刪。可以在 `package.json` 宣告 `"sideEffects": false` 告訴打包工具。
3. 匯入整個命名空間後動態存取屬性，例如 `utils[name]()`。
4. 把很多功能掛在同一個物件或類別上匯出，打包工具無法只刪掉其中幾個方法。

### 打包工具：Webpack 與 Vite

打包工具從入口檔案出發，分析所有相依關係，把模組、CSS、圖片轉譯並合併成瀏覽器能有效率載入的檔案，同時做程式碼分割、壓縮、tree shaking、加上檔名雜湊方便快取。

- **Webpack**：開發模式也要先打包整個專案，專案大時啟動很慢。
- **Vite**：開發模式直接利用瀏覽器原生支援 ES 模組，依需要即時轉譯單一檔案，啟動幾乎是瞬間完成；正式建置則用 Rollup（新版改用 Rust 寫的 Rolldown）打包。

打包工具內部的流程：從入口建立相依圖 → 每個模組用 loader 轉譯成 JavaScript → 外掛（plugin）在建置生命週期的各個掛鉤上做額外處理 → 依分割規則產生 chunk → 輸出檔案。loader 處理「單一檔案的轉換」，plugin 處理「整個建置流程」。

### Babel 與 polyfill

- **Babel**：編譯器，負責把**新語法**轉成舊語法，例如把箭頭函式、`class`、`?.` 轉成 ES5 寫法。
- **polyfill**：補上**缺少的 API**，例如舊瀏覽器沒有 `Promise`、`Array.prototype.includes`，就用 JavaScript 自己實作一份掛上去。

語法無法用 polyfill 補，API 無法靠編譯產生，所以兩者通常一起用，例如 Babel 加上 core-js。有些新功能兩者都做不到，例如 `Proxy` 無法用舊語法模擬；`WeakRef` 也無法正確地 polyfill。

## TypeScript

### 型別在執行期還存在嗎

不存在。TypeScript 的型別只在編譯期檢查，編譯成 JavaScript 後全部被移除（type erasure）。所以 API 回應、使用者輸入、`JSON.parse` 的結果，TypeScript 無法保證型別正確，要用 Zod、Valibot 這類執行期驗證函式庫檢查。

Node.js 22.18 之後可以直接執行 `.ts` 檔，做法也是「把型別註記去掉」，不做型別檢查。

### `any`、`unknown`、`never`

- `any`：關閉型別檢查，什麼都能做，會讓錯誤蔓延。
- `unknown`：型別安全的「任何值」，使用前必須先縮小型別（用 `typeof`、`instanceof` 或型別守衛）。
- `never`：表示「不可能出現的值」，例如永遠拋錯的函式的回傳型別，也常用在 `switch` 的 `default` 分支做窮舉檢查。

```ts
type Shape = { kind: "circle"; r: number } | { kind: "square"; size: number };
function area(s: Shape): number {
  switch (s.kind) {
    case "circle": return Math.PI * s.r ** 2;
    case "square": return s.size ** 2;
    default: {
      const unreachable: never = s; // 未來新增 kind 卻忘了處理，這裡會編譯錯誤
      return unreachable;
    }
  }
}
```

### `interface` 與 `type`

描述物件的結構時兩者幾乎可以互換。差別是：

- `interface` 可以宣告合併（同名的會自動合併，用來擴充第三方函式庫的型別），錯誤訊息也比較清楚。
- `type` 可以表示聯集、交集、元組、映射型別、條件型別等任何型別。

常見的團隊慣例是：物件結構和公開 API 用 `interface`，其他情況用 `type`。重要的是團隊一致。
