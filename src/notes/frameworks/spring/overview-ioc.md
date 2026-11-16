# Spring 全景與 IoC 容器

> 版本以 Spring Boot 3.x / 4.x、Java 17+ 為主。有「已驗證」的範例，是來源在實際環境執行過的。

## 為什麼需要 Spring

### 沒有 Spring 的世界

```java
public class OrderService {
    private final OrderRepository repository = new JdbcOrderRepository(
            new HikariDataSource(loadConfig("db.properties")));
    private final PaymentGateway payment = new StripeGateway(System.getenv("STRIPE_KEY"));
    private final Notifier notifier = new EmailNotifier(new SmtpClient("smtp.example.com", 587));

    public void placeOrder(Order order) { /* ... */ }
}
```

三個問題：

1. `OrderService` 知道太多事情：資料庫怎麼連、付款金鑰從哪裡讀、SMTP 主機是哪台。
2. 換實作很痛苦：測試時想把 `StripeGateway` 換成假的，只能改程式碼。
3. 共用資源沒辦法共用：十個 Service 各自 `new HikariDataSource`，就會開出十個連線池。

### Spring 的解法：IoC 與 DI

把「建立物件、把物件接起來」從你的程式碼裡拿出去，交給**容器**。你只要宣告「我需要一個 `PaymentGateway`」，容器會把適當的實例遞給你：

```java
@Service
public class OrderService {
    private final OrderRepository repository;
    private final PaymentGateway payment;
    private final Notifier notifier;

    public OrderService(OrderRepository repository, PaymentGateway payment, Notifier notifier) {
        this.repository = repository;
        this.payment = payment;
        this.notifier = notifier;
    }
}
```

- **控制反轉（IoC）**：原本由你控制「什麼時候 new、new 哪一個」，現在反過來由容器控制。
- **依賴注入（DI）**：實現 IoC 的具體手段，容器透過建構子或 setter 把依賴「注入」進來。

容器有了「所有物件都經過我手上」的位置之後，就能順便做很多事：在物件外面包一層代理來加上交易、快取、權限檢查，在物件建立前後呼叫初始化方法，依照設定決定要建立哪個實作。**Spring 的大部分功能都是從這個位置長出來的。**

## Spring 家族與版本

### Spring 家族

| 名稱 | 是什麼 | 你平常接觸的部分 |
| --- | --- | --- |
| Spring Framework | 核心框架。IoC 容器、AOP、交易抽象、Spring MVC、WebFlux、JDBC 支援 | `@Component`、`@Transactional`、`@RestController`、`JdbcClient` |
| Spring Boot | 建在 Framework 上的「開箱即用」層。自動配置、內嵌伺服器、外部化設定、打包 | `@SpringBootApplication`、`application.yml`、starter、Actuator |
| Spring Data | 資料存取的統一抽象，有 JPA、JDBC、MongoDB、Redis 等模組 | `JpaRepository`、衍生查詢方法 |
| Spring Security | 認證與授權 | `SecurityFilterChain`、`@PreAuthorize` |
| Spring Cloud | 分散式系統常用模式：設定中心、服務發現、閘道、斷路器 | Gateway、Config、OpenFeign |
| 其他 | Spring Batch、Spring Integration、Spring for Apache Kafka、Spring AI、Spring Modulith 等 | 依需求使用 |

### Framework 與 Boot 的分工

- **Framework 提供「能力」**：它知道怎麼管理交易，但你要自己定義 `DataSource`、`TransactionManager` 這些 bean。
- **Boot 提供「預設值」**：它看到 classpath 上有 HikariCP 和 H2，就自動幫你建好 `DataSource`、`JdbcTemplate`、`TransactionManager`，你什麼都不寫也能動。

所以 Spring Boot 本身幾乎沒有新功能，它做的是「依照你的環境自動把 Framework 設定好」。要理解 Boot，必須先理解 Framework。

### Spring Boot 的四個支柱

| 支柱 | 解決的問題 |
| --- | --- |
| Starter | 不用自己湊相容的依賴版本，加一個 starter 就拿到一組測試過的組合 |
| 自動配置 | 依照 classpath 與設定自動建立 bean，使用者定義的 bean 優先 |
| 外部化設定 | 同一個 jar 在不同環境用不同設定，來源包含檔案、環境變數、命令列 |
| 內嵌伺服器與可執行 jar | 不用另外安裝 Tomcat，`java -jar` 就能跑 |

再加上 Actuator（健康檢查、指標）與 DevTools（開發時自動重啟），就是 Boot 的主要內容。

### 版本演進

知道版本演進，才能判斷網路上的文章是否過時：

