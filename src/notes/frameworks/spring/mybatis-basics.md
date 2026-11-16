# MyBatis 基礎

> MyBatis：SQL 自己寫，對應交給它。

## MyBatis 是什麼

### 一句話定位

MyBatis 是一個 **SQL Mapper**（半自動 ORM）：

```
你寫的 SQL（XML 或註解）
   + 你傳入的參數（Java 物件）
        ↓ MyBatis 幫你：建立 PreparedStatement、綁定參數、執行
   ResultSet
        ↓ MyBatis 幫你：把每一列轉成 Java 物件
   List<Order>
```

它**不會**：自動產生 SQL（除非搭配 MyBatis-Plus 或 Generator）、追蹤物件變更、延遲載入（可開，但很少用）、維護一級快取以外的物件狀態。

### MyBatis 與 JPA

| 比較項目 | MyBatis | JPA / Hibernate |
| --- | --- | --- |
| SQL 誰寫 | 你 | 框架（也可以自己寫） |
| 學習曲線 | 低，會 SQL 就會用 | 高，要懂持久化上下文、關聯、fetch 策略 |
| SQL 可控性 | 完全掌控，DBA 好審查 | 要開 log 才看得到 |
| 複雜查詢、報表 | 很強 | 較弱，常要退回原生 SQL |
| 簡單 CRUD | 要寫很多重複 SQL（MyBatis-Plus 可解決） | 幾乎零程式碼 |
| 物件變更追蹤 | 沒有，改了要自己呼叫 update | 有髒檢查 |
| 資料庫可攜性 | 差，SQL 綁資料庫 | 好 |
| 常見產業 | 金融、電商、既有大型資料庫 | 新創、領域模型豐富的系統 |

適合 MyBatis 的情境：資料表是 DBA 設計好的（不是從物件長出來的）、SQL 複雜且需要調校、團隊 SQL 能力強、有大量報表。

## 專案設定與核心元件

### 依賴與設定

```xml
<dependency>
    <groupId>org.mybatis.spring.boot</groupId>
    <artifactId>mybatis-spring-boot-starter</artifactId>
    <version>${mybatis-starter.version}</version>   <!-- 依 Spring Boot 版本選 -->
</dependency>
```

這個 starter 會自動：用 Spring Boot 的 `DataSource` 建立 `SqlSessionFactory`、建立執行緒安全的 `SqlSessionTemplate`、掃描標註 `@Mapper` 的介面並註冊成 bean。

```yaml
mybatis:
  mapper-locations: classpath:mapper/**/*.xml      # XML 放哪
  type-aliases-package: com.example.shop.domain    # 讓 XML 裡可以只寫類別簡名
  configuration:
    map-underscore-to-camel-case: true             # user_name → userName，幾乎必開
    default-fetch-size: 100
    default-statement-timeout: 30                  # 秒
    jdbc-type-for-null: 'NULL'                     # Oracle 傳 null 時需要

logging:
  level:
    com.example.shop.mapper: debug                 # 印出 SQL 與參數
```

`map-underscore-to-camel-case` 預設是 `false`，忘了開的話，`user_name` 欄位不會自動對到 `userName` 屬性，查出來全是 null。**這是新手第一個坑。**

### 掃描 Mapper 的兩種方式

```java
// 方式一：每個 Mapper 介面加 @Mapper
@Mapper
public interface OrderMapper { ... }

// 方式二：在設定類別統一掃描，介面上就不用加 @Mapper
@SpringBootApplication
@MapperScan("com.example.shop.mapper")
public class ShopApplication { ... }
```

專案大時推薦 `@MapperScan`，比較不會漏。

### 核心元件

| 元件 | 角色 | 生命週期 |
| --- | --- | --- |
| `SqlSessionFactory` | 工廠，持有所有設定與 Mapper 定義 | 整個應用程式一個 |
| `SqlSession` | 一次資料庫會話，可執行 SQL、取得 Mapper | 原生用法是一個請求一個；**Spring 中由 `SqlSessionTemplate` 管理** |
| `SqlSessionTemplate` | Spring 版的 SqlSession，執行緒安全，會綁定 Spring 交易 | 單例 |
| Mapper 介面 | 你定義的 DAO 介面 | MyBatis 用 JDK 動態代理產生實作 |
| `MappedStatement` | 一條 SQL 的完整定義（XML 中一個 `<select>` 等） | 啟動時解析 |
| `Executor` | 真正執行 SQL 的物件（Simple / Reuse / Batch） | 每個 SqlSession 一個 |

