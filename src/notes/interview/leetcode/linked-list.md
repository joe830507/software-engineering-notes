# 鏈結串列

## 模式說明

鏈表題的難點通常不在演算法思路本身（大部分是 O(n) 一次遍歷），而在「**指標操作的順序**」。鏈表跟陣列最大的差別是：改動一個節點的指標後，如果沒有事先保存，就永遠失去了通往後面節點的路。

**三個必備技巧**：

```java
// 技巧 1：Dummy Head：消除「操作頭節點」的特殊情況
ListNode dummy = new ListNode(0, head);
// ... 操作 ...
return dummy.next;

// 技巧 2：反轉（先存 next 再改指標）
ListNode prev = null, cur = head;
while (cur != null) {
    ListNode next = cur.next;
    cur.next = prev;
    prev = cur;
    cur = next;
}
return prev;

// 技巧 3：快慢指標找中點
ListNode slow = head, fast = head;
while (fast != null && fast.next != null) { slow = slow.next; fast = fast.next.next; }
```

- 這也是為什麼「反轉」的第一行永遠是「先存下一個節點」。
- **Dummy Head** 是處理「頭節點可能被刪除或改變」這類特殊情況的萬用解法，本質是多加一層間接性，讓「第一個節點」也能被當作「某個節點的下一個」統一處理，不需要額外的 `if`。

**為什麼「2 倍速」能保證相遇**：假設鏈表有環，環長為 C。一旦慢指標進入環中，快指標每走一步，相對慢指標就縮短 1 個節點的距離。距離有限且每步嚴格縮短 1，不會有跳過的空隙，所以最多 C 步之後必定相遇。

**本地執行時的節點定義**（LeetCode 已提供；下方每題範例頂端也以註解附上同一份定義）：

```java
class ListNode {
    int val;
    ListNode next;
    ListNode() {}
    ListNode(int val) { this.val = val; }
    ListNode(int val, ListNode next) { this.val = val; this.next = next; }
}
```

## #206 Reverse Linked List（Easy）

