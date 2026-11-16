# SQL 改寫準則

## 只取必要欄位

```sql
-- 避免不必要的資料傳輸
SELECT * FROM orders WHERE user_id = 1001;

-- 優先明確指定欄位
SELECT id, total_amount FROM orders WHERE user_id = 1001;
```

`SELECT *` 不是一定很慢，關鍵是是否讀取了不需要的資料，以及是否破壞了覆蓋索引的機會。

## 對時間欄位使用可索引範圍

```sql
-- 一般 created_at B-tree 索引可能無法有效做範圍定位
SELECT * FROM orders WHERE DATE(created_at) = '2026-11-12';

-- 通常較有利於索引範圍掃描
SELECT * FROM orders
WHERE created_at >= '2026-11-12'
  AND created_at <  '2026-11-13';
```

使用**半開區間**（`>=` 加 `<`）可以涵蓋有小數秒的時間。注意時區、欄位型別及業務日期定義；函數索引（Functional Index）也可能是替代方案。

## 注意模糊查詢

```sql
-- 一般 B-tree 索引通常難以有效支援前置萬用字元
WHERE name LIKE '%john%'

-- 前綴搜尋通常更容易利用 B-tree 索引
WHERE name LIKE 'john%'
```

大量全文搜尋應評估 Full-text Search、Trigram Index（PostgreSQL 擴充 `pg_trgm`）或搜尋引擎。

## 深度分頁

### 問題

深度 `OFFSET` 即使有索引，也必須讀取並跳過前面所有列，`LIMIT 20` 只限制最後輸出量。

```sql
SELECT id, created_at FROM orders
ORDER BY id LIMIT 20 OFFSET 100000;
```

### 方法一：Keyset Pagination（游標分頁）

```sql
-- 以「上一頁最後一筆 id」作為游標
SELECT id, created_at FROM orders
WHERE id > :last_seen_id
ORDER BY id LIMIT 20;
```

- 適合順序瀏覽，**不直接支援任意跳頁**。
- 排序鍵需穩定且具決定性，必要時以 `(created_at, id)` 作複合游標。
- 資料有刪除或 id 缺號時，不能以「頁碼 × 頁大小」推算游標。

### 方法二：延遲關聯（Deferred Join）

翻頁很深、要排序，又要取很多欄位、必須支援跳頁時最實用的一招：

```sql
-- 慢：要先回表 100,020 列，最後丟掉 100,000 列
SELECT * FROM orders
WHERE customer_id = 123
ORDER BY created_at
LIMIT 100000, 20;

-- 快：子查詢只走覆蓋索引 (customer_id, created_at, id)，最後只回表 20 列
SELECT o.* FROM orders o
JOIN (
  SELECT id FROM orders
  WHERE customer_id = 123
  ORDER BY created_at
  LIMIT 100000, 20
) t ON o.id = t.id;
```

**關鍵**：子查詢只碰索引、不回表。這是子查詢真正有用的場景之一。

## JOIN 與聚合

- 確認 JOIN 條件正確，避免意外笛卡兒積（Cartesian Product）。
- 比較 JOIN 前後列數，避免一對多關聯導致結果集暴增。
- 對 JOIN 鍵建立合適索引，但索引並非越多越好。
- 留意 `GROUP BY`、`DISTINCT`、`ORDER BY` 是否需要大量排序、暫存或聚合。
- 不要一律認為子查詢比 JOIN 慢；應比較實際執行計畫。

## 優化器選錯計畫時

先用 `ANALYZE` 更新統計資訊；不得已才強制執行順序，這屬於繞過優化器的手段：

- **PostgreSQL**：`WITH t AS MATERIALIZED (...)`，或在子查詢加 `OFFSET 0`。
- **MySQL**：子查詢加 `LIMIT`，或用 `/*+ NO_MERGE(t) */` hint。

## 面試：子查詢能不能先用索引欄位撈，再在外層過濾其他條件

> 一般不需要，優化器本來就會用索引縮小範圍再過濾，而且子查詢通常會被攤平成相同的計畫。真正有效的變體是延遲關聯：子查詢只走覆蓋索引拿到主鍵，再 JOIN 回原表，適用於深分頁或大量欄位的排序查詢。
