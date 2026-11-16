# 遞迴與回溯

## 模式說明

**辨識訊號**：看到「所有組合」「所有排列」「所有子集」「所有可能的方案」這類要求窮舉全部解的敘述，就是回溯的訊號。

回溯本質上是「在一棵隱含的決策樹上做深度優先搜尋」，每個節點代表一個部分解，每條邊代表一個選擇。「做選擇 → 遞迴 → 撤銷選擇」對應的是「往下走一層 → 探索子樹 → 退回上一層準備嘗試下一個兄弟節點」。

**模板**：

```java
void backtrack(List<Integer> path, int start) {
    if (滿足條件) { res.add(new ArrayList<>(path)); return; } // 一定要複製
    for (int i = start; i < n; i++) {
        if (剪枝條件) continue;
        path.add(choices[i]);         // 1. 做選擇
        backtrack(path, i + 1);       // 2. 遞迴
        path.remove(path.size() - 1); // 3. 撤銷
    }
}
```

**三種變體的差別**（放在一起看才會真正理解）：

| 型別 | 遞迴傳什麼 | 去重方式 |
| --- | --- | --- |
| 子集 / 組合（不重複用） | `i + 1` | 排序 + 若 `i > start` 且與前一個相同則跳過 |
| 組合（可重複用同一元素） | `i` | 同上 |
| 排列 | 0，配合 `used[]` 陣列 | 排序 + 若前一個相同值未被使用則跳過 |

**為什麼複雜度是指數級（而且無法避免）**：回溯要窮舉的是「所有可能的解」，子集的數量本身就是 2^n（每個元素選或不選），排列的數量是 n!。這不是演算法效率不好，而是答案數量就這麼多。回溯能做的優化是「盡快剪掉不可能產生合法解的分支」，但無法把指數級問題變成多項式級。

**常見題型**：Subsets、Combination Sum、Permutations、Word Search、Palindrome Partitioning、N-Queens、Letter Combinations。

## #46 Permutations（Medium）

[官方題目](https://leetcode.com/problems/permutations/)

**題意**：列出互不相同數字的所有排列。

**範例**：`[1,2]` → `[[1,2],[2,1]]`

**解題思路**：每一層選一個尚未使用的數，加入路徑；遞迴結束後移除並取消 `used`。長度達 n 時，複製目前路徑作為一個答案。

```java
class Solution {
    public List<List<Integer>> permute(int[] nums) {
        List<List<Integer>> out = new ArrayList<>();
        dfs(nums, new boolean[nums.length], new ArrayList<>(), out);
        return out;
    }
    private void dfs(int[] nums, boolean[] used, List<Integer> path, List<List<Integer>> out) {
        if (path.size() == nums.length) { out.add(new ArrayList<>(path)); return; }
        for (int i = 0; i < nums.length; i++) {
            if (used[i]) continue;
            used[i] = true; path.add(nums[i]);
            dfs(nums, used, path, out);
            path.remove(path.size()-1); used[i] = false;
        }
    }
}
```

**複雜度**：時間 O(n·n!)（含複製答案），額外工作空間 O(n)，輸出空間 O(n·n!)。

**注意事項**：`out.add(path)` 會共用同一可變物件，必須 `new ArrayList<>(path)`。本題數值不重複；重複值版本需額外去重。

## #78 Subsets（Medium）

[官方題目](https://leetcode.com/problems/subsets/)

**題意**：列出互不相同元素的所有子集，含空集合。

**範例**：`[1,2]` → `[[],[1],[1,2],[2]]`（順序不限）

**解題思路**：每個搜尋節點本身就是一個子集。下一次只能從 `start` 之後選元素，保證索引遞增，避免產生 `[1,2]` 和 `[2,1]` 這類重複集合。

```java
class Solution {
    public List<List<Integer>> subsets(int[] nums) {
        List<List<Integer>> out = new ArrayList<>();
        dfs(nums, 0, new ArrayList<>(), out);
        return out;
    }
    private void dfs(int[] nums, int start, List<Integer> path, List<List<Integer>> out) {
        out.add(new ArrayList<>(path));
        for (int i = start; i < nums.length; i++) {
            path.add(nums[i]);
            dfs(nums, i+1, path, out);
            path.remove(path.size()-1);
        }
    }
}
```

**複雜度**：時間 O(n·2^n)，額外工作空間 O(n)，輸出空間 O(n·2^n)。

**注意事項**：排列要考慮順序，子集不考慮；不用 `used`，而是傳 `i+1`。

## #22 Generate Parentheses（Medium）

[官方題目](https://leetcode.com/problems/generate-parentheses/)

**題意**：產生 n 對括號的所有合法組合。

**範例**：n=2 → `["(())","()()"]`

**解題思路**：只要左括號尚未達 n 就能加左括號；只有已用右括號少於左括號時才能加右括號。任何搜尋前綴都保持 `close ≤ open ≤ n`，直接排除不可能合法的路徑。

```java
class Solution {
    public List<String> generateParenthesis(int n) {
        List<String> out = new ArrayList<>();
        dfs(n, 0, 0, new StringBuilder(), out);
        return out;
    }
    private void dfs(int n, int open, int close, StringBuilder path, List<String> out) {
        if (path.length() == 2*n) { out.add(path.toString()); return; }
        if (open < n) {
            path.append('('); dfs(n, open+1, close, path, out);
            path.deleteCharAt(path.length()-1);
        }
        if (close < open) {
            path.append(')'); dfs(n, open, close+1, path, out);
            path.deleteCharAt(path.length()-1);
        }
    }
}
```

**複雜度**：令 Cn 為第 n 個 Catalan 數：時間 O(n·Cn)，工作空間 O(n)，輸出 O(n·Cn)；`Cn = C(2n, n) / (n+1)`。

**注意事項**：不是產生所有 2^(2n) 字串再驗證。`StringBuilder` 回溯時要刪掉剛加入的字元。這是「剪枝」的好例子。
