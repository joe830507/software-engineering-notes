# Spring Data JPA

> 範例的行為在來源都已驗證（Hibernate 統計、測試斷言）。

## Repository 與實體狀態

### Repository 的魔法

```java
public interface AuthorRepository extends JpaRepository<Author, Long> {
    List<Author> findByNameContainingIgnoreCase(String keyword);
}
```

你只寫了介面，Spring Data 在啟動時為它產生實作（透過 `ImportBeanDefinitionRegistrar` 註冊、用 JDK 動態代理建立）。方法名稱會被解析成查詢：`findBy` 加上 `NameContainingIgnoreCase`，變成 `where upper(name) like upper(?)`。

| 關鍵字 | 範例 | 對應的 SQL 片段 |
| --- | --- | --- |
| `And` / `Or` | `findByStatusAndCustomerId` | `where status = ?1 and customer_id = ?2` |
| `Between` | `findByCreatedAtBetween` | `between ?1 and ?2` |
| `LessThan` / `GreaterThanEqual` | `findByAmountGreaterThanEqual` | `>= ?1` |
| `In` | `findByStatusIn(Collection)` | `in ?1` |
| `Containing` / `StartingWith` | `findByNameStartingWith` | `like ?1%` |
| `OrderBy` | `findByStatusOrderByCreatedAtDesc` | `order by created_at desc` |
| `Top` / `First` | `findTop10ByOrderByAmountDesc` | `limit 10` |
| `exists` / `count` / `delete` | `existsByEmail` | |

方法名稱超過兩三個條件就該改用 `@Query`，否則可讀性很差。

### 實體的四種狀態

理解 JPA 的關鍵是**持久化上下文（persistence context）**：一個「目前交易中被管理的實體」的集合，也叫一級快取。

| 狀態 | 意義 | 如何進入 |
| --- | --- | --- |
| Transient（暫時） | 剛 new 出來，JPA 不知道它 | `new Author(...)` |
| Managed（受管理） | 在持久化上下文中，變更會被自動寫回 | `persist()`、`find()`、查詢結果 |
| Detached（分離） | 曾經受管理，但持久化上下文已關閉 | 交易結束、`clear()`、`detach()` |
| Removed（已刪除） | 標記為刪除，提交時執行 delete | `remove()` |

由此衍生出幾個重要行為：

**一級快取**：同一個交易中用相同 id 查兩次，只會送出一次 SQL，而且拿到的是同一個 Java 物件。

**髒檢查（dirty checking）**：受管理的實體被修改後，**不需要呼叫 `save()`**，提交時 Hibernate 會比對快照，自動送出 update：

```java
@Transactional
public void rename(long id, String name) {
    authorRepository.findById(id).orElseThrow().setName(name); // 沒有 save，照樣更新
}
```

**`save()` 的語意**：Spring Data 的 `save()` 會判斷實體是不是新的（預設看 id 是否為 null）。新的呼叫 `persist()`，舊的呼叫 `merge()`。`merge()` 會把分離物件的狀態複製到一個受管理的物件上，**回傳的是另一個實例**。所以要用 `save()` 的回傳值，不要繼續使用傳進去的物件。

**批次更新繞過持久化上下文**：`@Modifying @Query("update ...")` 直接對資料庫下 SQL。同一個交易中已經載入的實體不會被更新，再用 `findById` 查到的還是舊值（一級快取）。加上 `@Modifying(clearAutomatically = true)` 會在執行後清空持久化上下文，之後的查詢會重新讀取。

## N+1 與延遲載入

### N+1 問題

```java
@Entity
public class Author {
    @OneToMany(mappedBy = "author") // 一對多預設 LAZY
    private List<Book> books = new ArrayList<>();
}

@Transactional(readOnly = true)
public void printAll() {
    for (Author a : authorRepository.findAll()) {     // 1 次查詢：select * from author
        System.out.println(a.getBooks().size());      // 每位作者 1 次：select * from book where author_id = ?
    }
}
```

5 位作者會送出 1 + 5 = 6 次查詢。1000 位作者就是 1001 次，這就是 N+1。它在開發環境資料少時看不出來，上線後資料一多才爆發。

### 四種解法

```java
// 解法一：fetch join
@Query("select distinct a from Author a left join fetch a.books")
List<Author> findAllWithBooks();

// 解法二：EntityGraph
@EntityGraph(attributePaths = "books")
List<Author> findByNameStartingWith(String prefix);
```

**解法三：批次抓取**。設定 `spring.jpa.properties.hibernate.default_batch_fetch_size=100`，Hibernate 會把延遲載入合併成 `where author_id in (?, ?, ...)`，N+1 變成 1 + N/100。這是一個好的全域預設值，對所有關聯都有效。

**解法四：DTO 投影**，只查需要的欄位：

