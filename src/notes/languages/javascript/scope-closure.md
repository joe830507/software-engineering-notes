# 作用域、提升與閉包

## 變數宣告

### `var`、`let`、`const`

三點差異：

- **作用域**：`var` 是函式作用域，`let` / `const` 是區塊作用域。
- **提升**：三者都會提升，但 `let` / `const` 在宣告前處於暫時性死區（TDZ），存取會報錯。
- **重複宣告與重新賦值**：`var` 可以重複宣告，`let` 不行，`const` 宣告時必須給值且不能重新賦值。

| | `var` | `let` | `const` |
| --- | --- | --- | --- |
| 作用域 | 函式 | 區塊 | 區塊 |
| 宣告前存取 | `undefined` | `ReferenceError` | `ReferenceError` |
| 重複宣告 | 可以 | 不行 | 不行 |
| 重新賦值 | 可以 | 可以 | 不行 |
| 全域宣告時變成 `globalThis` 的屬性 | 是（僅限傳統 script） | 否 | 否 |

- `const` 只保證「變數不能重新指向別的值」，不保證物件內容不變。要讓物件不可變，用 `Object.freeze`（只凍結一層）。
- 實務規則：預設用 `const`，需要重新賦值才用 `let`，不要用 `var`。

### 提升（Hoisting）

JavaScript 在執行一段程式之前，會先掃描宣告，把變數和函式「登記」到作用域中，看起來像是宣告被搬到最上面。`var` 提升後初始值是 `undefined`；函式宣告是整個函式本體一起提升；`let`、`const`、`class` 也有提升，但在宣告之前不能存取。

```js
console.log(a);  // undefined
var a = 1;

sayHi();         // 可以呼叫：函式宣告整個被提升
function sayHi() { console.log("hi"); }

try { sayBye(); } catch (e) { console.log(e.constructor.name); } // TypeError
var sayBye = function () {}; // 函式表達式：只有變數 sayBye 被提升，值是 undefined
```

- 提升的本質不是「搬程式碼」，而是執行環境建立時分成兩個階段：**建立階段**登記所有宣告，**執行階段**才逐行賦值。
- 同名時，函式宣告的優先權高於 `var` 宣告，但會被後面的 `var` 賦值蓋掉。

### 暫時性死區（TDZ）

`let`、`const`、`class` 宣告的變數，從進入區塊開始到宣告那一行執行完之前，這段範圍叫 TDZ。在 TDZ 裡存取變數會拋 `ReferenceError`。它證明了 `let` 也有提升，否則下面的程式會印出外層的值。

```js
const value = "outer";
{
  try {
    console.log(value); // 不會讀到外層的 "outer"
  } catch (e) {
    console.log(e.name); // ReferenceError
  }
  const value = "inner";
}
```

TDZ 也會出現在預設參數：`function f(a = b, b = 1) {}` 呼叫 `f()` 會報錯，因為算 `a` 的預設值時 `b` 還在 TDZ。

### 嚴格模式

在檔案或函式開頭寫 `"use strict"` 開啟，它把很多「靜默失敗」改成直接報錯。ES 模組和 `class` 內部自動就是嚴格模式，所以現代程式碼基本上都在嚴格模式下執行。

主要差異：

- 對未宣告的變數賦值會拋 `ReferenceError`，不會偷偷建立全域變數。
- 一般函式呼叫時 `this` 是 `undefined`，不是全域物件。
- 對唯讀屬性賦值、刪除不可刪除的屬性會拋 `TypeError`。
- 不允許重複的參數名稱、不允許 `with`、不允許八進位字面值 `010`。
- `arguments` 不再和參數同步。

## 作用域與執行環境

### 作用域鏈

每個函式在**定義的時候**就記住了它外層的作用域。查找變數時，先在目前作用域找，找不到就往外層找，一直到全域，這條鏈就是作用域鏈。JavaScript 是**詞法作用域**，看的是程式碼寫在哪裡，不是在哪裡被呼叫。

```js
const x = "global";
function outer() {
  const x = "outer";
  return function inner() { return x; };
}
function run(fn) {
  const x = "run";
  return fn();
}
console.log(run(outer())); // outer：看定義位置，不看呼叫位置
```

有什麼東西是「動態」決定的？`this`。作用域在定義時決定，`this` 在呼叫時決定（箭頭函式除外），這是兩者最容易搞混的地方。

### 執行環境與呼叫堆疊

每次執行全域程式碼或呼叫一個函式，引擎就建立一個執行環境，裡面記錄了這段程式的變數（環境紀錄）、外層作用域的參考、以及 `this` 的值。執行環境用一個堆疊管理，叫呼叫堆疊（call stack）：呼叫函式就推入，函式返回就彈出。JavaScript 是單執行緒，所以同一時間只有一個呼叫堆疊。

