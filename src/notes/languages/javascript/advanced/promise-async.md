# Promise 與 async/await

## Promise 基礎

### 三種狀態

`pending`（等待中）、`fulfilled`（成功）、`rejected`（失敗）。狀態只能從 `pending` 變成另外兩種之一，而且一旦改變就不能再變（settled）。

`then` 會回傳一個**新的** Promise，所以可以鏈式呼叫：回呼裡回傳的值會成為下一個 Promise 的結果，拋出的錯誤會讓下一個 Promise 變成 `rejected`。

### 回呼地獄

非同步操作層層巢狀，程式碼往右縮排越來越深，錯誤處理要在每一層重複寫。Promise 把巢狀改成鏈式呼叫，錯誤可以集中在最後一個 `catch`；async/await 再把鏈式呼叫寫成像同步程式一樣，可以用一般的 `try/catch`、`for` 迴圈和 `if`。

### `then` 第二個參數與 `catch`

`p.then(onOk, onErr)` 的 `onErr` 只能處理 `p` 本身的失敗，抓不到 `onOk` 裡面拋出的錯誤；`p.then(onOk).catch(onErr)` 則兩者都抓得到，因為 `catch` 接在 `then` 回傳的新 Promise 後面。所以一般建議用 `catch`。

## 組合多個 Promise

| 方法 | 何時完成 | 結果 | 適用情境 |
| --- | --- | --- | --- |
| `Promise.all` | 全部成功，或任一失敗 | 成功：結果陣列（順序同輸入）；失敗：第一個錯誤 | 多個請求都要成功才能繼續 |
| `Promise.allSettled` | 全部完成（不論成敗） | `{ status, value / reason }` 陣列 | 批次處理，要知道每一筆的結果 |
| `Promise.race` | 任一完成（不論成敗） | 第一個完成的結果 | 逾時控制 |
| `Promise.any` | 任一成功，或全部失敗 | 第一個成功的值；全失敗拋 `AggregateError` | 多個備援來源，取最快成功的 |

`Promise.all` 有一個失敗時，其他請求**不會**停止。Promise 一旦建立就已經在執行，`Promise.all` 只是不再等待它們。要真的取消，要搭配 `AbortController`。

## async/await 實務

### 錯誤處理：`try/catch` 抓得到什麼

`try/catch` 只能抓到**同步**拋出的錯誤，以及**被 `await` 的** Promise 的失敗。在 `setTimeout` 回呼裡拋的錯誤、沒有被 `await` 的 Promise 失敗，外層的 `try/catch` 都抓不到。

```js
try {
  setTimeout(() => { throw new Error("抓不到"); }, 0); // 會變成未捕捉的例外
} catch (e) { /* 永遠不會進來 */ }

async function load() {
  try {
    await Promise.reject(new Error("抓得到"));
  } catch (e) {
    console.log(e.message); // 抓得到
  }
}
```

- 沒有被處理的 Promise 失敗，在瀏覽器會觸發 `unhandledrejection` 事件；在 Node.js 15 之後**預設會讓程序直接結束**。
- 最後防線：瀏覽器監聽 `window` 的 `error` / `unhandledrejection`；Node.js 監聽 `process.on("unhandledRejection")`，但只用來記錄和優雅關機，不要拿來吞掉錯誤。

### 迴圈裡的 `await`

`for` 迴圈裡寫 `await` 會**依序**執行，一個做完才做下一個；要並行就先把 Promise 都建立好，再用 `Promise.all` 等待。`forEach` 不會等待 async 回呼，`forEach` 裡寫 `await` 是常見 bug。

```js
const delay = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));
const ids = [1, 2, 3];

for (const id of ids) await delay(100, id);              // 依序：約 300ms
await Promise.all(ids.map((id) => delay(100, id)));      // 並行：約 100ms
ids.forEach(async (id) => { await delay(10, id); });     // forEach 不會等，馬上往下執行
```

全部並行不一定好，例如一次對外部 API 發一萬個請求會被限流，這時要控制並行數量。

### 把回呼 API 轉成 Promise

用 `new Promise` 包起來，在回呼裡依成功或失敗呼叫 `resolve` 或 `reject`。Node.js 對「錯誤優先回呼」風格的函式，可以直接用 `util.promisify`，而且大部分核心模組已經提供 Promise 版本，例如 `node:fs/promises`。

```js
function promisify(fn) {
  return (...args) =>
    new Promise((resolve, reject) => {
      fn(...args, (err, result) => (err ? reject(err) : resolve(result)));
    });
}
```

### 取消非同步操作

Promise 本身沒有取消機制。若底層 API 支援取消，可以建立 `AbortController`，把 `signal` 傳入 API，需要取消時呼叫 `controller.abort()`。例如 `fetch`、Node.js 的 Promise 計時器都支援這種方式，但失敗原因取決於 API 與 signal：可能是 `AbortError`、`TimeoutError`，或自行傳給 `abort(reason)` 的原因，不能一律只檢查錯誤名稱。

`addEventListener` 也接受 signal，但它本身不回傳 Promise；取消的效果是移除事件監聽器。只呼叫 `abort()` 不會自動停止任意程式碼，底層操作必須有處理 signal。

```js
const { setTimeout: wait } = await import("node:timers/promises");
const controller = new AbortController();
setTimeout(() => controller.abort(), 50);
try {
  await wait(1000, "完成", { signal: controller.signal });
} catch (e) {
  console.log(e.name); // AbortError
}

// 逾時控制：不用自己寫 Promise.race
await wait(1000, null, { signal: AbortSignal.timeout(50) });
```

- `AbortSignal.timeout(ms)` 產生一個時間到自動取消的 signal；`AbortSignal.any([s1, s2])` 可以合併多個 signal，任一個觸發就取消。
- 自己寫的非同步函式要支援取消，就檢查 `signal.aborted`，或監聽 `signal` 的 `abort` 事件，並呼叫 `signal.throwIfAborted()`。

### `Promise.withResolvers`

ES2024 加入的工具，一次回傳 `{ promise, resolve, reject }`，讓你不用把 `resolve` 從 `new Promise` 的回呼裡「偷」出來。適合在事件驅動的程式碼裡，由別的地方決定 Promise 何時完成。

```js
function once(emitter, event) {
  const { promise, resolve } = Promise.withResolvers();
  emitter.addEventListener(event, resolve, { once: true });
  return promise;
}
```
