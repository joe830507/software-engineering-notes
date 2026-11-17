# 函式、分組、子查詢與 CASE

## 常用函式

> 函式因資料庫而異，以下以 MySQL / PostgreSQL 為主；標準 SQL 的 `CAST`、`COALESCE`、`CASE`、`EXTRACT` 最可攜。

### 字串

| 需求 | MySQL | PostgreSQL / 標準 |
|---|---|---|
| 長度 | `CHAR_LENGTH(s)`（`LENGTH` 是位元組數） | `CHAR_LENGTH(s)` |
| 串接 | `CONCAT(a, b)` | `a \|\| b` 或 `CONCAT` |
| 子字串 | `SUBSTRING(s, 2, 3)` | `SUBSTRING(s FROM 2 FOR 3)` |
| 找位置 | `LOCATE('x', s)` | `POSITION('x' IN s)` |
| 取代 | `REPLACE(s, 'a', 'b')` | 同左 |
| 去空白 | `TRIM(s)` | 同左 |
| 大小寫 | `UPPER` / `LOWER` | 同左 |

- 字串裡的單引號用兩個單引號跳脫：`'It''s'`。
- 型別 `CHAR(n)` 固定長度（不足補空白）、`VARCHAR(n)` 變動長度、`TEXT` 大量文字。
- 字串太長：嚴格模式報錯，非嚴格模式靜默截斷。

### 數值

```sql
ROUND(3.14159, 2)      -- 3.14，四捨五入
CEIL(2.1)  FLOOR(2.9)  -- 進位 / 捨去
TRUNCATE(2.99, 1)      -- MySQL 截斷；PostgreSQL 用 TRUNC
MOD(10, 3)  POWER(2,10)  ABS(-5)  SIGN(-5)
```

- 整數相除在不同 DBMS 結果不同（PostgreSQL `5/2 = 2`，MySQL `5/2 = 2.5000`）。要小數時明確轉型。

### 日期與時間

```sql
CURRENT_DATE, CURRENT_TIMESTAMP, NOW()
CAST('2026-11-17' AS DATE)
EXTRACT(YEAR FROM order_date)
DATE_ADD(d, INTERVAL 7 DAY)      -- MySQL；PostgreSQL: d + INTERVAL '7 days'
DATEDIFF(d1, d2)                 -- MySQL，回傳天數；PostgreSQL 直接 d1 - d2
LAST_DAY(d)                      -- MySQL 月底
STR_TO_DATE('11/17/2026', '%m/%d/%Y')   -- 非預設格式
```

- 預設日期格式 `YYYY-MM-DD`，時間 `HH:MM:SS`。
- 時間欄位要注意**時區**：儲存用 UTC，顯示時再轉換。MySQL `TIMESTAMP` 會轉時區，`DATETIME` 不會。
- 時間範圍用半開區間：`>= '2026-11-17' AND < '2026-11-18'`。

### 型別轉換

```sql
CAST(col AS DECIMAL(10,2))   CAST('123' AS UNSIGNED)
```

隱含轉換（字串欄位對數字比較）可能使索引失效，**轉換要加在常數那一側**。

## 彙整與分組

### 彙整函式

`COUNT`、`SUM`、`AVG`、`MIN`、`MAX`。共通規則：

- **忽略 NULL**（`COUNT(*)` 例外）。
- 空集合：`COUNT` 回 0，其餘回 NULL。
- 參數可以是運算式：`SUM(price * qty)`。
- `COUNT(DISTINCT col)` 算不重複值。

```sql
-- 沒有 GROUP BY：整張表視為一個群組（隱性分組）
SELECT COUNT(*), AVG(amount), MAX(amount) FROM payment;
```

### GROUP BY

```sql
SELECT customer_id, YEAR(payment_date) AS y, SUM(amount) AS total
FROM   payment
GROUP BY customer_id, YEAR(payment_date)     -- 多欄、也可依運算式
ORDER BY total DESC;
```

**SELECT 清單裡的欄位，要嘛在 `GROUP BY`，要嘛被彙整函式包住**。把沒有分組的欄位放進 `SELECT` 是常見錯誤（MySQL 的 `ONLY_FULL_GROUP_BY` 會擋；舊版或關閉時會回傳不確定的值）。

小計與總計：

```sql
GROUP BY dept, job WITH ROLLUP          -- MySQL
GROUP BY ROLLUP (dept, job)             -- 標準 / PostgreSQL / Oracle
```

### WHERE 與 HAVING

```sql
SELECT dept, AVG(salary)
FROM   emp
WHERE  active = 1                  -- 先過濾列（可用索引、減少彙整量）
GROUP  BY dept
HAVING AVG(salary) > 50000;        -- 再過濾群組（針對彙總結果）
```

- 針對**列**的條件放 `WHERE`；針對**彙總結果**的條件才放 `HAVING`。
- 執行順序：`WHERE → GROUP BY → HAVING`。
- `GROUP BY` 切出的部分集合在數學上叫**分割（partition）**。

## 子查詢與 CTE

### 子查詢的分類

| 分法 | 類型 |
|---|---|
| 回傳形狀 | 純量（一列一欄）、一欄多列、多欄多列（表） |
| 是否參照外圍 | **非關聯**（可單獨執行）、**關聯**（引用外層欄位，概念上對外層每列執行一次） |

### 非關聯子查詢

