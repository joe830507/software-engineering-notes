# 視窗函數

> 視窗函數（Window Function，書中稱分析函式）：在**不減少列數**的前提下，對「一組相關列」做計算。MySQL 8.0+、PostgreSQL、Oracle、SQL Server 都支援。

## 核心概念

### 為什麼需要

`GROUP BY` 會把多列壓成一列；想同時看到「明細」與「彙總」就很麻煩（要自我連結或關聯子查詢）。視窗函數保留每一列，並在旁邊附上「這一列所屬視窗」的計算結果。

```sql
SELECT name, dept, salary,
       AVG(salary) OVER (PARTITION BY dept) AS dept_avg,       -- 部門平均
       salary - AVG(salary) OVER (PARTITION BY dept) AS diff   -- 與部門平均的差
FROM   emp;
```

### OVER 子句三個零件

```sql
函數() OVER (
  PARTITION BY 分組欄位       -- 切成幾個視窗（省略 = 整張表一個視窗）
  ORDER BY 排序欄位           -- 視窗內的順序
  ROWS BETWEEN ... AND ...    -- 框架：實際參與計算的列範圍
)
```

| 零件 | 作用 | 類比 |
|---|---|---|
| `PARTITION BY` | 把表切成互不重疊的類 | 像 `GROUP BY`，但不壓縮列 |
| `ORDER BY` | 視窗內排序 | 決定「前一列」「下一列」「名次」 |
| 框架 | 計算範圍 | 累計、移動平均 |

### 三種功能

1. **只有 `PARTITION BY`**：分類彙整（每列附上組內合計、平均、占比）。
2. **只有 `ORDER BY`**：排序相關（名次、累計、前後列）。
3. **兩者併用 + 框架**：分組後在組內排序並取範圍。

### 內部其實是排序

視窗函數的成本主要在排序；`PARTITION BY` 與 `ORDER BY` 的欄位若與索引順序一致，可省掉排序。

## 排名函式

### ROW_NUMBER / RANK / DENSE_RANK

| 函式 | 同分時 | 範例（分數 100, 100, 90） |
|---|---|---|
| `ROW_NUMBER()` | 不並列，給不同號碼，同分次序未定 | 1, 2, 3 |
| `RANK()` | 並列同名次，**後面跳號** | 1, 1, 3 |
| `DENSE_RANK()` | 並列同名次，**不跳號** | 1, 1, 2 |

```sql
SELECT name, score,
       ROW_NUMBER() OVER (ORDER BY score DESC) AS rn,
       RANK()       OVER (ORDER BY score DESC) AS rk,
       DENSE_RANK() OVER (ORDER BY score DESC) AS drk
FROM   exam;
```

「前 N 名」用哪個？看語意：要嚴格 N 筆用 `ROW_NUMBER`，並列者都要留用 `RANK` / `DENSE_RANK`。

### 每組取前 N 名（最常考）

視窗函數**不能直接寫在 `WHERE`**（執行順序在 `WHERE` 之後），要包一層：

```sql
SELECT *
FROM (
  SELECT dept, name, salary,
         ROW_NUMBER() OVER (PARTITION BY dept ORDER BY salary DESC) AS rn
  FROM   emp
) t
WHERE rn <= 3;           -- 每部門薪水前三名
```

### 沒有視窗函數時的排名

自我非等值連結：「比我分數高的人有幾個，加 1 就是我的名次」。

```sql
SELECT a.name, a.score,
       (SELECT COUNT(*) FROM exam b WHERE b.score > a.score) + 1 AS rk
FROM   exam a;
```

這其實是「遞迴集合」的概念（每一圈比外一圈多包含一個元素）。現在直接用 `RANK()`。

## 報表函式

### 把聚合函式放進 OVER

```sql
SELECT month, amount,
       SUM(amount) OVER ()                         AS total,       -- 總計與明細並列
       ROUND(amount * 100.0 / NULLIF(SUM(amount) OVER (), 0), 1) AS pct,      -- 占比
       MAX(amount) OVER ()                         AS max_amt,
       CASE WHEN amount = MAX(amount) OVER () THEN '最高'
            WHEN amount = MIN(amount) OVER () THEN '最低' END AS flag
FROM   sales;
```

### 分頁時一併取得總筆數

```sql
SELECT id, name, COUNT(*) OVER () AS total_rows
FROM   product
ORDER BY id
LIMIT 20 OFFSET 40;
```

一次查詢同時拿到「這一頁的資料」與「總筆數」，省掉另一個 `COUNT(*)`（`COUNT(*) OVER ()` 在 `LIMIT` 之前算，所以是全部筆數）。

## 框架與前後列

### 框架語法

```text
ROWS  BETWEEN <起點> AND <終點>      -- 依「列數」
RANGE BETWEEN <起點> AND <終點>      -- 依「值的範圍」（如日期差）

起點/終點：UNBOUNDED PRECEDING | n PRECEDING | CURRENT ROW | n FOLLOWING | UNBOUNDED FOLLOWING
```

```sql
-- 累計
SUM(amount) OVER (ORDER BY d ROWS UNBOUNDED PRECEDING)

-- 移動平均（前一列、當列、後一列）
AVG(amount) OVER (ORDER BY d ROWS BETWEEN 1 PRECEDING AND 1 FOLLOWING)

-- 依日期值：當天前後 3 天內「有資料的列」（資料有缺漏時才對）
AVG(amount) OVER (ORDER BY d RANGE BETWEEN INTERVAL 3 DAY PRECEDING AND INTERVAL 3 DAY FOLLOWING)
```

