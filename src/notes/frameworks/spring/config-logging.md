# 外部化設定與日誌

## 設定來源的優先順序

同一個屬性可能出現在很多地方，後面的覆蓋前面的。由低到高：

| 優先序 | 來源 | 典型用途 |
| --- | --- | --- |
| 1（最低） | `SpringApplication.setDefaultProperties` | 程式內建預設值 |
| 2 | `@PropertySource` | 很少用 |
| 3 | 設定檔（`application.yml` 等，細分見下） | 主要設定 |
| 4 | `random.*` | 隨機值 |
| 5 | 作業系統環境變數 | 容器與雲端部署 |
| 6 | Java 系統屬性（`-Dkey=value`） | |
| 7 | `SPRING_APPLICATION_JSON` | 一次傳入一包 JSON 設定 |
| 8 | 命令列參數（`--key=value`） | 臨時覆寫 |
| 9 | 測試中的 `@SpringBootTest(properties=...)`、`@DynamicPropertySource`、`@TestPropertySource` | 測試 |
| 10（最高） | DevTools 全域設定 | 開發機 |

設定檔本身又有順序，同樣由低到高：

1. jar 內的 `application.properties` / `application.yml`
2. jar 內的 `application-{profile}.properties` / `.yml`
3. jar 外的 `application.properties` / `.yml`
4. jar 外的 `application-{profile}.properties` / `.yml`

jar 外的位置指的是工作目錄下的 `./` 與 `./config/`。同一個位置同時有 `.properties` 和 `.yml` 時，`.properties` 優先，建議整個專案只用一種格式。

### 實務上的分工

- `application.yml`（放在 jar 內）：所有環境共用的預設值。
- `application-local.yml`：本機開發用。
- 正式環境的差異：用**環境變數**注入，不要把正式環境的設定檔放進 jar。
- 密碼、金鑰：用 Kubernetes Secret、Vault、AWS Secrets Manager 注入，**絕對不要提交到版本控制**。

## 寬鬆綁定

綁定 `@ConfigurationProperties` 時，屬性名稱的寫法很寬鬆。下面這些寫法都能綁定到 `maxRetries` 欄位：

| 寫法 | 出現在 |
| --- | --- |
| `app.payment.max-retries` | 設定檔（官方推薦的 kebab-case） |
| `app.payment.maxRetries` | 設定檔 |
| `app.payment.max_retries` | 設定檔 |
| `APP_PAYMENT_MAXRETRIES` | 環境變數 |

環境變數的轉換規則：把 `.` 換成 `_`、刪掉 `-`、全部大寫。清單的索引寫成 `_0_`，例如 `APP_SERVERS_0_HOST`。

`@Value` 只支援有限的寬鬆綁定，在 `@Value` 中請一律使用 kebab-case（`@Value("${app.payment.max-retries}")`），這樣環境變數覆寫才能正常運作。

## `@ConfigurationProperties`

這是管理設定的推薦方式。用 record 寫最簡潔：

```java
@Validated
@ConfigurationProperties(prefix = "app.payment")
public record PaymentProperties(
        @NotNull URI baseUrl,
        @DefaultValue("3s") Duration timeout,
        @DefaultValue("3") @Min(0) @Max(10) int maxRetries,
        @DefaultValue List<String> allowedCurrencies,
        @DefaultValue Retry retry) {

    public record Retry(@DefaultValue("200ms") Duration initialDelay,
                        @DefaultValue("2.0") double multiplier) {}
}
```

```java
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(PaymentProperties.class) // 或在主程式加 @ConfigurationPropertiesScan
class AppConfig { }
```

```yaml
app:
  payment:
    base-url: https://pay.example.com
    timeout: 5s
    allowed-currencies: TWD,USD,JPY
    retry:
      initial-delay: 1s
```

已驗證的行為：

- 沒有設定的欄位使用 `@DefaultValue`。`@DefaultValue` 不帶值時，清單會是空清單、巢狀 record 會用它自己的預設值建立，而不是 `null`。
- `Duration` 支援 `500ms`、`3s`、`5m`、`1h`、`2d` 這類寫法；`DataSize` 支援 `10MB`。
- 驗證失敗（例如 `max-retries=99`）時，**應用程式啟動失敗**，錯誤訊息會指出哪個屬性不合法。
- 必填欄位（`@NotNull URI baseUrl`）沒有設定時同樣啟動失敗。

「設定錯誤就啟動失敗」是很重要的特性。比起上線後第一次用到才發現設定錯誤，啟動失敗會讓部署直接中止，問題在影響使用者之前就被擋下來。

### 與 `@Value` 的比較

