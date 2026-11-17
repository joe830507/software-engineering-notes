# 堆積、Trie 與併查集

## 堆積 Heap 與 PriorityQueue

### 概念

堆積只保證「**最上面那個一定是極值**」，不維護全體排序。這種刻意的不完美讓它比完整排序便宜：

- 插入 O(log n)、取出極值 O(log n)、看極值 O(1)。
- 反例：每次叫號都重新排序，n 次叫號總成本 O(n² log n)；用堆積是 O(n log n)。

**最小堆積（Min-Heap）**：每個父節點 ≤ 子節點；**最大堆積**相反。堆積是一棵**完全二元樹**，直接存在陣列裡，不用指標：

```text
        1                 陣列：[1, 3, 2, 7, 5, 4]
      /   \               索引：  0  1  2  3  4  5
     3     2              父 = (i-1)/2     左子 = 2i+1     右子 = 2i+2
    / \   /               索引 1（值 3）：父 = 索引 0（1），左 = 索引 3（7），右 = 索引 4（5）
   7   5 4
```

### 兩個核心操作

**上浮（sift up）**：插入時把新元素放在陣列最後，與父節點比較，比父小就交換，一路往上。最多 O(log n) 次（完全二元樹高度 O(log n)）。

```text
最小堆積 [1,3,2,7,5,4] 插入 0
放到尾端        [1,3,2,7,5,4,0]     索引 6，父 = 索引 2（2）：0 < 2 交換
                [1,3,0,7,5,4,2]     索引 2，父 = 索引 0（1）：0 < 1 交換
                [0,3,1,7,5,4,2]     到根，結束
```

**下沉（sift down）**：取出根後，把陣列最後一個元素搬到根，與**較小的那個子節點**比較，比它大就交換，一路往下。

```text
poll()：回傳 0；把最後的 2 搬到根  [2,3,1,7,5,4]
2 與較小子（1）比：2 > 1 交換      [1,3,2,7,5,4]
2 的子只剩 4：2 < 4 結束
```

```java
static class MinHeap {
    int[] a = new int[4]; int n;
    void add(int x) {
        if (n == a.length) a = Arrays.copyOf(a, n * 2);
        a[n] = x; int i = n++;
        while (i > 0) {                                   // 上浮
            int p = (i - 1) / 2;
            if (a[p] <= a[i]) break;
            int t = a[p]; a[p] = a[i]; a[i] = t; i = p;
        }
    }
    int poll() {
        if (n == 0) throw new NoSuchElementException("empty heap");
        int r = a[0]; a[0] = a[--n]; int i = 0;
        while (true) {                                    // 下沉
            int l = 2 * i + 1, rr = 2 * i + 2, m = i;
            if (l < n && a[l] < a[m]) m = l;
            if (rr < n && a[rr] < a[m]) m = rr;
            if (m == i) break;
            int t = a[m]; a[m] = a[i]; a[i] = t; i = m;
        }
        return r;
    }
}
// 依序 add 1,3,2,7,5,4,0 得到 [0,3,1,7,5,4,2]；連續 poll 得 0 1 2 3 4 5 7
```

### Java：PriorityQueue

```java
PriorityQueue<Integer> minHeap = new PriorityQueue<>();                          // 預設最小堆積
PriorityQueue<Integer> maxHeap = new PriorityQueue<>(Collections.reverseOrder());
PriorityQueue<Task> pq = new PriorityQueue<>(Comparator.comparingInt(Task::priority).reversed());
```

| 操作 | 複雜度 |
|---|---|
| `peek` | O(1) |
| `offer` / `poll` | O(log n) |
| `remove(Object)`、`contains` | O(n)（要先線性找到位置） |
| 由陣列 heapify 建堆 | **O(n)**（不是 O(n log n)） |

**heapify 為什麼是 O(n)**：從最後一個非葉節點起由下往上做下沉。底層節點數量最多但下沉距離最短，上層節點下沉很遠但數量很少，兩者相乘加總收斂在 O(n)。逐一 `offer` 則是 O(n log n)。

⚠️ `PriorityQueue` 的 `toString()` 與迭代**不是排序後的順序**（只保證堆頂）。實測 `new PriorityQueue<>(List.of(5,1,4,2,3))` 印出 `[1, 2, 4, 5, 3]`；要有序輸出要一直 `poll`。

### Top-K：為什麼「最大的 K 個」用最小堆積

維護一個**大小為 K 的最小堆積**，裡面放目前看過最大的 K 個。新元素比堆頂（K 個裡最小的）大，就把堆頂丟掉換進來。

```java
static int[] topK(int[] nums, int k) {
    if (k < 0 || k > nums.length) throw new IllegalArgumentException("invalid k");
    if (k == 0) return new int[0];
    PriorityQueue<Integer> pq = new PriorityQueue<>();      // 最小堆積
    for (int x : nums) {
        pq.offer(x);
        if (pq.size() > k) pq.poll();                       // 超過 K 就丟掉最小的
    }
    int[] r = new int[pq.size()];
    for (int i = r.length - 1; i >= 0; i--) r[i] = pq.poll();
    return r;                                               // [5,1,9,3,7,2,8] 取 3 → [9,8,7]
}
```

