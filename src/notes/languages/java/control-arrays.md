# 流程控制與陣列


## 流程控制


### `if` / `else if` / `else`

條件必須是 `boolean`，Java 不像 C 可以拿整數或參考當條件（`if (x)` 在 `x` 是 `int` 時編譯錯誤）。

```java
static String grade(int score) {
    if (score >= 90) return "A";
    else if (score >= 80) return "B";
    else if (score >= 60) return "C";
    else return "D";
}
```

- 條件**由上往下**判斷，第一個成立的分支執行後就結束，其餘不再判斷。所以範圍條件要由嚴格排到寬鬆（上例若先寫 `score >= 60` 就永遠到不了 `A`）。
- 只有一行時可以省略 `{}`，但**建議永遠加大括號**，避免之後加一行卻沒被包進分支。
- **`else` 永遠屬於最近的 `if`**（dangling else），縮排不影響語意：

```java
if (x > 0)
    if (x > 5) System.out.println("big");
    else System.out.println("這個 else 屬於內層 if");   // x = 1 時印出這行
```

- 常見陷阱：把 `==` 寫成 `=`。`if (flag = true)` 是**賦值**，永遠成立（只有 `boolean` 型別能這樣寫而不報錯，所以用 `int` 時編譯器會擋）。
- 比較浮點數不要用 `==`，`0.1 + 0.2 == 0.3` 是 `false`，改成比較差值：`Math.abs(a - b) < 1e-9`。
- 條件裡用到包裝類別（`Integer`、`Double`）會自動拆箱，值是 `null` 時拋 `NullPointerException`（見「基礎語法」的裝箱陷阱）。
- 先檢查 `null` 再使用，利用 `&&` 短路：`if (s != null && s.length() > 3)`。
- Java 16 起，`instanceof` 可以直接綁定變數（模式比對）：`if (o instanceof String s && s.length() > 3) { ... s.toUpperCase() ... }`，不需要再手動轉型。

**三元運算子** `條件 ? 值1 : 值2` 是會產生值的運算式，適合簡單的二選一，巢狀超過一層就改用 `if`：

```java
int max = a > b ? a : b;
```

注意兩個分支的型別會被統一。`true ? 1 : 2.0` 的結果是 `1.0`；分支中有 `Integer` 與 `int` 混用時，`null` 的 `Integer` 可能在拆箱時拋 NPE。

### `switch`

支援 `byte`、`short`、`char`、`int` 及其包裝類別、`enum`、`String`（Java 7）。`long` 不行。

`switch` 對 `String` 是先比 `hashCode()` 再用 `equals()`，所以傳入 null 會 NPE（Java 21 起可以寫 `case null`）。

Java 14 起，`switch` 可以作為運算式產生結果。以下使用 `->`：執行完選中的分支後，不會繼續執行下一個分支（fall-through）。`switch` 運算式也能使用 `case ...:` 搭配 `yield`，因此不能把「沒有 fall-through」當成所有寫法的特性。

```java
String name = switch (day) {
    case 1, 7 -> "週末";
    case 2, 3, 4, 5, 6 -> "平日";
    default -> "未知";
};
```

傳統的 `case ...:` 寫法若忘記 `break`，會**繼續執行下一個分支**（fall-through），是常見 bug 來源。

什麼時候用哪個：條件是**範圍或複雜布林運算**用 `if`；條件是**同一個變數對多個固定值**用 `switch`。

### 迴圈

| 寫法 | 特徵 | 適合 |
| --- | --- | --- |
| `for` | 初始化、條件、更新寫在同一行 | 知道次數或要用索引 |
| 增強 `for` | `for (T x : 陣列或 Iterable)` | 走訪全部元素、不需要索引 |
| `while` | **先判斷**再執行，可能一次都不執行 | 次數不固定 |
| `do-while` | 先執行一次**再判斷**，至少執行一次 | 先做一次再決定要不要重複，例如讀取使用者輸入 |

