# 貪婪與位元運算

## 模式說明

### 貪婪

每一步都選當下看起來最好的選項，且不回頭修改先前的決策。

**貪婪為什麼有效、什麼時候失效**：貪婪法能成立，需要一個數學證明：「局部最優選擇不會妨礙全局最優解」（無後效性，或交換論證）。這也是為什麼貪婪看起來簡單、程式碼短，但面試時最容易被問「為什麼這樣選一定是對的」，證明才是真正的難度。無法證明某個選擇不會後悔，大概率不是貪婪題，而是 DP 題（例如零錢兌換用貪婪會失敗）。

**常見排序依據**：

| 題型 | 排序依據 |
| --- | --- |
| 最多不重疊區間 | 結束時間升序 |
| 合併區間 | 開始時間升序 |
| 最少箭射氣球 | 結束時間升序 |

**常見題型**：Maximum Subarray（Kadane）、Jump Game、Gas Station、Partition Labels、Hand of Straights。

### 位元運算

```java
n & 1                      // 判斷奇偶
n & (n - 1)                // 消去最低位的 1（數 1 的個數）
n & (-n)                   // 取出最低位的 1
n > 0 && (n & (n-1)) == 0  // 是否為 2 的次方
a ^ a == 0, a ^ 0 == a     // XOR 消除性質
```

**辨識訊號**：題目提到「不能用加減乘除」「不能用額外空間」「找落單的數字」「2 的次方」，通常暗示要用位元運算。XOR 的「配對抵消」性質（`a XOR a = 0`）讓你可以用 O(1) 空間找出落單的元素，不需要雜湊表記錄出現次數。

**常見題型**：Single Number、Number of 1 Bits、Counting Bits、Missing Number、Sum of Two Integers、Reverse Bits。

## #55 Jump Game（Medium）

