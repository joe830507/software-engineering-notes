# 鏈結串列、堆疊、佇列與遞迴

## 鏈結串列

### 結構

節點散落在記憶體各處，靠每個節點內的**指標（參考）**串起來。

```text
單向： head → [1|•] → [2|•] → [3|•] → null
雙向： null ← [•|1|•] ⇄ [•|2|•] ⇄ [•|3|•] → null
              prev val next
```

- **插入 / 刪除快**：只改指標，不搬動資料（前提：已經拿到那個位置的節點）。
- **隨機存取慢**：要第 k 個就得從頭走 k 步，O(n)。
- **走訪比陣列慢**：節點不連續 → cache miss，即使 Big-O 都是 O(n) 實測也常慢數倍。
- 每個節點有額外的指標開銷（單向 1 個、雙向 2 個）與物件標頭。

| 操作 | 單向 | 雙向（`LinkedList`） | 陣列 |
|---|---|---|---|
| 頭部插入 / 刪除 | O(1) | O(1) | O(n) |
| 尾部插入 | O(n)（無 tail 指標時） | O(1) | 攤還 O(1) |
| 依索引存取 | O(n) | O(n) | O(1) |
| 已知節點時刪除自己 | O(n)（要找前驅） | **O(1)** | O(n) |
| 搜尋 | O(n) | O(n) | O(n) |

### 手刻與三個必背技巧

```java
static class ListNode {
    int val; ListNode next;
    ListNode(int val) { this.val = val; }
    ListNode(int val, ListNode next) { this.val = val; this.next = next; }
}
```

**1. 虛擬頭節點（dummy）**：刪除或插入頭部時，不必寫「如果是頭節點」的特殊判斷。

```java
static ListNode removeAll(ListNode head, int target) {
    ListNode dummy = new ListNode(0, head), cur = dummy;
    while (cur.next != null) {
        if (cur.next.val == target) cur.next = cur.next.next;  // 跳過它，cur 不前進
        else cur = cur.next;
    }
    return dummy.next;                    // 1→2→3→2 刪除 2 得到 1→3
}
```

**2. 先存 `next` 再改指標（反轉）**：反轉要同時記住「現在在哪（cur）、剛從哪來（prev）、等一下去哪（next）」。

```java
static ListNode reverse(ListNode head) {
    ListNode prev = null, cur = head;
    while (cur != null) {
        ListNode next = cur.next;    // ① 先存起來，否則改了指標就找不到後面
        cur.next = prev;             // ② 掉頭
        prev = cur;                  // ③ prev 前進
        cur = next;                  // ④ cur 前進
    }
    return prev;                     // 1→2→3→2 得到 2→3→2→1
}
```

**3. 快慢指標**：快指標每次走 2 步、慢指標走 1 步。

- 找中點：快指標到尾時慢指標在中間。
- 判斷有無環：快慢指標相遇就有環。
- 倒數第 k 個：快指標先走 k 步，再同步前進，快指標到底時慢指標就是答案。

```java
static boolean hasCycle(ListNode head) {
    ListNode slow = head, fast = head;
    while (fast != null && fast.next != null) {
        slow = slow.next; fast = fast.next.next;
        if (slow == fast) return true;
    }
    return false;
}
```

### 實務對照與陷阱

- **`LinkedList` 真正的用途只剩 Deque**，但現在更推薦 `ArrayDeque`（環狀陣列、無節點物件、更快）。
- **`LinkedHashMap` = `HashMap` + 貫穿所有節點的雙向鏈結串列**：雜湊表 O(1) 定位，鏈結串列 O(1) 移動節點，是 LRU 快取的基礎（見〈進階結構與選型〉）。
- **把 `LinkedList` 宣告成 `List` 並在迴圈裡 `get(i)`**：O(n) 包在 O(n) 迴圈裡 → O(n²)。code review 看到幾乎必定是效能地雷。

## 堆疊 Stack

### 後進先出（LIFO）

只能從同一端進出：`push`、`pop`、`peek`，都是 **O(1)**。形狀正好對應「回溯、配對、巢狀」。

### 什麼時候想到堆疊

- 括號 / HTML 標籤**配對**。
- 需要回到「上一個狀態」：undo、瀏覽器上一頁、DFS。
- 找「**下一個更大 / 更小的元素**」（單調堆疊）。
- 表達式求值（逆波蘭式）。

### 括號配對