```java
public record AuthorSummary(String name, int bookCount) {}

@Query("""
        select new com.example.handbook.jpa.AuthorSummary(a.name, size(a.books))
        from Author a order by a.name""")
List<AuthorSummary> summaries();
```

**fetch join 加分頁的陷阱**：對集合做 fetch join 的同時又分頁，資料庫無法正確分頁（一位作者有多列），Hibernate 只好把所有資料撈回記憶體再分頁，並在日誌中警告 `HHH90003004`。資料量大時會造成記憶體問題。解法是先分頁查出 id，再用 id 清單做 fetch join；或使用批次抓取。

**偵測 N+1**：開發時開啟 SQL 日誌；測試中用 Hibernate 統計（`hibernate.generate_statistics=true`）斷言查詢次數。

### LazyInitializationException 與 OSIV

在交易之外存取延遲載入的關聯，會拋出 `LazyInitializationException`，因為持久化上下文已經關閉，沒辦法再去資料庫抓資料。

Spring Boot 預設開啟 **Open Session in View（OSIV）**：持久化上下文從請求開始一直開到回應寫完。這樣在 Controller 甚至 JSON 序列化時存取延遲關聯都不會出錯，所以很多人從來沒遇過這個例外，直到關掉 OSIV。

OSIV 的問題：

- 資料庫連線從第一次存取資料庫開始，一直佔到請求結束，包括之後序列化 JSON、呼叫外部服務的時間，高並行時連線池容易耗盡。
- 查詢會在你意想不到的地方發生（例如 Jackson 序列化 entity 時），N+1 更難發現。

Boot 啟動時會警告：`spring.jpa.open-in-view is enabled by default`。**建議設成 `false`**，並在 Service 層用 fetch join 或 EntityGraph 明確載入需要的資料，回傳 DTO 給 Controller。

## 關聯對應與鎖

### 關聯對應的建議

| 建議 | 理由 |
| --- | --- |
| `@ManyToOne`、`@OneToOne` 一律加 `fetch = LAZY` | 這兩個預設是 EAGER，會在你不需要時自動 join 或額外查詢 |
| 避免 `@ManyToMany` | 中間表通常很快就需要額外欄位，改成兩個 `@OneToMany` 加一個中間實體 |
| 雙向關聯要寫輔助方法同步兩邊 | `book.setAuthor(a)` 時也要 `a.getBooks().add(book)` |
| 小心 `CascadeType.REMOVE` 與 `orphanRemoval` | 刪錯一筆可能連帶刪掉大量資料 |
| 不要在 `toString()`、`equals()` 中存取延遲關聯 | 會觸發查詢或例外 |
| 主鍵生成優先用 `SEQUENCE` | `IDENTITY` 讓 Hibernate 無法做 JDBC 批次插入，因為必須逐筆插入才能拿到 id |

**實體的 `equals` 與 `hashCode`**：不要用 Lombok 的 `@Data` 或 `@EqualsAndHashCode` 產生全欄位比較，它會碰到延遲關聯，而且 id 在 persist 前後會改變。常見的做法是只比較 id，並讓 `hashCode` 回傳固定值（例如 `getClass().hashCode()`），或使用不可變的業務鍵。

### 樂觀鎖

假設衝突很少，不先上鎖，更新時檢查版本號：

```java
@Entity
public class Account {
    @Version
    private long version; // update ... set balance = ?, version = version + 1 where id = ? and version = ?
}
```

兩個人同時讀到 version 0，第一個人更新成功後 version 變成 1；第二個人拿 version 0 去更新，影響 0 列，Spring 拋出 `ObjectOptimisticLockingFailureException`。處理方式是重試（重新讀取、重新計算）或告訴使用者資料已被他人修改。

### 悲觀鎖

先鎖住再說，適合衝突頻繁的情境：

```java
@Lock(LockModeType.PESSIMISTIC_WRITE) // select ... for update
@Query("select a from Account a where a.id = :id")
Optional<Account> findByIdForUpdate(Long id);
```

悲觀鎖必須在交易中使用，並要注意死鎖：多個交易以不同順序鎖定多筆資料時會互相等待。慣例是永遠依固定順序（例如 id 由小到大）上鎖。

| 情境 | 建議 |
| --- | --- |
| 一般的編輯表單 | 樂觀鎖 |
| 帳戶扣款、庫存扣減，衝突頻繁 | 悲觀鎖，或用單一 SQL 原子更新：`update stock set qty = qty - 1 where id = ? and qty >= 1` |
| 跨服務、跨資料庫 | 分散式鎖（Redis、資料庫），但優先考慮能不能用設計避免 |

### Spring Data JDBC

如果你喜歡 Spring Data 的 Repository 介面，但覺得 JPA 太複雜（持久化上下文、延遲載入、髒檢查），可以考慮 Spring Data JDBC。它沒有延遲載入，沒有快取，`save()` 就是立刻寫入，以「聚合根（aggregate root）」為單位存取。行為簡單可預測，非常適合 DDD 風格的設計。
