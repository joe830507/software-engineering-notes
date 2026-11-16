# 物件、原型與類別

## 原型與原型鏈

### 什麼是原型鏈

每個物件都有一個隱藏的連結 `[[Prototype]]`，指向另一個物件，也就是它的原型。讀取屬性時，如果物件本身沒有，就沿著這條連結往上找，一直找到 `null` 為止，這條鏈就是原型鏈。JavaScript 的繼承就是靠原型鏈實現的：方法放在原型上，所有實例共用一份。

```js
const arr = [1, 2];
Object.getPrototypeOf(arr) === Array.prototype;              // true
Object.getPrototypeOf(Array.prototype) === Object.prototype; // true
Object.getPrototypeOf(Object.prototype);                     // null
```

- `arr.push` 不是 `arr` 自己的屬性，是在 `Array.prototype` 上找到的；`arr.hasOwnProperty` 則要再往上找到 `Object.prototype`。
- **寫入**屬性不會沿著原型鏈往上寫，而是直接在物件本身建立屬性，蓋住原型上的同名屬性（shadowing）。
- 原型鏈太長會影響查找效能，但現代引擎有 inline cache，實務上很少成為瓶頸。

### `prototype`、`__proto__`、`constructor`

- `prototype` 是**函式**才有的屬性，是「用這個函式 `new` 出來的物件」要用的原型。
- `__proto__` 是**每個物件**都有的存取器，讀到的是這個物件的原型，等同 `Object.getPrototypeOf(obj)`。
- `constructor` 是放在 `prototype` 上的屬性，指回函式本身。

所以 `new Foo().__proto__ === Foo.prototype`，`Foo.prototype.constructor === Foo`。

```js
function Foo() {}
const f = new Foo();
Object.getPrototypeOf(f) === Foo.prototype;       // true
Foo.prototype.constructor === Foo;                // true
f.constructor === Foo;                            // true：從原型上找到的
Object.getPrototypeOf(Foo) === Function.prototype; // true：函式本身也是物件
```

`__proto__` 是歷史遺留的非標準寫法，新程式請用 `Object.getPrototypeOf` 和 `Object.setPrototypeOf`。執行期修改物件的原型會讓引擎的最佳化失效，效能很差，應該在建立時就用 `Object.create(proto)` 指定。

### `instanceof` 的原理

`a instanceof B` 檢查的是：`B.prototype` 是否出現在 `a` 的原型鏈上。

```js
function myInstanceof(obj, Ctor) {
  if (obj === null || (typeof obj !== "object" && typeof obj !== "function")) return false;
  let proto = Object.getPrototypeOf(obj);
  while (proto !== null) {
    if (proto === Ctor.prototype) return true;
    proto = Object.getPrototypeOf(proto);
  }
  return false;
}
myInstanceof([], Array);  // true
myInstanceof([], Object); // true
myInstanceof([], Map);    // false
```

- 改掉 `B.prototype` 之後，舊的實例 `instanceof B` 會變成 `false`。
- 類別可以用 `static [Symbol.hasInstance](x)` 自訂 `instanceof` 的行為。

### 沒有原型的物件

用 `Object.create(null)`。這樣的物件沒有 `toString`、`hasOwnProperty` 等繼承來的屬性，適合當成純粹的字典，不怕使用者輸入的鍵剛好叫 `constructor` 或 `__proto__`，也能避免原型污染。不過現在當字典用，更推薦直接用 `Map`。

## 繼承與類別

### 繼承方式

歷史上有原型鏈繼承、建構函式繼承、組合繼承、寄生組合繼承等多種寫法，其中**寄生組合繼承**是 ES5 時代的最佳解。ES2015 之後直接用 `class` 和 `extends`，底層做的事情跟寄生組合繼承一樣，但語法清楚、行為正確，所以現在一律用 `class`。

```js
// ES5 寄生組合繼承：面試可能要求手寫
function Animal(name) { this.name = name; }
Animal.prototype.speak = function () { return `${this.name} makes a sound`; };

function Dog(name, breed) {
  Animal.call(this, name);                         // 1. 繼承實例屬性
  this.breed = breed;
}
Dog.prototype = Object.create(Animal.prototype);   // 2. 繼承原型方法，且不會執行父建構函式
Dog.prototype.constructor = Dog;                   // 3. 修正 constructor

const d = new Dog("Rex", "Shiba");
console.log(d.speak(), d instanceof Animal); // Rex makes a sound true
```

