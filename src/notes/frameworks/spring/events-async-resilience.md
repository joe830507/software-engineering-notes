# 事件、非同步、排程與韌性

## 應用程式事件

事件讓元件之間不必直接相依。下單服務只負責發出「訂單已建立」，至於要寄信、加點數、通知倉庫，由各自的監聽器處理：

```java
public record OrderPlaced(long orderId, String customerEmail) {}

@Service
public class OrderService {
    private final ApplicationEventPublisher events;

    public OrderService(ApplicationEventPublisher events) { this.events = events; }

    @Transactional
    public void place(Order order) {
        // ...儲存訂單
        events.publishEvent(new OrderPlaced(order.id(), order.email()));
    }
}

@Component
class OrderMailer {
    @EventListener
    void on(OrderPlaced event) { /* 寄信 */ }
}
```

**`@EventListener` 預設是同步的**，在發布者的執行緒、而且在發布者的交易裡執行。監聽器拋出例外，會一路傳回 `publishEvent()` 的呼叫端，可能導致整筆訂單回滾。這通常不是你想要的。

### 交易事件

更常見的需求是「訂單**確定**存進資料庫後才寄信」，用 `@TransactionalEventListener`：

```java
@Component
public class DepositNotifier {

    @EventListener // 立即執行，在交易內
    void onEvent(DepositedEvent e) { ... }

    @TransactionalEventListener // 預設 phase = AFTER_COMMIT
    void afterCommit(DepositedEvent e) { ... }
}
```

已驗證的行為：

- 交易成功：兩個監聽器都執行，`@EventListener` 先、`@TransactionalEventListener` 在提交之後。
- 交易回滾：只有 `@EventListener` 執行過，`@TransactionalEventListener` 不會被呼叫。

可選的 phase：`BEFORE_COMMIT`、`AFTER_COMMIT`（預設）、`AFTER_ROLLBACK`、`AFTER_COMPLETION`。

兩個需要知道的細節：

1. **沒有交易時，`@TransactionalEventListener` 預設不會執行**。如果發布事件的方法沒有交易，事件會被丟掉。需要時設定 `fallbackExecution = true`。
2. **`AFTER_COMMIT` 階段已經沒有可用的交易**。在這個監聽器裡寫資料庫，如果呼叫的方法是預設的 `REQUIRED` 傳播，會加入一個已經提交的交易資源，寫入不會被提交。需要寫資料庫時，在監聽器呼叫的方法上用 `@Transactional(propagation = REQUIRES_NEW)`。Framework 6.1 起，如果直接在 `@TransactionalEventListener` 方法本身加 `@Transactional`，只允許 `REQUIRES_NEW` 或 `NOT_SUPPORTED`，用預設的 `REQUIRED` 會在啟動時就報錯。

### 事件不是可靠的訊息

應用程式在提交後、監聽器執行前當機，事件就遺失了。對於「一定要送達」的需求（例如通知其他服務），請用**交易外送箱模式（transactional outbox）**：在同一個交易裡把事件寫進 outbox 表，再由另一個程序讀取並送到 Kafka。Spring Modulith 提供了現成的事件發布登記表，可以參考。

## `@Async`

```java
@Configuration
@EnableAsync
class AsyncConfig { }

@Service
public class ReportService {
    @Async
    public CompletableFuture<Report> generate(long id) {
        Report report = buildSlowly(id);
        return CompletableFuture.completedFuture(report);
    }
}
```

要點：

- 回傳型別只能是 `void`、`Future`、`CompletableFuture`。
- **`void` 方法的例外不會傳回呼叫端**，預設只記錄日誌。需要處理時實作 `AsyncUncaughtExceptionHandler`。
- 自呼叫會讓 `@Async` 失效，方法會在呼叫端的執行緒同步執行（已驗證）。
- Spring Boot 會自動建立名為 `applicationTaskExecutor` 的執行緒池，執行緒名稱以 `task-` 開頭。用 `spring.task.execution.pool.*` 調整大小。
- 開啟虛擬執行緒（`spring.threads.virtual.enabled=true`）後，`@Async` 改用虛擬執行緒執行。