### 呼叫一個 Mapper 方法時發生了什麼

```
orderMapper.findById(1L)
  → MapperProxy（JDK 動態代理）
  → 用「介面全名.方法名」找到 MappedStatement
       例：com.example.shop.mapper.OrderMapper.findById
  → SqlSessionTemplate → 取得（或沿用交易中的）SqlSession
  → Executor
       → 檢查一級快取
       → StatementHandler 建立 PreparedStatement
       → ParameterHandler 綁定參數（#{id} → ?）
       → 執行
       → ResultSetHandler 把結果轉成 Order
  → 回傳
```

**關鍵規則**：XML 的 `namespace` 必須等於介面全名，`<select id>` 必須等於方法名。對不上就會拋 `BindingException: Invalid bound statement (not found)`，這是 MyBatis 最常見的錯誤，原因幾乎都是：

1. `namespace` 打錯。
2. `id` 和方法名不一致。
3. `mapper-locations` 路徑沒包含到 XML。
4. XML 放在 `src/main/java` 下，Maven 預設不會打包進去。

## Mapper

### 介面 + XML（主流寫法）

```java
public interface OrderMapper {
    Order findById(Long id);
    List<Order> findByCustomer(Long customerId);
    int insert(Order order);
    int update(Order order);
    int deleteById(Long id);
}
```

```xml
<mapper namespace="com.example.shop.mapper.OrderMapper">

    <!-- 可重用的欄位清單 -->
    <sql id="columns">
        id, customer_id, status, total_amount, created_at
    </sql>

    <select id="findById" resultType="Order">
        select <include refid="columns"/>
        from orders
        where id = #{id}
    </select>

    <insert id="insert" useGeneratedKeys="true" keyProperty="id">
        insert into orders (customer_id, status, total_amount, created_at)
        values (#{customerId}, #{status}, #{totalAmount}, now())
    </insert>

    <update id="update">
        update orders
        set status = #{status}, total_amount = #{totalAmount}
        where id = #{id}
    </update>

    <delete id="deleteById">
        delete from orders where id = #{id}
    </delete>
</mapper>
```

**為什麼不用 `select *`**：資料表加了欄位，查詢會多撈；欄位改名時你不會發現；而且無法用覆蓋索引。用 `<sql>` 片段維護欄位清單，一處修改處處生效。

### 註解寫法

簡單的 SQL 可以直接寫在介面上：

```java
@Mapper
public interface CategoryMapper {

    @Select("select id, name from category where id = #{id}")
    Category findById(Long id);

    @Insert("insert into category(name) values(#{name})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(Category c);

    @Update("update category set name = #{name} where id = #{id}")
    int update(Category c);

    @Delete("delete from category where id = #{id}")
    int delete(Long id);
}
```

| | XML | 註解 |
| --- | --- | --- |
| 動態 SQL | 很方便 | 要寫 `<script>` 或 Provider，很難讀 |
| 長 SQL 可讀性 | 好 | Java 文字區塊尚可 |
| resultMap 重用 | 好 | 差 |
| 改 SQL 是否要重新編譯 | 不用改 Java | 要 |

**實務建議**：簡單一行的 SQL 用註解；有動態條件、關聯對應、超過 5 行的用 XML。同一個 Mapper 可以兩種混用，但同一個方法只能用一種。

### 回傳值

| 方法回傳型別 | 行為 |
| --- | --- |
| `Order` | 查不到回傳 `null`，查到多筆拋 `TooManyResultsException` |
| `Optional<Order>` | MyBatis 3.5 起支援 |
| `List<Order>` | 查不到是空 List |
| `Map<Long, Order>` 搭配 `@MapKey("id")` | 以某屬性為 key 的 Map |
| `Cursor<Order>` | 串流讀取 |
| `int`（insert / update / delete） | 影響列數 |

**`update` 回傳影響列數很重要**：樂觀鎖、條件更新時要檢查它是不是 0。

