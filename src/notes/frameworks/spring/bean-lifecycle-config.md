# Bean 生命週期、作用域與設定

## Bean 生命週期

### 完整順序

一個 singleton bean 從誕生到銷毀的完整順序（已在 Spring Framework 7.0.9 實測，輸出跟表格相同）：

| 順序 | 階段 | 你可以介入的方式 |
| --- | --- | --- |
| 1 | 實例化 | 建構子 |
| 2 | 屬性注入 | `@Autowired` 欄位、setter |
| 3 | Aware 回呼 | `BeanNameAware`、`BeanFactoryAware`、`ApplicationContextAware` |
| 4 | 初始化前處理 | `BeanPostProcessor.postProcessBeforeInitialization` |
| 5 | 初始化（一） | `@PostConstruct` |
| 6 | 初始化（二） | `InitializingBean.afterPropertiesSet()` |
| 7 | 初始化（三） | `@Bean(initMethod = "...")` |
| 8 | 初始化後處理 | `BeanPostProcessor.postProcessAfterInitialization`（**AOP 代理在這裡產生**） |
| — | 使用中 | |
| 9 | 銷毀（一） | `@PreDestroy` |
| 10 | 銷毀（二） | `DisposableBean.destroy()` |
| 11 | 銷毀（三） | `@Bean(destroyMethod = "...")` |

驗證用程式碼（節錄）：

```java
static class OrderService implements BeanNameAware, InitializingBean, DisposableBean {
    OrderService() { LOG.add("1 建構子"); }
    @Autowired void setDependency(Dependency d) { LOG.add("2 屬性注入"); }
    @Override public void setBeanName(String name) { LOG.add("3 BeanNameAware: " + name); }
    @PostConstruct void postConstruct() { LOG.add("5 @PostConstruct"); }
    @Override public void afterPropertiesSet() { LOG.add("6 afterPropertiesSet"); }
    void customInit() { LOG.add("7 initMethod"); }
    @PreDestroy void preDestroy() { LOG.add("9 @PreDestroy"); }
    @Override public void destroy() { LOG.add("10 DisposableBean.destroy"); }
    void customDestroy() { LOG.add("11 destroyMethod"); }
}

@Configuration
static class Config {
    @Bean static LoggingPostProcessor loggingPostProcessor() { return new LoggingPostProcessor(); }
    @Bean Dependency dependency() { return new Dependency(); }
    @Bean(initMethod = "customInit", destroyMethod = "customDestroy")
    OrderService orderService() { return new OrderService(); }
}
```

### 實務重點

- **三種初始化方式擇一即可**。推薦 `@PostConstruct`，它是 Jakarta 標準註解，不綁死 Spring 介面。`@Bean(initMethod)` 適合第三方類別（你不能在它身上加註解）。
- **`@PostConstruct` 裡可以安全使用注入的依賴**，建構子裡則只能用建構子參數。
- **不要在 `@PostConstruct` 做耗時工作**，例如載入大量資料或呼叫外部服務。它會拖慢啟動，而且失敗會讓整個應用程式無法啟動。要在啟動後做事，用 `ApplicationRunner` 或監聽 `ApplicationReadyEvent`。
- **`@Bean` 的 `destroyMethod` 預設會自動推斷**：如果類別有名為 `close` 或 `shutdown` 的公開方法，容器關閉時會自動呼叫。所以 `DataSource`、`ExecutorService` 這類 bean 不用特別設定就會被正確關閉。
- **prototype bean 的銷毀方法不會被呼叫**，容器交出去之後就不再追蹤它。

## BeanPostProcessor

### Spring 魔法的來源

`BeanPostProcessor`（BPP）是整個 Spring 最重要的擴充點。它可以在每個 bean 初始化前後拿到這個 bean，並且**可以回傳一個不同的物件取代它**。

```java
public interface BeanPostProcessor {
    default Object postProcessBeforeInitialization(Object bean, String beanName) { return bean; }
    default Object postProcessAfterInitialization(Object bean, String beanName) { return bean; }
}
```

「回傳不同物件」這個能力，就是所有代理型功能的基礎。容器內建的重要 BPP：

| BeanPostProcessor | 負責 |
| --- | --- |
| `AutowiredAnnotationBeanPostProcessor` | 處理 `@Autowired`、`@Value` 注入 |
| `CommonAnnotationBeanPostProcessor` | 處理 `@PostConstruct`、`@PreDestroy`、`@Resource` |
| `AnnotationAwareAspectJAutoProxyCreator` | 為符合切面的 bean 產生 AOP 代理，`@Transactional`、`@Cacheable` 都靠它 |
| `AsyncAnnotationBeanPostProcessor` | 為 `@Async` 方法產生代理 |
| `RetryAnnotationBeanPostProcessor` | 為 `@Retryable` 方法產生代理（Framework 7） |
| `ConfigurationPropertiesBindingPostProcessor` | 把設定值綁定到 `@ConfigurationProperties` 物件 |

