# SQL 進階技巧

> 整理自《SQL 達人的工作現場攻略筆記》第 1 部。主軸：把資料表當成**集合**，用 `CASE`、`EXISTS`、`HAVING`、自我連結與視窗函數取代迴圈與變數。

## CASE 技巧

### 在 GROUP BY 重新分類

```sql
SELECT CASE WHEN pop < 100 THEN '小' WHEN pop < 500 THEN '中' ELSE '大' END AS size_class,
       SUM(pop) AS total
FROM   city
GROUP BY CASE WHEN pop < 100 THEN '小' WHEN pop < 500 THEN '中' ELSE '大' END;
```

先把原始欄位轉成「類別」再彙整，免去建一張對照表。注意：SELECT 與 GROUP BY 的 `CASE` 要一致。

### 列轉欄（交叉表）

```sql
SELECT student_id,
       SUM(CASE WHEN subject = '數學' THEN score ELSE 0 END) AS math,
       SUM(CASE WHEN subject = '國文' THEN score ELSE 0 END) AS chinese
FROM   scores
GROUP BY student_id;
```

- 一定要有聚合函式（`SUM`/`MAX`），因為輸出是「每位學生一列」，要把多列壓成一列。
- 只算次數用 `ELSE 0` 搭 `SUM`；要取值或做 `AVG` / `MIN` / `MAX` 用 `ELSE NULL`（或省略 ELSE）。

### UPDATE 要「同時」套用多條規則

```sql
-- 錯：兩條 UPDATE 依序執行，先調過的列又可能被第二條調一次
UPDATE emp SET salary = salary * 0.9 WHERE salary >= 300000;
UPDATE emp SET salary = salary * 1.2 WHERE salary BETWEEN 250000 AND 280000;

-- 對：一個語句、CASE 一次判斷
UPDATE emp
SET salary = CASE WHEN salary >= 300000 THEN salary * 0.9
                  WHEN salary BETWEEN 250000 AND 280000 THEN salary * 1.2
                  ELSE salary END;
```

CASE 讓 UPDATE 能表達「依原值同時調整」，也可用來**互換兩個值**（唯一鍵或主鍵交換可能違反唯一約束）。

### CASE 搭配子查詢做表對照

```sql
SELECT p.name,
       CASE WHEN EXISTS (SELECT 1 FROM stock_a a WHERE a.item = p.item) THEN '○' ELSE '' END AS in_a,
       CASE WHEN EXISTS (SELECT 1 FROM stock_b b WHERE b.item = p.item) THEN '○' ELSE '' END AS in_b
FROM   product p;
```

### CASE 與彙總函數互相巢狀

```sql
-- 一次完成：「每個部門最高薪者的名字」不必拆兩條查詢再 UNION
SELECT dept,
       MAX(CASE WHEN rn = 1 THEN name END) AS top_name
FROM (SELECT dept, name, ROW_NUMBER() OVER (PARTITION BY dept ORDER BY salary DESC) rn FROM emp) t
GROUP BY dept;
```

## EXISTS 與量化

### 述詞與量詞

- **述詞**：回傳真偽的函數（`=`、`LIKE`、`IN`、`EXISTS`…）。
- `EXISTS` 的特別之處：**輸入是「集合」（列的集合）**，其他述詞的輸入是「值」。它是**存在量詞**（∃）。
- SQL 沒有全稱量詞（∀），要靠**雙重否定**：「全部都滿足 P」＝「不存在不滿足 P 的」。

```text
∀x P(x)  ⇔  ¬∃x ¬P(x)
```

### 找「不存在」：缺席名單

```sql
-- 每次會議都該到的人，找出某一次缺席者
SELECT m.name
FROM   members m
WHERE  NOT EXISTS (SELECT 1 FROM attendance a
                   WHERE a.member_id = m.id AND a.meeting_id = 3);
```

### 全稱量化：所有科目都 ≥ 60 分的學生

```sql
-- NOT EXISTS：不存在「分數 < 60」的科目
SELECT DISTINCT s.student_id
FROM   scores s
WHERE  NOT EXISTS (SELECT 1 FROM scores s2
                   WHERE s2.student_id = s.student_id AND (s2.score < 60 OR s2.score IS NULL));
```

