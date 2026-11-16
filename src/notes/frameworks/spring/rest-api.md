# REST API 實務

> 範例組成一個完整的訂單 API。標示「已驗證」的行為在來源都有對應測試；springdoc 與游標分頁沒有實測。

## Controller 與輸入驗證

### Controller 的基本寫法

```java
@RestController
@RequestMapping("/api/orders")
public class OrderController {

    public record CreateOrderRequest(@NotBlank String product,
                                     @Min(1) int quantity,
                                     @NotNull @Positive BigDecimal unitPrice) {}

    public record OrderV2(long id, String product, int quantity, BigDecimal total) {}

    @PostMapping
    public ResponseEntity<OrderV2> create(@Valid @RequestBody CreateOrderRequest request) {
        long id = ...;
        return ResponseEntity.created(URI.create("/api/orders/" + id)).body(toV2(id, request));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAuthority('SCOPE_orders:admin')")
    public ResponseEntity<Void> delete(@PathVariable long id) {
        ...
        return ResponseEntity.noContent().build();
    }
}
```

幾個習慣：

- **請求與回應都用專屬的 DTO**（這裡用 record），不要直接收發 JPA entity。直接回傳 entity 會把資料庫結構暴露給外部、觸發延遲載入問題，還可能洩漏不該公開的欄位。
- 建立資源回傳 `201 Created` 加 `Location` 標頭；刪除成功回傳 `204 No Content`。
- 路徑用名詞複數（`/orders`），動作用 HTTP 方法表達。

### 輸入驗證

`@Valid` 加在 `@RequestBody` 參數上，Spring 會在呼叫方法之前用 Bean Validation 檢查。失敗時拋出 `MethodArgumentNotValidException`，回應 400。

| 常用註解 | 檢查 |
| --- | --- |
| `@NotNull`、`@NotBlank`、`@NotEmpty` | 不可為 null；字串不可空白；集合不可為空 |
| `@Size(min, max)` | 長度 |
| `@Min`、`@Max`、`@Positive`、`@PositiveOrZero` | 數值範圍 |
| `@Email`、`@Pattern(regexp)` | 格式 |
| `@Past`、`@Future` | 日期 |
| `@Valid`（放在欄位上） | 遞迴驗證巢狀物件 |

路徑參數與查詢參數也能直接加限制註解。Spring 6.1 起不需要在類別上加 `@Validated`，內建的方法驗證會處理，失敗時拋出 `HandlerMethodValidationException`：

```java
@GetMapping("/search")
List<OrderV2> search(@RequestParam @Size(min = 2) String keyword) { ... }
```

業務規則（例如「庫存不足」）不屬於輸入驗證，放在 Service 層檢查，用自訂例外表達。

`@Positive`、`@Size` 等許多限制允許 null，必填欄位要另外搭配 `@NotNull`；`@NotBlank` 則本身就會拒絕 null 和空白字串。上例的單價因此同時標記 `@NotNull` 與 `@Positive`。

## 錯誤處理：ProblemDetail

RFC 9457（取代 RFC 7807）定義了 HTTP API 錯誤回應的標準格式，Content-Type 是 `application/problem+json`：

```json
{
  "type": "https://example.com/problems/order-not-found",
  "title": "Order not found",
  "status": 404,
  "detail": "Order 999 not found",
  "instance": "/api/orders/999",
  "orderId": 999
}
```

推薦的做法是寫一個全域例外處理器，並繼承 `ResponseEntityExceptionHandler`：

```java
@RestControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {

    @ExceptionHandler(OrderNotFoundException.class)
    ProblemDetail handleNotFound(OrderNotFoundException ex) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, ex.getMessage());
        problem.setType(URI.create("https://example.com/problems/order-not-found"));
        problem.setTitle("Order not found");
        problem.setProperty("orderId", ex.getOrderId()); // 自訂欄位
        return problem;
    }
}
```

已驗證的行為：

- 自訂例外回傳上面的 JSON，`instance` 會自動填入請求路徑。
- 繼承 `ResponseEntityExceptionHandler` 後，Spring MVC 的內建例外（驗證失敗、405、415、缺少參數…）也會自動轉成 `ProblemDetail`。驗證失敗時 `detail` 是 `Invalid request content.`。

