# 拓撲排序、並查集與最短路徑

## 模式說明

這一頁接續「二元樹與圖」，處理三類進階的圖題：

| 問題類型 | 工具 | 識別訊號 |
| --- | --- | --- |
| 有先後相依關係，判斷順序是否可行 | 拓撲排序（Kahn） | 先修課程、任務相依、編譯順序 |
| 動態合併、判斷是否連通、找環 | 並查集（Union-Find） | 「合併集合」「是否連通」「連通分量」「多餘的邊」 |
| 帶權圖的最短路徑（非負權重） | Dijkstra | 「最短時間」「最小成本」且邊有權重 |
| 隱式圖的最少步數 | BFS | 「最少幾步」，狀態之間能定義「相鄰」 |

### 並查集模板

```java
int[] parent = new int[n];
for (int i = 0; i < n; i++) parent[i] = i;

int find(int x) {
    if (parent[x] != x) parent[x] = find(parent[x]); // 路徑壓縮
    return parent[x];
}
// 合併：r1 = find(a), r2 = find(b); if (r1 != r2) parent[r1] = r2;
```

這是「只有路徑壓縮」的簡化模板；不能直接套用每次操作攤銷 O(α(n)) 的保證。要取得常見的近乎常數保證，應再搭配按大小或按秩合併，避免把高樹掛到矮樹下面。此頁簡化版本的複雜度可用每次操作攤銷 O(log n) 的較寬鬆上界描述；遞迴 find 在第一次壓縮深鏈時仍可能需要 O(n) 堆疊。

「依序處理邊，兩端早已連通時，加入該邊就形成環」適用於無向圖。有向圖判環應使用拓撲排序或 DFS 狀態，不能直接套用這個判斷。

## #207 Course Schedule（Medium）

