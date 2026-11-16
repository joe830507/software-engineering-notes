# JPA 與 Hibernate 進階

> 這一頁補充「Spring Data JPA」頁沒有涵蓋的部分：Entity 對應、Repository 細節、查詢寫法、效能、稽核與軟刪除，以及地雷清單與面試問答。持久化上下文、N+1、OSIV 與鎖請見「Spring Data JPA」頁。

## Entity 對應

### 最小可用的 Entity

```java
@Entity
@Table(name = "author")
public class Author {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "author_seq")
    @SequenceGenerator(name = "author_seq", sequenceName = "author_seq", allocationSize = 50)
    private Long id;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(unique = true)
    private String email;

    @Enumerated(EnumType.STRING)
    private AuthorStatus status;

    private LocalDateTime createdAt;

    protected Author() {}               // JPA 需要無參數建構子，protected 即可

    public Author(String name, String email) {
        this.name = name;
        this.email = email;
        this.status = AuthorStatus.ACTIVE;
    }

    // getter / 有業務意義的方法，避免無腦 setter
}
```

規則重點：

- 必須有 `@Entity` 和 `@Id`。
- 必須有無參數建構子（可以是 `protected`），Hibernate 用反射建立物件。
- 類別和持久化欄位**不能是 `final`**，Hibernate 要產生子類別代理做延遲載入。
- **不要用 `record` 當 Entity**（record 是 final 且不可變）。record 很適合當 DTO 投影。

### 主鍵生成策略

| 策略 | 原理 | 優缺點 |
| --- | --- | --- |
| `IDENTITY` | 資料庫自增欄位（MySQL `AUTO_INCREMENT`） | 簡單；但 **Hibernate 無法批次 insert**，因為必須逐筆執行才能拿到 id |
| `SEQUENCE` | 資料庫序列（PostgreSQL、Oracle） | 可以批次 insert；`allocationSize` 一次預取多個 id，減少查序列的次數 |
| `TABLE` | 用一張表模擬序列 | 有鎖競爭，效能差，不建議 |
| `UUID` | `@GeneratedValue(strategy = GenerationType.UUID)` | 分散式友善；但隨機 UUID 當 B+Tree 主鍵會造成頁分裂，MySQL 下尤其明顯。可考慮 UUIDv7（時間有序） |

**`allocationSize` 的坑**：JPA 預設是 50，代表 Hibernate 認為序列每次 `nextval` 會跳 50。如果資料庫序列是 `INCREMENT BY 1`，id 就會亂掉或重複。兩邊必須一致：

```sql
create sequence author_seq start with 1 increment by 50;
```

MySQL 沒有序列，通常只能用 `IDENTITY`。要批次寫入大量資料時，改用 JdbcClient 的 `batchUpdate` 比較實在。

### 常用欄位註解

| 註解 | 用途 | 備註 |
| --- | --- | --- |
| `@Column` | 欄位名、長度、是否可空 | `@Column(name = "user_name", length = 50, nullable = false)` |
| `@Enumerated(STRING)` | 列舉存成字串 | **永遠用 STRING**，`ORDINAL` 存數字，調整列舉順序資料就錯了 |
| `@Lob` | 大文字或二進位 | 文章內容、檔案 |
| `@Transient` | 不對應資料庫的欄位 | 計算用的暫存值 |
| `@Version` | 樂觀鎖版本號 | |
| `@Embedded` / `@Embeddable` | 把一組欄位包成值物件 | 地址、金額 |
| `@Convert` | 自訂型別轉換 | 加密欄位、JSON 字串 |

### 值物件、型別轉換與 JSON

**`@Embeddable`**：把相關欄位包成一個物件，Entity 會更有語意：

```java
@Embeddable
public record Address(String city, String street, String zipCode) {}  // Hibernate 6.2+ 支援 record 當 Embeddable

@Entity
public class Customer {
    @Id @GeneratedValue private Long id;

    @Embedded
    private Address address;   // 資料表欄位：city, street, zip_code
}
```

**`AttributeConverter`**：

