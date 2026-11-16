# 日期時間與版本特性


## 日期時間：`java.time`


為什麼不用 `Date` 和 `SimpleDateFormat`：

- `Date` 是可變的，月份從 0 開始，設計混亂。
- **`SimpleDateFormat` 不是執行緒安全的**，宣告成 static 共用，多執行緒 parse 會得到錯誤日期或拋例外。
- `java.time`（Java 8）全部不可變、執行緒安全，`DateTimeFormatter` 可以放心宣告成常數。

| 類別 | 用途 |
| --- | --- |
| `LocalDate` | 只有日期，例如生日 |
| `LocalTime` | 只有時間 |
| `LocalDateTime` | 日期 + 時間，沒有時區 |
| `ZonedDateTime` | 帶時區 |
| `Instant` | 時間軸上的一點（UTC），適合記錄事件時間 |
| `Duration` / `Period` | 時間長度（秒、奈秒）／日期長度（年月日） |

```java
LocalDate start = LocalDate.of(2026, 1, 31);
start.plusMonths(1);                                        // 2026-02-28，自動處理月底
ChronoUnit.DAYS.between(start, LocalDate.of(2026, 12, 31)); // 計算天數
```



## 各 LTS 版本的重要特性


| 版本 | 重要特性 |
| --- | --- |
| **Java 8** | Lambda、Stream、Optional、`java.time`、介面 `default` / `static` 方法、`CompletableFuture`、Metaspace 取代 PermGen |
| 9 | 模組系統、`List.of` / `Map.of`、JShell、介面 private 方法、G1 成為預設 GC、Compact Strings |
| 10 | `var` 區域變數型別推斷 |
| **Java 11** | 標準 `HttpClient`、`String` 新方法（`isBlank`、`strip`、`lines`、`repeat`）、可直接 `java Hello.java` 執行單一檔案 |
| 14 | `switch` 運算式、有幫助的 NPE 訊息 |
| 15 | Text Blocks（`"""` 多行字串） |
| 16 | `record`、`instanceof` 模式比對 |
| **Java 17** | `sealed` 類別、強封裝 JDK 內部 API |
| **Java 21** | 虛擬執行緒、`switch` 模式比對、record 模式、Sequenced Collections（`getFirst`、`getLast`、`reversed`） |
| **Java 25** | Scoped Values、彈性建構子本體（`super()` 之前可以寫敘述，JEP 513）、精簡原始檔與 instance main 方法、模組匯入宣告 |

目前的 LTS 版本是 8、11、17、21、25（依 [Oracle Java SE Support Roadmap](https://www.oracle.com/java/technologies/java-se-support-roadmap.html)）。

Java 21 的 `record` + `sealed` + `switch` 模式比對：

```java
sealed interface Shape permits Circle, Rect {}
record Circle(double r) implements Shape {}
record Rect(double w, double h) implements Shape {}

double area(Shape s) {
    return switch (s) {
        case Circle c -> Math.PI * c.r() * c.r();
        case Rect(var w, var h) -> w * h;   // record 解構；sealed 讓編譯器知道所有子型別，不需要 default
    };
}
```
