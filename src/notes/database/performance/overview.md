# 最佳化流程與核心名詞

> 適用：MySQL 8.x / PostgreSQL（範例以 MySQL 8.x、InnoDB 為主），Java Spring Boot 後端。
> 原則：**先量測、再定位、再修改、最後驗證**。沒有通用的「超過 N 筆就必須加索引」門檻。

## 最佳化工作流程

1. **定義目標（Define SLO）**：確認 API 與 SQL 的 P50 / P95 / P99 延遲、吞吐量（QPS）、資源預算與正確性要求。
2. **找出瓶頸（Identify Bottleneck）**：從 APM、慢查詢日誌（Slow Query Log）、資料庫監控找出高耗時或高頻 SQL；區分資料庫執行、鎖等待、連線池等待、網路與應用程式耗時。
3. **建立基準（Baseline）**：記錄 SQL、參數、資料筆數、資料分布、執行頻率、執行時間、掃描筆數與目前索引。
4. **分析執行計畫（Execution Plan）**：MySQL 使用 `EXPLAIN ANALYZE`；PostgreSQL 使用 `EXPLAIN (ANALYZE, BUFFERS)`。留意預估與實際列數、存取路徑、排序、JOIN、迴圈次數與耗時。
5. **選擇最小改動（Optimize）**：優先減少不必要的讀取與重複查詢，再調整 SQL、索引與應用程式；架構性措施最後考慮。
6. **驗證與回歸（Validate）**：用接近正式環境的資料分布與併發測試，對照改善前後的 P95、QPS、CPU、I/O、寫入成本及執行計畫，並準備回滾方案。

## 核心名詞

| 中文 | 英文 | 定義與判讀 |
| --- | --- | --- |
| 基數 | Cardinality | 可能指欄位的**不重複值數量**，也可能指運算結果的**列數**，需看上下文。MySQL `SHOW INDEX` 的 `Cardinality` 是估計值。 |
| 欄位選擇性 | Column / Index Selectivity | 常見教學定義：`COUNT(DISTINCT col) / COUNT(*)`，越接近 1，欄位區分能力通常越高；這不是所有資料庫文件對 selectivity 的唯一用法。 |
| 條件選擇率 | Predicate Selectivity | 符合 `WHERE` 條件的列數占總列數的比例；例如 100 萬列中符合 100 列，比例為 0.01%。 |
| 資料分布 | Data Distribution | 各個值的出現頻率；即使 Distinct Count 相同，分布不同也會改變索引效益。 |
| 資料傾斜 | Data Skew | 少數值占據大量資料，例如 95% 訂單都是 `PAID`。 |
| 統計資訊 | Statistics | 最佳化器用於估計列數、分布與成本的資料。 |
| 直方圖 | Histogram | 描述欄位值分布的統計資料，可改善部分估算。 |
| 預估列數 / 實際列數 | Estimated / Actual Rows | 最佳化器估計的節點輸出列數 / 實際執行產生的列數；有迴圈的節點要注意每次迴圈平均值與 `loops`。 |
| 成本 | Cost | 最佳化器比較執行計畫的相對估計成本，**不等於毫秒**。 |
| 全表掃描 | Full Table Scan / Seq Scan | 讀取整表；小表或需要大部分資料時可能合理。 |
| 索引查找 | Index Lookup / Index Seek | 利用索引定位目標值。不同 DBMS 的術語不同。 |
| 範圍掃描 | Index Range Scan | 讀取索引中的連續鍵值範圍。 |
| 複合索引 | Composite Index | 由多個欄位構成，欄位順序影響可用性。 |
| 覆蓋索引 | Covering Index | 所需欄位都可由索引提供；PostgreSQL 的 Index Only Scan 仍可能受可見性檢查影響。 |
| 回表 | Table Lookup | MySQL InnoDB 使用次級索引取得主鍵後，再從聚簇索引取得其他欄位。 |
| 最左前綴 | Leftmost Prefix Rule | 複合 B-tree 索引通常最容易利用從左開始的連續鍵；特殊最佳化（如 Skip Scan）可能例外。 |
| 可索引搜尋條件 | SARGable | 條件形式利於使用索引尋找範圍，例如直接比較原欄位而非在欄位上套函數。 |
| 索引條件下推 | ICP | MySQL 在儲存引擎層以索引可用資訊先篩選部分條件。 |
| 鎖等待 | Lock Wait | SQL 因等待其他交易釋放鎖而延遲。 |
| N+1 查詢 | N+1 Query Problem | 先查一次集合，再為每個元素額外查詢；常見於 ORM 關聯載入。 |