| 時間 | 版本 | 重點 |
| --- | --- | --- |
| 2014 | Boot 1.0 | Spring Boot 誕生 |
| 2018 | Boot 2.0 / Framework 5.0 | Java 8 基準、WebFlux 登場 |
| 2022 年 11 月 | Boot 3.0 / Framework 6.0 | Java 17 基準、`javax.*` 改為 `jakarta.*`、AOT 與原生映像檔 |
| 2023 年 11 月 | Boot 3.2 | 虛擬執行緒支援、`RestClient`、`JdbcClient` |
| 2025 年 11 月 | Boot 4.0 / Framework 7.0 | 模組化、Jackson 3、JSpecify、API 版本控制、內建重試、`@MockBean` 移除 |
| 2026 年 6 月 | Boot 4.1 | gRPC、OpenTelemetry 強化、Jackson 設定屬性 |

## 建立第一個專案

到 [start.spring.io](https://start.spring.io) 選擇 Maven、Spring Boot、Java 21，依賴選 Spring Web、Spring Data JPA、H2 Database、Validation。也可以用命令列：

```bash
curl -o demo.zip "https://start.spring.io/starter.zip?type=maven-project&bootVersion=4.1.1&javaVersion=21&groupId=com.example&artifactId=demo&dependencies=web,data-jpa,h2,validation"
```

### Boot 4 的兩個差異

- **starter 改名**：Boot 4 把原本一大包的 `spring-boot-autoconfigure` 拆成每個技術一個模組，starter 也照技術命名。例如 `spring-boot-starter-web` 改名為 `spring-boot-starter-webmvc`。
- **測試 starter 也拆開**：`@WebMvcTest` 在 `spring-boot-webmvc-test` 裡，`@DataJpaTest` 在 `spring-boot-data-jpa-test` 裡。

### 主程式

```java
@SpringBootApplication
public class DemoApplication {
    public static void main(String[] args) {
        SpringApplication.run(DemoApplication.class, args);
    }
}
```

`@SpringBootApplication` 是三個註解的組合：

| 註解 | 作用 |
| --- | --- |
| `@SpringBootConfiguration` | 標示這是設定類別（本質上就是 `@Configuration`） |
| `@EnableAutoConfiguration` | 開啟自動配置 |
| `@ComponentScan` | 從這個類別所在的套件往下掃描 `@Component` |

**主程式所在的套件決定了掃描範圍。**如果主程式放在 `com.example.demo`，而 Controller 放在 `com.example.web`，Controller 不會被掃到。慣例是把主程式放在最上層的套件。

## 容器與 BeanDefinition

### 容器是什麼

容器就是一個「物件工廠加登記簿」，做三件事：

1. 讀取設定，知道要建立哪些物件、怎麼建立。
2. 依照依賴關係的順序建立物件，並把依賴注入進去。
3. 管理這些物件的整個生命週期，直到應用程式關閉。

被容器管理的物件叫做 **bean**。bean 跟一般物件沒有本質差別，差別只在「是誰 new 出來的、誰負責管理它」。

| 介面 | 說明 |
| --- | --- |
| `BeanFactory` | 最基本的容器，提供 `getBean()`、依賴注入 |
| `ApplicationContext` | 繼承 `BeanFactory`，再加上事件發布、國際化訊息、資源載入、`Environment`、自動註冊 `BeanPostProcessor` |

實務上永遠使用 `ApplicationContext`。Spring Boot 依照應用程式類型建立不同的實作：Servlet 應用是 `ServletWebServerApplicationContext` 的子類別，WebFlux 是 `ReactiveWebServerApplicationContext`，非 Web 應用是 `AnnotationConfigApplicationContext`。

### 先建「藍圖」再建物件

容器不是一讀到 `@Component` 就馬上 new，分成兩個階段：

1. **登記階段**：掃描所有設定來源（`@Component` 類別、`@Bean` 方法、自動配置），為每個 bean 產生一份 `BeanDefinition`。這份「藍圖」記錄了類別、作用域、是否延遲初始化、初始化方法、依賴哪些 bean 等資訊。
2. **建立階段**：依照藍圖實例化 bean。

```
@Component 類別 / @Bean 方法 / 自動配置
        ↓
BeanDefinition（藍圖）
        ↓
BeanFactoryPostProcessor（可以修改藍圖）
        ↓
實例化、注入、初始化
        ↓
可使用的 bean
```

分成兩階段的好處是：在任何 bean 被建立之前，有一個時間點可以修改所有藍圖。`BeanFactoryPostProcessor` 就是在這個時間點介入的擴充點。例如 `@Configuration` 類別的解析、`${...}` 佔位符的解析，都是由內建的 `BeanFactoryPostProcessor` 完成的。

注意 `@Value` 的注入本身不在這個階段：`PropertySourcesPlaceholderConfigurer` 只是向容器登記一個佔位符解析器，真正把值注入欄位或參數的是建立 bean 時的 `AutowiredAnnotationBeanPostProcessor`。

下面的範例在藍圖階段把一個 singleton 改成 prototype（已驗證）：

```java
@Configuration
class BfppConfig {
    // BeanFactoryPostProcessor 必須用 static 方法宣告
    @Bean
    static BeanFactoryPostProcessor makePrototype() {
        return beanFactory -> beanFactory.getBeanDefinition("cart").setScope("prototype");
    }

    @Bean
    Cart cart() { return new Cart(); }
}
// ctx.getBean(Cart.class) != ctx.getBean(Cart.class)，每次都是新的
```

### `@Component` 家族

| 註解 | 語意 | 額外行為 |
| --- | --- | --- |
| `@Component` | 一般元件 | 無 |
| `@Service` | 業務邏輯層 | 無，純粹是語意標記 |
| `@Repository` | 資料存取層 | 會被套上例外轉譯，把 JDBC / JPA 的例外轉成 Spring 的 `DataAccessException` |
| `@Controller` / `@RestController` | Web 層 | 被 Spring MVC 識別為處理器 |
| `@Configuration` | 設定類別 | 預設會被 CGLIB 代理 |

bean 的預設名稱是類別名稱的首字小寫（`OrderService` → `orderService`）；`@Bean` 方法則是方法名稱。

## 依賴注入

### 三種注入方式

```java
// 1. 建構子注入（推薦）
@Service
public class OrderService {
    private final PaymentGateway payment;

    public OrderService(PaymentGateway payment) { // 只有一個建構子時，@Autowired 可省略
        this.payment = payment;
    }
}

// 2. Setter 注入
@Service
public class ReportService {
    private Formatter formatter;

    @Autowired
    public void setFormatter(Formatter formatter) { this.formatter = formatter; }
}

// 3. 欄位注入（不建議）
@Service
public class LegacyService {
    @Autowired
    private PaymentGateway payment;
}
```

為什麼推薦建構子注入：

| 面向 | 建構子注入 | 欄位注入 |
| --- | --- | --- |
| 不可變 | 可以宣告成 `final` | 不行 |
| 必要依賴 | 建立物件時就必須提供；測試可直接傳入替身 | 必要的 `@Autowired` 找不到依賴時，建立 bean 也會失敗；但手動 new 時欄位不會被注入，容易留下 null |
| 測試 | 直接 `new OrderService(mockPayment)` | 要靠反射或 Spring 測試框架 |
| 設計警訊 | 建構子參數超過五、六個，一眼看出職責太多 | 加一行 `@Autowired` 很容易，問題被掩蓋 |
| 循環依賴 | 直接啟動失敗，逼你修正設計 | 可能被容器默默解掉（Boot 預設已禁止） |

Setter 注入適合「可選的依賴」，也就是沒有注入時有合理的預設行為。用 Lombok 的話，`@RequiredArgsConstructor` 會為所有 `final` 欄位產生建構子。

### 依賴解析的規則

容器要為一個參數找到對應的 bean，依照以下順序：

1. **依型別**找出所有符合的 bean。
2. 只有一個：直接使用。
3. 有多個：
   1. 有 `@Qualifier` 就依限定名稱篩選。
   2. 在符合型別與限定條件的候選中，只有一個標了 `@Primary`，就優先使用它；`@Primary` 不會蓋過不匹配的 `@Qualifier`。
   3. 排除標了 `@Fallback`（Framework 6.2 起）的候選後只剩一個，用那一個。`@Fallback` 是 `@Primary` 的反面：「其他都沒有時才用我」。
   4. 參數名稱剛好等於某個 bean 的名稱，用那一個。
   5. 候選類別上有 `@jakarta.annotation.Priority`，用優先值最高（數字最小）的那一個。
   6. 以上都不成立：拋出 `NoUniqueBeanDefinitionException`。
4. 一個都沒有：必要依賴拋出 `NoSuchBeanDefinitionException`；可選依賴（`Optional<T>`、`ObjectProvider<T>`、`@Autowired(required = false)`）則注入空值。

Framework 6.2 調整了第 4、5 步的順序：以前 `@Priority` 先於名稱比對，6.2 起名稱比對優先。

```java
interface PaymentGateway { String name(); }
record Stripe() implements PaymentGateway { public String name() { return "stripe"; } }
record LinePay() implements PaymentGateway { public String name() { return "linepay"; } }

@Configuration
class PaymentConfig {
    @Bean @Primary @Order(2) Stripe stripe() { return new Stripe(); }
    @Bean @Order(1) LinePay linePay() { return new LinePay(); }

    @Bean
    Checkout checkout(PaymentGateway main,                          // @Primary → stripe
                      @Qualifier("linePay") PaymentGateway backup,  // 指名 → linePay
                      List<PaymentGateway> all,                     // 全部，依 @Order 排序 → [linePay, stripe]
                      Map<String, PaymentGateway> byName) {         // key 是 bean 名稱
        return new Checkout(main, backup, all, byName);
    }
}
```

- **參數名稱比對**需要編譯時保留參數名稱（`javac -parameters`）。`spring-boot-starter-parent` 已經幫你打開。Spring 6.1 起不再從 debug 資訊推測參數名稱，沒有 `-parameters` 時這條規則會失效。
- **注入集合**是實現策略模式的好方法：有多個 `DiscountRule` 實作，直接注入 `List<DiscountRule>`，新增規則只要多寫一個 `@Component`，不用改既有程式碼。

### 可選依賴與 `ObjectProvider`

```java
@Service
public class NotificationService {
    private final ObjectProvider<SmsSender> smsSender;

    public NotificationService(ObjectProvider<SmsSender> smsSender) {
        this.smsSender = smsSender;
    }

    public void notify(String msg) {
        // 有 SmsSender bean 才發送；沒有也不會啟動失敗
        smsSender.ifAvailable(sender -> sender.send(msg));
    }
}
```

| 方法 | 用途 |
| --- | --- |
| `getObject()` | 取得 bean，沒有就拋例外 |
| `getIfAvailable()` | 沒有就回傳 `null` |
| `ifAvailable(Consumer)` | 有才執行 |
| `getIfUnique()` | 有多個候選時回傳 `null` 而不是拋例外 |
| `orderedStream()` | 依 `@Order` 排序的串流 |

它還有「延遲取得」的效果：每次呼叫 `getObject()` 才向容器要，所以也是解決 prototype 注入問題的標準做法。

## 循環依賴

A 依賴 B、B 又依賴 A，就是循環依賴。這是面試常客，也是實務上常見的設計問題。

### 建構子注入：一定失敗

建立 A 需要先有 B，建立 B 又需要先有 A，沒有任何一方能先完成（已驗證）：

```
BeanCurrentlyInCreationException:
Error creating bean with name 'c': Requested bean is currently in creation:
Is there an unresolvable circular reference?
```

### 欄位 / setter 注入：三級快取

純 Spring Framework 預設可以解開，靠的是「三級快取」：

| 快取 | 存放什麼 |
| --- | --- |
| 一級 `singletonObjects` | 完全建好的 bean |
| 二級 `earlySingletonObjects` | 已經實例化、但還沒注入屬性的「半成品」 |
| 三級 `singletonFactories` | 產生半成品參考的工廠（`ObjectFactory`） |

流程：

1. 建立 A：呼叫建構子得到 A 的實例，把「取得 A 早期參考的工廠」放進三級快取。
2. 幫 A 注入屬性，發現需要 B，去建立 B。
3. 建立 B：實例化後要注入 A，查一級快取沒有，查二級沒有，查三級找到 A 的工廠。
4. 透過工廠取得 A 的早期參考（如果 A 需要被代理，就在這一步提前產生代理），放進二級快取，注入給 B。
5. B 完成，回到 A，A 拿到完整的 B，A 也完成。

**為什麼需要第三級？**如果 A 需要 AOP 代理，B 拿到的應該是 A 的代理而不是原始物件。但正常情況下代理是在初始化最後一步才產生的。三級快取的工廠讓容器可以「只有在真的發生循環依賴時，才提前產生代理」，沒有循環依賴的 bean 則照正常流程走。

**Spring Boot 從 2.6 起預設禁止循環依賴**（`spring.main.allow-circular-references=false`），即使是欄位注入也會啟動失敗（已驗證）。理由是循環依賴幾乎都代表設計有問題。

### 遇到循環依賴怎麼處理

1. **重新設計**：通常是兩個類別的職責切得不對。把雙方共同需要的邏輯抽成第三個類別，或改用事件解耦。
2. **用 `@Lazy` 延後**：在其中一個注入點加 `@Lazy`，容器會注入一個代理，真正呼叫時才去取得實際的 bean（已驗證）：

   ```java
   @Bean C c(@Lazy D d) { return new C(d); } // d 是代理，類別名稱含 $$SpringCGLIB$$
   @Bean D d(C c) { return new D(c); }
   ```

3. **最後手段**：設定 `spring.main.allow-circular-references=true`。這只對欄位與 setter 注入有效，建構子注入仍然會失敗。

面試時能解釋「為什麼建構子循環依賴無法用三級快取解決」：因為連實例都還沒產生，沒有東西可以放進快取。
