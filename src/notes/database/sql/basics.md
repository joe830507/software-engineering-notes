# SQL 基礎查詢與篩選

> 整理自《SQL 學習手冊》與《SQL 達人的工作現場攻略筆記》。範例以標準 SQL 為主，方言差異（MySQL / PostgreSQL / Oracle）會特別標註。

## 核心觀念

### 關聯式模型與 SQL

- **資料表**由列（row）與欄（column）組成；**主鍵**唯一識別一列，**外來鍵**指向另一張表的主鍵。
- **正規化**：把重複資料拆到不同表，用結合（join）還原。避免更新異常，代價是查詢要多一次 join。
- SQL 是**宣告式（非程序式）**語言：只描述「要什麼資料」，由最佳化器決定「怎麼取」。
- SQL 敘述兩大類：
  - **DDL**（定義結構）：`CREATE`、`ALTER`、`DROP`
  - **DML**（操作資料）：`SELECT`、`INSERT`、`UPDATE`、`DELETE`

### 資料表是集合，沒有順序

- 關聯（表）是**集合**：列沒有天生順序，也不該依賴順序。沒寫 `ORDER BY` 時，結果順序不保證。
- 不要在視圖（View）裡放 `ORDER BY`、不要依賴 `ROWNUM` 之類的內建列號。
- 想像成「裝玩具的箱子」而不是「依序歸檔的檔案夾」。換個別名，同一張表就能當成另一個集合（自我連結）。

### 程序式 vs 宣告式

| 程序式（Java、C） | SQL 的對應 |
|---|---|
| `if / else` 陳述句 | `CASE` **運算式**（會回傳一個值） |
| 迴圈累加、control break | `GROUP BY`、視窗函數 |
| 依序處理每一列 | 對整個集合下條件 |
| 流程圖（方框與箭頭） | 文氏圖（圓形） |

## SELECT 的結構

### 六個子句與邏輯處理順序

```sql
SELECT   dept, COUNT(*) AS cnt          -- 5
FROM     employees e                     -- 1
JOIN     departments d ON ...            -- 1（JOIN 屬於 FROM）
WHERE    e.salary > 30000                -- 2
GROUP BY dept                            -- 3
HAVING   COUNT(*) >= 3                   -- 4
ORDER BY cnt DESC                        -- 6
LIMIT    10;                             -- 7
```

**寫的順序 ≠ 執行的邏輯順序**：`FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY → LIMIT`。

結論：

- `WHERE` 不能用 `SELECT` 裡定義的別名（還沒執行到）；`ORDER BY` 可以（已執行完 `SELECT`）。MySQL 的 `GROUP BY` / `HAVING` 允許別名，但這是方言，標準 SQL 不行。
- `WHERE` 在分組**前**過濾列；`HAVING` 在分組**後**過濾群組。

### SELECT 清單與別名

```sql
SELECT 1 + 1;                                  -- 沒有 FROM 也能查（Oracle 要 FROM dual）
SELECT first_name AS fname, price * 1.05 AS price_with_tax FROM product;
SELECT DISTINCT dept FROM employees;           -- 去除重複列
```

- 清單可放欄位、常數、運算式、函式、純量子查詢。
- `DISTINCT` 需要排序或雜湊去重，大表要有代價；能用 `EXISTS` 避免重複就不要靠 `DISTINCT`。
- `SELECT *` 只適合臨時查詢；正式程式要列出欄位（欄位增減時不會悄悄壞掉，也少傳資料）。

### FROM：四種「表」

FROM 後面不只是永久表，也可以是：

1. 永久表（`CREATE TABLE`）
2. 衍生表（子查詢產生的臨時結果，必須有別名）
3. 暫時表
4. 虛擬表（View）

### ORDER BY

```sql
ORDER BY dept ASC, salary DESC      -- 多欄、各自升降冪（預設 ASC）
ORDER BY price * qty DESC           -- 可依運算式
ORDER BY 2 DESC                     -- 欄位位置：不建議，改欄位清單就壞
```

- **NULL 排哪裡**因 DBMS 而異：PostgreSQL 視為最大（ASC 在最後）；MySQL 視為最小（ASC 在最前）。PostgreSQL 可寫 `NULLS FIRST / LAST`；MySQL 用 `ORDER BY col IS NULL, col`。不要依賴預設。

## WHERE 篩選

### 條件的種類

```sql
WHERE status = 'A'                       -- 相等
WHERE status <> 'A'                      -- 不等（也可 !=）
WHERE price BETWEEN 100 AND 200          -- 範圍，頭尾都包含
WHERE order_date >= '2026-01-01' AND order_date < '2027-01-01'  -- 日期用半開區間
WHERE dept IN ('RD', 'QA')               -- 成員
WHERE name LIKE 'A%'                     -- 比對：% 任意長度，_ 一個字元
```

- `BETWEEN` 兩端都含，對含時間的欄位容易漏掉最後一天，**時間欄位建議用 `>=` 加 `<`**。
- 比對 `LIKE '%abc'` 或 `'%abc%'` 用不到 B-tree 索引；只有前方一致 `'abc%'` 可以。
- 複雜比對可用正規表示式（MySQL `REGEXP`、PostgreSQL `~`）。

