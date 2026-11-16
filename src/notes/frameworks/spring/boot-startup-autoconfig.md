# 啟動流程與自動配置

## `SpringApplication.run()` 做了什麼

```java
public static void main(String[] args) {
    SpringApplication.run(DemoApplication.class, args);
}
```

這一行背後分成兩段：建構 `SpringApplication` 物件，以及執行 `run()`。

**建構階段**：

1. 推斷應用程式類型：classpath 上有 Servlet 相關類別就是 `SERVLET`，只有 WebFlux 就是 `REACTIVE`，都沒有就是 `NONE`。
2. 從所有 jar 的 `META-INF/spring.factories` 載入 `BootstrapRegistryInitializer`、`ApplicationContextInitializer`、`ApplicationListener`。
3. 推斷主類別（含 `main` 方法的那個）。

**`run()` 階段**：

```
建立 BootstrapContext
  → 發布 ApplicationStartingEvent
  → 準備 Environment（載入 application.yml、環境變數、命令列參數）
  → 發布 ApplicationEnvironmentPreparedEvent
  → 印出 Banner
  → 建立 ApplicationContext
  → 執行 ApplicationContextInitializer，發布 ApplicationContextInitializedEvent
  → 載入主類別為設定來源，發布 ApplicationPreparedEvent
  → refresh()：容器的核心流程
  → 發布 ApplicationStartedEvent
  → 執行 ApplicationRunner、CommandLineRunner
  → 發布 ApplicationReadyEvent
```

## `refresh()`：容器的核心

`AbstractApplicationContext.refresh()` 是整個 Spring Framework 最重要的方法。簡化後的步驟：

| 步驟 | 方法 | 做什麼 |
| --- | --- | --- |
| 1 | `prepareRefresh` | 初始化屬性來源、驗證必要屬性 |
| 2 | `obtainFreshBeanFactory` | 取得 `DefaultListableBeanFactory` |
| 3 | `prepareBeanFactory` | 註冊類別載入器、內建的 BPP、`Environment` 等特殊 bean |
| 4 | `invokeBeanFactoryPostProcessors` | **執行所有 BFPP**。其中 `ConfigurationClassPostProcessor` 會解析 `@Configuration`、`@ComponentScan`、`@Import`、`@Bean`，**自動配置也在這一步被載入**，產生所有 `BeanDefinition` |
| 5 | `registerBeanPostProcessors` | 建立並註冊所有 BPP |
| 6 | `initMessageSource` / `initApplicationEventMulticaster` | 國際化與事件廣播器 |
| 7 | `onRefresh` | Spring Boot 在這裡**建立內嵌的 Tomcat**（但還不接受請求） |
| 8 | `registerListeners` | 註冊事件監聽器 |
| 9 | `finishBeanFactoryInitialization` | **建立所有非延遲的 singleton bean**，你的 Service、Controller 在這一步誕生 |
| 10 | `finishRefresh` | 啟動實作 `SmartLifecycle` 的元件（包含**讓 Tomcat 開始接受連線**），發布 `ContextRefreshedEvent` |

從這張表可以推出幾個實用結論：

- 啟動慢，通常是第 4 步（掃描範圍太大、自動配置太多）或第 9 步（某個 bean 的初始化很慢，例如在 `@PostConstruct` 連外部服務）。
- 啟動失敗的錯誤訊息若提到 `BeanDefinition`，問題在第 4 步；若提到 `Error creating bean`，問題在第 9 步。
- Tomcat 在第 7 步建立、第 10 步才開始接受連線，所以 bean 都建好之前不會有請求進來。

## 啟動事件與啟動後的任務

### 啟動事件的完整順序

在 Spring Boot 4.1.1 上實際記錄到的順序（已驗證）：

