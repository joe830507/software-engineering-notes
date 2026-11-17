# 雜湊表

> 如果只能精通一種資料結構，選雜湊表：後端程式碼裡出現頻率最高，也是刷題時「把 O(n²) 降成 O(n)」最常用的武器。

## 原理

### 概念

雜湊表透過**雜湊函數**把 key 換算成整數，再決定放進底層陣列的第幾格，查詢不需要逐一比對，平均 **O(1)**。

兩個不同的 key 可能算到同一格，這叫**碰撞（collision）**，必須有解決方式。若雜湊函數很爛（例如 `hashCode()` 永遠回傳 1），所有元素擠在同一格，雜湊表退化成鏈結串列，O(1) 變成 O(n)。實測 `"Aa"` 與 `"BB"` 的 `hashCode()` 都是 2112，這種碰撞是真實存在的。

### 好的雜湊函數

- **均勻**：把 key 平均分散到各格。
- **確定性**：同一個 key 永遠算出同一個值。
- **快**：計算成本低。
- 常見做法：除留餘數（`h % m`，m 取質數較佳）、折疊法、平方取中法；Java 用 `hashCode()` 加擾動再用位元運算取格。

### 兩大類碰撞解決方式

| 方式 | 作法 | 特性 |
|---|---|---|
| **鏈結法（Separate Chaining）** | 每一格放一條鏈（或樹），碰撞的元素串在同一格 | 實作簡單、刪除容易、Java `HashMap` 採用 |
| **開放定址法（Open Addressing）** | 碰撞時在陣列中另找空格：線性探測、二次探測、雙重雜湊 | 不需額外節點、快取友善；刪除要用墓碑標記、負載太高會嚴重退化 |

**線性探測**：算出的格子被佔用，就往下一格找，直到找到空格（到尾端繞回頭）。查詢時也沿著同樣路徑找，遇到空格才代表不存在。

```java
static class LinearProbing {
    String[] keys = new String[8];
    int[] vals = new int[8];
    int idx(String k) { return (k.hashCode() & 0x7fffffff) % keys.length; }

    void put(String k, int v) {
        int i = idx(k);
        for (int probes = 0; probes < keys.length; probes++) {
            if (keys[i] == null || keys[i].equals(k)) {
                keys[i] = k; vals[i] = v; return;
            }
            i = (i + 1) % keys.length;
        }
        throw new IllegalStateException("table full"); // 教學固定容量；正式實作應擴容
    }
    Integer get(String k) {
        int i = idx(k);
        for (int probes = 0; probes < keys.length && keys[i] != null; probes++) {
            if (keys[i].equals(k)) return vals[i];
            i = (i + 1) % keys.length;
        }
        return null;
    }
}
```

線性探測的缺點是**群聚（clustering）**：已連續佔用的區段會越來越長，探測次數暴增；二次探測與雙重雜湊（用第二個雜湊函數決定步長）可以緩解。**負載因子**（元素數 ÷ 格數）要控制在適當範圍，超過就擴容重算。

## Java HashMap

### 內部結構（Java 8+）

```text
table[0] → null
table[1] → [k1|v1] → [k9|v9]      ← 碰撞：鏈結串列
table[2] → null
table[3] → [k3|v3]
table[4] → 紅黑樹                  ← 一般 put 在已有 8 節點的桶新增第 9 個，且 table 長度 ≥ 64，轉紅黑樹
index = (n - 1) & hash(key)       ← n 為 2 的次方，等價於取模但更快
hash(key) = h ^ (h >>> 16)        ← 高 16 位元混入低位元，減少碰撞
```

OpenJDK 21 原始碼的常數：

| 常數 | 值 | 意義 |
|---|---|---|
| `DEFAULT_INITIAL_CAPACITY` | 16 | 預設容量 |
| `DEFAULT_LOAD_FACTOR` | 0.75 | 預設負載因子 |
| `TREEIFY_THRESHOLD` | 8 | 桶內已有 8 個節點、再新增第 9 個時，考慮轉紅黑樹 |
| `MIN_TREEIFY_CAPACITY` | 64 | table 小於此值時，不轉樹而是先擴容 |
| `UNTREEIFY_THRESHOLD` | 6 | resize 分裂後的桶節點數 ≤ 6 時退回鏈；一般 remove 另有樹形判斷 |

