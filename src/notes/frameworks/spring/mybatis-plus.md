# MyBatis-Plus

> 把 MyBatis 的重複勞動拿掉。**單表 CRUD 與簡單條件用 MP；多表 join、複雜統計仍寫 XML**，不要硬用 Wrapper 去拼複雜查詢。

## 基本概念與設定

### 三者的關係

```
MyBatis-Plus  ← 增強層：通用 CRUD、Wrapper、外掛
   │
MyBatis       ← 核心：SQL 對應、執行、結果映射
   │
JDBC
```

MP 啟動時會替繼承 `BaseMapper` 的 Mapper，依 Entity 的註解**自動產生**一組 MappedStatement（insert、selectById、updateById…），跟你在 XML 寫的 `<select>` 本質上一樣，只是不用你寫。

| 優點 | 缺點 |
| --- | --- |
| 單表 CRUD 幾乎零程式碼 | 條件構造器寫多了，SQL 散落在 Java 程式各處，DBA 難以審查 |
| 分頁、樂觀鎖、邏輯刪除開箱即用 | 字串欄位名寫法（`QueryWrapper`）打錯要到執行期才知道 |
| 與原生 MyBatis 完全相容 | 外掛很多，行為變「魔法」，不清楚原理時容易踩坑 |
| 中文文件與社群資源豐富 | 主要社群在中國，英文資源較少 |

### 依賴與設定

```xml
<!-- Spring Boot 3；Spring Boot 4 改用 mybatis-plus-spring-boot4-starter -->
<dependency>
    <groupId>com.baomidou</groupId>
    <artifactId>mybatis-plus-spring-boot3-starter</artifactId>
    <version>${mybatis-plus.version}</version>
</dependency>
<!-- 3.5.9 起，分頁等需要解析 SQL 的外掛拆到獨立模組，要另外加 -->
<dependency>
    <groupId>com.baomidou</groupId>
    <artifactId>mybatis-plus-jsqlparser</artifactId>
    <version>${mybatis-plus.version}</version>
</dependency>
```

**不要同時引入 `mybatis-spring-boot-starter`**，MP 的 starter 已經包含 MyBatis，兩者並存會造成自動配置衝突。3.5.9 以上若出現 `PaginationInnerInterceptor` 找不到類別，就是少了 `mybatis-plus-jsqlparser`。

```yaml
mybatis-plus:
  mapper-locations: classpath*:mapper/**/*.xml
  type-aliases-package: com.example.shop.domain
  configuration:
    map-underscore-to-camel-case: true      # MP 預設就是 true（原生 MyBatis 預設 false）
  global-config:
    db-config:
      id-type: assign_id                    # 全域主鍵策略
      logic-delete-field: deleted           # 全域邏輯刪除欄位
      logic-delete-value: 1
      logic-not-delete-value: 0
      update-strategy: not_null             # updateById 時忽略 null 欄位（預設）
```

### 外掛註冊

MP 3.4 之後所有內建外掛都掛在 `MybatisPlusInterceptor` 底下，**加入的順序有意義**：

```java
@Bean
public MybatisPlusInterceptor mybatisPlusInterceptor() {
    MybatisPlusInterceptor interceptor = new MybatisPlusInterceptor();
    // 建議順序：多租戶 → 動態表名 → 分頁 → 樂觀鎖 → 防全表更新
    interceptor.addInnerInterceptor(new PaginationInnerInterceptor(DbType.MYSQL));
    interceptor.addInnerInterceptor(new OptimisticLockerInnerInterceptor());
    interceptor.addInnerInterceptor(new BlockAttackInnerInterceptor());
    return interceptor;
}
```

官方建議：多租戶、動態表名放在分頁之前；分頁之後才放會改 SQL 的其他外掛（樂觀鎖、防全表）。

## Entity 與 BaseMapper

### Entity 註解

```java
@Data
@TableName("orders")
public class Order {

    @TableId(type = IdType.ASSIGN_ID)
    private Long id;

    private Long customerId;               // 自動對應 customer_id

    @TableField("total_amt")               // 欄位名不一致時指定
    private BigDecimal totalAmount;

    @TableField(exist = false)             // 資料表沒有這個欄位
    private List<OrderItem> items;

    @TableField(fill = FieldFill.INSERT)   // 自動填充
    private LocalDateTime createdAt;

    @Version                               // 樂觀鎖
    private Integer version;

    @TableLogic                            // 邏輯刪除
    private Integer deleted;
}
```

