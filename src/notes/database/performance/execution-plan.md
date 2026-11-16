# 執行計畫判讀

> 以下所有計畫、成本與耗時均為**教學用簡化示意，並非實測結果或效能保證**；省略部分節點或屬性。實際輸出會隨版本、資料分布、索引與快取狀態改變。各案例獨立，不應將所有索引一起建立。

## 怎麼看輸出

### 指令

```sql
-- MySQL 8.0.18+
EXPLAIN ANALYZE
SELECT id, total_amount FROM orders WHERE user_id = 1001;

-- PostgreSQL
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, total_amount FROM orders WHERE user_id = 1001;
```

`ANALYZE` 會**實際執行**查詢；對 `UPDATE`、`DELETE` 等寫入語句應在安全的測試環境分析，或以適當交易控制避免意外修改。

**檢查清單**：

- [ ] 是否存在不合理的大量掃描？
- [ ] 預估列數與實際列數是否差距很大？
- [ ] 是否發生大量回表、排序或暫存？
- [ ] JOIN 順序、演算法與 `loops` 是否合理？
- [ ] 是否因鎖等待而非執行本身變慢？
- [ ] 是否需要更新統計資訊或檢查資料傾斜？
- [ ] 是否以實際參數和代表性資料驗證？

### time、rows、loops 的意義

MySQL 常見節點格式：

```text
-> Index lookup on orders using idx_orders_user (user_id=1001)
   (cost=120 rows=100)
   (actual time=0.050..0.800 rows=120 loops=1)
```

| 欄位 | 本例判讀 | 容易誤解的地方 |
| --- | --- | --- |
| `cost=120` | 最佳化器的相對成本 | 不是 120 ms，也不能拿來跨資料庫比較。 |
| 預估 `rows=100` | 預估此節點輸出 100 列 | 不是一定會掃描 100 列。 |
| `actual time=0.050..0.800` | 此次呼叫開始到首列約 0.050 ms，到完成約 0.800 ms | 第二個數字不是「首列之後再花 0.800 ms」。 |
| 實際 `rows=120` | 每次執行平均輸出 120 列 | 過濾前的讀取量須看下層節點。 |
| `loops=1` | 此節點執行 1 次 | 若大於 1，時間及 rows 通常以每次執行平均值表示。 |

讀樹狀計畫時，**先由下層確認資料如何取得，再向上追蹤篩選、JOIN、排序及 LIMIT**。父節點的時間包含向子節點取資料的時間，**不要把整棵樹的時間逐行相加**。`rows × loops` 可估計該節點累計輸出量，但不是全查詢的唯一掃描列數；同一筆資料可能流經多個節點。

PostgreSQL 的 `actual time=a..b rows=n loops=m` 也要注意每次執行平均值；其 `cost=a..b` 分別是啟動成本與完整執行的總成本，`width` 是預估每列位元組數。平行計畫還需要一起看 worker 資訊。

`EXPLAIN ANALYZE` 有量測開銷，也無法代替 API 延遲與併發壓測。普通 `SELECT` 的結果傳輸、ORM 建物件及應用程式後續處理，不能單憑計畫時間推算。

## 範例一：全表掃描 → 索引查找

假設 `orders` 有 1,000,000 列，`id` 為主鍵，使用者 1001 有 120 筆訂單，目前沒有 `user_id` 索引。

改善前的 MySQL 計畫：

```text
-> Filter: (orders.user_id = 1001)
   (actual time=0.100..180.000 rows=120 loops=1)
    -> Table scan on orders
       (actual time=0.080..145.000 rows=1000000 loops=1)
```

**判讀**：最上層雖只輸出 120 列，下層卻讀取 100 萬列，表示大部分讀取都被過濾掉。不能只看到回傳筆數少就認為工作量小。

```sql
CREATE INDEX idx_orders_user ON orders (user_id);
```

改善後可能變成：

```text
-> Index lookup on orders using idx_orders_user (user_id=1001)
   (actual time=0.050..0.800 rows=120 loops=1)
```

