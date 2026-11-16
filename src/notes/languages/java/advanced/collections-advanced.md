# 集合進階

## ConcurrentHashMap

### 為什麼不允許 null

並行環境下，`get(key)` 回傳 null 時無法分辨是「key 不存在」還是「value 是 null」，也沒辦法像單執行緒那樣再用 `containsKey` 確認（兩次呼叫之間可能被別的執行緒改掉）。

### Java 7 與 Java 8 的差別

| | Java 7 | Java 8+ |
| --- | --- | --- |
| 結構 | Segment + HashEntry 陣列 + 鏈結串列 | Node 陣列 + 鏈結串列 + 紅黑樹 |
| 鎖 | `ReentrantLock`，鎖一整個 Segment | 空 bucket 用 CAS，非空 bucket `synchronized` 鎖頭節點 |
| 並行度 | 固定為 Segment 數量（預設 16） | 隨陣列長度增加，理論上等於 bucket 數 |
| 擴容 | 各 Segment 各自擴容，單執行緒 | 多執行緒協助擴容 |
| 最差查詢 | O(n) | O(log n)（紅黑樹） |
| size | 先不加鎖算兩次，不一致就鎖全部 Segment | `baseCount` + `CounterCell[]` |

### Java 8 的運作方式

- **put**：陣列沒初始化就先初始化（用 CAS 搶初始化權）；bucket 是空的就用 **CAS** 放入；bucket 正在擴容就先幫忙搬資料；否則 **`synchronized` 鎖頭節點**再插入。鎖的範圍只有**一個 bucket**，不同 bucket 的寫入可以同時進行。鏈長達到 8 時依 HashMap 規則樹化。
- **get**：完全不加鎖。陣列元素用 volatile 語意讀取，節點的 `val`、`next` 都是 `volatile`，所以一定看得到最新值。
- **擴容**：多個執行緒分段領取舊陣列的區段一起搬。搬完的 bucket 放一個 `ForwardingNode`，讀到它的執行緒會轉到新陣列去找，所以擴容期間整張表不會停擺。
- **size 計數**：用類似 `LongAdder` 的 `baseCount` 加 `CounterCell[]` 分散計數，避免所有執行緒搶同一個變數。`size()` 因此只是**估計值**，數量可能超過 `int` 時用 `mappingCount()`。

為什麼用 `synchronized` 而不是 `ReentrantLock`：鎖的範圍只有一個 bucket，競爭機率低，`synchronized` 在 JVM 層有鎖升級最佳化；而且直接用節點本身的物件頭當鎖，不需要每個 bucket 多一個鎖物件，省記憶體。

### 常見誤用

```java
// 錯：兩個操作各自是原子的，組合起來不是
if (!map.containsKey(k)) {
    map.put(k, v);
}

// 對：使用原子的複合操作
map.putIfAbsent(k, v);
map.computeIfAbsent(k, key -> loadFromDb(key));
map.merge(word, 1, Integer::sum);   // 計數
```

`computeIfAbsent` 的 mapping function 執行期間會鎖住該 bucket，裡面不要做耗時操作，也**不要在裡面修改同一個 map**（可能死結或拋 `IllegalStateException: Recursive update`）。

## CopyOnWriteArrayList

寫入時（`add`、`set`、`remove`）加鎖，**複製一份新陣列**，在新陣列上修改，最後把參考換成新陣列；讀取完全不加鎖，讀的是當下的陣列。

- 適合**讀非常多、寫非常少**的情境，例如事件監聽者清單、設定、黑白名單。
- 每次寫入都要複製整個陣列，寫入頻繁或資料量大時效能極差，也會產生大量垃圾。
- 讀取是弱一致性：寫入完成前的讀取看到的是舊資料。
- 迭代器走訪的是建立那一刻的快照，不會拋 `ConcurrentModificationException`（fail-safe）。

## LinkedHashMap 實作 LRU 快取

`LinkedHashMap` 在 HashMap 之外再用雙向鏈結串列串起所有節點。建構子的 `accessOrder = true` 時，每次 `get` 都會把該節點移到串列尾端；覆寫 `removeEldestEntry`，超過容量就刪除串列頭（最久沒用的）。

```java
public class LruCache<K, V> extends LinkedHashMap<K, V> {
    private final int capacity;

    public LruCache(int capacity) {
        super(16, 0.75f, true);   // 第三個參數 true：依存取順序
        this.capacity = capacity;
    }

    @Override
    protected boolean removeEldestEntry(Map.Entry<K, V> eldest) {
        return size() > capacity;
    }
}
```

這個實作**不是執行緒安全的**，連 `get` 都會修改串列。

## PriorityQueue

底層是陣列實作的**二元堆積（binary heap）**，預設是最小堆積。`offer`、`poll` 是 O(log n)，`peek` 是 O(1)。走訪（iterator）的順序**不是**排序後的順序。常用在 Top K、合併多個有序串列、排程。

```java
// 找出金額最大的前 K 筆：維持一個大小為 K 的最小堆積
PriorityQueue<Txn> heap = new PriorityQueue<>(Comparator.comparing(Txn::amount));
for (Txn t : txns) {
    heap.offer(t);
    if (heap.size() > k) heap.poll();   // 移除目前最小的
}
```