```java
@Converter
public class MoneyConverter implements AttributeConverter<Money, Long> {
    @Override public Long convertToDatabaseColumn(Money m) { return m == null ? null : m.cents(); }
    @Override public Money convertToEntityAttribute(Long v) { return v == null ? null : new Money(v); }
}

@Convert(converter = MoneyConverter.class)
private Money price;
```

**JSON 欄位**：Hibernate 6 之後原生支援，不用再加第三方套件：

```java
@JdbcTypeCode(SqlTypes.JSON)
private Map<String, Object> attributes;    // PostgreSQL jsonb、MySQL json
```

### `equals` 與 `hashCode`

**不要用 Lombok 的 `@Data` 或 `@EqualsAndHashCode` 標在 Entity 上**。它會把所有欄位（包括延遲關聯）拿來比較，可能觸發查詢、`LazyInitializationException`，甚至雙向關聯互相呼叫導致 StackOverflow。

安全寫法（以 id 為準，hashCode 固定）：

```java
@Override
public boolean equals(Object o) {
    if (this == o) return true;
    if (!(o instanceof Author other)) return false;
    return id != null && id.equals(other.getId());
}

@Override
public int hashCode() {
    return getClass().hashCode();   // 固定值，避免 persist 前後 id 改變導致 HashSet 找不到
}
```

`@ToString` 同理，要排除關聯欄位。Lombok 在 Entity 上比較安全的只有 `@Getter`。

## Repository

### 繼承哪個介面

```
Repository                              ← 標記介面，什麼方法都沒有
 ├ CrudRepository                       ← save / findById / findAll / delete / count
 │  └ ListCrudRepository                ← 同上，但回傳 List 而非 Iterable
 └ PagingAndSortingRepository           ← 分頁與排序（Spring Data 3 起不再繼承 CrudRepository）
    └ ListPagingAndSortingRepository    ← 同上，回傳 List

JpaRepository extends ListCrudRepository, ListPagingAndSortingRepository, QueryByExampleExecutor
                                        ← 再加上 flush、saveAllAndFlush、批次刪除等 JPA 專屬方法
```

日常直接用 `JpaRepository<Entity, ID>` 就好。想**限制**對外開放的方法（例如不允許刪除），可以繼承 `Repository` 再自己挑方法宣告：

```java
public interface OrderRepository extends Repository<Order, Long> {
    Optional<Order> findById(Long id);
    Order save(Order order);
    // 沒有 delete，誰都刪不了
}
```

### 回傳型別

| 回傳型別 | 查不到時 |
| --- | --- |
| `Optional<T>` | `Optional.empty()`（單筆推薦） |
| `T` | `null` |
| `List<T>` | 空 List，不會是 null |
| `Stream<T>` | 必須在交易中使用，並用 try-with-resources 關閉 |
| `Page<T>` / `Slice<T>` | 見分頁 |

查單筆卻查到多筆，會拋 `IncorrectResultSizeDataAccessException`。

### `save()` 到底做了什麼

```java
if (entityInformation.isNew(entity)) {
    em.persist(entity);   // 新的：insert
    return entity;
} else {
    return em.merge(entity);  // 舊的：先 select，再複製狀態，提交時 update
}
```

「是不是新的」預設看 **id 是否為 null**（基本型別看是否為 0），如果有 `@Version` 則看版本號是否為 null。這帶出三個常見問題：

1. **自己指定 id 的 Entity**（例如用業務編號當主鍵），id 一開始就不是 null，`save()` 會走 `merge`，先送一次 `select` 再 `insert`。解法是讓 Entity 實作 `Persistable<ID>`，自己決定 `isNew()`。
2. **`merge` 回傳的是另一個物件**。要用回傳值，不要繼續用傳進去的那個。
3. **受管理的 Entity 根本不需要呼叫 `save()`**（髒檢查）。

```java
@Entity
public class Product implements Persistable<String> {
    @Id private String sku;
    @Transient private boolean isNew = true;

    @Override public String getId() { return sku; }
    @Override public boolean isNew() { return isNew; }

    @PostLoad @PostPersist
    void markNotNew() { this.isNew = false; }
}
```

### 自訂 Repository 實作

