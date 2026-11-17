# 結合與集合運算

> 結合（JOIN）是「橫向」把表拼起來，集合運算（UNION 等）是「縱向」把結果疊起來。兩者都是把資料表當成集合來處理。

## 內部結合

### 笛卡兒乘積與 INNER JOIN

```sql
-- 忘記寫條件：A 有 m 列、B 有 n 列 → 結果 m × n 列
SELECT * FROM customer, address;

-- 正確：用 ON 指定對應關係
SELECT c.first_name, a.address
FROM   customer c
JOIN   address  a ON a.address_id = c.address_id;
```

- `JOIN` 預設就是 `INNER JOIN`：兩邊都對得上的列才留下。
- **SQL92 寫法**（`JOIN ... ON`）把「結合條件」與「過濾條件」分開，比舊式逗號加 `WHERE` 清楚，也比較不會漏寫條件。
- 內部結合時 `ON` 與 `WHERE` 的條件可互換；**外部結合不行**（見下）。

### 多表、別名與自我結合

```sql
SELECT c.first_name, ci.city
FROM   customer c
JOIN   address  a  ON a.address_id = c.address_id
JOIN   city     ci ON ci.city_id   = a.city_id;
```

- 三表以上就是「A 連 B，結果再連 C」，順序通常不影響結果，最佳化器會自行決定實際順序。
- **同一張表用多次**要用不同別名；別名也用來區分欄位來源。
- **自我結合**：把同一張表當成兩個集合。例如員工與其主管：

```sql
SELECT e.name AS employee, m.name AS manager
FROM   employee e
LEFT JOIN employee m ON m.id = e.manager_id;   -- LEFT 才不會漏掉沒有主管的人
```

### 子查詢當成表

```sql
SELECT c.name, t.total
FROM   customer c
JOIN  (SELECT customer_id, SUM(amount) AS total
       FROM payment GROUP BY customer_id) t
  ON  t.customer_id = c.customer_id;
```

衍生表應明確命名。一對多會重複一側的列；多個明細表通常應先各自彙整到相同粒度再連結，避免重複加總。

## 外部結合

### LEFT / RIGHT / FULL

| 類型 | 保留 |
|---|---|
| `LEFT [OUTER] JOIN` | 左表全部列，右表對不到的欄位補 NULL |
| `RIGHT [OUTER] JOIN` | 右表全部列（可改寫成 LEFT，**建議只用 LEFT**） |
| `FULL [OUTER] JOIN` | 兩邊都保留（MySQL 不支援，用 LEFT JOIN 加 UNION ALL 串接右側未匹配列，保留合法重複列） |

```sql
-- 所有客戶，包含從沒下過訂單的
SELECT c.id, o.order_id
FROM   customer c
LEFT JOIN orders o ON o.customer_id = c.id;
```

### 兩個最重要的細節

**1. 右表的過濾條件放 `ON`，不是 `WHERE`**

```sql
-- 錯：WHERE 把 NULL 列濾掉，外部結合退化成內部結合
SELECT c.id, o.order_id
FROM   customer c LEFT JOIN orders o ON o.customer_id = c.id
WHERE  o.status = 'PAID';

-- 對：條件放 ON，沒有已付款訂單的客戶仍會保留（o.* 為 NULL）
SELECT c.id, o.order_id
FROM   customer c
LEFT JOIN orders o ON o.customer_id = c.id AND o.status = 'PAID';
```

**2. 找「沒有對應」的列（anti-join）**

```sql
SELECT c.id
FROM   customer c
LEFT JOIN orders o ON o.customer_id = c.id
WHERE  o.customer_id IS NULL;        -- 用右表主鍵或 NOT NULL 欄位判斷
-- 等價：WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id)
```

### 三表以上的外部結合

```sql
-- 後面的表若用 INNER JOIN 接在 LEFT JOIN 之後，會把 NULL 列濾掉
FROM a LEFT JOIN b ON ... LEFT JOIN c ON ...    -- 鏈式都用 LEFT
```

### CROSS JOIN 與 NATURAL JOIN

- `CROSS JOIN`：刻意要笛卡兒乘積，例如產生資料：

