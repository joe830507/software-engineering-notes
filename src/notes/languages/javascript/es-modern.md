# ES6+ 語法與版本特性

> 部分新規格的年份與瀏覽器支援度會隨時間變動，標註「以 MDN 相容性表為準」的地方，使用前請再查一次。

## 版本特性總覽

ES2015（ES6）是 JavaScript 最大的一次更新，重點有：`let` / `const`、箭頭函式、`class`、模板字串、解構賦值、預設參數與其餘參數、展開運算子、Promise、ES 模組、`Map` / `Set` / `WeakMap` / `WeakSet`、`Symbol`、迭代器與 `for...of`、產生器、`Proxy` / `Reflect`。之後每年 6 月發佈一個小版本。

| 版本 | 重點 |
| --- | --- |
| ES2016 | `Array.prototype.includes`、`**` 次方運算子 |
| ES2017 | `async` / `await`、`Object.values` / `entries`、`padStart` / `padEnd` |
| ES2018 | 物件的展開與其餘屬性、`for await...of`、`Promise.prototype.finally`、正規表示式命名群組 |
| ES2019 | `flat` / `flatMap`、`Object.fromEntries`、可省略的 `catch` 參數 |
| ES2020 | `?.`、`??`、`BigInt`、`Promise.allSettled`、`globalThis`、動態 `import()` |
| ES2021 | `Promise.any`、`replaceAll`、邏輯賦值 `&&=` `\|\|=` `??=`、數字分隔符 `1_000`、`WeakRef` |
| ES2022 | 類別私有欄位與方法、`static` 區塊、頂層 `await`、`.at()`、`Object.hasOwn`、`Error` 的 `cause` |
| ES2023 | 不修改原陣列的 `toSorted` / `toReversed` / `toSpliced` / `with`、`findLast` / `findLastIndex` |
| ES2024 | `Object.groupBy` / `Map.groupBy`、`Promise.withResolvers`、正規表示式 `v` 旗標、可調整大小的 `ArrayBuffer` |
| ES2025 | Iterator helpers、`Set` 的集合運算方法、`Promise.try`、JSON modules、`RegExp.escape`、`Float16Array` |
| ES2026 | `Error.isError`、`Math.sumPrecise`、`Array.fromAsync`、`Iterator.concat`、`Uint8Array` 的 Base64 / Hex 轉換、`JSON.parse` 讀取原始文字 |
| ES2027（預計） | Temporal、顯式資源管理（`using`）等，納入哪一版以 TC39 的 finished proposals 清單為準 |

面試不需要背年份，但要能說出 3～5 個近年實際用過的新特性，以及它解決了什麼問題。例如「以前排序會改到原陣列，React 的 state 要先複製再排序，現在直接用 `toSorted`」。

## 常用語法

### 解構賦值

```js
const user = { id: 1, profile: { name: "Joe" }, roles: ["admin", "dev"] };
const { id, profile: { name }, roles: [firstRole], email = "無" } = user;
console.log(id, name, firstRole, email); // 1 Joe admin 無

let a = 1, b = 2;
[a, b] = [b, a];          // 交換變數

function createUser({ name, age = 18 } = {}) { return `${name}:${age}`; }
createUser({ name: "Amy" }); // Amy:18
createUser();                // undefined:18
```

解構 `null` 或 `undefined` 會拋 `TypeError`，所以函式參數解構通常給預設值 `= {}`。

### 展開與其餘

語法一樣是三個點，但用途相反。**展開**是把陣列或物件「攤開」，用在函式呼叫的參數、陣列字面值、物件字面值裡；**其餘**是把多個值「收集」成一個陣列或物件，用在函式參數和解構賦值的左邊。

```js
const nums = [3, 1, 2];
Math.max(...nums);                                                // 3：展開
const [first, ...rest] = nums;                                    // 其餘
const { password, ...safeUser } = { name: "Joe", password: "x" }; // 移除敏感欄位的常見寫法
```

物件展開只複製**自有且可列舉**的屬性，是淺拷貝；後面的屬性會覆蓋前面同名的屬性。

### `?.` 與 `??`

`?.` 是可選鏈，左邊是 `null` 或 `undefined` 時直接回傳 `undefined`，不會拋錯，也不會繼續執行右邊。`??` 是空值合併，只有左邊是 `null` 或 `undefined` 時才用右邊的值；`||` 則是左邊是任何 falsy 值（包括 `0` 和空字串）就用右邊。

