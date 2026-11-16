# HTTP 客戶端與並行模型

## HTTP 客戶端

### 該用哪一個

| 客戶端 | 風格 | 現況 |
| --- | --- | --- |
| `RestTemplate` | 同步、樣板方法 | Framework 7 已在文件中宣告棄用，7.1 會正式標上 `@Deprecated`。新程式碼不要用 |
| `RestClient` | 同步、流暢 API | **同步呼叫的首選**（Framework 6.1 起） |
| `WebClient` | 非同步、反應式 | WebFlux 應用，或需要串流、高並行時使用 |
| HTTP Interface | 宣告式介面，底層用 `RestClient` 或 `WebClient` | **推薦**，取代 OpenFeign 的大部分用途 |

### RestClient

```java
@Service
public class PaymentClient {
    private final RestClient client;

    public PaymentClient(RestClient.Builder builder, PaymentProperties props) { // 注入 Boot 預先設定好的 Builder
        this.client = builder.baseUrl(props.baseUrl().toString()).build();
    }

    public PaymentResult charge(ChargeRequest request) {
        return client.post()
                .uri("/charges")
                .header("Idempotency-Key", request.idempotencyKey())
                .body(request)
                .retrieve()
                .onStatus(HttpStatusCode::is4xxClientError, (req, res) -> {
                    throw new PaymentRejectedException(res.getStatusCode());
                })
                .body(PaymentResult.class);
    }
}
```

要點：

- **注入 `RestClient.Builder`**，不要自己 `RestClient.create()`。Boot 提供的 Builder 已經套用了 JSON 轉換器、觀測（trace 傳遞與指標）、`spring.http.clients.*` 的逾時設定。
- `retrieve()` 預設在 4xx、5xx 時拋出 `RestClientResponseException` 的子類別。`onStatus` 可以改成自己的例外。
- 需要讀取狀態碼和標頭時，用 `.toEntity(PaymentResult.class)`。

**一定要設定逾時**。沒有逾時，下游服務卡住時，你的執行緒會一直等下去，最後整個服務的執行緒池被耗盡：

```yaml
spring:
  http:
    clients:
      connect-timeout: 2s
      read-timeout: 5s
```

### HTTP Interface：宣告式客戶端

只寫介面，實作由 Spring 產生：

```java
@HttpExchange("/quotes")
public interface QuoteClient {

    record Quote(String symbol, BigDecimal price) {}

    @GetExchange("/{symbol}")
    Quote get(@PathVariable String symbol);

    @PostExchange
    Quote create(@RequestBody Quote quote);
}
```

Framework 7 加上 Boot 4 讓註冊變得很簡單：

```java
@Configuration(proxyBeanMethods = false)
@ImportHttpServices(group = "quotes", types = QuoteClient.class)
class ClientConfig { }
```

```yaml
spring:
  http:
    serviceclient:
      quotes:                      # 群組名稱
        base-url: https://quotes.example.com
        read-timeout: 3s
```

之後直接注入 `QuoteClient` 使用（已驗證：以 JDK 內建的 `HttpServer` 模擬外部服務，呼叫成功並正確轉換 JSON）。

「群組」的概念讓同一個外部服務的多個介面共用一組設定（base URL、逾時、認證）。需要程式化設定某個群組時，提供 `RestClientHttpServiceGroupConfigurer` bean。

和 OpenFeign 比較：HTTP Interface 是 Spring Framework 原生功能，不需要 Spring Cloud，也直接支援 `RestClient` 的所有能力。新專案建議優先使用。OpenFeign 已經進入「功能完成」狀態，Spring Cloud 官方也建議遷移到 HTTP Interface。

## 並行模型：WebFlux 與虛擬執行緒

### 問題：I/O 等待佔用執行緒

假設一個請求要花 5ms 計算、200ms 等待資料庫和外部 API。在「一個請求一條執行緒」模型中，這條執行緒有 97% 的時間在等待，卻一直被佔著。200 條執行緒的池子，理論上每秒最多處理大約 1000 個請求，CPU 卻幾乎是閒置的。

平台執行緒（作業系統執行緒）很貴：每條預設保留約 1MB 的堆疊空間，切換成本也高，所以不能無限增加。

### 解法一：反應式（WebFlux）

思路是「不要讓執行緒等待」。發出 I/O 請求後立刻釋放執行緒，等結果回來再用回呼繼續處理。少量執行緒（通常等於 CPU 核心數）就能處理大量並行連線。