### AND / OR / NOT 與括號

```sql
-- AND 比 OR 優先，容易寫錯
WHERE a = 1 OR b = 2 AND c = 3        -- 等於 a=1 OR (b=2 AND c=3)
WHERE (a = 1 OR b = 2) AND c = 3      -- 不確定時一律加括號
```

### 刪除與更新前先 SELECT

`DELETE` / `UPDATE` 的 `WHERE` 與 `SELECT` 相同。習慣：先把 `DELETE` 改寫成 `SELECT` 確認列數與內容，再執行。

## NULL 與三值邏輯

### NULL 是什麼

- NULL 不是值，而是「**這裡沒有值**」的標記，可帶有型別，也不等於 0 或空字串。
- 兩種語意：**未知**（有，但現在不知道）與**不適用**（根本沒意義）。標準 SQL 只有一種 NULL，語意需自行在設計時區分。
- 任何比較碰到 NULL 都是 **unknown**，包含 `NULL = NULL`、`NULL <> 1`。所以要用 `IS NULL` / `IS NOT NULL`。

```sql
WHERE col = NULL        -- 永遠選不到東西
WHERE col IS NULL       -- 正確
WHERE col IS DISTINCT FROM 20   -- 標準 / PostgreSQL：NULL 當成可比較的值
WHERE NOT (col <=> 20)          -- MySQL 的 NULL 安全等於
```

### 三值邏輯

`WHERE` 只保留結果為 **true** 的列，false 與 unknown 都被丟掉。

| AND | t | u | f |
|---|---|---|---|
| **t** | t | u | f |
| **u** | u | u | f |
| **f** | f | f | f |

| OR | t | u | f |
|---|---|---|---|
| **t** | t | t | t |
| **u** | t | u | u |
| **f** | t | u | f |

`NOT unknown` 還是 unknown。口訣：AND 裡 `false > unknown > true`；OR 裡 `true > unknown > false`。

### 常見陷阱

| 陷阱 | 說明 |
|---|---|
| 排中律不成立 | `WHERE age = 20 OR age <> 20` 不會包含 `age` 是 NULL 的列 |
| `NOT BETWEEN` 漏 NULL | NULL 既不在範圍內，也不在範圍外 |
| 簡單 `CASE` 比不到 NULL | `CASE x WHEN NULL THEN ...` 永遠不成立，要用 `CASE WHEN x IS NULL` |
| **`NOT IN` 遇到 NULL** | 子查詢結果含 NULL 時，整個查詢**必定回傳空** |
| `ALL` 遇到 NULL | `x < ALL(...)` 展開成 AND，含 unknown 就不可能為 true |
| 空集合的聚合 | `SUM`、`AVG`、`MIN`、`MAX` 對空集合回傳 NULL（`COUNT` 回 0） |
| 字串連結 | `'abc' || NULL` 得 NULL；`CONCAT('a', NULL)` 也是 NULL。Oracle 例外：把空字串視為 NULL |

`NOT IN` 的展開（為什麼是空的）：

```text
age NOT IN (22, NULL)
= NOT (age = 22 OR age = NULL)
= age <> 22 AND age <> NULL      -- 後半是 unknown
= unknown / false，永遠不會是 true
```

### 處理 NULL 的工具

```sql
COALESCE(a, b, 0)         -- 回傳第一個非 NULL
NULLIF(a, b)              -- a = b 時回 NULL，否則回 a
x / NULLIF(y, 0)          -- 避免除以零
```

- **最根本的防禦**：欄位盡可能 `NOT NULL`，讓世界回到二值邏輯。
- `COUNT(*)` 算所有列；`COUNT(col)` 只算 `col` 非 NULL 的列。

## 面試速查

### 速答

**Q：`WHERE` 和 `HAVING` 差在哪？**
`WHERE` 在分組前逐列過濾，不能用彙總函式；`HAVING` 在分組後過濾群組，可用彙總函式。能寫在 `WHERE` 的條件不要放 `HAVING`，因為先過濾能減少排序與彙整的量。

**Q：為什麼 `NOT IN` 子查詢有 NULL 會查不到資料？**
`NOT IN` 展開成多個 `<>` 以 AND 連結，其中一個是 `<> NULL` → unknown，AND 裡有 unknown 就不可能是 true。改用 `NOT EXISTS`，或在子查詢加 `IS NOT NULL`。

**Q：`COUNT(*)`、`COUNT(1)`、`COUNT(col)` 差別？**
`COUNT(*)` 與 `COUNT(1)` 都算列數（效能無差別）；`COUNT(col)` 不算該欄為 NULL 的列；`COUNT(DISTINCT col)` 算不重複的非 NULL 值。

**Q：`DELETE`、`TRUNCATE`、`DROP` 差別？**
`DELETE` 是 DML，可帶 `WHERE`、可 rollback、會逐列記錄；`TRUNCATE` 清空整張表，速度快、通常不能帶條件，多數 DBMS 隱含提交（PostgreSQL 可在交易中 rollback）；`DROP` 連表結構都刪掉。