MP 的 Entity 只是普通 POJO，沒有 JPA 那種持久化上下文、延遲載入問題，所以用 Lombok `@Data` 是可以的（和 JPA 不同）。

### 主鍵策略

| `IdType` | 行為 | 適用 |
| --- | --- | --- |
| `AUTO` | 資料庫自增 | MySQL `AUTO_INCREMENT` |
| `ASSIGN_ID`（預設） | MP 用雪花演算法產生 Long（也可用 String） | 分散式、分庫分表 |
| `ASSIGN_UUID` | 去掉橫線的 UUID 字串 | 主鍵為字串 |
| `INPUT` | 自己設定，或搭配資料庫序列（`@KeySequence`） | Oracle、PostgreSQL 序列 |
| `NONE` | 跟隨全域設定 | |

**雪花 ID 的前端陷阱**：雪花 ID 是 19 位數的 Long，超過 JavaScript `Number.MAX_SAFE_INTEGER`（2⁵³−1，16 位數），**傳到前端會失去精度**，例如 `1790123456789012345` 變成 `1790123456789012200`，前端拿這個 id 回來查就查不到。解法：序列化時轉成字串。

```java
@JsonSerialize(using = ToStringSerializer.class)
private Long id;
```

**多機雪花 ID 衝突**：雪花演算法依賴「機器 ID + 資料中心 ID」。MP 預設用 MAC 位址和 PID 推算，容器環境下可能重複。正式環境建議自己指定或實作 `IdentifierGenerator`。

### 列舉與 JSON 欄位

```java
public enum OrderStatus {
    PENDING(0, "待付款"), PAID(1, "已付款");

    @EnumValue          // 存進資料庫的是這個欄位
    private final int code;
    @JsonValue          // 回給前端的是描述（選用）
    private final String desc;

    OrderStatus(int code, String desc) {
        this.code = code;
        this.desc = desc;
    }
}
```

MP 3.5.2 起標了 `@EnumValue` 就會自動使用對應的 TypeHandler。

```java
@TableName(value = "product", autoResultMap = true)   // 要開 autoResultMap
public class Product {
    @TableField(typeHandler = JacksonTypeHandler.class)
    private Map<String, Object> attributes;
}
```

`autoResultMap = true` 只對 MP 自動產生的方法有效。你自己在 XML 寫的查詢，要自己在 resultMap 中指定 typeHandler。

### BaseMapper 常用方法

```java
public interface OrderMapper extends BaseMapper<Order> {
    // 什麼都不用寫，已經有十幾個 CRUD 方法
}
```

| 方法 | SQL | 備註 |
| --- | --- | --- |
| `insert(entity)` | `insert into ...` | 只插入非 null 欄位，主鍵自動回填 |
| `deleteById(id)` | `delete ... where id = ?` | 有邏輯刪除時變成 update |
| `delete(wrapper)` | 依條件刪除 | |
| `updateById(entity)` | `update ... set 非null欄位 where id = ?` | |
| `update(entity, wrapper)` | 依條件更新 | |
| `selectById(id)` | | |
| `selectOne(wrapper)` | | **查到多筆會拋例外** |
| `selectList(wrapper)` | | 傳 `null` 查全表 |
| `selectCount(wrapper)` | `select count(*)` | 回傳 `Long` |
| `selectPage(page, wrapper)` | 分頁 | 需要分頁外掛 |
| `exists(wrapper)` | | |

### `updateById` 的 null 欄位問題

```java
Order o = new Order();
o.setId(1L);
o.setRemark(null);       // 想清空備註
orderMapper.updateById(o);
// 實際 SQL：update orders set updated_at = ? where id = ?   ← remark 被忽略了！
```

預設 `update-strategy: not_null`，null 欄位不會出現在 set 中。要更新成 null，用 `UpdateWrapper`：

```java
orderMapper.update(null, Wrappers.<Order>lambdaUpdate()
        .set(Order::getRemark, null)
        .eq(Order::getId, 1L));
```

或在該欄位上標 `@TableField(updateStrategy = FieldStrategy.ALWAYS)`，但這樣每次 `updateById` 沒設值也會被清成 null，要很小心。

### `selectOne` 的陷阱

