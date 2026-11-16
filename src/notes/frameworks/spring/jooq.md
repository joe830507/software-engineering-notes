# jOOQ

> 用 Java 寫型別安全的 SQL。

## jOOQ 是什麼

### 一眼看懂

```sql
select a.name, count(b.id) as book_count
from author a
left join book b on b.author_id = a.id
where a.country = 'TW'
group by a.name
having count(b.id) > 2
order by book_count desc
limit 10;
```

```java
var bookCount = count(BOOK.ID).as("book_count");

dsl.select(AUTHOR.NAME, bookCount)
   .from(AUTHOR)
   .leftJoin(BOOK).on(BOOK.AUTHOR_ID.eq(AUTHOR.ID))
   .where(AUTHOR.COUNTRY.eq("TW"))
   .groupBy(AUTHOR.NAME)
   .having(count(BOOK.ID).gt(2))
   .orderBy(bookCount.desc())
   .limit(10)
   .fetch();
```

`AUTHOR`、`BOOK`、`AUTHOR.NAME` 這些都是 jOOQ **從你的資料庫 schema 自動產生**的 Java 類別。改了欄位名重新產生，用到舊名稱的地方全部編譯失敗，一個都不會漏。

### 和其他方案比較

| | jOOQ | JPA | MyBatis | JdbcClient |
| --- | --- | --- | --- | --- |
| SQL 寫在哪 | Java DSL | 框架產生 / JPQL | XML / 註解 | Java 字串 |
| 型別安全 | **編譯期檢查欄位與型別** | 部分（Criteria + metamodel） | 無 | 無 |
| 複雜 SQL（CTE、視窗函數、upsert） | **很強** | 中 | 強 | 強 |
| 動態查詢 | 很自然（就是 Java 程式） | Specification，較繁瑣 | XML 動態標籤 | 手動拼字串，易出錯 |
| 物件關聯、髒檢查 | 無 | 有 | 無 | 無 |
| 需要程式碼產生 | 是 | 否 | 否 | 否 |
| 授權 | 開源版只支援開源資料庫 | 免費 | 免費 | 免費 |

### 授權：一定要先確認

- **Open Source Edition（Apache 2.0）**：支援 PostgreSQL、MySQL、MariaDB、SQLite、H2、HSQLDB 等**開源資料庫**。
- **商業版（Express / Professional / Enterprise）**：支援 Oracle、SQL Server、DB2 等商業資料庫，以及部分進階功能，需要付費。

**公司用 Oracle 或 SQL Server，就不能直接用開源版。**導入前先確認資料庫和預算。

### 什麼時候用

- 系統以複雜查詢、報表為主，又想要型別安全。
- schema 由資料庫主導（Database-first），想讓程式碼跟著 schema 走。
- 團隊 SQL 能力強，喜歡「看得到 SQL」。
- 常見組合：**寫入用 JPA / Spring Data JDBC，複雜讀取用 jOOQ**。

## 專案設定與程式碼產生

### 依賴與產生來源

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-jooq</artifactId>
</dependency>
```

Boot 會自動配置 `DSLContext`，並讓它參與 Spring 交易，也會把 SQL 例外轉換成 Spring 的 `DataAccessException`。

jOOQ 需要先讀取資料庫 schema，產生對應的 Java 類別。常見三種來源：

| 來源 | 做法 | 優缺點 |
| --- | --- | --- |
| 連線到真實資料庫 | `jooq-codegen-maven` 連 JDBC | 最準確；但建置時要有資料庫 |
| 讀 Flyway / Liquibase 遷移檔 | `DDLDatabase`、`LiquibaseDatabase` | 建置不需資料庫；但 DDL 解析器不是百分之百支援所有方言語法 |
| Testcontainers + Flyway | 建置時啟動容器、跑遷移、再產生 | **最推薦**：準確且可重現；需要 Docker |

### Maven 外掛設定

```xml
<plugin>
    <groupId>org.jooq</groupId>
    <artifactId>jooq-codegen-maven</artifactId>
    <version>${jooq.version}</version>
    <executions>
        <execution><goals><goal>generate</goal></goals></execution>
    </executions>
    <dependencies>
        <dependency>
            <groupId>org.postgresql</groupId>
            <artifactId>postgresql</artifactId>
            <version>${postgresql.version}</version>
        </dependency>
    </dependencies>
    <configuration>
        <jdbc>
            <url>jdbc:postgresql://localhost:5432/shop</url>
            <user>shop</user>
            <password>${env.DB_PASSWORD}</password>
        </jdbc>
        <generator>
            <database>
                <inputSchema>public</inputSchema>
                <excludes>flyway_schema_history</excludes>
            </database>
            <generate>
                <records>true</records>
                <pojos>true</pojos>
                <javaTimeTypes>true</javaTimeTypes>
                <pojosAsJavaRecordClasses>true</pojosAsJavaRecordClasses>
            </generate>
            <target>
                <packageName>com.example.shop.jooq</packageName>
                <directory>target/generated-sources/jooq</directory>
            </target>
        </generator>
    </configuration>