**驗證重點**：存取方式是否改變、讀取量是否縮小、結果是否相同。此索引不包含 `total_amount`，InnoDB 仍需取得完整資料列。熱門使用者若擁有大部分訂單，最佳化器也可能選全表掃描。

## 範例二：時間欄位套函數 → 範圍掃描

假設已存在一般索引 `idx_orders_created(created_at)`，目標日期有 2,400 筆訂單。

```sql
-- 改善前
SELECT id, created_at FROM orders
WHERE DATE(created_at) = '2026-11-12';

-- 改善後：半開區間可涵蓋有小數秒的時間
SELECT id, created_at FROM orders
WHERE created_at >= '2026-11-12 00:00:00'
  AND created_at <  '2026-11-13 00:00:00';
```

```text
改善前：
-> Filter: (cast(orders.created_at as date) = '2026-11-12')
   (actual time=0.100..130.000 rows=2400 loops=1)
    -> Covering index scan on orders using idx_orders_created
       (actual time=0.070..95.000 rows=1000000 loops=1)

改善後：
-> Covering index range scan on orders using idx_orders_created
   over ('2026-11-12 00:00:00' <= created_at < '2026-11-13 00:00:00')
   (actual time=0.050..1.500 rows=2400 loops=1)
```

**判讀**：改善前也「用了索引」，但掃的是**整個索引**；改善後才是定位日期範圍。重點是 `scan` 與 `range scan` 的工作量差異，不能只看索引名稱。

## 範例三：複合索引同時支援篩選、排序與 LIMIT

```sql
SELECT id, total_amount
FROM orders
WHERE user_id = 1001 AND status = 'PAID'
ORDER BY created_at DESC, id DESC
LIMIT 20;
```

假設目前只有 `idx_orders_user(user_id)`，該使用者有 10,000 筆訂單，其中 8,000 筆已付款。

```text
-> Limit: 20 row(s) (actual time=12.000..12.020 rows=20 loops=1)
    -> Sort: created_at DESC, id DESC, limit input to 20 row(s) per chunk
       (actual time=12.000..12.010 rows=20 loops=1)
        -> Filter: (orders.status = 'PAID')
           (actual time=0.060..10.000 rows=8000 loops=1)
            -> Index lookup on orders using idx_orders_user (user_id=1001)
               (actual time=0.050..9.000 rows=10000 loops=1)
```

**判讀**：排序只輸出 20 列，不代表只讀了 20 列。下層仍可能必須提供全部 8,000 列。

```sql
CREATE INDEX idx_orders_user_status_created_id
ON orders (user_id, status, created_at DESC, id DESC);
```

```text
-> Limit: 20 row(s) (actual time=0.060..0.180 rows=20 loops=1)
    -> Index lookup on orders using idx_orders_user_status_created_id
       (user_id=1001, status='PAID')
       (actual time=0.060..0.170 rows=20 loops=1)
```

**改善原因**：先固定 `user_id` 與 `status`，再依索引順序取最新 20 筆，不必另外排序。加入 `id` 作同時間訂單的決勝鍵，讓結果順序穩定。此案例尚未覆蓋 `total_amount`，應先量測再決定是否擴充索引。

**注意**：下層只輸出 20 列可能是父層 `LIMIT` 提早停止取資料，不表示條件總共只符合 20 列，也不能直接據此判定完整結果的列數估算失準。

## 範例四：Nested Loop 單次很快，累計很昂貴

```sql
SELECT o.id, oi.product_id, oi.quantity
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
WHERE o.created_at >= '2026-11-01'
  AND o.created_at <  '2026-12-01';
```

假設 `orders.created_at` 與 `order_items.order_id` 都有索引：

```text
-> Nested loop inner join
   (actual time=0.100..1800.000 rows=500000 loops=1)
    -> Index range scan on o using idx_orders_created
       (actual time=0.050..80.000 rows=100000 loops=1)
    -> Index lookup on oi using idx_items_order (order_id=o.id)
       (actual time=0.004..0.015 rows=5 loops=100000)
```