衍生查詢和 `@Query` 不夠用時（例如要用 Criteria API 或 JdbcClient），可以混入自訂實作：

```java
public interface BookRepositoryCustom {
    List<Book> searchComplex(BookSearch cond);
}

// 類別名稱必須是「介面名 + Impl」
class BookRepositoryCustomImpl implements BookRepositoryCustom {
    private final EntityManager em;
    BookRepositoryCustomImpl(EntityManager em) { this.em = em; }

    @Override
    public List<Book> searchComplex(BookSearch cond) {
        // 自由發揮：Criteria、原生 SQL、JdbcClient 都可以
    }
}

public interface BookRepository extends JpaRepository<Book, Long>, BookRepositoryCustom {}
```

## 查詢的各種寫法

### 選擇指南

| 需求 | 寫法 |
| --- | --- |
| 簡單條件（1～2 個） | 衍生查詢 |
| 固定的複雜查詢 | `@Query` + JPQL |
| 要用資料庫特有語法（視窗函數、CTE、JSON 函式） | `@Query(nativeQuery = true)` |
| 動態組合條件（搜尋頁） | Specification、Querydsl，或自訂 Repository |
| 只要部分欄位 | 投影（介面或 record） |
| 報表等大量統計 | 考慮不要用 JPA，改用 JdbcClient / MyBatis / jOOQ |

條件超過兩三個，方法名稱就會變成 `findByStatusAndTypeAndCreatedAtBetweenAndOwnerIdOrderByIdDesc` 這種怪物，這時改用 `@Query` 或 Specification。

### `@Query` 與 JPQL、原生 SQL

JPQL 長得像 SQL，但操作的是 **Entity 與屬性**，不是資料表與欄位：

```java
@Query("""
        select b from Book b
        where b.author.id = :authorId
          and b.price between :min and :max
        order by b.publishedAt desc
        """)
List<Book> findByAuthorAndPrice(Long authorId, BigDecimal min, BigDecimal max);
```

- `Book` 是類別名，`b.author.id` 是屬性路徑，不是 `book.author_id`。
- 具名參數用 `:name`。Spring Boot 編譯時預設保留參數名稱（`-parameters`），不需要 `@Param`；若你的建置沒開這個選項，就要加 `@Param("authorId")`。

Hibernate 6 之後 JPQL（正式名稱 HQL）功能大幅增強，支援 `union`、from 中的子查詢、CTE（`with`）、視窗函數、`limit/offset` 等，很多以前非得寫原生 SQL 的場景現在 JPQL 也能做。

原生 SQL 的缺點：失去資料庫可攜性、IDE 無法檢查、改欄位名不會在啟動時報錯。**能用 JPQL 就用 JPQL。**

```java
@Query(value = """
        select * from book
        where to_tsvector(title) @@ plainto_tsquery(:keyword)
        """, nativeQuery = true)
List<Book> fullTextSearch(String keyword);
```

### Specification：動態條件

搜尋頁常見「使用者填了哪些條件就加哪些 where」：

```java
public interface BookRepository extends JpaRepository<Book, Long>, JpaSpecificationExecutor<Book> {}

public final class BookSpecs {
    public static Specification<Book> titleLike(String kw) {
        return (root, query, cb) -> kw == null ? null
                : cb.like(cb.lower(root.get("title")), "%" + kw.toLowerCase() + "%");
    }
    public static Specification<Book> priceGte(BigDecimal min) {
        return (root, query, cb) -> min == null ? null : cb.greaterThanOrEqualTo(root.get("price"), min);
    }
    public static Specification<Book> authorIs(Long authorId) {
        return (root, query, cb) -> authorId == null ? null : cb.equal(root.get("author").get("id"), authorId);
    }
}

// 使用：回傳 null 的條件會被忽略
Specification<Book> spec = Specification.allOf(
        BookSpecs.titleLike(form.keyword()),
        BookSpecs.priceGte(form.minPrice()),
        BookSpecs.authorIs(form.authorId()));
Page<Book> page = bookRepository.findAll(spec, PageRequest.of(0, 20));
```

