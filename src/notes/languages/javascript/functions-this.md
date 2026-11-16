# 函式與 this

## `this` 的決定方式

### 四條規則

一般函式的 `this` 是在**呼叫時**決定的，看「怎麼被呼叫」。依優先順序有四條規則：

1. **`new` 綁定**：用 `new` 呼叫，`this` 是新建立的物件。
2. **明確綁定**：用 `call`、`apply`、`bind` 指定，`this` 是指定的物件。
3. **隱含綁定**：用 `obj.fn()` 呼叫，`this` 是點前面的 `obj`。
4. **預設綁定**：直接 `fn()` 呼叫，嚴格模式下是 `undefined`，非嚴格模式是全域物件。

箭頭函式例外：它沒有自己的 `this`，用的是**定義時**外層的 `this`，而且無法用上面任何方式改變。

```js
"use strict";
const obj = {
  name: "obj",
  regular() { return this?.name; },
  arrow: () => typeof this,
};
const fn = obj.regular;
console.log(obj.regular());                        // obj
console.log(fn());                                 // undefined：預設綁定
console.log(obj.regular.call({ name: "other" }));  // other
```

好記的總結：「`this` 指向最後呼叫它的那個物件」，再加上 `new`、`bind` 和箭頭函式三個例外。

### `this` 遺失

把物件的方法「拿出來」單獨傳遞時，`this` 就會遺失，因為呼叫時已經沒有點前面的物件。最常見的三個情境：當成回呼函式傳入（`setTimeout(obj.fn)`）、解構方法（`const { fn } = obj`）、當成事件處理器傳入。

```js
class Timer {
  seconds = 0;
  tick() { this.seconds++; }
}
const t = new Timer();
const tick = t.tick;
try { tick(); } catch (e) { console.log(e.constructor.name); } // TypeError：this 是 undefined
```

修法：

1. 用箭頭函式包一層：`setTimeout(() => t.tick(), 1000)`。
2. 用 `bind`：`setTimeout(t.tick.bind(t), 1000)`。
3. 用類別欄位宣告箭頭函式：`tick = () => { this.seconds++; }`。缺點是每個實例都有一份函式，不在原型上。

### `call`、`apply`、`bind`

三者都能指定函式執行時的 `this`。`call` 和 `apply` 會立即執行函式，差別是參數的傳法：`call` 逐個傳，`apply` 用陣列傳。`bind` 不會執行，而是回傳一個 `this` 已經被永久綁定的新函式。

```js
function greet(greeting, mark) { return `${greeting}, ${this.name}${mark}`; }
const user = { name: "Joe" };
greet.call(user, "Hi", "!");      // Hi, Joe!
greet.apply(user, ["Hi", "?"]);   // Hi, Joe?
const bound = greet.bind(user, "Hello");
bound(".");                       // Hello, Joe.
```

- 被 `bind` 過的函式再 `bind` 一次，`this` 不會改變，只有參數會繼續累加。
- 用 `new` 呼叫被 `bind` 過的函式時，`new` 的優先權更高，`this` 會是新物件。

## 箭頭函式

箭頭函式不是一般函式的簡寫，而是一種「輕量函式」，差別有五點：

1. 沒有自己的 `this`，用外層的 `this`，`call` / `apply` / `bind` 也改不了。
2. 沒有 `arguments`，要用其餘參數 `...args`。
3. 不能用 `new` 呼叫，也沒有 `prototype` 屬性。
4. 不能當作產生器（不能用 `yield`）。
5. 沒有 `super` 和 `new.target`，用的都是外層的。

**什麼時候不要用箭頭函式**：

- 物件的方法需要用 `this` 存取物件本身時。
- 原型方法。
- 需要 `this` 指向觸發元素的 DOM 事件處理器（`this` 會是外層，而不是 `event.currentTarget`）。

**什麼時候適合**：回呼函式需要沿用外層的 `this`，例如類別方法裡的 `setTimeout`、`map`、`then`。

## 函式的各種細節

### 函式宣告與函式表達式

函式宣告（`function foo() {}`）整個被提升，在宣告之前就能呼叫；函式表達式（`const foo = function () {}`）只有變數被提升，在賦值之前不能呼叫。具名函式表達式的名稱只在函式內部可見，適合用來遞迴和讓堆疊追蹤更清楚。

### `arguments` 與其餘參數

一般函式內可以用 `arguments` 拿到所有傳入的參數。它是類陣列物件，有 `length` 和索引，但沒有 `map`、`forEach` 等陣列方法。現代寫法改用其餘參數 `...args`，它是真正的陣列，在箭頭函式裡也能用。

```js
function legacy() { return Array.from(arguments).join("-"); }
const modern = (...args) => args.join("-");
console.log(legacy(1, 2, 3), modern(1, 2, 3)); // 1-2-3 1-2-3
```

### 預設參數

預設參數只在參數為 `undefined` 時生效，傳 `null` 不會套用預設值。預設值在**每次呼叫時**重新計算，所以不會有 Python 那種預設可變物件被共用的問題。

```js
function f(x = 10) { return x; }
console.log(f(), f(undefined), f(null)); // 10 10 null

function push(item, list = []) { list.push(item); return list; }
console.log(push(1), push(2)); // [ 1 ] [ 2 ]：每次都是新陣列
```

### `length` 與 `name`

`length` 是「預期的參數數量」，只計算第一個有預設值或其餘參數之前的參數；`name` 是函式名稱，匿名函式賦值給變數時會自動推斷名稱。手寫柯里化時常用 `fn.length` 判斷參數是否收集完畢。

```js
((a, b) => {}).length;        // 2
((a, b = 1, c) => {}).length; // 1
((...args) => {}).length;     // 0
const handler = () => {};
handler.name;                 // handler
```

## `new` 與 `new.target`

### `new` 做了哪些事

1. 建立一個空物件。
2. 把這個物件的原型（`[[Prototype]]`）指向建構函式的 `prototype`。
3. 用這個物件當作 `this` 執行建構函式。
4. 如果建構函式回傳了一個物件，就用那個物件；否則回傳第 1 步建立的物件。

### `new.target`

在函式或建構子裡，`new.target` 會指向被 `new` 呼叫的那個建構函式；如果函式不是用 `new` 呼叫，它就是 `undefined`。可以用來防止建構函式被直接呼叫，或實作「抽象類別」。

```js
class Shape {
  constructor() {
    if (new.target === Shape) throw new TypeError("Shape 是抽象類別，不能直接建立");
  }
}
class Circle extends Shape {}
new Circle(); // 可以
try { new Shape(); } catch (e) { console.log(e.message); } // Shape 是抽象類別，不能直接建立
```
