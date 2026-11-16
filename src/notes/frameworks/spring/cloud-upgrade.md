# Spring Cloud 與版本升級

## Spring Cloud 與微服務

> 微服務的架構原則（服務切分、資料一致性、通訊模式）需要另外的資料。這裡只講 Spring Cloud 提供了什麼，以及在 2026 年該怎麼選。

### 版本對應

Spring Cloud 以「發布列車」管理版本，每個列車對應特定的 Spring Boot 版本：

| Spring Cloud | 代號 | 對應 Spring Boot |
| --- | --- | --- |
| 2024.0 | Moorgate | 3.4 |
| 2025.0 | Northfields | 3.5 |
| 2025.1 | Oakwood | **4.0** |
| 2026.0 | （開發中，M1） | 4.1 |

2026 年 10 月時，**用到 Spring Cloud 的服務請停在 Boot 4.0.x**，等 2026.0 正式發布再升級到 4.1。用 BOM 管理版本：

```xml
<dependencyManagement>
    <dependencies>
        <dependency>
            <groupId>org.springframework.cloud</groupId>
            <artifactId>spring-cloud-dependencies</artifactId>
            <version>2025.1.3</version>
            <type>pom</type>
            <scope>import</scope>
        </dependency>
    </dependencies>
</dependencyManagement>
```

### 主要元件

| 需求 | Spring Cloud 元件 | 在 Kubernetes 上的替代方案 |
| --- | --- | --- |
| API 閘道 | Spring Cloud Gateway | Ingress Controller、Gateway API、雲端的 API Gateway |
| 集中設定 | Spring Cloud Config | ConfigMap、Secret、外部的設定服務 |
| 服務發現 | Eureka、Consul | Kubernetes Service 的 DNS |
| 用戶端負載平衡 | Spring Cloud LoadBalancer | Kubernetes Service、Service Mesh |
| 宣告式 HTTP 客戶端 | OpenFeign | Spring Framework 的 HTTP Interface |
| 斷路器 | Spring Cloud Circuit Breaker + Resilience4j | Service Mesh（Istio）的熔斷 |
| 訊息驅動 | Spring Cloud Stream | 直接用 Spring for Apache Kafka |

一個重要的觀察：**很多 Spring Cloud 元件解決的問題，Kubernetes 平台本身已經解決了**。在 Kubernetes 上，服務發現用 Service DNS 就好，不需要 Eureka；設定用 ConfigMap 加 Secret，不一定需要 Config Server。新專案不要因為「微服務就要用 Spring Cloud」而把所有元件都加進來，先看平台已經提供了什麼。

仍然很有價值的部分：

- **Gateway**：路由、限流、認證轉發、請求改寫，需要在應用層做的閘道邏輯。
- **Resilience4j**：斷路器、艙壁隔離、限流、逾時，是服務間呼叫的必備保護。

### Gateway

Spring Cloud Gateway 有兩種版本，2025 年起的 artifact 名稱：

| 版本 | Starter | 說明 |
| --- | --- | --- |
| 反應式 | `spring-cloud-starter-gateway-server-webflux` | 傳統的版本，基於 WebFlux |
| Servlet | `spring-cloud-starter-gateway-server-webmvc` | 基於 Spring MVC，可搭配虛擬執行緒 |

舊的 `spring-cloud-starter-gateway` 名稱已經不再發布新版本。

```yaml
spring:
  cloud:
    gateway:
      server:
        webflux:
          routes:
            - id: orders
              uri: http://orders-service:8080
              predicates:
                - Path=/api/orders/**
              filters:
                - name: CircuitBreaker
                  args:
                    name: orders
                    fallbackUri: forward:/fallback/orders
```

設定屬性的前綴也隨著改名變成 `spring.cloud.gateway.server.webflux.*`（Servlet 版是 `...server.webmvc.*`）。網路上的舊教學多半是 `spring.cloud.gateway.routes`，照抄會沒有作用。

### Resilience4j

```java
@Service
public class InventoryClient {

    @CircuitBreaker(name = "inventory", fallbackMethod = "fallback")
    @Retry(name = "inventory")
    @TimeLimiter(name = "inventory")
    public CompletableFuture<Stock> check(long productId) { ... }

    private CompletableFuture<Stock> fallback(long productId, Throwable t) {
        return CompletableFuture.completedFuture(Stock.unknown(productId));
    }
}
```

```yaml
resilience4j:
  circuitbreaker:
    instances:
      inventory:
        sliding-window-size: 20
        failure-rate-threshold: 50       # 失敗率超過 50% 就斷開
        wait-duration-in-open-state: 30s # 斷開 30 秒後進入半開狀態試探
```

Resilience4j 的這些註解是用 AOP 實作的。Boot 4 預設不再帶入 AOP 支援，除了 Resilience4j 的 Spring Boot 整合模組，還要加入 `spring-boot-starter-aspectj`，否則註解不會有作用，也不會有錯誤訊息（跟 `@Observed` 一樣）。

斷路器的三個狀態：

| 狀態 | 行為 |
| --- | --- |
| 關閉（CLOSED） | 正常呼叫，統計失敗率 |
| 開啟（OPEN） | 直接失敗或走 fallback，不呼叫下游，讓下游有時間恢復 |
| 半開（HALF_OPEN） | 放少量請求試探，成功就關閉，失敗就再開啟 |

斷路器的價值在於「**快速失敗**」：下游已經掛了，與其每個請求都等到逾時（佔住執行緒與連線），不如立刻失敗。Framework 7 內建的 `@Retryable` 與 `@ConcurrencyLimit` 可以處理簡單的重試與並行限制；需要斷路器時才引入 Resilience4j。

## 從 Boot 3 升級到 4

Boot 3.5 的開源支援已在 2026 年 6 月結束，升級到 4.x 是現在就該排進計畫的事。