</plugin>
```

### 產生了什麼

```
com.example.shop.jooq
 ├─ Tables.java               ← 靜態常數 AUTHOR、BOOK
 ├─ Keys.java                 ← 主鍵、外鍵、唯一鍵
 ├─ tables/
 │   ├─ Author.java           ← 資料表類別，欄位 AUTHOR.ID、AUTHOR.NAME
 │   ├─ records/AuthorRecord.java  ← 一列資料（可更新的 Record）
 │   └─ pojos/Author.java     ← 純資料物件（可選）
 └─ ...
```

```java
import static com.example.shop.jooq.Tables.*;
import static org.jooq.impl.DSL.*;
```

產生的程式碼要不要進版控：

| | 進版控 | 不進版控（每次建置產生） |
| --- | --- | --- |
| 優點 | 建置不需資料庫；code review 看得到 schema 變化 | 永遠與 schema 同步 |
| 缺點 | 可能忘記重新產生 | 建置環境要能產生（DB 或 Docker） |

搭配 Testcontainers 的話，通常選「不進版控」。

## 查詢

### DSLContext 與取回方式

`DSLContext` 是執行緒安全的，可以當單例注入使用。

```java
// 多筆
var result = dsl.select(AUTHOR.ID, AUTHOR.NAME).from(AUTHOR).fetch();

// 單筆
AuthorRecord a = dsl.selectFrom(AUTHOR).where(AUTHOR.ID.eq(1L)).fetchOne();   // 沒有回傳 null，多筆拋例外
Optional<AuthorRecord> oa = dsl.selectFrom(AUTHOR).where(AUTHOR.ID.eq(1L)).fetchOptional();

// 單一值與清單
int count = dsl.fetchCount(AUTHOR);
List<String> names = dsl.select(AUTHOR.NAME).from(AUTHOR).fetch(AUTHOR.NAME);

