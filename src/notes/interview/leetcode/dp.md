# 動態規劃

## 模式說明

### 四步法

1. **定義狀態**：`dp[i]` 是什麼意思。這是整個 DP 最重要的一步，狀態定義錯了，後面的轉移方程一定推不出來。
2. **轉移方程**：`dp[i]` 怎麼由前面推出。問「**最後一步是什麼**」，這句問法幾乎能推導出所有一維 DP 的轉移方程。
3. **初始條件**：邊界情況（通常是最小的子問題）的答案。
4. **計算順序**：確保計算 `dp[i]` 時，它依賴的所有子問題都已經算好。

### 常見狀態定義

| 題型 | 狀態 |
| --- | --- |
| 線性 | `dp[i]` = 前 i 個元素的答案 |
| 以 i 結尾 | `dp[i]` = 必須包含第 i 個元素時的答案 |
| 雙序列 | `dp[i][j]` = a 前 i 個與 b 前 j 個 |
| 區間 | `dp[i][j]` = 區間 [i, j] 的答案 |
| 背包 | `dp[w]` = 容量 w 的最優解 |
| 狀態機 | `dp[i][state]` |

### 辨識訊號

看到「最大 / 最小值」「有幾種方法」「能不能達成」這類問法，且問題可以分解成「子問題的解能組合成原問題的解」，就是 DP 的訊號。

暴力遞迴慢的原因幾乎都是「**重複計算了同一個子問題**」。例如費氏數列的樸素遞迴，`f(5)` 會呼叫 `f(3)` 兩次、`f(1)` 好幾次，重複次數隨 n 指數成長。DP 用一個表格（或滾動變數）把每個子問題的答案存起來，保證每個子問題只算一次。

### DP 與貪婪、分治

- **貪婪**需要證明「局部最優不會妨礙全局最優」。無法證明時多半是 DP 題，例如零錢兌換用貪婪會失敗。
- **分治**的子問題彼此獨立，不需要記憶化；DP 的子問題會重疊，所以需要記憶化。

**常見題型**：Climbing Stairs、House Robber、Coin Change、LIS、Word Break、Unique Paths、LCS、Edit Distance。

## #70 Climbing Stairs（Easy）