`root.get("title")` 是字串，打錯要到執行期才知道。可以搭配 Hibernate 的 JPA 靜態 metamodel 產生器（`hibernate-processor`），寫成 `root.get(Book_.title)`，編譯期就能檢查。另一個常見選擇是 **Querydsl**，型別安全、寫法更像 SQL，但它的維護狀況起伏不定，導入前先評估。

### 投影：只查需要的欄位

查整個 Entity 會把所有欄位都撈出來，還要保存快照做髒檢查。列表頁、API 回應通常只要幾個欄位，用投影更省。

**介面投影**：

```java
public interface BookTitleView {
    String getTitle();
    BigDecimal getPrice();
}

List<BookTitleView> findByAuthorId(Long authorId);  // 只 select title, price
```

**record（DTO）投影**，推薦：

```java
public record BookSummary(Long id, String title, String authorName) {}

@Query("""
        select new com.example.book.BookSummary(b.id, b.title, a.name)
        from Book b join b.author a
        where b.status = :status
        """)
List<BookSummary> summaries(BookStatus status);
```

Spring Data JPA 3.x 之後，衍生查詢也能直接回傳 record，只要 record 的建構子參數名和 Entity 屬性名對得上。

**動態投影**：同一個查詢讓呼叫端決定回傳型別：

```java
<T> List<T> findByAuthorId(Long authorId, Class<T> type);

bookRepository.findByAuthorId(1L, BookTitleView.class);
bookRepository.findByAuthorId(1L, Book.class);
```

投影出來的物件不受管理，修改它不會寫回資料庫，也沒有延遲載入問題。**讀多寫少的頁面盡量用投影。**

Query by Example 條件只有「欄位等於某值」時很方便，但不支援範圍查詢、or 條件，用途有限。

## 效能

### 發現 N+1 與同時 fetch 多個集合

1. 開發環境開 `org.hibernate.SQL: debug`，看 log 有沒有一堆重複的 select。
2. 開統計：`spring.jpa.properties.hibernate.generate_statistics=true`。
3. 測試中斷言查詢次數：

```java
@Autowired EntityManagerFactory emf;

@Test
void shouldNotHaveNPlusOne() {
    Statistics stats = emf.unwrap(SessionFactory.class).getStatistics();
    stats.clear();
    authorService.listWithBooks();
    assertThat(stats.getPrepareStatementCount()).isEqualTo(1);
}
```

**同時 fetch join 兩個 `List` 集合**，Hibernate 會拋 `MultipleBagFetchException`（就算不拋，也會產生笛卡兒積）。解法是一次只 fetch 一個集合，其他靠批次抓取；或把集合改成 `Set`（但笛卡兒積的資料量問題還在）。

```java
@EntityGraph(attributePaths = {"books", "books.publisher"})
List<Author> findByCountry(String country);
```

### 批次寫入

```yaml
spring.jpa.properties.hibernate:
  jdbc.batch_size: 50
  order_inserts: true
  order_updates: true
```

設好後，同一交易內多次 `persist` 會合併成 JDBC batch 送出。**但前提是主鍵不能用 `IDENTITY`**。大量資料還要避免一級快取爆掉：

```java
@Transactional
public void importBooks(List<BookRow> rows) {
    for (int i = 0; i < rows.size(); i++) {
        em.persist(toEntity(rows.get(i)));
        if ((i + 1) % 50 == 0) {
            em.flush();   // 送出這批
            em.clear();   // 清空一級快取，釋放記憶體
        }
    }
}
```

`saveAll()` 只是迴圈呼叫 `save()`，不會自動 flush / clear。上萬筆以上的匯入，直接用 `JdbcClient` 或 `JdbcTemplate.batchUpdate` 通常快很多，也沒有記憶體問題。MySQL 要讓 batch 真正生效，JDBC URL 需加 `rewriteBatchedStatements=true`。

### 二級快取與其他技巧

一級快取只活在一個交易內。二級快取跨交易、跨請求共用，需要搭配快取實作（Ehcache、Caffeine 經 JCache、Infinispan）：

```java
@Entity
@Cache(usage = CacheConcurrencyStrategy.READ_WRITE)
public class Category { ... }
```