// 存在
boolean exists = dsl.fetchExists(selectOne().from(AUTHOR).where(AUTHOR.EMAIL.eq(email)));
```

| fetch 方法 | 行為 |
| --- | --- |
| `fetch()` | 全部 |
| `fetchOne()` | 0 筆 null、1 筆回傳、多筆拋 `TooManyRowsException` |
| `fetchSingle()` | 剛好 1 筆，否則拋例外 |
| `fetchOptional()` | Optional |
| `fetchAny()` | 第一筆（沒有就 null） |
| `fetchInto(Class)` | 轉成指定類別的 List |
| `fetchMap(key, value)` / `fetchGroups(key)` | 轉成 Map |
| `fetchLazy()` / `fetchStream()` | 游標，大量資料用，要關閉 |

看它產生的 SQL：`.getSQL()`，或開 log `logging.level.org.jooq.tools.LoggerListener: debug`。

方言：`DSLContext` 依 `SQLDialect` 產生對應語法，Boot 會從 DataSource 自動偵測，也可設 `spring.jooq.sql-dialect: postgres`。同一段程式碼的 `limit 10` 在 PostgreSQL 產生 `limit ?`，在（商業版）Oracle 產生 `fetch next ? rows only`。

### 條件運算子

```java
AUTHOR.NAME.eq("Joe")                       // =
BOOK.PRICE.gt(BigDecimal.TEN)               // >
BOOK.PRICE.between(min, max)
BOOK.TITLE.containsIgnoreCase("spring")     // lower(title) like lower('%spring%')
BOOK.TITLE.startsWith("Java")
BOOK.ID.in(ids)
BOOK.DELETED_AT.isNull()
AUTHOR.COUNTRY.eq("TW").and(AUTHOR.STATUS.eq("ACTIVE"))
not(AUTHOR.STATUS.eq("BANNED"))
```

型別是檢查過的：`BOOK.PRICE.gt("abc")` 編譯失敗，因為 `PRICE` 是 `Field<BigDecimal>`。

### 動態查詢與動態排序

條件是物件，可以放進 List、用 if 組合，這是 jOOQ 最舒服的地方：

```java
public List<BookRecord> search(BookSearch s) {
    List<Condition> conds = new ArrayList<>();
    if (s.keyword() != null)  conds.add(BOOK.TITLE.containsIgnoreCase(s.keyword()));
    if (s.minPrice() != null) conds.add(BOOK.PRICE.ge(s.minPrice()));
    if (s.authorId() != null) conds.add(BOOK.AUTHOR_ID.eq(s.authorId()));

    return dsl.selectFrom(BOOK)
              .where(conds)                 // 空 List 等於沒有 where（noCondition）
              .orderBy(BOOK.ID.desc())
              .limit(s.size()).offset(s.offset())
              .fetch();
}
```

動態排序，安全又簡單：

```java
private static final Map<String, Field<?>> SORTABLE = Map.of(
        "title", BOOK.TITLE, "price", BOOK.PRICE, "publishedAt", BOOK.PUBLISHED_AT);

SortField<?> sort(String key, boolean desc) {
    Field<?> f = SORTABLE.getOrDefault(key, BOOK.ID);
    return desc ? f.desc() : f.asc();
}
```

前端傳來的字串只用來查白名單 Map，根本不會進到 SQL，沒有注入問題。

### SQL Injection：唯一的風險點

jOOQ 預設所有值都用綁定參數，很安全。**唯一的風險是「Plain SQL」API**：

```java
// 危險：字串直接拼進 SQL
dsl.fetch("select * from book where title = '" + input + "'");
condition("title = '" + input + "'");

// 安全：用 {0} 或 ? 佔位
dsl.fetch("select * from book where title = ?", input);
condition("title = {0}", val(input));
```

所有接受 `String sql` 的方法都標了 `@PlainSQL`，可以用 `jooq-checker` 在編譯期禁止使用。

## 進階查詢

### Join 與別名

```java
dsl.select(BOOK.TITLE, AUTHOR.NAME)
   .from(BOOK)
   .join(AUTHOR).on(AUTHOR.ID.eq(BOOK.AUTHOR_ID))
   .fetch();

// 利用外鍵資訊自動推導 on 條件
dsl.select(BOOK.TITLE, AUTHOR.NAME).from(BOOK).join(AUTHOR).onKey().fetch();

// 隱式 join（path）：產生器依外鍵產生路徑方法
dsl.select(BOOK.TITLE, BOOK.author().NAME).from(BOOK).fetch();

// 別名
var a = AUTHOR.as("a");
var b = BOOK.as("b");
dsl.select(a.NAME, b.TITLE).from(a).join(b).on(b.AUTHOR_ID.eq(a.ID)).fetch();
```

### 子查詢與聚合

```java
// where id in (子查詢)
dsl.selectFrom(AUTHOR)
   .where(AUTHOR.ID.in(select(BOOK.AUTHOR_ID).from(BOOK).where(BOOK.PRICE.gt(BigDecimal.valueOf(500)))))
   .fetch();

// exists
dsl.selectFrom(AUTHOR)
   .whereExists(selectOne().from(BOOK).where(BOOK.AUTHOR_ID.eq(AUTHOR.ID)))
   .fetch();