以上僅檢查已存在的成績列，未檢查是否修齊必修科目；student_id 假設非 NULL。

每科門檻不同（數學 ≥ 80、國文 ≥ 60，其他不管）：

```sql
SELECT DISTINCT s.student_id FROM scores s
WHERE  NOT EXISTS (
  SELECT 1 FROM scores s2
  WHERE  s2.student_id = s.student_id
    AND ((s2.subject = '數學' AND (s2.score < 80 OR s2.score IS NULL))
      OR (s2.subject = '國文' AND (s2.score < 60 OR s2.score IS NULL))));
```

> 轉換口訣：`NOT (P AND Q)` ＝ `NOT P OR NOT Q`（德摩根）。

### HAVING vs NOT EXISTS

| | HAVING（集合導向） | NOT EXISTS（述詞邏輯） |
|---|---|---|
| 寫法 | `HAVING COUNT(*) = SUM(CASE WHEN 條件 THEN 1 ELSE 0 END)` | 雙重否定 |
| 可讀性 | 較好 | 較難讀 |
| 效能 | 要完整彙整 | 可能使用反連結，效能依執行計畫與資料分布判斷 |

### 沿「欄」方向量化

要判斷「一列裡這幾個欄位全是 NULL」：`ALL` 做不到，要寫成

```sql
WHERE COALESCE(c1, c2, c3) IS NULL         -- 三欄全 NULL
WHERE c1 = 1 OR c2 = 1 OR c3 = 1           -- 任一欄為 1；或 1 IN (c1, c2, c3)
```

## HAVING 與集合思維

### WHERE 判元素，HAVING 判集合

| | 判斷對象 |
|---|---|
| `WHERE` | 單一列（集合的元素） |
| `HAVING` | 整個群組（集合本身） |

**一個實體對應一列** → 它是元素 → `WHERE`；**對應多列** → 它是集合 → `HAVING`。

### 特性函數

`CASE WHEN 條件 THEN 1 ELSE 0 END` 為每個元素打上 0/1 旗標；數學上特性函數用來**定義集合**。配合 `SUM` / `COUNT` 就能描述集合的性質：

```sql
-- 全員都交了報告的系所
SELECT dept FROM reports GROUP BY dept
HAVING COUNT(*) = COUNT(submit_date);

-- 至少 75% 的學生 ≥ 80 分的班級
SELECT class FROM results GROUP BY class
HAVING COUNT(*) * 0.75 <= SUM(CASE WHEN score >= 80 THEN 1 ELSE 0 END);

-- 全部成員都待命的小隊（NULL 也視為未待命）
SELECT team_id FROM crew GROUP BY team_id
HAVING COUNT(*) = SUM(CASE WHEN status = '待命' THEN 1 ELSE 0 END);
```

⚠️ 比較兩個子集合的平均時，不是該類的列要用 `NULL`（不是 `ELSE 0`），否則「沒有資料」被算成 0 分。

### 沒有 GROUP BY 的 HAVING

整張表視為一個群組（等同 `GROUP BY ()`）：

```sql
-- 編號 1..N 是否有缺號：列數 ≠ 最大值（假設 seq 是唯一、非 NULL 的正整數）
SELECT '有缺號' FROM tickets HAVING COUNT(*) <> MAX(seq);
-- 起點不一定是 1：COUNT(*) <> MAX(seq) - MIN(seq) + 1
```

### 眾數

```sql
SELECT salary, COUNT(*) AS cnt FROM alumni GROUP BY salary
HAVING COUNT(*) >= ALL (SELECT COUNT(*) FROM alumni GROUP BY salary);   -- >= 讓並列都出現
```

不需要排序、逐列比較、變數記最大次數（control break）。

### 重複與「是否有 NULL」

```sql
HAVING COUNT(col) > COUNT(DISTINCT col)    -- 組內有重複值
HAVING COUNT(*) = COUNT(col)              -- 組內沒有 NULL
```

### 關聯式除法：購物籃分析

