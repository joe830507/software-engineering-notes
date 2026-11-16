# Actuator 與可觀測性

> 這裡只講 Spring 這一側。OTLP、Grafana、Loki、Tempo、Prometheus 的完整串接需要另外的資料。

## Actuator 端點

加入 `spring-boot-starter-actuator` 後，Boot 提供一組管理端點：

| 端點 | 用途 | 敏感程度 |
| --- | --- | --- |
| `health` | 健康狀態 | 低（細節要保護） |
| `info` | 應用程式資訊（版本、Git commit） | 低 |
| `metrics` / `prometheus` | 指標 | 中 |
| `loggers` | 查看與調整日誌等級 | 高（可以修改） |
| `env` / `configprops` | 環境與設定值 | 高（可能洩漏密碼；Boot 3 起預設遮蔽所有值，不只是密碼） |
| `beans` / `conditions` / `mappings` | 容器中的 bean、自動配置報告、所有路由 | 中 |
| `threaddump` / `heapdump` | 執行緒與記憶體傾印 | 高（heapdump 包含記憶體中的所有資料） |

**預設只透過 HTTP 公開 `health`**。其他端點要明確開啟：

```yaml
management:
  endpoints:
    web:
      exposure:
        include: health,info,prometheus,loggers
  endpoint:
    health:
      show-details: when-authorized
  server:
    port: 8081   # 管理端點用另一個埠號，只在內部網路開放
```

用獨立的管理埠號是很好的做法：Prometheus 與內部的管理工具打 8081，對外的 Ingress 只轉發 8080。

但 **Kubernetes 探針不建議打管理埠**。管理埠跑在另一個獨立的 Web 伺服器上，跟主程式不共用同一套 Web 基礎設施，主程式的 8080 已經無法服務時，8081 上的探針仍可能回 200。Boot 的建議是讓探針也出現在主埠上：

```yaml
management:
  endpoint:
    health:
      probes:
        add-additional-paths: true   # 在主埠 8080 額外提供 /livez 與 /readyz
```

Kubernetes 的 liveness 與 readiness 探針就改打 `8080/livez` 與 `8080/readyz`。

## 健康檢查與 Kubernetes 探針

Boot 4 起，liveness 與 readiness 探針群組**預設開啟**：

| 探針 | 端點 | 失敗時 Kubernetes 會 | 應該包含 |
| --- | --- | --- | --- |
| Liveness | `/actuator/health/liveness` | **重啟** Pod | 只有應用程式本身是否還活著 |
| Readiness | `/actuator/health/readiness` | 暫時**不送流量** | 是否準備好接受請求 |

**不要把資料庫等外部依賴放進 liveness。**資料庫短暫故障時，所有 Pod 的 liveness 都失敗，Kubernetes 會把它們全部重啟，問題反而擴大。外部依賴最多放進 readiness，而且要想清楚：資料庫掛了，把所有 Pod 都標成不接流量，真的比回傳錯誤好嗎？

自訂健康指標：

```java
@Component
class PaymentGatewayHealth implements HealthIndicator {
    @Override
    public Health health() {
        return gatewayReachable()
                ? Health.up().withDetail("latencyMs", 42).build()
                : Health.down().withDetail("reason", "timeout").build();
    }
}
```

## 指標：Micrometer

Micrometer 是指標的抽象層，相當於「指標界的 SLF4J」。程式碼只依賴 Micrometer，後端可以是 Prometheus、OTLP、Datadog 等。

Boot 自動提供大量指標：HTTP 請求（`http.server.requests`）、JVM 記憶體與 GC、HikariCP 連線池、Tomcat 執行緒、`RestClient` 呼叫、Kafka、快取命中率。

自訂業務指標：

```java
@Service
public class OrderService {
    private final Counter ordersPlaced;
    private final Timer checkoutTimer;

    public OrderService(MeterRegistry registry) {
        this.ordersPlaced = Counter.builder("orders.placed").tag("channel", "web").register(registry);
        this.checkoutTimer = Timer.builder("orders.checkout").publishPercentileHistogram().register(registry);
    }

    public void place(Order order) {
        checkoutTimer.record(() -> doPlace(order));
        ordersPlaced.increment();
    }
}
```

**標籤（tag）的基數要控制**：不要把使用者 id、訂單 id 這種無限多種值的東西當標籤，每種組合都會產生一條時間序列，監控系統的記憶體會爆。

## Observation 與分散式追蹤

### Observation API

Micrometer 1.10 起提供 Observation API：**一次埋點，同時產生指標與追蹤**：

```java
@Observed(name = "orders.checkout", contextualName = "checkout")
public Receipt checkout(Cart cart) { ... }
```

`@Observed` 要生效需要兩個條件：加入 `spring-boot-starter-aspectj`，並設定 `management.observations.annotations.enabled=true`（預設是 false）。少了任何一個，註解都不會有作用，也不會有錯誤訊息。

或程式化：

```java
Observation.createNotStarted("orders.checkout", observationRegistry)
        .lowCardinalityKeyValue("channel", "web")
        .observe(() -> doCheckout(cart));
```

Spring 的 MVC、`RestClient`、JDBC、Kafka 等元件都已經內建 Observation，所以只要加入追蹤的依賴，跨服務的追蹤就會自動串起來。

### 分散式追蹤與 OpenTelemetry

Boot 4 新增 `spring-boot-starter-opentelemetry`，用 OTLP 協定同時匯出指標與追蹤：

```yaml
management:
  opentelemetry:
    tracing:
      export:
        otlp:
          endpoint: http://otel-collector:4318/v1/traces
  tracing:
    sampling:
      probability: 0.1   # 預設就是 0.1；開發環境可設成 1.0，正式環境不要 100% 取樣
```

`traceId`、`spanId` 會自動放進日誌的 MDC，結構化日誌中就有這兩個欄位，在 Grafana 中可以從日誌跳到追蹤，反之亦然。Boot 4.1 也開始讀取標準的 OpenTelemetry 環境變數（例如 `OTEL_EXPORTER_OTLP_ENDPOINT`），並讓 `@Async` 方法自動傳遞追蹤上下文。