## 參數傳遞

### 單一、多個、物件與集合

```java
Order findById(Long id);                                    // 單一參數：#{id}

List<Order> findByStatusAndDate(@Param("status") String status,
                                @Param("from") LocalDate from);   // 多個參數

List<Order> search(@Param("cond") OrderSearch cond,
                   @Param("page") PageParam page);                // 多個物件要加前綴：#{cond.status}
```

Spring Boot 專案預設以 `-parameters` 編譯，加上 MyBatis 預設 `useActualParamName=true`，其實可以省略 `@Param`。但**在動態 SQL 的 `<if test>` 裡使用參數時，加上 `@Param` 最保險**。建議多參數一律加。

集合參數用 `<foreach>`：

```xml
<select id="findByIds" resultType="Order">
    select * from orders
    where id in
    <foreach collection="ids" item="id" open="(" separator="," close=")">
        #{id}
    </foreach>
</select>
```

**空集合要處理**：上例把 `where id in` 寫在 foreach 外，集合為空時會留下不完整的 SQL。若空集合代表「沒有符合資料」，最簡單是在 Service 直接回傳空清單；也可在 XML 明確產生 `where 1 = 0`。不能只用 if 省略整個條件，否則可能變成查全表；更新與刪除更不能因條件為空就移除限制。IN 清單的項目數與綁定參數上限依資料庫及版本而異，大量資料應評估分批或暫存表。

### `#{}` 與 `${}`：一定要懂的安全問題

| | `#{}` | `${}` |
| --- | --- | --- |
| 原理 | 變成 `?`，用 PreparedStatement 綁定 | **字串直接拼接**進 SQL |
| SQL Injection | 安全 | **危險** |
| 會自動加引號 | 是（依型別） | 否 |
| 用途 | 99% 的參數 | 只能用在無法用 `?` 的地方：動態表名、欄位名、排序方向 |

```xml
<!-- 危險！使用者輸入 name = "' or '1'='1" 就能撈出全部資料 -->
where name = '${name}'

<!-- 正確 -->
where name = #{name}
```

**動態排序的正確寫法**：`order by` 後面的欄位名不能用 `?`，只能用 `${}`，所以**必須白名單驗證**：

```java
private static final Set<String> SORTABLE = Set.of("created_at", "total_amount", "id");

public List<Order> list(String sortBy, String dir) {
    String col = SORTABLE.contains(sortBy) ? sortBy : "id";
    String direction = "asc".equalsIgnoreCase(dir) ? "asc" : "desc";
    return orderMapper.list(col, direction);
}
```

```xml
order by ${sortColumn} ${direction}
```

或在 XML 中用 `<choose>` 把每個允許的值寫死，完全不用 `${}`。

### like 查詢

```xml
<!-- 寫法一：資料庫串接（MySQL） -->
where name like concat('%', #{keyword}, '%')

<!-- 寫法二：bind，跨資料庫 -->
<bind name="pattern" value="'%' + keyword + '%'"/>
where name like #{pattern}
```

不要寫成 `like '%${keyword}%'`，這是 SQL Injection。

## 結果對應

### resultType 與 resultMap

**`resultType`** 自動對應：MyBatis 會把欄位名對應到同名屬性（開了 `map-underscore-to-camel-case` 就能處理底線轉駝峰）。對不上的欄位會被**默默忽略**，屬性是 null，不會報錯。可以用欄位別名解決名稱不一致：`select id, cust_no as customerId from orders`。

**`resultMap`**：欄位名和屬性差太多、需要巢狀物件、需要用建構子建立物件時：

```xml
<resultMap id="OrderMap" type="Order">
    <id     column="id"           property="id"/>        <!-- 主鍵用 <id>，關聯查詢時用來去重 -->
    <result column="cust_no"      property="customerId"/>
    <result column="status"       property="status"/>
    <result column="total_amount" property="totalAmount"/>
</resultMap>

<select id="findById" resultMap="OrderMap">
    select id, cust_no, status, total_amount from orders where id = #{id}
</select>
```

### 對應到 record 與列舉

```java
public record OrderSummary(Long id, String status, BigDecimal totalAmount) {}
```