```java
for (int i = 0; i < arr.length; i++) { ... }                 // 傳統 for
for (int i = 0, j = arr.length - 1; i < j; i++, j--) { ... } // 可同時處理多個變數（雙指標常用）
for (int v : arr) { sum += v; }                              // 增強 for
```

增強 `for` 的限制：

- 拿不到索引，也**無法修改陣列元素本身**：`for (int v : arr) v = 0;` 只改了區域變數 `v`。要改元素就用索引。
- 對使用 **fail-fast 迭代器**的一般集合（如 `ArrayList`）走訪時，不應直接呼叫集合的 `add` / `remove` 做結構性修改，否則**可能**拋出 `ConcurrentModificationException`。這只是盡力偵測，不能依賴它保證程式正確，也不能套用到所有集合（見「集合框架」的 fail-fast）。需要邊走訪邊刪除時，若迭代器支援，可用 `Iterator.remove()`；依條件批次刪除則可直接用集合支援的 `removeIf`，不要在增強 `for` 裡呼叫它。
- 走訪的物件是 `null` 會 NPE。

無窮迴圈寫成 `while (true)` 或 `for (;;)`，用 `break` 跳出。迴圈變數若要在迴圈結束後使用，必須宣告在迴圈外。

### `break`、`continue`、`return`

- `break`：跳出目前迴圈（或 `switch`）。
- `continue`：跳過本次，進入下一次。
- `return`：結束方法。

跳出多層迴圈用標籤：

```java
outer:
for (int i = 0; i < 10; i++) {
    for (int j = 0; j < 10; j++) {
        if (i * j > 20) break outer;
    }
}
```


## 陣列


```java
int[] a = new int[3];                // 預設值 0
int[] b = {1, 2, 3};
int[] c = new int[]{1, 2, 3};
// int[] d = new int[3]{1, 2, 3};    // 編譯錯誤：不能同時指定長度和初始值
```

- 陣列元素有預設值：參考型別 `null`、`double` `0.0`、`boolean` `false`。
- 索引越界拋 `ArrayIndexOutOfBoundsException`。
- 陣列的 `length` 是 `final` 欄位，`String` 的 `length()` 是方法。
- **長度建立後固定**，要「變長」只能建新陣列再複製（`Arrays.copyOf`、`System.arraycopy`）。這正是集合類別幫你做的事（見下）。
- 陣列在記憶體中是**連續空間**，所以用索引取元素是 O(1)；但在中間插入或刪除要搬移後面所有元素，是 O(n)。
- 陣列沒有覆寫 `equals` 和 `toString`：

```java
int[] a = {1, 2, 3};
int[] b = {1, 2, 3};
a == b;                  // false
a.equals(b);             // false（沿用 Object.equals）
Arrays.equals(a, b);     // true
System.out.println(a);   // [I@1b6d3586
Arrays.toString(a);      // [1, 2, 3]
```

- `int[] b = a` 只複製參考；`a.clone()` 才會建立新陣列（但多維陣列、物件陣列的 `clone` 是**淺複製**）。
- 二維陣列的每一列可以不同長度，`new int[3][]` 的內層預設是 `null`。

排序：

```java
Arrays.sort(arr);                                  // int[]
Integer[] boxed = {5, 3, 1};
Arrays.sort(boxed, Collections.reverseOrder());    // Comparator 只能用在物件陣列
```

### 二分搜尋

前提是陣列**已排序**且可隨機存取。計算中點用 `low + (high - low) / 2`，避免 `(low + high) / 2` 在數值很大時溢位。

```java
static int binarySearch(int[] a, int target) {
    int low = 0, high = a.length - 1;
    while (low <= high) {
        int mid = low + (high - low) / 2;
        if (a[mid] == target) return mid;
        if (a[mid] < target) low = mid + 1;
        else high = mid - 1;
    }
    return -1;
}
```

### 常見集合底層其實是陣列