如果不想自己寫處理器，也可以設定 `spring.mvc.problemdetails.enabled=true`，讓 Boot 註冊預設處理器處理內建例外。但只要你自己有繼承 `ResponseEntityExceptionHandler` 的 bean，Boot 的預設處理器就會退讓。

**驗證錯誤要回傳哪些欄位出錯**。預設的 `ProblemDetail` 沒有欄位明細，可以覆寫 `handleMethodArgumentNotValid` 加上：

```java
@Override
protected ResponseEntity<Object> handleMethodArgumentNotValid(
        MethodArgumentNotValidException ex, HttpHeaders headers, HttpStatusCode status, WebRequest request) {
    ProblemDetail body = ex.getBody();
    body.setProperty("errors", ex.getBindingResult().getFieldErrors().stream()
            .map(e -> Map.of("field", e.getField(), "message", e.getDefaultMessage()))
            .toList());
    return handleExceptionInternal(ex, body, headers, status, request);
}
```

**不要把例外的內部細節回傳給客戶端**：堆疊追蹤、SQL 錯誤訊息、內部類別名稱都可能洩漏系統資訊。未預期的例外統一回傳 500 與一個通用訊息，詳細內容只記錄在日誌，並附上 trace ID 方便對照。

## API 版本控制（Framework 7）

以前要做 API 版本，只能自己在路徑上加 `/v1/`、`/v2/`，或寫自訂的 `RequestCondition`。Framework 7 內建了版本控制：

```yaml
spring:
  mvc:
    apiversion:
      use:
        header: X-API-Version   # 也可以用 query-parameter、path-segment、media-type-parameter
      default: 1.0              # 請求沒帶版本時使用
```

```java
@GetMapping(path = "/{id}", version = "1.0")
public OrderV1 getV1(@PathVariable long id) { ... }

@GetMapping(path = "/{id}", version = "2.0+") // 2.0 以後（含）都走這裡
public OrderV2 getV2(@PathVariable long id) { ... }
```

已驗證的行為：

| 請求 | 結果 |
| --- | --- |
| 沒帶 `X-API-Version` | 使用預設的 1.0，回傳 `OrderV1`（沒有 `total` 欄位） |
| `X-API-Version: 2.0` | 回傳 `OrderV2` |
| `X-API-Version: 9.9` | 400，因為不是支援的版本 |

`2.0+` 是「基準版本」的寫法，意思是 2.0 以及之後的版本都對應到這個方法。這樣發布 2.1 時，沒有變動的端點不需要每個都加一個新方法。

**`2.0+` 不代表任何大於 2.0 的版本都會被接受**。請求的版本必須先出現在「支援清單」中，否則直接回 400（`Invalid API version`）。支援清單預設從程式碼中所有 `version` 屬性自動偵測。發布 2.3 時，如果沒有任何端點寫了 `version = "2.3"`，要另外宣告：

```yaml
spring:
  mvc:
    apiversion:
      supported: 2.3   # 自動偵測的 1.0、2.0 仍然有效
```

已驗證：宣告後，2.3 的請求會對應到 `2.0+` 的方法；沒有宣告的 2.5 仍然回 400。要宣告某個版本即將淘汰，提供 `ApiVersionDeprecationHandler` bean，會在回應中加上 `Deprecation`、`Sunset` 標頭。

客戶端也支援版本：

```java
RestClient client = builder.baseUrl("https://api.example.com")
        .apiVersionInserter(ApiVersionInserter.useHeader("X-API-Version"))
        .build();

String body = client.get().uri("/api/orders/1").apiVersion("2.0").retrieve().body(String.class);
```

### 版本放在哪裡

| 位置 | 優點 | 缺點 |
| --- | --- | --- |
| 路徑 `/v2/orders` | 一目了然，瀏覽器可直接測試，快取友善 | 同一資源有多個 URI |
| 標頭 `X-API-Version` | URI 乾淨 | 不容易在瀏覽器測試，要注意快取的 `Vary` 標頭 |
| 媒體類型 `application/vnd.example+json;v=2` | 最符合 REST 理論 | 最複雜 |

