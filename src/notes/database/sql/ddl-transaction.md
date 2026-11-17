# 資料定義、約束、交易與檢視表

## 資料型別與 DDL

### 建立資料表

```sql
CREATE TABLE person (
  person_id  INT UNSIGNED NOT NULL AUTO_INCREMENT,    -- MySQL；PostgreSQL 用 GENERATED ... AS IDENTITY
  name       VARCHAR(40)  NOT NULL,
  gender     CHAR(1),
  birth_date DATE,
  CONSTRAINT pk_person PRIMARY KEY (person_id),
  CONSTRAINT chk_gender CHECK (gender IN ('M', 'F'))
);
```

設計流程：①列出實體與屬性 → ②正規化（拆成多張表、消除重複）→ ③寫 `CREATE TABLE`、定義主鍵／外鍵／約束。

### 資料型別選擇

| 類別 | 常用型別 | 提醒 |
|---|---|---|
| 字元 | `CHAR(n)`、`VARCHAR(n)`、`TEXT` | **代碼欄位用字串**（會有前導 0，如 `008`），數字型別會吃掉 0 |
| 整數 | `TINYINT`、`INT`、`BIGINT` | 主鍵用 `BIGINT` 預留空間 |
| 小數 | `DECIMAL(p,s)`、`FLOAT`、`DOUBLE` | **金額用 `DECIMAL`**，浮點數有誤差 |
| 日期時間 | `DATE`、`TIME`、`DATETIME`、`TIMESTAMP` | MySQL 的 TIMESTAMP 會做時區轉換，DATETIME 不會；PostgreSQL 應區分 timestamp 與 timestamptz |
| 布林 / JSON | `BOOLEAN`、`JSON` | MySQL 的 `BOOLEAN` 其實是 `TINYINT(1)` |

### 增刪改

```sql
INSERT INTO person (name, gender) VALUES ('Amy', 'F'), ('Bob', 'M');   -- 一次多列
INSERT INTO archive SELECT * FROM person WHERE ...;                     -- 來源是查詢

UPDATE person SET name = 'Amy Lin' WHERE person_id = 1;
DELETE FROM person WHERE person_id = 1;
```

- `UPDATE` / `DELETE` **沒寫 `WHERE` 就是整張表**。先 `SELECT` 同樣條件確認。
- 日期格式不合時：MySQL `STR_TO_DATE('11/17/2026', '%m/%d/%Y')`。
- 外來鍵檢查：`INSERT` 子表時父表必須已有該列；刪父表時依連鎖規則處理。

### ALTER 與 DROP

```sql
ALTER TABLE person ADD COLUMN phone VARCHAR(20);
ALTER TABLE person MODIFY COLUMN name VARCHAR(80) NOT NULL;   -- MySQL
ALTER TABLE person DROP COLUMN phone;
DROP TABLE person;
```

大表 `ALTER` 可能鎖表很久，線上變更要用 online DDL 或工具（`pt-online-schema-change`、`gh-ost`）。

## 索引

### 為什麼需要

沒索引 = 全表掃描（逐列看）；有索引 = 類似書本索引頁，沿多路平衡 B-tree 搜尋（O(log n)）。

```sql
CREATE INDEX idx_name ON person (name);
ALTER TABLE person ADD COLUMN email VARCHAR(254);
CREATE UNIQUE INDEX uq_email ON person (email);
CREATE INDEX idx_dept_hire ON emp (dept, hire_date);     -- 複合索引
SHOW INDEX FROM person;        DROP INDEX idx_name ON person;
```

### 種類

| 種類 | 用途 |
|---|---|
| **B-tree**（預設） | 等值、範圍、前綴比對、排序 |
| 唯一索引 | 同時保證不重複 |
| 複合索引 | 多欄；**最左前綴**原則 |
| 位圖（Bitmap） | 低基數欄位（性別、狀態），Oracle 常見；寫入頻繁的表不適合 |
| 全文索引 | 文字搜尋（MySQL `FULLTEXT`、PostgreSQL `GIN` + `tsvector`） |

### 索引怎麼被用到（以及怎麼失效）

複合索引 `(c1, c2, c3)` 的最左前綴：

| 條件 | 能用索引？ |
|---|---|
| `c1 = ? AND c2 = ?` | ✓ |
| `c1 = ? AND c3 = ?` | ✓（只用到 c1） |
| `c2 = ? AND c3 = ?` | ✗（沒有首欄） |

「**欄位要乾淨**」：索引欄位不要被包住：

```sql
WHERE col * 1.1 > 100              -- ✗   →   WHERE col > 100 / 1.1
WHERE SUBSTR(col, 1, 1) = 'a'      -- ✗   →   WHERE col LIKE 'a%'
WHERE str_col = 10                 -- ✗ 隱含型別轉換   →   WHERE str_col = '10'
WHERE col LIKE '%abc'              -- ✗ 非前方一致
WHERE col <> 5, col NOT IN (...)   -- 通常 ✗
```

