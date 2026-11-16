# 堆積與字典樹

## 模式說明

### 堆積 / Top-K

**適用時機**：「第 K 大 / 前 K 個 / 動態取最值 / 中位數」。

**核心反直覺點**（最容易搞混）：

- 找最大的 K 個 → 用**最小堆積**（size 維持 k，堆頂是門檻）。
- 找最小的 K 個 → 用**最大堆積**，邏輯完全對稱。

堆積裡永遠保留「目前看過最大的 k 個」，堆頂（最小堆積的頂端）是這 k 個裡面最小的，也就是「還能不能擠進前 k 名」的門檻值，新元素只要比門檻大就把門檻踢出去。**堆頂放的永遠是「最有可能被淘汰」的那個。**

**為什麼是 O(n log k)**：排序再取前 k 個是 O(n log n)；堆積只維持大小為 k，每次插入或彈出是 O(log k)。k 遠小於 n 時（例如一億筆資料找前 10 名）差距非常可觀。

```java
// Top-K 最大
PriorityQueue<Integer> minHeap = new PriorityQueue<>();
for (int x : nums) {
    minHeap.offer(x);
    if (minHeap.size() > k) minHeap.poll(); // 丟掉最小的
}
// minHeap 中剩下的就是最大的 k 個，堆頂是第 k 大

// 自訂比較
PriorityQueue<int[]> pq = new PriorityQueue<>((a, b) -> a[1] - b[1]);  // 小根堆
PriorityQueue<int[]> pq2 = new PriorityQueue<>((a, b) -> b[1] - a[1]); // 大根堆
```

**常見題型**：Kth Largest Element、Top K Frequent Elements、K Closest Points、Merge K Sorted Lists、Find Median from Data Stream、Task Scheduler。

### 字典樹（Trie）

解決的是「大量字串共享前綴」的查詢問題。把字元當作樹的邊，共同前綴自然共用同一段路徑，讓字首查詢的複雜度只跟查詢字串長度有關，跟字典裡存了多少字串無關。

## #215 Kth Largest Element in an Array（Medium）

