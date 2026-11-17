# 進階結構、Java 集合選型與後端對照

> 這些結構面試被要求「手寫」的機率不高，但系統設計面試幾乎一定問「為什麼選它、跟其他方案比取捨是什麼」。目標是**理解原理與取捨**。

## 進階結構

### LinkedHashMap 與 LRU 快取

`LinkedHashMap = HashMap（O(1) 定位）+ 貫穿所有節點的雙向鏈結串列（維持順序）`。順序可以是插入序（預設），或**存取序**（建構子第三個參數 `accessOrder = true`），後者就是 LRU（Least Recently Used，最近最少使用）淘汰的基礎。

**為什麼 LRU 需要兩者結合**：要 O(1) 依 key 查詢（雜湊表），又要 O(1) 把「剛用過的」移到最前面、淘汰「最久沒用的」（雙向鏈結串列知道 prev，可以直接摘除節點）。單獨用任一個都做不到。

```java
// 繼承 LinkedHashMap：最簡單
static class LRU<K, V> extends LinkedHashMap<K, V> {
    final int cap;
    LRU(int cap) { super(16, 0.75f, true); this.cap = cap; }          // true = 存取序
    @Override protected boolean removeEldestEntry(Map.Entry<K, V> e) { return size() > cap; }
}
// cap=2：put(1) put(2) get(1) put(3) → 剩下 [1, 3]（2 最久沒用被淘汰）
```

面試通常要求**手刻**（雙向鏈結串列 + 兩個哨兵節點 + HashMap）：

```java
static class LRUCache {
    class N { int k, v; N p, n; N(int k, int v) { this.k = k; this.v = v; } }
    final Map<Integer, N> map = new HashMap<>();
    final N head = new N(0, 0), tail = new N(0, 0);     // 哨兵：head 側是最近使用，tail 側是最久沒用
    final int cap;

    LRUCache(int cap) { this.cap = cap; head.n = tail; tail.p = head; }
    void unlink(N x) { x.p.n = x.n; x.n.p = x.p; }
    void addFirst(N x) { x.n = head.n; x.p = head; head.n.p = x; head.n = x; }

    int get(int k) {
        N x = map.get(k);
        if (x == null) return -1;
        unlink(x); addFirst(x);                          // 用過了 → 移到最前
        return x.v;
    }
    void put(int k, int v) {
        N x = map.get(k);
        if (x != null) { x.v = v; unlink(x); addFirst(x); return; }
        if (map.size() == cap) { N old = tail.p; unlink(old); map.remove(old.k); }   // 淘汰最久沒用的
        x = new N(k, v); map.put(k, x); addFirst(x);
    }
}
```

走訪（容量 2）：`put(1,A)` → `[1]`；`put(2,B)` → `[2,1]`；`get(1)` → `[1,2]`；`put(3,C)` 容量滿，淘汰 `tail.p`（= 2）→ `[3,1]`。`get` 與 `put` 都是 O(1)。

> 正式環境用 **Caffeine**（W-TinyLFU）等成熟框架，不要自己手刻；`LinkedHashMap` 版本不是執行緒安全的。

### 跳表 Skip List

在有序鏈結串列上建**多層索引**：每層隨機挑一半左右的節點往上建索引。查找時從最上層往右走，走不通就下一層，像「先看目錄、再看章節、再看內文」。

- 查找 / 插入 / 刪除：**O(log n) 期望值**（層數隨機決定）。
- 相比紅黑樹：實作簡單（不需旋轉）、**範圍查詢更直觀**（沿最底層鏈往右走）、並行控制容易（只需鎖局部節點）。
- 用在：**Redis ZSet**、LevelDB / RocksDB 的 MemTable、Java `ConcurrentSkipListMap`。

**Redis ZSet 為什麼不用紅黑樹？** 跳表在範圍查詢（`ZRANGE`）上更自然，實作遠比紅黑樹簡單，節點層數的機率可調以節省記憶體。

### 布隆過濾器 Bloom Filter

用 k 個雜湊函數把元素映射到一個 **bit 陣列**的 k 個位置並設為 1。

- 回答「**不存在**」→ **100% 正確**（任一位置是 0，就絕對沒加入過）。
- 回答「**存在**」→ **可能誤判**（false positive，別的元素湊巧把那 k 個位置都設成 1）。
- **不支援刪除**（要的話改用 Counting Bloom Filter，每格改成小計數器）。
- 空間極省：誤判率 1%、十億筆資料約需 1.2 GB（`HashSet` 要幾十 GB）。
- 誤判率約 `(1 − e^(−kn/m))^k`：m 為 bit 數、n 為元素數、k 為雜湊函數數，**位元越多、k 取適中，誤判越低**。

