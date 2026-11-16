# 型別與運算

> 版本以 ES2026、Node.js 24 LTS 與主流瀏覽器為準。有「Java 對照」的地方，是從 Java 轉過來最容易用錯直覺的地方。

## 資料型別

### 八種型別

七種原始型別：`undefined`、`null`、`boolean`、`number`、`bigint`、`string`、`symbol`；加上一種 `object`。陣列、函式、日期、Map、正規表示式都屬於 object。

- 原始型別的值**不可變**，比較時比的是值；object 比較時比的是參考（是不是同一個物件）。
- 原始值可以呼叫方法（例如 `"abc".toUpperCase()`），是因為引擎在呼叫的瞬間臨時包成 `String` 物件，用完就丟，這叫 auto-boxing。

**Java 對照**：Java 的 `int`、`long`、`double` 在 JavaScript 全部都是 `number`，也就是 IEEE 754 雙精度浮點數，沒有獨立的整數型別。

### `typeof` 的陷阱

`typeof` 回傳字串：`"undefined"`、`"boolean"`、`"number"`、`"bigint"`、`"string"`、`"symbol"`、`"object"`、`"function"`。

```js
console.log(typeof null);           // object（歷史 bug，為了相容永遠不會修）
console.log(typeof []);             // object
console.log(typeof function () {}); // function
console.log(typeof undeclaredVar);  // undefined（未宣告的變數也不會報錯）
console.log(typeof NaN);            // number
```

- `typeof null === "object"` 的原因：最早的實作用低位元標記型別，object 的標記是 `000`，而 `null` 是空指標，全部位元都是 0，所以被判成 object。
- 判斷陣列用 `Array.isArray(x)`；判斷 null 直接用 `x === null`。
- 唯一會讓 `typeof` 拋錯的情況是 TDZ：在 `let` / `const` 宣告之前對它用 `typeof`，會拋 `ReferenceError`。

### 如何精確判斷型別

原始型別用 `typeof`（`null` 用 `=== null`）；陣列用 `Array.isArray`；某個類別的實例用 `instanceof`；通用做法用 `Object.prototype.toString.call(x)`。

```js
const typeOf = (x) => Object.prototype.toString.call(x).slice(8, -1).toLowerCase();
typeOf(null);           // null
typeOf([]);             // array
typeOf(new Date());     // date
typeOf(/a/);            // regexp
typeOf(new Map());      // map
```

`instanceof` 檢查的是原型鏈，跨 iframe 或跨 realm 時會失效（每個 iframe 有自己的 `Array`），所以判斷陣列才建議用 `Array.isArray`。ES2026 新增 `Error.isError(x)`，判斷錯誤物件跨 realm 也正確。

### `null` 與 `undefined`

`undefined` 表示「還沒有給值」，是引擎給的預設值；`null` 表示「刻意設成沒有值」，是程式設計師主動給的。`null == undefined` 是 `true`，但 `null === undefined` 是 `false`。

- 會得到 `undefined` 的情況：變數宣告了沒賦值、讀取不存在的屬性、函式沒有 `return`、呼叫函式時少傳的參數。
- `Number(null)` 是 `0`，`Number(undefined)` 是 `NaN`，所以 `null + 1` 是 `1`、`undefined + 1` 是 `NaN`。
- JSON 只有 `null`，沒有 `undefined`：`JSON.stringify({ a: undefined })` 得到 `"{}"`，屬性直接消失。
- `x == null` 是唯一被廣泛接受的 `==` 用法，可以一次判斷 `null` 和 `undefined`。

### 字串是不可變的

所有字串方法都回傳新字串，不會改原本的字串。對字串的索引賦值（`s[0] = "X"`）在一般模式下靜默失敗，在嚴格模式和 ES 模組中會拋 `TypeError`。

字串串接很多次時，現代引擎內部會用 rope 結構最佳化，所以不像 Java 那樣需要 `StringBuilder`，直接用 `+=` 或 `array.join("")` 都可以。

### 包裝物件

`String`、`Number`、`Boolean` 用 `new` 呼叫會產生包裝物件，型別是 object，所以 `new String("a") === "a"` 是 `false`。不要用 `new` 建立包裝物件；不加 `new` 直接呼叫 `String(x)` 是轉型，這是正確用法。

