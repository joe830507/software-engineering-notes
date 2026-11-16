# 集合框架


## 整體架構

```
Collection
├── List      有序、可重複：ArrayList、LinkedList
├── Set       不可重複：HashSet、LinkedHashSet、TreeSet
└── Queue     佇列：ArrayDeque、PriorityQueue、LinkedList

Map（不屬於 Collection）
├── HashMap、LinkedHashMap
├── TreeMap
└── Hashtable（舊）
```

## ArrayList 與 LinkedList

| | ArrayList | LinkedList |
| --- | --- | --- |
| 底層 | 動態陣列 | 雙向鏈結串列 |
| 隨機存取 `get(i)` | O(1) | O(n) |
| 尾端新增 | 攤銷 O(1) | O(1) |
| 中間插入 / 刪除 | O(n)（搬移元素） | 找位置 O(n)，修改指標 O(1) |
| 記憶體 | 連續、緊湊 | 每個節點多兩個指標 |

實務上幾乎都用 `ArrayList`。需要佇列或堆疊時用 `ArrayDeque`。

`ArrayList` 擴容：無參建構子一開始是空陣列，第一次 `add` 才配置容量 10；容量不夠時擴成 **1.5 倍**。預知大小時用 `new ArrayList<>(n)` 避免多次擴容。

## HashMap 概要（Java 8）

底層是**陣列 + 鏈結串列 + 紅黑樹**。

- 用 key 的 hash 算出陣列位置：`index = (n - 1) & hash`，所以容量一定是 2 的次方。
- hash 碰撞時接在該位置的鏈結串列後面。
- 一個位置節點數達 8 且陣列長度至少 64 時，鏈結串列轉紅黑樹，最差查詢從 O(n) 變 O(log n)。
- 元素數量超過「容量 × 負載因子」就擴容成兩倍。

| 參數 | 預設值 |
| --- | --- |
| 初始容量 | 16（第一次 put 才配置陣列） |
| 負載因子 | 0.75 |
| 樹化門檻 | 8 |
| 退化門檻 | 6 |
| 樹化的最小陣列長度 | 64（不到 64 時優先擴容） |

- 允許一個 null key 和多個 null value。
- **不是執行緒安全的**。Java 7 擴容用頭插法，多執行緒下可能形成環；Java 8 改成尾插法，但多執行緒同時 put 仍會遺失資料。

| | HashMap | Hashtable | ConcurrentHashMap |
| --- | --- | --- | --- |
| 執行緒安全 | 否 | 是（整張表一把鎖） | 是（細粒度鎖） |
| null key / value | 允許 | 不允許 | 不允許 |
| 狀態 | 常用 | 過時 | 並行情境首選 |

`ConcurrentHashMap` 的原理見「進階 → 集合進階」。

## Set

- **HashSet**：底層是 `HashMap`，元素當 key。無序。
- **LinkedHashSet**：底層是 `LinkedHashMap`，保留插入順序。
- **TreeSet**：底層是 `TreeMap`（紅黑樹），依自然順序或 `Comparator` 排序，操作 O(log n)。**判斷重複看 `compareTo` 是否為 0，不是看 `equals`**。

## Comparable 與 Comparator

- `Comparable`：類別自己實作 `compareTo`，定義「自然順序」，只能有一種。
- `Comparator`：外部的比較器，可以定義多種排序方式。

```java
policies.sort(Comparator.comparing(Policy::getIssueDate)
        .thenComparing(Policy::getPremium, Comparator.reverseOrder())
        .thenComparing(Policy::getPolicyNo, Comparator.nullsLast(Comparator.naturalOrder())));
```

不要用 `return a - b;` 寫比較，數值很大或有負數時會溢位，要用 `Integer.compare(a, b)`。

## fail-fast 與走訪時刪除

`ArrayList`、`HashMap` 有 `modCount` 記錄結構修改次數，迭代器每次 `next()` 檢查是否被改過，被改過就拋 `ConcurrentModificationException`。單執行緒也會發生。

```java
List<Integer> list = new ArrayList<>(List.of(1, 2, 3, 4));

// 錯：ConcurrentModificationException
for (Integer x : list) {
    if (x % 2 == 0) list.remove(x);
}

// 對 1：用迭代器的 remove
Iterator<Integer> it = list.iterator();
while (it.hasNext()) {
    if (it.next() % 2 == 0) it.remove();
}

// 對 2：removeIf
list.removeIf(x -> x % 2 == 0);
```

## `Arrays.asList` 與 `List.of`

```java
// Arrays.asList：固定大小，背後就是原本的陣列
String[] arr = {"a", "b"};
List<String> l1 = Arrays.asList(arr);
l1.set(0, "x");      // 可以，而且 arr[0] 也變成 "x"
l1.add("c");         // UnsupportedOperationException

int[] nums = {1, 2, 3};
Arrays.asList(nums).size();   // 1：得到的是 List<int[]>

// List.of（Java 9）：完全不可修改，且不接受 null
List<String> l2 = List.of("a", "b");
l2.set(0, "x");      // UnsupportedOperationException
List.of("a", null);  // NullPointerException

// 需要可修改的 List
List<String> l3 = new ArrayList<>(Arrays.asList(arr));
```

`Collections.unmodifiableList(list)` 是**視圖**，原本的 list 被修改時視圖也會跟著變；`List.copyOf(list)` 才是真正的不可變複本。