| 面向 | `@ConfigurationProperties` | `@Value` |
| --- | --- | --- |
| 結構 | 有型別、可巢狀 | 單一值 |
| 寬鬆綁定 | 完整支援 | 有限 |
| 驗證 | 支援 JSR-303 | 不支援 |
| IDE 提示 | 搭配註解處理器有自動完成 | 無 |
| SpEL | 不支援 | 支援 |

## 多文件 YAML、Profile 與匯入

### 多文件 YAML

一個 YAML 檔案可以用 `---` 分成多個文件，用 `spring.config.activate.on-profile` 指定啟用條件：

```yaml
app:
  feature-x: false
---
spring:
  config:
    activate:
      on-profile: local
app:
  feature-x: true
```

舊寫法 `spring.profiles: local`（放在文件內）在 Boot 2.4 已棄用，Boot 3 起不再支援。

Profile 群組可以一次啟用多個 profile：

```yaml
spring:
  profiles:
    group:
      prod: "prod-db,prod-mq"
```

### 匯入其他設定

```yaml
spring:
  config:
    import:
      - optional:file:./.env[.properties]   # 本機的 .env 檔，不存在也沒關係
      - configtree:/etc/secrets/            # Kubernetes 掛載的 Secret，每個檔案是一個屬性
```

`configtree` 很適合 Kubernetes：Secret 掛載成目錄後，檔名就是屬性名稱，檔案內容就是值。

## 日誌

### 預設配置

Spring Boot 預設使用 SLF4J 作為介面、Logback 作為實作。你的程式碼只依賴 SLF4J：

```java
private static final Logger log = LoggerFactory.getLogger(OrderService.class);

log.info("Order {} placed by {}", orderId, userId); // 用佔位符，不要字串串接
```

用佔位符而不是字串串接，是因為日誌等級沒開時，佔位符版本不會做字串組合，效能較好。

```yaml
logging:
  level:
    root: info
    com.example: debug
    org.hibernate.SQL: debug                      # 印出 SQL
    org.hibernate.orm.jdbc.bind: trace            # 印出 SQL 參數值（Hibernate 6 起的 logger 名稱）
  group:
    payment: com.example.payment, com.stripe      # 自訂群組，一次調整多個套件
  file:
    name: logs/app.log
  logback:
    rollingpolicy:
      max-file-size: 100MB
      max-history: 14
```

Boot 4 起 Logback 寫檔預設使用 UTF-8，主控台輸出則使用主控台的字元集。Windows 主控台若出現中文亂碼，檢查終端機的編碼設定。

### 結構化日誌

在容器與雲端環境，日誌通常送到 Loki、Elasticsearch、CloudWatch 這類系統集中查詢。JSON 格式比純文字容易解析與查詢。Boot 3.4 起內建結構化日誌：

```yaml
logging:
  structured:
    format:
      console: ecs   # 可選 ecs（Elastic）、logstash、gelf（Graylog）
```

輸出的每一行都是一個 JSON 物件，包含時間、等級、logger、訊息、執行緒、trace ID 等欄位。MDC（Mapped Diagnostic Context）中的值會自動成為 JSON 欄位：

```java
MDC.put("orderId", String.valueOf(orderId));
try {
    process();
} finally {
    MDC.remove("orderId"); // 執行緒會被重用，一定要清掉
}
```

搭配 Micrometer Tracing 或 OpenTelemetry 時，`traceId`、`spanId` 會自動放進 MDC，讓日誌和分散式追蹤可以互相跳轉。

### 自訂 Logback 設定

需要更細的控制時，在 `src/main/resources` 放 `logback-spring.xml`（**不是** `logback.xml`）。加上 `-spring` 後綴，Boot 才能先完成初始化，讓你在檔案中使用 Spring 的擴充：

```xml
<configuration>
    <include resource="org/springframework/boot/logging/logback/defaults.xml"/>
    <include resource="org/springframework/boot/logging/logback/console-appender.xml"/>

    <springProfile name="local">
        <root level="INFO"><appender-ref ref="CONSOLE"/></root>
    </springProfile>

    <springProfile name="!local">
        <!-- 正式環境改用非同步 appender，避免 I/O 阻塞業務執行緒 -->
    </springProfile>
</configuration>
```

### 執行中調整日誌等級

開啟 Actuator 的 `loggers` 端點後，不用重啟就能調整等級：

```bash
curl -X POST localhost:8080/actuator/loggers/com.example.payment \
     -H 'Content-Type: application/json' -d '{"configuredLevel":"DEBUG"}'
```

這在正式環境排查問題時非常有用，但這個端點必須受到權限保護。