```sql
-- 純量：與最大值比較
WHERE amount = (SELECT MAX(amount) FROM payment)

-- IN：成員
WHERE customer_id IN (SELECT customer_id FROM payment WHERE amount > 10)

-- ALL / ANY：與集合內每一個 / 任一個比較
WHERE salary > ALL (SELECT salary FROM emp WHERE dept = 'QA')
WHERE salary > ANY (SELECT salary FROM emp WHERE dept = 'QA')

-- 多欄
WHERE (dept, job) IN (SELECT dept, job FROM emp WHERE salary > 80000)
```

⚠️ `NOT IN` 子查詢結果含 NULL 時必定回傳空，詳見〈基礎查詢與篩選〉。`x = ANY (…)` 等於 `IN`；`<> ALL (…)` 等於 `NOT IN`。

### 關聯子查詢與 EXISTS

```sql
-- 有訂單的客戶
SELECT c.* FROM customer c
WHERE EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id);

-- 沒有訂單的客戶
WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id)

-- UPDATE / DELETE 也能用
UPDATE customer c SET last_order = (SELECT MAX(order_date) FROM orders o WHERE o.customer_id = c.id);
```

- `EXISTS` 只回傳 true / false，不回傳 unknown，找到一筆就停，與 `IN` 可能使用相同計畫，不能保證較快，且沒有 NULL 陷阱。
- `SELECT 1` 或 `SELECT *` 都行，`EXISTS` 不看清單內容。

### 子查詢的三種好用情境

1. **當成資料來源**（放在 FROM，衍生表）。
2. **打造資料庫裡沒有的資料**：把分組、區間用 `UNION ALL` 做成虛擬表，再連結。
3. **任務導向：把分組與顯示分開**：先在子查詢彙整，外層再連結取名稱、做格式。

子查詢也可放在 `SELECT` 清單（純量）、`ORDER BY`、`INSERT ... VALUES`。

### CTE（WITH）

```sql
WITH monthly AS (
  SELECT customer_id, DATE_FORMAT(payment_date, '%Y-%m') AS ym, SUM(amount) AS total
  FROM payment GROUP BY customer_id, ym
),
ranked AS (
  SELECT *, RANK() OVER (PARTITION BY ym ORDER BY total DESC) AS rk FROM monthly
)
SELECT * FROM ranked WHERE rk <= 3;
```

- 為子查詢取名，可重複引用、由上往下閱讀，可讀性遠勝多層巢狀。
- 遞迴 CTE（`WITH RECURSIVE`）用來走階層、產生數列。

```sql
WITH RECURSIVE nums(n) AS (
  SELECT 1
  UNION ALL
  SELECT n + 1 FROM nums WHERE n < 10
)
SELECT n FROM nums;
```

## CASE 運算式

### 兩種寫法

```sql
-- 搜尋式：可放任意條件（含 IS NULL）
CASE WHEN score >= 90 THEN 'A'
     WHEN score >= 60 THEN 'B'
     ELSE 'C' END

-- 簡單式：只比對相等（比不到 NULL）
CASE grade WHEN 'A' THEN 4 WHEN 'B' THEN 3 ELSE 0 END
```

- CASE 是**運算式**，會回傳一個值，所以能出現在 `SELECT`、`WHERE`、`GROUP BY`、`ORDER BY`、聚合函式參數、`UPDATE SET`。
- 由上往下，第一個成立就回傳；沒有 `ELSE` 又沒有條件成立時回 NULL。
- 各分支的回傳型別要一致。

### 常見用法

**列轉欄（pivot）**：

```sql
SELECT dept,
       SUM(CASE WHEN gender = 'M' THEN 1 ELSE 0 END) AS male,
       SUM(CASE WHEN gender = 'F' THEN 1 ELSE 0 END) AS female
FROM emp GROUP BY dept;
```

**避免除以零**：`CASE WHEN y = 0 THEN NULL ELSE x / y END`，或 `x / NULLIF(y, 0)`。

**依條件更新**（一個語句、一次掃描）：

```sql
UPDATE product
SET price = CASE WHEN price >= 1000 THEN price * 0.9
                 WHEN price <  500  THEN price * 1.1
                 ELSE price END;
```

**處理 NULL**：`CASE WHEN col IS NULL THEN '未填' ELSE col END` ＝ `COALESCE(col, '未填')`。

**分級後彙整**：

```sql
SELECT CASE WHEN age IS NULL THEN '未知' WHEN age < 20 THEN '未滿 20 歲' WHEN age < 60 THEN '20 至 59 歲' ELSE '60 歲以上' END AS grp,
       COUNT(*)
FROM person
GROUP BY CASE WHEN age IS NULL THEN '未知' WHEN age < 20 THEN '未滿 20 歲' WHEN age < 60 THEN '20 至 59 歲' ELSE '60 歲以上' END;
-- 新版 DBMS（MySQL、PostgreSQL）也可寫 GROUP BY grp（別名）
```

## 面試速查

**Q：子查詢與 JOIN 哪個快？**
不一定。最佳化器常把子查詢攤平成 JOIN；以實際的執行計畫為準。`IN` 子查詢通常可改成 `EXISTS`，需要去重的 JOIN 可改成 `EXISTS` 避免 `DISTINCT`。

**Q：關聯子查詢會不會很慢？**
概念上對外層每列執行一次，最差是 O(n×m)；有索引、或最佳化器改寫成半結合（semi join）時很快。無法優化時考慮改用視窗函數或先彙整再結合。

**Q：為什麼 `SELECT` 裡的非彙整欄位必須放進 `GROUP BY`？**
分組後每組只剩一列，沒有分組的欄位在組內有多個值，不知道該取哪一個。要取「組內最高那一筆」的其他欄位，用視窗函數或關聯子查詢。
