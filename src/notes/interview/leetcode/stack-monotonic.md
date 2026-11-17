# 堆疊與單調堆疊

## 模式說明

### 單調堆疊

**適用時機**：求每個元素「右邊（或左邊）第一個比它大 / 小的元素」。

**辨識訊號**：

- 「下一個更大的元素」「等幾天會更暖」：直接對應單調堆疊的定義。
- 「柱狀圖最大矩形」「接雨水」：需要知道「往左往右第一個更矮 / 更高的位置」。
- 需要維護一個「遞增 / 遞減」的候選集合：這是所有單調堆疊題目的共同結構。

**模板**：

```java
// 單調遞減堆疊：找右邊第一個更大的元素
Deque<Integer> stack = new ArrayDeque<>(); // 存索引
int[] res = new int[n];
Arrays.fill(res, -1);
for (int i = 0; i < n; i++) {
    while (!stack.isEmpty() && nums[stack.peek()] < nums[i]) {
        res[stack.pop()] = nums[i]; // 被彈出的，答案就是 nums[i]
    }
    stack.push(i);
}
```

**為什麼是 O(n)**：乍看之下 `for` 包著 `while` 像 O(n²)，但每個元素**最多入棧一次、出棧一次**。一旦某個元素被彈出，就永遠離開了這個資料結構，不會再被重複檢查。push 與 pop 加起來最多 2n 次。這是攤還分析的典型案例，跟滑動視窗的複雜度證明是同一個道理。

### Java 的 Deque

用 `Deque` 搭配 `ArrayDeque` 示範堆疊與佇列：`push` / `pop` 從同端操作，`offer` / `poll` 則為 FIFO。不要使用舊的 `Stack` 類別。

## #20 Valid Parentheses（Easy）

[官方題目](https://leetcode.com/problems/valid-parentheses/)

**題意**：判斷括號種類、順序與配對是否正確。

**範例**：`"([])"` → true；`"([)]"` → false

**解題思路**：讀到左括號時，把**期待的右括號**放入 stack。讀到右括號時，必須等於 stack 頂端；處理完成後 stack 也必須為空。

```java
import java.util.*;

class Solution {
    public boolean isValid(String s) {
        Deque<Character> stack = new ArrayDeque<>();
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '(') stack.push(')');
            else if (c == '[') stack.push(']');
            else if (c == '{') stack.push('}');
            else if (stack.isEmpty() || stack.pop() != c) return false;
        }
        return stack.isEmpty();
    }
}
```

**複雜度**：時間 O(n)，額外空間 O(n)。

**注意事項**：只計算各種括號數量無法檢查巢狀順序；本題輸入僅含六種括號。

## #155 Min Stack（Medium）

[官方題目](https://leetcode.com/problems/min-stack/)

**題意**：支援 `push` / `pop` / `top` / `getMin`，所有操作皆為常數時間。

**範例**：`push(3)`, `push(1)`, `push(1)`, `pop()` 後 `getMin()=1`

**解題思路**：每一層存 `[值, 到這一層為止的最小值]`。`pop` 時連同當層最小值一起移除，下一層自然就是舊狀態；不需要重新掃描。

```java
import java.util.*;

class MinStack {
    private final Deque<int[]> stack = new ArrayDeque<>();
    public MinStack() {}
    public void push(int val) {
        int min = stack.isEmpty() ? val : Math.min(val, stack.peek()[1]);
        stack.push(new int[]{val, min});
    }
    public void pop() { stack.pop(); }
    public int top() { return stack.peek()[0]; }
    public int getMin() { return stack.peek()[1]; }
}
```

**複雜度**：每個操作 O(1)，總空間 O(n)。

**注意事項**：重複最小值要能正確保留；依題目保證，`pop` / `top` / `getMin` 只會在非空時呼叫。

## #739 Daily Temperatures（Medium）

[官方題目](https://leetcode.com/problems/daily-temperatures/)

**題意**：每一天要等幾天才遇到更高溫；沒有則為 0。

**範例**：`[30,40,40,50]` → `[1,2,1,0]`

**解題思路**：stack 存尚未找到更高溫的日期**索引**，從底到頂溫度不遞增。新溫度若更高，就替頂端日期結算等待天數；每個索引最多入棧、出棧各一次。

```java
import java.util.*;

class Solution {
    public int[] dailyTemperatures(int[] temperatures) {
        int[] answer = new int[temperatures.length];
        Deque<Integer> stack = new ArrayDeque<>();
        for (int i = 0; i < temperatures.length; i++) {
            while (!stack.isEmpty() && temperatures[i] > temperatures[stack.peek()]) {
                int previous = stack.pop();
                answer[previous] = i - previous;
            }
            stack.push(i);
        }
        return answer;
    }
}
```

**複雜度**：時間 O(n)，額外空間 O(n)，結果 O(n)。

**注意事項**：相等溫度不算更暖，因此使用 `>` 而非 `>=`；必須存索引才能計算距離。

## #42 Trapping Rain Water（Hard）

[官方題目](https://leetcode.com/problems/trapping-rain-water/)

**題意**：計算柱狀高度圖能累積多少雨水。

**範例**：`[3,0,2,0,4]` → 7

**解題思路**：每格積水為 `min(左最高, 右最高) - 自身高度`。維護兩端已知最大值；較小最大值的一側已確定有足夠高的另一側邊界，因此可以立即結算並前進。例中三個內部位置分別積 3、1、3。

```java
class Solution {
    public int trap(int[] height) {
        int l = 0, r = height.length-1, leftMax = 0, rightMax = 0, water = 0;
        while (l <= r) {
            leftMax = Math.max(leftMax, height[l]);
            rightMax = Math.max(rightMax, height[r]);
            if (leftMax <= rightMax) water += leftMax - height[l++];
            else water += rightMax - height[r--];
        }
        return water;
    }
}
```

**複雜度**：時間 O(n)，額外空間 O(1)。

**注意事項**：這裡示範雙指標最佳空間解；若練單調堆疊，可改成遇到右邊界時結算凹槽。兩種解法都值得辨認。
