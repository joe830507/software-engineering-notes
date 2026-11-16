# 基礎語法

> 範圍：語法、物件導向、字串、例外、集合、泛型、Lambda 與 Stream。並行、JVM、反射、序列化等主題在「進階」底下。
> 版本以 Java 8 / 11 / 17 / 21 為主，有版本差異的地方會標出來。


## 執行環境：JDK、JRE、JVM


| 名稱 | 說明 |
| --- | --- |
| JVM | 執行 bytecode 的虛擬機 |
| JRE | JVM + 執行時需要的核心類別庫 |
| JDK | JRE + 開發工具（`javac`、`jar`、`jdb`、`jstack`…） |

「一次編寫、到處執行」的原理：`.java` 經 `javac` 編譯成平台無關的 `.class`（bytecode），再由各平台的 JVM 解譯或 JIT 編譯成機器碼。

Java 11 起不再單獨提供 JRE 下載，改用 `jlink` 依模組打包自己需要的精簡執行環境。



## 基本資料型別


| 型別 | 大小 | 預設值 | 範圍 / 備註 |
| --- | --- | --- | --- |
| `byte` | 1 byte | 0 | -128 ～ 127 |
| `short` | 2 bytes | 0 | -32,768 ～ 32,767 |
| `int` | 4 bytes | 0 | 約 ±21 億 |
| `long` | 8 bytes | 0L | 約 ±9.2 × 10^18 |
| `float` | 4 bytes | 0.0f | IEEE 754 單精度 |
| `double` | 8 bytes | 0.0d | IEEE 754 雙精度 |
| `char` | 2 bytes | `'\u0000'` | UTF-16 的一個 code unit |
| `boolean` | 未規定 | false | |

重點：

- 預設值只適用於**成員變數和陣列元素**。區域變數沒有預設值，沒賦值就使用會編譯錯誤。
- `char` 是 2 bytes，emoji 這類字元要用兩個 `char`（surrogate pair），所以 `"😀".length()` 是 2，要用 `codePointCount` 才是 1。
- 整數溢位**不會拋例外**：`Integer.MAX_VALUE + 1` 會變成 `Integer.MIN_VALUE`。需要檢查時用 `Math.addExact`，溢位會拋 `ArithmeticException`。

### `var`（Java 10）

只能用在**區域變數**且必須有初始值，型別由編譯器推斷。不能用在欄位、方法參數、回傳型別。

```java
var list = new ArrayList<String>();   // 推斷為 ArrayList<String>
```

### `final`

| 修飾對象 | 意義 |
| --- | --- |
| 變數 | 只能賦值一次（參考型別是「參考不能改」，物件內容仍可改） |
| 方法 | 不能被覆寫 |
| 類別 | 不能被繼承 |



## `==` 與 `equals()`


- `==`：基本型別比較值；物件比較是不是**同一個參考**。
- `equals()`：比較內容，但要看類別有沒有覆寫。`Object` 預設的 `equals` 就是 `==`。

```java
String a = new String("abc");
String b = new String("abc");
a == b;        // false：兩個不同物件
a.equals(b);   // true：String 覆寫了 equals
```

### Java 只有傳值

傳物件時，傳的是「參考的複本」。方法裡可以透過參考修改物件內容，但把參數指向新物件，不會影響呼叫端。

```java
void change(StringBuilder sb) {
    sb.append(" world");            // 呼叫端看得到：改的是同一個物件
    sb = new StringBuilder("new");  // 呼叫端看不到：只是讓區域變數指向別的物件
}
```

### 自動裝箱與拆箱的陷阱

```java
Integer a = 127, b = 127;
a == b;        // true：-128 ～ 127 有快取，是同一個物件

Integer c = 128, d = 128;
c == d;        // false：超出快取範圍
c.equals(d);   // true

Integer x = null;
int y = x;     // NullPointerException：拆箱呼叫 x.intValue()

Map<String, Integer> map = new HashMap<>();
int count = map.get("k");   // key 不存在回傳 null，拆箱時 NPE
```

- `Byte`、`Short`、`Long`、`Character`（0～127）也有快取，`Float`、`Double` 沒有。
- 三元運算子也會拆箱：`Integer r = flag ? 1 : nullInteger;` 當 `flag` 為 false 時會 NPE。
- 包裝類別之間的比較一律用 `equals`，不要用 `==`。



## 運算子與型別轉換


### 整數運算

```java
7 / 2      // 3（整數除法捨去小數）
-7 / 2     // -3（往 0 截斷）
7 % -3     // 1
-7 % 3     // -1（餘數的正負號跟被除數一樣）
7.0 / 2    // 3.5
```

### `++` 的求值順序

```java
int i = 5;
int j = i++ + ++i;   // 5 + 7，結果 i = 7, j = 12

int k = 10;
k = i++;             // 先暫存舊值，++ 之後再被賦值蓋回去
```

### 短路與非短路

- `&&`、`||`：左邊已能決定結果時，右邊**不會執行**。
- `&`、`|`：用在 boolean 時**兩邊一定都執行**；用在整數時是位元運算。

```java
String s = null;
if (s != null & s.length() > 0) { }    // NullPointerException
if (s != null && s.length() > 0) { }   // 正確
```

### 位元運算

```java
5 & 3     // 1
5 | 3     // 7
5 ^ 3     // 6
~5        // -6（~x == -x - 1）
-16 >> 2  // -4（算術右移，保留符號）
-16 >>> 28 // 15（無號右移）
1 << 33   // 2（int 位移量只取低 5 位）
```

### 型別轉換

自動提升（widening）：小範圍轉大範圍，編譯器自動完成。

```
byte → short → int → long → float → double
         char ↗
```

強制轉型（narrowing）：大轉小要寫 `(type)`，可能截斷或溢位。

```java
(int) 3.99         // 3（往 0 截斷）
(int) -3.99        // -3
Math.round(3.99)   // 4（回傳 long）
(byte) 130         // -126（只留低 8 位元）
```

`byte`、`short`、`char` 參與算術運算時會先**提升為 `int`**：

```java
byte b = 10;
b = b + 5;          // 編譯錯誤：b + 5 是 int
b += 5;             // 可以：複合賦值會自動轉型
b = (byte) (b + 5); // 可以
```

### 字串串接

```java
1 + 2 + "3" + 4 + 5    // "3345"：由左而右，遇到字串才變成串接
'a' + 'b'              // 195：char 相加是數字
"" + 'a' + 'b'         // "ab"
```

三元運算子的型別提升：

```java
Object p = true ? 1 : 2.0;   // 1.0：兩邊都是數值，提升成 double
```
