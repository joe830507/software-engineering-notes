# 資料存取方案總覽與選型

> 這一頁是 ORM 與資料存取系列的入口。先搞懂各方案的定位與差異，再依需要深入閱讀後面各頁。

## 各方案一句話

| 方案 | 一句話 |
| --- | --- |
| Spring Data JPA（Hibernate） | 操作物件，框架幫你寫 SQL |
| MyBatis | SQL 自己寫，參數與結果對應交給它 |
| MyBatis-Plus | MyBatis + 免寫單表 CRUD + 一堆實用外掛 |
| JdbcClient 與 Spring Data JDBC | Spring 原生、最少魔法 |
| jOOQ | 用 Java 寫型別安全的 SQL |

## 從「誰寫 SQL」來分類

```
框架寫 SQL ◀────────────────────────────────────────────────▶ 你寫 SQL

Spring Data JPA   Spring Data JDBC   MyBatis-Plus   jOOQ        MyBatis    JdbcClient
(Hibernate)                                         (Java DSL)  (XML)      (字串)
全自動 ORM         輕量 ORM            半自動          SQL 建構器   SQL Mapper  JDBC 包裝
有持久化上下文      無快取、無延遲載入    單表自動、多表手寫
```

越往左：寫得越少，但越需要懂框架在背後做什麼。越往右：寫得越多，但每一條 SQL 都在你掌控中。**沒有哪個最好，只有哪個最適合你的場景與團隊。**

## 一張表比較

| 項目 | JPA / Hibernate | Spring Data JDBC | MyBatis | MyBatis-Plus | jOOQ | JdbcClient |
| --- | --- | --- | --- | --- | --- | --- |
| 單表 CRUD | 免寫 | 免寫 | 要寫 | 免寫 | 中 | 要寫 |
| 複雜查詢 / 報表 | JPQL、原生 SQL、DTO 投影 | 自寫 SQL 或搭配 JdbcClient | 自寫 SQL / XML | 自訂 Mapper / XML | SQL DSL、視窗函數等 | 自寫 SQL 與 RowMapper |
| 動態條件 | Specification / Criteria | 衍生查詢或自訂實作 | XML 標籤 / SQL Provider | Wrapper / XML | Java DSL 組合條件 | 自行組合可信 SQL 片段並綁定值 |
| 編譯期型別安全 | 中（需 metamodel） | 弱 | 無 | 中（Lambda） | 強 | 無 |
| SQL 可見度 | 低 | 高 | 最高 | 中 | 高 | 最高 |
| 學習曲線 | 陡 | 平緩 | 平緩 | 平緩 | 中 | 最低 |
| 主要注意事項 | N+1、載入策略、實體狀態 | 聚合大小、子實體重寫成本 | `${}`、結果對應、快取範圍 | 外掛與自訂 SQL 的適用範圍 | 產碼同步、方言與授權範圍 | 參數綁定、資源關閉、手動對應 |
| 批次大量資料 | 設定 JDBC batch、定期 flush / clear | 評估聚合重寫成本 | BATCH executor，注意 flush 與交易 | saveBatch 等，確認 JDBC batch 行為 | batch API | 改用 JdbcTemplate batchUpdate |
| 資料庫可攜性 | 高 | 中 | 低 | 中 | 高（依方言翻譯） | 低 |
| 授權 | 免費 | 免費 | 免費 | 免費 | 開源版限開源資料庫 | 免費 |

此表比較能力與使用成本，不代表效能排名。實際吞吐量取決於 SQL、索引、資料量、驅動與批次設定；應使用自己的代表性查詢量測，不能只按框架名稱選擇。

## 選型決策流程

```
開始
 ├─ 系統以複雜 SQL、報表、批次為主？
 │     ├─ 是 ─┬─ 想要編譯期型別安全、資料庫是開源的？ ──▶ jOOQ
 │     │      ├─ 團隊熟 XML、需要 DBA 審 SQL？ ────────▶ MyBatis
 │     │      └─ 小服務、不想多一個框架？ ──────────────▶ JdbcClient
 │     │
 │     └─ 否（CRUD 為主）
 │            ├─ 領域模型複雜、關聯多、團隊懂 JPA？ ─────▶ Spring Data JPA
 │            ├─ 想要 Repository 便利但討厭 JPA 魔法？ ──▶ Spring Data JDBC
 │            └─ 既有 MyBatis 專案、後台管理系統？ ───────▶ MyBatis-Plus
 │
 └─ 拿不定主意 ──▶ 主要方案 + JdbcClient 補複雜查詢（最穩的組合）
```

