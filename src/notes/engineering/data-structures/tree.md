# 樹：二元樹、BST、AVL 與多路搜尋樹

## 樹與二元樹

### 基本術語

樹是**無環、連通**的層級結構：n 個節點、恰好 n − 1 條邊。每個節點（根除外）只有一個父節點。

| 術語 | 意思 |
|---|---|
| 根 root | 最上面的節點，沒有父節點 |
| 葉 leaf | 沒有子節點的節點 |
| 度 degree | 一個節點的子節點數；樹的度是所有節點中最大的度 |
| 高度 height | 從該節點到最深葉節點的邊數 |
| 深度 depth | 從根到該節點的邊數 |
| 階層 level | 根為第 1 層（或第 0 層，依書而定，注意約定） |
| 森林 forest | 多棵互不相交的樹 |

### 二元樹的種類

| 種類 | 定義 |
|---|---|
| 二元樹 | 每個節點最多 2 個子節點（分左、右子樹，**順序有意義**） |
| 滿二元樹 Full | 每個節點要嘛 0 個、要嘛 2 個子節點 |
| 完美二元樹 Perfect | 所有層都填滿，高度 h 時共有 2^(h+1) − 1 個節點 |
| **完全二元樹 Complete** | 除最後一層外都填滿，且最後一層靠左排列（堆積的形狀） |
| 斜曲樹 Skewed | 每個節點只有一個子節點，退化成鏈結串列 |
| 高度平衡（AVL 式） | 任一節點左右子樹高度差 ≤ 1；其他平衡樹可採不同條件 |

重要性質：高度為 h 的二元樹最多 2^(h+1) − 1 個節點；n 個節點的二元樹，高度至少 ⌊log₂n⌋。**樹越平衡，操作越接近 O(log n)；越斜曲越接近 O(n)。**

### 儲存方式

**陣列表示**（適合完全二元樹，節點 i 從 0 起算）：

```text
父節點 (i-1)/2      左子 2i+1      右子 2i+2
[1, 3, 2, 7, 5, 4]  索引 1 的值 3：父 = 1，左 = 7，右 = 5
```

斜曲樹用陣列會浪費大量空間，一般二元樹用**鏈結表示**：

```java
static class TreeNode {
    int val; TreeNode left, right;
    TreeNode(int val) { this.val = val; }
}
```

**一般樹轉二元樹**（左孩子–右兄弟法）：每個節點的「左指標」指向第一個孩子、「右指標」指向下一個兄弟，於是任何樹（及森林）都能用二元樹表示。

### 四種走訪

```java
static void pre (TreeNode r, List<Integer> o) { if (r == null) return; o.add(r.val); pre(r.left, o); pre(r.right, o); }   // 根 左 右
static void in  (TreeNode r, List<Integer> o) { if (r == null) return; in(r.left, o); o.add(r.val); in(r.right, o); }     // 左 根 右
static void post(TreeNode r, List<Integer> o) { if (r == null) return; post(r.left, o); post(r.right, o); o.add(r.val); } // 左 右 根
// 層序：用佇列（見〈鏈結串列、堆疊、佇列與遞迴〉）
```

以 `[5,3,8,1,4,7,9]` 依序插入 BST（根 5，左 3(1,4)，右 8(7,9)）：

| 走訪 | 結果 |
|---|---|
| 前序 | 5, 3, 1, 4, 8, 7, 9 |
| 中序 | 1, 3, 4, 5, 7, 8, 9（**BST 的中序一定遞增**） |
| 後序 | 1, 4, 3, 7, 9, 8, 5 |
| 層序 | [5], [3, 8], [1, 4, 7, 9] |

- **前序**：複製樹、序列化。**後序**：先處理子節點再處理自己（刪除、算子樹大小）。**中序**：BST 取得排序結果。
- 運算式樹：中序得到中置式，前序得前置式，後序得後置式（逆波蘭，用堆疊求值）。
- 遞迴空間 O(h)；樹退化成鏈時 h = n，可能 `StackOverflowError`，要改用堆疊迭代：

