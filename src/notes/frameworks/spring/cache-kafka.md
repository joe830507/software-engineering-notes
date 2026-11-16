# 快取、Redis 與 Kafka

## Spring 的快取抽象

```java
@Configuration
@EnableCaching
class CacheConfig { }

@Service
public class ProductService {

    @Cacheable(cacheNames = "products", key = "#id")
    public Product find(long id) { return repository.findById(id).orElseThrow(); }

    @CacheEvict(cacheNames = "products", key = "#product.id")
    public void update(Product product) { repository.save(product); }

    @CachePut(cacheNames = "products", key = "#result.id") // 一定執行方法，並把結果放進快取
    public Product create(Product product) { return repository.save(product); }
}
```

已驗證的行為：

- 同一個 id 查兩次，第二次直接從快取回傳，方法只執行一次。
- `@CacheEvict` 之後再查，會重新執行方法。
- **自呼叫不經過快取**，每次都執行（又是代理）。

快取抽象和實作是分開的。Boot 依 classpath 依固定順序偵測實作，Redis 排在 Caffeine 前面，所以兩者都在 classpath 上時會選 Redis；需要明確指定時用 `spring.cache.type`。都沒有就用簡單的 `ConcurrentHashMap`（沒有過期機制，不要用在正式環境）。

### 本機快取或分散式快取

| 面向 | Caffeine（本機） | Redis（分散式） |
| --- | --- | --- |
| 速度 | 奈秒等級，就在 JVM 記憶體中 | 毫秒等級，要走網路 |
| 多個實例之間 | 各自一份，資料可能不一致 | 共用一份 |
| 容量 | 受限於 JVM 記憶體 | 可以很大 |
| 序列化 | 不需要 | 需要（要注意版本相容） |
| 適合 | 很少變動的參考資料、設定 | 多個實例需要一致的資料、session、限流計數 |

也可以兩層並用：先查本機，沒有再查 Redis。

## Redis 快取設定

Redis 快取有兩種設定方式，**擇一使用**：只用屬性，或自己定義 `RedisCacheConfiguration` bean。

### 只用屬性

```yaml
spring:
  cache:
    type: redis
    redis:
      time-to-live: 10m          # 一定要設 TTL
      key-prefix: "app:v1:"      # 版本前綴，資料結構改變時換前綴即可讓舊快取失效
  data:
    redis:
      host: localhost
      port: 6379
```

只用屬性時，值預設使用 JDK 序列化，產生的資料無法閱讀，類別改變後還可能反序列化失敗。建議改成 JSON。

### 自己定義 bean

```java
@Bean
RedisCacheConfiguration cacheConfiguration() {
    return RedisCacheConfiguration.defaultCacheConfig()
            .entryTtl(Duration.ofMinutes(10))
            .prefixCacheNameWith("app:v1:")                         // 自己定義 bean 後，YAML 的 key-prefix 不再生效
            .serializeValuesWith(RedisSerializationContext.SerializationPair
                    .fromSerializer(RedisSerializer.json())); // 以 Jackson 序列化成 JSON
}
```

**注意**：一旦自己定義了 `RedisCacheConfiguration` bean，Boot 就會完全使用它，`spring.cache.redis.*`（`time-to-live`、`key-prefix` 等）都不再套用，而且不會有任何警告。所以要在 bean 裡重新設定 TTL 與前綴。如果只想調整序列化、其他設定仍然交給屬性，改用 `RedisCacheManagerBuilderCustomizer` 比較安全。

## 快取的經典問題

| 問題 | 情境 | 對策 |
| --- | --- | --- |
| 快取穿透 | 查詢不存在的資料，每次都打到資料庫 | 快取空值（短 TTL）、布隆過濾器 |
| 快取擊穿 | 熱門 key 過期的瞬間，大量請求同時打到資料庫 | `@Cacheable(sync = true)` 讓同一個實例中只有一條執行緒去載入；分散式時用互斥鎖 |
| 快取雪崩 | 大量 key 同時過期 | TTL 加上隨機值 |
| 資料不一致 | 更新資料庫後快取還是舊的 | 先更新資料庫、再刪除快取（不是更新快取），並設定 TTL 兜底 |

「更新後刪除快取」而不是「更新後寫入快取」，是因為兩個並行的更新可能以相反的順序寫入快取，留下舊值；刪除則讓下一次讀取重新載入最新資料。

## Kafka：生產者與消費者

> Kafka 本身的概念（topic、partition、consumer group、offset）請參考 Kafka 的學習資料，這裡只講 Spring 這一側。Boot 4.1.1 搭配 Spring for Apache Kafka 4.1 與 Kafka 用戶端 4.2。

### 生產者

