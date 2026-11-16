# 連線池、遷移與多資料來源

## HikariCP 連線池

Spring Boot 預設使用 HikariCP 連線池。

| 設定 | 預設 | 建議 |
| --- | --- | --- |
| `maximum-pool-size` | 10 | 不是越大越好，見下方說明 |
| `minimum-idle` | 等於最大值 | 保持預設（固定大小的池最穩定） |
| `connection-timeout` | 30 秒 | 調低到 2 到 5 秒，取不到連線就快速失敗，而不是讓請求排隊排到逾時 |
| `max-lifetime` | 30 分鐘 | 要比資料庫或中間防火牆的閒置斷線時間短幾分鐘 |
| `leak-detection-threshold` | 關閉 | 開發與測試環境設成 2 到 10 秒，連線借出超過這個時間沒還就印出堆疊 |

全部在 `spring.datasource.hikari.*` 底下設定。

### 連線池大小

直覺上連線越多越快，實際上資料庫能同時有效處理的查詢數，大約是 CPU 核心數的兩倍。超過之後連線只是在資料庫端排隊，反而增加切換成本。HikariCP 的建議公式是 `核心數 × 2 + 有效磁碟數`，從小的值開始壓測再調整。

還要記得：**所有應用程式實例的連線總數不能超過資料庫的上限**。10 個 Pod 各開 50 條，就是 500 條。

## Flyway 遷移

Schema 的變更必須和程式碼一起版本控制。Flyway 是 Boot 生態中最常用的遷移工具：

```
src/main/resources/db/migration/
├── V1__init.sql
├── V2__add_order_status.sql
└── R__refresh_report_view.sql   # R 開頭：可重複執行，內容改變就重跑
```

Boot 4 需要加 `spring-boot-starter-flyway`，只加 `flyway-core` 已經不會觸發自動配置。另外，**Flyway 10 起，大部分資料庫的支援拆成獨立模組**，用 PostgreSQL 時要再加：

```xml
<dependency>
    <groupId>org.flywaydb</groupId>
    <artifactId>flyway-database-postgresql</artifactId>
</dependency>
```

少了這個模組，啟動時會失敗並顯示 `Unsupported Database: PostgreSQL 18.6`。H2 不需要額外模組，所以只用 H2 測試的專案常常到部署時才發現。

### 原則

1. **已經執行過的遷移檔絕不修改**。Flyway 會比對校驗碼，修改後啟動失敗。要變更就新增一個版本。
2. **正式環境的 `spring.jpa.hibernate.ddl-auto` 必須是 `validate` 或 `none`**，絕對不能是 `update` 或 `create`。`validate` 會在啟動時檢查實體與 schema 是否一致，是很好的保護。
3. **零停機部署要用「擴展與收縮」（expand and contract）**：滾動更新期間新舊版本的程式碼同時在跑，所以 schema 變更必須同時相容兩個版本。例如改欄位名稱要拆成多次部署：新增新欄位並雙寫 → 回填資料 → 程式改讀新欄位 → 刪除舊欄位。

## 多個資料來源

有兩個資料庫時，Boot 的自動配置只能處理一個，第二個要自己定義：

```java
@Configuration(proxyBeanMethods = false)
public class DataSourcesConfig {

    @Bean
    @Primary
    @ConfigurationProperties("app.datasource.orders")
    DataSourceProperties ordersDataSourceProperties() { return new DataSourceProperties(); }

    @Bean
    @Primary
    @ConfigurationProperties("app.datasource.orders.hikari")
    HikariDataSource ordersDataSource(DataSourceProperties ordersDataSourceProperties) {
        return ordersDataSourceProperties.initializeDataSourceBuilder().type(HikariDataSource.class).build();
    }

    @Bean
    @ConfigurationProperties("app.datasource.reports")
    DataSourceProperties reportsDataSourceProperties() { return new DataSourceProperties(); }

    @Bean(defaultCandidate = false) // Framework 6.2：不參與一般的型別注入，只能用 @Qualifier 取得
    @ConfigurationProperties("app.datasource.reports.hikari")
    HikariDataSource reportsDataSource(@Qualifier("reportsDataSourceProperties") DataSourceProperties props) {
        return props.initializeDataSourceBuilder().type(HikariDataSource.class).build();
    }
}
```

`defaultCandidate = false` 很實用：第二個資料來源不會干擾自動配置（自動配置仍然只看到主要的那一個），需要時用 `@Qualifier` 明確注入。

如果兩個資料來源都要用 JPA，每一個都要有自己的 `LocalContainerEntityManagerFactoryBean` 與 `JpaTransactionManager`，並用 `@EnableJpaRepositories(basePackages = ..., entityManagerFactoryRef = ..., transactionManagerRef = ...)` 區分 Repository。使用時 `@Transactional("reportsTransactionManager")` 要指定交易管理器。

## 讀寫分離

用 `AbstractRoutingDataSource` 依照交易是否唯讀，把查詢導到主庫或唯讀副本：

```java
public class ReadWriteRoutingDataSource extends AbstractRoutingDataSource {
    @Override
    protected Object determineCurrentLookupKey() {
        return TransactionSynchronizationManager.isCurrentTransactionReadOnly() ? "replica" : "primary";
    }
}
```

關鍵細節：路由資料來源外面要包一層 `LazyConnectionDataSourceProxy`。因為交易管理器在**開始交易時**就會取得連線，這時候唯讀旗標可能還沒設定好。延遲代理會等到第一次真正執行 SQL 時才取得連線，路由才會正確。Boot 4.1 新增了 `spring.datasource.connection-fetch=lazy`，自動做這層包裝（依據發布說明撰寫，來源未實測）。

只有「主庫加一個唯讀副本」時，還有更簡單的寫法：Framework 6.1.2 起，`LazyConnectionDataSourceProxy` 內建讀寫分離，不需要自己寫 `AbstractRoutingDataSource`：

```java
// primaryDataSource、replicaDataSource 依上一節的方式定義，並標上 @Bean(defaultCandidate = false)，
// 讓一般注入與自動配置只看到下面這個代理
@Bean
@Primary
DataSource dataSource(@Qualifier("primaryDataSource") DataSource primary,
                      @Qualifier("replicaDataSource") DataSource replica) {
    var proxy = new LazyConnectionDataSourceProxy(primary);
    proxy.setReadOnlyDataSource(replica); // readOnly = true 的交易自動走副本
    return proxy;
}
```

另外要注意副本的複寫延遲：使用者剛寫入，馬上讀取時可能讀不到自己的資料。需要「讀到自己的寫入」的查詢，要強制走主庫。