「買齊了指定商品」的客戶（可以另外多買）：

```sql
SELECT customer_id
FROM   purchases
WHERE  item IN ('牛奶', '麵包', '雞蛋')              -- 先過濾到指定集合
GROUP BY customer_id
HAVING COUNT(DISTINCT item) = 3;                    -- 三種都有
```

- 只用 `WHERE item IN (...)` 是錯的：它只代表「買了其中一種」。
- **有餘數的除法**：如上，多買的商品被 `WHERE` 先濾掉，所以不影響。
- **嚴格除法**（恰好這三種商品，可重複購買，但不能有其他商品或 NULL）：

```sql
SELECT customer_id
FROM purchases
GROUP BY customer_id
HAVING COUNT(DISTINCT item) = 3
   AND SUM(CASE WHEN item IN ('牛奶', '麵包', '雞蛋') THEN 0 ELSE 1 END) = 0;
```

## 自我連結

### 排列與組合

```sql
-- 重複排列：笛卡兒乘積
SELECT a.name, b.name FROM product a CROSS JOIN product b;
-- 排列：不能自己配自己
... WHERE a.name <> b.name
-- 組合：(A,B) 與 (B,A) 只留一個
... WHERE a.name < b.name
```

### 刪除重複列

```sql
-- 每組重複只留 id 最小的那一列（有列識別碼時）
DELETE FROM product p
WHERE  EXISTS (SELECT 1 FROM product q
               WHERE q.name = p.name AND q.id < p.id);
-- MySQL 不能在 DELETE 的子查詢引用同一張表，改用 JOIN 寫法：
-- DELETE p FROM product p JOIN product q ON q.name = p.name AND q.id < p.id;
```

### 找「Key 相同、其他欄位卻不一致」的資料

```sql
SELECT a.id, a.name, a.addr, b.addr
FROM   customer a JOIN customer b ON a.id = b.id AND a.addr <> b.addr;
```

## 外部連結與列欄轉換

### 列轉欄：三種寫法

1. 以主表為準，對每一門課做一次 `LEFT JOIN`（可讀但冗長）。
2. 用純量子查詢取代連結（簡單、但每欄一次子查詢）。
3. **巢狀 `CASE` + 彙總**（推薦，只掃一次表）。

### 欄轉列

```sql
SELECT id, child1 AS child FROM family WHERE child1 IS NOT NULL
UNION ALL
SELECT id, child2 FROM family WHERE child2 IS NOT NULL
UNION ALL
SELECT id, child3 FROM family WHERE child3 IS NOT NULL;
-- 要連沒有小孩的員工也保留：先 SELECT 員工，再 LEFT JOIN 上面這個結果
```

### 注意

- 連結像乘法，一對多會重複一側的列，多對多則產生匹配列數的乘積。
- 巢狀表側：要連兩個一對多的表時，錯誤的做法是依序連兩次主表（會相乘）；正確做法是各自彙整後再連。
- 外部連結也是集合運算的另一種寫法：`FULL OUTER JOIN` 保留兩側未匹配列，但不等於 UNION；`LEFT JOIN ... WHERE b.key IS NULL` ＝ 差集。

## 數列操作

### 產生連續編號

```sql
-- 小表 digits(0..9)，兩張表產生 0..99；三張表產生 0..999
SELECT d1.d + d2.d * 10 AS n
FROM   digits d1 CROSS JOIN digits d2;
```

現代 DBMS 可直接用遞迴 CTE、PostgreSQL `generate_series`。

### 找缺號

```sql
SELECT n
FROM   sequence_table s                    -- 預先產生的 1..N
WHERE  n BETWEEN (SELECT MIN(seq) FROM tickets) AND (SELECT MAX(seq) FROM tickets)
  AND  NOT EXISTS (SELECT 1 FROM tickets t WHERE t.seq = s.n);
```

### 找連續的空位（坐得下 N 個人嗎）