[官方題目](https://leetcode.com/problems/kth-largest-element-in-an-array/)

**題意**：找出未排序陣列中第 k 大的元素（不用完整排序）。

**解法一：固定大小最小堆**，O(n log k)，穩定、好寫。程式碼就是上面「模板說明」中的 Top-K 最大模板，最後回傳堆頂。

**解法二：快速選擇（Quickselect）**，平均 O(n)。是快速排序 partition 步驟的變形：每次選一個 pivot 做 partition，partition 後 pivot 落在的位置如果剛好是第 k-1 個索引，就是答案；否則只需要遞迴處理其中一側（不像快速排序兩側都要遞迴），這正是它平均複雜度優於快速排序的原因。

```java
public int findKthLargest(int[] nums, int k) {
    return quickSelect(nums, 0, nums.length - 1, k - 1); // 轉成找第 k-1 小索引（0-based，由大到小）
}
private int quickSelect(int[] nums, int left, int right, int k) {
    int pivot = nums[right], p = left;
    for (int i = left; i < right; i++) {
        if (nums[i] > pivot) { swap(nums, i, p); p++; } // 比 pivot 大的放到左邊（由大到小排列）
    }
    swap(nums, p, right);
    if (p == k) return nums[p];
    else if (p < k) return quickSelect(nums, p + 1, right, k); // 只遞迴一側
    else return quickSelect(nums, left, p - 1, k);
}
private void swap(int[] nums, int i, int j) { int t = nums[i]; nums[i] = nums[j]; nums[j] = t; }
```

**複雜度**：平均時間 O(n)（每輪排除大約一半，等比數列求和收斂到線性），最壞 O(n²)（pivot 每次都選到極端值，可用隨機化 pivot 緩解）。空間 O(1)。

**面試建議**：先講堆積解法，再補充「如果要平均 O(n)，可以用快速選擇，但最壞情況會退化」。展現你知道更快的解法存在及其取捨，比直接跳去寫快速選擇（容易寫錯邊界）更穩妥。

## #295 Find Median from Data Stream（Hard）

[官方題目](https://leetcode.com/problems/find-median-from-data-stream/)

**題意**：數字持續加入資料流，隨時能 O(log n) 查詢目前為止所有數字的中位數。

**解題思路**：用**兩個堆**。一個最大堆存「較小的一半」（堆頂是這一半裡最大的），一個最小堆存「較大的一半」（堆頂是這一半裡最小的）。只要隨時維持兩堆大小相等（或差 1），中位數就能直接從堆頂 O(1) 讀出。加入新數字時，要確保大堆的最大值永遠 ≤ 小堆的最小值，且大小平衡。

```java
class MedianFinder {
    private PriorityQueue<Integer> small = new PriorityQueue<>(Collections.reverseOrder()); // 較小一半，最大堆
    private PriorityQueue<Integer> large = new PriorityQueue<>(); // 較大一半，最小堆

    public void addNum(int num) {
        small.offer(num);
        large.offer(small.poll()); // 先丟進 small 再轉一手到 large，確保順序正確
        if (small.size() < large.size()) small.offer(large.poll()); // 維持 small 數量 >= large
    }
    public double findMedian() {
        if (small.size() > large.size()) return small.peek();
        return (small.peek() + large.peek()) / 2.0;
    }
}
```

**複雜度**：`addNum` 為 O(log n)，`findMedian` 為 O(1)。

**常見錯誤**：「先丟進 small 再轉一手到 large」這個看似多餘的步驟，是為了確保新數字不管多大多小，都會先經過正確的堆比較排序再落位。直接依條件判斷該丟哪一堆，反而容易在邊界情況出錯（例如新數字剛好是目前最大值時）。

**關鍵洞察**：「雙堆平衡」是處理「動態資料流中求中位數 / 分位數」的標準技巧，也能延伸到求任意百分位數（調整兩堆的大小比例即可）。

## #621 Task Scheduler（Medium）

[官方題目](https://leetcode.com/problems/task-scheduler/)

**題意**：給一串任務（用字母表示類型）跟冷卻時間 n（同類型任務之間至少要間隔 n 個時間單位），求完成所有任務的最短總時間。

**解題思路**：貪婪。每個時間單位，優先安排「目前剩餘次數最多」的任務類型，因為剩餘次數最多的任務未來需要被排的機會也最多，越早安排越能讓它盡快進入下一輪冷卻。用最大堆維護每種任務的剩餘次數，每一輪（長度 n+1 的區塊）取出剩餘次數最多的幾種任務各執行一次，執行後次數減一，還有剩餘就放進暫存區，這一輪跑完後再全部放回堆裡。

```java
public int leastInterval(char[] tasks, int n) {
    int[] freq = new int[26];
    for (char t : tasks) freq[t - 'A']++;
    PriorityQueue<Integer> heap = new PriorityQueue<>(Collections.reverseOrder());
    for (int f : freq) if (f > 0) heap.offer(f);

    int time = 0;
    while (!heap.isEmpty()) {
        List<Integer> remain = new ArrayList<>(); // 這一輪（長度 n+1）用過、還有剩餘次數的任務
        for (int i = 0; i <= n; i++) {            // 一輪冷卻週期
            if (!heap.isEmpty()) {
                int cnt = heap.poll();
                if (cnt - 1 > 0) remain.add(cnt - 1);
            }
            time++;
            if (heap.isEmpty() && remain.isEmpty()) break; // 所有任務都做完了，不需要空等剩下的冷卻時間
        }
        heap.addAll(remain);
    }
    return time;
}
```

**複雜度**：任務類型最多 26 種，堆操作視為常數，時間近似 O(任務數)，空間 O(1)。

**關鍵洞察**：「優先處理剩餘次數最多的」是「先處理未來麻煩最大的」貪婪思路：如果不優先處理它，它會被迫拖到更後面，總時間只會更長。也存在直接用數學公式的解法（用頻率最高的任務數決定「骨架」空格數），但用堆模擬更容易講清楚思路。

## #208 Implement Trie (Prefix Tree)（Medium）

[官方題目](https://leetcode.com/problems/implement-trie-prefix-tree/)

**題意**：實作字典樹，支援插入單字、查詢完整單字是否存在、查詢是否有任何單字以給定字首開頭。

**解題思路**：每個節點代表「目前走過的字元路徑」，用長度 26（或用 `HashMap` 更彈性）的子節點陣列存下一個字元的去向，並用一個布林標記這個節點是否剛好是某個完整單字的結尾（區分「fun」是完整單字，還是只是「function」的字首）。插入、查詢都是沿著字元一路往下走或建立節點。

```java
class Trie {
    class Node {
        Node[] children = new Node[26];
        boolean isEnd = false;
    }
    private Node root = new Node();

    public void insert(String word) {
        Node cur = root;
        for (char c : word.toCharArray()) {
            int i = c - 'a';
            if (cur.children[i] == null) cur.children[i] = new Node();
            cur = cur.children[i];
        }
        cur.isEnd = true; // 標記這裡是一個完整單字的結尾
    }
    public boolean search(String word) {
        Node node = find(word);
        return node != null && node.isEnd; // 必須存在且是完整單字
    }
    public boolean startsWith(String prefix) {
        return find(prefix) != null; // 只要路徑存在即可，不需要是完整單字
    }
    private Node find(String s) {
        Node cur = root;
        for (char c : s.toCharArray()) {
            int i = c - 'a';
            if (cur.children[i] == null) return null;
            cur = cur.children[i];
        }
        return cur;
    }
}
```

**複雜度**：`insert` / `search` / `startsWith` 皆為 O(L)（L 是字串長度，與字典中存了多少字串無關），空間 O(字元總數 × 26)。

**關鍵洞察**：`isEnd` 標記是字典樹最容易被忽略但最重要的細節。沒有它，`search` 跟 `startsWith` 會無法區分，這是這題最常見的設計疏漏。