適合**讀多寫極少**的資料（分類、地區、設定）。缺點：多台機器時要考慮快取一致性；繞過 Hibernate 改資料（直接 SQL、別的服務）快取不會知道。很多團隊選擇不開二級快取，改在 Service 層用 Spring Cache + Redis，控制更明確。

| 技巧 | 說明 |
| --- | --- |
| 唯讀查詢用 `readOnly = true` | 省快照記憶體 |
| 只讀資料用投影 | 不建立 Entity、不做髒檢查 |
| 大量查詢用 `Stream` + `@QueryHints(fetchSize)` | 不一次全部載入記憶體 |
| `@DynamicUpdate` | update 只包含有變的欄位（預設是全部欄位） |
| 關掉 OSIV | 縮短連線佔用時間 |
| 監控連線池 | Actuator 的 `hikaricp.connections.*` 指標 |

## 稽核、軟刪除與事件

### 自動填寫建立 / 修改時間與人員

```java
@Configuration
@EnableJpaAuditing
class JpaAuditConfig {
    @Bean
    AuditorAware<String> auditorAware() {
        return () -> Optional.ofNullable(SecurityContextHolder.getContext().getAuthentication())
                .map(Authentication::getName);
    }
}

@MappedSuperclass
@EntityListeners(AuditingEntityListener.class)
public abstract class AuditableEntity {
    @CreatedDate      private Instant createdAt;
    @LastModifiedDate private Instant updatedAt;
    @CreatedBy        private String createdBy;
    @LastModifiedBy   private String updatedBy;
}
```

### 軟刪除

Hibernate 6.4+ 內建 `@SoftDelete`：

```java
@Entity
@SoftDelete(columnName = "deleted")   // delete 變成 update set deleted = true，查詢自動過濾
public class Book { ... }
```

舊做法是 `@SQLDelete` + `@SQLRestriction`（取代已棄用的 `@Where`）：

```java
@SQLDelete(sql = "update book set deleted_at = now() where id = ?")
@SQLRestriction("deleted_at is null")
```

軟刪除後唯一鍵約束要重新設計（例如 email 唯一，但已刪除的帳號也佔著那個 email）。常見做法是部分索引（PostgreSQL `where deleted_at is null`）或把刪除時間納入唯一鍵。

### 生命週期回呼與領域事件

| 註解 | 時機 |
| --- | --- |
| `@PrePersist` / `@PostPersist` | insert 前 / 後 |
| `@PreUpdate` / `@PostUpdate` | update 前 / 後 |
| `@PreRemove` / `@PostRemove` | delete 前 / 後 |
| `@PostLoad` | 從資料庫載入後 |

只適合做簡單的欄位處理，**不要在回呼中呼叫 Repository 或其他 Service**，行為難以預期。

Spring Data 的聚合根可以發布事件，在 `save()` 時觸發：

```java
@Entity
public class Order extends AbstractAggregateRoot<Order> {
    public void pay() {
        this.status = PAID;
        registerEvent(new OrderPaidEvent(this.id));
    }
}

// 監聽：交易提交後才寄信，避免交易回滾但信已寄出
@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
void onPaid(OrderPaidEvent e) { mailService.sendReceipt(e.orderId()); }
```

事件是在呼叫 `repository.save()` 時發布。依賴髒檢查而沒呼叫 `save()`，事件不會發出。

## 地雷清單與面試問答

### 地雷清單