```
ApplicationStartingEvent
ApplicationEnvironmentPreparedEvent
ApplicationContextInitializedEvent
ApplicationPreparedEvent
ServletWebServerInitializedEvent          ← Tomcat 已開始監聽埠號
ContextRefreshedEvent
ApplicationStartedEvent
AvailabilityChangeEvent(CORRECT)          ← Liveness：活著
ApplicationRunner / CommandLineRunner     ← 依 @Order 排序執行
ApplicationReadyEvent
AvailabilityChangeEvent(ACCEPTING_TRAFFIC) ← Readiness：可以接流量
（run() 回傳）
……應用程式關閉時……
AvailabilityChangeEvent(REFUSING_TRAFFIC)
ContextClosedEvent
```

前四個事件發生在容器建立之前或剛建立時，**這時候你的 `@Component` 還不存在**，所以用 `@EventListener` 監聽不到它們。要監聽這些早期事件，必須透過 `SpringApplication.addListeners()` 或在 `META-INF/spring.factories` 中註冊。

### 啟動後執行一段程式

```java
@Component
@Order(1)
class WarmUpRunner implements ApplicationRunner {
    @Override
    public void run(ApplicationArguments args) {
        // 預熱快取、檢查外部相依服務…
        if (args.containsOption("skip-warmup")) return;
    }
}
```

| 方式 | 時機 | 適合 |
| --- | --- | --- |
| `@PostConstruct` | 單一 bean 初始化時 | 只跟這個 bean 自己有關的初始化 |
| `ApplicationRunner` / `CommandLineRunner` | 所有 bean 建好、Tomcat 已啟動，但還沒標記為 Ready | 啟動任務，失敗時希望啟動失敗 |
| `@EventListener(ApplicationReadyEvent.class)` | 完全就緒後 | 不影響啟動成敗的背景任務 |

`ApplicationRunner` 拿到解析過的參數（`--name=value` 形式），`CommandLineRunner` 拿到原始字串陣列。Runner 執行期間，Readiness 狀態還不是 `ACCEPTING_TRAFFIC`，在 Kubernetes 上 readiness probe 會失敗，流量不會進來，所以「預熱完才接流量」的需求放在 Runner 裡剛好。

### 優雅關機

Spring Boot 預設開啟優雅關機（`server.shutdown=graceful`，Boot 3.4 起成為預設）。收到 SIGTERM 時：

1. Readiness 改成 `REFUSING_TRAFFIC`。
2. Web 伺服器停止接受新連線，等待處理中的請求完成。
3. 等待時間上限是 `spring.lifecycle.timeout-per-shutdown-phase`（預設 30 秒）。
4. 依序關閉 `SmartLifecycle` 元件、銷毀 bean（呼叫 `@PreDestroy`）。

在 Kubernetes 上，Pod 被刪除時「從 Service 端點移除」與「送 SIGTERM」是同時發生的，可能還有少量請求在 SIGTERM 之後才被導到這個 Pod。常見做法是加一個 `preStop` 的短暫 sleep（例如 5 到 10 秒），並讓 `terminationGracePeriodSeconds` 大於 sleep 時間加上關機等待時間。

## 自動配置原理

### 自動配置在做什麼

自動配置就是一堆 Spring Boot 預先寫好的 `@Configuration` 類別，每一個都附帶條件：「如果 classpath 上有某個類別、如果使用者沒有自己定義某個 bean、如果某個屬性是 true，就建立這些 bean」。以 `DataSource` 為例：

```java
// 節錄自 Boot 4.1 的 DataSourceAutoConfiguration
@AutoConfiguration(before = DataSourceInitializationAutoConfiguration.class)
@ConditionalOnClass({ DataSource.class, EmbeddedDatabaseType.class })
@ConditionalOnMissingBean(type = "io.r2dbc.spi.ConnectionFactory") // 用 R2DBC 的專案不建立
@EnableConfigurationProperties(DataSourceProperties.class)
public class DataSourceAutoConfiguration {

    @Configuration(proxyBeanMethods = false)
    @ConditionalOnMissingBean({ DataSource.class, XADataSource.class }) // 使用者沒定義才建立
    @Import({ DataSourceConfiguration.Hikari.class, ... })
    static class PooledDataSourceConfiguration { }
}
```

