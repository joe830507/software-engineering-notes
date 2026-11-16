# Spring 面試題與速查

## 面試題對照

下表列出常見題目在這份筆記中的解答位置。

| 題目 | 筆記位置 |
| --- | --- |
| 什麼是 IoC 與 DI？有什麼好處？ | 全景與 IoC 容器 →「為什麼需要 Spring」、「容器與 BeanDefinition」 |
| `BeanFactory` 與 `ApplicationContext` 的差別 | 全景與 IoC 容器 →「容器與 BeanDefinition」 |
| 依賴注入有幾種方式？為什麼推薦建構子注入？ | 全景與 IoC 容器 →「依賴注入」 |
| 同一個介面有多個實作，Spring 怎麼決定注入哪一個？ | 全景與 IoC 容器 →「依賴注入」 |
| Spring 如何解決循環依賴？三級快取是什麼？為什麼建構子注入的循環依賴無法解決？ | 全景與 IoC 容器 →「循環依賴」 |
| Bean 的生命週期 | Bean 生命週期、作用域與設定 →「Bean 生命週期」 |
| `BeanPostProcessor` 與 `BeanFactoryPostProcessor` 的差別 | 全景與 IoC 容器、Bean 生命週期 →「BeanPostProcessor」 |
| Bean 的作用域有哪些？singleton 是執行緒安全的嗎？ | Bean 生命週期、作用域與設定 →「作用域」 |
| `@Configuration` 與 `@Component` 中的 `@Bean` 有什麼不同？ | Bean 生命週期、作用域與設定 →「Java 設定與元件掃描」 |
| AOP 的原理？JDK 動態代理與 CGLIB 的差別？ | AOP 與代理 →「代理的原理」 |
| 為什麼同一個類別內呼叫 `@Transactional` 方法會失效？ | AOP 與代理 →「自呼叫」、JDBC 與交易管理 |
| Spring Boot 的自動配置原理 | 啟動流程與自動配置 →「自動配置原理」 |
| Spring Boot 的啟動流程 | 啟動流程與自動配置 →「`run()`」、「`refresh()`」 |
| 如何寫一個自訂的 starter？ | 啟動流程與自動配置 →「自製 Starter」 |
| Spring Boot 設定的優先順序 | 外部化設定與日誌 →「設定來源的優先順序」 |
| Spring MVC 處理請求的流程 | Spring MVC 請求流程 |
| Filter 與 Interceptor 的差別 | Spring MVC 請求流程 →「Filter、Interceptor、AOP」 |
| `@Transactional` 的傳播行為有哪些？ | JDBC 與交易管理 →「傳播行為」 |
| `@Transactional` 失效的情境 | JDBC 與交易管理 →「交易失效的情境」 |
| 什麼是 `UnexpectedRollbackException`？ | JDBC 與交易管理 →「rollback-only」 |
| 隔離等級與髒讀、不可重複讀、幻讀 | JDBC 與交易管理 →「其他屬性與程式化交易」 |
| JPA 的 N+1 問題與解法 | Spring Data JPA →「N+1 與延遲載入」 |
| 樂觀鎖與悲觀鎖 | Spring Data JPA →「關聯對應與鎖」 |
| Spring Security 的架構與認證流程 | Spring Security 架構 |
| JWT 的優缺點、如何撤銷 | JWT、OAuth2 與方法層級授權 →「JWT」 |
| OAuth2 的授權類型 | JWT、OAuth2 與方法層級授權 →「OAuth 2.0 的角色」 |
| CSRF 與 CORS | Spring Security 架構 →「密碼、CSRF 與 CORS」 |
| 斷路器的原理 | Spring Cloud 與版本升級 →「Resilience4j」 |
| 如何保證資料庫與訊息佇列的一致性？ | 快取、Redis 與 Kafka →「資料庫與訊息的一致性」 |

## 常見的口述答案

### 三種注入方式

| 方式 | 優點 | 缺點 |
| --- | --- | --- |
| **建構子注入（推薦）** | 依賴可以是 `final`、物件建立後就完整可用、容易寫單元測試、依賴太多時會很明顯提醒你該拆類別 | 循環依賴會直接失敗（這其實是好事） |
| Setter 注入 | 可選的依賴 | 物件可能處於未完整初始化的狀態 |
| 欄位注入 | 程式碼最短 | 無法 `final`、測試時要用反射注入、隱藏了依賴數量 |