對外公開的 API 多數選擇路徑，內部服務之間用標頭也很常見。重要的是整個組織統一。

## 分頁

Spring Data 的 `Pageable` 可以直接當 Controller 參數：

```java
@GetMapping
public PagedModel<OrderV2> list(@PageableDefault(size = 20, sort = "createdAt", direction = DESC) Pageable pageable) {
    return new PagedModel<>(orderService.find(pageable)); // find 回傳 Page<OrderV2>
}
```

請求：`GET /api/orders?page=0&size=20&sort=createdAt,desc`。注意 `page` 從 0 開始。

**不要直接回傳 `Page`**。`PageImpl` 的 JSON 結構不是穩定的 API，Spring Data 會在日誌警告。用 `PagedModel` 包一層，或設定 `spring.data.web.pageable.serialization-mode=via-dto`，就會輸出穩定的結構（45 筆資料、每頁 20 筆、查詢第 3 頁時的實際輸出）：

```json
{
  "content": ["item41", "item42", "item43", "item44", "item45"],
  "page": { "size": 20, "number": 2, "totalElements": 45, "totalPages": 3 }
}
```

**深分頁的效能問題**：`OFFSET 100000` 時資料庫仍然要掃過前十萬筆。資料量大或需要無限捲動時，改用游標分頁（keyset pagination）：`where id < :lastSeenId order by id desc limit 20`。Spring Data 提供 `ScrollPosition` 與 `Window` 支援這種查詢。另外，回傳 `Page` 通常需要總數查詢，但部分頁面可由結果推算總數，因此不一定每次執行 `count(*)`。不需要總數時，可回傳 `Slice`，避免為總數計算付出額外成本。

## JSON：Jackson 3

Boot 4 預設使用 Jackson 3，最可能遇到的差異：

| 項目 | Jackson 2 | Jackson 3 |
| --- | --- | --- |
| 套件 | `com.fasterxml.jackson.databind` | `tools.jackson.databind` |
| 註解套件 | `com.fasterxml.jackson.annotation` | **不變**，所以 `@JsonProperty`、`@JsonIgnore` 不用改 |
| 主要類別 | `ObjectMapper` | `JsonMapper`（不可變，用 builder 建立） |
| 例外 | `JsonProcessingException`（checked） | `JacksonException`（unchecked），不用再 try-catch |
| Boot 的 Customizer | `Jackson2ObjectMapperBuilderCustomizer` | `JsonMapperBuilderCustomizer` |
| Boot 的元件註解 | `@JsonComponent` | `@JacksonComponent` |
| `java.time` 支援 | 要加 `jackson-datatype-jsr310` 模組 | 內建 |

Boot 4 加上 Jackson 3 的預設行為（已驗證）：

- `Instant`、`LocalDate` 輸出成 ISO-8601 字串（`"2026-10-20T01:02:03Z"`），不是數字時間戳記。
- `Duration` 輸出成 `"PT1M30S"`。
- `null` 欄位會輸出成 `null`。要省略，用 `spring.jackson.default-property-inclusion=non_null`。
- 反序列化時遇到未知欄位不會失敗。這對 API 的向後相容很重要：客戶端多送一個欄位不會讓伺服器報錯。

**注意**：在 Boot 4 中自己定義一個 `ObjectMapper` bean 不會取代自動配置的 mapper。要取代，定義 `JsonMapper` bean。

暫時無法遷移時，可以用 `spring.jackson.use-jackson2-defaults=true` 讓 Jackson 3 的行為接近 Jackson 2，或引入已棄用的 `spring-boot-jackson2` 模組。

## API 文件

社群最常用 springdoc-openapi：加入 `org.springdoc:springdoc-openapi-starter-webmvc-ui` 後，`/swagger-ui.html` 就有互動式文件，`/v3/api-docs` 輸出 OpenAPI JSON。請確認版本支援 Boot 4（springdoc 3.x 系列）。
