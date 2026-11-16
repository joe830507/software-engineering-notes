# JdbcClient 與 Spring Data JDBC

> 最貼近 SQL 的 Spring 原生方案。

## 為什麼還要學純 JDBC

### 原生 JDBC 有多痛苦

```java
Connection conn = null;
PreparedStatement ps = null;
ResultSet rs = null;
try {
    conn = dataSource.getConnection();
    ps = conn.prepareStatement("select id, name from author where id = ?");
    ps.setLong(1, id);
    rs = ps.executeQuery();
    if (rs.next()) {
        return new Author(rs.getLong("id"), rs.getString("name"));
    }
    return null;
} catch (SQLException e) {
    throw new RuntimeException(e);
} finally {
    // 關 rs、ps、conn，每個都要 try-catch……
}
```

Spring 把「取得連線、關閉資源、轉換例外、參與交易」這些樣板全部包起來，你只要寫 SQL 和「一列怎麼變成物件」。

### 三代 API

| API | 出現時間 | 特色 |
| --- | --- | --- |
| `JdbcTemplate` | Spring 1.x | 參數用 `?`，按位置綁定 |
| `NamedParameterJdbcTemplate` | Spring 2.x | 參數用 `:name` |
| **`JdbcClient`** | Spring 6.1 | 流暢（fluent）API，同時支援 `?` 和 `:name`，**新程式推薦用這個** |

`JdbcClient` 底層還是 `JdbcTemplate`，所以三者可以混用，共用交易。

什麼時候用：報表、統計、任何複雜 SQL；大量批次匯入匯出；專案主要用 JPA，但有幾支查詢 JPA 寫起來很彆扭；小型服務，不想引入 ORM。

加入 `spring-boot-starter-jdbc` 後，Boot 會自動建立 `DataSource`（HikariCP）、`JdbcTemplate`、`NamedParameterJdbcTemplate`、`JdbcClient` 和 `DataSourceTransactionManager`，直接注入即可。如果有用 `spring-boot-starter-data-jpa`，這些 bean 也都有，可以和 JPA 並用。

## JdbcClient 查詢

### 查單筆與結尾方法

```java
public Optional<Author> findById(long id) {
    return jdbc.sql("select id, name, email from author where id = :id")
               .param("id", id)
               .query(Author.class)      // 自動對應：欄位名 → 建構子參數或屬性
               .optional();
}
```

| 方法 | 行為 |
| --- | --- |
| `.single()` | 剛好一筆，否則拋例外（0 筆 `EmptyResultDataAccessException`，多筆 `IncorrectResultSizeDataAccessException`） |
| `.optional()` | 0 或 1 筆，多筆拋例外 |
| `.list()` | List |
| `.set()` | Set |
| `.stream()` | Stream，**必須用 try-with-resources 關閉** |

### 自動對應的規則

`.query(Author.class)` 會依類別型態選擇對應方式：

| 目標類別 | 對應方式 |
| --- | --- |
| `String`、`Long` 等簡單型別 | `SingleColumnRowMapper`：結果必須剛好一欄，多欄會拋例外 |
| 其他（record、有建構子的類別、JavaBean） | `SimplePropertyRowMapper`：先依建構子參數名對應，其餘再依 setter 或欄位寫入 |

欄位名會做**底線轉駝峰**的寬鬆比對（`created_at` → `createdAt`）。要區分「多查了欄位」與「漏查必要欄位」：結果中沒有對應屬性的多餘欄位通常會被忽略；但 record 或建構子需要的欄位缺失時，可能直接拋例外。JavaBean 未被設定的屬性則保留預設值，不一定都是 null。

**最推薦的組合：record + 欄位別名**：

```java
public record AuthorSummary(long id, String name, int bookCount) {}

List<AuthorSummary> list = jdbc.sql("""
        select a.id, a.name, count(b.id) as book_count
        from author a left join book b on b.author_id = a.id
        group by a.id, a.name
        order by book_count desc
        """)
        .query(AuthorSummary.class)
        .list();
```

### 自己寫 RowMapper

需要轉換、計算、巢狀物件時：

```java
private static final RowMapper<Author> AUTHOR_MAPPER = (rs, rowNum) -> new Author(
        rs.getLong("id"),
        rs.getString("name"),
        AuthorStatus.valueOf(rs.getString("status")),
        rs.getObject("created_at", LocalDateTime.class));
```

**`rs.getLong()` 的 null 陷阱**：欄位是 NULL 時 `getLong` 回傳 `0`，不是 null。可為 null 的數字欄位用 `rs.getObject("col", Long.class)`。

### 參數與 in 查詢

