# 測試

## 測試策略與切片測試

### 測試策略

| 層級 | 工具 | 速度 | 比例 |
| --- | --- | --- | --- |
| 單元測試 | JUnit 6 + Mockito + AssertJ，不啟動 Spring | 毫秒 | 最多 |
| 切片測試 | `@WebMvcTest`、`@DataJpaTest` 等，只啟動部分容器 | 秒 | 中等 |
| 整合測試 | `@SpringBootTest` + Testcontainers | 數秒到數十秒 | 少量但關鍵 |

建構子注入讓單元測試非常簡單，直接 `new OrderService(mockRepository, mockPayment)`，不需要任何 Spring 的東西。業務邏輯應該主要用這種測試覆蓋。

### 切片測試

只載入特定層的元件，啟動快，失敗時也容易定位。

| 註解 | 載入 | 不載入 |
| --- | --- | --- |
| `@WebMvcTest(XxxController.class)` | 指定的 Controller、`@ControllerAdvice`、Filter、`WebMvcConfigurer`、Jackson | Service、Repository |
| `@DataJpaTest` | JPA 實體、Repository、`DataSource`（預設換成記憶體資料庫）、Flyway | Web、Service |
| `@JdbcTest` | `DataSource`、`JdbcClient` | |
| `@JsonTest` | Jackson 設定 | |
| `@RestClientTest` | `RestClient.Builder`、`MockRestServiceServer` | |
| `@DataRedisTest`、`@DataMongoTest` | 對應的資料存取元件 | |

Boot 4 中，這些註解分散在各技術的測試模組中，例如 `@WebMvcTest` 在 `spring-boot-webmvc-test`，`@DataJpaTest` 在 `spring-boot-data-jpa-test`。加入對應的 `spring-boot-starter-xxx-test` 即可。

```java
@WebMvcTest(OrderController.class)
@Import(SecurityConfig.class) // 自訂的 SecurityFilterChain 不在切片範圍內，要自己帶進來
class OrderControllerSliceTest {

    @Autowired MockMvc mvc;

    @MockitoBean OrderService orderService; // 把容器中的 bean 換成 Mockito mock

    @Test
    void notFound() throws Exception {
        given(orderService.find(42)).willThrow(new OrderNotFoundException(42));
        mvc.perform(get("/api/orders/42").with(jwt()))
           .andExpect(status().isNotFound());
    }
}
```

```java
@DataJpaTest
class AuthorRepositorySliceTest {
    @Autowired AuthorRepository authors;
    @Autowired TestEntityManager em;

    @Test
    void derivedQuery() {
        em.persist(new Author("Martin Fowler"));
        em.flush();
        assertThat(authors.findByNameContainingIgnoreCase("fowler")).hasSize(1);
    }
}
```

`@DataJpaTest` 的每個測試方法都包在交易中，結束後自動回滾，測試之間不會互相影響。但也因此，**提交時才會發生的問題（例如某些約束檢查、`@TransactionalEventListener`）在這種測試中測不到**。

### `@MockitoBean` 取代 `@MockBean`

Boot 3.4 起 `@MockBean`、`@SpyBean` 已棄用，**Boot 4 正式移除**。改用 Spring Framework 的 `@MockitoBean`、`@MockitoSpyBean`。

差異：`@MockitoBean` 只能用在測試類別的欄位上，不能放在 `@Configuration` 類別中。要在多個測試類別間共用 mock，在測試類別上宣告 `@MockitoBean(types = {OrderService.class, PaymentGateway.class})`，或做成組合註解。

## @SpringBootTest 與容器快取

### `@SpringBootTest` 的變化

`@SpringBootTest` 本身不會提供 `MockMvc`，一直需要加 `@AutoConfigureMockMvc`。Boot 4 的變化在於 `TestRestTemplate`：Boot 3 在 `RANDOM_PORT` 或 `DEFINED_PORT` 時會自動提供，Boot 4 起要明確開啟：

| 需要 | Boot 4 的做法 |
| --- | --- |
| `MockMvc` | 加上 `@AutoConfigureMockMvc`（與 Boot 3 相同） |
| `TestRestTemplate` | 加上 `@AutoConfigureTestRestTemplate`，並加入 `spring-boot-resttestclient`（**Boot 4 的變更**） |
| 新的 `RestTestClient` | 加上 `@AutoConfigureRestTestClient`。它是同步版的 `WebTestClient`，可以搭配 MockMvc 或真正啟動的伺服器 |

`webEnvironment` 的選擇：