```java
static boolean valid(String s) {
    Deque<Character> st = new ArrayDeque<>();
    for (char c : s.toCharArray()) {
        switch (c) {
            case '(' -> st.push(')');         // 推入「期待的右括號」，比對時更簡單
            case '[' -> st.push(']');
            case '{' -> st.push('}');
            default -> { if (st.isEmpty() || st.pop() != c) return false; }
        }
    }
    return st.isEmpty();                      // 剛好清空才合法
}
// valid("({[]})") = true   valid("([)]") = false   valid("((") = false
```

`"([)]"`：推入 `(` `[` 後遇到 `)`，頂端卻是 `[` → 配對失敗。**右括號永遠只能跟最近一個還沒關閉的左括號配對**，這正是 LIFO。

### 單調堆疊：下一個更大元素

```java
static int[] nextGreater(int[] a) {
    int[] res = new int[a.length];
    Arrays.fill(res, -1);
    Deque<Integer> st = new ArrayDeque<>();           // 存索引，值由大到小
    for (int i = 0; i < a.length; i++) {
        while (!st.isEmpty() && a[st.peek()] < a[i])
            res[st.pop()] = a[i];                     // a[i] 是被彈出者的下一個更大值
        st.push(i);
    }
    return res;                                       // [2,1,2,4,3] → [4,2,4,-1,-1]
}
```

外層 n 次、內層 `while` 看似巢狀，但**每個元素最多 push 一次、pop 一次**，總操作 ≤ 2n，所以整體是 **O(n)**（攤還分析）。

### Java 的選擇

- **不要用 `java.util.Stack`**：它繼承 `Vector`（每個方法都 `synchronized`），而且因為是 `Vector` 可以隨機存取、迭代順序是由底到頂。
- 用 `Deque<Integer> st = new ArrayDeque<>()`，`push`/`pop`/`peek` 都在**頭端**操作。實測迭代順序：`ArrayDeque` push 1,2,3 後是 `[3, 2, 1]`（頂端在前），`Stack` 是 `[1, 2, 3]`。

### 實務對照

- **JVM 呼叫堆疊**：每次呼叫 push 一個 stack frame，return 時 pop。遞迴沒有終止條件 → `StackOverflowError`；深度很大的遞迴要改寫成迭代，自己用堆疊模擬。
- **Spring `NESTED` 交易**：以資料庫 savepoint 一層層疊起來，內層失敗只回滾到自己的 savepoint。
- **Saga 補償**：每成功一步就 push；失敗時從頂端逐一 pop 並執行補償（退款、釋放庫存），回復順序與執行順序**相反**。

## 佇列 Queue 與 Deque

### 先進先出（FIFO）

佇列的價值是**緩衝**：生產者速度不固定，消費者速度固定，佇列吸收落差（**削峰填谷**），這是 Kafka、RabbitMQ 存在的理由。

**Deque（雙端佇列）**：兩端都能進出，同時具備堆疊與佇列的能力，是目前 Java 推薦取代 `Stack` 與傳統 `Queue` 實作的容器。

### BFS 層序走訪

```java
static List<List<Integer>> level(TreeNode root) {
    List<List<Integer>> res = new ArrayList<>();
    if (root == null) return res;
    Queue<TreeNode> q = new ArrayDeque<>();
    q.offer(root);
    while (!q.isEmpty()) {
        int size = q.size();                    // ★ 先鎖定「這一層」有幾個節點
        List<Integer> row = new ArrayList<>();
        for (int i = 0; i < size; i++) {
            TreeNode n = q.poll();
            row.add(n.val);
            if (n.left != null) q.offer(n.left);
            if (n.right != null) q.offer(n.right);
        }
        res.add(row);
    }
    return res;
}
```

沒有先鎖定 `size` 的話，下一層的子節點會混進同一輪，分不出層的邊界。

### Java 佇列實作選型

| 實作 | 特性 | 使用時機 |
|---|---|---|
| `ArrayDeque` | 環狀陣列，最快，**不允許 null**（實測 `add(null)` 丟 NPE） | 一般首選，當 Stack 或 Queue 都適合 |
| `LinkedList` | 雙向鏈表，允許 null | 需要放 null 時（很少） |
| `PriorityQueue` | 二元堆積，依優先權出列 | Top-K、排程 |
| `LinkedBlockingQueue` | 阻塞佇列，可有界 | 生產者-消費者、執行緒池 |
| `ArrayBlockingQueue` | 固定容量的阻塞佇列 | 需要明確有界時 |
| `ConcurrentLinkedQueue` | 無鎖（CAS）並行佇列 | 高並行、不需阻塞 |

