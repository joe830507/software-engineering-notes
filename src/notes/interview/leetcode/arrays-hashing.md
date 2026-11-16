# 陣列與雜湊表

## 模式說明：雜湊表

**適用時機**：需要「快速查詢某個東西存不存在 / 出現幾次 / 對應到什麼」。這是把 O(n²) 降為 O(n) 最常用的手段，幾乎是所有刷題的起點。

**辨識訊號**：

- 「找出重複的元素」：本質是「這個值我有沒有看過」，看過就是重複，這正是 Set 存在的意義。
- 「兩數之和 / 三數之和」（配對）：本質是「我需要的另一半存不存在」，把「找配對」轉成「查詢」。
- 「字母異位詞」（計數比對）：本質是「兩邊出現次數是否完全一致」。
- 「最長的無重複 XXX」：本質是「視窗內有沒有出現過這個字元」，通常會跟滑動視窗合體出現。
- 「分組」：本質是「什麼樣的東西算同一組」，用一個能代表「組別」的 key 分流。

**為什麼是 O(n)**：用雜湊表把「內層迴圈的搜尋」換成「一次雜湊查詢」。內層的 O(n) 換成平均 O(1)，總複雜度自然從 O(n²) 降到 O(n)。

**四種常用寫法**：

```java
// 型 A：判斷是否出現過
Set<Integer> seen = new HashSet<>();
for (int x : nums) {
    if (!seen.add(x)) return true; // add 回傳 false = 已存在
}

// 型 B：計數
Map<Character, Integer> cnt = new HashMap<>();
for (char c : s.toCharArray()) cnt.merge(c, 1, Integer::sum);

// 型 C：記錄「值 -> 索引」，用於配對
Map<Integer, Integer> idx = new HashMap<>();
for (int i = 0; i < nums.length; i++) {
    if (idx.containsKey(target - nums[i])) return new int[]{idx.get(target - nums[i]), i};
    idx.put(nums[i], i);
}

// 型 D：分組（把某種「特徵」當 key）
Map<String, List<String>> groups = new HashMap<>();
groups.computeIfAbsent(key, k -> new ArrayList<>()).add(value);
```

「先查後放」的節奏會在後面的滑動視窗、前綴和等題目中反覆出現。

**注意**：HashMap 的 O(1) 是**平均 / 期望**值，不是任意輸入下的嚴格最壞保證；雜湊字串本身也有字串長度的成本。

## #1 Two Sum（Easy）

