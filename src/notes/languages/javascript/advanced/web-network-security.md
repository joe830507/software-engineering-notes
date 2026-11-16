# 網路、效能與安全

## 同源政策與 CORS

同源是指**協定、網域、連接埠**三者都相同。瀏覽器的同源政策限制網頁的 JavaScript 讀取其他來源的回應。CORS 是讓伺服器**主動宣告**允許哪些來源讀取回應的機制：瀏覽器在請求加上 `Origin` 標頭，伺服器回應 `Access-Control-Allow-Origin`，瀏覽器檢查符合才把回應交給 JavaScript。

- **請求其實已經送到伺服器了**，CORS 錯誤是瀏覽器不讓 JavaScript 讀取回應，所以 CORS 不能防止 CSRF。
- **預檢請求（preflight）**：非「簡單請求」，例如方法是 `PUT` / `DELETE`、`Content-Type` 是 `application/json`、有自訂標頭時，瀏覽器會先送一個 `OPTIONS` 請求詢問伺服器，通過了才送真正的請求。可以用 `Access-Control-Max-Age` 讓瀏覽器快取預檢結果。
- 要帶 Cookie 時，前端要設 `credentials: "include"`，伺服器要回 `Access-Control-Allow-Credentials: true`，而且 `Allow-Origin` 不能是 `*`，必須是明確的來源。
- 開發時的跨域問題可以用開發伺服器的代理解決，因為伺服器之間的請求沒有同源政策。

## HTTP 快取

**強快取**在有效期內，瀏覽器直接用本地的副本，完全不發請求，由 `Cache-Control: max-age=秒數` 控制。過期之後進入**協商快取**：瀏覽器帶著 `If-None-Match`（對應 `ETag`）或 `If-Modified-Since`（對應 `Last-Modified`）詢問伺服器，資源沒變就回 `304 Not Modified`，不用重新傳送內容。

實務策略：

- **HTML**：`Cache-Control: no-cache`，每次都要向伺服器確認，確保使用者拿到最新版本的入口。注意 `no-cache` 是「可以快取但每次都要驗證」，`no-store` 才是完全不快取。
- **帶有內容雜湊的 JS / CSS**（例如 `app.3f9a2c.js`）：`Cache-Control: max-age=31536000, immutable`，內容一改檔名就變，所以可以放心快取一年。

## 載入效能

先量測再最佳化。用 Core Web Vitals 當指標：

- **LCP**（最大內容繪製）：目標 2.5 秒內。
- **INP**（互動到下一次繪製）：目標 200 毫秒內，2024 年取代 FID。
- **CLS**（版面位移）：目標 0.1 以下。

四個最佳化方向：

1. **傳得少**：程式碼分割與懶載入、tree shaking、壓縮（Brotli）、圖片用 AVIF / WebP 並依螢幕給適當尺寸。
2. **傳得快**：CDN、HTTP/2 或 HTTP/3、長期快取帶雜湊的靜態資源。
3. **早點開始**：關鍵資源用 `<link rel="preload">`，第三方網域用 `preconnect`，首屏內容用伺服器端渲染。
4. **不擋主執行緒**：腳本加 `defer`，長任務切小（用 `scheduler.yield()` 或 `setTimeout` 讓出主執行緒），重運算移到 Web Worker。

CLS 常見原因：圖片沒有設定寬高、廣告或嵌入內容晚載入把內容往下推、網頁字型載入造成文字重排。

## XSS

跨站腳本攻擊：攻擊者把惡意腳本注入到網頁中，在其他使用者的瀏覽器裡執行，可以偷取 Cookie 和 token、冒用身分發請求。分成三種：

- **儲存型**：惡意內容存進資料庫，所有看到的人都中招。
- **反射型**：惡意內容在網址參數裡，誘騙使用者點擊。
- **DOM 型**：前端 JavaScript 把不可信的資料直接寫進 DOM。

防範：

1. **輸出時編碼**：依輸出位置做對應的跳脫（HTML 內容、屬性、URL、JavaScript）。React、Vue 預設會跳脫插值，風險集中在 `dangerouslySetInnerHTML`、`v-html`、`innerHTML`。
2. 一定要插入 HTML 時，用 DOMPurify 這類函式庫淨化。
3. 設定 **CSP**（Content Security Policy），限制能執行的腳本來源，禁止行內腳本。
4. 敏感 Cookie 設 `HttpOnly`，讓 JavaScript 讀不到。
5. 注意 `href="javascript:..."` 這種 URL，使用者提供的連結要檢查協定。

## CSRF

跨站請求偽造：攻擊者誘使已登入的使用者瀏覽惡意網頁，網頁偷偷對目標網站發出請求，瀏覽器會**自動帶上目標網站的 Cookie**，伺服器以為是使用者本人的操作。

防範：

1. Cookie 設定 `SameSite=Lax` 或 `Strict`，跨站請求不帶 Cookie。Chromium 系瀏覽器在沒設定時預設是 `Lax`，但 Firefox 與 Safari 沒有採用這個預設，所以一定要明確設定。
2. CSRF token：伺服器產生隨機 token 放在表單或標頭中，驗證請求是否來自自己的頁面。
3. 檢查 `Origin` / `Referer` 標頭。
4. 改狀態的操作不要用 `GET`。
5. 用 `Authorization` 標頭帶 token（而不是 Cookie）的 API 天生不受 CSRF 影響，但要更小心 XSS。

## JWT 存在哪裡

沒有完美的方案，是取捨：

- 存 `localStorage`：方便，但任何 XSS 都能偷走。
- 存 `HttpOnly` Cookie：可以防止 JavaScript 讀取，但要處理 CSRF（用 `SameSite` 加 CSRF token）。

比較常見的建議做法：存活期短的 access token 放在**記憶體**中，存活期長的 refresh token 放在 `HttpOnly; Secure; SameSite=Strict` 的 Cookie 中，頁面重新整理時用 refresh token 換新的 access token。

## `eval` 與 `new Function`

兩者都會把字串當成程式碼執行。問題有三個：

- **安全性**：執行到使用者輸入就是程式碼注入。
- **效能**：引擎無法事先最佳化。
- **可維護性**：難以除錯和靜態分析。

CSP 預設也會禁止它們。解析 JSON 用 `JSON.parse`，動態存取屬性用 `obj[key]`，幾乎沒有必須使用 `eval` 的情況。

## 原型污染

攻擊者透過 `__proto__` 或 `constructor.prototype` 這類鍵，修改到 `Object.prototype`，讓**所有物件**都多了攻擊者控制的屬性。常見的入口是「深度合併」或「依路徑設定值」的函式，處理了使用者傳入的 JSON。後果從繞過權限檢查（`if (user.isAdmin)` 變成 true）到伺服器端遠端程式碼執行都有可能。

```js
function unsafeMerge(target, source) {
  for (const key in source) {
    if (typeof source[key] === "object" && source[key] !== null) {
      target[key] ??= {};
      unsafeMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}
unsafeMerge({}, JSON.parse('{"__proto__": {"isAdmin": true}}'));
console.log({}.isAdmin); // true：所有物件都被污染了
```

防範：

1. 合併時跳過 `__proto__`、`constructor`、`prototype` 這三個鍵。
2. 用 `Object.create(null)` 或 `Map` 存放使用者控制的鍵值。
3. 用 JSON Schema 或 Zod 驗證輸入，只允許預期的欄位。
4. 用 `Object.hasOwn` 檢查屬性，不要直接讀取可能來自原型的屬性。
5. Node.js 可以用 `--disable-proto=delete` 選項移除 `__proto__` 存取器。