`ArrayDeque` 的容量不夠時：小容量翻倍、大容量增加約 50%（OpenJDK 原始碼 `grow`），預設可容納 16 個元素。

| 操作 | `ArrayDeque` | `PriorityQueue` |
|---|---|---|
| `offer` / `add` | 攤還 O(1) | O(log n) |
| `poll` / `remove` | O(1) | O(log n) |
| `peek` | O(1) | O(1) |
| `contains` | O(n) | O(n) |

### ⚠️ 陷阱：無界佇列不是安全的緩衝

```java
// ❌ LinkedBlockingQueue 預設容量是 Integer.MAX_VALUE，請求會一直累積直到 OOM
new ThreadPoolExecutor(4, 4, 0L, TimeUnit.MILLISECONDS, new LinkedBlockingQueue<>());

// ✅ 有界佇列 + 拒絕策略：滿了就讓呼叫端自己執行（減速），形成背壓
new ThreadPoolExecutor(4, 4, 0L, TimeUnit.MILLISECONDS,
        new LinkedBlockingQueue<>(1000), new ThreadPoolExecutor.CallerRunsPolicy());
```

與其無限累積後整個系統倒下，不如設明確上限，超過就拒絕或減速，讓問題及早被看見（**背壓 backpressure**）。

### 實務對照

- **執行緒池的核心就是 `BlockingQueue`**：核心執行緒用完 → 新任務**先進佇列排隊**；佇列也滿了 → 才開新執行緒（到最大數）；都滿了 → 觸發拒絕策略。很多人誤以為任務一多就立刻開新執行緒。
- **訊息佇列**：Kafka 的 partition 是持久化、只能尾端寫入（append-only）的佇列。
- **限流 / 背壓**：有界佇列滿了就拒絕，是最簡單有效的自我保護。

## 遞迴

### 遞迴的三要素

1. **終止條件（base case）**：沒有它就無限遞迴 → `StackOverflowError`。
2. **把問題縮小**：每次呼叫都必須更接近終止條件。
3. **信任子問題的答案**：假設遞迴呼叫已經解好較小的問題，只處理「這一層」。

```java
static int factorial(int n) { return n <= 1 ? 1 : n * factorial(n - 1); }
static int fib(int n) { return n < 2 ? n : fib(n - 1) + fib(n - 2); }   // ❌ O(2ⁿ)，重複計算子問題
```

### 遞迴的代價與改寫

- 每次呼叫都 push 一個 frame（區域變數、返回位址），空間 O(深度)。
- **Java 不做尾遞迴最佳化**（尾遞迴也一樣吃堆疊），深度可能上萬就要改寫成迭代。
- 有重複子問題 → **記憶化（memoization）**，或改成 DP 迴圈。
- 遞迴 ↔ 迭代 + 顯式堆疊可以互換：樹的 DFS 遞迴版與「自己 push / pop」版本是等價的。
- 樹與圖的走訪天然適合遞迴（見〈樹〉與〈圖〉）。

## 面試速查

**Q：為什麼鏈結串列插入是 O(1)、存取卻是 O(n)？陣列為什麼相反？**
鏈結串列只改指標但要從頭走才能找到位置；陣列用位址公式直接定位，但插入要搬動後面元素。

**Q：反轉鏈結串列為什麼一定要先存 `next`？**
先改 `cur.next = prev` 會丟掉通往後面節點的路，整條鏈在那個節點之後就斷了。

**Q：虛擬頭節點解決什麼問題？**
頭節點與其他節點的刪除 / 插入邏輯統一，省去「如果是頭節點」的特殊判斷與漏寫風險。

**Q：為什麼 Java 官方不建議用 `Stack`，而用 `ArrayDeque`？**
`Stack` 繼承 `Vector`（全部方法同步、可隨機存取、設計過時）；`ArrayDeque` 無同步開銷、更快，也沒有 `Vector` 的多餘介面。

**Q：單調堆疊為什麼是 O(n) 而不是 O(n²)？**
每個元素最多 push 一次、pop 一次，內層迴圈的總次數加起來不超過 n。

**Q：無界佇列作為工作佇列有什麼後果？**
請求無限累積，記憶體耗盡（OOM）；而且 `maximumPoolSize` 形同無效（佇列永遠不滿）。要設有界佇列加拒絕策略。

**Q：BFS 為什麼保證無權圖的最短路徑？**
BFS 一層層往外擴散，第一次抵達某節點時走過的層數就是最短距離；DFS 一路走到底，先到達的不一定最短。
