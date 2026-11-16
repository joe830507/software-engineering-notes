# 手寫程式題

> 面試寫程式時，先講清楚**需求邊界**再動手：要不要處理 `this`？要不要支援取消？錯誤怎麼處理？寫完主動說出還沒處理的情況，比默默寫一個「看起來能跑」的版本加分。

## 控制函式執行

### 防抖（debounce）

```js
function debounce(fn, wait, { leading = false } = {}) {
  let timer = null;
  function debounced(...args) {
    const callNow = leading && timer === null;
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (!leading) fn.apply(this, args);
    }, wait);
    if (callNow) fn.apply(this, args);
  }
  debounced.cancel = () => { clearTimeout(timer); timer = null; };
  return debounced;
}

const log = [];
const save = debounce((v) => log.push(v), 50);
save(1); save(2); save(3);
await new Promise((r) => setTimeout(r, 80));
console.log(log); // [ 3 ]：只執行最後一次
```

講解重點：

- 用 `function` 而不是箭頭函式宣告 `debounced`，並用 `fn.apply(this, args)`，才能保留呼叫時的 `this`，例如當成物件方法使用時。
- `leading` 選項：第一次觸發立即執行，之後的觸發在安靜期內都忽略。
- 提供 `cancel`，元件卸載時可以取消還沒執行的呼叫。

### 節流（throttle）

```js
function throttle(fn, wait) {
  let last = 0;
  let timer = null;
  let pendingArgs = null;
  let pendingThis;
  return function throttled(...args) {
    const now = Date.now();
    const remaining = wait - (now - last);
    if (remaining <= 0) {
      clearTimeout(timer);
      timer = null;
      last = now;
      fn.apply(this, args);
    } else {
      pendingArgs = args;
      pendingThis = this;
      timer ??= setTimeout(() => {   // 確保最後一次觸發也會被執行
        last = Date.now();
        timer = null;
        const argsToRun = pendingArgs;
        const thisToRun = pendingThis;
        pendingArgs = pendingThis = null;
        fn.apply(thisToRun, argsToRun);
      }, remaining);
    }
  };
}

const calls = [];
const onScroll = throttle((v) => calls.push(v), 50);
for (let i = 1; i <= 5; i++) onScroll(i);
await new Promise((r) => setTimeout(r, 80));
console.log(calls); // [ 1, 5 ]：立刻執行第一次，結束時補執行最後一次
```

只用時間戳的版本，最後一次觸發可能被丟掉（例如捲動停止時的位置沒被處理）；只用計時器的版本，第一次要等 `wait` 之後才執行。上面的寫法結合兩者，頭尾都會執行。

### `once` 與記憶化

```js
function once(fn) {
  let done = false, result;
  return function (...args) {
    if (!done) { done = true; result = fn.apply(this, args); }
    return result;
  };
}

function memoize(fn, keyFn = (...args) => JSON.stringify(args)) {
  const cache = new Map();
  return function (...args) {
    const key = keyFn(...args);
    if (!cache.has(key)) cache.set(key, fn.apply(this, args));
    return cache.get(key);
  };
}

const fib = memoize((n) => (n < 2 ? n : fib(n - 1) + fib(n - 2)));
console.log(fib(90)); // 2880067194370816000
```

- 記憶化非同步函式時，快取的是 **Promise**，這樣同時發出的相同請求會共用同一個 Promise，不會重複請求；但失敗時要把快取刪掉，否則錯誤會被永久快取。
- 快取要有上限，否則就是記憶體洩漏。

### 柯里化與函式組合

```js
function curry(fn) {
  return function curried(...args) {
    if (args.length >= fn.length) return fn.apply(this, args);
    return (...more) => curried.apply(this, [...args, ...more]);
  };
}
const add3 = curry((a, b, c) => a + b + c);
add3(1)(2)(3);  // 6
add3(1, 2)(3);  // 6
add3(1)(2, 3);  // 6

// 無限累加 sum(1)(2)(3)()：用空呼叫當作結束訊號
const sum = (a) => (b) => (b === undefined ? a : sum(a + b));
sum(1)(2)(3)(); // 6

const compose = (...fns) => (x) => fns.reduceRight((acc, fn) => fn(acc), x); // 由右到左
const pipe = (...fns) => (x) => fns.reduce((acc, fn) => fn(acc), x);         // 由左到右
```

Redux 的 middleware 和 Koa 的洋蔥模型都是函式組合的應用。

## 實作內建行為

### `call`、`apply`、`bind`

核心原理是「把函式暫時掛到目標物件上，用 `obj.fn()` 的方式呼叫」，利用隱含綁定改變 `this`。