`selectOne` 查到多筆會拋 `TooManyResultsException`。`selectOne(wrapper, false)` 在多筆時不拋例外，但**並不會加 `limit`**，而是把符合條件的資料全部查回來再取第一筆。結果可能很多時，仍應在條件上保證唯一，或改用白名單控制的 `last("limit 1")`。

## 條件構造器 Wrapper

### Wrapper 家族與常用條件

| 類別 | 用途 |
| --- | --- |
| `QueryWrapper<T>` | 查詢條件，欄位名用**字串** |
| `LambdaQueryWrapper<T>` | 查詢條件，欄位用**方法參照**，推薦 |
| `UpdateWrapper<T>` / `LambdaUpdateWrapper<T>` | 更新條件 + set |
| `Wrappers` | 靜態工廠：`Wrappers.lambdaQuery(Order.class)` |

**一律優先用 Lambda 版本**：欄位改名時編譯器會報錯，字串版不會。

```java
List<Order> list = orderMapper.selectList(
        Wrappers.lambdaQuery(Order.class)
                .eq(Order::getStatus, OrderStatus.PAID)              // status = ?
                .ge(Order::getTotalAmount, new BigDecimal("100"))    // >=
                .between(Order::getCreatedAt, from, to)
                .likeRight(Order::getOrderNo, "2026")                 // like '2026%'（可用索引）
                .in(Order::getId, ids)
                .isNull(Order::getCancelledAt)
                .orderByDesc(Order::getCreatedAt)
                .select(Order::getId, Order::getOrderNo, Order::getTotalAmount)  // 只查部分欄位
);
```

### 動態條件：第一個參數 `condition`

每個條件方法都有一個 `boolean condition` 的多載，`false` 時不加入該條件。搜尋頁就不用寫一堆 if：

```java
public Page<Order> search(OrderSearch s, Page<Order> page) {
    return orderMapper.selectPage(page, Wrappers.lambdaQuery(Order.class)
            .eq(s.status() != null, Order::getStatus, s.status())
            .eq(s.customerId() != null, Order::getCustomerId, s.customerId())
            .ge(s.from() != null, Order::getCreatedAt, s.from())
            .like(StringUtils.hasText(s.keyword()), Order::getRemark, s.keyword())
            .orderByDesc(Order::getId));
}
```

### or 與括號

```java
// where status = 'PAID' and (customer_id = 1 or total_amount > 1000)
Wrappers.lambdaQuery(Order.class)
        .eq(Order::getStatus, PAID)
        .and(w -> w.eq(Order::getCustomerId, 1L).or().gt(Order::getTotalAmount, 1000));
```

**常見錯誤**：直接 `.eq(...).or().eq(...).eq(...)`，產生 `a = ? or b = ? and c = ?`，因為 `and` 優先順序比 `or` 高，結果跟你想的不同。**有 or 一定用 `and(w -> ...)` 或 `nested` 包括號。**再加上邏輯刪除、多租戶外掛會在 where 後面再接條件，沒有括號的 or 會讓那些條件失效，**等於繞過了邏輯刪除或租戶隔離**。

### UpdateWrapper

```java
// update orders set status = 'CANCELLED', cancelled_at = now() where id = ? and status = 'PENDING'
int rows = orderMapper.update(Wrappers.lambdaUpdate(Order.class)
        .set(Order::getStatus, OrderStatus.CANCELLED)
        .setSql("cancelled_at = now()")
        .eq(Order::getId, id)
        .eq(Order::getStatus, OrderStatus.PENDING));
if (rows == 0) throw new IllegalStateException("訂單狀態已變更");

// 原子扣庫存
stockMapper.update(Wrappers.lambdaUpdate(Stock.class)
        .setSql("qty = qty - {0}", n)
        .eq(Stock::getId, id)
        .ge(Stock::getQty, n));
```

用 `update(wrapper)` 時，Entity 上的自動填充（`updatedAt`）**不會觸發**，因為沒有 Entity 物件可以填。需要的話改用 `update(entity, wrapper)` 傳一個空 Entity，或在 set 中自己寫。

### SQL Injection 風險點與限制

以下方法是**字串直接拼接**，等同 MyBatis 的 `${}`：`last(String)`、不用佔位符的 `apply(String)`、`inSql` / `exists` / `setSql` 的字串、從前端傳排序欄位時的 `QueryWrapper` 欄位名字串。