### 升級前

1. **先升級到最新的 3.5.x**，消除所有棄用警告。3.x 中標為棄用的 API 在 4.0 都被移除了。
2. **確認 JDK 版本**：最低 17，建議趁這次升到 21 或 25。
3. **確認相依的第三方函式庫都有支援 Boot 4 的版本**：特別是 springdoc、MapStruct、Lombok、各種 starter。
4. **確認測試覆蓋率**足以發現回歸問題。

### 用 OpenRewrite 自動處理

OpenRewrite 有現成的升級配方，能自動處理大部分的機械式修改（依賴名稱、套件、註解、屬性）：

```bash
./mvnw -U org.openrewrite.maven:rewrite-maven-plugin:run \
  -Drewrite.recipeArtifactCoordinates=org.openrewrite.recipe:rewrite-spring:RELEASE \
  -Drewrite.activeRecipes=org.openrewrite.java.spring.boot4.UpgradeSpringBoot_4_0
```

執行後仔細檢查 diff，自動化工具不一定能處理所有情況。

### 主要變更清單

**依賴與模組**

| 舊（Boot 3） | 新（Boot 4） |
| --- | --- |
| `spring-boot-starter-web` | `spring-boot-starter-webmvc` |
| `spring-boot-starter-aop` | `spring-boot-starter-aspectj`（只在使用 `@Aspect` 時需要） |
| `spring-boot-starter-oauth2-resource-server` | `spring-boot-starter-security-oauth2-resource-server` |
| `spring-boot-starter-oauth2-client` | `spring-boot-starter-security-oauth2-client` |
| `spring-boot-starter-web-services` | `spring-boot-starter-webservices` |
| 只加 `flyway-core` | 要加 `spring-boot-starter-flyway`（Liquibase 同理） |
| `spring-boot-starter-test` | 改用各技術的測試 starter，例如 `spring-boot-starter-webmvc-test` |
| `spring-boot-starter-undertow` | **已移除**，改用 Tomcat 或 Jetty |

如果一次改不完，可以先用 `spring-boot-starter-classic` 與 `spring-boot-starter-test-classic`，它們提供跟 Boot 3 一樣「所有自動配置都在」的狀態，讓專案先能編譯執行，再逐步換成具體的 starter。

**屬性**：加入 `spring-boot-properties-migrator`（runtime scope），啟動時它會列出所有改名的屬性並暫時幫你轉換。改完後記得移除。

**Jackson 3**

- 套件從 `com.fasterxml.jackson` 改成 `tools.jackson`，但註解仍在 `com.fasterxml.jackson.annotation`。
- `Jackson2ObjectMapperBuilderCustomizer` 改成 `JsonMapperBuilderCustomizer`。
- `@JsonComponent` 改成 `@JacksonComponent`，`@JsonMixin` 改成 `@JacksonMixin`。
- 自訂的 `ObjectMapper` bean 不再取代自動配置，要改定義 `JsonMapper`。
- `spring.jackson.read.*`、`spring.jackson.write.*` 移到 `spring.jackson.json.read.*`、`spring.jackson.json.write.*`（4.1 又新增了通用的 `spring.jackson.read.*`、`write.*`，以 4.1 的文件為準）。

**測試**

- `@MockBean`、`@SpyBean` 移除，改用 `@MockitoBean`、`@MockitoSpyBean`。
- `TestRestTemplate` 不再隨 `@SpringBootTest(webEnvironment = RANDOM_PORT)` 自動提供，要加 `@AutoConfigureTestRestTemplate`。
- JUnit 4 支援（`SpringRunner`）已棄用，JUnit 6 成為基準。

**Spring Framework 7**

- `javax.annotation`、`javax.inject` 支援移除，一律用 `jakarta.*`。
- `ListenableFuture` 移除，改用 `CompletableFuture`。
- Spring MVC 的路徑比對：尾斜線比對、後綴比對等舊選項已移除。
- `RestTemplate` 進入棄用流程，新程式碼用 `RestClient`。
- Spring Retry 不再由 Boot 管理版本，建議改用內建的 `@Retryable`。
- 可空性註解改用 JSpecify（`org.jspecify.annotations.Nullable`），使用 Kotlin 或 NullAway 的專案可能出現新的編譯錯誤。

**Spring Security 7**

- DSL 只能用 lambda 風格，`and()` 已移除。
- `authorizeRequests` 移除，改用 `authorizeHttpRequests`。
- `AntPathRequestMatcher`、`MvcRequestMatcher` 移除。

**Hibernate 7 與 JPA 3.2**

- `hibernate-jpamodelgen` 改名為 `hibernate-processor`。
- `@EntityScan` 移到 `org.springframework.boot.persistence.autoconfigure`。
- 請閱讀 Hibernate 7 的遷移指南，留意查詢語法與型別對應的細節變動。

**其他行為變化**

- Liveness 與 readiness 探針預設開啟。
- DevTools 的 LiveReload 預設關閉。
- Logback 寫檔預設使用 UTF-8。
- uber jar 預設不包含 `optional` 依賴。

### 建議的升級順序

1. 升級到最新的 3.5.x，修掉棄用警告。
2. 升級 JDK（如果需要）。
3. 執行 OpenRewrite 配方。
4. 加入 `spring-boot-properties-migrator`。
5. 修正編譯錯誤（Jackson、Security DSL、測試註解）。
6. 跑全部測試，特別注意 JSON 格式（日期、null 欄位）與安全規則的行為差異。
7. 在測試環境部署，比對 API 回應與升級前是否一致。
8. 移除 `properties-migrator` 與 classic starter。

驗收標準：升級後所有測試通過，API 回應的 JSON 與升級前一致（或差異都有記錄並確認可接受）。
