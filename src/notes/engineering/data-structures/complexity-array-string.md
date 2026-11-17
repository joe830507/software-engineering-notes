# 複雜度分析、陣列與字串

> 整理自《資料結構使用 Java》與個人的〈基礎資料結構〉講義，並以 OpenJDK 21 原始碼與實測驗證 Java 相關說法。主軸：**資料結構的本質是「用空間換時間，或用時間換空間」**，每種結構都在「查詢快、插入快、省記憶體、保持順序」之間取捨。

## 複雜度分析

### Big-O 直覺表

Big-O 描述 n 很大時「成本成長的形狀」，不是精確秒數。

| 複雜度 | 名稱 | n = 1,000 萬時大約 | 典型代表 |
|---|---|---|---|
| O(1) | 常數 | 瞬間 | `HashMap.get`、陣列索引存取 |
| O(log n) | 對數 | 瞬間（約 24 步） | 二分搜尋、`TreeMap`、堆積調整 |
| O(n) | 線性 | 毫秒～數百毫秒 | 掃一遍陣列 |
| O(n log n) | 線性對數 | 可接受 | 排序、堆積排序、歸併排序 |
| O(n²) | 平方 | 跑不完（約一天以上） | 巢狀雙迴圈、泡沫排序 |
| O(2ⁿ) | 指數 | n > 30 就爆 | 暴力窮舉子集合 |
| O(n!) | 階乘 | n > 11 就爆 | 全排列窮舉 |

（以每秒約 10 億次基本運算估算量級。）

### 由資料範圍反推解法

題目給的資料上限，幾乎在暗示該用哪一級複雜度：

| 資料範圍 | 需要的複雜度 | 常見手法 |
|---|---|---|
| n ≤ 20 | 指數可以 | 回溯、窮舉子集合 |
| n ≤ 1,000 | O(n²) 可以 | 雙迴圈、二維 DP |
| n ≤ 100,000 | O(n log n) | 排序、分治、堆積 |
| n ≥ 10⁶ | O(n) 或 O(log n) | 雜湊表、雙指標、二分搜尋 |

### 三個容易搞錯的地方

**1. 漸進分析會丟掉常數，但實務上常數很重要。**
對帳批次「掃兩遍檔案」與「掃一遍」在 Big-O 上都是 O(n)，實際耗時卻差一倍。Big-O 是工程師溝通「量級」的語言，不是效能報告；n 很小時 O(n²) 甚至可能比 O(n log n) 快（所以 `Arrays.sort` 對小陣列會切換成插入排序）。

**2. 攤還複雜度（Amortized）。**
`ArrayList.add()` 是「攤還 O(1)」：多數時候只是寫進尾端空位，只有陣列滿了才擴容並複製（O(n)）。把偶爾的 O(n) 平均分攤到之前所有 O(1) 之上，平均仍是 O(1)。面試只說「O(1)」會被追問擴容，主動說「攤還 O(1)」是加分點。

**3. 空間複雜度只算「額外」空間。**
輸入本身不算。快速排序只需遞迴堆疊 O(log n)（原地排序）；歸併排序需要與輸入同大的輔助陣列 O(n)，但它**穩定**（相等元素相對順序不變）。這就是 `Arrays.sort` 對基本型別用雙軸快排、對物件用 TimSort（歸併優化版）的原因。

### 最常見的 O(n²) 陷阱

```java
// 看起來只有一層迴圈，但 contains() 對 ArrayList 本身是 O(n) → 整體 O(n²)
for (Order o : orders) {
    if (processedIds.contains(o.id())) continue;   // processedIds 是 List
}

// 改用 HashSet：contains 是 O(1) → 整體 O(n)
Set<String> seen = new HashSet<>();
for (Order o : orders) {
    if (!seen.add(o.id())) continue;                // add 回傳 false 代表已存在
}
```

**呼叫任何方法前，先確認它自己的複雜度。** 同理，`list.remove(0)` 在迴圈裡是 O(n²)。

### 與後端的對照

| 場景 | 複雜度本質 |
|---|---|
| `EXPLAIN` 的 Full Table Scan | O(n) |
| Index Range Scan | O(log n + k)：B+ Tree 定位 + 讀 k 筆 |
| Nested Loop Join | O(n·m) |
| Hash Join | O(n + m)：小表建雜湊表，大表逐筆探測 |
| N+1 查詢 | 1 次查詢 + n 次查詢明細：把 O(1) 次網路往返變成 O(n) 次，網路往返比記憶體運算貴上千倍 |

## 陣列

### 記憶體中的樣子

陣列是**一塊連續的記憶體**，每個元素大小固定。三個特性由此推導出來：