### 載入機制

```
@SpringBootApplication（含 @EnableAutoConfiguration）
  → @Import(AutoConfigurationImportSelector)
  → 讀取所有 jar 的 META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports
  → 快速過濾：用預先編譯的中繼資料檢查 @ConditionalOnClass 等，不載入類別
  → 依 before / after 排序
  → 在使用者設定之後才處理（DeferredImportSelector）
  → 逐一評估完整條件，符合的才註冊 BeanDefinition
```

幾個關鍵設計：

1. **清單檔案**：每個 jar 用 `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports` 列出自己的自動配置類別，一行一個。Boot 2.7 以前放在 `spring.factories` 的 `EnableAutoConfiguration` 鍵下，**Boot 3.0 起不再支援舊寫法**。網路上的舊教學如果叫你寫 `spring.factories`，自動配置不會被載入。
2. **延後處理**：`AutoConfigurationImportSelector` 是 `DeferredImportSelector`，會等到使用者的所有設定都處理完才處理自動配置。這就是 `@ConditionalOnMissingBean` 能正確運作的原因：評估時使用者的 bean 已經註冊了。
3. **快速過濾**：建置時會產生 `META-INF/spring-autoconfigure-metadata.properties`，記錄每個自動配置需要哪些類別。啟動時先用這份資料過濾，不需要真的載入類別，大幅加快速度。
4. **Boot 4 的模組化**：以前所有自動配置都在一個巨大的 `spring-boot-autoconfigure` jar 裡；Boot 4 拆成每個技術一個模組。沒有加入對應 starter 的技術，連自動配置類別都不存在，classpath 更乾淨，啟動也更快。

### 常用條件註解

| 註解 | 條件成立的情況 |
| --- | --- |
| `@ConditionalOnClass` / `@ConditionalOnMissingClass` | classpath 上有（沒有）指定類別 |
| `@ConditionalOnBean` / `@ConditionalOnMissingBean` | 容器中有（沒有）指定 bean |
| `@ConditionalOnProperty` | 屬性存在且等於指定值 |
| `@ConditionalOnBooleanProperty` | 布林屬性為 true（Boot 3.5 起，比上一個簡潔） |
| `@ConditionalOnWebApplication` / `@ConditionalOnNotWebApplication` | 是否為 Web 應用 |
| `@ConditionalOnResource` | 某個資源檔存在 |
| `@ConditionalOnExpression` | SpEL 運算式為 true |
| `@ConditionalOnSingleCandidate` | 指定型別的 bean 只有一個，或有一個是 `@Primary` |
| `@ConditionalOnThreading` | 是否啟用虛擬執行緒 |
| `@ConditionalOnCloudPlatform` | 執行在指定的雲端平台（Kubernetes 等） |

**`@ConditionalOnBean` 與 `@ConditionalOnMissingBean` 只該用在自動配置類別中**。在一般的 `@Configuration` 中使用，結果取決於設定類別被處理的順序，很不可靠。

### 查看哪些自動配置生效了

```bash
java -jar app.jar --debug
```

啟動日誌會印出 `CONDITIONS EVALUATION REPORT`：

```
Positive matches:
-----------------
   DataSourceAutoConfiguration matched:
      - @ConditionalOnClass found required classes 'javax.sql.DataSource', ... (OnClassCondition)

Negative matches:
-----------------
   MongoAutoConfiguration:
      Did not match:
         - @ConditionalOnClass did not find required class 'com.mongodb.client.MongoClient' (OnClassCondition)
```

開啟 Actuator 時，`/actuator/conditions` 端點也提供同樣資訊。這是排查「為什麼我的 bean 沒被建立」或「為什麼自動配置沒有退讓」最直接的工具。

排除不需要的自動配置：

```java
@SpringBootApplication(exclude = DataSourceAutoConfiguration.class)
```

或用屬性：`spring.autoconfigure.exclude=...`。

### 覆寫自動配置的三個層次

依侵入程度由低到高：

