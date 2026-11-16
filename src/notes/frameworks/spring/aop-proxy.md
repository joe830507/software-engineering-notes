# AOP 與代理

> 這是理解 Spring 的關鍵。讀完後，你應該能自己推導出 `@Transactional`、`@Async`、`@Cacheable`、`@Retryable`、`@PreAuthorize` 在什麼情況下會失效。

## AOP 解決什麼問題

有些邏輯會散落在很多方法中：記錄日誌、計時、交易、權限、重試。它們跟業務邏輯無關，但每個方法都要寫一次：

```java
public void transfer(...) {
    long start = System.nanoTime();
    TransactionStatus tx = txManager.getTransaction(...);
    try {
        // 真正的業務邏輯只有這兩行
        accountA.withdraw(amount);
        accountB.deposit(amount);
        txManager.commit(tx);
    } catch (RuntimeException e) {
        txManager.rollback(tx);
        throw e;
    } finally {
        log.info("transfer took {} ms", (System.nanoTime() - start) / 1_000_000);
    }
}
```

這類邏輯叫做**橫切關注點（cross-cutting concerns）**。AOP 的做法是把它們抽出來，集中寫在一個地方，再「織入」到需要的方法上。

| 術語 | 白話 |
| --- | --- |
| Aspect（切面） | 一個橫切關注點的完整定義，例如「計時」 |
| Join point（連接點） | 可以插入邏輯的位置。Spring AOP 只支援「方法執行」這一種 |
| Pointcut（切點） | 篩選要套用到哪些連接點的運算式 |
| Advice（通知） | 要插入的邏輯，以及插在前面、後面還是包住 |
| Target（目標） | 被代理的原始物件 |
| Proxy（代理） | 包在目標外面的物件，呼叫端實際拿到的是它 |
| Weaving（織入） | 把切面套上去的過程。Spring AOP 是在執行時用代理織入 |

## 代理的原理

Spring AOP 不修改你的類別，而是在容器建立 bean 時（BPP 的 after 階段），產生一個代理物件包住原始 bean，並把代理放進容器。之後所有注入這個 bean 的地方拿到的都是代理。

```
呼叫端（Controller）
   ↓ transfer()
代理（$$SpringCGLIB$$）
   ↓ 依序執行 advice
攔截器鏈（交易、快取、重試…）
   ↓ transfer()
原始物件（你寫的 Service）
   ↑ 回傳 / 拋例外 → 提交或回滾交易 → 結果回到呼叫端
```

### JDK 動態代理與 CGLIB

| 技術 | 原理 | 限制 |
| --- | --- | --- |
| JDK 動態代理 | 用 `java.lang.reflect.Proxy` 產生一個實作相同介面的類別 | 目標必須實作介面；代理**不是**目標類別的實例，只能用介面型別注入 |
| CGLIB | 在執行時產生目標類別的子類別，覆寫方法 | 不能代理 `final` 類別與 `final` 方法；`private` 方法無法覆寫 |

**Spring Boot 預設一律使用 CGLIB**（`spring.aop.proxy-target-class=true`），即使目標有實作介面。純 Spring Framework 的 `@EnableAspectJAutoProxy` 預設則是「有介面就用 JDK 代理」。兩種情況都已驗證：

```java
@EnableAspectJAutoProxy // proxyTargetClass 預設 false
// DefaultGreeter implements Greeter → 得到 JDK 代理
// ctx.getBean(DefaultGreeter.class) 會失敗，因為代理不是 DefaultGreeter

@EnableAspectJAutoProxy(proxyTargetClass = true) // Spring Boot 的預設
// 得到 CGLIB 代理，類別名稱為 DefaultGreeter$$SpringCGLIB$$0，可以用具體類別注入
```

Boot 選擇 CGLIB 的原因很實際：很多人注入的是具體類別而不是介面，用 JDK 代理會在啟動時就失敗。

## 自呼叫：代理最大的陷阱

```java
@Service
public class DefaultGreeter implements Greeter {
    public String greet(String name) { return "hi " + name; }

    public String greetTwice(String name) {
        return greet(name) + " / " + greet(name); // 自呼叫
    }
}
```

假設有一個切面會攔截 `greet()`。外部呼叫 `greeter.greet("joe")` 會經過代理，切面生效。但外部呼叫 `greeter.greetTwice("joe")` 時：

1. 呼叫端呼叫代理的 `greetTwice()`，`greetTwice` 沒有符合切點，代理直接轉給目標。
2. 目標的 `greetTwice()` 內部呼叫 `greet()`，這裡其實是 `this.greet()`。
3. `this` 是**原始物件**，不是代理。所以這次呼叫完全沒經過代理，切面不會執行。

這就是為什麼「同一個類別裡呼叫 `@Transactional` 方法，交易不會生效」。所有代理型功能都有一樣的問題：

