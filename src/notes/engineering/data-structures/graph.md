# 圖

## 概念與表示法

### 為什麼需要圖

資料之間是任意的**多對多**關係時，用圖：捷運路網（站 = 節點 vertex、軌道 = 邊 edge、行駛時間 = 權重）、社群好友、微服務依賴、任務排程。

**樹是圖的特例**：n 個節點、n − 1 條邊、連通且無環。圖多了「可能有環」，所以走訪時要用 **visited** 記錄走過的節點，否則會在環裡無限繞圈（遞迴版 → `StackOverflowError`）。樹只沿父到子的指標走訪時可省略 visited；無向鄰接串列仍須排除父節點或使用 visited。

### 分類

| 維度 | 分類 |
|---|---|
| 方向 | **有向圖**（追蹤者關係，A 追蹤 B 不代表 B 追蹤 A）／ **無向圖**（好友，必定雙向） |
| 權重 | **加權圖**（邊有距離、費用）／ 無權圖 |
| 環 | 有環圖／ **DAG**（有向無環圖，任務相依、工作流程） |
| 密度 | 稀疏圖（E 遠小於 V²，社群、路網）／ 稠密圖（E 接近 V²） |
| 連通 | 連通圖／ 非連通（有多個連通分量）；有向圖有強連通分量 |

另外：**度（degree）**是與節點相連的邊數；有向圖分入度（indegree）與出度（outdegree）。

### 兩種表示法

```text
圖：0-1, 0-2, 1-3, 2-3, 3-4（無向）

鄰接矩陣（V×V，adj[i][j] = 1 表示有邊）：        鄰接串列：
     0 1 2 3 4                                    0: [1, 2]
  0  0 1 1 0 0                                    1: [0, 3]
  1  1 0 0 1 0                                    2: [0, 3]
  2  1 0 0 1 0                                    3: [1, 2, 4]
  3  0 1 1 0 1                                    4: [3]
  4  0 0 0 1 0
```

| | 鄰接矩陣 | 鄰接串列 |
|---|---|---|
| 空間 | O(V²) | **O(V + E)** |
| 查詢 u、v 是否相鄰 | **O(1)** | O(degree) |
| 列出 u 的所有鄰居 | O(V) | **O(degree)** |
| 適用 | 稠密圖、需要頻繁查詢邊是否存在 | **稀疏圖（真實世界絕大多數）** |

無向圖的鄰接矩陣是**對稱**的，可以只存一半。真實世界的圖幾乎都是稀疏的，所以**鄰接串列是預設選擇**。

```java
List<Integer>[] adj = new List[n];                       // 或 List<List<Integer>>
for (int i = 0; i < n; i++) adj[i] = new ArrayList<>();
adj[u].add(v); adj[v].add(u);                            // 無向圖要雙向加；有向圖只加一邊
// 加權圖：adj[u].add(new int[]{v, w})，或自訂 Edge 類別
```

## 走訪：DFS 與 BFS

### DFS（深度優先）

一路走到底再回頭，用**遞迴**（或顯式堆疊）。

```java
static void dfs(List<Integer>[] adj, int u, boolean[] vis, List<Integer> order) {
    vis[u] = true; order.add(u);
    for (int v : adj[u]) if (!vis[v]) dfs(adj, v, vis, order);
}
// 範例圖從 0 出發：0, 1, 3, 2, 4
```

### BFS（廣度優先）

一層一層往外擴散，用**佇列**，`visited` 要在**放入佇列時**就標記（避免同一節點被重複放入）。

```java
static int bfsShortest(List<Integer>[] adj, int s, int t) {
    boolean[] vis = new boolean[adj.length];
    Queue<Integer> q = new ArrayDeque<>();
    q.offer(s); vis[s] = true;
    int steps = 0;
    while (!q.isEmpty()) {
        int size = q.size();                    // 這一層的節點數
        while (size-- > 0) {
            int u = q.poll();
            if (u == t) return steps;           // 第一次到達就是最短
            for (int v : adj[u]) if (!vis[v]) { vis[v] = true; q.offer(v); }
        }
        steps++;
    }
    return -1;                                  // 不連通
}
// 範例圖 0 → 4：實測 3 步（0→1→3→4 或 0→2→3→4）
```