時間 O(n log k)、空間 O(k)；k 遠小於 n 時比「全部排序再取前 k」（O(n log n)）快得多，也能處理無法一次載入記憶體的串流資料。

### 其他經典用法

- **資料流的中位數**：左邊放最大堆積（較小的一半）、右邊放最小堆積（較大的一半），兩堆大小差 ≤ 1，中位數取堆頂。

```java
PriorityQueue<Integer> lo = new PriorityQueue<>(Collections.reverseOrder());   // 較小的一半
PriorityQueue<Integer> hi = new PriorityQueue<>();                             // 較大的一半
void add(int num) {
    lo.offer(num);
    hi.offer(lo.poll());
    if (hi.size() > lo.size()) lo.offer(hi.poll());
}
double median() {
    if (lo.isEmpty()) throw new NoSuchElementException("empty stream");
    return lo.size() > hi.size() ? lo.peek() : ((long) lo.peek() + hi.peek()) / 2.0;
}
// 依序加入 5, 2, 8, 1 → 中位數 5.0, 3.5, 5.0, 3.5
```

- **合併 K 個有序串列**：把每個串列的第一個元素放進最小堆積，每次取出最小的，再把它所在串列的下一個放進去，O(N log K)。
- **堆積排序**：建堆 O(n) + 反覆取極值 O(n log n)，原地、不穩定。

### 實務對照

- `ScheduledThreadPoolExecutor` 的延遲佇列是以「預計執行時間」為 key 的堆積；Quartz、xxl-job 的觸發機制概念相同。
- **Redis ZSet** 底層是跳表 + 雜湊表，可取代單機的優先權佇列，且支援分散式排行榜。
- **外部排序、LSM Tree 的 compaction**：把資料切成多個能放進記憶體的有序小檔，再用堆積做 K 路歸併。

## Trie 字典樹

### 概念

Trie 把字串拆成字元，**共用前綴的字串共用同一段路徑**，專門處理「前綴」問題。搜尋框自動補完輸入 `pro`，Trie 直接走到 `pro` 節點再收集子樹，不用掃整本字典（逐一比對是 O(n·L)）。

插入 `ca`、`cat`、`care`、`prod`、`prog`：

```text
root
├─ c ─ a(end) ─ t(end)
│          └─ r ─ e(end)
└─ p ─ r ─ o ─ d(end)
              └─ g(end)
```

插入 `prog` 時只多建 1 個節點（`g`），`pro` 沿用 `prod` 已建好的路徑。

### 實作

```java
static class Trie {
    Trie[] c = new Trie[26];     // 只處理小寫英文；字元集大時改用 Map<Character, Trie>
    boolean end;                 // 這個節點是否為某個完整單字的結尾

    void insert(String w) {
        Trie t = this;
        for (char ch : w.toCharArray()) {
            int i = ch - 'a';
            if (t.c[i] == null) t.c[i] = new Trie();
            t = t.c[i];
        }
        t.end = true;
    }
    Trie find(String p) {
        Trie t = this;
        for (char ch : p.toCharArray()) { t = t.c[ch - 'a']; if (t == null) return null; }
        return t;
    }
    boolean search(String w)     { Trie t = find(w); return t != null && t.end; }   // 要是完整單字
    boolean startsWith(String p) { return find(p) != null; }                        // 只要路徑存在
}
```

**`end` 標記很重要**：只插入 `cat` 時，`search("ca")` 要回傳 false（路徑走得到但不是單字結尾），`startsWith("ca")` 才回傳 true。實測：插入上述五個字後，`search("ca") = true`、`search("pro") = false`、`startsWith("pro") = true`、`startsWith("x") = false`。

| 操作 | Trie | HashSet 對比 |
|---|---|---|
| 插入 / 搜尋單字 | O(L) | O(L)（計算 hash） |
| **前綴搜尋** | **O(L)** | O(n·L)，要掃過所有單字 |
| 空間 | O(字元總數 × 分支數) | O(字元總數) |

### Trie 的唯一理由是「前綴」

只需要判斷「有沒有這個字」就用 `HashSet`：空間小、程式簡單。只有牽涉**前綴查詢、最長公共前綴、在矩陣中同時找多個單字（Word Search II）**時，Trie 才不可取代。選用 Trie 卻說不出為什麼不能用 HashSet，反而扣分。

### 實務對照

- **路由比對**：Spring MVC 的 URL 比對、Nginx location、IP 路由的**最長前綴匹配（LPM）**。
- **Radix Tree / Patricia Trie**：把只有單一子節點的路徑壓縮成一段；Linux page cache 索引、Consul 的 key 儲存。
- **Elasticsearch 的 FST**：Trie 的壓縮進階版（共用前綴與後綴）。
- **敏感詞過濾**：**AC 自動機 = Trie + 失敗指標**，掃一次文字同時比對上千個關鍵字。