### 循環依賴的限制

- 只能解決 **singleton** 且使用 **setter 或欄位注入** 的循環依賴。
- **建構子注入**的循環依賴無法解決（物件還沒建立就需要對方）。
- prototype 的循環依賴無法解決。
- **Spring Boot 2.6 起預設禁止循環依賴**，啟動時直接失敗。循環依賴通常代表設計有問題，應該重構（抽出第三個類別、改用事件）。

### AOP 的口述版

Spring AOP 是在執行時期幫目標物件產生一個**代理物件**，呼叫方法時先經過代理，代理執行切面邏輯（交易、日誌、權限）後再呼叫真正的方法。

JDK 動態代理要求目標實作介面；CGLIB 產生目標類別的子類別，不能代理 `final` 類別與方法。Spring 預設有介面用 JDK 代理、沒有介面用 CGLIB；**Spring Boot 2.0 起預設一律用 CGLIB**。

### 隔離等級

| 隔離等級 | 髒讀 | 不可重複讀 | 幻讀 |
| --- | --- | --- | --- |
| Read Uncommitted | 可能 | 可能 | 可能 |
| **Read Committed**（Oracle、SQL Server、PostgreSQL 預設） | 不會 | 可能 | 可能 |
| **Repeatable Read**（MySQL InnoDB 預設） | 不會 | 不會 | 可能（InnoDB 透過 MVCC 和 next-key lock 大幅避免） |
| Serializable | 不會 | 不會 | 不會 |

- **髒讀**：讀到別人還沒 commit 的資料。
- **不可重複讀**：同一筆資料讀兩次，中間被別人修改並 commit，結果不同。
- **幻讀**：同樣的條件查兩次，中間別人新增或刪除了符合條件的資料，筆數不同。

Oracle 只支援 Read Committed 和 Serializable（另外有 Read Only）。

### `Statement` 與 `PreparedStatement`

| | `Statement` | `PreparedStatement` |
| --- | --- | --- |
| SQL 組成 | 字串串接 | 參數用 `?` 佔位 |
| SQL Injection | **有風險** | 安全，參數不會被當成 SQL 解析 |
| 效能 | 每次都要解析 | 資料庫可以重用執行計畫 |
| 型別處理 | 自己轉成字串，日期、特殊字元容易出錯 | `setDate`、`setBigDecimal` 等正確處理 |

## 常見陷阱總表