- 遞迴太深會讓堆疊爆掉，拋 `RangeError: Maximum call stack size exceeded`。V8 的預設上限大約是一萬層，實際數字依堆疊框架大小而定。
- ES2015 規格雖然有尾呼叫最佳化（TCO），但只有 Safari 實作，V8 沒有。不要依賴它，深度遞迴請改成迴圈。

## 閉包

### 什麼是閉包

閉包就是「函式加上它定義時所在的作用域」。當一個內層函式被傳到外面使用，它仍然能存取外層函式的變數，即使外層函式已經執行完畢。常見用途：私有變數、函式工廠、記憶化、防抖節流、模組模式。

```js
function createCounter() {
  let count = 0; // 外面無法直接存取，只能透過回傳的函式
  return {
    increment: () => ++count,
    get: () => count,
  };
}
const c = createCounter();
c.increment();
c.increment();
console.log(c.get()); // 2
console.log(c.count); // undefined
```

- 嚴格來說，JavaScript 的每個函式都是閉包，因為每個函式都記住了外層作用域。面試時講「內層函式被帶到外面使用」是最好理解的說法。
- 閉包保留的是**變數本身**（參考），不是當時的值的複本，所以外層變數之後改了，閉包讀到的也是新值。

### 經典題：`for` + `setTimeout`

用 `var` 會印出三次 3，因為 `var` 是函式作用域，三個回呼共用同一個 `i`，等計時器觸發時迴圈早已結束。改用 `let` 會印出 0、1、2，因為 `let` 在每一次迭代都會建立新的綁定。

```js
for (var i = 0; i < 3; i++) {
  setTimeout(() => console.log("var", i), 0); // var 3（三次）
}
for (let j = 0; j < 3; j++) {
  setTimeout(() => console.log("let", j), 0); // let 0、let 1、let 2
}
```

不能用 `let` 時的修法：

```js
// 1. IIFE 為每次迭代建立新的作用域
for (var i = 0; i < 3; i++) {
  ((n) => setTimeout(() => console.log("iife", n), 0))(i);
}
// 2. setTimeout 的第三個參數
setTimeout((n) => console.log(n), 0, i);
// 3. bind
setTimeout(console.log.bind(null, i), 0);
```

「每隔一秒印出 1 到 5」更好的寫法是 `async` / `await` 搭配 `sleep`：

```js
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function printEverySecond() {
  for (let i = 1; i <= 5; i++) {
    await sleep(1000);
    console.log(i);
  }
}
```

### 閉包會造成記憶體洩漏嗎

閉包本身不是洩漏。只有當閉包被一個**長期存在的東西**（全域變數、事件監聽、計時器、快取）引用，又抓住了大物件，而且不再需要時沒有解除，才會變成洩漏。

```js
// 有問題：每次呼叫都註冊監聽，且閉包抓住了大陣列
function attach(el) {
  const bigData = new Array(1_000_000).fill("x");
  el.addEventListener("click", () => console.log(bigData.length));
}
```

- V8 會分析閉包實際用到哪些變數，只保留用到的。但同一個外層作用域裡的**多個**閉包共用同一個環境物件，只要有一個閉包用到大物件，其他閉包也會讓它存活。
- 修法：元件卸載時移除監聽（或用 `AbortController` 的 `signal` 一次移除）、清掉計時器、快取改用 `WeakMap` 或設上限。

### IIFE

「立即呼叫的函式表達式」，寫法是 `(function () { ... })()`。在沒有區塊作用域和模組的年代，用它建立獨立作用域避免污染全域。現在有 `let` / `const` 和 ES 模組，大多數情況已經不需要；剩下的用途是在不支援頂層 `await` 的環境裡包一層 `(async () => { ... })()`。

## 函式式概念

### 柯里化（Currying）

把一個接收多個參數的函式，轉換成一連串只接收一個參數的函式，例如 `add(1, 2, 3)` 變成 `add(1)(2)(3)`。它靠閉包把已經傳進來的參數存起來，等參數收集夠了才真正執行。用途是方便做「部分套用」，例如先固定 log 等級，產生專用的 logger。

### 純函式與副作用

純函式符合兩個條件：相同的輸入一定得到相同的輸出；執行時不會影響外部狀態，也就是沒有副作用。修改參數、修改全域變數、發送網路請求、寫檔案、操作 DOM、甚至 `console.log`，都算副作用。純函式好測試、好快取、可以安全地平行化，React 的 reducer 和 render 都要求是純函式。

### 高階函式

接收函式當參數，或是回傳一個函式的函式。`map`、`filter`、`reduce`、`setTimeout`、`addEventListener` 都是；防抖、節流、`bind`、柯里化都是回傳函式的高階函式。這是 JavaScript 函式為「一等公民」的直接結果。