[官方題目](https://leetcode.com/problems/course-schedule/)

**題意**：有 n 門課程與一些先修關係（有向邊），判斷能否修完所有課程。

**解題思路**：「能否修完所有課程」等價於「先修關係構成的有向圖中沒有環」（有環代表存在互相依賴、永遠無法開始的死結）。用 Kahn 演算法：計算每門課的入度，把入度為 0 的課（沒有先修條件）放進佇列；每次從佇列取出一門課「修完」，把它指向的所有課程入度減一，入度變成 0 就加入佇列。最終處理的課程數等於總課程數，代表沒有環。

```java
import java.util.*;

class Solution {
    public boolean canFinish(int numCourses, int[][] prerequisites) {
        List<List<Integer>> graph = new ArrayList<>();
        int[] indegree = new int[numCourses];
        for (int i = 0; i < numCourses; i++) graph.add(new ArrayList<>());
        for (int[] p : prerequisites) { // p = [course, prerequisite]
            graph.get(p[1]).add(p[0]);
            indegree[p[0]]++;
        }
        Queue<Integer> queue = new LinkedList<>();
        for (int i = 0; i < numCourses; i++) if (indegree[i] == 0) queue.offer(i);

        int completed = 0;
        while (!queue.isEmpty()) {
            int course = queue.poll();
            completed++;
            for (int next : graph.get(course)) {
                if (--indegree[next] == 0) queue.offer(next);
            }
        }
        return completed == numCourses; // 全部課程都能被處理，代表無環
    }
}
```

**複雜度**：時間 O(V+E)，空間 O(V+E)。

**關鍵洞察**：「入度為 0 代表可以立刻執行」是 Kahn 演算法的核心直覺。任何題目只要牽涉「有依賴順序關係」且要判斷「順序是否可行」，都該想到拓撲排序。另一種做法是三色 DFS 判環。

## #210 Course Schedule II（Medium）

[官方題目](https://leetcode.com/problems/course-schedule-ii/)

**題意**：跟 #207 類似，但要求回傳一個可行的修課順序（無法修完則回傳空陣列）。

**解題思路**：直接複用 Kahn 演算法，差異只在於每次從佇列取出課程「修完」時，把它依序加進結果陣列。拓撲排序演算法的處理順序本身天然就是一個合法的修課順序。

```java
import java.util.*;

class Solution {
    public int[] findOrder(int numCourses, int[][] prerequisites) {
        List<List<Integer>> graph = new ArrayList<>();
        int[] indegree = new int[numCourses];
        for (int i = 0; i < numCourses; i++) graph.add(new ArrayList<>());
        for (int[] p : prerequisites) { graph.get(p[1]).add(p[0]); indegree[p[0]]++; }

        Queue<Integer> queue = new LinkedList<>();
        for (int i = 0; i < numCourses; i++) if (indegree[i] == 0) queue.offer(i);

        int[] order = new int[numCourses];
        int idx = 0;
        while (!queue.isEmpty()) {
            int course = queue.poll();
            order[idx++] = course; // 依處理順序記錄
            for (int next : graph.get(course)) if (--indegree[next] == 0) queue.offer(next);
        }
        return idx == numCourses ? order : new int[0]; // 有環則回傳空陣列
    }
}
```

**複雜度**：時間 O(V+E)，空間 O(V+E)。

## #684 Redundant Connection（Medium）

[官方題目](https://leetcode.com/problems/redundant-connection/)

**題意**：一棵樹加上一條多餘的邊形成了圖，找出這條多餘的邊（如果有多個答案，回傳陣列中最後出現的那一條）。

**解題思路**：用並查集依序處理每條邊。一旦發現某條邊的兩端「合併前就已經連通」，這條邊就是造成環的多餘邊。依序處理、找到第一個「合併失敗」的邊，天然滿足「回傳陣列中最後出現的那個」的要求，不需要額外邏輯判斷順序。

```java
class Solution {
    public int[] findRedundantConnection(int[][] edges) {
        int n = edges.length;
        int[] parent = new int[n + 1];
        for (int i = 0; i <= n; i++) parent[i] = i;

        for (int[] e : edges) {
            int r1 = find(parent, e[0]), r2 = find(parent, e[1]);
            if (r1 == r2) return e; // 這條邊會形成環，就是多餘的邊
            parent[r1] = r2;
        }
        return new int[0]; // 題目保證有解，理論上不會執行到這裡
    }
    private int find(int[] parent, int x) {
        if (parent[x] != x) parent[x] = find(parent, parent[x]);
        return parent[x];
    }
}
```

**複雜度**：此版只有路徑壓縮，使用較寬鬆上界為時間 O(n log n)、空間 O(n)（含 parent 與最壞遞迴堆疊）。若再搭配按秩或按大小合併，總時間可保證 O(n·α(n))。

## #261 Graph Valid Tree 與 #323 連通分量

這兩題在 LeetCode 是付費題，但並查集的用法很典型，值得掌握。

**Graph Valid Tree**：一個無向圖是合法的樹，需同時滿足兩個條件：

1. 恰好有 n-1 條邊。
2. 整張圖是連通的（沒有環也沒有分裂成多個部分）。

邊數直接數；用並查集合併每條邊，某條邊兩端「合併前就已經屬於同一集合」就代表有環，直接判定不合法。

```java
class Solution {
    public boolean validTree(int n, int[][] edges) {
        if (edges.length != n - 1) return false; // 邊數不對，直接排除
        int[] parent = new int[n];
        for (int i = 0; i < n; i++) parent[i] = i;
        for (int[] e : edges) {
            int r1 = find(parent, e[0]), r2 = find(parent, e[1]);
            if (r1 == r2) return false; // 已經連通，這條邊會形成環
            parent[r1] = r2;
        }
        return true; // 邊數剛好 n-1 且沒有環，保證是合法的樹
    }

    private int find(int[] parent, int x) {
        if (parent[x] != x) parent[x] = find(parent, parent[x]); // 路徑壓縮
        return parent[x];
    }
}
```

**Number of Connected Components**：初始時每個節點各自是一個分量（n 個），每次成功合併（兩端原本屬於不同集合）就減一，最終剩下的就是答案。也可以用 DFS / BFS 對每個未訪問節點走訪一次、計數走訪次數，複雜度同為線性，兩種解法都該會。

```java
class Solution {
    public int countComponents(int n, int[][] edges) {
        int[] parent = new int[n];
        for (int i = 0; i < n; i++) parent[i] = i;
        int components = n;
        for (int[] e : edges) {
            int r1 = find(parent, e[0]), r2 = find(parent, e[1]);
            if (r1 != r2) { parent[r1] = r2; components--; } // 成功合併，分量數減一
        }
        return components;
    }

    private int find(int[] parent, int x) {
        if (parent[x] != x) parent[x] = find(parent, parent[x]); // 路徑壓縮
        return parent[x];
    }
}
```

## #127 Word Ladder（Hard）

[官方題目](https://leetcode.com/problems/word-ladder/)

**題意**：從 `beginWord` 開始，每次只能改變一個字母，改變後的單字必須在給定單字表中。回傳最短轉換序列的「單字數」，包含起點與終點；不是改變字母的次數。無法到達則回傳 0。例如 `hit → hot → dot → dog → cog` 回傳 5，但實際轉換了 4 次。

**解題思路**：把每個單字看成圖上的一個節點，「只改一個字母就能互相轉換」的兩個單字之間連一條邊。這是**隱式圖**，邊不是題目直接給的，要自己判斷。「最少步數」的訊號直接指向 BFS（無權圖最短路徑）。對目前單字，嘗試把每個位置的字母換成 a-z 的每一種可能，檢查換完後的新字是否在單字表中且還沒被走訪過，是的話加進佇列。

```java
import java.util.*;

class Solution {
    public int ladderLength(String beginWord, String endWord, List<String> wordList) {
        Set<String> wordSet = new HashSet<>(wordList);
        if (!wordSet.contains(endWord)) return 0;

        Queue<String> queue = new LinkedList<>();
        queue.offer(beginWord);
        Set<String> visited = new HashSet<>();
        visited.add(beginWord);
        int steps = 1;

        while (!queue.isEmpty()) {
            int size = queue.size();
            for (int i = 0; i < size; i++) {
                String word = queue.poll();
                if (word.equals(endWord)) return steps;
                char[] chars = word.toCharArray();
                for (int j = 0; j < chars.length; j++) {
                    char original = chars[j];
                    for (char c = 'a'; c <= 'z'; c++) { // 嘗試改變這個位置的每一種字母
                        if (c == original) continue;
                        chars[j] = c;
                        String next = new String(chars);
                        if (wordSet.contains(next) && !visited.contains(next)) {
                            visited.add(next);
                            queue.offer(next);
                        }
                    }
                    chars[j] = original; // 還原，準備嘗試下一個位置
                }
            }
            steps++;
        }
        return 0; // 佇列清空仍未找到，無法轉換
    }
}
```

**複雜度**：時間 O(M²·N)（M 是單字長度，N 是單字表大小，每個單字要嘗試 M 個位置各 26 種字母、每次建立新字串花 O(M)），空間 O(M·N)。

**關鍵洞察**：只要能定義「什麼樣的兩個狀態算相鄰」，任何狀態轉換類問題都能用 BFS 求最少步數。這個抽象能力是圖論題目中最重要的遷移技能。

## #743 Network Delay Time（Medium）

[官方題目](https://leetcode.com/problems/network-delay-time/)

**題意**：n 個節點的有向帶權圖，從節點 k 發出訊號，求訊號傳遞到所有節點所需的時間（也就是到最遠節點的最短路徑），無法到達所有節點則回傳 -1。

**解題思路**：單源最短路徑的標準情境（非負權重），直接套用 Dijkstra：用優先權佇列維護「目前已知距離最短、還沒確定」的節點，每次彈出距離最小的節點並鬆弛它的所有出邊。答案是「所有節點最短距離中的最大值」，有節點沒被訪問到（距離仍是無限大）就代表無法傳到所有節點。

```java
import java.util.*;

class Solution {
    public int networkDelayTime(int[][] times, int n, int k) {
        Map<Integer, List<int[]>> graph = new HashMap<>();
        for (int[] t : times) graph.computeIfAbsent(t[0], x -> new ArrayList<>()).add(new int[]{t[1], t[2]});

        Map<Integer, Integer> dist = new HashMap<>();
        PriorityQueue<int[]> pq = new PriorityQueue<>((a, b) -> Integer.compare(a[0], b[0])); // {距離, 節點}
        pq.offer(new int[]{0, k});

        while (!pq.isEmpty()) {
            int[] cur = pq.poll();
            int d = cur[0], node = cur[1];
            if (dist.containsKey(node)) continue; // 已確定過，過期紀錄跳過
            dist.put(node, d);
            for (int[] edge : graph.getOrDefault(node, Collections.emptyList())) {
                if (!dist.containsKey(edge[0])) pq.offer(new int[]{d + edge[1], edge[0]});
            }
        }
        if (dist.size() != n) return -1; // 有節點無法到達
        return Collections.max(dist.values());
    }
}
```

**複雜度**：時間 O((V+E) log V)，空間 O(V+E)。

**關鍵洞察**：「求到最遠節點的時間」轉換成「求所有最短距離的最大值」是這題唯一需要額外想清楚的地方。Dijkstra 只適用於**非負權重**；有負權重要用 Bellman-Ford。