## 併查集 Union-Find

### 概念

只回答「**這兩個東西是不是同一群**」，並支援動態合併。每個元素記錄父節點，同一群共用同一個根。

- `find(x)`：找到 x 所在群的根。
- `union(a, b)`：把兩群合併。

與 DFS / BFS 的取捨：動態加入關係、要**反覆查詢**連通性時，併查集每次近似 O(1)；而且它**只記得「誰跟誰同組」，不記路徑**。要知道「A 到 C 經過哪些人」還是得用 DFS / BFS。

### 兩個關鍵優化

1. **路徑壓縮**：`find` 時把沿路所有節點直接改指向根，下次一步到位。
2. **按秩 / 按大小合併**：永遠把小樹掛到大樹下，避免長成高瘦的鏈。

兩者同用時，攤還複雜度為 **O(α(n))**，α 是反阿克曼函數，成長極慢，實務上視為常數。

```java
static class UF {
    int[] p, sz; int count;                       // count：目前有幾群
    UF(int n) { p = new int[n]; sz = new int[n]; count = n; for (int i = 0; i < n; i++) { p[i] = i; sz[i] = 1; } }

    int find(int x) {
        if (p[x] != x) p[x] = find(p[x]);         // 路徑壓縮
        return p[x];
    }
    boolean union(int a, int b) {
        int ra = find(a), rb = find(b);
        if (ra == rb) return false;               // 已經同群
        if (sz[ra] < sz[rb]) { int t = ra; ra = rb; rb = t; }
        p[rb] = ra; sz[ra] += sz[rb];             // 小的掛到大的
        count--;
        return true;
    }
}
// UF(6)：union(0,1)、union(2,3)、union(1,3) → connected(0,2) = true，剩 3 群
```

遞迴版 `find` 在鏈很長時可能爆堆疊，已用按大小合併就不會；也可寫成迭代版。

### 典型應用

| 問題 | 做法 |
|---|---|
| 連通分量數 | 初始 n 群，每次成功 `union` 減 1 |
| 島嶼數量 | 相鄰的陸地 `union`，數剩幾群 |
| **Kruskal 最小生成樹** | 邊依權重排序，只加入「連接不同群」的邊 |
| 偵測無向圖的環 | 加邊時兩端已同群 → 有環 |
| 帳號合併 / 風控團夥 | 同裝置、同 IP 的帳號 `union`，查詢是否同一團夥 |

```java
// 島嶼數量：先數出所有陸地，每成功合併相鄰的兩塊陸地一次，島嶼數就少 1
static int islands(char[][] g) {
    if (g.length == 0 || g[0].length == 0) return 0; // 假設非 null 的矩形網格
    int m = g.length, n = g[0].length, count = 0;
    UF uf = new UF(m * n);
    for (int i = 0; i < m; i++)
        for (int j = 0; j < n; j++) if (g[i][j] == '1') count++;
    for (int i = 0; i < m; i++)
        for (int j = 0; j < n; j++) {
            if (g[i][j] != '1') continue;
            if (i + 1 < m && g[i + 1][j] == '1' && uf.union(i * n + j, (i + 1) * n + j)) count--;
            if (j + 1 < n && g[i][j + 1] == '1' && uf.union(i * n + j, i * n + j + 1)) count--;
        }
    return count;     // 4×5 網格 {11000, 11000, 00100, 00011} 實測為 3
}
```

## 面試速查

**Q：為什麼找「最大的 K 個數」要用最小堆積？**
只維護大小為 K 的堆積，堆頂是這 K 個中最小的，新元素只要比它大就取代它；時間 O(n log k)、空間 O(k)。用最大堆積就得放進全部資料。

**Q：描述堆積插入的上浮過程，為什麼是 O(log n)？**
新元素放在陣列尾端，與父節點比較並交換，直到不再比父小或到根。完全二元樹高度 O(log n)，最多交換這麼多次。

**Q：由陣列直接 heapify 為什麼是 O(n)，逐一插入卻是 O(n log n)？**
heapify 從最後一個非葉節點由下往上下沉，底層節點多但下沉短、頂層節點少但下沉長，加總是 O(n)；逐一插入每次都最壞要上浮 log n。

**Q：Redis ZSet 為什麼用跳表而不是堆積？**
堆積只能快速拿到極值，不支援依分數範圍或排名查詢；跳表有序，範圍查詢（`ZRANGE`）直接沿底層鏈走。

**Q：Trie 相較 HashSet 的唯一優勢？**
前綴查詢。`HashSet` 只能 O(1) 判斷單字是否存在，要找前綴得掃全部。

**Q：`search` 與 `startsWith` 差在哪？`end` 標記的作用？**
`search` 要求路徑存在且節點的 `end` 為 true（是完整單字）；`startsWith` 只要路徑存在。

**Q：併查集的路徑壓縮在做什麼？為什麼近似 O(1)？**
`find` 時把路徑上所有節點直接掛到根，後續查詢一步到位；配合按大小合併，攤還為 O(α(n))，α 小到可視為常數。