**BFS 保證無權圖的最短路徑**：它按「與起點的距離」一層一層處理，第一次抵達某節點的層數就是最短距離。DFS 先走到底，先抵達目標的路徑不保證最短。

### DFS vs BFS 怎麼選

| 情境 | 選擇 |
|---|---|
| 最少步數 / 無權最短路徑 | **BFS** |
| 判斷路徑是否存在、列舉所有路徑、回溯 | DFS（遞迴程式短、天然適合窮舉） |
| 圖非常深 | BFS（遞迴 DFS 可能爆堆疊） |
| 解在很深的地方 | DFS |
| 判斷有向圖是否有環 | DFS 三色標記，或拓撲排序 |
| 連通分量 | 兩者皆可，或併查集 |

### 複雜度

走訪每個節點與每條邊各一次：**O(V + E)**（鄰接串列）；鄰接矩陣要 O(V²)。空間 O(V)（visited + 佇列 / 遞迴堆疊）。

## 拓撲排序

### 概念與 Kahn 演算法

對 **DAG** 排出一個順序，使每條邊 u → v 中 u 都排在 v 前面（先修課 → 後修課）。

```text
先修關係：0→1, 0→2, 1→3, 2→3     入度：[0, 1, 1, 2]

1. 入度為 0 的節點放進佇列：[0]
2. 取出 0（order=[0]），0 指向的 1、2 入度各減 1 → 都變 0，入佇列：[1, 2]
3. 取出 1（order=[0,1]），3 的入度 2→1，還不是 0
4. 取出 2（order=[0,1,2]），3 的入度 1→0，入佇列：[3]
5. 取出 3 → order=[0,1,2,3]
```

```java
static List<Integer> topo(int n, int[][] edges) {
    List<Integer>[] adj = new List[n]; int[] in = new int[n];
    for (int i = 0; i < n; i++) adj[i] = new ArrayList<>();
    for (int[] e : edges) { adj[e[0]].add(e[1]); in[e[1]]++; }
    Queue<Integer> q = new ArrayDeque<>();
    for (int i = 0; i < n; i++) if (in[i] == 0) q.offer(i);
    List<Integer> order = new ArrayList<>();
    while (!q.isEmpty()) {
        int u = q.poll(); order.add(u);
        for (int v : adj[u]) if (--in[v] == 0) q.offer(v);
    }
    return order.size() == n ? order : List.of();      // 長度不足 → 有環，無法排序
}
// 實測：[0,1,2,3]；兩節點互相指向 → []
```

- **同時用來偵測環**：排完後 `order.size() != n` 代表有節點的入度永遠不會變 0，即存在環。
- 合法順序不唯一（上例 1、2 可互換）。
- 也可以用 DFS：後序走訪的**反序**就是拓撲序；有環判斷用**三色標記**（0 未訪、1 走訪中、2 已完成；走到「走訪中」的節點代表有環）。

```java
static boolean hasCycleDirected(List<Integer>[] adj) {
    int[] color = new int[adj.length];
    for (int i = 0; i < adj.length; i++) if (color[i] == 0 && dfs(adj, i, color)) return true;
    return false;
}
static boolean dfs(List<Integer>[] adj, int u, int[] color) {
    color[u] = 1;
    for (int v : adj[u]) {
        if (color[v] == 1) return true;                    // 回到走訪中的節點 → 有環
        if (color[v] == 0 && dfs(adj, v, color)) return true;
    }
    color[u] = 2; return false;
}
```

## 最短路徑與最小生成樹

### 最短路徑

| 演算法 | 時間 | 適用 |
|---|---|---|
| BFS | O(V + E) | 無權圖 |
| **Dijkstra**（堆積優化） | O((V + E) log V) | **非負權重**，單源最短路 |
| Bellman-Ford | O(V·E) | 可有負權重、偵測負環 |
| Floyd-Warshall | O(V³) | 所有節點對之間 |

Dijkstra 的想法：每次從**尚未確定的節點中取出距離最小者**（用最小堆積），用它鬆弛（relax）鄰居的距離；已確定的節點不會再變小（因為權重非負）。