```java
static List<Integer> inorderIter(TreeNode root) {
    List<Integer> res = new ArrayList<>();
    Deque<TreeNode> st = new ArrayDeque<>();
    TreeNode cur = root;
    while (cur != null || !st.isEmpty()) {
        while (cur != null) { st.push(cur); cur = cur.left; }   // 一路往左壓入
        cur = st.pop();
        res.add(cur.val);
        cur = cur.right;
    }
    return res;
}
```

## 二元搜尋樹 BST

### 定義

**對每個節點：左子樹所有值 < 該節點 < 右子樹所有值。** 推論：中序走訪得到嚴格遞增序列（所以可用來驗證 BST）。每次排除一側子樹，但只有平衡時才有 O(log n) 高度保證。

### 查找、插入、刪除

```java
static TreeNode insert(TreeNode r, int v) {
    if (r == null) return new TreeNode(v);
    if (v < r.val) r.left = insert(r.left, v);
    else if (v > r.val) r.right = insert(r.right, v);       // 相等視為已存在
    return r;
}
static boolean contains(TreeNode r, int v) {
    while (r != null) {
        if (v == r.val) return true;
        r = v < r.val ? r.left : r.right;
    }
    return false;
}
```

**刪除三種情況**：

| 情況 | 作法 |
|---|---|
| 葉節點 | 直接移除 |
| 只有一個子節點 | 用子節點取代它 |
| 兩個子節點 | 用**中序後繼**（右子樹最小）或**中序前驅**（左子樹最大）的值取代，再刪除那個後繼節點 |

```java
static TreeNode delete(TreeNode r, int v) {
    if (r == null) return null;
    if (v < r.val) r.left = delete(r.left, v);
    else if (v > r.val) r.right = delete(r.right, v);
    else {
        if (r.left == null) return r.right;
        if (r.right == null) return r.left;
        TreeNode succ = r.right;
        while (succ.left != null) succ = succ.left;          // 右子樹最小
        r.val = succ.val;
        r.right = delete(r.right, succ.val);
    }
    return r;
}
```

### 退化問題

依 1, 2, 3, 4, 5 這種**已排序**順序插入，每個值都比前一個大，一路往右長 → 一條鏈（實測高度 4，等於 n − 1），所有操作退化成 O(n)。解法是**自平衡**樹：AVL、紅黑樹。

| 操作 | 平衡 BST | 退化成鏈 |
|---|---|---|
| 搜尋 / 插入 / 刪除 | O(log n) | O(n) |
| 找最小 / 最大 | O(log n) | O(n) |
| 走訪全部 | O(n) | O(n) |
| 空間 | O(n)，遞迴堆疊 O(h) | |

### ⚠️ 驗證 BST：不能只比父子

```java
// ❌ 只比父子：5 → 左 3 → 3 的右子 6，6 > 3 看起來合法，但 6 在 5 的左子樹卻比 5 大
// ✅ 每個節點都要落在由祖先決定的 (lo, hi) 範圍內
static boolean isBST(TreeNode r, long lo, long hi) {
    if (r == null) return true;
    if (r.val <= lo || r.val >= hi) return false;
    return isBST(r.left, lo, r.val) && isBST(r.right, r.val, hi);
}
// 呼叫：isBST(root, Long.MIN_VALUE, Long.MAX_VALUE)；用 long 避免節點值剛好是 Integer.MIN/MAX
```

實測該樹 `wrongBST = true`（誤判）、範圍檢查版 `= false`（正確）。也可以用中序走訪檢查是否嚴格遞增。

### Java 的樹：TreeMap / TreeSet

- 底層是**紅黑樹**，key 自動排序，get / put / remove 為 O(log n)；完整走訪仍是 O(n)。
- 範圍與鄰近查詢：`floorKey`、`ceilingKey`、`lowerKey`、`higherKey`、`firstKey`、`headMap`、`tailMap`、`subMap`。
- 只有真的需要排序或範圍查詢才選它，否則 `HashMap` 更快。
- 用自訂物件當 key 要提供 `Comparable` 或 `Comparator`，且比較邏輯要與 `equals` 一致。

## AVL 樹

### 平衡因子與旋轉

**AVL 樹**是最早的自平衡 BST：每個節點的**平衡因子 BF = 左子樹高度 − 右子樹高度**，必須是 −1、0 或 +1，否則就旋轉修復。