```xml
<resultMap id="OrderSummaryMap" type="OrderSummary">
    <constructor>
        <idArg  column="id"           javaType="long"/>
        <arg    column="status"       javaType="string"/>
        <arg    column="total_amount" javaType="java.math.BigDecimal"/>
    </constructor>
</resultMap>
```

MyBatis 3.5.x 對 record 的支援：若欄位順序與數量剛好對上 record 建構子，`resultType` 也能自動使用建構子。但順序一錯就出問題，**用 `<constructor>` 明確寫出比較穩**。

列舉預設用 `EnumTypeHandler` 存 `name()`（字串）。資料庫存的是代碼時，要自己寫 TypeHandler。

## 動態 SQL

這是 MyBatis 最有價值的功能之一。

### `<if>` 與 `<where>`

```xml
<select id="search" resultType="Order">
    select <include refid="columns"/> from orders
    <where>
        <if test="cond.status != null">
            and status = #{cond.status}
        </if>
        <if test="cond.customerId != null">
            and customer_id = #{cond.customerId}
        </if>
        <if test="cond.from != null">
            and created_at &gt;= #{cond.from}
        </if>
        <if test="cond.keyword != null and cond.keyword != ''">
            and remark like concat('%', #{cond.keyword}, '%')
        </if>
    </where>
    order by id desc
</select>
```

`<where>` 的作用：裡面有任何條件成立才加上 `where`，並自動去掉開頭多餘的 `and` / `or`。

**XML 跳脫**：`<` 要寫 `&lt;`、`>` 寫 `&gt;`，或用 `<![CDATA[ created_at >= #{from} ]]>` 包起來。

**`test` 裡的字串比較陷阱**（OGNL 運算式）：

```xml
<!-- 錯：單引號包一個字元，OGNL 會當成 char，跟 String 比較永遠 false -->
<if test="type == 'A'">

<!-- 對 -->
<if test='type == "A"'>
<if test="type == 'A'.toString()">
```

### `<set>`、`<choose>`、`<foreach>`、`<trim>`

**`<set>` 動態更新**，只更新有值的欄位：

```xml
<update id="updateSelective">
    update orders
    <set>
        <if test="status != null">status = #{status},</if>
        <if test="totalAmount != null">total_amount = #{totalAmount},</if>
        <if test="remark != null">remark = #{remark},</if>
        updated_at = now()
    </set>
    where id = #{id}
</update>
```

`<set>` 會自動加 `set` 並去掉結尾多餘的逗號。**副作用**：用這個寫法就**無法把欄位更新成 null**。要清空欄位時，另外寫一個方法。

**`<choose>`** 相當於 switch，也是動態排序免用 `${}` 的安全寫法：

```xml
<choose>
    <when test="sort == 'amount'">order by total_amount desc</when>
    <when test="sort == 'date'">order by created_at desc</when>
    <otherwise>order by id desc</otherwise>
</choose>
```

**`<foreach>` 批次 insert**：

```xml
<insert id="insertBatch">
    insert into order_item (order_id, product_id, qty, price) values
    <foreach collection="items" item="it" separator=",">
        (#{it.orderId}, #{it.productId}, #{it.qty}, #{it.price})
    </foreach>
</insert>
```

一條 SQL 帶很多 values。注意 SQL 長度限制（MySQL `max_allowed_packet`）、參數個數限制（SQL Server 2100 個、PostgreSQL 驅動 32767 個），大量資料要分批，每批 500～1000 筆。

**`<trim>`** 是萬用版，`<where>` 和 `<set>` 都是它的特例：

```xml
<trim prefix="where" prefixOverrides="and |or "> ... </trim>
<trim prefix="set" suffixOverrides=","> ... </trim>
```

### 動態 SQL 的危險：全表更新 / 刪除

```xml
<delete id="deleteByCond">
    delete from orders
    <where>
        <if test="status != null">and status = #{status}</if>
    </where>
</delete>
```

如果 `status` 傳 null，SQL 變成 `delete from orders`，**全表刪除**。防範：

- 刪除、更新的條件不要寫成可選的，主鍵或必要條件寫死在 `<where>` 外面。
- 搭配 MyBatis-Plus 的 `BlockAttackInnerInterceptor` 防全表操作。
- Service 層參數檢查。