### 缺點

- 佔儲存空間。
- **寫入變慢**：每次 `INSERT`/`UPDATE`/`DELETE` 都要維護索引。
- 索引不是越多越好：只為「常查詢、選擇性高」的欄位建立。
- 複合索引欄位順序：等值條件在前、範圍條件在後，選擇性高的在前。

更深入的內容見〈效能最佳化〉的索引設計與執行計畫。

## 約束條件

### 四種類型

| 約束 | 作用 |
|---|---|
| `PRIMARY KEY` | 唯一且非 NULL，一張表一個 |
| `UNIQUE` | 唯一（可有 NULL，且多半允許多個 NULL） |
| `FOREIGN KEY` | 值必須存在於父表 |
| `CHECK` | 自訂條件（MySQL 8.0.16+ 才真的檢查） |

另外還有 `NOT NULL`、`DEFAULT`。約束把「資料正確」交給資料庫保證，不要只靠應用程式。

```sql
ALTER TABLE orders
  ADD CONSTRAINT fk_cust FOREIGN KEY (customer_id) REFERENCES customer (customer_id)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE orders DROP FOREIGN KEY fk_cust;       -- MySQL
```

### 外來鍵連鎖規則

| 規則 | 父表資料被刪除／更新時，子表 |
|---|---|
| `RESTRICT`（或 `NO ACTION`） | 禁止（報錯，如 MySQL ERROR 1451） |
| `CASCADE` | 子表一起刪除／更新 |
| `SET NULL` | 子表外來鍵欄位設為 NULL |

### CHECK 與 CASE：表達「若 P 則 Q」

```sql
-- 若是「已出貨」則出貨日必填
CHECK (status <> 'SHIPPED' OR shipped_at IS NOT NULL)

-- 用 CASE 與 1 / 0 明確表達同一件事；MySQL 也允許回傳布林運算結果
CHECK (CASE WHEN status = 'SHIPPED'
            THEN CASE WHEN shipped_at IS NOT NULL THEN 1 ELSE 0 END
            ELSE 1 END = 1)
```

## 檢視表

### 什麼是 View

View 是**儲存起來的查詢**，不存資料，每次被查詢時才展開。用起來像一張表。

```sql
CREATE VIEW customer_vw AS
SELECT customer_id, first_name, last_name,
       CONCAT(LEFT(email, 2), '*****', SUBSTRING(email, LOCATE('@', email))) AS email   -- 遮蔽 email
FROM   customer;
```

### 為什麼用

1. **資料安全**：只公開部分欄位／列，遮蔽敏感資料。
2. **資料彙整**：把常用的彙整結果包起來，給報表用。
3. **隱藏複雜性**：把多表結合包成單一介面，欄位改名／拆表時舊程式不用改。
4. **結合已區隔的資料**（分區表的 `UNION ALL`）。

### 可更新的 View（MySQL）

經由 view 做 `UPDATE` / `INSERT` / `DELETE` 的限制：不能含彙整函式、`GROUP BY`/`HAVING`、`DISTINCT`、`UNION`、`SELECT` 清單的子查詢；多表時只能 `INNER JOIN`；運算式推導的欄位不能改。

### 注意事項

- View 內含彙整、集合運算時，被其他查詢使用，常需整個算完才能套條件（無法下推、用不到索引）。
- **View 不要放 `ORDER BY`**（列沒有順序）。
- 不要疊太多層 view，執行計畫會變得難以理解。
- **實體化視圖（Materialized View）**：把結果存起來，查詢快但要處理更新同步（Oracle、PostgreSQL 支援；MySQL 沒有）。

## 交易與鎖

### ACID

| 特性 | 意思 |
|---|---|
| **A**tomicity 原子性 | 全部成功，或全部不做 |
| **C**onsistency 一致性 | 交易前後都滿足約束 |
| **I**solation 隔離性 | 並行交易互不干擾（程度由隔離層級決定） |
| **D**urability 持久性 | 提交後不會因當機遺失（靠 redo log） |

### 基本操作

```sql
START TRANSACTION;          -- 或 BEGIN；或 SET autocommit = 0
UPDATE account SET balance = balance - 100 WHERE id = 1;
UPDATE account SET balance = balance + 100 WHERE id = 2;
SAVEPOINT sp1;              -- 儲存點必須在交易內建立
UPDATE account SET balance = balance - 10 WHERE id = 1;
ROLLBACK TO sp1;            -- 撤銷額外扣款，保留原本轉帳
COMMIT;                     -- 提交轉帳；儲存點隨交易結束失效
```