| 值 | 說明 |
| --- | --- |
| `MOCK`（預設） | 不啟動真的伺服器，搭配 `MockMvc` |
| `RANDOM_PORT` | 啟動真的 Tomcat，用 `@LocalServerPort` 取得埠號 |
| `NONE` | 不建立 Web 環境 |

`MockMvc` 也有 AssertJ 風格的版本 `MockMvcTester`（Framework 6.2 起），斷言寫起來更流暢。

### 測試容器的快取

Spring 測試框架會快取容器：設定完全相同的測試類別共用同一個 `ApplicationContext`，不用重新啟動。以下情況會產生新的容器：

- 不同的 `@MockitoBean` 組合。
- 不同的 `@ActiveProfiles`、`properties`、`@TestPropertySource`。
- 使用了 `@DirtiesContext`。

一個大型專案的測試如果很慢，通常是因為每個測試類別的 mock 組合都不一樣，造成幾十個容器各自啟動。對策：整合測試統一繼承一個基底類別、共用同一組設定；能用切片測試就不要用 `@SpringBootTest`。可以開啟 `logging.level.org.springframework.test.context.cache=DEBUG` 計算專案的測試啟動了幾個容器。

## Testcontainers

H2 不是 PostgreSQL。SQL 方言、型別、鎖的行為、JSON 欄位、甚至 Flyway 需要的模組都不同。關鍵的整合測試要在真正的資料庫上跑：

```java
@SpringBootTest
@Testcontainers
class PostgresIntegrationTest {

    @Container
    @ServiceConnection // 自動把容器的 JDBC URL、帳密註冊成 spring.datasource.*
    static PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:18-alpine");

    @Autowired AccountService accounts;

    @Test
    void runsAgainstRealPostgres() {
        long a = accounts.open("alice", new BigDecimal("1000.00"));
        long b = accounts.open("bob", BigDecimal.ZERO);
        assertThatThrownBy(() -> accounts.transferThenRuntimeException(a, b, new BigDecimal("100")));
        assertThat(accounts.balanceOf(a)).isEqualByComparingTo("1000");
    }
}
```

已驗證（Testcontainers 2.0.5、PostgreSQL 18.6）。需要的依賴：

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-testcontainers</artifactId>
    <scope>test</scope>
</dependency>
<dependency>
    <groupId>org.testcontainers</groupId>
    <artifactId>testcontainers-junit-jupiter</artifactId>
    <scope>test</scope>
</dependency>
<dependency>
    <groupId>org.testcontainers</groupId>
    <artifactId>testcontainers-postgresql</artifactId>
    <scope>test</scope>
</dependency>
```

**Testcontainers 2 改了 artifact 名稱與套件**：1.x 的 `org.testcontainers:postgresql` 變成 `testcontainers-postgresql`，`junit-jupiter` 變成 `testcontainers-junit-jupiter`；容器類別從 `org.testcontainers.containers.PostgreSQLContainer` 移到 `org.testcontainers.postgresql.PostgreSQLContainer`，也不再需要泛型參數。舊套件的類別仍保留但已棄用。

`@ServiceConnection` 支援 PostgreSQL、MySQL、Redis、Kafka、RabbitMQ、MongoDB、Elasticsearch 等。

**本機開發也能用**：在 `src/test/java` 寫一個 `TestApplication`，執行它就會自動啟動資料庫容器，不需要另外寫 docker-compose：

```java
public class TestApplication {
    public static void main(String[] args) {
        SpringApplication.from(Application::main).with(ContainersConfig.class).run(args);
    }
}

@TestConfiguration(proxyBeanMethods = false)
class ContainersConfig {
    @Bean
    @ServiceConnection
    PostgreSQLContainer postgres() { return new PostgreSQLContainer("postgres:18-alpine"); }
}
```

## 安全相關的測試

```java
// 模擬一個已驗證的 JWT，指定權限
mvc.perform(post("/api/orders")
        .with(jwt().authorities(new SimpleGrantedAuthority("SCOPE_orders:write")))
        .contentType(MediaType.APPLICATION_JSON).content(body))
   .andExpect(status().isCreated());

// 表單登入的應用
@Test
@WithMockUser(roles = "ADMIN")
void adminCanDelete() { ... }
```

Boot 4 中，`@WithMockUser` 需要加入 `spring-boot-starter-security-test`。

面試時能說出 `@DataJpaTest` 測不到哪些問題（提交時才發生的行為），以及為什麼需要 Testcontainers（H2 不是真實資料庫）。