```java
// 具名參數
jdbc.sql("select * from book where author_id = :aid and price > :min")
    .param("aid", 1L)
    .param("min", new BigDecimal("100"))

// 位置參數
jdbc.sql("select * from book where author_id = ? and price > ?")
    .param(1L)
    .param(new BigDecimal("100"))

// 用物件的屬性（record 或 bean）
jdbc.sql("insert into author(name, email) values (:name, :email)")
    .paramSource(newAuthor)
```

**同一條 SQL 不能混用 `?` 和 `:name`。**

具名參數直接傳集合就會自動展開：

```java
jdbc.sql("select * from book where id in (:ids)")
    .param("ids", List.of(1L, 2L, 3L))      // → in (?, ?, ?)
    .query(Book.class).list();
```

一樣要注意空集合（產生 `in ()` 語法錯誤）與資料庫的參數上限。

### 一對多組裝

JdbcClient 沒有自動關聯對應。最清楚的做法是查兩次再用 Java 組，固定 2 次查詢，沒有 N+1：

```java
public List<AuthorWithBooks> listWithBooks() {
    List<Author> authors = jdbc.sql("select id, name from author order by name")
                               .query(Author.class).list();
    if (authors.isEmpty()) return List.of();

    Map<Long, List<Book>> booksByAuthor = jdbc.sql(
                    "select id, author_id, title from book where author_id in (:ids)")
            .param("ids", authors.stream().map(Author::id).toList())
            .query(Book.class).list().stream()
            .collect(Collectors.groupingBy(Book::authorId));

    return authors.stream()
            .map(a -> new AuthorWithBooks(a, booksByAuthor.getOrDefault(a.id(), List.of())))
            .toList();
}
```

## 寫入、批次與例外

### 寫入與主鍵

```java
int rows = jdbc.sql("update author set name = :name where id = :id")
               .param("name", newName)
               .param("id", id)
               .update();            // 回傳影響列數

KeyHolder keyHolder = new GeneratedKeyHolder();
jdbc.sql("insert into author(name, email) values (:name, :email)")
    .param("name", "Joe")
    .param("email", "joe@example.com")
    .update(keyHolder, "id");        // 指定主鍵欄位名，PostgreSQL 必須指定，不然會回傳所有欄位
long id = keyHolder.getKeyAs(Long.class);
```

PostgreSQL 也可以用 `insert ... returning id` 搭配 `.query(Long.class).single()`。

樂觀鎖自己寫：

```java
int rows = jdbc.sql("""
        update account set balance = :balance, version = version + 1
        where id = :id and version = :version
        """)
        .paramSource(account)
        .update();
if (rows == 0) throw new OptimisticLockingFailureException("account " + account.id());
```

### 批次處理

`JdbcClient` 目前沒有批次 API，批次用 `JdbcTemplate` 或 `NamedParameterJdbcTemplate`：

```java
jdbcTemplate.batchUpdate(
        "insert into book(author_id, title, price) values (?, ?, ?)",
        books,
        1000,                                   // 每 1000 筆送一批
        (ps, b) -> {
            ps.setLong(1, b.authorId());
            ps.setString(2, b.title());
            ps.setBigDecimal(3, b.price());
        });
```

**MySQL**：JDBC URL 加 `rewriteBatchedStatements=true`，驅動才會改寫成多值 insert，速度差距可達十倍以上。**PostgreSQL**：可加 `reWriteBatchedInserts=true`。

### 大量讀取：串流

```java
@Transactional(readOnly = true)
public void export(Writer out) {
    try (Stream<Book> s = streamingJdbcTemplate.queryForStream(
            "select * from book", new DataClassRowMapper<>(Book.class))) {
        s.forEach(b -> writeCsv(out, b));
    }
}

// 在 DAO 建構子中自己 new 一個，不要宣告成 @Bean：
// 自己宣告 JdbcTemplate bean 會讓 Boot 自動配置的那個退場（@ConditionalOnMissingBean）
this.streamingJdbcTemplate = new JdbcTemplate(dataSource);
this.streamingJdbcTemplate.setFetchSize(1000);
```

MySQL 驅動預設會把整個結果集讀進記憶體，`fetchSize` 無效。要真正串流需在 URL 加 `useCursorFetch=true`，或把 fetchSize 設為 `Integer.MIN_VALUE`。

### 例外轉換與交易

Spring 會把 `SQLException` 轉換成語意化的 `DataAccessException` 子類別（unchecked）：