應用：**快取穿透防護**（不存在的 key 先過濾，直接回「查無」而不打資料庫）、爬蟲 URL 去重、垃圾郵件黑名單、HBase / LSM 判斷某個 SSTable 是否可能含有目標 key。實務上用 Guava `BloomFilter` 或 Redis 模組，不要自己實作雜湊函數（品質不足誤判率會偏高）。

### B+ Tree 與 LSM Tree

| | B+ Tree | LSM Tree |
|---|---|---|
| 最佳化目標 | **讀取** | **寫入** |
| 寫入方式 | 原地更新頁面（隨機寫） | 先寫記憶體 MemTable（常為跳表），滿了 flush 成不可變 SSTable，背景 compaction 合併（**順序寫**） |
| 讀取 | 樹高 3～4 層，範圍查詢沿葉節點鏈 | 要查 MemTable 與多個 SSTable，常搭配布隆過濾器略過不可能的檔案 |
| 代表 | Oracle、PostgreSQL、MySQL InnoDB 的索引 | Cassandra、RocksDB、HBase、LevelDB |

這是「該選哪種儲存引擎」問題背後最核心的取捨：**B+ Tree 偏讀、LSM Tree 偏寫**。B+ Tree 原理見〈樹〉。

### 一致性雜湊 Consistent Hashing

把雜湊值域想像成一個**環**（0 到 2³² − 1 首尾相接），節點與 key 都映射到環上；key 往**順時針**找到的第一個節點就是它的歸屬。

- **傳統 `hash(key) % N`**：N 一變，幾乎所有 key 的歸屬都要重算。實測 4 個節點增為 5 個，10,000 個 key 有 **8,036 個**要搬家。
- **一致性雜湊**：新增 / 移除節點只影響環上相鄰的一小段。實測加入第 5 個節點，只有 **2,045 個**（約 1/5）要搬。
- **虛擬節點**：每個實體節點在環上放多個分身，讓資料分布在統計上更均勻（只放 1 個時，實測四個節點分到 1,350～4,547 筆；放 100 個後縮小到 1,713～3,380，節點數與雜湊品質越好越均勻）。

```java
static class Ring {
    final TreeMap<Integer, String> ring = new TreeMap<>();
    final int vnodes;
    Ring(int vnodes) { this.vnodes = vnodes; }
    static int hash(String s) {                          // FNV-1a；實務用 MurmurHash
        int h = 0x811c9dc5;
        for (char c : s.toCharArray()) { h ^= c; h *= 16777619; }
        return h & 0x7fffffff;
    }
    void add(String node)    { for (int i = 0; i < vnodes; i++) ring.put(hash(node + "#" + i), node); }
    void remove(String node) { for (int i = 0; i < vnodes; i++) ring.remove(hash(node + "#" + i)); }
    String route(String key) {
        Map.Entry<Integer, String> e = ring.ceilingEntry(hash(key));     // 順時針第一個
        return (e != null ? e : ring.firstEntry()).getValue();           // 到尾端就繞回頭
    }
}
```

用在：Memcached 客戶端分片、Cassandra、CDN 節點選擇、負載平衡器。**Redis Cluster 用的是 16384 個 hash slot**，不是一致性雜湊。

## Java 集合選型

### 全景圖

```text
Collection
├── List（有序、可重複）
│   ├── ArrayList              動態陣列，隨機存取快            ★ 預設
│   ├── LinkedList             雙向鏈表，也可當 Deque
│   └── CopyOnWriteArrayList   讀多寫極少的並行場景（寫入時複製整個陣列）
├── Set（不重複）
│   ├── HashSet                O(1)，無順序                    ★ 預設
│   ├── LinkedHashSet          O(1)，維持插入順序
│   └── TreeSet                O(log n)，自動排序、floor / ceiling
└── Queue / Deque
    ├── ArrayDeque             當 Stack 或 Queue 的首選        ★
    ├── PriorityQueue          依優先權出列
    └── LinkedBlockingQueue    阻塞式，生產者-消費者
Map（獨立於 Collection 的另一套介面）
├── HashMap            O(1)，無順序                            ★ 預設
├── LinkedHashMap      維持插入序或存取序（LRU 基礎）
├── TreeMap            O(log n)，key 排序、範圍查詢
├── ConcurrentHashMap  執行緒安全、高並行                      ★ 多執行緒
└── EnumMap            key 是 enum，內部用陣列，極快
```

★ 是各類的預設首選：沒有特殊的排序、順序、並行需求時，直接選它們。**多數業務場景不需要特殊結構，選最單純、最快的預設選項，程式更好維護，效能通常也更好**。

### 決策流程

1. **需要 key → value 對應嗎？** 是 → Map 系列；否 → Collection 系列。

