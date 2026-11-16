# 產生器、非同步迭代與 Worker

## 產生器（Generator）

用 `function*` 宣告的函式，執行到 `yield` 會暫停並交出一個值，呼叫端用 `next()` 讓它繼續。它讓函式可以「暫停和恢復」。

```js
function* idGenerator() {
  let id = 1;
  while (true) yield id++;
}
const ids = idGenerator();
console.log(ids.next().value, ids.next().value); // 1 2
```

### 和 async/await 的關係

async/await 在概念上就是「產生器 + 自動執行器」：`await` 相當於 `yield` 出一個 Promise，執行器等它完成後再呼叫 `next()` 把結果送回去。早期的 `co` 函式庫就是這樣做的，Babel 編譯 async 函式到舊環境時也用這個方式。

```js
// 迷你版 co：用產生器模擬 async/await
function run(genFn) {
  return new Promise((resolve, reject) => {
    const gen = genFn();
    function step(method, arg) {
      let result;
      try { result = gen[method](arg); } catch (e) { return reject(e); }
      if (result.done) return resolve(result.value);
      Promise.resolve(result.value).then((v) => step("next", v), (e) => step("throw", e));
    }
    step("next");
  });
}
console.log(await run(function* () {
  const a = yield Promise.resolve(1);
  const b = yield Promise.resolve(2);
  return a + b;
})); // 3
```

## 非同步迭代器

每次 `next()` 回傳一個 Promise，用 `for await...of` 走訪。適合處理「一筆一筆陸續到來的資料」：分頁 API、串流（Node.js 的 Readable stream 和 Web 的 `ReadableStream` 都是非同步可迭代的）、訊息佇列。用 `async function*` 就能很簡單地寫出來。

```js
async function* fetchPages(totalPages) {
  for (let page = 1; page <= totalPages; page++) {
    await new Promise((r) => setTimeout(r, 10)); // 模擬 API 請求
    yield [`item-${page}-1`, `item-${page}-2`];
  }
}
for await (const items of fetchPages(2)) console.log(items);
// [ 'item-1-1', 'item-1-2' ]
// [ 'item-2-1', 'item-2-2' ]
console.log(await Array.fromAsync(fetchPages(2))); // 一次收集成陣列
```

## Web Worker

讓 JavaScript 在背景執行緒執行，不會阻塞主執行緒的畫面更新。適合 CPU 密集的工作：大量資料解析、圖片處理、加解密、複雜計算。

- Worker 不能操作 DOM，和主執行緒之間用 `postMessage` 傳訊息。
- 資料預設會用 structured clone 複製；大型二進位資料可以用 transferable 物件（例如 `ArrayBuffer`）**轉移所有權**，避免複製成本。
- 需要共享記憶體時用 `SharedArrayBuffer` 搭配 `Atomics`，但瀏覽器要求網頁啟用跨來源隔離（COOP / COEP 標頭）。
- Node.js 對應的是 `worker_threads`；CPU 密集工作也可以考慮拆成獨立服務。