以下是教學用的近似版本：無法完整模擬嚴格模式函式的 `this`，也不適用於不可擴充的目標物件。`myApply` 使用展開語法，要求參數可迭代；原生 `apply` 還接受一般類陣列物件。正式程式請使用內建方法。

```js
Function.prototype.myCall = function (thisArg, ...args) {
  const ctx = thisArg == null ? globalThis : Object(thisArg); // 原始值要包裝成物件
  const key = Symbol("fn");                                    // 用 Symbol 避免覆蓋原有屬性
  ctx[key] = this;
  try {
    return ctx[key](...args);  // 以 ctx.fn() 的形式呼叫，觸發隱含綁定
  } finally {
    delete ctx[key];
  }
};

Function.prototype.myApply = function (thisArg, args = []) {
  return this.myCall(thisArg, ...args);
};

Function.prototype.myBind = function (thisArg, ...preset) {
  const fn = this;
  function bound(...args) {
    // 被 new 呼叫時，忽略綁定的 this
    return new.target ? new fn(...preset, ...args) : fn.myCall(thisArg, ...preset, ...args);
  }
  if (fn.prototype) bound.prototype = Object.create(fn.prototype);
  return bound;
};
```

### `new`

以下版本適用於一般建構函式，不支援必須透過 `new` 執行的 `class`，也沒有完整處理 `new.target`、非物件的 `prototype` 等情況。需要原生建構語意時使用 `Reflect.construct(Ctor, args)`。

```js
function myNew(Ctor, ...args) {
  const obj = Object.create(Ctor.prototype);   // 建立物件並設定原型
  const result = Ctor.apply(obj, args);        // 以 obj 為 this 執行建構函式
  const isObject = result !== null && (typeof result === "object" || typeof result === "function");
  return isObject ? result : obj;              // 建構函式回傳物件就用它
}
```

`instanceof` 的實作見「物件、原型與類別」。

### EventEmitter（發布訂閱）

```js
class EventEmitter {
  #events = new Map();

  on(event, listener) {
    if (!this.#events.has(event)) this.#events.set(event, []);
    this.#events.get(event).push(listener);
    return () => this.off(event, listener);   // 回傳取消訂閱的函式，方便清理
  }

  off(event, listener) {
    const list = this.#events.get(event);
    if (!list) return this;
    const i = list.findIndex((l) => l === listener || l.original === listener);
    if (i !== -1) list.splice(i, 1);
    if (list.length === 0) this.#events.delete(event);
    return this;
  }

  once(event, listener) {
    const wrapper = (...args) => {
      this.off(event, wrapper);
      listener.apply(this, args);
    };
    wrapper.original = listener;              // 讓 off(event, 原本的 listener) 也能移除
    return this.on(event, wrapper);
  }

  emit(event, ...args) {
    const list = this.#events.get(event);
    if (!list) return false;
    for (const listener of [...list]) listener.apply(this, args); // 複製一份，避免執行中被修改
    return true;
  }
}
```

`emit` 時要走訪**複本**，否則 `once` 的監聽器在執行中把自己移除，會讓陣列索引位移、跳過下一個監聽器。

## 資料處理

### 深拷貝

```js
function deepClone(value, seen = new WeakMap()) {
  if (value === null || typeof value !== "object") return value; // 原始值與函式直接回傳
  if (seen.has(value)) return seen.get(value);                    // 處理循環參考

  if (value instanceof Date) {
    const copy = new Date(value);
    seen.set(value, copy);
    return copy;
  }
  if (value instanceof RegExp) {
    const copy = new RegExp(value.source, value.flags);
    copy.lastIndex = value.lastIndex;
    seen.set(value, copy);
    return copy;
  }

  if (value instanceof Map) {
    const copy = new Map();
    seen.set(value, copy);
    value.forEach((v, k) => copy.set(deepClone(k, seen), deepClone(v, seen)));
    return copy;
  }
  if (value instanceof Set) {
    const copy = new Set();
    seen.set(value, copy);
    value.forEach((v) => copy.add(deepClone(v, seen)));
    return copy;
  }

  const copy = Array.isArray(value) ? [] : Object.create(Object.getPrototypeOf(value)); // 保留原型
  seen.set(value, copy);
  for (const key of Reflect.ownKeys(value)) {   // 包含 Symbol 鍵
    copy[key] = deepClone(value[key], seen);
  }
  return copy;
}
```

講解重點：