```js
const config = { retries: 0, server: null };
config.retries || 3;       // 3：錯了，0 被當成沒設定
config.retries ?? 3;       // 0：正確
config.server?.host;       // undefined
config.logger?.info("x");    // undefined：logger 不存在時，跳過後面的存取與呼叫
config.logger?.info?.("x");  // logger 或 info 是 null / undefined 時都會跳過
```

`??` 不能直接和 `||`、`&&` 混用，`a || b ?? c` 是語法錯誤，必須加括號。

`logger?.info("x")` 只檢查 logger；若 logger 存在但 info 不存在，仍會拋錯。`logger?.info?.("x")` 則也檢查 info，但若 info 存在卻不是函式，仍會拋 `TypeError`。

### 標籤模板

在模板字串前面加上一個函式名稱，這個函式會收到「切開的字串陣列」和「插入的值」，可以自訂組合方式。常見用途：安全地組 SQL（把值變成參數而不是直接串接）、HTML 跳脫、CSS-in-JS、GraphQL 查詢。

```js
function sql(strings, ...values) {
  const text = strings.reduce((acc, s, i) => acc + `$${i}` + s);
  return { text, values };
}
const id = "1; DROP TABLE users";
sql`SELECT * FROM users WHERE id = ${id} AND active = ${true}`;
// { text: 'SELECT * FROM users WHERE id = $1 AND active = $2', values: [ '1; DROP TABLE users', true ] }
```

`String.raw` 是內建的標籤函式，會保留反斜線，不做跳脫處理，寫正規表示式或 Windows 路徑時很方便。

## 集合與迭代

### `Map` 與物件

| | 物件 | `Map` |
| --- | --- | --- |
| 鍵的型別 | 字串或 Symbol（其他會被轉成字串） | 任何值，包括物件和函式 |
| 順序 | 整數鍵優先，有特殊規則 | 嚴格依插入順序 |
| 大小 | 要自己算 `Object.keys(o).length` | `map.size` |
| 預設鍵 | 有原型上的鍵，可能衝突 | 沒有 |
| 頻繁增刪的效能 | 較差 | 針對增刪最佳化 |
| JSON 序列化 | 直接支援 | 要先轉成陣列或物件 |

結構固定、要序列化的「紀錄」用物件；鍵是動態的、會頻繁增刪的「字典」或快取用 `Map`。

### `WeakMap`、`WeakSet`、`WeakRef`

`WeakMap` 的鍵必須是物件（或未註冊的 Symbol），而且是**弱參考**：當鍵物件在其他地方都沒有被引用時，垃圾回收器可以回收它，對應的項目也會自動消失。所以 `WeakMap` 不能走訪、沒有 `size`。典型用途是「把額外資料附加到別人的物件上，又不影響它被回收」，例如 DOM 節點的快取、物件的私有資料。

```js
const cache = new WeakMap();
function getMetadata(obj) {
  if (!cache.has(obj)) cache.set(obj, { computedAt: Date.now() });
  return cache.get(obj);
}
```

`WeakRef` 可以建立一個不阻止回收的參考，用 `deref()` 取值，物件被回收後回傳 `undefined`；`FinalizationRegistry` 可以在物件被回收後收到通知。但回收時機不確定，規格明確建議盡量避免使用，不能拿來做必須執行的清理工作。

### 迭代器協定

一個物件只要有 `[Symbol.iterator]()` 方法，回傳一個有 `next()` 方法的迭代器，而 `next()` 回傳 `{ value, done }`，它就是可迭代的，可以用在 `for...of`、展開運算子、解構、`Array.from`、`Promise.all`。最簡單的實作方式是用產生器。

```js
class Range {
  constructor(from, to) { this.from = from; this.to = to; }
  *[Symbol.iterator]() {
    for (let i = this.from; i <= this.to; i++) yield i;
  }
}
[...new Range(1, 5)]; // [ 1, 2, 3, 4, 5 ]
```

`for...in` 走訪物件的**鍵**（包括繼承的可列舉屬性），用在陣列上會拿到字串索引；`for...of` 走訪可迭代物件的**值**，一般物件不能直接用。

### Iterator helpers

