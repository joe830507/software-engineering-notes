# 二元樹與圖

## 模式說明

### 樹的 DFS：三個位置

```java
void traverse(TreeNode node) {
    if (node == null) return;
    // 前序位置：由上往下傳遞資訊（例如傳遞路徑、上下界）
    traverse(node.left);
    // 中序位置：BST 在此處是排序好的
    traverse(node.right);
    // 後序位置：由下往上彙總資訊（例如高度、子樹大小）
}
```

**怎麼選前序還是後序**（這是樹題最重要的判斷力）：

- 需要「**父傳子**」的資訊（路徑、上下界、目前累積的最大值）→ 前序位置，把資訊當作**參數**往下傳。
- 需要「**子傳父**」的資訊（高度、子樹和、是否平衡）→ 後序位置，把資訊當作**回傳值**往上傳。

判斷方式：問自己「處理這個節點時，我需要的資訊是來自祖先（已經知道），還是來自子孫（還沒算出來）？」

### 樹的 BFS：分層模板

```java
Queue<TreeNode> q = new LinkedList<>();
q.offer(root);
while (!q.isEmpty()) {
    int size = q.size(); // 關鍵：先固定這一層的數量
    for (int i = 0; i < size; i++) {
        TreeNode node = q.poll();
        // 處理 node
        if (node.left != null) q.offer(node.left);
        if (node.right != null) q.offer(node.right);
    }
    // 這一層處理完了
}
```

**為什麼 BFS 適合「最短」「層級」問題**：BFS 一次處理完一整層才進入下一層，保證「第一次到達某個節點時，走過的步數就是最短步數」。DFS 會一路衝到底，中途找到目標，走過的步數不保證最短。所以「最少步數」「最短路徑（無權圖）」「第幾層」都該優先想到 BFS。

### 圖搜尋

**先判斷該用 DFS 還是 BFS**：

- 問「有幾塊 / 面積 / 能不能到」→ DFS。這類問題只在意連通性或累加值，不在意路徑長短。
- 問「最少幾步 / 同時擴散」→ BFS。這類問題需要「距離」，BFS 按層擴張天生對應距離的增加。
- 「有先後相依關係」→ 拓撲排序，本質是「有向圖是否有環」加上排序。

```java
// 網格 DFS 模板（島嶼類）
static final int[][] DIRS = {{0,1},{1,0},{0,-1},{-1,0}};
void dfs(char[][] g, int r, int c) {
    if (r < 0 || r >= g.length || c < 0 || c >= g[0].length || g[r][c] != '1') return;
    g[r][c] = '0'; // 就地標記已訪問，省 visited 陣列
    for (int[] d : DIRS) dfs(g, r + d[0], c + d[1]);
}

// 拓撲排序模板（Kahn）
int[] indegree = new int[n];
List<Integer>[] adj = new List[n];
Queue<Integer> q = new LinkedList<>();
for (int i = 0; i < n; i++) if (indegree[i] == 0) q.offer(i);
int visited = 0;
while (!q.isEmpty()) {
    int u = q.poll(); visited++;
    for (int v : adj[u]) if (--indegree[v] == 0) q.offer(v);
}
return visited == n; // 全部走完 = 無環
```

**為什麼是 O(V+E)**：不論 DFS 或 BFS，只要每個節點與每條邊都只被訪問常數次（靠 visited 標記或就地修改保證），總時間就是「節點數 + 邊數」。想成「郵差只會投遞每一封信一次」。

**注意**：圖可能有環、多條路徑與不連通分量，需要 visited 或其他狀態。

### 空間複雜度要算遞迴堆疊

二元樹 DFS 的額外空間是 O(h)（h 為樹高），偏斜樹可達 O(n)。深度很大的樹可能導致 Java `StackOverflowError`，可改迭代 BFS / DFS。

```java
class TreeNode {
    int val;
    TreeNode left, right;
    TreeNode() {}
    TreeNode(int val) { this.val = val; }
    TreeNode(int val, TreeNode left, TreeNode right) {
        this.val = val; this.left = left; this.right = right;
    }
}
```

## #104 Maximum Depth of Binary Tree（Easy）