1. **O(1) 隨機存取**：位址 = 基底位址 + 索引 × 元素大小，直接算出，不用搜尋。
2. **長度固定**：必須先配置連續空間；要變長就得整塊搬到別處（`ArrayList` 擴容複製的原因）。
3. **快取友善（cache locality）**：CPU 一次讀一整條 cache line（通常 64 bytes），走訪陣列時下一個元素多半已在快取中。這是 Big-O 看不出來、但實測遍歷陣列常比鏈結串列快數倍的原因。

### 插入與刪除

在索引 i 插入要把 i 之後的元素往後搬；**必須從尾端開始往前搬**，否則會覆蓋尚未搬走的資料。

```text
[10, 20, 30, 40, _]  在索引 1 插入 99
1. 40 搬到 [4]   → [10, 20, 30, 40, 40]
2. 30 搬到 [3]   → [10, 20, 30, 30, 40]
3. 20 搬到 [2]   → [10, 20, 20, 30, 40]
4. 寫入 [1] = 99 → [10, 99, 20, 30, 40]
```

刪除相反：從刪除點開始，把後面的元素往前補。最壞都要搬 n−1 個，所以是 **O(n)**。

### Java 範例

```java
int[] a = {90, 85, 77, 100, 60};         // 長度固定
Arrays.sort(a);                          // O(n log n)；基本型別用雙軸快排
int idx = Arrays.binarySearch(a, 85);    // O(log n)，前提：必須已排序
int[] part = Arrays.copyOfRange(a, 1, 4);// O(k)
Arrays.fill(a, -1);                      // O(n)

int[][] grid = new int[3][4];            // 「陣列的陣列」，每一列可以是不同長度

List<String> list = new ArrayList<>(100_000);  // 已知大小時預先指定容量，避免多次擴容
```

### 複雜度

| 操作 | 陣列 / ArrayList | 說明 |
|---|---|---|
| 依索引讀寫 | O(1) | 位址公式 |
| 尾端新增 | 攤還 O(1) | 滿了才擴容 |
| 中間插入 / 刪除 | O(n) | 後面元素要搬 |
| 搜尋（未排序） | O(n) | 逐一比對 |
| 搜尋（已排序） | O(log n) | 二分搜尋 |
| 空間 | O(n) | ArrayList 可能有未用完的容量 |

### ArrayList 的擴容

`ArrayList` 底層是原生陣列，**容量不足時擴為約 1.5 倍**（`新容量 = 舊容量 + 舊容量 >> 1`）。實測空 `ArrayList` 連續 `add`，容量依序是：

```text
10 → 15 → 22 → 33 → 49 → 73 → ...
```

（無參建構子時，第一次 `add` 才配置預設容量 10。）從 10 長到 10 萬筆約要擴容 23 次，每次都要複製當時所有元素，並產生大量短命陣列（GC 壓力），所以知道大小就預先指定。

### 多維陣列與特殊矩陣

- 二維陣列在記憶體中按**列優先（row-major）**排列：`A[i][j]` 的位置 = `i × 欄數 + j`。
- **稀疏矩陣**（大部分元素是 0）：只存非零元素的 `(列, 行, 值)` 三元組，省空間；代價是存取不再是 O(1)。
- **下三角矩陣**（只有 `i ≥ j` 有值）：只存一半，用一維陣列依列儲存，`A[i][j]` 對應索引 `i(i+1)/2 + j`（從 0 起算）。對稱矩陣同理，可只存下三角。

### 常見陷阱

| 陷阱 | 說明與修正 |
|---|---|
| 索引越界 | 合法索引是 `0 … length-1`；邊界條件（空陣列、迴圈最後一圈）最容易漏測 |
| `equals` 比的是參考 | `a.equals(b)` 與 `a == b` 對陣列都是 false；用 `Arrays.equals`，多維用 `Arrays.deepEquals` |
| `List.of(...)`、`Arrays.asList(...)` | `List.of` 完全不可變；`Arrays.asList` 是固定長度的陣列視圖，兩者呼叫 `add` / `remove` 都丟 `UnsupportedOperationException`（實測確認） |
| for-each 中修改集合 | 見下 |

**for-each 中移除元素**：for-each 底層是 `Iterator`，它用 `modCount` 偵測結構性修改。實測 `[a, b, c]` 在迴圈中移除：

| 移除的元素 | 結果 |
|---|---|
| `a`（第一個） | 丟 `ConcurrentModificationException` |
| `b`（倒數第二個） | **不丟例外**，而且最後一個元素被悄悄跳過 |
| `c`（最後一個） | 丟 `ConcurrentModificationException` |

行為不一致，所以一律不要這樣寫。改用：

```java
list.removeIf(s -> s.equals("b"));            // 推薦
Iterator<String> it = list.iterator();         // 或用 Iterator.remove()
while (it.hasNext()) if (it.next().equals("b")) it.remove();
```

### 實務對照