```sql
-- 用遞迴 CTE 產生連續日期，再 LEFT JOIN 業務資料，沒有交易的日子才不會消失
WITH RECURSIVE days(d) AS (
  SELECT DATE '2026-01-01'
  UNION ALL
  SELECT CAST(d + INTERVAL '1' DAY AS DATE) FROM days WHERE d < DATE '2026-01-31'
)
SELECT days.d, COUNT(o.order_id) AS orders
FROM   days
LEFT JOIN orders o ON o.created_at >= days.d AND o.created_at < days.d + INTERVAL '1' DAY
GROUP BY days.d ORDER BY days.d;
```

沒有遞迴 CTE 的環境，可用 `CROSS JOIN` 把 0~9 的小表自己乘自己，造出 0~99、0~999 的數字，再加到起始日期上。

- `NATURAL JOIN`：自動用「同名欄位」結合，欄位一改名就悄悄壞掉，**不要用**。

## 集合運算

### UNION / INTERSECT / EXCEPT

| 運算 | 結果 | 備註 |
|---|---|---|
| `A UNION B` | 聯集，去重 | 需要排序或雜湊 |
| `A UNION ALL B` | 聯集，不去重 | 較快，確定無重複時用它 |
| `A INTERSECT B` | 交集 | MySQL 8.0.31 之前不支援 |
| `A EXCEPT B` | 差集（A 有、B 沒有） | Oracle 叫 `MINUS`；MySQL 8.0.31 之前不支援 |

規則：

- 兩個查詢的**欄位數量相同、型別相容**，欄名以第一個查詢為準。
- 整個結果的 `ORDER BY` 放在最後；個別分支的排序與筆數限制需依方言加括號或包子查詢，且不保證最終順序。
- 同時使用多個運算子時，`INTERSECT` 優先於 `UNION` / `EXCEPT`，不確定就加括號。
- 集合運算會把 NULL 視為**相同**（和 `=` 比較不同）。

### 集合運算的實用技巧

**比較兩張表是否相等**（只要列的「集合」相同即可）：

```sql
-- 兩個差集都為空 → 相等
SELECT CASE WHEN COUNT(*) = 0 THEN '相等' ELSE '不相等' END
FROM (
  (SELECT * FROM t1 EXCEPT SELECT * FROM t2)
  UNION ALL
  (SELECT * FROM t2 EXCEPT SELECT * FROM t1)
) d;
```

**表格 diff：找出哪些列不同**（兩邊各缺什麼）：

```sql
-- MySQL 不允許「常數, *」並列，要寫成「別名.*」
(SELECT 't1 獨有' AS src, a.* FROM (SELECT * FROM t1 EXCEPT SELECT * FROM t2) a)
UNION ALL
(SELECT 't2 獨有', b.* FROM (SELECT * FROM t2 EXCEPT SELECT * FROM t1) b);
```

**高速刪除重複列**：與其逐筆比較刪除，不如用差集求出「要保留的列」，再重建表。

**冪等性（idempotency）**：`UNION`、`INTERSECT` 重複套用結果不變（`A ∪ A = A`），所以去重後還能繼續運算。`UNION ALL` 不具備。

## 面試速查

**Q：`INNER JOIN` 與 `LEFT JOIN` 的結果差在哪？**
`INNER JOIN` 只留兩邊都對得上的列；`LEFT JOIN` 保留左表全部列，對不到的右表欄位為 NULL。

**Q：`LEFT JOIN` 後在 `WHERE` 加右表條件會怎樣？**
NULL 的列被過濾，外部結合退化成內部結合。要保留左表全部列，條件放 `ON`。

**Q：`UNION` 與 `UNION ALL` 差別？**
`UNION` 會去重（要排序或雜湊，較慢）；`UNION ALL` 不去重。確定不會重複，或不在乎重複時用 `UNION ALL`。

**Q：多對多的結合為什麼會讓列數暴增？**
一對多會重複一側的列；多對多每個 key 的結果列數是兩側匹配列數的乘積。中介表不會自動消除重複加總，應依結果粒度先彙整再結合。