插入新節點 N 後，找離 N 最近、BF 變成 ±2 的祖先 p，依 N 落在 p 的哪一側決定調整型態（只看前兩步方向）：

| 型態 | N 的位置 | 修復 |
|---|---|---|
| **LL** | p 的左子的左邊 | 對 p **右旋** |
| **RR** | p 的右子的右邊 | 對 p **左旋** |
| **LR** | p 的左子的右邊 | 先對左子**左旋**，再對 p **右旋** |
| **RL** | p 的右子的左邊 | 先對右子**右旋**，再對 p **左旋** |

```text
LL（右旋）：       50(BF=2)              40
                  /                     /  \
                40          →         30    50
               /
             30
LR（先左旋再右旋）： 50                   50                  45
                  /                     /                   /  \
                40        →          45         →         40    50
                  \                  /
                  45               40
```

```java
static class AVL { int key, h = 1; AVL l, r; AVL(int k) { key = k; } }
static int h(AVL n) { return n == null ? 0 : n.h; }
static void upd(AVL n) { n.h = 1 + Math.max(h(n.l), h(n.r)); }
static AVL rotR(AVL y) { AVL x = y.l; y.l = x.r; x.r = y; upd(y); upd(x); return x; }   // 右旋
static AVL rotL(AVL x) { AVL y = x.r; x.r = y.l; y.l = x; upd(x); upd(y); return y; }   // 左旋

static AVL insert(AVL n, int k) {
    if (n == null) return new AVL(k);
    if (k < n.key) n.l = insert(n.l, k);
    else if (k > n.key) n.r = insert(n.r, k);
    else return n;
    upd(n);
    int bf = h(n.l) - h(n.r);
    if (bf > 1 && k < n.l.key) return rotR(n);                          // LL
    if (bf < -1 && k > n.r.key) return rotL(n);                         // RR
    if (bf > 1 && k > n.l.key) { n.l = rotL(n.l); return rotR(n); }     // LR
    if (bf < -1 && k < n.r.key) { n.r = rotR(n.r); return rotL(n); }    // RL
    return n;
}
// 此實作用節點數計高：BST 為 7、AVL 為 3；依本文邊數定義則分別為 6、2，AVL 根為 4
```

- 旋轉保持 BST 的性質（中序不變），只改局部指標，**O(1)**；一次插入最多需要一次（單或雙）旋轉。
- 刪除之後可能要沿路徑往上做多次旋轉，最壞 O(log n)。
- AVL 高度嚴格 ≤ 約 1.44 log₂n，查詢比紅黑樹略快；紅黑樹旋轉次數較少、寫入較快。**Java 的 `TreeMap` 與 `HashMap` 的樹化用紅黑樹**。

### 紅黑樹（概念）

紅黑樹是較寬鬆的平衡：每個節點紅或黑，根與 NIL 空葉為黑（有值的葉節點可以是紅色）、**紅節點不能有紅子節點**、**每條根到葉的路徑黑節點數相同**。這保證最長路徑不超過最短路徑的 2 倍，高度 O(log n)。不需要背規則，記得：用旋轉與變色，換「插入順序不會讓樹退化」的保證。

## 多路搜尋樹與 B-Tree

### 為什麼需要多路樹

資料量大到放不進記憶體時，瓶頸是**磁碟 I/O**。磁碟一次讀一整個 page（8KB～16KB），如果每個節點只存 1 個 key（二元樹），每往下一層就是一次 I/O，樹高很快超過十幾層。**多路樹讓每個節點存很多 key，把樹壓得很矮**。

### m-way 搜尋樹

每個節點最多 m − 1 個 key、m 個子樹，key 由小到大排列，子樹 i 的值落在相鄰兩個 key 之間（3-way 搜尋樹 = 每節點最多 2 個 key）。但它**不保證平衡**，可能退化，所以需要 B-Tree。

### 2-3 樹與 2-3-4 樹

| | 2-3 樹 | 2-3-4 樹 |
|---|---|---|
| 節點種類 | 2-node（1 key、2 子）、3-node（2 key、3 子） | 再加 4-node（3 key、4 子） |
| 平衡 | **所有葉節點在同一層**（完全平衡） | 同左 |