- **`ArrayList` vs `LinkedList`：99% 選 `ArrayList`**。即使要頻繁中間插入，cache locality 的優勢常讓 `ArrayList` 仍然更快。
- **Spring Batch 的 chunk size** 就是「一次撈進一個陣列的大小」：太小 → 資料庫往返暴增（N+1 的變形）；太大 → 記憶體壓力與 GC。要依單筆大小與可用記憶體調校。

## 字串

### 不可變（Immutable）

`String` 內部是 `final byte[] value`（Java 9 起的 **Compact Strings**：內容都在 Latin-1 範圍時，每字元只用 1 byte）。陣列是 `final`，建構後不可變。好處：

1. **執行緒安全**：不用加鎖。
2. **可安全當 `HashMap` 的 key**：`hashCode` 算一次就能快取。
3. **字串常數池可共用**：多個變數指向同一份物件也不會互相干擾。

代價：任何「修改」都是**建立新物件**。`s.toUpperCase()` 不會改變 `s`，只回傳新字串。

### `+=` 為什麼是 O(n²)

```java
String s = "";
for (int i = 0; i < n; i++) s += i;     // 第 k 輪要複製前面已拼好的 k 個字元
// 總複製量 0 + 1 + 2 + ... + (n-1) ≈ n²/2；並產生 n 個短命物件
```

```java
StringBuilder sb = new StringBuilder();  // 內部是有餘裕的字元陣列，擴容策略與 ArrayList 類似
for (int i = 0; i < n; i++) sb.append(i);// append 攤還 O(1)，整體 O(n)
String s = sb.toString();
```

資料量小、單元測試只測 10 筆時完全看不出問題，上線後才平方級惡化。（單一表達式的 `a + b + c` 編譯器會處理，問題在**迴圈裡累加**。）

### 複雜度

| 操作 | 複雜度 | 備註 |
|---|---|---|
| `charAt(i)`、`length()` | O(1) | |
| `substring(a, b)` | O(b − a) | Java 7 起複製新陣列，不再共用底層陣列（避免記憶體洩漏） |
| `equals`、`compareTo` | O(n) | 最壞逐字元比對 |
| `indexOf` | O(n·m) | 樸素比對；KMP 可做到 O(n + m) |
| 迴圈內 `+=` | O(n²) | 改用 `StringBuilder` |
| `StringBuilder.append` | 攤還 O(1) | |

### `==` 與 `equals`

```java
String s1 = new String("hi"), s2 = "hi";
s1 == s2;          // false：不同物件
s1.equals(s2);     // true：內容相同
s1.intern() == s2; // true：intern 回傳常數池中的那一份
```

字面值字串（`"hi"`）會放進常數池，所以兩個字面值 `==` 為 true，這容易讓人誤以為 `==` 可以比字串。**一律用 `equals`**。

### 實務對照

- **日誌拼接的隱藏成本**：`log.info("user=" + id)` 即使 log level 關閉也會先拼接字串（Java 先算參數再呼叫方法）。改用 SLF4J 佔位符 `log.info("user={}", id)`，確定要輸出時才組字串。
- **敏感資料不要放 `String`**：不可變 → 無法主動清除，heap dump 可能外洩。用 `char[]`，用完 `Arrays.fill(pwd, '\0')`（`KeyStore`、`JPasswordField` 等 API 都要求 `char[]`）。
- **`intern()`**：大量重複的字串（狀態碼 `PENDING`、`PAID`）可以用它共用記憶體，但有查找成本，只在「重複率極高且記憶體吃緊」時才值得。

## 面試速查

**Q：`ArrayList.remove(0)` 是什麼複雜度？為什麼？**
O(n)。刪除後後面所有元素要往前補一格。頻繁從頭刪除要改用 `ArrayDeque`。

**Q：什麼是攤還複雜度？舉例。**
把偶爾昂貴的操作平均分攤到多次便宜操作上。`ArrayList.add` 偶爾擴容是 O(n)，但 n 次 `add` 總成本 O(n)，平均每次 O(1)。

**Q：為什麼快速排序是原地、歸併排序不是？**
快排只需 O(log n) 的遞迴堆疊；歸併要 O(n) 輔助陣列合併，換來穩定性。

**Q：`String` 為什麼設計成不可變？**
執行緒安全、可快取 `hashCode`、能共用常數池、適合當 key 與安全相關參數。代價是修改會產生新物件。

**Q：為什麼密碼要用 `char[]`？**
`String` 不可變，無法在用完後主動清除內容；`char[]` 可以 `Arrays.fill` 清零，降低 heap dump 外洩風險。

**Q：為什麼遍歷陣列常比遍歷鏈結串列快，即使都是 O(n)？**
陣列連續，cache line 一次載入多個元素；鏈結串列節點散落各處，幾乎每走一步都是 cache miss，代價高一到兩個數量級。