// 純量子查詢放在 select
var bookCount = field(selectCount().from(BOOK).where(BOOK.AUTHOR_ID.eq(AUTHOR.ID))).as("book_count");

// 聚合
dsl.select(AUTHOR.COUNTRY, count(), avg(BOOK.PRICE))
   .from(AUTHOR).join(BOOK).on(BOOK.AUTHOR_ID.eq(AUTHOR.ID))
   .groupBy(AUTHOR.COUNTRY)
   .having(count().gt(10))
   .fetch();
```

### 視窗函數與 CTE

```java
// 每位作者最暢銷的 3 本書
var rn = rowNumber().over(partitionBy(BOOK.AUTHOR_ID).orderBy(BOOK.SALES.desc())).as("rn");
var ranked = select(BOOK.AUTHOR_ID, BOOK.TITLE, BOOK.SALES, rn).from(BOOK).asTable("ranked");

dsl.select(ranked.field(BOOK.AUTHOR_ID), ranked.field(BOOK.TITLE))
   .from(ranked)
   .where(ranked.field(rn).le(3))
   .fetch();

// 累計銷售
sum(ORDERS.AMOUNT).over(orderBy(ORDERS.CREATED_AT))
```

```java
// CTE
var monthly = name("monthly").fields("month", "amount").as(
        select(month(ORDERS.CREATED_AT), sum(ORDERS.AMOUNT))
        .from(ORDERS)
        .groupBy(month(ORDERS.CREATED_AT)));

dsl.with(monthly).select().from(monthly)
   .where(monthly.field("amount", BigDecimal.class).gt(BigDecimal.valueOf(100000)))
   .fetch();
```

這些在 JPA 中幾乎只能寫原生 SQL，在 jOOQ 中則全部型別安全。

## 結果對應與 MULTISET

### 對應方式

```java
public record AuthorDto(Long id, String name) {}

// fetchInto：用欄位名（或建構子參數順序）反射對應，名稱不一致不會在編譯期發現
List<AuthorDto> list = dsl.select(AUTHOR.ID, AUTHOR.NAME).from(AUTHOR).fetchInto(AuthorDto.class);

// Records.mapping（推薦）：檢查欄位型別與建構子參數型別，不一致就編譯失敗
List<AuthorDto> list2 = dsl.select(AUTHOR.ID, AUTHOR.NAME)
                           .from(AUTHOR)
                           .fetch(Records.mapping(AuthorDto::new));

// Map / 分組
Map<Long, String> idToName = dsl.select(AUTHOR.ID, AUTHOR.NAME).from(AUTHOR).fetchMap(AUTHOR.ID, AUTHOR.NAME);
Map<Long, List<BookRecord>> booksByAuthor = dsl.selectFrom(BOOK).fetchGroups(BOOK.AUTHOR_ID);
```

`Records.mapping` 是 jOOQ 3.15 之後的最佳實務。

### MULTISET：一次查詢拿到巢狀結果

「作者含書籍列表」這種一對多，傳統做法要嘛 join 後自己組，要嘛查兩次。jOOQ 3.15 起提供 `MULTISET`：

```java
public record BookDto(Long id, String title) {}
public record AuthorWithBooks(Long id, String name, List<BookDto> books) {}

List<AuthorWithBooks> result = dsl
        .select(
                AUTHOR.ID,
                AUTHOR.NAME,
                multiset(
                        select(BOOK.ID, BOOK.TITLE)
                        .from(BOOK)
                        .where(BOOK.AUTHOR_ID.eq(AUTHOR.ID))
                        .orderBy(BOOK.ID)
                ).convertFrom(r -> r.map(Records.mapping(BookDto::new))))
        .from(AUTHOR)
        .orderBy(AUTHOR.NAME)
        .fetch(Records.mapping(AuthorWithBooks::new));