### `@Transactional` 是怎麼生效的

容器建立你的 Service 時，在初始化後階段，`AnnotationAwareAspectJAutoProxyCreator` 發現這個類別有 `@Transactional` 方法，於是回傳一個**代理物件**取代原本的 Service。之後所有注入這個 Service 的地方，拿到的都是代理。代理在呼叫真正的方法前開啟交易，結束後提交或回滾。

### 為什麼 BPP / BFPP 要用 static 方法宣告

`BeanFactoryPostProcessor` 和 `BeanPostProcessor` 必須在一般 bean 之前被建立：

- 非 static 的 `@Bean` 方法需要先建立所屬的 `@Configuration` 實例才能呼叫。
- 如果為了建立它們而提早建立了 `@Configuration` 實例，這個設定類別本身就錯過了後續的處理（例如它裡面的 `@Value`、`@Autowired` 不會被處理）。

同理，BPP 本身也不應該注入一般的 Service。如果 BPP 依賴某個 Service，這個 Service 就會在 BPP 註冊完成前被建立，錯過所有 BPP 的處理，也就沒有 AOP 代理。日誌中會出現 `Bean 'xxx' is not eligible for getting processed by all BeanPostProcessors`。**看到這行訊息要警覺：那個 bean 上的 `@Transactional` 可能不會生效。**

## 作用域

| 作用域 | 說明 | 使用時機 |
| --- | --- | --- |
| `singleton`（預設） | 整個容器只有一個實例 | 絕大多數情況：無狀態的 Service、Repository、Controller |
| `prototype` | 每次向容器取得都建立新的 | 有狀態、不能共用的物件 |
| `request` | 每個 HTTP 請求一個 | 請求範圍的資料，例如目前的使用者上下文 |
| `session` | 每個 HTTP session 一個 | 購物車（傳統伺服器端 session 架構） |
| `application` | 每個 `ServletContext` 一個 | 很少用 |

### singleton 不是執行緒安全的保證

Spring 只保證只建立一個實例，不會幫你處理同步。Controller、Service 預設都是 singleton，會被多個請求執行緒同時使用：

```java
@Service
public class BadCounterService {
    private int count; // 危險：多個執行緒共用這個欄位

    public void handle() {
        count++; // 不是原子操作，會遺失更新
    }
}
```

原則是讓 singleton bean 保持**無狀態**：只持有其他 bean 的參考和不可變的設定值。真的需要共享狀態，就用 `AtomicInteger`、`ConcurrentHashMap`，或把狀態放到資料庫、Redis。

### 把 prototype 注入 singleton 的陷阱

```java
@Bean @Scope("prototype") Cart cart() { return new Cart(); }

@Bean Shop shop(Cart cart, ObjectProvider<Cart> carts) { return new Shop(cart, carts); }
```

`Shop` 是 singleton，只會被建立一次，所以 `cart` 參數只會被注入一次。即使 `Cart` 是 prototype，`Shop` 永遠拿著同一個 `Cart`（已驗證）。prototype 的「每次都新的」只在「每次向容器要」時才成立。

三種解法：

| 解法 | 寫法 | 說明 |
| --- | --- | --- |
| `ObjectProvider` | `carts.getObject()` | 推薦，每次呼叫都向容器要一個新的 |
| `@Lookup` 方法 | `@Lookup protected abstract Cart newCart();` | 容器用 CGLIB 覆寫這個方法 |
| 作用域代理 | `@Scope(value = "prototype", proxyMode = ScopedProxyMode.TARGET_CLASS)` | 注入的是代理，每次呼叫方法都轉給新實例，容易誤用 |

同樣的問題也發生在把 `request` 作用域的 bean 注入 singleton。`@RequestScope`、`@SessionScope` 已經預設使用 `proxyMode = TARGET_CLASS`。

### 延遲初始化

singleton 預設在容器啟動時就建立（eager），好處是設定錯誤在啟動時就會暴露。加上 `@Lazy` 會延到第一次被使用時才建立。

Boot 可以全域開啟 `spring.main.lazy-initialization=true`。它能縮短啟動時間，但代價是：設定錯誤要到第一次請求才發現、第一個請求會比較慢、啟動後的記憶體用量不容易預估。建議只在開發環境使用。