| 方式 | 問題 |
| --- | --- |
| 原型鏈繼承 `Child.prototype = new Parent()` | 父類別的參考型屬性被所有子實例共用；無法傳參數給父建構函式 |
| 建構函式繼承 `Parent.call(this)` | 拿不到父類別原型上的方法 |
| 組合繼承（上面兩種一起用） | 父建構函式被呼叫兩次 |
| 寄生組合繼承 | 沒有上述問題，ES5 最佳解 |
| `class extends` | 現代寫法，還會正確繼承靜態方法與內建類別（如 `Array`、`Error`） |

### `class` 只是語法糖嗎

大部分是，`class` 底層仍然是建構函式加原型。但它也有函式做不到或做起來很麻煩的地方：

1. 類別必須用 `new` 呼叫，直接呼叫會拋 `TypeError`。
2. 類別內部自動是嚴格模式。
3. 類別宣告有 TDZ，不會像函式宣告一樣整個被提升。
4. 方法不可列舉（`for...in` 走訪不到）。
5. 支援真正的私有欄位 `#field`、靜態區塊 `static {}`。
6. `extends` 能正確繼承內建類別，例如 `class MyError extends Error`，ES5 寫法很難做對。

### 私有欄位 `#x` 與 TypeScript `private`

`#x` 是 JavaScript 執行期的真私有，類別外部無論如何都存取不到，連 `Object.keys`、`JSON.stringify`、`Proxy` 都看不到。TypeScript 的 `private` 只在**編譯期**檢查，編譯成 JavaScript 後就是普通屬性，用 `obj["x"]` 照樣讀得到。

```js
class Account {
  #balance = 0;
  static isAccount(x) { return #balance in x; } // ES2022：檢查物件有沒有這個私有欄位
  deposit(n) { this.#balance += n; return this.#balance; }
}
const a = new Account();
a.deposit(100);                                   // 100
Object.keys(a);                                   // []
Account.isAccount(a);                             // true
Account.isAccount({});                            // false
```

私有欄位不會被子類別繼承存取，子類別只能透過父類別的方法操作。相當於 Java 的 `private`，沒有 `protected` 的對應語法。

### 什麼時候不用 class

JavaScript 是「以原型為基礎」的語言，函式是一等公民，所以不一定要用類別。小工具、資料轉換用純函式加物件字面值就夠了；需要大量實例、封裝私有狀態、或框架要求時才用 `class`。Java 背景的人最常見的錯誤是過度設計：每件事都包一個類別、寫一堆 getter / setter，而 JavaScript 的慣例是直接用屬性，需要時再改成存取器。

## 屬性與走訪

### 屬性描述器與鎖定

每個屬性都有描述器。資料屬性有 `value`、`writable`、`enumerable`、`configurable`；存取器屬性有 `get`、`set`、`enumerable`、`configurable`。三個鎖定方法的強度依序遞增：

| 方法 | 新增屬性 | 刪除屬性 | 修改值 |
| --- | --- | --- | --- |
| `Object.preventExtensions` | 不行 | 可以 | 可以 |
| `Object.seal` | 不行 | 不行 | 可以 |
| `Object.freeze` | 不行 | 不行 | 不行 |

```js
const config = Object.freeze({ db: { host: "localhost" } });
config.db.host = "prod";        // 只凍結一層，內層物件仍然可以改
console.log(config.db.host);    // prod
```

要深度凍結需要遞迴呼叫 `Object.freeze`。在嚴格模式下，修改被凍結的物件會拋 `TypeError`；非嚴格模式則是靜默失敗。

### 走訪物件屬性

| 方法 | 自有屬性 | 繼承屬性 | 不可列舉 | Symbol 鍵 |
| --- | --- | --- | --- | --- |
| `for...in` | ✓ | ✓ | ✗ | ✗ |
| `Object.keys` / `values` / `entries` | ✓ | ✗ | ✗ | ✗ |
| `Object.getOwnPropertyNames` | ✓ | ✗ | ✓ | ✗ |
| `Object.getOwnPropertySymbols` | ✓（只有 Symbol） | ✗ | ✓ | ✓ |
| `Reflect.ownKeys` | ✓ | ✗ | ✓ | ✓ |