[官方題目](https://leetcode.com/problems/maximum-depth-of-binary-tree/)

**題意**：回傳從根到最深葉節點路徑上的節點數。

**範例**：根 1，左子 2，2 的左子 3 → 3

**解題思路**：空樹深度為 0；非空節點的深度等於 1 加上左右子樹深度的最大值。每個遞迴呼叫只負責回答自己子樹的深度。這是「子傳父」的後序應用。

```java
class Solution {
    public int maxDepth(TreeNode root) {
        if (root == null) return 0;
        return 1 + Math.max(maxDepth(root.left), maxDepth(root.right));
    }
}
```

**複雜度**：時間 O(n)，額外空間 O(h)；最差退化成鏈時 O(n)。

**注意事項**：不是固定 O(log n) 空間。

## #226 Invert Binary Tree（Easy）

[官方題目](https://leetcode.com/problems/invert-binary-tree/)

**題意**：把二元樹每個節點的左右子樹交換。

**範例**：`[1,2,3]` → `[1,3,2]`（層序表示）

**解題思路**：先把原左右子樹各自翻轉，再交換連結。每層遞迴回傳翻轉後的子樹根，供上一層接回。

```java
class Solution {
    public TreeNode invertTree(TreeNode root) {
        if (root == null) return null;
        TreeNode left = invertTree(root.left);
        TreeNode right = invertTree(root.right);
        root.left = right;
        root.right = left;
        return root;
    }
}
```

**複雜度**：時間 O(n)，額外空間 O(h)。

**注意事項**：直接修改原樹；需先保存左右結果，避免覆寫連結後又處理到同一棵子樹。

## #102 Binary Tree Level Order Traversal（Medium）

[官方題目](https://leetcode.com/problems/binary-tree-level-order-traversal/)

**題意**：按深度逐層回傳節點值。

**範例**：`[1,2,3,null,4]` → `[[1],[2,3],[4]]`

**解題思路**：FIFO 佇列保證先處理較淺節點。每輪先**固定 `queue.size()`**，只取出該數量的節點；過程中加入的孩子屬於下一層。

```java
class Solution {
    public List<List<Integer>> levelOrder(TreeNode root) {
        List<List<Integer>> answer = new ArrayList<>();
        if (root == null) return answer;
        Deque<TreeNode> queue = new ArrayDeque<>();
        queue.offer(root);
        while (!queue.isEmpty()) {
            int size = queue.size();
            List<Integer> level = new ArrayList<>();
            for (int i = 0; i < size; i++) {
                TreeNode node = queue.poll();
                level.add(node.val);
                if (node.left != null) queue.offer(node.left);
                if (node.right != null) queue.offer(node.right);
            }
            answer.add(level);
        }
        return answer;
    }
}
```

**複雜度**：時間 O(n)，額外工作空間 O(w)，w 為最大層寬；另加結果 O(n)。

**注意事項**：不能在 `for` 條件持續讀變動中的 `queue.size()`，否則會混入下一層。`ArrayDeque` 不接受 `null`。

## #98 Validate Binary Search Tree（Medium）

[官方題目](https://leetcode.com/problems/validate-binary-search-tree/)

**題意**：驗證所有節點都符合嚴格的二元搜尋樹規則。

**範例**：根 5、左 3、右 7，7 的左子為 4 → false

**解題思路**：每個節點繼承祖先給的開區間 `(low, high)`。左子樹上界縮為目前值，右子樹下界提高為目前值。上例的 4 雖然小於父節點 7，但違反祖先 5 的下界。這是「父傳子」的前序應用。

```java
class Solution {
    public boolean isValidBST(TreeNode root) {
        return valid(root, Long.MIN_VALUE, Long.MAX_VALUE);
    }
    private boolean valid(TreeNode node, long low, long high) {
        if (node == null) return true;
        if (node.val <= low || node.val >= high) return false;
        return valid(node.left, low, node.val) && valid(node.right, node.val, high);
    }
}
```

**複雜度**：時間 O(n)，額外空間 O(h)。

**注意事項**：只比較直接子節點不足。重複值不合法；用 `long` 邊界才能允許 `Integer.MIN_VALUE` / `MAX_VALUE` 作合法節點。另一種做法是中序遍歷後檢查是否嚴格遞增。

## #236 Lowest Common Ancestor of a Binary Tree（Medium）

[官方題目](https://leetcode.com/problems/lowest-common-ancestor-of-a-binary-tree/)

**題意**：找一般二元樹中兩個指定節點的最近共同祖先。

**範例**：根 1、左 2、右 3：LCA(2,3)=1；LCA(1,2)=1

**解題思路**：遇到 p / q 就回傳該節點；否則遞迴搜尋左右。兩側都找到時，當前節點正是分岔點；只有一側有結果時，把該結果向上傳。

```java
class Solution {
    public TreeNode lowestCommonAncestor(TreeNode root, TreeNode p, TreeNode q) {
        if (root == null || root == p || root == q) return root;
        TreeNode left = lowestCommonAncestor(root.left, p, q);
        TreeNode right = lowestCommonAncestor(root.right, p, q);
        if (left != null && right != null) return root;
        return left != null ? left : right;
    }
}
```

**複雜度**：時間 O(n)，額外空間 O(h)。

**注意事項**：這不是 BST，不可依數值大小選邊。依本題保證 p、q 存在且不同；若允許不存在，需額外確認兩者都找到。

## #200 Number of Islands（Medium）

[官方題目](https://leetcode.com/problems/number-of-islands/)

**題意**：計算網格中上下左右連通的陸地群數。

**範例**：`["110","010","001"]` → 2（對角不相連）

**解題思路**：每當掃到未拜訪陸地，就新增一座島並用 BFS 把整個連通分量標成水。**入隊時立刻標記**，可避免多個鄰居重複將同一格放入佇列。

```java
class Solution {
    public int numIslands(char[][] grid) {
        if (grid.length == 0 || grid[0].length == 0) return 0;
        int rows = grid.length, cols = grid[0].length, islands = 0;
        int[][] dirs = {{1,0},{-1,0},{0,1},{0,-1}};
        Deque<int[]> queue = new ArrayDeque<>();
        for (int r = 0; r < rows; r++) {
            for (int c = 0; c < cols; c++) {
                if (grid[r][c] != '1') continue;
                islands++;
                grid[r][c] = '0';
                queue.offer(new int[]{r,c});
                while (!queue.isEmpty()) {
                    int[] cell = queue.poll();
                    for (int[] dir : dirs) {
                        int nr = cell[0]+dir[0], nc = cell[1]+dir[1];
                        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols || grid[nr][nc] != '1') continue;
                        grid[nr][nc] = '0';
                        queue.offer(new int[]{nr,nc});
                    }
                }
            }
        }
        return islands;
    }
}
```

**複雜度**：R 列 C 欄：時間 O(RC)，額外空間最差 O(RC)。

**注意事項**：此版會修改 `grid`。若不能修改，需額外 `visited`。BFS 避免大島造成遞迴堆疊溢位；一般圖 DFS / BFS 是 O(V+E)。