**插入**：找到葉節點放進去。若放進 3-node 變成 3 個 key（暫時的 4-node），就**分裂**：中間 key 往上提給父節點，其餘兩個各成一個節點；父節點滿了就繼續往上分裂，一路到根，根分裂時**樹高 +1**（樹只會從根往上長，所以葉永遠同層）。

**刪除**：從葉節點刪（內部節點的 key 先與中序後繼交換）。若節點變空，先向兄弟「**借**」key（經過父節點旋轉），借不到就與兄弟與父節點的 key **合併**，並可能一路向上傳遞。

一棵共 h 層的 2-3 樹含 key 數：最少 2^h − 1（全 2-node）、最多 3^h − 1（全 3-node），所以層數是 Θ(log n)。**2-3-4 樹與紅黑樹等價**（紅黑樹可以看成 2-3-4 樹的二元樹編碼）。

### B-Tree（階 m）

B-Tree of order m：

1. 每個節點最多 m 個子樹（m − 1 個 key）。
2. 根（非葉）至少 2 個子樹；其他內部節點至少 ⌈m/2⌉ 個子樹。
3. **所有葉節點在同一層**。
4. 節點內 key 由小到大。

插入 / 刪除與 2-3 樹同樣用**分裂、借位、合併**維持規則。2-3 樹就是 order 3 的 B-Tree。

| | B-Tree | B+ Tree |
|---|---|---|
| 資料位置 | 內部節點與葉節點都存資料 | **只有葉節點存資料**，內部節點只存 key 當路標 |
| 葉節點 | 彼此獨立 | **以鏈結串列串接** |
| 範圍查詢 | 要中序走訪 | 定位起點後沿葉鏈一路往右，快 |
| 查詢成本 | 可能在內部節點就命中 | 一律走到葉，成本穩定 |

**資料庫索引用 B+ Tree，不是二元搜尋樹**：每個節點塞上百個 key、充分利用一個 page，上億筆資料樹高也只有 3～4 層，點查詢的索引路徑可能只需少量頁面讀取；實際 I/O 取決於快取、回表與結果筆數；葉節點鏈結讓 `BETWEEN`、`ORDER BY`、分頁特別快。

**keyset pagination**（`WHERE id > ? ORDER BY id LIMIT 20`）比 `OFFSET` 快：前者用索引直接定位起點葉節點再沿鏈往右取 20 筆；後者要先掃過並丟棄前面 OFFSET 筆。

## 面試速查

**Q：為什麼中序走訪 BST 會得到排序結果？**
左子樹都小於根、右子樹都大於根，「左 → 根 → 右」遞迴下去，每個節點都在比它小的全部之後、比它大的全部之前。

**Q：按排序順序插入 BST 會怎樣？怎麼解決？**
每次都往同一側長，退化成鏈，操作 O(n)。用自平衡樹（AVL、紅黑樹）以旋轉維持高度 O(log n)。

**Q：驗證 BST 為什麼不能只比較父子？**
子樹中更深的節點也要滿足所有祖先的上下界；只比父子會漏掉「左子樹裡某個後代比根大」的情況。

**Q：AVL 的四種旋轉怎麼判斷？**
看新節點相對於「失衡節點 p」的前兩步方向：LL 右旋、RR 左旋、LR 先左旋再右旋、RL 先右旋再左旋。

**Q：AVL 與紅黑樹的取捨？**
AVL 更嚴格平衡，查詢略快、插入刪除旋轉較多；紅黑樹較寬鬆，寫入較快。Java `TreeMap` 用紅黑樹。

**Q：為什麼資料庫索引用 B+ Tree？**
多路樹壓低樹高以減少磁碟 I/O；只有葉節點存資料，內部節點能塞更多 key；葉節點鏈結使範圍查詢高效。

**Q：B+ Tree 與 LSM Tree 的取捨？**
B+ Tree 讀取最佳化（樹矮、範圍查詢快）、寫入是隨機寫；LSM Tree 把隨機寫轉成順序寫，寫入吞吐高但讀取路徑複雜（見〈進階結構與選型〉）。
