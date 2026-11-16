# MyBatis 進階

## 關聯查詢

### 一對一與一對多

```java
public class Order {
    private Long id;
    private Customer customer;     // 一對一
    private List<OrderItem> items; // 一對多
}
```

**方式一：join + 巢狀結果（推薦）**，一次 SQL。一對一用 `<association>`，一對多用 `<collection>`：

```xml
<resultMap id="OrderWithItems" type="Order">
    <id property="id" column="o_id"/>
    <result property="status" column="o_status"/>
    <collection property="items" ofType="OrderItem">
        <id property="id" column="i_id"/>
        <result property="productId" column="i_product_id"/>
        <result property="qty" column="i_qty"/>
    </collection>
</resultMap>

<select id="findWithItems" resultMap="OrderWithItems">
    select o.id as o_id, o.status as o_status,
           i.id as i_id, i.product_id as i_product_id, i.qty as i_qty
    from orders o
    left join order_item i on i.order_id = o.id
    where o.id = #{id}
</select>
```

- **欄位別名加前綴**（`o_`、`c_`）是好習慣，因為兩張表都有 `id`、`name`，不加會互相覆蓋。
- 一張訂單有 3 筆明細，SQL 回傳 3 列，MyBatis 依 `<id>` 把它們合併成 1 個 `Order` 帶 3 個 `OrderItem`。**`<id>` 一定要寫**，否則 MyBatis 要用所有欄位比較來判斷是否同一筆，慢而且可能合併錯。

### 巢狀查詢與 N+1

```xml
<resultMap id="OrderLazy" type="Order">
    <id property="id" column="id"/>
    <collection property="items" column="id"
                select="com.example.shop.mapper.OrderItemMapper.findByOrderId"/>
</resultMap>
```

這種寫法每一筆訂單都會再執行一次 `findByOrderId`。查 100 筆訂單就是 1 + 100 次 SQL，**和 JPA 一樣的 N+1 問題**。可以加 `fetchType="lazy"` 讓它用到才查，但本質問題還在。

| 情境 | 做法 |
| --- | --- |
| 查單筆訂單含明細 | join + `<collection>` |
| 查訂單列表（分頁）含明細 | **兩段式**：先分頁查訂單，再用 `where order_id in (...)` 一次查所有明細，在 Java 中用 `groupingBy` 組裝 |
| 列表只需要明細數量 | 用子查詢或 `group by` 算好 |

```java
List<Order> orders = orderMapper.page(cond);
List<Long> ids = orders.stream().map(Order::getId).toList();
Map<Long, List<OrderItem>> itemsByOrder = itemMapper.findByOrderIds(ids).stream()
        .collect(Collectors.groupingBy(OrderItem::getOrderId));
orders.forEach(o -> o.setItems(itemsByOrder.getOrDefault(o.getId(), List.of())));
```

**join + collection + 分頁的陷阱**：一對多 join 後 `limit 10` 限制的是**列數**，不是訂單數，可能只拿到 3 張訂單。所以列表分頁一律用兩段式。

## 分頁、批次與主鍵回填

### 分頁

手寫分頁用 `limit #{size} offset #{offset}` 加一條 count 查詢（用 `<sql>` 片段共用條件）。不想每次都寫 count，可用 PageHelper：

```java
PageHelper.startPage(pageNum, pageSize);       // 下一條查詢自動分頁
List<Order> list = orderMapper.search(cond);   // 這一行會被改寫加上 limit，並自動多送 count
PageInfo<Order> page = new PageInfo<>(list);
```

**最重要的陷阱**：`startPage` 是用 ThreadLocal 傳遞分頁參數，**只對緊接著的第一條查詢生效**。如果中間插了別的查詢，或者 `startPage` 之後因為條件判斷沒有執行查詢，分頁參數會殘留到這個執行緒的下一次查詢（執行緒池會重用執行緒），造成莫名其妙的分頁。**`startPage` 和查詢之間不要有任何其他程式碼。**

### 主鍵回填

```xml
<!-- MySQL / PostgreSQL 自增 -->
<insert id="insert" useGeneratedKeys="true" keyProperty="id">
    insert into orders (...) values (...)
</insert>

<!-- Oracle 序列 -->
<insert id="insert">
    <selectKey keyProperty="id" resultType="long" order="BEFORE">
        select order_seq.nextval from dual
    </selectKey>
    insert into orders (id, ...) values (#{id}, ...)
</insert>
```