**判讀**：內層每次約 0.015 ms，但被呼叫 **100,000 次**，累計約 1,500 ms，輸出約 `5 × 100,000 = 500,000` 列。這是同一支 SQL 的迴圈，與 ORM 發出多支 SQL 的 N+1 問題不同。

**改善方向**：

- 先確認業務是否需要整個月的所有明細；若只需某位使用者，可加入正確的使用者條件並評估 `(user_id, created_at)` 索引。
- 若只需訂單摘要，可評估聚合或預先彙總。
- 若確實需要 50 萬列，應比較批次、串流及其他 JOIN 計畫的資源成本，而不是認定 Nested Loop 一定錯誤。

不能任意先對訂單加 `LIMIT 20` 再 JOIN，除非需求確實是「20 筆訂單的全部明細」；這與「JOIN 結果的前 20 列」語意不同。也不要將 1,500 ms 再加到父節點的 1,800 ms，因為父節點已包含內層工作。

## 範例五：有主鍵索引，深度 OFFSET 仍然很慢

```sql
SELECT id FROM orders ORDER BY id LIMIT 20 OFFSET 100000;
```

```text
-> Limit/Offset: 20/100000 row(s)
   (actual time=18.000..18.010 rows=20 loops=1)
    -> Covering index scan on orders using PRIMARY
       (actual time=0.040..15.000 rows=100020 loops=1)
```

**判讀**：有索引、無額外排序，但仍須讀取並跳過前 100,000 列。`LIMIT 20` 只限制最後輸出量。

```sql
-- 假設上一頁最後一筆 id 為 150000
SELECT id FROM orders
WHERE id > 150000
ORDER BY id LIMIT 20;
```

```text
-> Limit: 20 row(s) (actual time=0.050..0.070 rows=20 loops=1)
    -> Covering index range scan on orders using PRIMARY over (150000 < id)
       (actual time=0.050..0.065 rows=20 loops=1)
```

**驗證重點**：使用實際上一頁游標，確認頁面邊界與順序。複合排序需同時帶入排序鍵與唯一鍵。

## 範例六：預估 100 列，實際卻有 80,000 列

```sql
SELECT id, total_amount FROM orders WHERE status = 'PENDING';
```

```text
-> Index lookup on orders using idx_orders_status (status='PENDING')
   (cost=110 rows=100)
   (actual time=0.060..140.000 rows=80000 loops=1)
```

**判讀**：此節點完整執行且 `loops=1`，實際列數是預估的 800 倍。若它成為 JOIN 外層，錯估可能連帶低估內層呼叫次數與成本。

先確認參數、資料是否剛大量匯入或狀態分布已改變，再評估更新統計資訊：

```sql
-- MySQL：更新表與索引的統計資訊
ANALYZE TABLE orders;

-- MySQL：若問題與欄位分布估算有關，可另評估直方圖
ANALYZE TABLE orders UPDATE HISTOGRAM ON status WITH 32 BUCKETS;

-- PostgreSQL 的對應基本操作（不是 MySQL 語法）
ANALYZE orders;
```

**驗證重點**：重新比較預估與實際列數，以及整體時間。直方圖並非所有條件都會採用；多欄位相關性不保證靠單欄直方圖解決。估算改善不一定讓 SQL 變快。統計維護操作仍有資源成本，應依環境安排。

## 範例七：PostgreSQL 用 BUFFERS 看排序落盤

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, created_at, total_amount
FROM orders
WHERE status = 'PAID'
ORDER BY created_at DESC, id DESC;
```

```text
Sort (actual time=240.000..285.000 rows=800000 loops=1)
  Sort Key: created_at DESC, id DESC
  Sort Method: external merge  Disk: 28000kB
  Buffers: shared hit=2000 read=10000, temp read=3500 written=3520
  -> Seq Scan on orders
       (actual time=0.030..120.000 rows=800000 loops=1)
       Filter: (status = 'PAID')
       Rows Removed by Filter: 200000
       Buffers: shared hit=2000 read=10000