| 陷阱 | 症狀 | 原因 | 解法 |
| --- | --- | --- | --- |
| 自呼叫 | `@Transactional`、`@Async`、`@Cacheable`、`@PreAuthorize` 沒作用 | `this` 不是代理 | 搬到另一個 bean |
| 直接存取 bean 的欄位 | 拿到 `null` | CGLIB 代理的欄位沒有初始化 | 用方法存取 |
| checked exception 不回滾 | 例外拋出但資料已寫入 | 預設只回滾 `RuntimeException` | `rollbackFor`，或業務例外繼承 `RuntimeException` |
| 吞掉內層例外 | `UnexpectedRollbackException` | 交易已被標記 rollback-only | 內層用 `REQUIRES_NEW` 或不加交易 |
| `REQUIRES_NEW` 死鎖 | 高並行時請求全部卡住 | 每個請求需要兩條連線 | 加大連線池或避免 |
| 交易中呼叫外部服務 | 連線池耗盡、資料不一致 | 長交易 | 外部呼叫移到交易外 |
| N+1 | 頁面很慢，日誌中大量相似 SQL | 延遲載入在迴圈中觸發 | fetch join、EntityGraph、批次抓取 |
| `LazyInitializationException` | 在交易外存取關聯 | 持久化上下文已關閉 | 在 Service 層載入所需資料，回傳 DTO |
| 批次更新後讀到舊值 | `@Modifying` 後查詢結果沒變 | 一級快取 | `clearAutomatically = true` |
| `save()` 後繼續用原物件 | 修改沒有生效 | `merge()` 回傳另一個實例 | 使用回傳值 |
| `@ManyToOne` 預設 EAGER | 查一筆帶出一堆 join | JPA 規範的預設 | 一律加 `fetch = LAZY` |
| Flyway 不支援 PostgreSQL | `Unsupported Database` | Flyway 10 起資料庫支援拆成模組 | 加 `flyway-database-postgresql` |
| prototype 注入 singleton | 永遠拿到同一個實例 | 只注入一次 | `ObjectProvider` |
| BFPP 用非 static 方法宣告 | 設定類別中的 `@Value` 沒作用 | 設定類別被提早建立 | 用 `static` 方法 |
| 主程式放錯套件 | Controller 沒被掃描到，404 | 掃描從主程式所在套件開始 | 主程式放在最上層套件 |
| 用 `spring.factories` 註冊自動配置 | 自動配置沒有載入 | Boot 3 起改用 `.imports` 檔 | 改用 `AutoConfiguration.imports` |
| `@Observed` 沒有作用 | 沒有指標也沒有錯誤 | 預設關閉 | `management.observations.annotations.enabled=true` |
| API 版本 `2.0+` 不接受 2.3 | 400 `Invalid API version` | 版本不在支援清單 | `spring.mvc.apiversion.supported` |
| `@TransactionalEventListener` 沒執行 | 事件遺失 | 發布時沒有交易 | `fallbackExecution = true` 或在交易中發布 |
| `@Async` 拿不到使用者或交易 | `SecurityContext` 是空的 | `ThreadLocal` 不跨執行緒 | 傳參數或用 `TaskDecorator` |
| 多實例重複執行排程 | 報表產生多份 | 每個實例都會執行 | ShedLock 或外部排程 |
| OSIV 開啟 | 連線池在高並行時耗盡 | 連線佔用整個請求 | `spring.jpa.open-in-view=false` |
| liveness 檢查資料庫 | 資料庫抖動時所有 Pod 被重啟 | 探針設計錯誤 | liveness 只檢查自己 |
| 探針打獨立的管理埠 | 主程式已無法服務，探針仍回 200 | 管理埠是另一個 Web 伺服器 | `probes.add-additional-paths=true`，探針打主埠 |
| 自訂 `RedisCacheConfiguration` 後設定失效 | YAML 的 TTL、前綴沒有作用 | 自訂 bean 完全取代屬性 | 在 bean 中設定，或改用 Customizer |
| `hasRole` 與 `hasAuthority` 混用 | 永遠 403 | `hasRole` 會加 `ROLE_` 前綴 | 統一權限命名 |
| 只用 `@CrossOrigin` 設定 CORS | 預檢請求被 Security 擋下 | 預檢請求不帶認證 | 在 Security 中啟用 `cors()` |
| 在 `@Transactional` 中直接送 Kafka | 訊息與資料不一致 | 雙寫問題 | 交易外送箱 |
| 只用 H2 測試 | 上線後 SQL 或設定出錯 | H2 不是正式資料庫 | Testcontainers |

## 從程式碼判斷文章的年代

網路上的 Spring 教學很多已經過時，用下表判斷：

| 看到 | 代表 | 現在的寫法 |
| --- | --- | --- |
| XML 設定檔、`<bean>` | 2013 年以前 | Java 設定 |
| `WebSecurityConfigurerAdapter` | Boot 2.7 以前，Security 6 已移除 | `SecurityFilterChain` bean |
| `.and()` 串接的 Security 設定 | Security 6 以前 | lambda DSL |
| `antMatchers`、`authorizeRequests` | Security 5 時代 | `requestMatchers`、`authorizeHttpRequests` |
| `javax.persistence`、`javax.servlet` | Boot 2.x | `jakarta.*` |
| `spring.factories` 註冊自動配置 | Boot 2.x | `AutoConfiguration.imports` |
| `RestTemplate` | 2023 年以前 | `RestClient` 或 HTTP Interface |
| `@MockBean` | Boot 3.3 以前 | `@MockitoBean` |
| `com.fasterxml.jackson.databind.ObjectMapper` | Boot 3.x 以前 | `tools.jackson.databind.json.JsonMapper` |
| `spring-boot-starter-web` | Boot 3.x 以前 | `spring-boot-starter-webmvc` |
| Spring Retry 的 `@EnableRetry` | Framework 7 以前 | `@EnableResilientMethods` |
| `@RunWith(SpringRunner.class)` | JUnit 4 時代 | JUnit 5 以上不需要 |
| `spring.profiles: dev`（在 YAML 文件內） | Boot 2.3 以前 | `spring.config.activate.on-profile` |

### 版本歷史