執行後 `order.getId()` 就有值了。方法回傳值仍是影響列數，**不是 id**，這是很常見的誤會。

### 批次寫入

| 寫法 | 原理 | 速度 | 注意 |
| --- | --- | --- | --- |
| 迴圈呼叫 `insert` | 每筆一次網路往返 | 最慢 | |
| `<foreach>` 多值 insert | 一條大 SQL | 快 | SQL 長度、參數數量上限，需分批 |
| `ExecutorType.BATCH` | JDBC batch | 快，且 SQL 簡單 | 回傳值不是影響列數；MySQL 要 `rewriteBatchedStatements=true` |

```java
try (SqlSession session = sqlSessionFactory.openSession(ExecutorType.BATCH)) {
    OrderItemMapper mapper = session.getMapper(OrderItemMapper.class);
    for (int i = 0; i < items.size(); i++) {
        mapper.insert(items.get(i));
        if ((i + 1) % 1000 == 0) {
            session.flushStatements();   // 每 1000 筆送一次
        }
    }
    session.flushStatements();
    session.commit();
}
```

自己 `openSession` 的 session **不參與 Spring 交易**。要和 Spring 交易整合，可以宣告一個 BATCH 模式的 `SqlSessionTemplate` bean：

```java
@Bean
SqlSessionTemplate batchSqlSessionTemplate(SqlSessionFactory factory) {
    return new SqlSessionTemplate(factory, ExecutorType.BATCH);
}
```

但同一個交易中不能混用 SIMPLE 與 BATCH 兩種 executor，會拋例外。

### 串流讀取

一次查 100 萬筆到 List 會 OOM。用 `Cursor`：

```java
@Select("select * from orders where created_at < #{before}")
@Options(fetchSize = 1000)
Cursor<Order> streamOld(LocalDate before);

@Transactional(readOnly = true)   // Cursor 必須在連線開著時讀取
public void archive(LocalDate before) {
    try (Cursor<Order> cursor = orderMapper.streamOld(before)) {
        cursor.forEach(this::writeToFile);
    }
}
```

MySQL 驅動要真正串流，`fetchSize` 需設為 `Integer.MIN_VALUE`，或在 URL 加 `useCursorFetch=true` 再設正常的 fetchSize。

## TypeHandler、快取與外掛

### TypeHandler

資料庫存代碼，Java 用列舉：

```java
@MappedTypes(OrderStatus.class)
public class OrderStatusTypeHandler extends BaseTypeHandler<OrderStatus> {
    @Override
    public void setNonNullParameter(PreparedStatement ps, int i, OrderStatus p, JdbcType t) throws SQLException {
        ps.setString(i, p.code());
    }
    @Override
    public OrderStatus getNullableResult(ResultSet rs, String col) throws SQLException {
        String v = rs.getString(col);
        return v == null ? null : OrderStatus.of(v);
    }
    // 另外兩個 getNullableResult 重載（依欄位索引、CallableStatement）寫法相同
}
```

```yaml
mybatis:
  type-handlers-package: com.example.shop.mybatis.handler   # 自動註冊
```

其他常見用途：JSON 欄位 ↔ 物件、加密欄位、`List<String>` ↔ 逗號字串。

### 一級快取與二級快取

**一級快取**：範圍是一個 SqlSession。同一個 SqlSession 內，相同的 SQL + 參數第二次查詢直接回傳快取。任何 insert / update / delete 或 commit 都會清空。

在 Spring 中的實際效果：

- **沒有交易時**：每次呼叫 Mapper 方法都是新的 SqlSession，一級快取等於沒用。
- **在 `@Transactional` 中**：整個交易共用一個 SqlSession，一級快取有效。

坑：交易中查了一次，別的交易改了資料，你再查還是舊值。需要時可以在 `<select>` 加 `flushCache="true"`，或全域設 `local-cache-scope: statement` 關掉。

**二級快取**：範圍是一個 namespace（一個 Mapper），跨 SqlSession 共用，在 XML 加 `<cache/>` 開啟。**實務上幾乎都不建議開**：

- 多台機器各自有快取，彼此不同步。
- 一個 namespace 的寫入只會清自己的快取。如果 `OrderMapper` 的查詢 join 了 `customer` 表，`CustomerMapper` 更新客戶名稱時，`OrderMapper` 的快取不會清，查到舊資料。
- 需要的話，在 Service 層用 Spring Cache + Redis 更好控制。

### 外掛（Interceptor）

