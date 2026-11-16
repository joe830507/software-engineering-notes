# 解題模式速查

> 150 題背後只有約 18 種思考框架。面試中真正卡住大多數人的，不是不會寫程式，而是拿到一題沒看過的變體時，不知道從何下手。模式辨識能力的本質，就是把題目敘述對照到下表的「識別訊號」。

## 模式索引表

| # | 模式 | 一句話識別訊號 | 典型複雜度 | 筆記位置 |
| --- | --- | --- | --- | --- |
| 1 | 雜湊表 | 「找過沒有」「計數」「配對」 | O(n) | 陣列與雜湊表 |
| 2 | 雙指標（對撞） | 已排序 + 找一對 / 迴文 | O(n) | 雙指標與滑動視窗 |
| 3 | 雙指標（快慢） | 原地修改 / 鏈表中點與環 | O(n) | 雙指標、鏈結串列 |
| 4 | 滑動視窗 | 「連續」子陣列 / 子字串 | O(n) | 雙指標與滑動視窗 |
| 5 | 前綴和 | 區間和查詢 / 和為 K（有負數） | O(n) | 本頁 |
| 6 | 二分搜尋 | 已排序 / 答案有單調性 | O(log n) | 二分搜尋與區間、本頁 |
| 7 | 單調堆疊 | 「下一個更大 / 更小」 | O(n) | 堆疊與單調堆疊 |
| 8 | 堆積 / Top-K | 「前 K 個」「第 K 大」「中位數」 | O(n log k) | 堆積與字典樹 |
| 9 | 鏈表操作 | 反轉 / 合併 / 重排 | O(n) | 鏈結串列 |
| 10 | 樹的 DFS | 深度 / 路徑 / 驗證性質 | O(n) | 二元樹與圖 |
| 11 | 樹的 BFS | 層級 / 最短 | O(n) | 二元樹與圖 |
| 12 | 回溯 | 「所有組合 / 排列 / 子集」 | O(2ⁿ) | 遞迴與回溯 |
| 13 | 圖搜尋 | 連通塊 / 最短步數 / 相依 | O(V+E) | 二元樹與圖、拓撲排序與並查集 |
| 14 | 動態規劃 | 「最大 / 最小 / 幾種方法」 | O(n) ~ O(n²) | 動態規劃 |
| 15 | 貪婪 | 每步有明顯最優選擇 | O(n log n) | 貪婪與位元運算 |
| 16 | 區間 | 輸入是 `[start, end]` 陣列 | O(n log n) | 二分搜尋與區間 |
| 17 | 位元運算 | 位元 / XOR / 2 的次方 | O(1) ~ O(n) | 貪婪與位元運算 |
| 18 | 分治 | 可以切兩半各自解 | O(n log n) | 本頁 |

## 怎麼從題目敘述選模式

| 題目裡的關鍵字 | 優先想到 |
| --- | --- |
| 「是否出現過」「重複」「配對」「異位詞」 | 雜湊表 |
| 已排序、「從兩端往中間」、迴文 | 對撞雙指標 |
| 「連續子字串 / 子陣列」的最長 / 最短 | 滑動視窗 |
| 含負數的「和為 K 的子陣列」 | 前綴和 + 雜湊表 |
| 「下一個更大 / 更暖 / 更高」 | 單調堆疊 |
| 「第 K 大」「前 K 個」「中位數」 | 堆積 |
| 「所有組合 / 排列 / 子集」 | 回溯 |
| 「最少步數」（無權圖 / 狀態轉換） | BFS |
| 「有幾塊 / 面積 / 能不能到」 | DFS |
| 「先修」「依賴順序」 | 拓撲排序 |
| 「合併集合」「是否連通」「多餘的邊」 | 並查集 |
| 「最大 / 最小 / 有幾種方法」且子問題重疊 | 動態規劃 |
| 「最小的最大值」「最大的最小值」 | 二分答案 |
| 「不能用額外空間」「落單的數字」 | 位元運算（XOR） |
| 輸入是一堆 `[start, end]` | 排序 + 掃描 |

**易混淆的對照**：

- **子字串 vs 子序列**：子字串（連續）→ 滑動視窗；子序列（可跳過）→ DP。
- **貪婪 vs DP**：能證明「局部最優不會後悔」才用貪婪，否則多半是 DP（零錢兌換是經典反例）。
- **分治 vs DP**：分治的子問題彼此獨立，不需記憶化；DP 的子問題重疊，需要記憶化。

## 模式 5：前綴和

**適用時機**：

- 多次查詢「區間 [i, j] 的和」：每次重新加總是 O(n)，預先算好前綴和，每次查詢降到 O(1)。
- 「和為 K 的子陣列個數」且陣列**有負數**：這正是滑動視窗失效的場景（加入新元素可能讓和變小，破壞單調性）。