```sql
-- NOT EXISTS：起訖點相隔 N-1，且區間內沒有非空位
SELECT s1.seat AS start_seat, s2.seat AS end_seat
FROM   seats s1, seats s2
WHERE  s2.seat = s1.seat + (3 - 1)
  AND  NOT EXISTS (SELECT 1 FROM seats s3
                   WHERE  s3.seat BETWEEN s1.seat AND s2.seat AND (s3.status <> '空' OR s3.status IS NULL));

-- 視窗函數：只留空位，往後看第 N-1 列
SELECT seat AS start_seat, end_seat
FROM  (SELECT seat,
              MAX(seat) OVER (ORDER BY seat ROWS BETWEEN 2 FOLLOWING AND 2 FOLLOWING) AS end_seat
       FROM seats WHERE status = '空') t
WHERE end_seat - seat = 2;
```

換排：視窗函數加 `PARTITION BY row_id`；另一版本加 `s2.row_id = s1.row_id`，子查詢加 `s3.row_id = s1.row_id`。此 NOT EXISTS 範例假設座位編號完整且唯一；允許缺號時，還須確認區間內有 N 個座位。

### 單調增加：gap-and-islands

找「連續上漲」的區間：

```sql
-- 1. 標上漲日，並對全部日期編號
WITH t AS (
  SELECT d, price,
         CASE WHEN price > LAG(price) OVER (ORDER BY d) THEN 1 ELSE 0 END AS up,
         ROW_NUMBER() OVER (ORDER BY d) AS rn
  FROM   stock
),
-- 2. 只留上漲日，再對它們編號；rn 與上漲序號的差，在連續上漲區間內是常數
g AS (
  SELECT d, rn - ROW_NUMBER() OVER (ORDER BY d) AS grp
  FROM   t WHERE up = 1
)
SELECT MIN(d) AS start_date, MAX(d) AS end_date
FROM   g GROUP BY grp;
```

核心：連續的整數減去連續的序號會是同一個數，用它當群組鍵。

## 宣告式思維與 NULL 設計

### 從程序到宣告型的七項法則

| # | 法則 | 重點 |
|---|---|---|
| 1 | 用 `CASE` **式**取代 `IF` **句** | CASE 回傳一個值，到處都能放 |
| 2 | 迴圈 → `GROUP BY` ＋ 視窗函數 | 游標逐筆累加是反模式 |
| 3 | 資料表的列沒有順序 | 不依賴順序；視圖不放 `ORDER BY` |
| 4 | 把資料表看成集合 | 自我連結＝換別名就變另一個集合 |
| 5 | `EXISTS` 與量化 | 全稱量化靠雙重否定 |
| 6 | 理解 `HAVING` 的真正價值 | 對集合設條件 |
| 7 | 不要畫四邊形，畫圓形 | 用文氏圖（巢狀集合）思考，不是流程圖 |

### GROUP BY 與「存在階層」

彙整後為什麼不能參照原始欄位？因為階層不同：`GROUP BY` 之後，每一列代表**一個集合**，而原始欄位屬於**元素**的層級。要在結果中顯示「各團最高齡者」之類的元素，要回到元素層級（關聯子查詢、視窗函數、或先找出極值再連結）。**單元集合（只有一個元素）也是集合**。

### 排除 NULL 的實務做法

NULL 的七宗罪：三值邏輯陷阱、聚合忽略、`NOT IN` 空結果、排序位置不一、與字串運算、索引與效能不一致、與空字串的方言差異。

策略：**依業務語意決定是否允許 NULL，不要用假資料取代未知值。**

| 資料種類 | 做法 |
|---|---|
| 代碼 | 指派「未代碼化」的代碼（如 `0 = 未知`、`9 = 不適用`，用字母如 `XXXXX`，別用看起來正常的 `99999`） |
| 名稱 | 預設「無名氏」、`UNKNOWN` |
| 數值 | 確實為零才存 0；未知值保留 NULL |
| 日期（期限） | 無期限可用 NULL 或明確狀態；極值日期須確認型別範圍與業務語意 |
| 日期（真的不知道） | 保留 NULL（生日、歷史事件年份） |

另一種做法：把「可能不存在」的屬性放進**獨立子表**（一對零或一），沒有資料就沒有列，查詢用 `LEFT JOIN`。