MyBatis 允許攔截四個物件的方法：`Executor`、`StatementHandler`、`ParameterHandler`、`ResultSetHandler`。PageHelper、MyBatis-Plus 的分頁、多租戶、資料權限都是這樣做的。

```java
@Intercepts({
    @Signature(type = Executor.class, method = "query",
               args = {MappedStatement.class, Object.class, RowBounds.class, ResultHandler.class}),
    @Signature(type = Executor.class, method = "update",
               args = {MappedStatement.class, Object.class})
})
@Component   // starter 會自動註冊為外掛
public class SlowSqlInterceptor implements Interceptor {
    @Override
    public Object intercept(Invocation inv) throws Throwable {
        long start = System.nanoTime();
        try {
            return inv.proceed();
        } finally {
            long ms = (System.nanoTime() - start) / 1_000_000;
            if (ms > 500) {
                MappedStatement ms0 = (MappedStatement) inv.getArgs()[0];
                log.warn("Slow SQL {} took {} ms", ms0.getId(), ms);
            }
        }
    }
}
```

外掛是有成本的，每條 SQL 都會經過。多個外掛的執行順序和註冊順序相反（後註冊的先執行），會互相影響時要注意。

## 交易、多資料來源與測試

### 和 Spring 交易整合

MyBatis 透過 `SqlSessionTemplate` 自動參與 Spring 的 `@Transactional`，用的是 `DataSourceTransactionManager`。交易失效的規則和 JPA 一樣（自我呼叫、private 方法、checked exception 等）。

**和 JPA 共存**：Boot 有 JPA 時會配置 `JpaTransactionManager`，它也能管理同一個 DataSource 上的 JDBC 操作，MyBatis 可以一起參與。但要注意 JPA 尚未 flush 的變更 MyBatis 看不到，必要時先 `entityManager.flush()`。

### 樂觀鎖

MyBatis 沒有內建，自己寫：

```xml
<update id="updateWithVersion">
    update account
    set balance = #{balance}, version = version + 1
    where id = #{id} and version = #{version}
</update>
```

```java
if (accountMapper.updateWithVersion(account) == 0) {
    throw new OptimisticLockingFailureException("資料已被修改");
}
```

### 多資料來源

每個資料來源要有自己的 `DataSource`、`SqlSessionFactory`、`SqlSessionTemplate`、交易管理器，並用 `@MapperScan` 分開掃描：

```java
@Configuration
@MapperScan(basePackages = "com.example.shop.mapper.order",
            sqlSessionFactoryRef = "orderSqlSessionFactory")
public class OrderDbConfig {

    @Bean
    @ConfigurationProperties("app.datasource.order")
    DataSource orderDataSource() { return DataSourceBuilder.create().build(); }

    @Bean
    SqlSessionFactory orderSqlSessionFactory(@Qualifier("orderDataSource") DataSource ds) throws Exception {
        SqlSessionFactoryBean f = new SqlSessionFactoryBean();
        f.setDataSource(ds);
        f.setMapperLocations(new PathMatchingResourcePatternResolver()
                .getResources("classpath:mapper/order/*.xml"));
        org.apache.ibatis.session.Configuration c = new org.apache.ibatis.session.Configuration();
        c.setMapUnderscoreToCamelCase(true);   // 自訂 factory 時 yml 的 mybatis.configuration 不會套用！
        f.setConfiguration(c);
        return f.getObject();
    }

    @Bean
    DataSourceTransactionManager orderTxManager(@Qualifier("orderDataSource") DataSource ds) {
        return new DataSourceTransactionManager(ds);
    }
}
```

常見坑：

- 自己建立 `SqlSessionFactory` 後，`application.yml` 裡的 `mybatis.*` 設定**不會**自動套用，要在程式中自己設。
- `DataSourceBuilder.create()` 預設建出 HikariCP，搭配 `@ConfigurationProperties` 綁定時，連線字串的屬性名是 **`jdbc-url`**，不是 `url`（寫成 `url` 會啟動失敗：`jdbcUrl is required with driverClassName`）。
- 有多個 `DataSource`、`SqlSessionFactory`、交易管理器時，要把其中一組標 `@Primary`。

使用時 `@Transactional("orderTxManager")` 指定交易管理器。跨資料來源的交易不是原子的，需要分散式交易或補償機制（Saga、Outbox）。

### 測試

需要 `mybatis-spring-boot-starter-test`，用 `@MybatisTest` 只載入 MyBatis 相關元件，每個測試結束自動回滾：