Planning Time: 0.500 ms
Execution Time: 310.000 ms
```

**判讀步驟**：

1. 掃描輸出 800,000 列、移除 200,000 列，代表本次需要檢查約 100 萬列。
2. `shared hit` 表示在 shared buffers 找到區塊；`shared read` 表示需讀入區塊，但可能由作業系統快取提供，不能直接等同實體磁碟 I/O。
3. `external merge`、`Disk` 與 temp 區塊顯示排序使用了**磁碟暫存**。父節點的 buffers 包含子節點，不要逐層累加。

**改善方向**：先問是否確實需要 80 萬列及全量排序。若需求是最新 20 筆，改為穩定排序搭配 `LIMIT`，並評估 `(status, created_at DESC, id DESC)` 索引；若必須完整匯出，則比較排序成本與索引讀取成本。可在受控測試中以交易內 `SET LOCAL work_mem = '64MB'` 比較排序方式，但此值只是示例；記憶體可能依操作節點、worker 與併發查詢倍增，不宜直接全域調大。

此例有 80% 資料符合條件，Seq Scan 可能合理；**不能因為看到 Seq Scan 就強制使用索引**。

## 範例八：Index Only Scan 為何仍有 Heap Fetches

```sql
CREATE INDEX idx_orders_user_cover
ON orders (user_id) INCLUDE (id, total_amount);

EXPLAIN (ANALYZE, BUFFERS)
SELECT id, total_amount FROM orders WHERE user_id = 1001;
```

```text
Index Only Scan using idx_orders_user_cover on orders
  (actual time=0.050..1.200 rows=120 loops=1)
  Index Cond: (user_id = 1001)
  Heap Fetches: 100
  Buffers: shared hit=110
```

**判讀**：索引具備所需欄位，但 PostgreSQL 還要確認資料列的 MVCC 可見性；若 visibility map 未能證明頁面上的資料皆可見，仍須存取 heap。PostgreSQL 的次級索引不會因為有主鍵，就自動包含可直接供查詢使用的 `id`，因此這裡明確 `INCLUDE`。

**改善方向**：檢查 autovacuum 是否正常、近期更新比例與長交易；在合適維護時機評估 `VACUUM (ANALYZE) orders` 後重新觀察 Heap Fetches。持續更新的資料不保證降為 0，不應只為追求 0 而反覆手動 VACUUM。也要衡量 `INCLUDE` 欄位增加的索引空間與寫入成本。

## 排查順序與比較紀錄

| 看見的訊號 | 下一步確認 |
| --- | --- |
| 上層輸出少、下層讀取多 | 條件能否定位索引範圍？是否大量讀完才篩選？ |
| 單次時間短、`loops` 很高 | 外層列數是否合理？是否真的需要全部 JOIN 結果？ |
| `LIMIT` 很小、下層輸出很大 | 是否先排序或跳過 OFFSET？能否依索引順序提早停止？ |
| 預估與實際差距大 | 節點是否被提早停止？是否為平均列數？統計、傾斜或欄位相關性是否影響估算？ |
| PostgreSQL temp read / written | 哪個排序或雜湊節點使用暫存？先減量，再評估記憶體。 |
| 計畫很快但 API 很慢 | 回頭看鎖等待、連線池、查詢次數、網路、結果大小及 ORM 處理。 |

可為每次修改留下以下紀錄：

```text
SQL／參數：
資料庫版本／資料量／資料分布：
既有索引與本次改動：
改善前：根節點時間、關鍵節點 rows／loops、buffers（若支援）
改善後：相同項目
測試條件：冷／暖快取、執行次數、併發、是否完整讀取結果
正確性：列數、內容、排序、NULL、分頁邊界
代價：新增索引容量、寫入延遲、維護成本
應用驗證：API P95／P99、QPS、CPU／I/O、連線池等待
```

分析寫入語句前，先確認該版本支援的語法與副作用；`ROLLBACK` 不能撤銷所有外部副作用，測試環境仍是優先選擇。
