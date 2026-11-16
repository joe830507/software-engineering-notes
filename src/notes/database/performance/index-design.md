# 索引設計

> 適用：MySQL（InnoDB）/ PostgreSQL。重點是「怎麼讓索引被用到、用得好」，以及實務上索引是怎麼演進的。

## 設計準則

1. **先建立必要約束**：主鍵（Primary Key）、唯一約束（Unique Constraint）應由正確性需求驅動。
2. **根據工作負載建索引**：優先評估高頻、昂貴查詢中的 `WHERE`、`JOIN`、`ORDER BY`，而不是每個欄位都加索引。
3. **複合索引以完整查詢設計**：常見起點是等值條件欄位，再考慮範圍條件與排序；實際順序要看選擇性、查詢模式及執行計畫，不是固定公式。
4. **避免重複與過寬索引**：檢查索引前綴重疊；索引越多，通常越增加寫入、儲存及維護成本。
5. **確認是否需要覆蓋索引**：適用於高頻且欄位固定的讀取，但不應無限制將所有 SELECT 欄位塞入索引。
6. **觀察寫入影響**：`INSERT`、`UPDATE`、`DELETE` 需維護相關索引；以真實讀寫比評估。
7. **不要依資料量單獨決策**：幾千筆的高頻查詢也可能值得索引；百萬筆查詢大量資料時全表掃描也可能合理。

## 複合索引

### 範例

```sql
SELECT id, total_amount
FROM orders
WHERE user_id = 1001
  AND status = 'PAID'
ORDER BY created_at DESC
LIMIT 20;

CREATE INDEX idx_orders_user_status_created
ON orders (user_id, status, created_at DESC);
```

此索引**可能**同時支援篩選與排序；是否有效仍須看實際計畫。`id` 在 InnoDB 次級索引中通常可透過主鍵資訊取得，但 `total_amount` 未包含於此索引，可能仍須回表。

### 最左前綴原則

索引 `(a, b, c)` 可以支援：`a`、`a, b`、`a, b, c` 的查詢。**無法**支援只有 `b`、`c` 或 `b, c` 的查詢（MySQL 8.0 的 skip scan 在部分情況例外）。

### 欄位順序：等值在前、範圍在後

```sql
-- 查詢：WHERE customer_id = ? AND status = ? AND created_at > ?
INDEX (customer_id, status, created_at)   -- ✅ 三個欄位都能用來縮小範圍
INDEX (customer_id, created_at, status)   -- ⚠️ 碰到範圍條件後，status 只能逐筆過濾
```

- 兩者都符合最左前綴，但效率不同。
- MySQL 5.6+ 的 **ICP（Index Condition Pushdown）** 會在索引層先過濾，差距會縮小但仍存在（EXPLAIN 顯示 `Using index condition`）。
- 若有 `ORDER BY`，排序欄位接在等值欄位後面，可以避免 filesort。

### 覆蓋索引

查詢需要的欄位全都在索引中，就不必回表。

- MySQL EXPLAIN：`Extra: Using index`
- PostgreSQL：`Index Only Scan`（還要看 visibility map，記得 VACUUM）
- 所以 `SELECT *` 和 `SELECT id, status` 的效能可能差很多。

## 讓索引失效的寫法

這些寫法連優化器也救不了：

| 寫法 | 問題 | 改法 |
| --- | --- | --- |
| `WHERE YEAR(created_at) = 2025` | 欄位外面包了函式 | `created_at >= '2025-01-01' AND created_at < '2026-01-01'`，或建函式索引 |
| `WHERE phone = 0912345678`（phone 是 varchar） | 隱式型別轉換 | 改用字串比較 `'0912345678'` |
| `WHERE name LIKE '%abc'` | 前導萬用字元 | 全文索引、反轉字串索引，或 PG 的 `pg_trgm` |
| `WHERE a = 1 OR b = 2` | 可能兩個索引都不走 | 改用 `UNION`，或依賴 index merge / bitmap or |
| `WHERE amount + 0 > 100` | 欄位參與運算 | 把運算移到常數那一側 |
| JOIN 兩邊欄位的型別或字元集不同 | 隱式轉換 | 統一型別與 collation |

