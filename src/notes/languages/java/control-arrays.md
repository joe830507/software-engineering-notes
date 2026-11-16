# 流程控制與陣列


## 流程控制


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

### `break`、`continue`、`return`

- `break`：跳出目前迴圈。
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

`while` 先判斷再執行；`do-while` 至少執行一次，適合「先做一次再決定要不要重複」，例如讀取使用者輸入。



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