ES2025 在 `Iterator.prototype` 加入 `map`、`filter`、`take`、`drop`、`flatMap`、`reduce`、`toArray` 等方法。內建迭代器與產生器物件可以使用；自行建立、只有 `next()` 的迭代器可先用 `Iterator.from()` 包裝。

其中 `map`、`filter`、`take` 等轉換是**惰性求值**：先記住要做的操作，取值時才逐個處理，不建立中間陣列。`reduce`、`toArray` 則會實際消費迭代器；處理無限序列時，應先用 `take` 限制數量，否則可能永遠無法完成。

```js
function* naturals() { let n = 1; while (true) yield n++; }
naturals()
  .filter((n) => n % 2 === 0)
  .map((n) => n * n)
  .take(3)
  .toArray();   // [ 4, 16, 36 ]
```

相當於 Java 的 Stream，同樣是惰性的，也同樣只能消費一次。

### 不修改原陣列的方法

`sort`、`reverse`、`splice` 會直接修改原陣列，在 React、Redux 這類要求不可變資料的框架裡很容易出 bug。ES2023 加入了對應的不可變版本：`toSorted`、`toReversed`、`toSpliced`，以及取代索引賦值的 `with(index, value)`，都回傳新陣列。

```js
const scores = [30, 10, 20];
scores.toSorted((a, b) => a - b);   // [ 10, 20, 30 ]，scores 不變
scores.with(0, 99);                 // [ 99, 10, 20 ]
```

### `Object.groupBy`

```js
const orders = [
  { id: 1, status: "paid" },
  { id: 2, status: "pending" },
  { id: 3, status: "paid" },
];
const byStatus = Object.groupBy(orders, (o) => o.status);
byStatus.paid.map((o) => o.id); // [ 1, 3 ]
```

回傳的是**沒有原型**的物件，所以不能呼叫 `byStatus.hasOwnProperty`；分組鍵如果是物件，改用 `Map.groupBy`。

### `Set` 的集合運算

ES2025 為 `Set` 加入了 `union`（聯集）、`intersection`（交集）、`difference`（差集）、`symmetricDifference`（對稱差集）、`isSubsetOf`、`isSupersetOf`、`isDisjointFrom`，以前要用 `filter` 自己寫。

```js
const a = new Set([1, 2, 3]);
const b = new Set([2, 3, 4]);
a.intersection(b);  // Set(2) { 2, 3 }
a.difference(b);    // Set(1) { 1 }
a.union(b);         // Set(4) { 1, 2, 3, 4 }
```

## 較新的功能

### `using` 與 `await using`

顯式資源管理。用 `using` 宣告的變數，在離開區塊時會自動呼叫它的 `[Symbol.dispose]()`；`await using` 則會呼叫並等待 `[Symbol.asyncDispose]()`。用途是確保檔案、資料庫連線、鎖一定會被釋放，不用再寫 `try/finally`。目前的支援度請以 MDN 相容性表為準。

```js
function openConnection(name) {
  console.log(`open ${name}`);
  return { name, [Symbol.dispose]() { console.log(`close ${name}`); } };
}
{
  using a = openConnection("a");
  using b = openConnection("b");
  console.log("working");
}
// open a, open b, working, close b, close a：後開的先關
```

這就是 Java 的 try-with-resources，`Symbol.dispose` 對應 `AutoCloseable.close()`。

### Temporal

`Date` 有很多設計問題：月份從 0 開始、物件可變、時區只有本地和 UTC 兩種、解析字串的行為不一致、不能表示「沒有時區的日期」。Temporal 是全新的日期時間 API，已在 2026 年 3 月進入 TC39 Stage 4，物件不可變，型別分得很清楚：

- `PlainDate`：純日期
- `ZonedDateTime`：帶時區的時刻
- `Instant`：絕對時間點
- `Duration`：時間長度

並且完整支援 IANA 時區和夏令時間。

```js
const due = Temporal.PlainDate.from("2026-01-31").add({ months: 1 });
due.toString(); // 2026-02-28：自動處理月底

const meeting = Temporal.ZonedDateTime.from("2026-10-21T10:00[Asia/Taipei]");
meeting.withTimeZone("America/New_York").toString();
// 2026-10-20T22:00:00-04:00[America/New_York]
```

設計上和 Java 8 的 `java.time` 幾乎一一對應，`PlainDate` 就是 `LocalDate`，`ZonedDateTime` 名稱都一樣。瀏覽器與 Node.js 的實作進度請以 MDN 相容性表為準。