| 時間 | 版本 | 重點 |
| --- | --- | --- |
| 2004 | Spring 1.0 | XML 設定 |
| 2009 | Spring 3.0 | Java 設定（`@Configuration`）、SpEL、REST 支援 |
| 2013 | Spring 4.0 | Java 8、WebSocket、`@Conditional` |
| 2014 | Boot 1.0 | 自動配置、starter、內嵌伺服器 |
| 2017 至 2018 | Spring 5.0 / Boot 2.0 | WebFlux、Kotlin、Java 8 基準 |
| 2020 | Boot 2.3 / 2.4 | 分層 jar、優雅關機、新的設定檔處理方式 |
| 2021 | Boot 2.6 | 預設禁止循環依賴 |
| 2022 年 11 月 | Spring 6.0 / Boot 3.0 | Java 17、Jakarta EE、AOT、原生映像檔、Observation |
| 2023 年 5 月 | Boot 3.1 | Testcontainers 的 `@ServiceConnection`、Docker Compose 支援 |
| 2023 年 11 月 | Spring 6.1 / Boot 3.2 | 虛擬執行緒、`RestClient`、`JdbcClient` |
| 2024 年 5 月 | Boot 3.3 | CDS 支援、`jarmode=tools` |
| 2024 年 11 月 | Spring 6.2 / Boot 3.4 | `@MockitoBean`、結構化日誌、優雅關機預設開啟、`MockMvcTester`、`@Fallback` |
| 2025 年 5 月 | Boot 3.5 | 3.x 的最後一個版本 |
| 2025 年 11 月 | Spring 7.0 / Boot 4.0 | 模組化、Jackson 3、JSpecify、API 版本控制、HTTP Interface 群組、內建重試、Security 7 |
| 2026 年 6 月 | Boot 4.1 | gRPC、OpenTelemetry 強化、`@Async` 追蹤傳遞 |

## 驗證範圍與校閱備註

來源手冊撰寫於 2026 年 10 月，搭配的版本：Spring Boot 4.1.1、Spring Framework 7.0.9、Spring Security 7.1.1、Hibernate ORM 7.4.5、Jackson 3.1.5、Tomcat 11.0.24、HikariCP 7.0.2、Flyway 12.4.0、Kafka 用戶端 4.2.1、Testcontainers 2.0.5、JUnit 6.0.3、Spring Cloud 2025.1.3。

**已完成的驗證**：全書標示「已驗證」的行為，都在一個以 start.spring.io 產生的 Spring Boot 4.1.1 專案中寫成測試，在 JDK 21.0.2 上一次執行，21 個測試類別、67 個測試全數通過。涵蓋生命週期、依賴注入與循環依賴、AOP 與代理、快取、交易行為、JPA（N+1、髒檢查、鎖）、自動配置與設定綁定、啟動事件、Jackson 預設、REST API 與安全、切片測試、Testcontainers（PostgreSQL、Kafka）等。

**沒有驗證的部分**（使用前請以官方文件確認）：

- 虛擬執行緒的效能比較與釘住問題、原生映像檔，沒有實際執行。
- Redis 設定沒有連線到真正的 Redis 執行。
- MFA 只確認了註解與常數的名稱，沒有建立完整的登入流程。
- 與 Keycloak 的整合、`authorities-claim-expressions` 屬性沒有實際執行。
- 多資料來源與讀寫分離、Gateway 與 Resilience4j 範例，只依據文件撰寫。
- 只擷取片段的示意程式碼沒有編譯。

**建議優先核對的內容**：Spring Cloud 2026.0 的發布時間、Boot 4.1 的 Jackson 屬性、springdoc-openapi 對 Boot 4 的支援版本、AOT cache 的參數名稱（以 JDK 25 文件為準）、Gateway 屬性前綴。

## 官方文件

- [Spring Boot 參考文件](https://docs.spring.io/spring-boot/)
- [Spring Framework 參考文件](https://docs.spring.io/spring-framework/reference/)
- [Spring Security 參考文件](https://docs.spring.io/spring-security/reference/)
- [Spring Data JPA 參考文件](https://docs.spring.io/spring-data/jpa/reference/)
- [Spring Boot 4.0 遷移指南](https://github.com/spring-projects/spring-boot/wiki/Spring-Boot-4.0-Migration-Guide)
- [Spring Framework 7.0 發布說明](https://github.com/spring-projects/spring-framework/wiki/Spring-Framework-7.0-Release-Notes)
- [spring.io/guides](https://spring.io/guides)
- [Hibernate ORM 使用者指南](https://docs.jboss.org/hibernate/orm/current/userguide/html_single/Hibernate_User_Guide.html)
