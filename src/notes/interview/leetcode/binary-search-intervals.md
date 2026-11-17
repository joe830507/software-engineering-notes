# 二分搜尋與區間

## 模式說明

### 二分搜尋

**適用時機**：已排序陣列找值或邊界；或**答案空間有單調性**（「最小的 X 使條件成立」），這是最容易被忽略、但其實出現頻率極高的用法。

**辨識訊號**：看到「已排序」很容易想到二分；真正需要練習的是「**二分答案**」。當題目出現「最小的最大值」「最大的最小值」「在 h 小時內完成的最小速度」這類敘述時，代表存在一個檢查函式，它的回傳結果隨答案增大呈現「先不可行後可行」的單調性。找到這條分界線，就能對「答案」本身而不是對「陣列索引」做二分。

**三個模板**：

```java
// A. 找確切值
int lo = 0, hi = n - 1;
while (lo <= hi) {
    int mid = lo + (hi - lo) / 2;
    if (nums[mid] == target) return mid;
    else if (nums[mid] < target) lo = mid + 1;
    else hi = mid - 1;
}
return -1;

// B. 找左邊界（第一個 >= target）
int lo = 0, hi = n;
while (lo < hi) {
    int mid = lo + (hi - lo) / 2;
    if (nums[mid] < target) lo = mid + 1;
    else hi = mid;
}
return lo;

// C. 二分答案
int lo = 最小可能答案, hi = 最大可能答案;
while (lo < hi) {
    int mid = lo + (hi - lo) / 2;
    if (可行(mid)) hi = mid;
    else lo = mid + 1;
}
return lo;
```

**為什麼是 O(log n)**：每一輪都把候選區間砍半，k 輪後剩餘長度是 n / 2^k，縮到 1 時 k = log₂ n。這是等比數列的性質，跟資料結構無關。

**注意**：二分搜尋在可排除半邊時才是 O(log n)；排序合併（#56）是 O(n log n)。閉區間模板（`lo <= hi`、`mid ± 1`）和半開區間模板（`lo < hi`）不要混用。

### 區間問題

輸入是一堆 `[start, end]` 陣列，就是區間問題的訊號。

```java
// 幾乎所有區間題的第一行都是排序
Arrays.sort(intervals, (a, b) -> Integer.compare(a[0], b[0])); // 合併類：按起點
Arrays.sort(intervals, (a, b) -> Integer.compare(a[1], b[1])); // 排程類：按終點

// 閉區間 [start, end]：共用端點也算重疊，例如 [1,3] 與 [3,5]
boolean overlap = a[0] <= b[1] && b[0] <= a[1];
// 非空半開區間 [start, end)：端點相接不算重疊，例如相鄰會議
boolean halfOpenOverlap = a[0] < b[1] && b[0] < a[1];
```

排序之所以幾乎是所有區間題的第一步，是因為區間之間的關係（重疊、包含、相鄰）只有在「按某個維度排好順序」後才會呈現出局部性：排序前要兩兩比較（O(n²)），排序後只需跟「前一個已處理的區間」比較（O(n)）。

**常見題型**：Merge Intervals、Insert Interval、Non-overlapping Intervals、Meeting Rooms。

## #704 Binary Search（Easy）

[官方題目](https://leetcode.com/problems/binary-search/)

**題意**：在遞增且不重複的陣列中找 target，沒有則回傳 -1。

**範例**：`[1,3,6,9], target=6` → 2

**解題思路**：維持答案若存在，必定位於閉區間 `[left, right]`。比較中點後排除不可能的一半，直到找到或區間為空。

```java
class Solution {
    public int search(int[] nums, int target) {
        int left = 0, right = nums.length-1;
        while (left <= right) {
            int mid = left + (right-left)/2;
            if (nums[mid] == target) return mid;
            if (nums[mid] < target) left = mid+1;
            else right = mid-1;
        }
        return -1;
    }
}
```

**複雜度**：時間 O(log n)，額外空間 O(1)。

**注意事項**：閉區間模板搭配 `left <= right`、`mid ± 1`；不要和半開區間模板混用。`mid` 用 `left + (right-left)/2`，避免 `(left+right)/2` 溢位。

## #33 Search in Rotated Sorted Array（Medium）

[官方題目](https://leetcode.com/problems/search-in-rotated-sorted-array/)

**題意**：搜尋旋轉過的嚴格遞增陣列。

**範例**：`[6,8,1,3,4], target=3` → 3

**解題思路**：元素不重複時，中點分割後**至少一半有序**。先辨認哪一半有序，再判斷 target 是否在那一半的數值範圍內，決定保留哪一側。

```java
class Solution {
    public int search(int[] nums, int target) {
        int left = 0, right = nums.length-1;
        while (left <= right) {
            int mid = left+(right-left)/2;
            if (nums[mid] == target) return mid;
            if (nums[left] <= nums[mid]) {
                if (nums[left] <= target && target < nums[mid]) right = mid-1;
                else left = mid+1;
            } else {
                if (nums[mid] < target && target <= nums[right]) left = mid+1;
                else right = mid-1;
            }
        }
        return -1;
    }
}
```

**複雜度**：時間 O(log n)，額外空間 O(1)。

**注意事項**：`nums[left] <= nums[mid]` 的等號不可漏掉，尤其只剩一兩個元素。若允許重複值，無法一直辨識有序半邊，最差可能 O(n)。

## #56 Merge Intervals（Medium）

[官方題目](https://leetcode.com/problems/merge-intervals/)

**題意**：把互相重疊的閉區間合併。

**範例**：`[[4,7],[1,3],[3,5],[9,10]]` → `[[1,7],[9,10]]`

**解題思路**：依起點排序後，下一個區間只需與目前最後一個合併結果比較。若起點不大於前一段終點，就延長終點；否則開始新區間。

```java
import java.util.*;

class Solution {
    public int[][] merge(int[][] intervals) {
        int[][] a = new int[intervals.length][];
        for (int i = 0; i < a.length; i++) a[i] = intervals[i].clone();
        Arrays.sort(a, (x,y) -> Integer.compare(x[0], y[0]));
        List<int[]> out = new ArrayList<>();
        for (int[] current : a) {
            if (out.isEmpty() || current[0] > out.get(out.size()-1)[1]) out.add(current);
            else {
                int[] previous = out.get(out.size()-1);
                previous[1] = Math.max(previous[1], current[1]);
            }
        }
        return out.toArray(new int[out.size()][]);
    }
}
```

**複雜度**：時間 O(n log n)，額外空間 O(n)（複製陣列、排序與結果）。

**注意事項**：`[1,3]` 和 `[3,5]` 視為重疊。上面深複製每一列，不修改輸入；比較器使用 `Integer.compare` 避免相減溢位。