[官方題目](https://leetcode.com/problems/jump-game/)

**題意**：陣列每個元素代表在該位置最多能跳的步數，判斷能否從第一個位置跳到最後一個位置。

**解題思路**：貪婪維護「目前為止走過的所有位置，能跳到的最遠距離」。走到某個位置時，如果它本身已經超出「目前可達最遠距離」，代表無法到達這裡，遊戲失敗；否則就用這個位置能跳的距離持續更新最遠距離。

```java
public boolean canJump(int[] nums) {
    int maxReach = 0;
    for (int i = 0; i < nums.length; i++) {
        if (i > maxReach) return false; // 這個位置本身走不到
        maxReach = Math.max(maxReach, i + nums[i]);
    }
    return true;
}
```

**複雜度**：時間 O(n)，空間 O(1)。

**關鍵洞察**：「維護目前累積的可達範圍」是跳躍類貪婪題目的通用心法，不需要真的模擬每一種跳法組合。

## #45 Jump Game II（Medium）

[官方題目](https://leetcode.com/problems/jump-game-ii/)

**題意**：跟 #55 類似，但保證能到達終點，求最少跳躍次數。

**解題思路**：類 BFS 分層。把每一次跳躍看成擴展一層，維護「目前這一跳能到達的邊界」`curEnd` 和「下一跳能到達的最遠邊界」`farthest`。走訪位置超過目前這一跳的邊界時，代表必須再跳一次，跳躍次數加一，並把邊界更新成之前累積的 `farthest`。

```java
public int jump(int[] nums) {
    int jumps = 0, curEnd = 0, farthest = 0;
    for (int i = 0; i < nums.length - 1; i++) {
        farthest = Math.max(farthest, i + nums[i]);
        if (i == curEnd) { // 這一跳的範圍已經走完，必須再跳一次
            jumps++;
            curEnd = farthest;
        }
    }
    return jumps;
}
```

**複雜度**：時間 O(n)，空間 O(1)。

**關鍵洞察**：把「跳幾次」想成「BFS 要擴展幾層」是關鍵轉換。`curEnd` 是目前層的邊界，`farthest` 是下一層能到達的最遠點，不需要真的建佇列，用兩個變數就能模擬。

## #134 Gas Station（Medium）

[官方題目](https://leetcode.com/problems/gas-station/)

**題意**：環形路線上有若干加油站，每站提供固定汽油量，到下一站要消耗固定汽油量，求能繞行一圈的起始加油站（保證解唯一，若總油量小於總消耗則回傳 -1）。

**解題思路**：如果從某個起點 A 出發，走到某一站 B 時油量變成負數，那麼從 A 到 B 之間的任何一站當起點都注定會失敗，因為從這些中繼站出發，油箱的初始狀態只會更差。所以只要在某站發現油量見底，就把候選起點跳到「見底的下一站」，之前那些都不用再測試。同時，只要總油量不小於總消耗，答案必定存在且唯一。

```java
public int canCompleteCircuit(int[] gas, int[] cost) {
    int totalTank = 0, curTank = 0, start = 0;
    for (int i = 0; i < gas.length; i++) {
        int diff = gas[i] - cost[i];
        totalTank += diff;
        curTank += diff;
        if (curTank < 0) { // 從目前候選起點走到這裡油量見底
            start = i + 1;  // 候選起點直接跳到下一站，之前的都不可能成功
            curTank = 0;
        }
    }
    return totalTank >= 0 ? start : -1;
}
```

**複雜度**：時間 O(n)，空間 O(1)。

**關鍵洞察**：「見底就把候選起點跳到下一站，之前的都能安全排除」背後的證明，是這題最值得記住的地方。理解「為什麼可以安全跳過一整段」比記住程式碼本身更重要。

## #136 Single Number（Easy）

[官方題目](https://leetcode.com/problems/single-number/)

**題意**：陣列中每個數字都出現兩次，只有一個出現一次，找出它。

**解題思路**：XOR 的性質 `a^a=0`、`a^0=a`。把陣列所有數字 XOR 在一起，成對的數字會互相抵消為 0，只留下落單的那個。

```java
public int singleNumber(int[] nums) {
    int res = 0;
    for (int x : nums) res ^= x;
    return res;
}
```

**複雜度**：時間 O(n)，空間 O(1)（相比 `HashSet` 解法的 O(n) 空間更優）。

## #191 Number of 1 Bits（Easy）

[官方題目](https://leetcode.com/problems/number-of-1-bits/)

**題意**：計算一個整數二進位表示中 1 的個數（漢明重量）。

**解題思路**：`n & (n-1)` 能精準消去 n 最低位的那個 1。重複做這個操作直到 n 變成 0，做了幾次就有幾個 1，比逐位元檢查更快收斂（迴圈次數等於 1 的個數，而不是固定 32 次）。

```java
public int hammingWeight(int n) {
    int count = 0;
    while (n != 0) {
        n &= (n - 1); // 每次消去最低位的 1
        count++;
    }
    return count;
}
```

**複雜度**：時間 O(k)（k 是 1 的個數，最壞 O(32)），空間 O(1)。也可直接呼叫 `Integer.bitCount(n)`，面試時可以先寫手動版本展現理解，再提及內建方法。

## #338 Counting Bits（Easy）

[官方題目](https://leetcode.com/problems/counting-bits/)

**題意**：給定 n，對 0 到 n 每個數字，計算其二進位表示中 1 的個數，回傳陣列。

**解題思路**：對每個數字各自重算（用 #191 的方法）是 O(n log n)。優化：利用「去掉最低位後剩下的部分，答案一定已經算過」的遞推關係。i 的最低位是 1 還是 0，可以用 `i & 1` 判斷；把這個最低位去掉後剩下 `i >> 1`，其 1 的個數已經在 `dp[i>>1]` 算過了，所以 `dp[i] = dp[i>>1] + (i&1)`。

```java
public int[] countBits(int n) {
    int[] dp = new int[n + 1];
    for (int i = 1; i <= n; i++) {
        dp[i] = dp[i >> 1] + (i & 1); // 複用已經算過的子問題
    }
    return dp;
}
```

**複雜度**：時間 O(n)，空間 O(n)（不含輸出）。

**關鍵洞察**：把「右移一位」看成「去掉最低位」，讓這題變成一維 DP。這是位元運算與動態規劃結合的代表題。

## #190 Reverse Bits（Easy）

[官方題目](https://leetcode.com/problems/reverse-bits/)

**題意**：顛倒一個 32 位無號整數的二進位表示。

**解題思路**：逐一取出輸入的每一位（從最低位開始），依序放進結果的對應反轉位置。每處理一位，結果先左移一位騰出空間，再把輸入的最低位塞進結果的最低位，輸入則右移一位準備處理下一位。

```java
public int reverseBits(int n) {
    int result = 0;
    for (int i = 0; i < 32; i++) {
        result <<= 1;           // 騰出最低位空間
        result |= (n & 1);      // 把 n 目前的最低位塞進去
        n >>>= 1;               // 無號右移，處理 n 的下一位（注意用 >>> 而非 >>）
    }
    return result;
}
```

**複雜度**：時間 O(32) = O(1)，空間 O(1)。

**常見錯誤**：必須用**無號右移 `>>>`** 而非帶符號右移 `>>`。如果 n 是負數（最高位是 1），`>>` 會在高位補 1 而非補 0，導致後續處理的位元完全錯誤。

## #268 Missing Number（Easy）

[官方題目](https://leetcode.com/problems/missing-number/)

**題意**：陣列包含 0 到 n 中的 n 個不同數字（缺一個），找出缺失的那個。

**解題思路**：把索引 0 到 n（共 n+1 個數）跟陣列中實際存在的 n 個數全部 XOR 在一起，配對的數字會抵消，缺失的那個數字因為找不到配對而單獨留下。

```java
public int missingNumber(int[] nums) {
    int res = nums.length; // 先放入 n
    for (int i = 0; i < nums.length; i++) {
        res ^= i ^ nums[i]; // 把索引 i（代表 0..n-1）跟 nums[i] 都 XOR 進去
    }
    return res;
}
```

**複雜度**：時間 O(n)，空間 O(1)。相比排序解法 O(n log n) 或求和公式解法，更直接展現位元運算思維。