## Java 設定與元件掃描

### 兩種註冊 bean 的方式

| 方式 | 寫法 | 適用 |
| --- | --- | --- |
| 元件掃描 | 在類別上加 `@Component`、`@Service` 等 | 自己寫的類別 |
| `@Bean` 方法 | 在 `@Configuration` 類別裡寫一個回傳物件的方法 | 第三方類別、需要邏輯才能決定怎麼建立的物件 |

```java
@Configuration
public class HttpConfig {

    @Bean
    RestClient paymentClient(RestClient.Builder builder, PaymentProperties props) {
        return builder.baseUrl(props.baseUrl().toString()).build();
    }
}
```

`@Bean` 方法的參數會被自動注入，就像建構子參數一樣。

### `@Configuration` 的 full 與 lite 模式

這是 Spring 中最細膩、也最常被誤解的設計之一。

```java
@Configuration
class Full {
    @Bean Pool pool() { return new Pool(); }
    @Bean Repo r1() { return new Repo(pool()); } // 直接呼叫 pool()
    @Bean Repo r2() { return new Repo(pool()); }
}
```

照 Java 的語意，`r1` 和 `r2` 各自呼叫一次 `pool()`，應該會 new 出兩個 `Pool`。但實際上兩者拿到的是**同一個** `Pool`，就是容器裡那個 singleton（已驗證）。原因是 `@Configuration` 類別預設會被 CGLIB 代理，代理攔截了 `pool()` 呼叫，先去容器查有沒有已經建好的 `pool` bean，有就直接回傳。這叫 **full 模式**。

設定 `proxyBeanMethods = false` 就是 **lite 模式**，不產生代理：

```java
@Configuration(proxyBeanMethods = false)
class Lite {
    @Bean Pool pool() { return new Pool(); }
    @Bean Repo r1() { return new Repo(pool()); }       // 直接呼叫 = 普通 Java 呼叫，new 一個新的！
    @Bean Repo r2(Pool pool) { return new Repo(pool); } // 參數注入 = 容器裡那個 singleton
}
```

| 模式 | 優點 | 缺點 |
| --- | --- | --- |
| full（預設） | `@Bean` 方法互相呼叫時語意正確 | 要產生 CGLIB 子類別，啟動稍慢；類別與方法不能是 `final` |
| lite | 啟動較快，對 AOT 與原生映像檔較友善 | `@Bean` 方法互相呼叫會產生新實例 |

**Spring Boot 自己的自動配置全部使用 lite 模式**。建議你也這樣做，並養成「依賴一律用方法參數取得，不直接呼叫其他 `@Bean` 方法」的習慣，這樣在兩種模式下行為都正確。另外，在一般 `@Component` 類別裡宣告的 `@Bean` 方法永遠是 lite 模式。

### 元件掃描與組合註解

```java
@SpringBootApplication // 隱含 @ComponentScan，從這個類別的套件開始掃描
public class App { }

// 需要調整時
@ComponentScan(
    basePackages = "com.example",
    excludeFilters = @ComponentScan.Filter(type = FilterType.REGEX, pattern = "com\\.example\\.legacy\\..*"))
```

掃描只認得「直接或間接標了 `@Component` 的類別」。「註解上再加註解」叫**組合註解（meta-annotation）**，你也可以自己定義：

```java
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Service
@Transactional(readOnly = true)
public @interface ReadOnlyService { }
```

### `@Import` 與 `ImportSelector`

`@Import` 用來明確載入其他設定類別，不依賴掃描：

```java
@Configuration
@Import({DataSourceConfig.class, CacheConfig.class})
public class AppConfig { }
```

| `@Import` 接受的類型 | 說明 |
| --- | --- |
| 一般 `@Configuration` 或元件類別 | 直接註冊 |
| `ImportSelector` 實作 | 在執行時回傳要載入的類別名稱陣列，**自動配置就是這樣實現的** |
| `ImportBeanDefinitionRegistrar` 實作 | 直接操作 `BeanDefinitionRegistry`，自行註冊藍圖。Spring Data 的 `@EnableJpaRepositories` 用它為每個 Repository 介面產生 bean |

各種 `@EnableXxx` 註解幾乎都是 `@Import` 的包裝，例如 `@EnableAsync` 就是 `@Import(AsyncConfigurationSelector.class)`。

Framework 7 新增 `BeanRegistrar`，用來取代冗長的 `ImportBeanDefinitionRegistrar`，適合依條件或迴圈註冊多個 bean，對 AOT 也友善。一般應用程式很少需要，寫框架或共用函式庫時才會用到。