| Map 的需求 | 選擇 |
|---|---|
| 一般查表，不在乎順序 | `HashMap` |
| 多執行緒共用 | `ConcurrentHashMap` |
| key 排序、範圍查詢（floor / ceiling） | `TreeMap` |
| 維持插入順序（報表輸出） | `LinkedHashMap` |
| LRU 淘汰 | `LinkedHashMap`（`accessOrder=true`），或 Caffeine |
| key 是 enum | `EnumMap` |

| Collection 的需求 | 選擇 |
|---|---|
| 有序、按索引取值 | `ArrayList` |
| 只判斷有沒有這個元素 | `HashSet` |
| 去重並保持插入順序 | `LinkedHashSet` |
| 去重並自動排序 | `TreeSet` |
| 兩端進出、當堆疊 / 佇列 | `ArrayDeque` |
| 每次取最大或最小 | `PriorityQueue` |
| 多執行緒生產者-消費者 | `LinkedBlockingQueue` |

### 完整複雜度對照表

| 結構 | 存取 | 搜尋 | 插入 | 刪除 | 有序性 | 執行緒安全 |
|---|---|---|---|---|---|---|
| 陣列 | O(1) | O(n) | O(n) | O(n) | 否 | 否 |
| `ArrayList` | O(1) | O(n) | 尾端攤還 O(1) / 中間 O(n) | O(n) | 插入序 | 否 |
| `LinkedList` | O(n) | O(n) | O(1)（已知位置） | O(1)（已知位置） | 插入序 | 否 |
| `ArrayDeque` | — | O(n) | O(1) 兩端 | O(1) 兩端 | 插入序 | 否 |
| `HashMap` / `HashSet` | — | O(1) | O(1) | O(1) | 否 | 否 |
| `LinkedHashMap` | — | O(1) | O(1) | O(1) | 插入序 / 存取序 | 否 |
| `TreeMap` / `TreeSet` | — | O(log n) | O(log n) | O(log n) | key 排序 | 否 |
| `PriorityQueue` | O(1)（極值） | O(n) | O(log n) | O(log n) | 部分有序（只保證堆頂） | 否 |
| `ConcurrentHashMap` | — | O(1) | O(1) | O(1) | 否 | **是** |
| Trie | — | O(L) | O(L) | O(L) | 前綴序 | 否 |
| Union-Find | — | ≈ O(1) | ≈ O(1) | — | — | 否 |

**怎麼用這張表答「`HashMap` 與 `TreeMap` 差在哪」**：先講數據（O(1) vs O(log n)），再講有序性（`TreeMap` 自動排序、支援範圍查詢），最後給結論（只有真的需要排序或範圍查詢才選 `TreeMap`，一般 `HashMap` 更快）。「數據 → 適用場景 → 結論」的結構比背特性清單有說服力。

### 其他好用的

- `Collections.unmodifiableList` 是**視圖**（原 list 改了它也會變），`List.copyOf` 是**不可變複本**。
- `EnumSet` / `EnumMap`：key 是 enum 時效能與記憶體都最佳。
- `BitSet`：大量布林旗標、布隆過濾器、篩法。
- 並行：`CopyOnWriteArrayList`（讀多寫極少）、`ConcurrentSkipListMap`（並行的有序 Map）、`ConcurrentLinkedQueue`。

## 後端場景對照

### 場景 → 資料結構

| 後端場景 | 對應結構 | 為什麼 |
|---|---|---|
| API 回應快取 | `LinkedHashMap` / Caffeine | O(1) 查詢，容量有限需淘汰 |
| 分散式快取 | Redis（雜湊表、跳表、壓縮列表等） | 跨節點共用快取狀態 |
| 快取穿透防護 | 布隆過濾器 | 極省空間判斷「絕對不存在」，避免無謂打資料庫 |
| 資料庫索引 | B+ Tree | 磁碟 I/O 友善、範圍查詢快 |
| 寫入密集的儲存（日誌、時序） | LSM Tree | 隨機寫轉順序寫，寫入吞吐高 |
| 訊息佇列 | 持久化 FIFO 佇列（Kafka partition） | 削峰填谷、解耦 |
| 執行緒池工作佇列 | `BlockingQueue`（有界） | 阻塞等待 + 背壓 |
| 限流（滑動視窗） | 計數器 + 時間戳，或 Redis ZSet | 固定時間窗口內精確控制請求數 |
| 排行榜 Top-N | 堆積（單機）／ Redis ZSet（分散式） | O(n log k) 取 Top-K，不需全部排序 |
| 延遲任務 / 定時排程 | 優先權佇列（規模大改時間輪） | 依預計執行時間出列 |
| 微服務依賴檢查 | 有向圖 + 拓撲排序 | 偵測循環依賴、決定啟動順序 |
| 帳號合併 / 風控團夥 | 併查集 | 動態合併、近似 O(1) 查連通 |
| 自動補完 / 路由匹配 | Trie / Radix Tree | 前綴查詢 |
| 分片路由 | 一致性雜湊 | 加減節點時搬移資料最少 |
| 冪等去重（交易單號） | `HashSet` + TTL，或 Redis `SETNX` | 快速判斷「處理過了沒有」 |
| 對帳差異比對 | `HashMap`（一邊建索引） | O(n·m) → O(n + m) |
| 樹狀組織 / 選單 / 帳務科目 | 樹（資料庫用鄰接表或 closure table） | 天然表達階層 |