- `WeakMap` 記錄已經複製過的物件，解決循環參考，也讓同一個物件被多處引用時，複本裡也是同一個物件。
- 用 `Object.create(Object.getPrototypeOf(value))` 保留原型；只依賴已複製欄位的方法通常能使用，但依賴私有欄位或內部狀態的方法仍可能失敗。
- `Reflect.ownKeys` 包含不可列舉屬性與 Symbol 鍵，但此版本沒有保留屬性描述（例如 writable、enumerable、getter / setter）；讀取 getter 時還會執行它。另未完整處理私有欄位 `#x`、TypedArray、DOM 節點與內建物件的自訂屬性，僅適合受控資料。遞迴太深可能爆堆疊。
- 實務上，資料型別支援時優先用 `structuredClone`；它也不能複製函式、DOM 節點，且不會保留自訂類別的原型與方法。

### 陣列攤平

```js
// 遞迴版
function flatten(arr, depth = 1) {
  return depth > 0
    ? arr.reduce((acc, v) => acc.concat(Array.isArray(v) ? flatten(v, depth - 1) : v), [])
    : arr.slice();
}

// 迴圈版：不怕層數太深爆堆疊
function flattenDeep(arr) {
  const stack = [...arr];
  const result = [];
  while (stack.length) {
    const v = stack.pop();
    if (Array.isArray(v)) stack.push(...v);
    else result.push(v);
  }
  return result.reverse();
}

flatten([1, [2, [3, [4]]]], 2);     // [ 1, 2, 3, [ 4 ] ]
flattenDeep([1, [2, [3, [4]]], 5]); // [ 1, 2, 3, 4, 5 ]
```

### LRU 快取

利用 `Map` 依插入順序走訪的特性，`get` 和 `set` 都是 O(1)。如果面試官要求不能用 `Map` 的順序特性，就改用「雜湊表 + 雙向鏈結串列」，和 Java 的 `LinkedHashMap` 原理相同。

```js
class LRUCache {
  #capacity;
  #map = new Map(); // Map 保持插入順序：最前面的是最久沒用的

  constructor(capacity) { this.#capacity = capacity; }

  get(key) {
    if (!this.#map.has(key)) return undefined;
    const value = this.#map.get(key);
    this.#map.delete(key);   // 刪掉再放回，移到最後面（最近使用）
    this.#map.set(key, value);
    return value;
  }

  set(key, value) {
    this.#map.delete(key);
    this.#map.set(key, value);
    if (this.#map.size > this.#capacity) {
      this.#map.delete(this.#map.keys().next().value); // 淘汰最前面的
    }
    return this;
  }
}
```

### 物件路徑取值與模板渲染

```js
function get(obj, path, fallback) {
  const keys = Array.isArray(path) ? path : path.replace(/\[(\w+)\]/g, ".$1").split(".");
  let cur = obj;
  for (const k of keys) {
    if (cur == null) return fallback;
    cur = cur[k];
  }
  return cur === undefined ? fallback : cur;
}

function render(template, data) {
  return template.replace(/\{\{\s*([\w.[\]]+)\s*\}\}/g, (_, path) => String(get(data, path, "")));
}

const data = { user: { name: "Joe", tags: ["admin"] } };
get(data, "user.tags[0]");                              // admin
get(data, "user.age", 18);                              // 18
render("Hi {{ user.name }} ({{user.tags[0]}})", data);  // Hi Joe (admin)
```

## 非同步

### `Promise.all`

```js
function promiseAll(iterable) {
  return new Promise((resolve, reject) => {
    const items = Array.from(iterable);
    const results = new Array(items.length);
    let remaining = items.length;
    if (remaining === 0) return resolve(results);
    items.forEach((item, i) => {
      Promise.resolve(item).then((value) => {
        results[i] = value;            // 用索引存放，保證順序和輸入一致
        if (--remaining === 0) resolve(results);
      }, reject);                      // 任一失敗就整體失敗；之後的 reject 會被忽略
    });
  });
}
```

常見錯誤：

- 用 `results.push(value)`：順序會依完成時間而亂掉。
- 用 `results.length === items.length` 判斷完成：稀疏陣列的 `length` 一開始就是滿的。
- 忘記處理空陣列：永遠不會 resolve。
- 忘記用 `Promise.resolve` 包裝非 Promise 的值。

延伸：`race` 直接 `items.forEach(p => Promise.resolve(p).then(resolve, reject))`；`any` 是把 `all` 的成功與失敗角色互換，全部失敗時拋 `AggregateError`。

### `sleep` 與帶重試的請求

```js
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function retry(fn, { retries = 3, baseDelay = 100, signal } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      if (attempt >= retries || signal?.aborted) throw err;
      const delay = baseDelay * 2 ** attempt * (0.5 + Math.random() / 2); // 指數退避 + 抖動
      await sleep(delay);
    }
  }
}
```