屬性的走訪順序：先是「看起來像整數索引」的鍵，由小到大；再來是字串鍵，依建立順序；最後是 Symbol 鍵，依建立順序。所以 `{ b: 1, 2: 1, a: 1, 1: 1 }` 的鍵順序是 `1, 2, b, a`。

### 判斷有沒有某個屬性

- `"key" in obj`：會連原型鏈一起找。
- `Object.hasOwn(obj, "key")`：只看自有屬性，是 ES2022 推薦的寫法，取代 `obj.hasOwnProperty("key")`（後者在 `Object.create(null)` 的物件上不能用，也可能被同名屬性蓋掉）。
- 不要用 `obj.key !== undefined` 判斷，因為屬性可能存在但值剛好是 `undefined`。

### getter 與 setter

用 `get` 和 `set` 定義存取器屬性，讀寫時像普通屬性，但實際上會執行函式。常用來做計算屬性、驗證、延遲計算。

```js
const temp = {
  celsius: 25,
  get fahrenheit() { return this.celsius * 1.8 + 32; },
  set fahrenheit(f) { this.celsius = (f - 32) / 1.8; },
};
temp.fahrenheit = 212;
console.log(temp.celsius); // 100
```

## Proxy 與 Reflect

`Proxy` 可以包住一個物件，攔截對它的各種操作，例如讀屬性、寫屬性、刪除、`in` 判斷、函式呼叫。`Reflect` 提供和這些攔截操作一一對應的預設行為，在攔截器裡用它把操作轉發給原物件。

```js
const user = new Proxy({ name: "Joe" }, {
  get(target, key, receiver) {
    console.log(`讀取 ${String(key)}`);
    return Reflect.get(target, key, receiver);
  },
  set(target, key, value, receiver) {
    if (key === "age" && !Number.isInteger(value)) throw new TypeError("age 必須是整數");
    return Reflect.set(target, key, value, receiver);
  },
});
user.name;      // 讀取 name
user.age = 30;
try { user.age = "30"; } catch (e) { console.log(e.message); } // age 必須是整數
```

Vue 3 的響應式系統用 `Proxy` 實作，Vue 2 則靠 `Object.defineProperty` 的 getter / setter。為什麼改用 `Proxy`：

- `defineProperty` 要逐一處理已存在的屬性，新增和刪除屬性偵測不到，Vue 2 需要 `Vue.set`。
- 陣列用索引賦值和改 `length` 偵測不到，Vue 2 只能改寫陣列方法。
- `Proxy` 攔截的是整個物件的操作，這些問題都解決了，而且可以延遲到讀取時才遞迴代理內層物件。

## 拷貝

淺拷貝只複製第一層，內層物件仍然共用參考；深拷貝會遞迴複製所有層級，新舊物件完全獨立。淺拷貝用展開運算子 `{ ...obj }`、`Object.assign`、`arr.slice()`；深拷貝在現代環境首選 `structuredClone`。

```js
const original = { date: new Date(0), tags: new Set(["a"]), nested: { n: 1 } };
original.self = original; // 循環參考

const copy = structuredClone(original);
copy.nested.n = 2;
original.nested.n;           // 1
copy.date instanceof Date;   // true
copy.self === copy;          // true：循環參考也正確處理
```

| 做法 | 優點 | 缺點 |
| --- | --- | --- |
| `JSON.parse(JSON.stringify(x))` | 簡單 | 遺失 `undefined`、函式、Symbol；`Date` 變字串；`Map` / `Set` 變空物件；循環參考會拋錯；`NaN` 變 `null` |
| `structuredClone(x)` | 支援 Date、Map、Set、RegExp、ArrayBuffer、循環參考 | 不能複製函式、DOM 節點；類別實例會變成普通物件（原型遺失）；私有欄位不會被複製 |
| 手寫遞迴 | 可以完全自訂 | 要自己處理各種型別與循環參考 |
| lodash `cloneDeep` | 成熟穩定 | 多一個相依套件 |