```java
static long[] dijkstra(List<int[]>[] g, int s) {          // g[u] 的元素是 {v, 權重}
    long[] dist = new long[g.length];
    Arrays.fill(dist, Long.MAX_VALUE); dist[s] = 0;
    PriorityQueue<long[]> pq = new PriorityQueue<>(Comparator.comparingLong(a -> a[1]));
    pq.offer(new long[]{s, 0});
    while (!pq.isEmpty()) {
        long[] cur = pq.poll(); int u = (int) cur[0];
        if (cur[1] > dist[u]) continue;                   // 過期的紀錄，跳過
        for (int[] e : g[u]) {
            long nd = dist[u] + e[1];
            if (nd < dist[e[0]]) { dist[e[0]] = nd; pq.offer(new long[]{e[0], nd}); }
        }
    }
    return dist;
}
// 邊 0-1(4)、0-2(1)、2-1(2)、1-3(1)、2-3(5)、3-4(3)（無向）：從 0 出發 → [0, 3, 1, 4, 7]
```

⚠️ 有負權重邊時 Dijkstra 會算錯，要用 Bellman-Ford。

### 最小生成樹（MST）

連通加權無向圖中，連接所有節點、總權重最小的 V − 1 條邊。

- **Kruskal**：邊依權重排序，依序加入「**連接不同群**」的邊，用**併查集**判斷。O(E log E)。
- **Prim**：從一個節點長出去，每次選連到「已選集合外」的最小邊（最小堆積）。O((V + E) log V)。

```java
static long kruskal(int n, int[][] edges) {               // edges: {u, v, w}
    Arrays.sort(edges, Comparator.comparingInt(e -> e[2]));
    UF uf = new UF(n);                                    // 見〈堆積、Trie 與併查集〉
    long total = 0; int used = 0;
    for (int[] e : edges)
        if (uf.union(e[0], e[1])) { total += e[2]; used++; }
    if (used != n - 1) throw new IllegalArgumentException("disconnected graph");
    return total; // 假設 n >= 1；負權重合法，不能用 -1 同時代表失敗
}
// 上面那張圖的 MST 總權重實測 = 7（邊 0-2、1-3、2-1、3-4）
```

## 實務對照

- **微服務依賴 / Spring Bean 依賴**：判斷循環依賴 = 在有向圖找環；決定啟動順序 = 拓撲排序。Spring 預設遇到循環依賴會報錯（單例 + setter 注入可由三級快取處理）。
- **CI/CD Pipeline、Airflow DAG、Spark 執行計畫**：本質都是 DAG，任務間不能有循環依賴。
- **資料庫外鍵、資料血緣**：追蹤一筆資料來自哪些表、經過哪些轉換，是圖走訪。
- **風控與反詐騙**：把裝置、帳號、IP 建成節點，異常關聯（一個裝置對應大量帳號）在圖上有明顯的結構，連通分量（併查集）是輕量解法。
- **推薦系統、社群網路**：好友關係、最短關係鏈（BFS）、社群偵測。

## 面試速查

**Q：BFS 為什麼保證第一次到達就是最短路徑？DFS 為什麼不能？**
BFS 按距離一層層處理，先到達的層數最小；DFS 沿單一路徑深入，先到達目標的那條路徑可能繞很遠。

**Q：圖的走訪為什麼一定要 visited？樹卻通常不用？**
圖可能有環，沒有 visited 會無限迴圈；樹沿子節點指標走訪不會回頭；若以無向鄰接串列儲存，仍須跳過父節點或使用 visited。

**Q：鄰接矩陣與鄰接串列怎麼選？**
稀疏圖（多數真實場景）選鄰接串列，空間 O(V + E)；稠密圖或需要 O(1) 判斷邊是否存在選鄰接矩陣，空間 O(V²)。

**Q：拓撲排序怎麼同時用來偵測環？**
Kahn 演算法排完後若輸出節點數小於 n，代表有節點入度永遠不為 0（互相等待），即有環。

**Q：Dijkstra 為什麼不能處理負權重？**
它假設一個節點被確定最短後不會再變小，負邊會讓「後來發現的更短路徑」推翻已確定的結果。

**Q：Kruskal 與 Prim 差異？**
Kruskal 從邊出發（排序後用併查集避免成環），適合稀疏圖；Prim 從節點出發逐步擴張，用堆積取最小邊，適合稠密圖。