## 常見的組合拳

實務上很少只用一種。以下組合在同一專案中共用同一個 DataSource 與交易管理器，不衝突：

| 組合 | 分工 | 適用 |
| --- | --- | --- |
| **JPA + JdbcClient** | 寫入與一般查詢用 JPA；報表、批次用 JdbcClient | 最常見、最低成本的補強 |
| **JPA + jOOQ** | 寫入用 JPA；複雜讀取用 jOOQ | 讀取複雜、重視型別安全 |
| **Spring Data JDBC + JdbcClient** | 寫入走聚合；列表與報表直接查 DTO | 輕量 CQRS、DDD 風格 |
| **MyBatis-Plus + XML** | 單表用 BaseMapper / Wrapper；多表 join 寫 XML | 台灣、中國常見的後台系統 |

混用的共同注意事項：

1. **交易**：同一個 DataSource 時，`JpaTransactionManager` 可以一併管理 JDBC 操作；不要同時存在多個交易管理器卻不指定。
2. **可見性**：JPA 尚未 flush 的變更，其他方案看不到。混用前先 `flush()`。
3. **一級快取**：用其他方案改了資料，JPA 持久化上下文裡的舊物件不會知道，必要時 `clear()` 或重新查詢。

## 各方案共通的核心觀念

不管選哪個，以下問題都會遇到：

| 觀念 | 白話說明 |
| --- | --- |
| N+1 查詢 | 查 N 筆主資料，每筆又各查一次關聯 |
| 一對多 + 分頁 | join 後 limit 限制的是列數不是主表筆數 |
| SQL Injection | 字串拼接使用者輸入 |
| 批次寫入 | 逐筆 insert 很慢，要用 batch |
| 大量讀取 | 一次載入全部會 OOM，要串流 |
| 樂觀鎖 | 用 version 欄位偵測並行修改 |
| 防全表更新 | 動態條件全空時變成無 where |
| 交易整合 | `@Transactional` 與失效情境 |
| 測試 | 用 Testcontainers 跑真實資料庫 |

### 三個所有方案都適用的鐵則

1. **永遠知道送了什麼 SQL**：開發環境一律開 SQL log；重要查詢用 `explain` 看執行計畫。
2. **永遠不要拼接使用者輸入**：所有值都用參數綁定；表名、欄位名、排序方向只能來自白名單。
3. **測試用真實資料庫**：H2 與正式資料庫的差異會讓測試失去意義，用 Testcontainers。

### MySQL 的兩個必加參數

```
jdbc:mysql://host:3306/db?rewriteBatchedStatements=true&useCursorFetch=true
```

- `rewriteBatchedStatements=true`：讓 JDBC batch 真正合併成多值 insert，所有方案的批次寫入都受影響。
- `useCursorFetch=true`：讓 `fetchSize` 生效，大量讀取才不會整個結果集載入記憶體。

## 面試快答：「你們為什麼選這個 ORM？」

這題沒有標準答案，但好的回答要包含**情境、取捨、補強**三個部分。

範例一：

> 我們的系統以訂單、會員這類 CRUD 為主，領域關聯多，所以主體用 Spring Data JPA，開發速度快。取捨是要處理 N+1 和延遲載入，所以我們關掉 OSIV、全域設定 batch fetch size，並在測試中用 Hibernate 統計斷言 SQL 次數。報表與每日批次則改用 JdbcClient，SQL 可以直接交給 DBA 審查，批次也用 JDBC batch 搭配 MySQL 的 `rewriteBatchedStatements`。

範例二：

> 公司既有系統都是 MyBatis，資料表由 DBA 設計，SQL 需要審查，所以延續 MyBatis。後來導入 MyBatis-Plus 減少單表 CRUD 的重複程式碼，但規定多表 join 一律寫 XML，Wrapper 不出 Service 層，並開啟防全表更新外掛。

## 建議閱讀順序

| 你的情況 | 讀法 |
| --- | --- |
| 新手、要找第一份工作 | 先理解 JDBC（JdbcClient）→ JPA → MyBatis |
| 公司用 JPA | JPA 與 Hibernate 進階全讀 |
| 公司用 MyBatis / MP | MyBatis → MyBatis-Plus |
| 準備面試 | 本頁 → 各頁最後的地雷清單與面試問答 |
| 想提升 SQL 型別安全 | jOOQ |
| 對 DDD 有興趣 | Spring Data JDBC |