[官方題目](https://leetcode.com/problems/reverse-linked-list/)

**題意**：反轉單向鏈結串列並回傳新頭節點。

**範例**：`1→2→3` → `3→2→1`

**解題思路**：`prev` 是已反轉部分的頭，`cur` 是待處理部分的頭。先暫存 `next`，再將 `cur.next` 指向 `prev`，最後一起前進。

```java
/**
 * Definition for singly-linked list.（LeetCode 已內建；本機執行時取消註解）
 * class ListNode {
 *     int val;
 *     ListNode next;
 *     ListNode() {}
 *     ListNode(int val) { this.val = val; }
 *     ListNode(int val, ListNode next) { this.val = val; this.next = next; }
 * }
 */
class Solution {
    public ListNode reverseList(ListNode head) {
        ListNode prev = null, cur = head;
        while (cur != null) {
            ListNode next = cur.next;
            cur.next = prev;
            prev = cur;
            cur = next;
        }
        return prev;
    }
}
```

**複雜度**：時間 O(n)，額外空間 O(1)。

**注意事項**：直接修改節點連結；若先覆寫 `next` 而沒備份，剩餘串列就會遺失。

## #21 Merge Two Sorted Lists（Easy）

[官方題目](https://leetcode.com/problems/merge-two-sorted-lists/)

**題意**：合併兩個遞增鏈結串列。

**範例**：`1→4` 與 `2→3` → `1→2→3→4`

**解題思路**：用 dummy 消除第一個節點的特殊處理；`tail` 每次接上兩個頭中較小者。一邊用完後，直接接另一邊剩餘串列。

```java
/**
 * Definition for singly-linked list.（LeetCode 已內建；本機執行時取消註解）
 * class ListNode {
 *     int val;
 *     ListNode next;
 *     ListNode() {}
 *     ListNode(int val) { this.val = val; }
 *     ListNode(int val, ListNode next) { this.val = val; this.next = next; }
 * }
 */
class Solution {
    public ListNode mergeTwoLists(ListNode a, ListNode b) {
        ListNode dummy = new ListNode(0), tail = dummy;
        while (a != null && b != null) {
            if (a.val <= b.val) { tail.next = a; a = a.next; }
            else { tail.next = b; b = b.next; }
            tail = tail.next;
        }
        tail.next = a != null ? a : b;
        return dummy.next;
    }
}
```

**複雜度**：時間 O(m+n)，額外空間 O(1)。

**注意事項**：重用原節點，會修改輸入連結；假設兩份輸入沒有共用節點。

## #141 Linked List Cycle（Easy）

[官方題目](https://leetcode.com/problems/linked-list-cycle/)

**題意**：判斷串列是否形成環。

**範例**：`1→2→3`，3.next 指向 2 → true

**解題思路**：慢指標走一步，快指標走兩步。若有環，進入環後兩者的相對距離每輪改變一格，最終相遇；無環則快指標先碰到 `null`。

```java
/**
 * Definition for singly-linked list.（LeetCode 已內建；本機執行時取消註解）
 * class ListNode {
 *     int val;
 *     ListNode next;
 *     ListNode() {}
 *     ListNode(int val) { this.val = val; }
 *     ListNode(int val, ListNode next) { this.val = val; this.next = next; }
 * }
 */
class Solution {
    public boolean hasCycle(ListNode head) {
        ListNode slow = head, fast = head;
        while (fast != null && fast.next != null) {
            slow = slow.next;
            fast = fast.next.next;
            if (slow == fast) return true;
        }
        return false;
    }
}
```

**複雜度**：時間 O(n)，額外空間 O(1)。

**注意事項**：比較節點物件身分，不是 `val`；迴圈要同時檢查 `fast` 與 `fast.next`。用 `HashSet` 記錄走過的節點也行，但空間是 O(n)；快慢指標的價值就是 O(1) 空間。

## #146 LRU Cache（Medium）

[官方題目](https://leetcode.com/problems/lru-cache/)

**題意**：實作 `get` / `put`，超過容量時移除最久未使用的資料。

**範例**：容量 2：`put(1,10)`, `put(2,20)`, `get(1)`, `put(3,30)` 後 `get(2)=-1`

**解題思路**：`HashMap` 讓 key 可直接找到節點；雙向串列維持使用順序。head 後是最新、tail 前是最舊。讀取或更新後將節點移到最前，淘汰尾端即可。**哨兵節點**讓刪除與插入不需要額外處理頭尾。

```java
import java.util.*;

class LRUCache {
    private static class Node {
        int key, value;
        Node prev, next;
        Node(int key, int value) { this.key = key; this.value = value; }
    }
    private final int capacity;
    private final Map<Integer, Node> map = new HashMap<>();
    private final Node head = new Node(0,0), tail = new Node(0,0);
    public LRUCache(int capacity) {
        this.capacity = capacity;
        head.next = tail; tail.prev = head;
    }
    private void remove(Node node) {
        node.prev.next = node.next;
        node.next.prev = node.prev;
    }
    private void addFirst(Node node) {
        node.prev = head; node.next = head.next;
        head.next.prev = node; head.next = node;
    }
    public int get(int key) {
        Node node = map.get(key);
        if (node == null) return -1;
        remove(node); addFirst(node);
        return node.value;
    }
    public void put(int key, int value) {
        Node node = map.get(key);
        if (node != null) {
            node.value = value;
            remove(node); addFirst(node);
            return;
        }
        node = new Node(key, value);
        map.put(key, node); addFirst(node);
        if (map.size() > capacity) {
            Node oldest = tail.prev;
            remove(oldest); map.remove(oldest.key);
        }
    }
}
```

**複雜度**：`get` / `put` 平均時間 O(1)，空間 O(capacity)。

**注意事項**：`ArrayList` 或單向串列任意刪除通常是 O(n)。更新既有 key 也算使用；此教學實作不是執行緒安全快取。面試如果允許，也可以用 `LinkedHashMap` 的 `accessOrder` 加 `removeEldestEntry` 幾行解決（見 Java 進階的「集合進階」），但通常會被要求手寫雙向鏈表。