### 選擇性範例

假設 `orders` 有 1,000,000 筆：

- `order_id` 有 1,000,000 個不同值：欄位選擇性約 100%。
- `status` 只有 3 個不同值：欄位選擇性約 0.0003%。
- 但 `status = 'FAILED'` 若只有 100 筆，該**條件選擇率**只有 0.01%，對應索引仍可能有用。

**結論：不能只看欄位基數，還要看查詢條件、資料分布、回傳比例與回表成本。**

## 優化優先級

| 優先級 | 問題 | 優先行動 |
| --- | --- | --- |
| P0 | 影響可用性、鎖死、資源耗盡 | 先止血、確認阻塞與交易，再處理根因 |
| P1 | 高頻慢查詢或 P95 / P99 明顯惡化 | 分析計畫、修正查詢與索引 |
| P2 | 大量掃描、深度分頁、N+1 | 減少資料量與查詢次數 |
| P3 | 少量低頻查詢略慢 | 依業務 SLO、成本與風險排序 |

**效能數字沒有固定標準**：10ms、100ms、500ms 只能作為初步觀察區間；應以系統 SLO、QPS、硬體與併發條件設定門檻。

**優先順序看總耗時 = 單次耗時 × 執行次數。** 每秒跑上千次、每次 50ms 的查詢，通常比每天一次、要 10 秒的報表更值得優化。

## 常見誤區

| 誤區 | 正確觀念 |
| --- | --- |
| 超過 10 萬筆才需要索引 | 索引依查詢負載與資料分布設計，不依固定筆數。 |
| 有索引就一定會使用 | 最佳化器可能判斷全表掃描成本更低。 |
| 高基數欄位一定值得建索引 | 還要看查詢頻率、條件、回傳比例與維護成本。 |
| 低基數欄位索引完全沒用 | 罕見值、複合索引、部分索引等情境仍可能有效。 |
| `SELECT *` 一定很慢 | 關鍵是是否讀取了不需要的資料，以及是否影響覆蓋索引。 |
| `EXPLAIN` 的 cost 是毫秒 | Cost 是相對估計量，非真實耗時。 |
| JOIN 一定比子查詢快 | 需依資料庫版本、SQL 寫法及實際計畫比較。 |
| 加大 Connection Pool 就會更快 | 可能加重 DB 負載，應先定位等待與查詢瓶頸。 |

## 一分鐘面試回答

> 我會先透過 APM 或 Slow Query Log 找出高頻或高耗時 SQL，記錄基準值，再使用 `EXPLAIN ANALYZE` 觀察執行計畫，包括掃描筆數、預估與實際列數、JOIN、排序和回表。接著檢查 Cardinality、Selectivity、資料分布與索引欄位順序，優先減少不必要的讀取、N+1 和深度分頁，必要時建立複合索引。最後用相同資料與併發條件比較 P95、資源使用與寫入影響，確保正確性並持續監控。

## 官方參考文件

- [MySQL 8.4 Reference Manual：Optimization](https://dev.mysql.com/doc/refman/8.4/en/optimization.html)
- [MySQL 8.4 Reference Manual：EXPLAIN](https://dev.mysql.com/doc/refman/8.4/en/explain.html)
- [PostgreSQL：Using EXPLAIN](https://www.postgresql.org/docs/current/using-explain.html)
- [PostgreSQL：Indexes](https://www.postgresql.org/docs/current/indexes.html)
- [Hibernate ORM User Guide](https://docs.jboss.org/hibernate/orm/current/userguide/html_single/Hibernate_User_Guide.html)