很多集合類別只是把「會自動擴容的陣列」包裝起來。了解這點，就能解釋它們各自的效能特性。以下是概略說明，容量與擴容倍數屬於**實作細節**（以常見的 OpenJDK 為例），不是 API 保證。

| 類別 | 底層 | 概略運作 |
| --- | --- | --- |
| `ArrayList` | `Object[]` | 容量不夠就建一個更大的陣列並複製（約 1.5 倍）；索引存取 O(1)，中間插入／刪除要搬移元素 O(n) |
| `Vector`、`Stack` | `Object[]` | 與 `ArrayList` 類似，但方法加了 `synchronized`；`Stack` 繼承 `Vector`。新程式很少使用 |
| `ArrayDeque` | 環狀 `Object[]` | 用 head、tail 兩個索引繞圈使用陣列，頭尾新增為**攤銷 O(1)**，觸發擴容的單次操作為 O(n)；頭尾移除為 O(1)。常用於實作堆疊／佇列 |
| `PriorityQueue` | `Object[]` | 把**二元堆積**存在陣列裡，索引 `i` 的子節點在 `2i+1`、`2i+2`；新增的堆積調整為 O(log n)（擴容另需 O(n)），取出堆頂 `poll()`／`remove()` 為 O(log n)，指定元素的 `remove(Object)` 為 O(n)，查看堆頂 `peek()` 為 O(1) |
| `HashMap`、`HashSet` | `Node[]`（桶陣列） | 以 `hash` 算出陣列位置，同位置衝突時用鏈結串列或紅黑樹接起來；`HashSet` 底層就是 `HashMap`（見「集合框架」） |
| `LinkedHashMap`、`LinkedHashSet` | `Node[]` + 雙向鏈結 | 同 `HashMap`，另外用鏈結串列維持順序 |
| `ConcurrentHashMap` | `Node[]` | 同樣是桶陣列，但以 CAS 與鎖住單一桶頭節點支援並行（見「集合進階」） |
| `CopyOnWriteArrayList` | `Object[]` | 每次寫入都複製整個陣列，讀取不加鎖，適合讀多寫極少 |
| `EnumMap` | 陣列 | 以 `enum` 的 `ordinal()` 當索引，不需要雜湊 |
| `BitSet` | `long[]` | 每個 `long` 存 64 個位元，省空間 |
| `StringBuilder` | `byte[]` / `char[]` | 可變字串的緩衝區，容量不夠就擴容（所以預知長度時可指定初始容量） |
| `String` | `byte[]`（Java 9 起） | 字串內容本身就存在陣列中，且不可變 |
| `Arrays.asList(arr)` | 包住原陣列 | 沒有複製，**固定大小**，不能 `add`／`remove`（見「集合框架」） |

**不是陣列的**：`LinkedList`、`TreeMap`／`TreeSet` 是由節點以參考相連（鏈結串列、紅黑樹），因此沒有擴容問題，但也沒有 O(1) 的索引存取，且每個元素多一個節點物件的記憶體與走訪時 CPU 快取較不友善。

**從中得到的實用結論：**

- 預知元素數量時，指定初始容量（`new ArrayList<>(n)`、`new HashMap<>(capacity)`、`new StringBuilder(n)`）可避免多次擴容與複製。
- 需要大量隨機存取就用陣列型的（`ArrayList`）；需要頭尾頻繁增刪用 `ArrayDeque`。
- 泛型集合不能直接使用基本型別作為型別參數。OpenJDK 的 `ArrayList<Integer>` 底層是 `Object[]`，存放 `Integer` 物件的參考（也可存 `null`）；`List` 是介面，底層結構取決於實作，例如 `LinkedList<Integer>` 使用鏈結節點。大量基本型別資料可考慮直接用 `int[]`，減少裝箱與記憶體開銷。
- 把集合轉回陣列用 `list.toArray(new String[0])`，會複製一份。