- **容量永遠是 2 的次方**：這樣 `(n-1) & hash` 才等價於取模，位元運算比除法快得多（`tableSizeFor` 會把指定容量向上補成 2 的次方）。
- **擴容條件是 `++size > threshold`**（超過門檻，不是達到）：容量 4、門檻 3 時，放到第 4 個元素才觸發。
- 擴容為**兩倍**，所有元素用新容量重新計算位置（rehash）：舊鏈上的元素只會落在「原 index」或「原 index + 舊容量」兩處。

### 擴容走訪

以下 a、b、c、d 是假想 key 名稱，並非同名字串的實際 hash。容量 4、負載因子 0.75（門檻 3），依序放入 `a`（index 1）、`b`（index 1，碰撞）、`c`（index 3）、`d`（index 2）：

```text
放 a、b、c：table[1]→[a]→[b]   table[3]→[c]     size=3，3 > 3 不成立，不擴容
放 d：size=4 > 3 → 擴容為 8，門檻變 6，全部重新計算位置
擴容後：a 留在 1、b 因遮罩變寬被分到 5、c 在 3、d 在 2
```

原本擠在同格的 a、b 被分散開，碰撞機率下降，維持接近 O(1)。每次擴容都要搬動全部元素，所以**已知筆數時建構就指定容量**（`new HashMap<>((int) (expected / 0.75f) + 1)`，或 Java 19+ 的 `HashMap.newHashMap(expected)`）。

### 複雜度

| 操作 | 平均 | 最壞 | 說明 |
|---|---|---|---|
| `put` / `get` / `remove` | 期望／攤還 O(1) | O(n) | 同 hash 且無法比較的 key 仍可能線性查找；put 擴容也需 O(n) |
| `containsKey` | 期望 O(1) | O(n) | 樹化不保證所有 key 都能對數查找 |
| `containsValue` | O(n) | O(n) | 沒有值的索引，掃全表，盡量避免 |
| 走訪 | O(n + capacity) | | 容量遠大於元素數時要跳過大量空格 |
| 空間 | O(n) | | 約 n / 0.75 ≈ 1.33n |

## hashCode 與 equals

### 契約

1. **`a.equals(b)` 為 true → `a.hashCode() == b.hashCode()`**。
2. 同一物件多次呼叫，`hashCode()` 結果要一致（物件沒被修改的前提下）。
3. `hashCode()` 相同，`equals` **不一定**為 true（碰撞）。

只覆寫 `equals` 不覆寫 `hashCode`：兩個「相等」的物件算到不同格，`HashMap` 找不到。

```java
record User(String id, String name) {}   // record 自動依所有欄位產生 equals / hashCode
// 一般類別：Objects.equals(...)、Objects.hash(...)，或用 IDE / Lombok 產生
```

### ⚠️ 不要拿可變物件當 key

```java
Map<K, String> m = new HashMap<>();
K k = new K(1);          // hashCode 依 id 計算
m.put(k, "v");
k.id = 2;                // 之後修改了參與 hashCode 的欄位
m.get(k);                // null！實測：size 仍是 1，但再也找不到這筆資料
```

資料被放在舊 hashCode 對應的格子，改了之後用新 hashCode 去查會找錯格子，**沒有任何例外**，資料就憑空消失（也無法刪除，造成記憶體洩漏）。**只用不可變物件當 key**（`String`、`Integer`、`record`、enum）。這也是 `String` 設計成不可變的好處之一。

### 實用 API

```java
Map<String, Integer> cnt = new HashMap<>();
for (String w : words) cnt.merge(w, 1, Integer::sum);                 // 計數：a b a c b a → {a=3, b=2, c=1}

Map<Integer, List<String>> byLen = new HashMap<>();
for (String w : words) byLen.computeIfAbsent(w.length(), k -> new ArrayList<>()).add(w);   // 分組

map.getOrDefault(key, 0);   map.putIfAbsent(key, v);   map.entrySet();
```

## 相關集合

### 該選哪個