| 例外 | 意思 |
| --- | --- |
| `DuplicateKeyException` | 唯一鍵衝突 |
| `DataIntegrityViolationException` | 違反約束（外鍵、NOT NULL） |
| `EmptyResultDataAccessException` | 預期一筆卻沒資料 |
| `IncorrectResultSizeDataAccessException` | 筆數不對 |
| `CannotAcquireLockException` / `PessimisticLockingFailureException` | 鎖等待逾時 / 死鎖 |
| `QueryTimeoutException` | 查詢逾時 |
| `BadSqlGrammarException` | SQL 語法錯誤 |

所以可以直接 catch 業務相關的例外，不用解析錯誤碼。

交易和其他方案一樣用 `@Transactional`。JdbcClient 會從 `TransactionSynchronizationManager` 取得目前交易綁定的連線，同一個交易內的所有呼叫共用一條連線。**和 JPA 混用**：JPA 的變更在 flush 前還在記憶體中，JdbcClient 查不到，混用時先 `entityManager.flush()`。

`SimpleJdbcInsert` 懶得寫 insert 語句時：

```java
SimpleJdbcInsert insert = new SimpleJdbcInsert(dataSource)
        .withTableName("author")
        .usingGeneratedKeyColumns("id");

Number id = insert.executeAndReturnKey(Map.of("name", "Joe", "email", "joe@example.com"));
```

## Spring Data JDBC

### 一句話與核心思想

**有 Spring Data Repository 的便利，但沒有 JPA 的複雜度。**

| 特性 | JPA / Hibernate | Spring Data JDBC |
| --- | --- | --- |
| 持久化上下文 / 一級快取 | 有 | **沒有** |
| 髒檢查（不呼叫 save 也會更新） | 有 | **沒有，一定要呼叫 save** |
| 延遲載入 | 有 | **沒有**，查聚合就整個載入 |
| `LazyInitializationException` | 會遇到 | 不可能發生 |
| 關聯 | 任意方向、多對多 | 只支援「聚合根擁有子實體」，跨聚合用 id 引用 |
| `save()` 的行為 | persist / merge | 立刻送 SQL |
| 產生的 SQL | 複雜 | 簡單直觀 |
| 學習成本 | 高 | 低 |

**聚合（Aggregate）** 是 DDD 的概念：

- **聚合 = 一群必須一起存取、一起保持一致的物件**，例如「訂單 + 訂單明細」。
- **聚合根 = 這群物件對外的唯一入口**，例如「訂單」。外部只能透過訂單去操作明細，不能直接拿明細的 Repository 來改。
- **一個聚合一個 Repository**。只有 `OrderRepository`，沒有 `OrderItemRepository`。
- **聚合之間只用 id 引用**。訂單裡存 `customerId`，不存 `Customer` 物件。

Spring Data JDBC 強迫你這樣設計。如果你的模型是一大張互相關聯的網，它會很難用；但如果你願意照聚合來切，它會非常清爽。

### 實體與對應

加入 `spring-boot-starter-data-jdbc`。**它不會建立資料表**，schema 要自己用 Flyway / Liquibase 或 `schema.sql` 管理。

```java
@Table("orders")
public record Order(
        @Id Long id,
        Long customerId,                    // 跨聚合：只存 id
        OrderStatus status,
        @MappedCollection(idColumn = "order_id", keyColumn = "line_no")
        List<OrderItem> items,              // 聚合內的子實體
        @Version Integer version,
        @CreatedDate Instant createdAt) {

    public Order withId(Long newId) {
        return new Order(newId, customerId, status, items, version, createdAt);
    }
    public Order withStatus(OrderStatus s) {
        return new Order(id, customerId, s, items, version, createdAt);
    }
    public Order withItems(List<OrderItem> newItems) {
        return new Order(id, customerId, status, List.copyOf(newItems), version, createdAt);
    }
}

@Table("order_item")
public record OrderItem(Long productId, int qty, BigDecimal price) {}
```

```sql
create table order_item (
    order_id   bigint not null references orders(id),
    line_no    int not null,                  -- List 的索引
    product_id bigint not null,
    qty        int not null,
    price      numeric(12,2) not null,
    primary key (order_id, line_no)
);
```

**可以用 record，也可以用一般類別**。Spring Data JDBC 支援不可變物件：產生 id 後，它會透過 `with` 方法或全參數建構子建立一個新物件回傳。所以**一定要用 `save()` 的回傳值**。

命名規則：類別 `OrderItem` → 表 `order_item`；屬性 `customerId` → 欄位 `customer_id`；子實體集合的外鍵預設是聚合根表名，**通常要用 `@MappedCollection(idColumn = ...)` 指定**。