[官方題目](https://leetcode.com/problems/two-sum/)

**題意**：回傳兩個相加等於 target 的不同索引。

**範例**：`nums=[3,2,4], target=6` → `[1,2]`

**解題思路**：走到 x 時，只查詢先前出現過的 `target - x`；找到即可配對。**先查再存**，保證不會用同一個元素兩次。例中讀到 4，map 已存 `2→1`，因此回傳 `[1,2]`。

先講暴力解（雙迴圈 O(n²)），再優化：對於固定的 `nums[i]`，要找的另一半是 `target - nums[i]`，能不能不用迴圈找？一邊往前掃、一邊把「看過的數字對應的索引」記下來，就能把「搜尋」轉成「查詢」。

```java
class Solution {
    public int[] twoSum(int[] nums, int target) {
        Map<Integer, Integer> seen = new HashMap<>();
        for (int i = 0; i < nums.length; i++) {
            Integer j = seen.get(target - nums[i]);
            if (j != null) return new int[]{j, i};
            seen.put(nums[i], i);
        }
        throw new IllegalArgumentException("No solution");
    }
}
```

**複雜度**：平均時間 O(n)，額外空間 O(n)。

**注意事項**：回傳的是索引，不是數值；`[3,3]` 也能配對。如果把「查詢」和「放入」的順序寫反，`nums=[3,3], target=6` 會在 i=0 時就把 3 配對給自己。

## #217 Contains Duplicate（Easy）

[官方題目](https://leetcode.com/problems/contains-duplicate/)

**題意**：判斷陣列是否有重複值。

**範例**：`[2,5,2]` → true；`[2,5]` → false

**解題思路**：`Set.add` 在元素已存在時回傳 false，因此一次掃描就能提前結束。Set 始終包含目前為止遇過的不同數值。

```java
class Solution {
    public boolean containsDuplicate(int[] nums) {
        Set<Integer> seen = new HashSet<>();
        for (int x : nums) if (!seen.add(x)) return true;
        return false;
    }
}
```

**複雜度**：平均時間 O(n)，額外空間 O(n)。

**注意事項**：排序後比較相鄰元素也能解（O(n log n)，不用額外空間），但會修改原陣列。如果面試官限制不能用額外空間，這就是正確答案。

**常見錯誤**：用 `ArrayList` 代替 `HashSet` 記錄看過的元素，`contains` 是 O(n)，整體又變回 O(n²)。

**關鍵洞察**：`Set.add()` 的回傳值本身就是「有沒有出現過」的答案，不需要先 `contains` 再 `add`。

## #49 Group Anagrams（Medium）

[官方題目](https://leetcode.com/problems/group-anagrams/)

**題意**：把字母種類及次數相同的字串分為一組。

**範例**：`["ab","ba","ac"]` → `[["ab","ba"],["ac"]]`（組順序不限）

**解題思路**：互為異位詞的字串，只要用某種標準化方式表示，結果一定相同，這就是「簽章」。題目限制小寫英文字母，將字串轉成 26 個字母的計數，再序列化成字串 key。同一 key 代表相同多重集合。比起排序後當 key，每個字串只需線性掃描。

```java
class Solution {
    public List<List<String>> groupAnagrams(String[] strs) {
        Map<String, List<String>> groups = new HashMap<>();
        for (String s : strs) {
            int[] count = new int[26];
            for (int i = 0; i < s.length(); i++) count[s.charAt(i)-'a']++;
            String key = Arrays.toString(count);
            groups.computeIfAbsent(key, unused -> new ArrayList<>()).add(s);
        }
        return new ArrayList<>(groups.values());
    }
}
```

**複雜度**：n 個字串、最大長度 k：平均時間 O(n(k+26))，額外空間 O(n)（含結果參照）。

**注意事項**：Java 的 `int[]` 預設 `equals` / `hashCode` 比較物件身分，不能直接當內容 key；用 `Arrays.toString` 可保留分隔符，避免計數拼接歧義。排序字串當 key 也行（O(n·k log k)），先講這個當 baseline 也可以。

## #128 Longest Consecutive Sequence（Medium）

[官方題目](https://leetcode.com/problems/longest-consecutive-sequence/)

**題意**：找出數值連續的最長序列長度，原陣列不必連續。

**範例**：`[8,2,4,3,20,2]` → 3（2,3,4）

**解題思路**：先去重；只有**不存在 x-1** 的數才是序列起點，從這裡一路數 x+1。每個不同元素最多作為某段序列的一員被掃過一次，因此巢狀迴圈仍是線性。

```java
class Solution {
    public int longestConsecutive(int[] nums) {
        Set<Integer> set = new HashSet<>();
        for (int x : nums) set.add(x);
        int best = 0;
        for (int x : set) {
            if (x != Integer.MIN_VALUE && set.contains(x - 1)) continue;
            int end = x, length = 1;
            while (end != Integer.MAX_VALUE && set.contains(end + 1)) {
                end++; length++;
            }
            best = Math.max(best, length);
        }
        return best;
    }
}
```

**複雜度**：平均時間 O(n)，額外空間 O(n)。

**注意事項**：必須遍歷去重後的 Set，否則大量重複起點可能重複掃描。上面的寫法也防止 `int` 邊界加減溢位。排序解法是 O(n log n)，題目要求 O(n) 時才需要這個做法。
