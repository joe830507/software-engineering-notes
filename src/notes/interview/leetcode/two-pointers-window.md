# 雙指標與滑動視窗

## 模式說明

### 雙指標（對撞指標）

**適用時機**：陣列已排序，或問題本身有「從兩端往中間收斂」的結構。

**辨識訊號**：

- 題目說「已排序」或你可以先排序：排序後陣列有單調性，兩端往中間移動時「和」的變化是可預測的，這正是雙指標能安全排除大片可能性的原因。
- 迴文：定義就是「從兩端往中間對稱」。
- 「盛水」「面積」「配對」：通常有「兩個端點決定一個值，其中一個變小、一個變大會此消彼長」的結構。

**模板**：

```java
int l = 0, r = arr.length - 1;
while (l < r) {
    int sum = arr[l] + arr[r];
    if (sum == target) return new int[]{l, r};
    else if (sum < target) l++; // 需要更大
    else r--;                   // 需要更小
}
```

**為什麼是 O(n)**：每一輪移動都會排除掉**一整批**不可能的候選，而不是只排除一個。當 sum 小於 target 時讓 l 右移，隱含的證明是「`nums[l]` 配上任何比目前 r 更小的右指標，和只會更小」，所以可以一次排除這個位置的所有可能性。左右指標總共只會移動 n 次。

### 雙指標（快慢指標）

- **陣列原地修改**（移除、去重、移動零）：slow 永遠代表「下一個要寫入的合法位置」，fast 負責探路。
- **鏈表中點**：快指標走兩步、慢指標走一步，快指標到尾端時，慢指標約在中間。
- **鏈表有環**：進入環後，快慢指標的相對位置每輪改變一格，最終相遇；無環時則會先走到 null。
- **倒數第 k 個**：兩指標維持固定 k 格間距，以相同速度前進；前者到尾端時，後者就在目標附近。這不是用不同速度追趕。

```java
// 陣列原地：slow 是「下一個要寫入的位置」
int slow = 0;
for (int fast = 0; fast < n; fast++) {
    if (符合保留條件) nums[slow++] = nums[fast];
}
return slow; // 新長度
```

### 滑動視窗

**適用時機**：求「連續」子陣列 / 子字串的最長、最短、或計數。

**辨識訊號**：

- 有「連續 / 子陣列 / 子字串」：這是必要條件，因為視窗本身就是一段連續區間。
- 有「最長 / 最短 / 恰好」：要在所有合法視窗中找極值。
- **「子序列」（不連續）通常不是滑動視窗，而是 DP**。這是最常見的誤判。

**為什麼是 O(n)**：當右邊界擴張時，如果視窗變得不合法，左邊界只會單調右移，不會往回退。左右指標合計各自從頭走到尾一次，總移動次數是 O(2n)。內層 `while` 看起來像巢狀迴圈，但整體移動次數是線性的（攤還分析）。

**模板**：

```java
int left = 0, best = 0;
Map<Character, Integer> window = new HashMap<>();
for (int right = 0; right < s.length(); right++) {
    window.merge(s.charAt(right), 1, Integer::sum);
    while (視窗不合法) {
        char d = s.charAt(left++);
        window.merge(d, -1, Integer::sum);
        if (window.get(d) == 0) window.remove(d);
    }
    best = Math.max(best, right - left + 1);
}
```

**限制**：連續區間只是線索，還要證明左右邊界能安全地單向移動。含負數的和問題可能破壞這項條件：例如 `[1,-1,5]` 要找和至少 5 的最短區間，縮掉 1 後和變小，繼續縮掉 -1 卻又變大。若問「和恰為 k 的個數」，常用前綴和 + HashMap；若問「和至少 k 的最短長度」，可能需要前綴和 + 單調佇列，不能一律換成 HashMap。

## #15 3Sum（Medium）