```java
@Service
public class OrderEventPublisher {
    private final KafkaTemplate<String, OrderPlaced> kafka;

    public OrderEventPublisher(KafkaTemplate<String, OrderPlaced> kafka) { this.kafka = kafka; }

    public CompletableFuture<SendResult<String, OrderPlaced>> publish(OrderPlaced event) {
        // 用訂單 id 當 key：同一筆訂單的事件會進同一個 partition，保證順序
        return kafka.send("orders.placed", String.valueOf(event.orderId()), event);
    }
}
```

```yaml
spring:
  kafka:
    bootstrap-servers: localhost:9092
    producer:
      acks: all                      # 所有同步副本都收到才算成功
      properties:
        enable.idempotence: true     # 冪等生產者，避免重試造成重複（Kafka 3 起預設開啟）
```

`send()` 是非同步的。**不處理回傳的 future，就不知道訊息有沒有送成功。**

### 消費者

```java
@Component
public class InventoryListener {

    @KafkaListener(topics = "orders.placed", groupId = "inventory")
    public void on(OrderPlaced event) {
        inventoryService.reserve(event.orderId());
    }
}
```

預設的確認模式是 `BATCH`：一批訊息全部處理完後才提交 offset。監聽器拋出例外時，交給錯誤處理器。

### 錯誤處理與死信佇列

預設的 `DefaultErrorHandler` 會重試 9 次（共 10 次）、每次間隔 0，然後記錄日誌並跳過這筆訊息。實務上通常要改成「有退避地重試幾次，仍然失敗就送到死信 topic」：

```java
@Bean
DefaultErrorHandler errorHandler(KafkaTemplate<Object, Object> template) {
    var recoverer = new DeadLetterPublishingRecoverer(template); // 預設送到 <原topic>-dlt
    var backOff = new ExponentialBackOff(1_000, 2.0);            // 1 秒起跳，每次乘 2
    backOff.setMaxElapsedTime(30_000);                            // 總共最多重試 30 秒
    var handler = new DefaultErrorHandler(recoverer, backOff);
    handler.addNotRetryableExceptions(ValidationException.class); // 資料錯誤重試也沒用，直接送 DLT
    return handler;
}
```

Boot 會把容器中唯一的 `CommonErrorHandler` bean 自動套用到監聽器容器。

已用 Testcontainers 啟動 Kafka 4.2 驗證：設定 `new FixedBackOff(100, 2)`（重試 2 次）時，依序送出 `good-1`、`bad-2`、`good-3`，`bad-2` 被處理 3 次後送進 `orders-dlt`，另外兩筆正常處理。

上面的重試是「阻塞式」的：重試期間這個 partition 後面的訊息都在等。如果不能接受，可以用 `@RetryableTopic` 做非阻塞重試，失敗的訊息被轉送到 `orders.placed-retry-0`、`-retry-1` 等重試 topic，原 topic 繼續往下處理，代價是失去順序。

## 訊息的可靠性

### 「剛好一次」是個迷思

Kafka 的預設保證是「至少一次」：消費者處理完但還沒提交 offset 時當機，重啟後同一筆訊息會再處理一次。所以**消費者必須是冪等的**。常見做法：

- 用業務上的唯一鍵做 upsert，或資料表加唯一索引。
- 記錄已處理過的訊息 id（處理紀錄表），處理前先檢查，並與業務更新放在同一個資料庫交易。

Kafka 的交易（`transactional.id`）只能保證「讀 Kafka、寫 Kafka」這條鏈的剛好一次，**不包含你的資料庫**。

### 資料庫與訊息的一致性：交易外送箱

```java
@Transactional
public void placeOrder(Order order) {
    orderRepository.save(order);
    kafka.send("orders.placed", ...); // 問題：交易回滾了，訊息卻已經送出；或交易提交了，送訊息卻失敗
}
```

這是「**雙寫問題**」。資料庫和 Kafka 是兩個系統，沒有辦法放在同一個交易裡。標準解法是**交易外送箱（transactional outbox）**：

1. 在同一個資料庫交易中，寫入業務資料，並在 `outbox` 表插入一筆待發送的事件。
2. 另一個程序（排程輪詢，或用 Debezium 讀取資料庫的變更日誌）把 `outbox` 中的事件送到 Kafka，成功後標記為已發送。
3. 因為可能重送，消費者仍然要冪等。

### 測試

用 Testcontainers 啟動真正的 Kafka：

```java
@SpringBootTest
@Testcontainers
class OrderEventsIT {
    @Container
    @ServiceConnection
    static KafkaContainer kafka = new KafkaContainer("apache/kafka-native:4.2.0"); // org.testcontainers.kafka.KafkaContainer，需加 testcontainers-kafka
}
```

面試時能解釋為什麼「在 `@Transactional` 方法中直接送 Kafka 訊息」是錯的，就是上面的雙寫問題。