**ThreadLocal 不會自動傳遞到 `@Async` 執行緒**。`SecurityContextHolder`、MDC、`@Transactional` 的交易，都綁在原本的執行緒上。所以 `@Async` 方法裡沒有原本的交易，也拿不到目前登入的使用者（除非設定 `DelegatingSecurityContextAsyncTaskExecutor` 或 `TaskDecorator`）。

## 排程

```java
@Configuration
@EnableScheduling
class SchedulingConfig { }

@Component
class ReportJobs {
    @Scheduled(cron = "0 0 2 * * *", zone = "Asia/Taipei") // 每天凌晨 2 點
    void nightly() { ... }

    @Scheduled(fixedDelayString = "${app.sync.delay:30s}") // 上次結束後 30 秒再執行
    void sync() { ... }
}
```

| 屬性 | 意義 |
| --- | --- |
| `fixedRate` | 每隔固定時間觸發，不管上次是否結束 |
| `fixedDelay` | 上次結束後隔固定時間 |
| `cron` | Spring 的 cron 有 6 個欄位，比 Linux 多一個「秒」 |

**多個實例部署時，排程會在每個實例上各執行一次**。在 Kubernetes 上跑 3 個 Pod，凌晨 2 點的報表就會產生 3 份。解法：

- 用 ShedLock 這類分散式鎖，確保同一時間只有一個實例執行。
- 把排程移到外部（Kubernetes CronJob、雲端排程服務），應用程式只提供觸發端點。

## 內建的重試與並行限制（Framework 7）

Framework 7 把重試與並行限制納入核心，不再需要另外引入 Spring Retry。Spring Retry 專案已經進入維護模式，Boot 4 也不再管理它的版本。

```java
@Configuration
@EnableResilientMethods // 啟用 @Retryable 與 @ConcurrencyLimit
class ResilienceConfig { }

@Service
public class QuoteService {

    // 最多重試 3 次（總共最多呼叫 4 次），間隔 10ms 起跳、每次乘 2
    @Retryable(includes = IllegalStateException.class, maxRetries = 3, delay = 10, multiplier = 2)
    public Quote fetch(String symbol) { ... }

    // 同一時間最多 2 個執行緒進入，其他的等待
    @ConcurrencyLimit(2)
    public void callFragileApi() { ... }
}
```

已驗證的行為：

- 前 3 次失敗、第 4 次成功時，方法回傳成功結果。
- 一直失敗時，總共呼叫 4 次後拋出最後一次的例外。
- 6 個執行緒同時呼叫 `@ConcurrencyLimit(2)` 的方法，同時在方法內的執行緒最多 2 個。

`@Retryable` 的重要屬性：

| 屬性 | 說明 |
| --- | --- |
| `includes` / `excludes` | 哪些例外要重試、哪些不要 |
| `maxRetries` | 最大重試次數（不含第一次），預設 3 |
| `delay`、`multiplier`、`maxDelay` | 退避策略：初始延遲、倍率、上限 |
| `jitter` | 隨機抖動，避免多個客戶端同時重試造成「驚群」 |
| `timeout` | 整體逾時 |

也可以不用註解，直接用 `org.springframework.core.retry.RetryTemplate` 以程式方式重試。

### 重試的設計原則

1. **只重試暫時性錯誤**：網路逾時、503、資料庫死結。400、驗證失敗、業務規則錯誤重試幾次都一樣。
2. **被重試的操作必須是冪等的**：扣款 API 逾時，你不知道對方到底有沒有扣到，盲目重試可能扣兩次。要嘛對方支援冪等鍵（idempotency key），要嘛先查詢狀態再決定。
3. **重試要在交易外層**：用 `@Order` 讓重試切面包在交易切面外面。
4. **要有上限與退避**：無限重試加上固定間隔，會在下游故障時把它徹底打垮。

需要斷路器（circuit breaker）、艙壁隔離（bulkhead）、限流等更完整的韌性模式時，使用 Resilience4j。