```js
typeof new String("a");                          // object
new Boolean(false) ? "truthy" : "falsy";         // truthy：物件都是 truthy
```

### Symbol

每次呼叫 `Symbol()` 都產生一個獨一無二的值。主要用途是當物件的屬性鍵，避免和別人的屬性名稱衝突；語言本身也用一組內建 Symbol（well-known symbols）讓我們自訂物件的行為。

```js
const id = Symbol("id");
const user = { name: "Joe", [id]: 123 };
Object.keys(user);                  // [ 'name' ]：Symbol 鍵不會被列舉
JSON.stringify(user);               // {"name":"Joe"}
Symbol("a") === Symbol("a");        // false
Symbol.for("a") === Symbol.for("a"); // true：全域註冊表
```

常見的內建 Symbol：

- `Symbol.iterator`：讓物件可以被 `for...of` 走訪。
- `Symbol.asyncIterator`：讓物件可以被 `for await...of` 走訪。
- `Symbol.toPrimitive`：自訂轉型。
- `Symbol.dispose` / `Symbol.asyncDispose`：配合 `using` 自動釋放資源。

## 相等與型別轉換

### `==` 與 `===`

`===` 是嚴格相等，型別不同就直接是 `false`；`==` 是寬鬆相等，型別不同時會先做型別轉換，規則複雜又反直覺，所以除了 `x == null` 之外一律用 `===`。

```js
0 == "";          // true
0 == "0";         // true
"" == "0";        // false（相等不具遞移性）
null == 0;        // false
null >= 0;        // true（比較運算子走的是另一套規則）
[] == false;      // true
[] == ![];        // true
```

`==` 的轉換大致規則：

1. `null` 和 `undefined` 只和彼此（以及自己）相等，不和其他任何值相等。
2. 數字和字串比較，字串轉成數字。
3. 有一邊是布林值，先把布林值轉成數字（`true` → 1、`false` → 0）。
4. 有一邊是物件，另一邊是原始值，物件先轉成原始值（呼叫 `valueOf`、`toString`）。

`[] == ![]` 的推導：`![]` 是 `false`（物件都是 truthy），變成 `[] == false` → `[] == 0` → `"" == 0` → `0 == 0` → `true`。

`Object.is` 和 `===` 只有兩處不同：`Object.is(NaN, NaN)` 是 `true`，`Object.is(0, -0)` 是 `false`；`===` 剛好相反。

### Falsy 值

只有八個：`false`、`0`、`-0`、`0n`、`""`、`null`、`undefined`、`NaN`。其他全部是 truthy，包括 `"0"`、`"false"`、`[]`、`{}`。

常見 bug：`if (count)` 在 `count` 為 0 時不會執行；`value || 10` 在 `value` 為 0 或空字串時會被換成 10。要「只有 null / undefined 才用預設值」，請用 `??`。

### 隱式轉換規則

`+` 只要有一邊是字串，就做字串串接；否則兩邊都轉成數字相加。物件參與運算時，先依 `Symbol.toPrimitive` → `valueOf` → `toString` 的順序轉成原始值。陣列的 `toString` 是用逗號串接元素，空陣列是空字串；一般物件的 `toString` 是 `"[object Object]"`。

```js
[] + [];        // ""（空字串）
[] + {};        // [object Object]
1 + "2";        // 12
"3" - 1;        // 2：減號只做數字運算
+"";            // 0
+[];            // 0
+{};            // NaN
true + true;    // 2
[1, 2] + [3];   // 1,23
```

在瀏覽器主控台直接輸入 `{} + []` 會得到 `0`，因為行首的 `{}` 被當成空的程式區塊，剩下 `+[]`。這是解析問題，不是轉型規則不同。

自訂轉型可以實作 `[Symbol.toPrimitive](hint)`，`hint` 會是 `"number"`、`"string"` 或 `"default"`：

```js
const money = {
  amount: 100,
  [Symbol.toPrimitive](hint) {
    return hint === "string" ? `NT$${this.amount}` : this.amount;
  },
};
`${money}`;   // NT$100
money * 2;    // 200
```