支援的關聯型態：單一子實體（一對一）、`Set`、`List`（需要順序欄位）、`Map`（需要 key 欄位）、`@Embedded` 值物件、`AggregateReference<Customer, Long>`（跨聚合引用）。**不支援**：多對多、從子實體反向指回聚合根、跨聚合的物件引用。

嵌入值物件：

```java
public record Customer(
        @Id Long id,
        String name,
        @Embedded.Nullable(prefix = "addr_") Address address) {}  // 欄位：addr_city, addr_street
```

### Repository

```java
public interface OrderRepository extends ListCrudRepository<Order, Long>,
                                         PagingAndSortingRepository<Order, Long> {

    List<Order> findByCustomerId(Long customerId);

    @Query("select * from orders where created_at < :before and status = 'PENDING'")
    List<Order> findExpired(Instant before);

    @Modifying
    @Query("update orders set status = :status where id = :id")
    boolean updateStatus(Long id, OrderStatus status);
}
```

`@Query` 這裡寫的是**原生 SQL**（不是 JPQL）。衍生查詢支援的關鍵字與 JPA 大致相同，但**不能跨聚合導覽屬性**（例如 `findByCustomerName` 不行，因為 Order 沒有 Customer 物件）。

### `save()` 的行為：要特別注意

```java
Order order = new Order(null, 1L, PENDING, List.of(item1, item2), null, null);
order = orderRepository.save(order);   // insert orders + insert 2 筆 order_item
```

**更新聚合時，子實體是「全刪再全插」**：

```java
order = order.withItems(List.of(item1, item2, item3));
orderRepository.save(order);
// update orders set ... where id = ?
// delete from order_item where order_id = ?
// insert into order_item ...（3 筆）
```

這是為了簡單所做的設計：它沒有快照，不知道哪些子實體變了，所以整個重寫。影響：

- 子實體很多（上千筆）的聚合，每次存都很慢。這通常代表聚合切得太大了。
- 子實體表的自增 id 每次都會變，**不要讓外部引用子實體的 id**。
- 子表上有其他表的外鍵指過來時，delete 會失敗。

**新舊判斷**：和 Spring Data JPA 一樣，id 為 null（或有 `@Version` 且 version 為 null）視為新的，執行 insert；否則 update。**自己指定 id 的實體**，`save()` 會走 update，影響 0 列，拋出 `IncorrectUpdateSemanticsDataAccessException`。解法：實作 `Persistable` 自己決定 `isNew()`，或使用 `JdbcAggregateTemplate.insert(entity)` 明確 insert。

### 沒有延遲載入的代價

`findAll()` 會把每個聚合的所有子實體都載入。列表頁用投影或直接 `JdbcClient` 查 DTO。

預設情況下，載入有子實體的聚合時，會對每個集合**另外送查詢**，查 N 個聚合就可能變成 N+1。Spring Data JDBC 3.2 起提供「單一查詢載入」，用視窗函數一次查回，但只支援部分資料庫方言、只適用於 Repository 產生的查詢，各版本支援範圍持續變動。導入前請查官方文件並開 SQL log 確認。

### 自訂轉換、事件與稽核

```java
@WritingConverter
class MoneyToLong implements Converter<Money, Long> {
    public Long convert(Money m) { return m.cents(); }
}

@ReadingConverter
class LongToMoney implements Converter<Long, Money> {
    public Money convert(Long v) { return new Money(v); }
}
```

生命週期回呼：`BeforeConvertCallback`（轉成 SQL 參數前，可修改實體，例如填 id）、`BeforeSaveCallback`、`AfterSaveEvent`、`AfterConvertCallback`、`BeforeDeleteEvent` / `AfterDeleteEvent`。

稽核用 `@EnableJdbcAuditing`，欄位標 `@CreatedDate`、`@LastModifiedDate` 等。領域事件與 JPA 相同，可繼承 `AbstractAggregateRoot`。因為 Spring Data JDBC 一定要呼叫 `save()`，所以不會有 JPA「靠髒檢查沒呼叫 save 導致事件沒發出」的問題。

### 搭配 JdbcClient

複雜查詢時，Repository 可以混入自訂實作，在裡面用 JdbcClient：

```java
class OrderRepositoryCustomImpl implements OrderRepositoryCustom {
    private final JdbcClient jdbc;
    OrderRepositoryCustomImpl(JdbcClient jdbc) { this.jdbc = jdbc; }

    public List<MonthlySales> monthlySales(int year) {
        return jdbc.sql("""
                select extract(month from o.created_at) as month,
                       sum(i.qty * i.price) as amount
                from orders o join order_item i on i.order_id = o.id
                where extract(year from o.created_at) = :year
                group by 1 order by 1
                """)
                .param("year", year)
                .query(MonthlySales.class)
                .list();
    }
}

public interface OrderRepository extends ListCrudRepository<Order, Long>, OrderRepositoryCustom {}
```