### Profile

Profile 讓同一份程式碼在不同環境啟用不同的 bean：

```java
@Configuration
public class StorageConfig {

    @Bean
    @Profile("local")
    FileStorage localStorage() { return new LocalDiskStorage("/tmp/uploads"); }

    @Bean
    @Profile("!local") // 非 local 時
    FileStorage s3Storage(S3Client s3) { return new S3Storage(s3, "prod-bucket"); }
}
```

啟用方式：`spring.profiles.active=local`，或環境變數 `SPRING_PROFILES_ACTIVE=local`。Profile 表達式支援 `!`、`&`、`|`，例如 `@Profile("prod & !eu")`。

實務建議：

- Profile 用來切換**環境差異**（local、test、prod），不要用來切換功能開關。功能開關請用 `@ConditionalOnProperty` 或專門的 feature flag 工具。
- 不要讓 Profile 數量失控。常見做法是只有 `local`、`test`，正式環境之間的差異全部用環境變數處理（十二要素應用程式的原則）。

### `@Conditional`

`@Profile` 其實是 `@Conditional` 的特例，`@Conditional` 讓你寫任意條件：

```java
public class OnLinuxCondition implements Condition {
    @Override
    public boolean matches(ConditionContext context, AnnotatedTypeMetadata metadata) {
        return context.getEnvironment().getProperty("os.name", "").toLowerCase().contains("linux");
    }
}

@Bean
@Conditional(OnLinuxCondition.class)
FileWatcher inotifyWatcher() { return new InotifyWatcher(); }
```

Spring Boot 在這個基礎上提供了一整組現成條件，是自動配置的核心（見「啟動流程與自動配置」）。

## Environment、屬性與 SpEL

### Environment

`Environment` 是 Spring 對「設定值從哪裡來」的抽象，包含：

1. **Profiles**：目前啟用了哪些 profile。
2. **PropertySources**：一串有順序的設定來源，查詢時從前往後找，第一個有值的就勝出。

```java
@Component
class EnvDemo {
    EnvDemo(Environment env) {
        String url = env.getProperty("app.payment.base-url");
        int retries = env.getProperty("app.payment.max-retries", Integer.class, 3);
        boolean isProd = env.matchesProfiles("prod");
    }
}
```

### `@Value`

```java
@Service
public class MailService {
    private final String sender;
    private final Duration timeout;

    public MailService(@Value("${app.mail.sender}") String sender,
                       @Value("${app.mail.timeout:5s}") Duration timeout) { // 冒號後面是預設值
        this.sender = sender;
        this.timeout = timeout;
    }
}
```

`@Value` 的問題是設定散落在各個類別，沒有型別結構，也沒辦法統一驗證。少量、零散的值可以用 `@Value`；一組相關的設定請用 `@ConfigurationProperties`。

`${...}` 是佔位符，從 `Environment` 取值；`#{...}` 是 SpEL 運算式。兩者可以混用：`#{'${app.admins}'.split(',')}`。

### SpEL

Spring Expression Language 是一個小型運算式語言，出現在這些地方：

| 位置 | 範例 |
| --- | --- |
| `@Value` | `@Value("#{systemProperties['user.region'] ?: 'TW'}")` |
| 快取 key | `@Cacheable(key = "#userId + ':' + #type")` |
| 權限 | `@PreAuthorize("hasRole('ADMIN') or #userId == authentication.name")` |
| 條件 | `@ConditionalOnExpression("${app.feature.a:false} and ${app.feature.b:false}")` |
| 事件 | `@EventListener(condition = "#event.amount > 1000")` |

| 語法 | 意義 |
| --- | --- |
| `#name` | 方法參數或變數 |
| `@beanName` | 參照容器中的 bean |
| `T(java.lang.Math).max(a, b)` | 呼叫靜態方法 |
| `a ?: b` | Elvis 運算子，`a` 為 null 時用 `b` |
| `a?.b` | 安全導覽，`a` 為 null 時整個結果為 null |
| `list.?[price > 100]` | 篩選集合 |
| `list.![name]` | 投影集合 |

Framework 7 的變動：SpEL 預設最多執行 10,000 個運算步驟，超過就拋例外，用來防止惡意或錯誤的運算式耗盡 CPU。

**安全提醒**：絕對不要把使用者輸入直接當成 SpEL 運算式解析。SpEL 可以呼叫任意 Java 方法，等同於遠端程式碼執行漏洞。必須處理外部輸入時，使用 `SimpleEvaluationContext`，它只開放最基本的屬性存取。