### `parseInt` 與 `Number`

`Number` 要求整個字串都是合法數字，否則回傳 `NaN`；`parseInt` 從頭開始解析，遇到不合法的字元就停下，只回傳前面的部分。

```js
Number("12px");    // NaN
parseInt("12px");  // 12
Number("");        // 0
parseInt("");      // NaN
["1", "2", "3"].map(parseInt);  // [ 1, NaN, NaN ]
["1", "2", "3"].map(Number);    // [ 1, 2, 3 ]
```

`map` 會把索引當成第二個參數傳進去，變成 `parseInt("2", 1)` 和 `parseInt("3", 2)`。`parseInt` 的第二個參數是進位（radix），範圍 2～36，實務上應該明確寫 `parseInt(s, 10)`。

## 數字

### 為什麼 `0.1 + 0.2 !== 0.3`

`number` 是 IEEE 754 雙精度浮點數，0.1 和 0.2 在二進位都是無限循環小數，存的是近似值，相加後誤差累積成 `0.30000000000000004`。金額不要用浮點數計算，改用最小單位的整數（例如「分」）、`BigInt`，或十進位函式庫。

```js
0.1 + 0.2;                                    // 0.30000000000000004
Math.abs(0.1 + 0.2 - 0.3) < Number.EPSILON;   // true：比較時允許誤差
(0.1 * 100 + 0.2 * 100) / 100;                // 0.3：轉成整數算
1999n * 3n;                                   // 5997n：用「分」為單位的 BigInt
```

- 安全整數範圍是 ±(2^53 − 1)，也就是 `Number.MAX_SAFE_INTEGER`（9007199254740991）。超過後連整數都會失準，例如 `2 ** 53 + 1 === 2 ** 53` 是 `true`。資料庫的 `BIGINT` 主鍵傳到前端時，常常要用字串傳。
- `toFixed` 只是格式化成字串，而且有四捨五入的誤差（`(1.005).toFixed(2)` 是 `"1.00"`），不能拿來算錢。
- JavaScript 沒有內建的十進位型別，Decimal 提案仍在 TC39 第一階段。這和 Java 不能用 `double` 算錢、要用 `BigDecimal` 是同一個問題。

### `NaN`

`NaN` 表示一個無效的數字運算結果，型別是 `number`。它是唯一不等於自己的值，所以不能用 `===` 判斷，要用 `Number.isNaN(x)`。

```js
NaN === NaN;            // false
Number.isNaN(NaN);      // true
isNaN("abc");           // true：全域 isNaN 會先轉型，"abc" 轉成 NaN
Number.isNaN("abc");    // false：不轉型，"abc" 不是 NaN
[NaN].includes(NaN);    // true
[NaN].indexOf(NaN);     // -1
```

`includes` 用的是 SameValueZero 演算法，能找到 `NaN`；`indexOf` 用的是 `===`，找不到。

### `BigInt`

可以表示任意大小的整數，字面值後面加 `n`。限制：不能和 `number` 直接混合運算（會拋 `TypeError`）；不能用 `Math` 的方法；除法會直接捨去小數。

```js
2n ** 64n;     // 18446744073709551616n
7n / 2n;       // 3n
1n == 1;       // true
1n === 1;      // false
try { 1n + 1; } catch (e) { console.log(e.constructor.name); } // TypeError
```

`JSON.stringify` 遇到 BigInt 會拋錯，要自己處理：`JSON.stringify(data, (k, v) => typeof v === "bigint" ? v.toString() : v)`。

## 傳值與傳參考

和 Java 一樣，JavaScript **只有傳值**。傳物件時，傳的是「參考的複本」，所以函式裡改物件的屬性，外面看得到；但把參數重新指向另一個物件，外面看不到。

```js
function change(obj) {
  obj.name = "B";        // 外面看得到：改的是同一個物件
  obj = { name: "C" };   // 外面看不到：只是讓區域變數指向新物件
}
const user = { name: "A" };
change(user);
console.log(user.name);  // B
```

有人把這種方式叫 call by sharing。面試時講「傳值，物件傳的是參考的複本」最不會被挑毛病。