| 類別 | 順序 | 時間 | 執行緒安全 | 重點 |
|---|---|---|---|---|
| `HashMap` | 無 | O(1) | 否 | 預設首選；允許一個 null key |
| `LinkedHashMap` | 插入序或存取序 | O(1) | 否 | 多一條雙向鏈結串列；LRU 的基礎 |
| `TreeMap` | key 排序 | O(log n) | 否 | 紅黑樹；`floorKey`、`ceilingKey`、`subMap` 範圍查詢 |
| `ConcurrentHashMap` | 無 | O(1) | **是** | 不允許 null key / value |
| `Hashtable` | 無 | O(1) | 是（整表鎖） | 過時，不要用 |
| `EnumMap` | enum 順序 | O(1) | 否 | key 是 enum 時用陣列實作，極快 |
| `HashSet` / `LinkedHashSet` / `TreeSet` | 同上 | | | 內部分別是對應的 `Map` |

`TreeMap` 範圍查詢實測：`{10,20,30}` 的 `floorKey(25)=20`、`ceilingKey(25)=30`、`headMap(20)={10}`、`subMap(10,true,20,true)={10,20}`。

### 執行緒安全

- `HashMap` 在多執行緒下共用會**遺失更新**；Java 7 及以前，並行 resize 還可能讓鏈結串列形成環、CPU 飆到 100%。
- **`ConcurrentHashMap`**（Java 8+）：對單一桶 `synchronized` 加 CAS，鎖粒度很細，並行效能好。
- `Collections.synchronizedMap()`：整張表一把大鎖，並行效能遠不如前者。

### 雜湊表的常見用途

| 需求 | 做法 |
|---|---|
| 找重複、是否出現過 | `HashSet.add` 回傳 false 即重複 |
| 兩數之和 | 邊走邊存「需要的另一半」，O(n) |
| 計數、分組 | `merge`、`computeIfAbsent` |
| 兩邊資料比對 | 一邊建 `Map`，另一邊逐筆查，O(n + m)（見〈進階結構與選型〉的對帳案例） |
| 快取 | `HashMap` / Caffeine（底層是強化版的 `ConcurrentHashMap`） |

## 實務對照

- **本地快取**：Caffeine、Guava Cache 本質是加上淘汰策略（LRU、W-TinyLFU）與過期機制的 `ConcurrentHashMap`。
- **Redis 的 hash table**：用**漸進式 rehash**，把一次性 O(n) 的擴容拆成很多小步分批完成，避免卡住單執行緒。
- **資料庫 Hash Join**：小表建雜湊表，大表逐筆探測，O(n·m) 降到 O(n + m)。
- **一致性雜湊**：解決「節點數變動時 `hash % N` 要全量重分配」的問題（見〈進階結構與選型〉）。

## 面試速查

**Q：HashMap 樹化後是否保證最壞 O(log n)？**
不是。雜湊分布良好時期望 O(1)；樹桶可依 hash 或可比較 key 排序時能對數查找，同 hash 且不可比較時仍可能掃描兩側子樹。參考 [OpenJDK 21 HashMap 原始碼](https://github.com/openjdk/jdk21u/blob/master/src/java.base/share/classes/java/util/HashMap.java)。

**Q：為什麼覆寫 `equals` 一定要覆寫 `hashCode`？**
相等的物件必須算到同一格，否則 `HashMap` 在不同格子找，會查不到、`Set` 也會出現「重複」元素。

**Q：描述一次 resize。**
容量翻倍（仍是 2 的次方），配置新陣列，每個元素用新容量重新計算位置；原本同格的元素常被分散，降低碰撞。

**Q：`HashMap` 的容量為什麼是 2 的次方？**
讓 `(n-1) & hash` 等價於取模，位元運算比除法快；擴容時元素位置只會是原位置或原位置加舊容量。

**Q：`HashMap`、`ConcurrentHashMap`、`synchronizedMap` 差別？**
`HashMap` 非執行緒安全；`ConcurrentHashMap` 以細粒度鎖 + CAS 達成高並行；`synchronizedMap` 整張表一把鎖，並行效能差。

**Q：鏈結法與開放定址法怎麼選？**
鏈結法在負載高時退化較平緩、刪除簡單；開放定址法快取友善但怕群聚與高負載、刪除要墓碑。Java `HashMap` 採鏈結法（鏈長過長轉樹）。