- 預設多數 DBMS 是 **auto-commit**：每個語句自成一筆交易。
- **DDL 常會隱含提交**（MySQL 的 `CREATE`/`ALTER`/`DROP` 會結束目前交易）。
- 當機：未提交的交易，重啟後會被撤銷。
- MySQL 的儲存引擎要用 **InnoDB**（支援交易、外鍵、列鎖）；MyISAM 不支援。

### 鎖

- **悲觀鎖**：先鎖再改（`SELECT ... FOR UPDATE`）。**樂觀鎖**：不預先持有讀鎖，但 UPDATE 仍會取鎖；更新並遞增版本號，條件檢查舊版本（`WHERE version = ?`，影響 0 列就重試）。
- 鎖的粒度：表鎖、頁鎖、**列鎖**（InnoDB）。細粒度並行好，但管理成本高。
- **死結（deadlock）**：A 鎖了甲等乙、B 鎖了乙等甲。DBMS 會偵測並犧牲一筆（回 ERROR 1213），應用程式要能**重試**。預防：所有交易用**相同的順序**取鎖、交易盡量短。

### 隔離層級

| 層級 | 可能發生 |
|---|---|
| `READ UNCOMMITTED` | 髒讀 |
| `READ COMMITTED`（PostgreSQL、Oracle 預設） | 不可重複讀 |
| `REPEATABLE READ`（**MySQL InnoDB 預設**） | 幻讀（InnoDB 以 next-key lock 大幅降低） |
| `SERIALIZABLE` | 防止序列化異常；仍可能死結或序列化失敗，應重試整筆交易 |

```sql
SELECT @@transaction_isolation;                          -- MySQL 8.0
SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED;
```

更完整的 Spring 交易傳播與失效情境見〈Spring 的 JDBC 與交易管理〉。

## 中繼資料與大型資料庫

### 中繼資料（information_schema）

資料庫自己的結構資訊也存在表裡，可以用 SQL 查：

```sql
SELECT table_name FROM information_schema.tables WHERE table_schema = 'mydb';
SELECT column_name, data_type, is_nullable
FROM   information_schema.columns
WHERE  table_schema = 'mydb' AND table_name = 'person';
SELECT * FROM information_schema.table_constraints WHERE table_schema = 'mydb';
SELECT * FROM information_schema.statistics WHERE table_schema = 'mydb';   -- MySQL 的索引
```

用途：①產生結構腳本；②部署後驗證（欄位與索引都建好了嗎）；③**動態 SQL**（用查出來的欄位清單拼出語句，再用 `PREPARE`/`EXECUTE` 執行）。

MySQL 常用指令：`SHOW TABLES`、`DESCRIBE person`、`SHOW CREATE TABLE person`、`SHOW INDEX FROM person`。

### 分割、叢集、切片

| 技術 | 做什麼 | 解決什麼 |
|---|---|---|
| **分割（Partitioning）** | 一張表依規則拆成多個實體片段（同一台機器） | 單表過大；刪除舊資料（`DROP PARTITION`）；分割修剪（partition pruning）加速查詢 |
| **叢集（Clustering）** | 多台伺服器共同服務 | 可用性、讀取擴充 |
| **切片（Sharding）** | 資料依 key 水平切到不同資料庫伺服器 | 單機寫入與容量上限；代價是跨片 join、分散式交易變複雜 |

分割方式：**範圍**（依日期）、**清單**（依地區）、**雜湊**（均勻分散）、**複合**。分割鍵通常要是主鍵／唯一鍵的一部分。

### SQL 與大數據

SQL 的語法已成為跨系統的通用介面：Hive、Spark SQL、Presto/Trino、Apache Drill 都能用 SQL 查詢檔案、JSON、NoSQL，甚至同一個查詢跨多個資料來源。

## 面試速查

**Q：交易的隔離層級各解決什麼問題？**
`READ UNCOMMITTED` 會髒讀；`READ COMMITTED` 解決髒讀但會不可重複讀；`REPEATABLE READ` 解決不可重複讀（InnoDB 也大幅降低幻讀）；`SERIALIZABLE` 提供可序列化結果，但仍須處理交易重試；並行成本依實作與負載而異。

**Q：主鍵與唯一索引差別？**
主鍵 = 唯一 + NOT NULL，一張表只有一個，InnoDB 以它作為叢集索引；唯一索引可以有多個，允許 NULL。

**Q：為什麼金額不能用 `FLOAT`？**
二進位浮點數無法精確表示許多十進位小數（如 0.1），累加會有誤差。用 `DECIMAL` 或以「分」為單位的整數。

**Q：View 能提升效能嗎？**
一般 View 只是儲存的查詢，不會變快，甚至因為多層巢狀讓計畫更難最佳化。要加速要用實體化視圖或改寫查詢。