[官方題目](https://leetcode.com/problems/3sum/)

**題意**：找出所有總和為 0 的不重複三元組。

**範例**：`[-2,0,1,1,2]` → `[[-2,0,2],[-2,1,1]]`

**解題思路**：排序後固定第一個數，再用左右指標搜尋另外兩個。和太小就增加左值，和太大就減少右值。固定值與找到答案後的左右值都要跳過重複。

```java
import java.util.*;

class Solution {
    public List<List<Integer>> threeSum(int[] nums) {
        int[] a = nums.clone();
        Arrays.sort(a);
        List<List<Integer>> out = new ArrayList<>();
        for (int i = 0; i < a.length - 2; i++) {
            if (i > 0 && a[i] == a[i-1]) continue;
            if (a[i] > 0) break;
            int l = i+1, r = a.length-1;
            while (l < r) {
                long sum = (long) a[i] + a[l] + a[r];
                if (sum < 0) l++;
                else if (sum > 0) r--;
                else {
                    out.add(Arrays.asList(a[i], a[l], a[r]));
                    int left = a[l], right = a[r];
                    while (l < r && a[l] == left) l++;
                    while (l < r && a[r] == right) r--;
                }
            }
        }
        return out;
    }
}
```

**複雜度**：時間 O(n²)；先複製陣列，額外工作空間 O(n)，另加結果 O(r)。

**注意事項**：此版不修改輸入；三數總和轉成 `long` 避免通用情境溢位。排序與去重是正確性的核心。

## #11 Container With Most Water（Medium）

[官方題目](https://leetcode.com/problems/container-with-most-water/)

**題意**：挑兩條線形成能盛最多水的容器。

**範例**：`[1,3,2,4]` → 6（索引 1 與 3）

**解題思路**：面積是寬度乘較短邊。若保留短邊只移動長邊，寬度縮小而高度上限不會增加，所以可安全捨棄短邊。兩邊相等時任移一邊即可。

```java
class Solution {
    public int maxArea(int[] height) {
        int l = 0, r = height.length-1, best = 0;
        while (l < r) {
            best = Math.max(best, (r-l) * Math.min(height[l], height[r]));
            if (height[l] <= height[r]) l++;
            else r--;
        }
        return best;
    }
}
```

**複雜度**：時間 O(n)，額外空間 O(1)。

**注意事項**：這題只看兩條邊；不要和 #42 計算每個位置積水混淆。每次移動「較矮」的那一邊，因為移動較高的那一邊只會讓寬度變小、高度卻不會變得更好。

## #3 Longest Substring Without Repeating Characters（Medium）

[官方題目](https://leetcode.com/problems/longest-substring-without-repeating-characters/)

**題意**：求沒有重複字元的最長連續子字串長度。

**範例**：`"abba"` → 2

**解題思路**：map 記錄各字元上次出現的位置。右端遇到重複字元時，左端至少移到上次位置加一，但**不得往回退**。`abba` 最後的 a 上次在 0，此時 left 已是 2，應維持 2。

```java
import java.util.*;

class Solution {
    public int lengthOfLongestSubstring(String s) {
        Map<Character, Integer> last = new HashMap<>();
        int left = 0, best = 0;
        for (int right = 0; right < s.length(); right++) {
            char c = s.charAt(right);
            Integer previous = last.put(c, right);
            if (previous != null) left = Math.max(left, previous+1);
            best = Math.max(best, right-left+1);
        }
        return best;
    }
}
```

**複雜度**：平均時間 O(n)，額外空間 O(min(n,Σ))，Σ 為字元集大小。

**注意事項**：子字串必須連續；此版以 Java `char`（UTF-16 code unit）計數，通用 emoji / Unicode 碼點需求需改用 `codePoints`。

## #76 Minimum Window Substring（Hard）

[官方題目](https://leetcode.com/problems/minimum-window-substring/)

**題意**：找出 s 中包含 t 全部字元及其重複次數的最短連續區間。

**範例**：`s="CABBA", t="ABA"` → `"ABBA"`

**解題思路**：`need[c]` 表示還缺幾個 c，負值表示多出來。`missing` 記錄還缺的總字元數。擴張到 `missing=0` 後持續縮左端，直到剛好失去覆蓋條件；每次縮小前更新最佳範圍。

```java
class Solution {
    public String minWindow(String s, String t) {
        if (t.isEmpty() || s.length() < t.length()) return "";
        int[] need = new int[128];
        for (int i = 0; i < t.length(); i++) need[t.charAt(i)]++;
        int missing = t.length(), left = 0, start = 0, length = Integer.MAX_VALUE;
        for (int right = 0; right < s.length(); right++) {
            char c = s.charAt(right);
            if (need[c] > 0) missing--;
            need[c]--;
            while (missing == 0) {
                if (right-left+1 < length) { start = left; length = right-left+1; }
                char removed = s.charAt(left++);
                need[removed]++;
                if (need[removed] > 0) missing++;
            }
        }
        return length == Integer.MAX_VALUE ? "" : s.substring(start, start+length);
    }
}
```

**複雜度**：時間 O(|s|+|t|)，額外工作空間 O(1)（固定 128 字元陣列），另有回傳字串空間。

**注意事項**：t 的重複次數必須計入，不能只用 Set。本題限英文字母，因此 128 陣列足夠。只在最後 `substring`，避免反覆複製。