## 優化器不保證走索引

優化器是 **Cost-Based**，依估計成本選計畫：

- **選擇性低**（例如條件會撈出 20～30% 以上的資料）：走索引再回表的隨機 I/O 比全表掃描還貴，優化器選全表掃描通常是**對的**。
- **統計資訊過時**：可能選錯索引，要執行 `ANALYZE TABLE`（MySQL）/ `ANALYZE`（PostgreSQL）。
- 慢查詢一律先看執行計畫。

### 優化器已經會「先用索引縮小範圍，再過濾其他條件」

```sql
SELECT * FROM orders
WHERE customer_id = 123      -- 有索引
  AND status = 'shipped'     -- 無索引
  AND amount > 1000;         -- 無索引
```

執行方式：先走 `customer_id` 的索引找到候選列 → 回表 → 再逐列檢查 `status`、`amount`。

- MySQL EXPLAIN：`type=ref` + `Extra: Using where`
- PostgreSQL EXPLAIN：`Index Scan` + `Filter: ...`

刻意包子查詢通常沒用：優化器會把子查詢攤平（MySQL：derived table merge；PostgreSQL：subquery pull-up），執行計畫和原寫法相同。如果子查詢被**物化成暫存表**，外層就沒有索引可用，反而更慢。

## 索引的演進與維護

現實情況：很少能在一開始就預料所有查詢條件，多半是**上線 → 觀察 → 補強**。

### 設計階段：只建「明顯該建」的

- 主鍵、唯一約束（email、訂單編號等業務規則）。
- **外鍵欄位**：PostgreSQL 不會自動幫外鍵建索引；MySQL InnoDB 會。
- 規格中已知的核心查詢，例如 `(customer_id, created_at)`。

### 上線後：靠監控找熱點

| 資料庫 | 工具 |
| --- | --- |
| MySQL | slow query log、`performance_schema`、`sys.statements_with_full_table_scans` |
| PostgreSQL | `pg_stat_statements`、`auto_explain` |
| 雲端 | RDS Performance Insights、Cloud SQL / Azure Query Insights |

### 為什麼不「多建幾個以防萬一」

- 每次寫入（INSERT / UPDATE / DELETE）都要維護所有相關索引，寫入會變慢。
- 會佔用磁碟空間與記憶體（buffer pool / shared buffers）。
- 索引太多時，優化器偶爾會選錯。

定期清除沒用到的索引：

- PostgreSQL：`pg_stat_user_indexes` 中 `idx_scan = 0` 的。
- MySQL：`sys.schema_unused_indexes`。

### 大表事後加索引：避免鎖表

| 資料庫 | 做法 |
| --- | --- |
| PostgreSQL | `CREATE INDEX CONCURRENTLY`（不阻擋寫入，較慢；失敗會留下 INVALID 索引，要手動刪除） |
| MySQL | Online DDL：`ALTER TABLE ... ADD INDEX ..., ALGORITHM=INPLACE, LOCK=NONE` |
| MySQL 大表 | gh-ost、pt-online-schema-change |

注意：在離峰時段執行，並監控主從複製延遲。

## 面試：建了索引為什麼沒被使用

1. 沒有符合最左前綴。
2. 欄位被函式包住、參與運算，或發生隱式型別轉換。
3. `LIKE` 有前導 `%`。
4. 選擇性太低，優化器判斷全表掃描比較便宜。
5. 統計資訊過時。
6. `OR` 條件中有欄位沒有索引。

## 面試：你們怎麼處理索引 / 慢查詢

> 設計階段依已知的存取模式建立基本索引，例如主鍵、外鍵和核心查詢用的複合索引，並遵守「等值在前、範圍在後」的順序。上線後用 slow query log 或 `pg_stat_statements` 找出總耗時最高的查詢，用 EXPLAIN 確認是否全表掃描、filesort 或大量回表，再決定加複合索引、做成覆蓋索引，或改寫 SQL（例如避免函式包欄位、深分頁改用延遲關聯或 keyset pagination）。大表加索引會用 Online DDL 或 `CONCURRENTLY`，避免鎖表。另外也會定期清除沒用到的索引，降低寫入成本。