**這是很推薦的組合**：寫入走聚合（保持一致性），讀取（特別是列表與報表）走 JdbcClient 查 DTO。這其實就是輕量版的 CQRS。

### 測試

```java
@JdbcTest                                  // 只有 DataSource、JdbcTemplate、JdbcClient
@AutoConfigureTestDatabase(replace = Replace.NONE)
@Import({TestcontainersConfig.class, AuthorDao.class})
class AuthorDaoTest { ... }

@DataJdbcTest                              // 加上 Spring Data JDBC Repository
@AutoConfigureTestDatabase(replace = Replace.NONE)
@Import(TestcontainersConfig.class)
class OrderRepositoryTest { ... }
```

兩者都會在測試結束時回滾。Spring Boot 4 的測試切片已模組化，`@JdbcTest`、`@DataJdbcTest` 所在的套件和 artifact 與 Boot 3 不同，升級時注意依賴與 import。

## 地雷清單與面試問答

### 地雷清單

| # | 地雷 | 症狀 | 解法 |
| --- | --- | --- | --- |
| 1 | `rs.getLong()` 讀 NULL | 得到 0 | `rs.getObject(col, Long.class)` |
| 2 | 自動對應欄位名不一致 | 屬性為 null 不報錯 | 用欄位別名，寫測試 |
| 3 | `in (:ids)` 傳空集合 | SQL 語法錯誤 | 先判斷 |
| 4 | `Stream` 沒關閉 | 連線洩漏 | try-with-resources |
| 5 | MySQL 批次沒加 rewrite 參數 | 批次很慢 | `rewriteBatchedStatements=true` |
| 6 | MySQL 大量查詢 | OOM，fetchSize 無效 | `useCursorFetch=true` |
| 7 | 字串拼接 SQL | SQL Injection | 一律用參數綁定 |
| 8 | 和 JPA 混用 | 查不到剛 save 的資料 | 先 flush |
| 9 | Spring Data JDBC 沒用 save 回傳值 | id 為 null | `x = repo.save(x)` |
| 10 | 修改後沒呼叫 save | 沒有更新（沒有髒檢查） | 一定要 save |
| 11 | 子實體很多的聚合 | 每次 save 很慢 | 聚合切小 |
| 12 | 外部引用子實體 id | id 每次 save 都變 | 子實體不要被外部引用 |
| 13 | 自己指定 id 呼叫 save | `IncorrectUpdateSemanticsDataAccessException` | `Persistable` 或 `template.insert` |
| 14 | `@MappedCollection` 沒指定 idColumn | 找不到外鍵欄位 | 明確指定 |
| 15 | 以為 Data JDBC 會建表 | 啟動後表不存在 | Flyway / schema.sql |

### 面試常見問題

**Q1：JdbcTemplate、NamedParameterJdbcTemplate、JdbcClient 差在哪？**
三者底層相同。JdbcTemplate 用位置參數，NamedParameter 用具名參數，JdbcClient 是 Spring 6.1 推出的流暢 API，兩種參數都支援，並能自動對應到 record。

**Q2：JdbcTemplate 怎麼參與 Spring 交易？**
透過 `DataSourceUtils.getConnection()` 從 `TransactionSynchronizationManager` 取得目前執行緒綁定的連線，交易中所有操作共用同一條連線。

**Q3：Spring 為什麼要把 SQLException 轉成 DataAccessException？**
SQLException 是 checked exception 且錯誤碼因資料庫而異。Spring 轉成 unchecked 且語意化的例外階層，讓程式與資料庫解耦。

**Q4：Spring Data JDBC 和 Spring Data JPA 最大的差別？**
Data JDBC 沒有持久化上下文、髒檢查、延遲載入與快取；以聚合為單位存取，`save` 立即執行 SQL，行為簡單可預測。

**Q5：Spring Data JDBC 更新聚合時子實體怎麼處理？**
刪除所有子實體再重新插入，因為它不追蹤變更。

**Q6：什麼是聚合根？**
DDD 中一組必須保持一致的物件的唯一入口；外部只能透過聚合根修改內部物件，一個聚合對應一個 Repository，聚合間以 id 引用。

**Q7：怎麼用 JdbcTemplate 做批次？MySQL 要注意什麼？**
`batchUpdate`，並指定每批大小；MySQL 需在連線字串加 `rewriteBatchedStatements=true` 才會真正合併。