[官方題目](https://leetcode.com/problems/climbing-stairs/)

**題意**：一次爬 1 或 2 階，問抵達 n 階有幾種順序。

**範例**：n=4 → 5

**解題思路**：最後一步只能來自 n-1 或 n-2，所以 `f(n) = f(n-1) + f(n-2)`。以 `f(0)=1`、`f(1)=1` 作基底，只保存最近兩個狀態。

```java
class Solution {
    public int climbStairs(int n) {
        int previous = 1, current = 1;
        for (int step = 2; step <= n; step++) {
            int next = previous + current;
            previous = current;
            current = next;
        }
        return current;
    }
}
```

**複雜度**：時間 O(n)，額外空間 O(1)。

**注意事項**：`f(0)=1` 是「什麼都不走」的一種方式。`int` 依原題 n ≤ 45 足夠；擴大 n 時需要 `long` 或 `BigInteger`。

## #53 Maximum Subarray（Medium）

[官方題目](https://leetcode.com/problems/maximum-subarray/)

**題意**：求非空連續子陣列的最大總和。

**範例**：`[-4,2,-1,3,-5]` → 4（2, -1, 3）

**解題思路**：`ending` 是「一定以目前位置結尾」的最大和：要嘛只選目前數字，要嘛延續前一段。`best` 才是所有結尾中的全域最佳。轉移為 `ending = max(x, ending + x)`（Kadane 演算法）。

```java
class Solution {
    public int maxSubArray(int[] nums) {
        int ending = nums[0], best = nums[0];
        for (int i = 1; i < nums.length; i++) {
            ending = Math.max(nums[i], ending + nums[i]);
            best = Math.max(best, ending);
        }
        return best;
    }
}
```

**複雜度**：時間 O(n)，額外空間 O(1)。

**注意事項**：不能把 `best` 初始化為 0，否則全負數陣列會錯誤選空陣列；原題保證非空。

## #198 House Robber（Medium）

[官方題目](https://leetcode.com/problems/house-robber/)

**題意**：不可偷相鄰房屋，求可取得的最大金額。

**範例**：`[2,7,9,3,1]` → 12（2 + 9 + 1）

**解題思路**：考慮目前房屋時只有兩種選擇：不偷，沿用前一間的最佳值；偷，必須加上前兩間的最佳值。用 `twoBack` / `oneBack` 維持這兩個狀態。

```java
class Solution {
    public int rob(int[] nums) {
        int twoBack = 0, oneBack = 0;
        for (int money : nums) {
            int current = Math.max(oneBack, twoBack + money);
            twoBack = oneBack;
            oneBack = current;
        }
        return oneBack;
    }
}
```

**複雜度**：時間 O(n)，額外空間 O(1)。

**注意事項**：必須先算 `current` 再移動舊狀態，不能先覆寫 `twoBack`；這裡房屋是直線排列，環狀版本另見 #213。

## #322 Coin Change（Medium）

[官方題目](https://leetcode.com/problems/coin-change/)

**題意**：硬幣可無限使用，求湊出 amount 的最少枚數；無解回傳 -1。

**範例**：`coins=[1,3,4], amount=6` → 2（3 + 3）

**解題思路**：`dp[a]` 定義為湊出金額 a 的最少枚數，`dp[0]=0`。枚舉最後一枚硬幣 c，從 `dp[a-c] + 1` 轉移。金額從小到大，保證所需子問題已計算。

```java
class Solution {
    public int coinChange(int[] coins, int amount) {
        int inf = amount+1;
        int[] dp = new int[amount+1];
        Arrays.fill(dp, inf);
        dp[0] = 0;
        for (int a = 1; a <= amount; a++) {
            for (int coin : coins) {
                if (coin <= a) dp[a] = Math.min(dp[a], dp[a-coin]+1);
            }
        }
        return dp[amount] == inf ? -1 : dp[amount];
    }
}
```

**複雜度**：k 種硬幣、金額 A：時間 O(Ak)，額外空間 O(A)；這是對金額值的偽多項式演算法。

**注意事項**：貪婪選最大硬幣對一般幣值不成立（例如 `[1,3,4]` 湊 6，貪婪會選 4+1+1 = 3 枚）。以 `A+1` 作不可達哨兵，避免 `Integer.MAX_VALUE + 1` 溢位；硬幣必須為正。

## #300 Longest Increasing Subsequence（Medium）

[官方題目](https://leetcode.com/problems/longest-increasing-subsequence/)

**題意**：求嚴格遞增子序列長度，元素可以不連續。

**範例**：`[3,1,2,2,4]` → 3（1, 2, 4）

**解題思路**：先理解 O(n²) DP：`dp[i] = 1 + max(dp[j])`，其中 `j < i` 且 `nums[j] < nums[i]`。下面示範進階解：`tails[len-1]` 表示長度為 len 的遞增子序列可達到的**最小尾值**。對 x 找第一個 `>= x` 的位置替換；較小尾值讓之後更容易延長，超過現有長度才增加 `size`。

```java
class Solution {
    public int lengthOfLIS(int[] nums) {
        int[] tails = new int[nums.length];
        int size = 0;
        for (int x : nums) {
            int left = 0, right = size; // 半開區間 [left,right)
            while (left < right) {
                int mid = left+(right-left)/2;
                if (tails[mid] < x) left = mid+1;
                else right = mid;
            }
            tails[left] = x;
            if (left == size) size++;
        }
        return size;
    }
}
```

**複雜度**：這個解時間 O(n log n)，額外空間 O(n)；基礎 DP 時間 O(n²)、空間 O(n)。

**注意事項**：`tails` 不是最終答案序列，不可直接回傳它當作 LIS。嚴格遞增需找第一個 `>= x`；重複的 2 不會延長長度。

## #1143 Longest Common Subsequence（Medium）

[官方題目](https://leetcode.com/problems/longest-common-subsequence/)

**題意**：求兩字串最長共同子序列的長度，可跳過字元但保留順序。

**範例**：`"abcde"` 與 `"ace"` → 3

**解題思路**：`dp[i][j]` 是 text1 前 i 個字元與 text2 前 j 個字元的 LCS 長度。末字元相同時取左上 + 1；不同時至少捨棄一方末字元，取上方與左方最大值。空字串那一列與欄全是 0。

```java
class Solution {
    public int longestCommonSubsequence(String text1, String text2) {
        int m = text1.length(), n = text2.length();
        int[][] dp = new int[m+1][n+1];
        for (int i = 1; i <= m; i++) {
            for (int j = 1; j <= n; j++) {
                if (text1.charAt(i-1) == text2.charAt(j-1)) dp[i][j] = dp[i-1][j-1]+1;
                else dp[i][j] = Math.max(dp[i-1][j], dp[i][j-1]);
            }
        }
        return dp[m][n];
    }
}
```

**複雜度**：字串長 m、n：時間 O(mn)，額外空間 O(mn)；只求長度可進一步壓縮到 O(min(m, n))。

**注意事項**：子序列不要求連續。`dp` 索引比字串索引多一格，因此比較 `charAt(i-1)`、`charAt(j-1)`。

## #62 Unique Paths（Medium）

[官方題目](https://leetcode.com/problems/unique-paths/)

**題意**：機器人從網格左上角走到右下角，每次只能向右或向下，求不同路徑數。

**解題思路**：二維 DP 的入門。`dp[i][j]` 定義成「走到 (i, j) 的路徑數」。問最後一步：到達 (i, j) 只能從上面 (i-1, j) 或左邊 (i, j-1) 走過來，所以 `dp[i][j] = dp[i-1][j] + dp[i][j-1]`。

```java
public int uniquePaths(int m, int n) {
    int[] dp = new int[n];
    Arrays.fill(dp, 1); // 第一列全是 1（只能一直向右走）
    for (int i = 1; i < m; i++)
        for (int j = 1; j < n; j++)
            dp[j] += dp[j - 1]; // dp[j] 目前存的是「上面」，加上 dp[j-1]「左邊」
    return dp[n - 1];
}
```

**複雜度**：時間 O(mn)，空間 O(n)（滾動優化後）。

**關鍵洞察**：因為 `dp[i][j]` 只依賴「上一列同欄」跟「這一列前一欄」，用一維陣列滾動更新即可，不需要真的開二維陣列。這是二維 DP 常見的空間優化模式。

## #72 Edit Distance（Hard）

[官方題目](https://leetcode.com/problems/edit-distance/)

**題意**：求把字串 a 轉成字串 b 所需的最少操作數（插入、刪除、替換各算一次）。

**解題思路**：`dp[i][j]` 定義成「a 前 i 個變成 b 前 j 個所需的最少操作數」。最後一步操作只有三種可能：

- 刪除 a 的最後一個字元：`dp[i-1][j] + 1`
- 插入一個字元讓它變成 b 的最後一個字元：`dp[i][j-1] + 1`
- 替換 a 的最後一個字元：`dp[i-1][j-1] + 1`（若字元本身相同則不用替換，直接繼承 `dp[i-1][j-1]`）

取三者最小。

```java
public int minDistance(String a, String b) {
    int m = a.length(), n = b.length();
    int[][] dp = new int[m + 1][n + 1];
    for (int i = 0; i <= m; i++) dp[i][0] = i;
    for (int j = 0; j <= n; j++) dp[0][j] = j;
    for (int i = 1; i <= m; i++) {
        for (int j = 1; j <= n; j++) {
            if (a.charAt(i-1) == b.charAt(j-1)) dp[i][j] = dp[i-1][j-1];
            else dp[i][j] = 1 + Math.min(dp[i-1][j-1], Math.min(dp[i-1][j], dp[i][j-1]));
        }
    }
    return dp[m][n];
}
```

**複雜度**：時間 O(mn)，空間 O(mn)（可滾動優化到 O(n)）。

**關鍵洞察**：這是雙序列 DP 的集大成題目。#1143（LCS）只有「相同就接上、不同就捨棄一邊」兩種選擇，這題多了「替換」這第三種選擇，完整示範雙序列 DP 如何隨著操作種類增加而擴展轉移方程。