- 框架預設：**有 `ORDER BY`** 時是 `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`（同值的列會一起算進去）；**沒有 `ORDER BY`** 時是整個分區。
- 要逐列累計，**明確寫 `ROWS` 並加入唯一排序鍵**，避免平手值被一起算進去。
- `ROWS` 遇到資料有缺漏會跨過缺口；要依日期差計算就用 `RANGE`。

### LAG / LEAD

```sql
SELECT month, amount,
       LAG(amount, 1)  OVER (ORDER BY month) AS prev,        -- 上一列
       LEAD(amount, 1) OVER (ORDER BY month) AS next,        -- 下一列
       ROUND((amount - LAG(amount) OVER (ORDER BY month)) * 100.0
             / NULLIF(LAG(amount) OVER (ORDER BY month), 0), 1) AS mom_pct   -- 年增/月增率
FROM   sales;
```

- 第二個參數是往前／後幾列，第三個參數是找不到時的預設值：`LAG(x, 1, 0)`。
- 老做法用 `MAX(x) OVER (ORDER BY d ROWS BETWEEN 1 PRECEDING AND 1 PRECEDING)` 取前一列（沒有 `LAG` 的年代）。
- 「前後列」的比較也可標準化：用框架把別列「拉」到同一列，再用 `CASE` 判斷（見下）。

### FIRST_VALUE / LAST_VALUE / NTILE

```sql
FIRST_VALUE(salary) OVER (PARTITION BY dept ORDER BY hire_date)   -- 組內最早入職者的薪水
LAST_VALUE(salary)  OVER (PARTITION BY dept ORDER BY hire_date
                          ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)   -- 注意要寫框架
NTILE(4) OVER (ORDER BY score DESC)                               -- 切成 4 等份
```

`LAST_VALUE` 有 ORDER BY 時的預設框架延伸到目前同值群組的最後一列，不一定是當前列。取分區最後值須明確指定完整框架。

## 實務應用

### 取代關聯子查詢：與前一年比

```sql
SELECT year, sales,
       CASE WHEN sales > LAG(sales) OVER (ORDER BY year) THEN '成長'
            WHEN sales < LAG(sales) OVER (ORDER BY year) THEN '衰退'
            WHEN sales = LAG(sales) OVER (ORDER BY year) THEN '持平'
            ELSE '—' END AS trend
FROM   yearly_sales;
```

- 此例假設年份連續且唯一。LAG 取前一筆紀錄，缺年時不等於前一年；年增比較應連結 `year - 1`，或確認 `LAG(year)` 等於 `year - 1`。
- 視窗函數可能需要排序，關聯子查詢可能被最佳化器改寫；效能以執行計畫為準。

### 找重疊期間（住宿預約）

此例只找與下一筆重疊的預約，可用來判斷是否存在衝突；不會列出所有衝突配對。要列出所有配對，應以同房間、不同預約 ID 自我連結，使用 `a.checkin < b.checkout AND b.checkin < a.checkout`（假設入住早於退房）。

```sql
SELECT room, checkin, checkout, next_checkin
FROM (
  SELECT room, checkin, checkout,
         LEAD(checkin) OVER (PARTITION BY room ORDER BY checkin) AS next_checkin
  FROM   reservation
) t
WHERE next_checkin < checkout;      -- 下一筆入住日早於這一筆退房日 → 重疊
```

### 其他

- 串接組內值：MySQL `GROUP_CONCAT(name SEPARATOR ',')`、PostgreSQL `STRING_AGG(name, ',')`、Oracle `LISTAGG`。
- 視窗函數可以放在 `SELECT` 與 `ORDER BY`，**不能放在 `WHERE`、`GROUP BY`、`HAVING`**（先包一層子查詢 / CTE）。

## 面試速查

**Q：`GROUP BY` 與 `PARTITION BY` 差別？**
兩者都是「把表切成類」。`GROUP BY` 把每類壓成一列；`PARTITION BY` 只在視窗內計算，**保留全部列**。

**Q：`ROW_NUMBER`、`RANK`、`DENSE_RANK` 差別？**
同分時：`ROW_NUMBER` 仍給不同號碼；`RANK` 並列且後面跳號；`DENSE_RANK` 並列且不跳號。

**Q：怎麼取每組薪水最高的一筆？**
`ROW_NUMBER() OVER (PARTITION BY dept ORDER BY salary DESC)` 再外層 `WHERE rn = 1`。要保留同薪並列者用 `RANK`。（舊寫法：關聯子查詢 `salary = (SELECT MAX(...) ... WHERE 同部門)`。）

**Q：`ROWS` 和 `RANGE` 差別？**
`ROWS` 依列數（前 n 列）；`RANGE` 依 `ORDER BY` 欄位的值（值在範圍內的所有列，包含同值者）。

**Q：為什麼視窗函數這麼晚（SQL:2003）才出現？**
關聯模型主張「列沒有順序」，與「依順序取前後列」的需求相衝突。實務需求累積後，標準才引入。它是「在不破壞集合概念下，臨時賦予順序」的折衷。
