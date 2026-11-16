# JDBC 與交易管理

> 交易是後端工程師最該精通、也最容易出錯的主題。標示「已驗證」的陷阱在來源都寫成了測試，在 H2 上執行；RuntimeException 回滾的案例另外在 PostgreSQL 18 上驗證過。表格中標「—」的情境是依原理推導，沒有寫成測試。

## JdbcClient

Framework 6.1 新增的 `JdbcClient` 是 `JdbcTemplate` 的流暢版本，簡單查詢用它最順手：

```java
@Repository
public class AccountDao {
    private final JdbcClient jdbc;

    public AccountDao(JdbcClient jdbc) { this.jdbc = jdbc; }

    public long open(String owner, BigDecimal balance) {
        var keys = new GeneratedKeyHolder();
        jdbc.sql("insert into account(owner, balance) values (?, ?)")
                .params(owner, balance)
                .update(keys, "id");
        return keys.getKey().longValue();
    }

    public Optional<Account> find(long id) {
        return jdbc.sql("select id, owner, balance from account where id = :id")
                .param("id", id)
                .query(Account.class) // 自動對應到 record 的欄位
                .optional();
    }
}
```

什麼時候用 JDBC 而不是 JPA：報表與複雜查詢、批次處理、需要完全掌控 SQL、團隊對 ORM 不熟。很多專案兩者並用：寫入走 JPA，複雜查詢走 JDBC。

## `@Transactional` 的運作原理

1. 容器建立 `AccountService` 時，因為有 `@Transactional` 方法，BPP 回傳一個 CGLIB 代理。
2. 呼叫代理的方法時，`TransactionInterceptor` 依照註解上的設定，向 `PlatformTransactionManager` 要求開始交易。
3. 交易管理器從 `DataSource` 取得一條連線，設定 `autoCommit = false`，**把連線綁在目前執行緒的 `ThreadLocal` 上**（透過 `TransactionSynchronizationManager`）。
4. 你的方法中，`JdbcClient`、`JdbcTemplate`、JPA 的 `EntityManager` 取得連線時，都會先查 `ThreadLocal`，所以它們用的是同一條連線、同一個交易。
5. 方法正常結束：提交。拋出例外：依回滾規則決定提交或回滾。
6. 歸還連線，清除 `ThreadLocal`。

第 3 步解釋了兩個常見問題：

- **交易不會跨執行緒**。`@Async` 方法、`CompletableFuture.supplyAsync()`、平行串流中執行的程式碼，都不在原本的交易裡。
- 不同的 `DataSource` 有各自的交易管理器，一個 `@Transactional` 不能同時管兩個資料庫。

Boot 會依照 classpath 自動建立交易管理器：只有 JDBC 時是 `JdbcTransactionManager`，有 JPA 時是 `JpaTransactionManager`。`JpaTransactionManager` 同時能管理 JDBC 的操作，所以 JPA 與 `JdbcClient` 可以在同一個交易中混用。

## 回滾規則

**預設只有 `RuntimeException` 和 `Error` 會觸發回滾，checked exception 不會。**

```java
@Transactional
public void transferThenCheckedException(long from, long to, BigDecimal amount) throws Exception {
    add(from, amount.negate());
    add(to, amount);
    throw new Exception("checked boom"); // 交易會「提交」，錢被扣了！（已驗證）
}

@Transactional(rollbackFor = Exception.class)
public void transferRollbackForChecked(...) throws Exception {
    ...
    throw new Exception("checked boom"); // 回滾（已驗證）
}
```

這個設計來自 EJB 的傳統：checked exception 被視為「可預期的業務結果」，不一定代表交易失敗。但在現代 Java 中這個區分很少有人遵守，所以這是一個經典陷阱。

建議：

- 業務例外一律繼承 `RuntimeException`。
- 如果團隊一定要用 checked exception，可以寫一個組合註解統一加上 `rollbackFor = Exception.class`。
- Framework 6.2 起，也可以用 `@EnableTransactionManagement(rollbackOn = RollbackOn.ALL_EXCEPTIONS)` 改變全域預設。

## 傳播行為

傳播行為決定「已經有交易時，再呼叫另一個 `@Transactional` 方法會怎樣」。

