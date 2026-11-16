# 設計模式總覽

> 適用對象：Java / Spring 後端工程師。範例採 Java 17+ 標準語法，不依賴 Spring 或第三方函式庫。
> 優先順序是學習建議，不是經統計驗證的面試出題排名。

## 學習地圖

### GoF 23 種模式的分類

| 分類 | 數量 | 模式 |
| --- | --- | --- |
| 創建型 | 5 | Singleton、Factory Method、Abstract Factory、Builder、Prototype |
| 結構型 | 7 | Adapter、Bridge、Composite、Decorator、Facade、Flyweight、Proxy |
| 行為型 | 11 | Chain of Responsibility、Command、Interpreter、Iterator、Mediator、Memento、Observer、State、Strategy、Template Method、Visitor |

這份筆記有完整範例的有 11 種 GoF 模式，另外加上 Simple Factory（它不是 GoF 23 種之一）。其餘 12 種在「比較與速查」頁。

### 建議的學習順序

| 層級 | 模式 | 最重要的練習 |
| --- | --- | --- |
| 第一輪：可手寫且能比較 | Singleton、Factory Method、Abstract Factory、Strategy、Proxy | 安全發布、工廠差異、依賴反轉、代理邊界 |
| 第二輪：連結後端實務 | Builder、Decorator、Adapter、Observer、Chain of Responsibility、Template Method | 組合、事件、流程與框架擴充點 |
| 第三輪：辨認問題再套用 | State、Command、Facade、Composite、Iterator 等 | 知道何時值得引入，避免只背名字 |

## 怎麼回答模式題

每題用這個順序回答：**問題 → 模式意圖 → 角色協作 → Java 例子 → 代價 → 不適用情境**。

範例：「折扣規則持續增加，結帳服務的分支越來越大。我將折扣演算法抽成 Strategy，由結帳服務依賴介面，建立處再注入實作。這能獨立測試與擴充規則，但策略挑選仍需管理；只有兩個穩定且簡短的分支時，不一定需要抽象化。」

## 常見的誤解

下面是整理時對一些常見說法的修正，面試時要特別小心：

| 常見說法 | 比較準確的說法 |
| --- | --- |
| 五個模式是面試最高頻核心 | 沒有統計來源，不能當作普遍排名。Java / Spring 職缺可優先練習工廠、策略、代理，再補單例、裝飾者、觀察者等。 |
| Factory 算一種 GoF 模式 | 要拆開：Factory Method 與 Abstract Factory 是兩種 GoF 模式；Simple Factory 是常見慣用法，不在 GoF 23 種之列。 |
| 簡單工廠 → 工廠方法 → 抽象工廠是演進階梯 | 可用來教學比較，但不是必須升級。它們分別適合集中建立、讓子類決定產品、建立相容產品族。 |
| Enum 是 Singleton 最佳解法 | Enum 很適合簡單單例，標準反射與序列化機制也有保障；但不等於所有情境最佳。Spring 應用通常交給容器管理依賴與生命週期。 |
| 執行緒安全的 Singleton | 要拆成「安全建立與發布」和「物件後續操作是否安全」。只有一個物件，不代表它的可變欄位安全。 |
| Builder 就是鏈式呼叫 | Fluent API 是介面風格；GoF Builder 重點是分離建構過程與產品表示。Java 常見的參數型 Builder 是實用變體。 |
| JDK Proxy 針對介面、CGLIB 針對類別 | 基本正確，但要補 final / private 限制、自我呼叫繞過代理，以及框架設定會影響代理選擇。 |
| 類別轉接器使用多重繼承 | 這是跨語言的模式描述。Java 不支援多個類別繼承；可繼承既有類別並實作目標介面，或用組合。 |
| Pub/Sub 比 Observer 多一個 Broker | 是常見對照，卻不是充分定義。Pub/Sub 可用行程內事件匯流排，未必有外部訊息伺服器，也未必非同步。 |
| Strategy 消除 if-else | 主要是移出分支中的演算法。選擇策略仍可能需要設定、Map 或條件判斷；不應為了零 if 而過度設計。 |
| 責任鏈直到有人處理即停止 | 經典形式如此；Filter / Middleware 常是多個處理者依序執行，允許短路，並有返回階段。 |
| JdbcTemplate 是典型 Template Method | 它有固定流程的模板精神，但使用者常以 callback / Strategy 注入變動步驟，不必繼承它覆寫方法。 |

## 範例怎麼執行

每個 `java` 區塊都是獨立範例，第一個類別就是含有 `main` 的啟動類別。將區塊存成該類別名稱加 `.java`（例如 `SingletonDemo.java`），在安裝完整 JDK 17+ 的環境執行：

```bash
javac SingletonDemo.java
java SingletonDemo
```

範例刻意使用巢狀類別，方便單檔練習；正式專案可依職責拆檔。輸出及例外政策屬教學示範，並非完整的支付、授權或事件系統。

12 個獨立範例都已用 Java 21 環境的編譯器，以 `-source 17 -target 17` 編譯並執行，輸出逐一符合文中預期。這是可執行性驗證，不包含併發壓力測試或 Spring 整合測試。

## 查核來源

用來核對 Java / Spring 的平台行為：

- [Java Language Specification 17.4.5：happens-before 與 volatile](https://docs.oracle.com/javase/specs/jls/se26/html/jls-17.html#jls-17.4.5)
- [JLS 12.4.2：類別初始化](https://docs.oracle.com/javase/specs/jls/se17/html/jls-12.html#jls-12.4.2)
- [JLS 8.9：enum 實例、反射與序列化保障](https://docs.oracle.com/javase/specs/jls/se17/html/jls-8.html#jls-8.9)
- [Spring Framework：Proxying Mechanisms](https://docs.spring.io/spring-framework/reference/core/aop/proxying.html)
- [Spring Framework：JdbcTemplate API](https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/jdbc/core/JdbcTemplate.html)
- [Spring Framework：Bean Scopes](https://docs.spring.io/spring-framework/reference/core/beans/factory-scopes.html)
- [Jakarta Servlet：FilterChain API](https://jakarta.ee/specifications/servlet/6.0/apidocs/jakarta.servlet/jakarta/servlet/filterchain)
- [Java BufferedReader API](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/io/BufferedReader.html)