```java
@GetMapping("/orders/{id}")
public Mono<OrderView> get(@PathVariable long id) {
    return orderRepository.findById(id)                       // Mono<Order>，R2DBC
            .zipWith(customerClient.get().uri("/customers/{id}", id)
                    .retrieve().bodyToMono(Customer.class))   // 兩個 I/O 並行
            .map(t -> new OrderView(t.getT1(), t.getT2()));
}
```

代價：

- **整條鏈都要是非阻塞的**。只要有一個地方呼叫了阻塞 API（JDBC、`Thread.sleep`、傳統的檔案 I/O），就會卡住少數幾條事件迴圈執行緒，整個服務的吞吐量崩潰。所以資料庫要改用 R2DBC，不能用 JPA。
- 程式碼難寫、難讀、難除錯。堆疊追蹤被切得支離破碎。
- 團隊學習成本高。

### 解法二：虛擬執行緒

Java 21 正式推出虛擬執行緒（Project Loom）。虛擬執行緒由 JVM 排程，建立成本極低，可以有幾百萬條。遇到阻塞的 I/O 時，JVM 會把它從底層的平台執行緒上「卸下」，讓平台執行緒去跑別的虛擬執行緒；I/O 完成後再「掛回」繼續執行。

效果是：**用同步、阻塞的寫法，得到接近反應式的並行能力**。Spring Boot 中只要一行：

```yaml
spring:
  threads:
    virtual:
      enabled: true
```

開啟後：

- Tomcat 用虛擬執行緒處理每個請求。
- `@Async`、`@Scheduled` 的執行器改用虛擬執行緒。
- 用 JDK `HttpClient` 實作的 HTTP 客戶端也使用虛擬執行緒（Boot 4）。
- Kafka、RabbitMQ 的監聽器容器也會使用虛擬執行緒。

### 虛擬執行緒的注意事項

1. **釘住（pinning）問題**：在 JDK 21 到 23，虛擬執行緒在 `synchronized` 區塊中阻塞時，會「釘住」底層的平台執行緒，無法卸下。如果很多虛擬執行緒同時在 `synchronized` 中等待 I/O，平台執行緒會被耗盡。JDK 24 透過 JEP 491 解決了這個問題。**使用虛擬執行緒時建議用 JDK 25**；停在 JDK 21 的話，要檢查程式和依賴中是否有在 `synchronized` 裡做 I/O，必要時改用 `ReentrantLock`。
2. **下游資源才是真正的瓶頸**：虛擬執行緒讓你可以同時有 1 萬個請求在處理，但資料庫連線池只有 10 條，9990 個請求會排隊等連線。**虛擬執行緒不會讓資料庫變快，它只是讓等待變便宜。**要記得設定連線取得的逾時（`spring.datasource.hikari.connection-timeout`），並考慮在入口加上限流。
3. **不要池化虛擬執行緒**：它本來就很便宜，用完就丟。要限制並行數就用 `Semaphore` 或 Framework 7 的 `@ConcurrencyLimit`。
4. **`ThreadLocal` 要小心**：每個虛擬執行緒都有自己的 `ThreadLocal`，百萬條虛擬執行緒各放一份大物件，記憶體會爆。不要用 `ThreadLocal` 當快取。
5. **CPU 密集的工作沒有幫助**：虛擬執行緒只對 I/O 等待有效。

### 怎麼選

| 情境 | 建議 |
| --- | --- |
| 一般的 CRUD 業務系統 | Spring MVC，有大量 I/O 等待時開虛擬執行緒 |
| 已經是 Spring MVC 加 JPA 的既有系統 | 升級到 JDK 25 後開虛擬執行緒，幾乎不用改程式碼 |
| 需要串流（Server-Sent Events、大量 WebSocket 連線）、背壓控制 | WebFlux |
| 閘道（Spring Cloud Gateway）這類純轉發的服務 | WebFlux（或 Gateway 的 MVC 版本搭配虛擬執行緒） |
| 團隊已經熟悉反應式、整條鏈都是非阻塞 | WebFlux |

2026 年的主流共識是：虛擬執行緒成熟後，大多數新的業務系統不需要為了效能選擇 WebFlux。WebFlux 仍然在串流與背壓這類它擅長的場景中有價值。