| 傳播 | 外層有交易 | 外層沒有交易 | 典型用途 |
| --- | --- | --- | --- |
| `REQUIRED`（預設） | 加入外層交易 | 開新交易 | 絕大多數情況 |
| `REQUIRES_NEW` | **暫停**外層，開一個完全獨立的新交易 | 開新交易 | 稽核日誌、不管成敗都要留下的紀錄 |
| `NESTED` | 在外層交易中建立儲存點（savepoint），失敗只回滾到儲存點 | 開新交易 | 批次處理中部分失敗可容忍 |
| `SUPPORTS` | 加入 | 不用交易執行 | 唯讀查詢 |
| `NOT_SUPPORTED` | 暫停外層，不用交易執行 | 不用交易執行 | 不該在交易中做的事 |
| `MANDATORY` | 加入 | 拋例外 | 強制呼叫端必須有交易 |
| `NEVER` | 拋例外 | 不用交易執行 | 很少用 |

### `REQUIRES_NEW` 的例子

```java
@Service
public class AuditService {
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void log(String message) { ... insert into audit_log ... }
}

@Service
public class AccountService {
    @Transactional
    public void withdrawAndAuditThenFail(long id, BigDecimal amount) {
        add(id, amount.negate());
        audit.log("withdraw " + amount); // 獨立交易，立刻提交
        throw new IllegalStateException("outer failed");
    }
}
// 結果：扣款回滾，但稽核紀錄留下來了（已驗證）
```

`REQUIRES_NEW` 的代價：它需要**第二條資料庫連線**（外層交易的連線還被佔著）。在高並行下，如果連線池只有 10 條，10 個請求同時進入外層交易各拿一條，再各自需要第二條給 `REQUIRES_NEW`，就會全部卡住等連線，形成死鎖。使用 `REQUIRES_NEW` 時，連線池要預留足夠的空間。

## rollback-only：吞掉例外也沒用

這是面試與實務中都很常見的陷阱（已驗證）：

```java
@Transactional
public void swallowInnerFailure(long id, BigDecimal amount) {
    add(id, amount.negate());
    try {
        audit.logOrFail("will fail"); // 也是 @Transactional（REQUIRED），內部拋出 RuntimeException
    } catch (IllegalStateException ignored) {
        // 以為吞掉就沒事了
    }
}
// 結果：方法結束時拋出 UnexpectedRollbackException:
// "Transaction silently rolled back because it has been marked as rollback-only"
// 扣款也被回滾了
```

**原因**：`logOrFail` 使用 `REQUIRED`，加入了外層交易。例外穿過它的代理時，`TransactionInterceptor` 判斷要回滾，但它不是交易的發起者，不能真的回滾，只能把**整個交易**標記成 rollback-only。外層方法吞掉例外、正常結束，嘗試提交時發現交易已被標記，只好回滾並拋出 `UnexpectedRollbackException` 告訴你：「你以為提交成功了，其實沒有」。

如果內層失敗可以容忍，先決定要隔離哪些修改：需要獨立提交可考慮 `REQUIRES_NEW`；需要回滾到儲存點則確認交易管理器與驅動是否支援 `NESTED`。`JpaTransactionManager` 預設不啟用巢狀交易；即使開啟，JDBC 儲存點也不會同步回復 JPA 持久化上下文中的實體狀態。

移除內層的 `@Transactional` 不代表脫離外層交易：資料存取仍可能使用外層綁定的連線。雖然少了一層攔截器標記 rollback-only，資料庫錯誤本身仍可能使交易無法繼續，不能把移除註解當作失敗隔離方案。

## 交易失效的情境

| 情境 | 原因 | 已驗證 |
| --- | --- | --- |
| 同一類別內的方法互相呼叫 | 自呼叫不經過代理 | 是 |
| 拋出 checked exception | 預設不回滾 | 是 |
| 例外被 catch 住沒有往外拋 | 代理可能視為正常返回；但若內層或資料庫已標記回滾，仍不能提交 | — |
| 方法是 `private` | CGLIB 無法覆寫，註解被忽略 | — |
| 類別或方法是 `final` | CGLIB 無法覆寫 | — |
| 物件不是 Spring bean（自己 new 的） | 沒有代理 | — |
| 在新執行緒中執行 | 交易綁在原本的執行緒上 | — |
| 資料表使用不支援交易的儲存引擎（例如 MySQL 的 MyISAM） | 資料庫層面不支援 | — |
| 多個資料來源時用錯交易管理器 | 交易開在另一個資料庫上 | — |