```

原理：jOOQ 把 `multiset` 翻譯成資料庫的 JSON / XML 聚合函式（PostgreSQL 的 `jsonb_agg`、MySQL 的 `json_arrayagg`），在資料庫端把子查詢結果包成 JSON，再在 Java 端解回物件。所以：

- **只送一次 SQL**，沒有 N+1，也沒有 join 造成的重複列。
- 分頁時 `limit` 作用在作者上，結果正確（不會有一對多 join 分頁的問題）。
- 可以多層巢狀。

**注意**：資料量很大時，JSON 序列化有成本；不同資料庫的實作效能差異也大。先用 `explain` 和實際資料量測過。一對一可以用 `row(...)` 組成巢狀物件。

## 寫入與鎖

### insert / update / delete / upsert

```java
// 取回自增主鍵
Long id = dsl.insertInto(AUTHOR)
             .set(AUTHOR.NAME, "Joe")
             .set(AUTHOR.EMAIL, "joe@example.com")
             .returningResult(AUTHOR.ID)
             .fetchOne(AUTHOR.ID);

int rows = dsl.update(BOOK)
              .set(BOOK.PRICE, BOOK.PRICE.mul(0.9))
              .where(BOOK.AUTHOR_ID.eq(authorId))
              .execute();

dsl.deleteFrom(BOOK).where(BOOK.ID.eq(id)).execute();
```

`returning` 在 PostgreSQL 用原生 `returning`，在 MySQL 則透過 JDBC 的 generated keys 模擬。

**防止全表操作**：jOOQ 預設不攔截沒有 where 的 update / delete，可設定讓它直接拋例外：

```java
@Bean
DefaultConfigurationCustomizer jooqCustomizer() {
    return c -> c.settings()
            .withExecuteUpdateWithoutWhere(ExecuteWithoutWhere.THROW)
            .withExecuteDeleteWithoutWhere(ExecuteWithoutWhere.THROW);
}
```

Upsert，同一段程式碼會依方言翻成對應語法（PostgreSQL `on conflict`、MySQL `on duplicate key update`）：

```java
dsl.insertInto(AUTHOR, AUTHOR.EMAIL, AUTHOR.NAME)
   .values(email, name)
   .onConflict(AUTHOR.EMAIL)
   .doUpdate()
   .set(AUTHOR.NAME, excluded(AUTHOR.NAME))
   .execute();

dsl.insertInto(TAG, TAG.NAME).values("java").onConflictDoNothing().execute();   // 衝突時什麼都不做
```

### 批次

```java
// 方式一：多值 insert（一條 SQL）
var insert = dsl.insertInto(BOOK, BOOK.AUTHOR_ID, BOOK.TITLE, BOOK.PRICE);
for (Book b : books) insert = insert.values(b.authorId(), b.title(), b.price());
insert.execute();

// 方式二：JDBC batch（同一條 SQL，多組參數）
var batch = dsl.batch(dsl.insertInto(BOOK, BOOK.AUTHOR_ID, BOOK.TITLE, BOOK.PRICE)
                         .values((Long) null, null, null));
for (Book b : books) batch.bind(b.authorId(), b.title(), b.price());
batch.execute();

// 方式三：批次存 Record
dsl.batchStore(records).execute();
```

大量匯入一樣要分批（每批 500～1000 筆），MySQL 記得 `rewriteBatchedStatements=true`。更大量的資料可用 Loader API 從 CSV / JSON 匯入（`dsl.loadInto(BOOK).batchAfter(1000).commitAfter(10).loadCSV(...)`）。

### UpdatableRecord 與樂觀 / 悲觀鎖

有主鍵的表，產生的 Record 是 `UpdatableRecord`，類 Active Record 寫法：

```java
AuthorRecord a = dsl.newRecord(AUTHOR);
a.setName("Joe");
a.store();                    // insert，id 回填到 a

a.setName("Joe Lin");
a.store();                    // update author set name = ? where id = ?（只更新有變動的欄位）
```

Record 跟資料表綁很死，通常只在簡單 CRUD 中使用；業務邏輯建議用自己的領域物件 + 明確的 update 語句。

樂觀鎖：產生器設定 `<recordVersionFields>version</recordVersionFields>` 並開啟 `Settings.withExecuteWithOptimisticLocking(true)`，之後 `record.store()` 會產生 `where id = ? and version = ?`，衝突時拋 `DataChangedException`。不用 Record 的話，自己寫條件：

```java
int rows = dsl.update(ACCOUNT)
              .set(ACCOUNT.BALANCE, newBalance)
              .set(ACCOUNT.VERSION, ACCOUNT.VERSION.plus(1))
              .where(ACCOUNT.ID.eq(id).and(ACCOUNT.VERSION.eq(version)))
              .execute();