```java
// 危險
wrapper.apply("date_format(created_at,'%Y-%m') = '" + month + "'");
// 安全：用 {0} 佔位，會變成 #{}
wrapper.apply("date_format(created_at,'%Y-%m') = {0}", month);
```

前端傳排序欄位時，務必白名單轉換成 Lambda 欄位，不要直接把字串丟進 `orderBy`。

Wrapper 不能做的事：

- **多表 join**：Wrapper 只處理單表。需要 join 的寫 XML。
- **複雜子查詢、視窗函數、union**：寫 XML。
- **Wrapper 不要跨層傳遞**：在 Controller 組 Wrapper 丟給 Service，等於讓 Web 層知道資料表結構。Wrapper 應該只在 Service / Repository 層出現。

## IService 與分頁

### IService

```java
public interface OrderService extends IService<Order> { }

@Service
public class OrderServiceImpl extends ServiceImpl<OrderMapper, Order> implements OrderService { }
```

| 方法 | 說明 |
| --- | --- |
| `save` / `saveBatch(list, batchSize)` | 批次插入（BATCH executor） |
| `saveOrUpdate(entity)` | 依 id 是否存在決定 insert 或 update（**會先多一次 select**） |
| `saveOrUpdateBatch` | 同上的批次版，每筆都會先查，大量時很慢 |
| `getOne(wrapper, false)` | 多筆時取第一筆不拋例外 |
| `lambdaQuery()` / `lambdaUpdate()` | 鏈式寫法 |

**`saveBatch` 的真相**：用的是 `ExecutorType.BATCH`，**每筆仍是一條 insert**，只是用 JDBC batch 一起送出。在 MySQL 上**必須在 JDBC URL 加 `rewriteBatchedStatements=true`**，驅動才會把它們改寫成一條多值 insert，否則幾乎沒有加速。

**要不要用 IService？**`ServiceImpl` 把 `save`、`remove`、`update` 這些通用方法全部暴露在 Service 層，Controller 可以直接呼叫 `orderService.removeById(id)`，繞過業務規則（例如「已出貨的訂單不能刪」）。

- 小專案、後台管理系統：直接用，開發快。
- 業務規則多的系統：Service 不繼承 `IService`，只注入 `BaseMapper`，對外只暴露有業務意義的方法。

### 分頁

需先註冊 `PaginationInnerInterceptor`。

```java
Page<Order> page = orderMapper.selectPage(
        Page.of(current, size),             // current 從 1 開始（跟 Spring Data 從 0 開始不同！）
        Wrappers.lambdaQuery(Order.class).eq(Order::getStatus, PAID).orderByDesc(Order::getId));

page.getRecords();   // 本頁資料
page.getTotal();     // 總筆數
page.getPages();     // 總頁數
```

**忘了註冊分頁外掛**：不會報錯，但會**查出全部資料**，`total` 為 0。這是 MP 最常見的上線事故之一。

自訂 SQL 也能分頁：第一個參數是 `IPage`，外掛就會自動加 limit 並執行 count。

```java
IPage<OrderVO> pageWithCustomer(IPage<OrderVO> page, @Param("cond") OrderSearch cond);
```

count 優化：

| 手段 | 做法 |
| --- | --- |
| 自動優化 | 預設會移除 count 中不需要的 `order by`、可去掉的 left join |
| 不需要總數 | `page.setSearchCount(false)`，只查資料 |
| 自己寫 count | `page.setCountId("countForPage")`，指向 XML 中自寫的 count 查詢 |
| 限制最大筆數 | `PaginationInnerInterceptor.setMaxLimit(500L)`，防止前端傳 `size=1000000` |

一對多 join + 分頁：和 MyBatis 一樣，limit 限制的是列數不是主表筆數，用兩段式查詢。

## 自動填充、邏輯刪除與樂觀鎖

### 自動填充

```java
@Component
public class AuditMetaObjectHandler implements MetaObjectHandler {

    @Override
    public void insertFill(MetaObject meta) {
        LocalDateTime now = LocalDateTime.now();
        strictInsertFill(meta, "createdAt", LocalDateTime.class, now);
        strictInsertFill(meta, "updatedAt", LocalDateTime.class, now);
    }

    @Override
    public void updateFill(MetaObject meta) {
        strictUpdateFill(meta, "updatedAt", LocalDateTime.class, LocalDateTime.now());
    }
}
```