補充：Framework 6.0 起，CGLIB 代理的 `@Transactional` 也支援 `protected` 與 package-private 方法（已驗證），以前只支援 `public`。

## 其他屬性與程式化交易

### 其他屬性

```java
@Transactional(
    isolation = Isolation.READ_COMMITTED, // 隔離等級，預設用資料庫的預設值
    timeout = 5,                          // 秒
    readOnly = true,
    rollbackFor = BusinessException.class,
    noRollbackFor = WarningException.class,
    label = "order-query"                 // 給觀測工具用的標籤
)
```

**隔離等級**：

| 等級 | 髒讀 | 不可重複讀 | 幻讀 | 備註 |
| --- | --- | --- | --- | --- |
| `READ_UNCOMMITTED` | 可能 | 可能 | 可能 | 幾乎不用 |
| `READ_COMMITTED` | 不會 | 可能 | 可能 | PostgreSQL、Oracle、SQL Server 的預設 |
| `REPEATABLE_READ` | 不會 | 不會 | 可能* | MySQL InnoDB 的預設（*InnoDB 透過 MVCC 與 next-key lock 大致避免了幻讀） |
| `SERIALIZABLE` | 不會 | 不會 | 不會 | 最安全，衝突時資料庫會讓交易失敗，要搭配重試 |

**`readOnly = true`** 的實際效果：

- Hibernate 不做髒檢查，也不保留實體的快照，節省記憶體與 CPU。
- JDBC 連線設為唯讀，部分資料庫與驅動會據此最佳化。
- 搭配讀寫分離的路由資料來源時，可以據此把查詢導到唯讀副本。

**`timeout`** 的實際運作方式：Spring 依交易剩餘的時間設定每個 JDBC statement 的查詢逾時，並在每次建立 statement 時檢查期限，已經超過就拋出 `TransactionTimedOutException`。它不會中斷正在執行的 Java 程式碼，所以如果超時之後方法不再存取資料庫，交易仍然會正常提交。把它理解成「資料庫操作的逾時」比「整個交易的逾時」更準確。

### 程式化交易

需要在一個方法中控制多個交易邊界時，用 `TransactionTemplate`：

```java
@Service
public class BatchImporter {
    private final TransactionTemplate tx;

    public BatchImporter(PlatformTransactionManager transactionManager) {
        this.tx = new TransactionTemplate(transactionManager);
        this.tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    public void importAll(List<Row> rows) {
        for (int i = 0; i < rows.size(); i += 500) {
            List<Row> chunk = rows.subList(i, Math.min(i + 500, rows.size()));
            tx.executeWithoutResult(status -> chunk.forEach(this::insert)); // 每 500 筆一個交易
        }
    }
}
```

程式化交易沒有代理，所以沒有自呼叫的問題，邊界也一目了然。

`TransactionTemplate` 預設是 `REQUIRED`，若外層已有交易，每批會加入同一筆交易，不能保證各自提交。此例明確使用 `REQUIRES_NEW`，讓每批獨立提交；前面已成功的批次不會因後面失敗而撤銷。外層若持有連線，仍需評估第二條連線的需求。多個交易管理器並存時，建構子也要用 `@Qualifier` 選對管理器。

## 長交易的危害

交易應該盡量短。最常見的錯誤是在交易中呼叫外部服務：

```java
@Transactional
public void placeOrder(Order order) {
    orderRepository.save(order);
    paymentClient.charge(order);   // HTTP 呼叫，可能等好幾秒
    inventoryClient.reserve(order); // 又一個 HTTP 呼叫
}
```

問題：

1. 交易期間一直佔著一條資料庫連線，外部服務一慢，連線池就被耗盡。
2. 交易期間持有的鎖一直不釋放，其他交易被擋住。
3. 外部呼叫成功了但交易後來回滾，兩邊的狀態不一致（錢扣了，訂單沒了）。

改善方向：

- 把外部呼叫移到交易之外：先在短交易中把訂單存成「待付款」，提交後再呼叫付款，再用另一個短交易更新狀態。
- 需要跨服務的一致性時，使用 Saga 模式或交易外送箱。