if (rows == 0) throw new OptimisticLockingFailureException("account " + id);
```

悲觀鎖：

```java
dsl.selectFrom(ACCOUNT).where(ACCOUNT.ID.eq(id)).forUpdate().fetchOne();
dsl.selectFrom(JOB).where(JOB.STATUS.eq("READY")).limit(10).forUpdate().skipLocked().fetch();  // 工作佇列
```

`for update skip locked` 是用資料表做工作佇列的經典寫法，多個 worker 各自搶不同的列。

## 交易、整合與測試

### 交易

用 Spring Boot starter 時，`DSLContext` 會自動參與 `@Transactional`：

```java
@Transactional
public void transfer(long from, long to, BigDecimal amount) {
    dsl.update(ACCOUNT).set(ACCOUNT.BALANCE, ACCOUNT.BALANCE.minus(amount)).where(ACCOUNT.ID.eq(from)).execute();
    dsl.update(ACCOUNT).set(ACCOUNT.BALANCE, ACCOUNT.BALANCE.plus(amount)).where(ACCOUNT.ID.eq(to)).execute();
}
```

jOOQ 也有自己的交易 API `dsl.transaction(cfg -> ...)`，但在 Spring 專案中**統一用 `@Transactional`**，不要混用兩套。和 JPA 共存時，jOOQ 看不到 JPA 尚未 flush 的變更，處理方式與 JdbcClient 相同。

### 自訂型別：Converter 與 forcedTypes

資料庫存 `varchar`，Java 想用列舉；資料庫存 `bigint`（分），Java 想用 `Money`：

```xml
<database>
    <forcedTypes>
        <forcedType>
            <userType>com.example.shop.domain.OrderStatus</userType>
            <enumConverter>true</enumConverter>
            <includeExpression>orders\.status</includeExpression>
        </forcedType>
        <forcedType>
            <userType>com.example.shop.domain.Money</userType>
            <converter>com.example.shop.jooq.MoneyConverter</converter>
            <includeExpression>.*\.amount_cents</includeExpression>
        </forcedType>
    </forcedTypes>
</database>
```

```java
public class MoneyConverter extends AbstractConverter<Long, Money> {
    public MoneyConverter() { super(Long.class, Money.class); }
    @Override public Money from(Long v) { return v == null ? null : new Money(v); }
    @Override public Long to(Money m) { return m == null ? null : m.cents(); }
}
```

產生後 `ORDERS.STATUS` 的型別就是 `Field<OrderStatus>`，編譯期檢查一路延伸到業務型別。`includeExpression` 要寫得夠精準：一旦某欄位被 forcedType 改成 `Money`，所有用到它的地方都得改傳 `Money`。

### Repository 寫法建議

jOOQ 沒有 Repository 抽象，建議自己包一層：

```java
@Repository
public class BookRepository {
    private final DSLContext dsl;
    public BookRepository(DSLContext dsl) { this.dsl = dsl; }

