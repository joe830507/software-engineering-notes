# 陣列、字串與正規表示式

## 陣列

### `map`、`forEach`、`filter`、`reduce`

- `forEach` 只是走訪，回傳 `undefined`，用來做副作用。
- `map` 把每個元素轉換後回傳**同樣長度**的新陣列。
- `filter` 回傳符合條件的元素組成的新陣列。
- `reduce` 把陣列「累積」成一個值，可以是數字、物件或另一個陣列。

```js
const items = [{ price: 100, qty: 2 }, { price: 50, qty: 1 }, { price: 30, qty: 0 }];
const total = items
  .filter((i) => i.qty > 0)
  .map((i) => i.price * i.qty)
  .reduce((sum, n) => sum + n, 0);
console.log(total); // 250
```

- `forEach` 不能用 `break` 中斷，要提早結束請用 `for...of`、`some` 或 `find`。
- `reduce` 沒給初始值時，用第一個元素當初始值；空陣列沒給初始值會拋 `TypeError`，所以**一律給初始值**。

### `sort` 的預設行為

`sort` 沒有傳比較函式時，會把元素**轉成字串**再依 UTF-16 編碼排序，所以 `[10, 9, 1].sort()` 的結果是 `[1, 10, 9]`。數字排序一定要傳比較函式。

```js
[10, 9, 1].sort();                 // [ 1, 10, 9 ]
[10, 9, 1].sort((a, b) => a - b);  // [ 1, 9, 10 ]
["b", "a", "C"].sort((a, b) => a.localeCompare(b)); // [ 'a', 'b', 'C' ]
```

- 從 ES2019 開始，規格要求 `sort` 必須是**穩定排序**（相等元素保持原本順序），V8 用的是 TimSort。
- 比較函式回傳布林值（`(a, b) => a > b`）是常見錯誤，它只會回傳 0 或 1，結果不正確。

### 去重

```js
const nums = [1, 2, 2, 3, NaN, NaN];
[...new Set(nums)];                                  // [ 1, 2, 3, NaN ]
nums.filter((n, i) => nums.indexOf(n) === i);        // [ 1, 2, 3 ]：NaN 不見了

const users = [{ id: 1, n: "a" }, { id: 1, n: "b" }, { id: 2, n: "c" }];
[...new Map(users.map((u) => [u.id, u])).values()];  // 依 id 去重，保留最後一筆
```

`Set` 用 SameValueZero 比較，能正確處理 `NaN`；`indexOf` 用 `===`，`NaN` 永遠找不到自己，所以會被全部過濾掉。物件陣列去重要依某個鍵，用 `Map`。

### 攤平巢狀陣列

```js
const nested = [1, [2, [3, [4]]]];
nested.flat();          // [ 1, 2, [ 3, [ 4 ] ] ]：預設只攤平一層
nested.flat(Infinity);  // [ 1, 2, 3, 4 ]
```

### 類陣列物件

有 `length` 屬性和數字索引，但不是真正陣列的物件，例如 `arguments`、`NodeList`、字串。用 `Array.from(x)` 或展開 `[...x]` 轉換；後者要求對象是可迭代的。`Array.from` 還能傳第二個參數做轉換，例如 `Array.from({ length: 3 }, (_, i) => i)` 會得到 `[0, 1, 2]`。

## 字串

### 長度與使用者看到的字數

JavaScript 字串用 UTF-16 編碼，`length` 計算的是 **UTF-16 code unit** 的數量。emoji 和部分罕用字需要兩個 code unit（代理對），所以 `"😀".length` 是 2；組合字元（例如家庭 emoji、膚色修飾）更長。要計算「使用者看到的字數」要用 `Intl.Segmenter`。

```js
const s = "👨‍👩‍👧";
s.length;         // 8
[...s].length;    // 5：依 code point 切
const seg = new Intl.Segmenter("zh-TW", { granularity: "grapheme" });
[...seg.segment(s)].length; // 1：使用者看到的字數
```

實務影響：限制暱稱長度、截斷文字時用 `slice` 可能切斷 emoji，造成亂碼；資料庫的欄位長度又可能是用 byte 計算，三種長度要分清楚。

## 正規表示式

- **旗標**：`g` 全域、`i` 忽略大小寫、`m` 多行、`s` 讓 `.` 匹配換行、`u` Unicode 模式、`v` 更完整的 Unicode 集合語法、`y` 黏著匹配、`d` 回傳匹配索引。
- **`lastIndex` 陷阱**：有 `g` 旗標的正規表示式物件有 `lastIndex` 狀態，重複呼叫 `test` 會從上次的位置繼續，導致結果交替出現 `true` 和 `false`，是經典 bug。
- **命名群組**：`(?<year>\d{4})` 讓結果可讀；`matchAll` 一次取得所有匹配和群組。
- **跳脫使用者輸入**：把使用者輸入放進正規表示式之前，用 `RegExp.escape`（ES2025）跳脫特殊字元。
- **ReDoS**：像 `(a+)+$` 這種巢狀量詞，遇到特定輸入時運算時間會指數成長，可以讓伺服器卡死。

```js
const re = /a/g;
re.test("a");   // true
re.test("a");   // false：第二次從 lastIndex=1 開始找

const { groups } = "2026-10-21".match(/(?<y>\d{4})-(?<m>\d{2})-(?<d>\d{2})/);
groups.y;       // 2026
groups.m;       // 10
```