```java
@MybatisTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Testcontainers
class OrderMapperTest {

    @Container
    @ServiceConnection
    static MySQLContainer mysql = new MySQLContainer("mysql:8.4");   // Testcontainers 2.x：org.testcontainers.mysql.MySQLContainer，不再是泛型

    @Autowired OrderMapper orderMapper;

    @Test
    @Sql("/sql/orders.sql")
    void searchByStatus() {
        var cond = new OrderSearch("PAID", null, null, null);
        assertThat(orderMapper.search(cond)).hasSize(2);
    }
}
```

MyBatis 的 SQL 是你寫的，**SQL 本身就是要測的邏輯**：動態 SQL 的每個分支（條件全空、只有一個、全部都有）、resultMap 是否正確對應（特別是關聯）、邊界（空集合、null 參數、查不到資料）。用真實資料庫（Testcontainers），H2 的方言差異會讓測試失去意義。

## 地雷清單與面試問答

### 地雷清單

| # | 地雷 | 症狀 | 解法 |
| --- | --- | --- | --- |
| 1 | `${}` 拼接使用者輸入 | SQL Injection | 一律 `#{}`；表名欄位名用白名單 |
| 2 | 沒開 `map-underscore-to-camel-case` | 屬性全是 null | 開啟 |
| 3 | namespace / id 對不上 | `Invalid bound statement` | 檢查名稱與 mapper-locations |
| 4 | 動態條件全空 | 全表 update / delete | 必要條件寫死、加防護外掛 |
| 5 | `in ()` 空集合 | SQL 語法錯誤 | 先判斷空集合 |
| 6 | `<if test="x == 'A'">` | 條件永遠不成立 | 改用雙引號 |
| 7 | 巢狀 select | N+1 | join 或兩段式 |
| 8 | 一對多 join + limit | 分頁筆數不對 | 兩段式查詢 |
| 9 | PageHelper `startPage` 後沒立刻查 | 其他查詢被莫名分頁 | 兩者緊鄰 |
| 10 | 開二級快取 | 讀到舊資料 | 不開，改用 Spring Cache |
| 11 | 以為 insert 回傳 id | 拿到 1 | id 在參數物件上 |
| 12 | `<set>` 動態更新 | 無法更新成 null | 另寫方法 |
| 13 | 自訂 SqlSessionFactory | yml 設定沒生效 | 程式中設定 Configuration |
| 14 | `select *` | 多撈欄位、改欄位不易察覺 | `<sql>` 片段列欄位 |
| 15 | `<foreach>` 一次塞 10 萬筆 | 超過封包或參數上限 | 分批 |

### 面試常見問題

**Q1：`#{}` 和 `${}` 的差別？**
`#{}` 是預編譯參數綁定（`?`），可防 SQL Injection；`${}` 是字串替換，只能用於表名、欄位名、排序等無法綁定的地方，且必須白名單驗證。

**Q2：Mapper 只有介面沒有實作，怎麼能執行？**
MyBatis 用 JDK 動態代理產生 `MapperProxy`，以「介面全名 + 方法名」找到對應的 MappedStatement 執行。

**Q3：MyBatis 的一級、二級快取？**
一級快取是 SqlSession 範圍，預設開啟，在 Spring 中只有交易內有效；二級快取是 namespace 範圍，預設關閉，多機與跨表更新時有一致性問題，實務上少用。

**Q4：MyBatis 怎麼做分頁？**
手寫 limit / offset、PageHelper 或 MyBatis-Plus 分頁外掛（攔截器改寫 SQL 並自動 count）、`RowBounds`（記憶體分頁，資料量大時不能用）。

**Q5：MyBatis 外掛的原理？**
用 JDK 動態代理包裝 Executor、StatementHandler、ParameterHandler、ResultSetHandler 四種物件，以責任鏈方式攔截方法呼叫。

**Q6：MyBatis 有 N+1 問題嗎？**
有，使用 `<association>` / `<collection>` 的 `select` 巢狀查詢時就會發生。用 join 加巢狀結果對應或兩段式查詢解決。

**Q7：怎麼做批次插入？哪個最快？**
`<foreach>` 多值 insert 或 `ExecutorType.BATCH`。後者 SQL 單純、沒有長度問題，MySQL 需搭配 `rewriteBatchedStatements=true`。

**Q8：MyBatis 和 JPA 怎麼選？**
SQL 複雜、需要精細控制、資料表由 DBA 主導用 MyBatis；CRUD 為主、領域模型豐富用 JPA。兩者也可以並存。