**`strict` 系列的行為**：欄位已經有值時**不會覆蓋**。如果你從資料庫查出 Entity 再 `updateById`，`updatedAt` 已經有舊值，`strictUpdateFill` 不會更新它！解法：更新前把 `updatedAt` 設為 null，或改用 `setFieldValByName("updatedAt", LocalDateTime.now(), meta)` 強制覆蓋。

`update(wrapper)` 沒有 Entity 參數，因此無法填充 Entity 欄位。自訂 Mapper 方法與 XML 並非一律不支援填充：要符合 MP 辨識 Entity 的參數契約（例如適當使用 `@Param("et")`）、欄位註解及 handler 設定。即使 Java 物件已被填值，XML 的 SQL 仍須明確引用該欄位，框架不會自動替自寫 SQL 補上 SET。

### 邏輯刪除

| 原本的操作 | 實際 SQL |
| --- | --- |
| `deleteById(1)` | `update orders set deleted = 1 where id = 1 and deleted = 0` |
| `selectList(...)` | 自動加 `where deleted = 0` |
| `updateById(...)` | 自動加 `and deleted = 0` |

**只對 MP 自動產生的方法和 Wrapper 生效。自己在 XML 寫的 SQL 不會自動加條件**，要自己寫 `and deleted = 0`。這是最常見的資料洩漏原因：列表用 MP 查，報表用 XML 查，報表把刪除的資料也算進去了。

**唯一索引衝突**：`email` 唯一，帳號 A 被邏輯刪除後，新註冊相同 email 會衝突。解法：刪除時把 `deleted` 寫成該筆的主鍵 id 或時間戳，再把 `(email, deleted)` 設成聯合唯一；或刪除時同時修改 email（加後綴）。

### 樂觀鎖

需註冊 `OptimisticLockerInnerInterceptor`，Entity 欄位標 `@Version`：

```java
Order o = orderMapper.selectById(1L);   // version = 3
o.setStatus(PAID);
int rows = orderMapper.updateById(o);
// update orders set status=?, version=4 where id=1 and version=3
if (rows == 0) { /* 被別人先改了 */ }
```

限制：只支援 `updateById(entity)` 和 `update(entity, wrapper)`；**Entity 的 version 必須有值**，如果 `new Order()` 只設 id 和 status 去更新，version 是 null，樂觀鎖不生效，直接覆蓋；`update(wrapper)`（無 Entity）不支援。

## 其他外掛與自訂 SQL

### 防全表更新刪除

```java
orderMapper.delete(null);             // 會被攔截並拋例外
orderMapper.update(entity, null);     // 同上
```

`BlockAttackInnerInterceptor` 在動態條件全部為 false 時特別有用（搜尋條件全空時 Wrapper 是空的）。**建議所有專案都開。**

### 多租戶與動態表名

`TenantLineInnerInterceptor`：SaaS 系統每張表都有 `tenant_id`，外掛自動在所有 SQL（包括你自己寫的 XML）加上 `tenant_id = ?`。風險：

- 它靠解析 SQL（JSqlParser）改寫，太複雜的 SQL 可能解析失敗或改錯。上線前每條自訂 SQL 都要測。
- TenantContext 是 ThreadLocal，非同步執行緒（`@Async`、`CompletableFuture`、MQ 消費者）要記得傳遞與清除，否則會串到別的租戶。
- 搭配沒有括號的 `or` 條件時，租戶條件可能失效。

`DynamicTableNameInnerInterceptor` 用於分表場景，大型分庫分表通常改用 ShardingSphere 這類專門方案。SQL 效能分析建議用 p6spy 或 datasource-proxy。

### 自訂 SQL 與 Wrapper 混用

```java
List<OrderVO> listWithCustomer(@Param(Constants.WRAPPER) Wrapper<Order> wrapper);
```

```xml
<select id="listWithCustomer" resultType="OrderVO">
    select o.*, c.name as customer_name
    from orders o join customer c on c.id = o.customer_id
    ${ew.customSqlSegment}
</select>
```

`${ew.customSqlSegment}` 會展開成 `where ...`（參數仍以 `#{}` 綁定，不是拼接）。**問題**：join 後若兩張表都有 `status` 會模糊不清，所以要用 `QueryWrapper` 並明確寫 `o.status`，失去 Lambda 的型別安全。建議只在條件很動態、又必須 join 時才用，大多數情況直接寫 XML `<where>` 更清楚。