**識別訊號**：只要看到「區間和」三個字，第一反應就該是前綴和，因為區間和天生可以拆解成「兩個前綴和相減」。

```java
// 型 A：靜態區間查詢
int[] prefix = new int[n + 1];
for (int i = 0; i < n; i++) prefix[i+1] = prefix[i] + nums[i];
int rangeSum = prefix[j+1] - prefix[i]; // O(1)

// 型 B：前綴和 + HashMap（找和為 k 的子陣列）
Map<Integer, Integer> cnt = new HashMap<>();
cnt.put(0, 1); // 關鍵初始化
int sum = 0, res = 0;
for (int x : nums) {
    sum += x;
    res += cnt.getOrDefault(sum - k, 0);
    cnt.merge(sum, 1, Integer::sum);
}
```

**為什麼 `cnt.put(0, 1)` 不能省略**：如果某個子陣列從索引 0 開始、和恰好為 k，此時 `sum - k` 等於 0，但索引 0 之前沒有任何前綴和被記錄過。這個初始化是在假裝「有一個空前綴，其和為 0」，讓「從頭開始的子陣列」也能被正確計數。

### #560 Subarray Sum Equals K（Medium）

[官方題目](https://leetcode.com/problems/subarray-sum-equals-k/)

**題意**：求陣列中和為 k 的連續子陣列個數，陣列可以有負數。

**解題思路**：`prefix[j] - prefix[i] = k` 代表 `(i, j]` 這段的和是 k。掃描時維護目前的前綴和 `sum`，要找的是「之前有幾個前綴和等於 `sum - k`」，用 HashMap 記錄各前綴和出現的次數。

```java
class Solution {
    public int subarraySum(int[] nums, int k) {
        Map<Integer, Integer> cnt = new HashMap<>();
        cnt.put(0, 1);
        int sum = 0, res = 0;
        for (int x : nums) {
            sum += x;
            res += cnt.getOrDefault(sum - k, 0); // 先查
            cnt.merge(sum, 1, Integer::sum);     // 再放
        }
        return res;
    }
}
```

**複雜度**：時間 O(n)，額外空間 O(n)。

**注意事項**：「先查後放」的順序同樣重要。有負數時不能用滑動視窗。

**常見題型**：Range Sum Query、Subarray Sum Equals K、Product of Array Except Self（前後綴乘積）、Continuous Subarray Sum。

## 模式 6 補充：二分答案

當題目出現「最小的最大值」「最大的最小值」「在 h 小時內完成的最小速度」，代表存在一個檢查函式，回傳結果隨答案增大呈現「先不可行後可行」的單調性。對「答案」本身做二分，而不是對陣列索引。

### #875 Koko Eating Bananas（Medium）

[官方題目](https://leetcode.com/problems/koko-eating-bananas/)

**題意**：有 n 堆香蕉，Koko 要在 h 小時內吃完，每小時選一堆吃 k 根（不足 k 就吃完那堆，該小時不再吃別堆）。求最小的整數速度 k。

**解題思路**：速度越大，所需時間越少，所以「能否在 h 小時內吃完」對速度 k 是單調的。答案範圍是 `[1, 最大堆的香蕉數]`，對 k 二分，用檢查函式算出以速度 k 所需的總小時數。

```java
class Solution {
    public int minEatingSpeed(int[] piles, int h) {
        int lo = 1, hi = 0;
        for (int p : piles) hi = Math.max(hi, p);
        while (lo < hi) {
            int mid = lo + (hi - lo) / 2;
            if (canFinish(piles, mid, h)) hi = mid; // 可行：嘗試更小的速度
            else lo = mid + 1;                       // 不可行：必須更快
        }
        return lo;
    }
    private boolean canFinish(int[] piles, int speed, int h) {
        long hours = 0;
        for (int p : piles) hours += (p + speed - 1) / speed; // 向上取整
        return hours <= h;
    }
}
```

**複雜度**：時間 O(n log M)（M 是最大堆的香蕉數），空間 O(1)。

**注意事項**：總小時數用 `long` 避免溢位；向上取整用 `(p + speed - 1) / speed`。

## 模式 18：分治

把問題切成兩半，各自解決再合併。

**適用條件**：問題可以「切成兩個規模減半的子問題，分別求解後花費線性時間合併」。遞迴關係式是 `T(n) = 2T(n/2) + O(n)`，由主定理解出 O(n log n)，這也是合併排序、快速排序（平均情況）落在這個複雜度的原因。

**常見題型**：Merge Sort、Merge K Sorted Lists、Median of Two Sorted Arrays、Construct Binary Tree、Maximum Subarray（分治解法）。