    public Optional<BookDto> findById(long id) {
        return dsl.select(BOOK.ID, BOOK.TITLE, BOOK.PRICE)
                  .from(BOOK).where(BOOK.ID.eq(id))
                  .fetchOptional(Records.mapping(BookDto::new));
    }
}
```

**不要讓 jOOQ 產生的 Record 類別跨出 Repository 層**，否則 Service、Controller 都會依賴資料表結構。對外回傳自己的 DTO 或領域物件。

### ExecuteListener：攔截與監控

```java
@Bean
ExecuteListenerProvider slowQueryListener() {
    return new DefaultExecuteListenerProvider(new ExecuteListener() {
        @Override public void executeStart(ExecuteContext ctx) {
            ctx.data("start", System.nanoTime());          // 存在這次執行的 context 上
        }
        @Override public void executeEnd(ExecuteContext ctx) {
            long ms = (System.nanoTime() - (Long) ctx.data("start")) / 1_000_000;
            if (ms > 500) log.warn("Slow SQL ({} ms): {}", ms, ctx.sql());
        }
    });
}
```

直接宣告成 `ExecuteListenerProvider` bean，Boot 會把它和自己的 listener（例如把 SQL 例外轉成 `DataAccessException` 的那個）一起註冊。**不要在 `DefaultConfigurationCustomizer` 裡呼叫 `c.set(...)` 設定 listener**，那會整組取代掉 Boot 註冊的 listener，例外轉換就失效了。listener 實例所有執行緒共用，不要把狀態放在欄位上，要用 `ctx.data()`。

### 測試與建置流程

```java
@JooqTest
@AutoConfigureTestDatabase(replace = Replace.NONE)
@Import({TestcontainersConfig.class, BookRepository.class})
class BookRepositoryTest {
    @Autowired BookRepository repo;
    @Autowired DSLContext dsl;
    ...
}
```

建置流程建議：

```
Testcontainers 啟動 DB → Flyway 遷移 → jOOQ codegen → 編譯 → 測試（同樣用 Testcontainers）
```

這樣「schema、產生的程式碼、測試」三者永遠一致。

## 地雷清單與面試問答

### 地雷清單

| # | 地雷 | 症狀 | 解法 |
| --- | --- | --- | --- |
| 1 | 用開源版接 Oracle / SQL Server | 不支援或授權問題 | 先確認授權 |
| 2 | 改了 schema 沒重新產生 | 執行期 SQL 錯誤 | 產生流程整合進建置 |
| 3 | Plain SQL 拼接字串 | SQL Injection | 用 `{0}` / `?` 佔位，啟用 checker |
| 4 | `fetchInto` 名稱不一致 | 欄位為 null | 改用 `Records.mapping` |
| 5 | `fetchOne` 查到多筆 | `TooManyRowsException` | 確保唯一或用 `fetchAny` |
| 6 | 沒 where 的 update / delete | 全表更新 | 設定 `ExecuteWithoutWhere.THROW` |
| 7 | 混用 jOOQ 交易與 `@Transactional` | 交易邊界混亂 | 統一用 Spring |
| 8 | Record 類別傳到 Service / Controller | 層級耦合 | 轉 DTO |
| 9 | `fetchLazy` / `fetchStream` 沒關 | 連線洩漏 | try-with-resources |
| 10 | MULTISET 大量資料 | JSON 序列化慢 | 實測，必要時改兩段式 |
| 11 | DDLDatabase 解析失敗 | 產生不完整 | 改用 Testcontainers 產生 |
| 12 | 和 JPA 混用 | 看不到未 flush 的變更 | 先 flush |

### 面試常見問題

**Q1：jOOQ 和 JPA 的設計哲學差在哪？**
JPA 是物件優先，把 SQL 隱藏起來；jOOQ 是 SQL 優先，把 SQL 變成型別安全的 Java DSL，由資料庫 schema 產生程式碼。

**Q2：jOOQ 的型別安全是怎麼做到的？**
程式碼產生器讀取 schema，為每個表與欄位產生帶泛型的 `Table`、`Field<T>`，DSL 的方法簽章限制只能用相容型別組合，錯誤在編譯期就會被發現。

**Q3：jOOQ 怎麼處理一對多結果？**
可以 join 後用 `fetchGroups` 組裝，或用 `MULTISET` 讓資料庫以 JSON / XML 聚合一次回傳巢狀結果。

**Q4：jOOQ 有 SQL Injection 風險嗎？**
DSL 預設綁定參數是安全的；風險在 Plain SQL API 直接拼接字串時，要用佔位符並可用 checker 在編譯期禁用。

**Q5：什麼時候會選 jOOQ？**
複雜查詢多、需要型別安全、Database-first 的專案，且資料庫在開源版支援範圍內或有預算買商業授權。