| # | 地雷 | 症狀 | 解法 |
| --- | --- | --- | --- |
| 1 | `@ManyToOne` 沒設 LAZY | 查一筆帶出一串 join | 一律 `fetch = LAZY` |
| 2 | N+1 | 列表頁很慢、SQL log 一大串 | fetch join / EntityGraph / batch size / 投影 |
| 3 | OSIV 開著 | 高峰期連線池耗盡 | `open-in-view: false` |
| 4 | 用 EAGER 解 Lazy 例外 | 全站變慢 | 改在 Service 明確載入 |
| 5 | Entity 用 `@Data` | StackOverflow、意外查詢 | 只用 `@Getter`，自寫 equals / hashCode |
| 6 | 唯讀方法改了 Entity | 資料被偷偷改掉 | `readOnly = true`、轉 DTO |
| 7 | `@Modifying` 後查到舊值 | 資料不一致 | `clearAutomatically = true` |
| 8 | 集合 fetch join + 分頁 | OOM、HHH90003004 | 兩段式查詢 |
| 9 | `IDENTITY` + 大量匯入 | 匯入很慢 | SEQUENCE 或改用 JDBC batch |
| 10 | `allocationSize` 與序列不一致 | 主鍵重複 | 兩邊設成一樣 |
| 11 | `ddl-auto: update` 上正式 | schema 失控 | Flyway / Liquibase |
| 12 | `EnumType.ORDINAL` | 調整列舉後資料錯亂 | 用 STRING |
| 13 | Entity 直接當 API 回應 | 洩漏欄位、循環參照、延遲載入 | 回傳 DTO |
| 14 | 同類別呼叫 `@Transactional` 方法 | 交易沒生效 | 拆到另一個 bean |
| 15 | `@ManyToOne` 加 Cascade REMOVE | 連鎖誤刪 | 只在父→子方向用 cascade |

### 面試常見問題

**Q1：JPA、Hibernate、Spring Data JPA 的差別？**
JPA 是規格，Hibernate 是實作，Spring Data JPA 是在 JPA 之上自動產生 Repository 的抽象層。

**Q2：為什麼修改 Entity 不用呼叫 save 也會更新？**
Entity 在交易中處於 Managed 狀態，Hibernate 在 flush 時比對快照（髒檢查），自動產生 update。

**Q3：什麼是 N+1？怎麼解？**
查 N 筆主資料後，存取每筆的延遲關聯又各送一次查詢，共 N+1 次。解法有 fetch join、EntityGraph、batch fetch size、DTO 投影。

**Q4：LazyInitializationException 怎麼發生的？OSIV 是什麼？**
實體已分離且關聯尚未載入時，存取該關聯通常會失敗。OSIV 讓持久化上下文延續到請求結束，可能讓序列化階段繼續查資料；但上下文開著不代表原交易還在，連線是否持續佔用取決於連線處理模式與設定。REST API 可考慮關閉 OSIV，在 Service 層載入所需資料並回傳 DTO。

**Q5：`save()` 是 insert 還是 update？**
依 `isNew()` 判斷：預設先檢查適用的非基本型別版本欄位是否為 null，再檢查 id；也可用 `Persistable` 自訂。新的走 `persist`，其他走 `merge`。實際 SQL 時機依實體狀態、主鍵策略與 flush 而定，不能把 merge 固定理解成先 select 再 update。

**Q6：`persist` 和 `merge` 的差別？**
`persist` 讓新的傳入物件受管理；`merge` 對分離物件會把狀態複製到受管理物件，傳入的分離物件不會因此受管理，因此應使用回傳值。若傳入的物件原本已受管理，則可回傳它本身；merge 也可接受新實體，不能一律說傳入物件是 Detached。

**Q7：樂觀鎖和悲觀鎖怎麼選？**
衝突少用樂觀鎖（`@Version`），衝突多或不能失敗用悲觀鎖（`select for update`）。能用單條原子 SQL 解決就優先用原子 SQL。

**Q8：為什麼 `IDENTITY` 不能批次 insert？**
Hibernate 必須在 persist 時就知道 id（要放進一級快取），`IDENTITY` 只能執行 insert 後才拿得到，所以只能逐筆立即執行。

**Q9：一級快取和二級快取的差別？**
一級快取屬於持久化上下文，用來維持同一實體的物件身分一致；生命週期不一定等於交易，例如 OSIV 可跨越 Service 的交易邊界。可透過 clear / detach 移除管理的實體，但不能把它當成可關閉的查詢結果快取。二級快取通常是 SessionFactory 範圍、跨上下文共享，需要另外設定；也不等於查詢快取。

**Q10：什麼情況你不會用 JPA？**
複雜報表、大量批次、需要精細控制 SQL 的場景，改用 JdbcClient、MyBatis 或 jOOQ。