### 程式碼產生器

MP 提供 `mybatis-plus-generator`，從資料表產生 Entity、Mapper、XML、Service、Controller。建議只在新建表時跑一次，之後手動維護（開啟 `enableFileOverride` 會蓋掉你改過的程式碼）；產生的 Controller 通常太陽春，不建議直接用。也可以用 IntelliJ 外掛 MyBatisX。

## 地雷清單與面試問答

### 地雷清單

| # | 地雷 | 症狀 | 解法 |
| --- | --- | --- | --- |
| 1 | 沒註冊分頁外掛 | 分頁失效、查出全部、total = 0 | 註冊 `PaginationInnerInterceptor` |
| 2 | 3.5.9+ 沒加 jsqlparser 模組 | 分頁外掛類別找不到 | 加 `mybatis-plus-jsqlparser` |
| 3 | 同時引入 mybatis starter | 啟動錯誤或設定衝突 | 只留 MP starter |
| 4 | 雪花 ID 傳前端 | 精度遺失、查無資料 | Long 序列化成字串 |
| 5 | `updateById` 想設 null | 欄位沒被更新 | `UpdateWrapper.set(col, null)` |
| 6 | 沒括號的 `or` | 結果錯、繞過邏輯刪除 / 租戶 | `and(w -> ...)` |
| 7 | `last` / `apply` 拼接輸入 | SQL Injection | 用 `{0}` 佔位 |
| 8 | XML 自寫 SQL | 沒過濾邏輯刪除 | 自己加 `deleted = 0` |
| 9 | `update(wrapper)` | 沒有自動填充、樂觀鎖 | 傳 Entity |
| 10 | `strictUpdateFill` | `updatedAt` 沒更新 | 用強制覆蓋寫法 |
| 11 | `@Version` 欄位為 null | 樂觀鎖沒生效 | 先查出再改 |
| 12 | `selectOne` 查到多筆 | `TooManyResultsException` | 確保唯一或用 `selectOne(w, false)` |
| 13 | `saveBatch` 在 MySQL 很慢 | 批次沒效果 | `rewriteBatchedStatements=true` |
| 14 | `saveOrUpdateBatch` 大量資料 | 每筆先 select，極慢 | 分開 insert 與 update |
| 15 | 動態條件全空的 delete | 全表刪除 | `BlockAttackInnerInterceptor` |
| 16 | 分頁 current 從 0 開始傳 | 第一頁資料拿不到 | MP 從 1 開始 |

### 面試常見問題

**Q1：MyBatis-Plus 和 MyBatis 的關係？**
MP 是 MyBatis 的增強，完全相容原生功能，額外提供通用 CRUD、條件構造器與外掛。

**Q2：BaseMapper 沒寫 SQL，為什麼能執行？**
啟動時 MP 的 `ISqlInjector` 依 Entity 的表名、欄位資訊，為每個通用方法動態產生 MappedStatement 並註冊到 MyBatis 的 Configuration。

**Q3：MP 分頁原理？**
`PaginationInnerInterceptor` 攔截查詢，偵測參數中的 `IPage`，用 JSqlParser 產生 count SQL 執行，再依資料庫方言改寫原 SQL 加上分頁語法。

**Q4：邏輯刪除怎麼實作？有什麼要注意的？**
透過 SQL 注入器把 delete 改成 update、在查詢條件加上未刪除過濾。注意自寫 SQL 不會自動處理，以及唯一索引衝突。

**Q5：樂觀鎖外掛怎麼運作？**
`updateById` 時讀取 Entity 的 version，在 where 加上 `version = 舊值`，set 中把 version + 1，影響列數為 0 表示衝突。

**Q6：為什麼雪花 ID 前端會出錯？**
19 位數超過 JS Number 的安全整數範圍（2⁵³−1），要以字串傳遞。

**Q7：QueryWrapper 和 LambdaQueryWrapper 差在哪？**
前者用字串欄位名，後者用方法參照解析欄位名，具型別安全、可重構。

**Q8：MP 有哪些 SQL Injection 風險？**
`last`、`apply` 不帶佔位、`inSql`、`setSql`、字串欄位名排序等直接拼接的 API。