### 案例：對帳差異比對

比對兩個系統各十萬筆交易，找出金額對不上的：

- ❌ 對 A 的每一筆去 B 逐一掃描：雙層迴圈 10 萬 × 10 萬 = **100 億次比較**，跑不完。
- ✅ 先把 A 建成 `Map<交易序號, 金額>`（O(n)），再掃 B 的每一筆去查（O(1)），整體 **O(n + m)**，幾秒完成。

```java
static List<String> reconcile(Map<String, Integer> a, Map<String, Integer> b) {
    List<String> diff = new ArrayList<>();
    for (var e : a.entrySet()) {
        Integer other = b.get(e.getKey());
        if (other == null) diff.add(e.getKey() + " 只在 A");
        else if (!other.equals(e.getValue())) diff.add(e.getKey() + " 金額不同 " + e.getValue() + " vs " + other);
    }
    for (String k : b.keySet()) if (!a.containsKey(k)) diff.add(k + " 只在 B");
    return diff;
}
// A={T1:100, T2:200, T3:300}  B={T1:100, T2:250, T4:50} → [T2 金額不同 200 vs 250, T3 只在 A, T4 只在 B]
```

心法：**看到「比對」「找重複」「兩邊對照」「計數」「分組」「是否出現過」，第一反應是雜湊表**，用 O(n) 空間換掉巢狀迴圈。金額比對用 `BigDecimal` 的 `compareTo`，不要用 `equals`（`2.0` 與 `2.00` 的 `equals` 為 false）。

### 學習優先順序

| 優先級 | 結構 | 理由 |
|---|---|---|
| **P0** 必須熟 | 陣列、雜湊表、鏈結串列、堆疊、佇列 | 約佔面試題 70%，任何效能問題往下挖都會到這五種 |
| **P1** 必須會手寫 | 二元樹 / BST、堆積、圖 | 中後段題型與系統設計（索引、排程、依賴）的基礎 |
| **P2** 知道原理 | Trie、併查集、跳表 | 特定題型的關鍵鑰匙 |
| **P3** 知道取捨 | 布隆過濾器、LSM Tree、B+ Tree | 系統設計常問「為什麼用它」 |

## 面試速查

**Q：LRU 快取為什麼需要雜湊表加雙向鏈結串列？**
雜湊表提供 O(1) 依 key 定位；雙向鏈結串列在已知節點時能 O(1) 摘除並移到前端、O(1) 淘汰尾端。單獨用任一個都無法同時做到兩件事。

**Q：布隆過濾器為什麼能 100% 確定「不存在」，卻可能誤判「存在」？**
加入時會把 k 個位置設為 1；查詢時只要有一個位置是 0，這個元素就絕對沒加入過。但全部是 1 也可能是別的元素造成的。

**Q：B+ Tree 與 LSM Tree 的取捨？**
B+ Tree 讀取快（樹矮、範圍查詢沿葉鏈）、隨機寫；LSM Tree 全部順序寫、寫入吞吐高，但讀取要查多個檔案，要搭配布隆過濾器與 compaction。

**Q：一致性雜湊解決什麼問題？虛擬節點又解決什麼？**
解決 `hash % N` 在節點數變動時全部 key 要重新分配的問題（只影響相鄰的一小段）；虛擬節點讓每個實體節點在環上有多個位置，讓資料分布更均勻。

**Q：`HashMap` 和 `TreeMap` 怎麼選？**
一般用 `HashMap`（O(1)）；需要依 key 排序、範圍查詢（`floorKey`、`subMap`）才用 `TreeMap`（O(log n)）。

**Q：為什麼 Redis ZSet 用跳表？**
支援依分數 / 排名的範圍查詢，沿底層有序鏈走即可；實作比紅黑樹簡單、並行友善。

**Q：看到比對、找重複這類題，第一反應是什麼？**
雜湊表。用 O(n) 額外空間把 O(n²) 的巢狀迴圈降成 O(n)。