| 功能 | 自呼叫的後果 |
| --- | --- |
| `@Transactional` | 沒有交易，或沒有套用指定的傳播行為 |
| `@Async` | 在呼叫端的執行緒同步執行 |
| `@Cacheable` | 每次都執行方法，不讀快取 |
| `@Retryable` | 失敗不會重試 |
| `@PreAuthorize` | 權限檢查被跳過，**這是安全漏洞** |

解決方法，依推薦程度排序：

1. **把方法搬到另一個 bean**：最乾淨，通常也代表職責切分更合理。
2. **注入自己**：`@Lazy @Autowired private DefaultGreeter self;` 然後呼叫 `self.greet()`。可以用，但看起來奇怪。
3. **`AopContext.currentProxy()`**：需要設定 `exposeProxy = true`，把 Spring API 寫進業務程式碼，不推薦。
4. **改用 AspectJ 編譯期或載入期織入**：直接修改位元組碼，沒有代理，自呼叫也會生效。代價是建置設定較複雜，少數專案採用。

### 另一個陷阱：直接存取代理的欄位

CGLIB 代理是目標類別的子類別，它**繼承了所有欄位，但這些欄位從來沒有被初始化過**。代理只轉發方法呼叫，不轉發欄位存取。

```java
@Service
public class FlakyQuoteService {
    public final AtomicInteger attempts = new AtomicInteger(); // 公開欄位

    @Retryable(maxRetries = 3)
    public String fetch() { attempts.incrementAndGet(); ... }
}

// 測試中
@Autowired FlakyQuoteService service; // 拿到的是代理
service.attempts.set(0);               // NullPointerException！代理的 attempts 欄位是 null
```

解法是永遠透過方法存取狀態，這也是為什麼 bean 的欄位應該是 `private`：

```java
private final AtomicInteger attempts = new AtomicInteger();
public AtomicInteger attempts() { return attempts; } // 方法呼叫會被轉發到目標物件
```

## 撰寫自己的切面

需要加入 `spring-boot-starter-aspectj`（Boot 4 改名前叫 `spring-boot-starter-aop`）。這個 starter 只提供 AspectJ 的註解與切點語法解析，織入方式仍然是 Spring 的執行期代理。

```java
@Aspect
@Component
public class TimingAspect {
    private static final Logger log = LoggerFactory.getLogger(TimingAspect.class);

    // 切點：com.example 底下所有 @Service 類別的公開方法
    @Pointcut("within(@org.springframework.stereotype.Service com.example..*) && execution(public * *(..))")
    void serviceMethods() {}

    @Around("serviceMethods()")
    public Object time(ProceedingJoinPoint pjp) throws Throwable {
        long start = System.nanoTime();
        try {
            return pjp.proceed(); // 呼叫下一個 advice 或目標方法；不呼叫就等於攔截掉
        } finally {
            log.info("{} took {} ms", pjp.getSignature().toShortString(),
                    (System.nanoTime() - start) / 1_000_000);
        }
    }
}
```

### 五種 advice

| Advice | 執行時機 | 能改變結果嗎 |
| --- | --- | --- |
| `@Before` | 方法執行前 | 只能拋例外阻止執行 |
| `@AfterReturning` | 正常回傳後 | 不能改回傳值（可以讀） |
| `@AfterThrowing` | 拋出例外後 | 不能吞掉例外 |
| `@After` | 不論成功失敗，類似 `finally` | 不能 |
| `@Around` | 包住整個方法 | 可以，完全控制 |

同一個切面中多個 advice 的執行順序（Spring 5.2.7 起，已驗證）：

```
around 前半 → before → 目標方法 → afterReturning（或 afterThrowing）→ after → around 後半
```

多個切面之間的順序用 `@Order` 或實作 `Ordered` 控制，**數字越小越外層**（越先進入、越晚離開）。這點在實務上很重要：例如重試切面必須包在交易切面外面，每次重試才會是一個新交易，否則重試時用的是同一個已經被標記成 rollback-only 的交易。

### 常用切點運算式

| 運算式 | 符合 |
| --- | --- |
| `execution(* com.example.service.*.*(..))` | `service` 套件下所有類別的所有方法 |
| `execution(public * *(..))` | 所有公開方法 |
| `within(com.example..*)` | `com.example` 及子套件中的所有類別 |
| `@annotation(com.example.Timed)` | 標了 `@Timed` 的方法 |
| `@within(org.springframework.stereotype.Service)` | 類別上標了 `@Service` 的所有方法 |
| `bean(*Service)` | bean 名稱以 Service 結尾（Spring 特有） |
| `args(java.lang.String, ..)` | 第一個參數是 `String` |

實務上最推薦**用自訂註解當切點**（`@annotation(...)`），意圖明確，也不會因為重構套件結構而意外失效。