1. **改屬性**：`spring.datasource.hikari.maximum-pool-size=20`。能用屬性解決就用屬性。
2. **提供 Customizer**：很多自動配置會套用容器中所有的 `XxxCustomizer` bean，讓你微調而不必整個取代：

   ```java
   @Bean
   JsonMapperBuilderCustomizer omitNulls() { // Boot 4 / Jackson 3：輸出 JSON 時省略 null 欄位
       return builder -> builder.changeDefaultPropertyInclusion(
               incl -> incl.withValueInclusion(JsonInclude.Include.NON_NULL));
   }
   ```

   常見的有 `RestClientCustomizer`、`WebServerFactoryCustomizer`、`JsonMapperBuilderCustomizer`、`HibernatePropertiesCustomizer`。
3. **自己定義 bean**：自動配置因為 `@ConditionalOnMissingBean` 而退讓。代價是要自己負責所有設定，Boot 的屬性綁定可能不再生效。

## 自製 Starter

假設公司內部有一個共用的問候元件，希望各專案加入依賴就能用，也能透過屬性調整。

### 自動配置類別

```java
@AutoConfiguration
@ConditionalOnClass(GreetingService.class)
@ConditionalOnProperty(prefix = "greeting", name = "enabled", havingValue = "true", matchIfMissing = true)
@EnableConfigurationProperties(GreetingAutoConfiguration.GreetingProperties.class)
public class GreetingAutoConfiguration {

    @ConfigurationProperties("greeting")
    public record GreetingProperties(@DefaultValue("Hello") String prefix) {}

    @Bean
    @ConditionalOnMissingBean // 使用者自己定義了 GreetingService，這裡就退讓
    GreetingService greetingService(GreetingProperties properties) {
        return name -> properties.prefix() + ", " + name;
    }
}
```

註冊檔 `src/main/resources/META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports`：

```
com.example.greeting.GreetingAutoConfiguration
```

### 用 ApplicationContextRunner 測試

比啟動整個應用程式快得多（以下四個測試都已驗證）：

```java
class GreetingAutoConfigurationTest {

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(GreetingAutoConfiguration.class));

    @Test
    void createsDefaultBean() {
        runner.run(ctx -> assertThat(ctx.getBean(GreetingService.class).greet("Joe")).isEqualTo("Hello, Joe"));
    }

    @Test
    void propertiesCustomizeTheBean() {
        runner.withPropertyValues("greeting.prefix=嗨")
              .run(ctx -> assertThat(ctx.getBean(GreetingService.class).greet("Joe")).isEqualTo("嗨, Joe"));
    }

    @Test
    void userBeanWins() {
        runner.withUserConfiguration(UserConfig.class)
              .run(ctx -> {
                  assertThat(ctx).hasSingleBean(GreetingService.class);
                  assertThat(ctx.getBean(GreetingService.class).greet("Joe")).isEqualTo("custom Joe");
              });
    }

    @Test
    void canBeSwitchedOff() {
        runner.withPropertyValues("greeting.enabled=false")
              .run(ctx -> assertThat(ctx).doesNotHaveBean(GreetingService.class));
    }

    @Configuration
    static class UserConfig {
        @Bean GreetingService myGreeting() { return name -> "custom " + name; }
    }
}
```

### 正式專案的結構

通常分成兩個模組：

| 模組 | 內容 |
| --- | --- |
| `greeting-spring-boot-autoconfigure` | 自動配置類別、屬性類別、`.imports` 檔，相依的函式庫標成 `optional` |
| `greeting-spring-boot-starter` | 空的 jar，只有 `pom.xml`，把自動配置模組和必要的函式庫拉進來 |

命名慣例：Spring 官方的 starter 叫 `spring-boot-starter-xxx`，第三方的應該叫 `xxx-spring-boot-starter`，不要佔用官方的命名空間。

加入 `spring-boot-configuration-processor` 註解處理器，編譯時會產生 `META-INF/spring-configuration-metadata.json`，IDE 就能自動完成你的屬性並顯示說明。