- **指數退避**避免失敗後立刻大量重試，把已經有問題的服務壓垮。
- **抖動**（jitter）讓多個客戶端的重試時間錯開，避免同時湧入（thundering herd）。
- 只重試**暫時性**錯誤（逾時、503、網路錯誤）；400、401 這類錯誤重試也沒用。非冪等的操作（例如扣款）要有冪等鍵才能安全重試。

### 並行數量限制

題目：有 100 個 URL 要抓，但同一時間最多只能有 3 個請求在進行。

```js
async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function runner() {
    while (next < items.length) {
      const i = next++;                 // 單執行緒：這一行不會有競爭問題
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runner));
  return results;
}
```

- 開 `limit` 個「工人」，每個工人做完一件就去拿下一件，這比「每三個一批」的做法好，因為不會被一批裡最慢的那個拖住。
- `next++` 不需要鎖，因為 JavaScript 是單執行緒，`await` 之間的同步程式碼不會被打斷。
- 這個版本遇到錯誤會讓整體失敗，但其他工人還會繼續跑；要「一個失敗就全部停止」可以加上 `AbortController`。
- 實務上可以用 `p-limit` 套件。

### 簡易版 Promise

這個版本用來理解結果傳遞與微任務，沒有完整實作原生 Promise 的子類別、未處理拒絕通知等機制。正式程式使用原生 Promise。

```js
class MyPromise {
  #state = "pending";
  #value;
  #handlers = [];

  constructor(executor) {
    const settle = (state, value) => {
      if (this.#state !== "pending") return;   // 狀態只能改變一次
      this.#state = state;
      this.#value = value;
      this.#handlers.forEach((h) => h());
      this.#handlers = [];
    };
    const resolve = (value) => {
      if (value === this) return settle("rejected", new TypeError("不能 resolve 自己"));
      if (value !== null && (typeof value === "object" || typeof value === "function")) {
        let then;
        try { then = value.then; } catch (e) { return settle("rejected", e); }
        if (typeof then === "function") {      // 解開 thenable
          let called = false;
          queueMicrotask(() => {
            try {
              then.call(value,
              (v) => { if (!called) { called = true; resolve(v); } },
              (e) => { if (!called) { called = true; settle("rejected", e); } });
            } catch (e) {
              if (!called) { called = true; settle("rejected", e); }
            }
          });
          return;
        }
      }
      settle("fulfilled", value);
    };
    // 第一次呼叫就鎖定結果，即使還在等待另一個 Promise。
    let locked = false;
    const resolveOnce = (value) => {
      if (locked) return;
      locked = true;
      resolve(value);
    };
    const rejectOnce = (reason) => {
      if (locked) return;
      locked = true;
      settle("rejected", reason);
    };
    try {
      executor(resolveOnce, rejectOnce);
    } catch (e) {
      rejectOnce(e);
    }
  }

  then(onFulfilled, onRejected) {
    return new MyPromise((resolve, reject) => {
      const run = () => queueMicrotask(() => {   // 回呼一律非同步執行
        const cb = this.#state === "fulfilled" ? onFulfilled : onRejected;
        if (typeof cb !== "function") {          // 沒給回呼：值或錯誤往下傳
          return this.#state === "fulfilled" ? resolve(this.#value) : reject(this.#value);
        }
        try { resolve(cb(this.#value)); } catch (e) { reject(e); }
      });
      if (this.#state === "pending") this.#handlers.push(run);
      else run();
    });
  }

  catch(onRejected) { return this.then(undefined, onRejected); }

  finally(onFinally) {
    if (typeof onFinally !== "function") return this.then(onFinally, onFinally);
    return this.then(
      (v) => MyPromise.resolve(onFinally()).then(() => v),
      (e) => MyPromise.resolve(onFinally()).then(() => { throw e; }),
    );
  }

  static resolve(v) { return v instanceof MyPromise ? v : new MyPromise((r) => r(v)); }
  static reject(e) { return new MyPromise((_, r) => r(e)); }
}
```

Promises/A+ 的核心規則：

1. 狀態只能從 `pending` 改變一次。
2. `then` 的回呼一律**非同步**執行（用微任務），即使 Promise 已經完成。
3. `then` 回傳新的 Promise；回呼的回傳值決定新 Promise 的結果，回呼拋錯則新 Promise 失敗。
4. 回傳值如果是 thenable 要「解開」，這是不同 Promise 實作能互通的關鍵。
5. 沒有提供回呼時，值或錯誤要穿透到下一個 `then`。
