# 事件迴圈

## 為什麼單執行緒能處理非同步

JavaScript **語言的執行**是單執行緒，同一時間只能執行一段程式碼。但它跑在**宿主環境**（瀏覽器或 Node.js）裡，計時器、網路請求、檔案讀寫是由宿主環境的其他執行緒或作業系統處理的。工作完成後，宿主環境把回呼函式放進佇列，等呼叫堆疊清空時，事件迴圈再把它拿出來執行。

- 瀏覽器的計時器、網路由瀏覽器內部的執行緒處理。
- Node.js 的網路靠作業系統的非同步 I/O（epoll、kqueue、IOCP），檔案讀寫和 DNS 查詢交給 libuv 的執行緒池（預設 4 條）。
- 真正需要平行運算時，瀏覽器用 Web Worker，Node.js 用 `worker_threads`。

## 事件迴圈的規則

濃縮成一句話：**執行一個巨集任務，然後清空所有微任務，然後（在瀏覽器裡）視情況渲染畫面，再取下一個巨集任務**。

1. 執行目前的同步程式碼，直到呼叫堆疊清空。整段 script 本身就是第一個巨集任務。
2. 清空微任務佇列：依序執行所有微任務；如果微任務又產生新的微任務，也在這一輪執行完。
3. 瀏覽器判斷是否需要更新畫面，需要的話執行 `requestAnimationFrame` 回呼、計算樣式與版面、繪製。
4. 從巨集任務佇列取出下一個任務，回到第 1 步。

| 類型 | 例子 |
| --- | --- |
| 巨集任務（task） | `setTimeout`、`setInterval`、I/O 回呼、UI 事件、`MessageChannel`、Node.js 的 `setImmediate` |
| 微任務（microtask） | Promise 的 `then` / `catch` / `finally`、`await` 之後的程式、`queueMicrotask`、`MutationObserver` |

**為什麼要有微任務**：讓「目前這段操作的後續處理」在畫面更新和其他事件之前完成，確保狀態一致。代價是：如果微任務無限產生新的微任務，畫面會完全卡住，這比巨集任務的無限迴圈更隱蔽。

## 輸出順序題

```js
console.log("1");
setTimeout(() => console.log("2"), 0);
Promise.resolve().then(() => console.log("3"));
queueMicrotask(() => console.log("4"));
(async () => {
  console.log("5");
  await null;
  console.log("6");
})();
console.log("7");
// 輸出：1 5 7 3 4 6 2
```

解析：

1. 同步程式：印 `1`；`setTimeout` 註冊巨集任務；`then` 和 `queueMicrotask` 依序排入微任務；async 函式**同步**執行到第一個 `await`，印 `5`，`await` 之後的程式排入微任務；印 `7`。
2. 清空微任務：依排入順序印 `3`、`4`、`6`。
3. 下一個巨集任務：印 `2`。

**關鍵觀念**：async 函式在第一個 `await` 之前都是同步執行的；`new Promise(executor)` 的 executor 也是同步執行的。

### `await` 之後什麼時候執行

`await x` 會把函式剩下的部分排到微任務佇列，等 `x` 完成後再繼續。現代引擎對「原生 Promise」只需要一個微任務的時間就能恢復，不管 await 的是普通值還是已完成的 Promise，順序一樣。但如果 `await` 的是一個 thenable，或是在 async 函式裡 `return` 一個 Promise，就會多花兩個微任務。

```js
async function a() { return 1; }
async function b() { return Promise.resolve(1); } // 回傳 Promise 會多兩個微任務
a().then(() => console.log("a"));
b().then(() => console.log("b"));
Promise.resolve()
  .then(() => console.log("t1"))
  .then(() => console.log("t2"))
  .then(() => console.log("t3"));
// 輸出：a t1 t2 b t3
```

重點不是背順序，而是「回傳 Promise 要先解開才能決議外層 Promise」：引擎要排一個任務呼叫內層 Promise 的 `then`，再等它的回呼執行，所以多了兩個微任務。實務上不要寫依賴這種細微順序的程式碼。

## 計時器與動畫

### `setTimeout(fn, 0)` 真的是 0 毫秒嗎

不是。它的意思是「至少等 0 毫秒後，把 `fn` 放進巨集任務佇列」，實際執行時間要等目前的同步程式和所有微任務都跑完。瀏覽器在計時器巢狀超過 5 層後，最短延遲會被拉到 4 毫秒；分頁在背景時，計時器還會被大幅節流（常見到 1 秒以上）。

計時器不準：主執行緒被佔用時，計時器只能延後執行。做精準的動畫用 `requestAnimationFrame`；計算經過的時間用 `performance.now()`，不要用累加 `setInterval` 次數的方式。

### `requestAnimationFrame` 與 `setTimeout`

`requestAnimationFrame` 在瀏覽器**下一次重繪之前**執行，自動和螢幕的更新頻率同步（60Hz、120Hz 都能對齊），分頁在背景時會自動暫停，省電又不會掉幀。`setTimeout(fn, 16)` 和畫面更新沒有同步，容易出現一幀做兩次或跳過一幀的情況，造成卡頓。
