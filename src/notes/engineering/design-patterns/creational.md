# 創建型模式

## Singleton（單例）

**意圖：** 控制某個類別實例的唯一性，並提供取得它的方式。

白話說，就是「所有呼叫者向同一個入口領取同一份物件」。例如共用唯讀設定；如果只是想方便呼叫方法，卻沒有唯一實例的需求，通常不需要單例。唯一實例也不代表它能安全承受多個執行緒同時修改。

### 四種寫法

```java
class SingletonDemo {
    // Eager：類別初始化時建立；不是必然在 JVM 啟動時建立。
    static final class Eager {
        private static final Eager INSTANCE = new Eager();
        private Eager() {}
        static Eager getInstance() { return INSTANCE; }
    }

    // Lazy：第一次使用 Holder 時，由類別初始化機制保證安全。
    static final class LazyHolder {
        private LazyHolder() {}
        private static class Holder {
            private static final LazyHolder INSTANCE = new LazyHolder();
        }
        static LazyHolder getInstance() { return Holder.INSTANCE; }
    }

    // 雙重檢查鎖定（DCL）
    static final class Dcl {
        private static volatile Dcl instance;
        private Dcl() {}
        static Dcl getInstance() {
            Dcl result = instance;
            if (result == null) {
                synchronized (Dcl.class) {
                    result = instance;
                    if (result == null) {
                        result = new Dcl();
                        instance = result;
                    }
                }
            }
            return result;
        }
    }

    enum Settings { INSTANCE }

    public static void main(String[] args) {
        System.out.println(Eager.getInstance() == Eager.getInstance());
        System.out.println(LazyHolder.getInstance() == LazyHolder.getInstance());
        System.out.println(Dcl.getInstance() == Dcl.getInstance());
        System.out.println(Settings.INSTANCE == Settings.INSTANCE);
    }
}
```

預期：四行 `true`。

### 面試追問

- **DCL 為什麼檢查兩次？** 外層避免每次都鎖定；內層避免多個執行緒先後拿到鎖後重複建立。
- **為什麼要 `volatile`？** `volatile` 寫入與後續讀取之間存在 happens-before 關係，使初始化結果能安全發布；只有建立區塊內的 `synchronized`，不足以保護未取得該鎖的快速讀取路徑。
- **`volatile` 能讓 `count++` 安全嗎？** 不能，它是讀取、運算、寫入的複合操作；要考慮鎖或 `AtomicInteger`。
- **為什麼 Holder 能安全？** JVM 的類別初始化具有同步保障；不要把它解釋成「因為有 `final` 所以一切都安全」。
- **反射與序列化呢？** 普通私有建構子不是絕對屏障；`Serializable` 單例常需要 `readResolve()` 回傳既有實例，但那不會同時解決反射問題。Enum 對標準反射建立、複製與反序列化有語言 / 平台保障。
- **唯一的範圍？** Java 靜態單例通常以定義該類別的 ClassLoader 為邊界；不同 JVM、不同服務副本仍各有一份，不能拿來當分散式鎖。
- **Spring singleton 一樣嗎？** 不一樣，是每個容器、每個 bean definition 一份，同一類別可定義多個 bean。

### 代價與避免情境

全域存取造成隱藏依賴與測試污染。一般服務優先使用建構子注入；共享可變狀態應另外設計併發控制。

## 工廠家族

三者務必分清楚：

先問「建立物件時，究竟是哪一件事會變？」只需要集中判斷用哪個類別，可用簡單工廠；固定工作流程要讓子類決定建立哪種產品，可用工廠方法；一次要建立一整套相容產品，才考慮抽象工廠。它們不是必須依序升級的三個等級。

| 方式 | 核心 | 主要擴充方向 |
| --- | --- | --- |
| Simple Factory | 一個方法集中選擇與建立物件 | 常須修改分支或註冊表 |
| Factory Method | Creator 宣告工廠方法，具體 Creator 決定產品 | 新增產品與 Creator 子類 |
| Abstract Factory | 一個工廠介面建立多種相關產品 | 新增一整個產品族較自然 |

### Simple Factory（不是 GoF 23 種之一）

```java
class SimpleFactoryDemo {
    interface Parser { String parse(String input); }
    static class JsonParser implements Parser {
        public String parse(String input) { return "JSON:" + input; }
    }
    static class XmlParser implements Parser {
        public String parse(String input) { return "XML:" + input; }
    }
    static Parser create(String format) {
        return switch (format) {
            case "json" -> new JsonParser();
            case "xml" -> new XmlParser();
            default -> throw new IllegalArgumentException("Unsupported: " + format);
        };
    }
    public static void main(String[] args) {
        System.out.println(create("json").parse("demo"));
    }
}
```

預期：`JSON:demo`。這裡只示範產品選擇，並未實作真正的格式解析。

**違反 OCP 就不能用嗎？** 不是。OCP 是針對預期的變動軸保護穩定程式碼；產品少且穩定時，簡單工廠可能最清楚。註冊表可以減少分支修改，但註冊與組態仍要維護。

### Factory Method（工廠方法）

```java
class FactoryMethodDemo {
    interface Exporter { String export(String data); }
    static class CsvExporter implements Exporter {
        public String export(String data) { return "CSV:" + data; }
    }
    static class JsonExporter implements Exporter {
        public String export(String data) { return "JSON:" + data; }
    }
    abstract static class ExportJob { // Creator
        protected abstract Exporter createExporter(); // Factory Method
        final String run(String data) {
            if (data.isBlank()) throw new IllegalArgumentException("Empty data");
            return createExporter().export(data);
        }
    }
    static class CsvJob extends ExportJob {
        protected Exporter createExporter() { return new CsvExporter(); }
    }
    static class JsonJob extends ExportJob {
        protected Exporter createExporter() { return new JsonExporter(); }
    }
    public static void main(String[] args) {
        ExportJob job = new CsvJob();
        System.out.println(job.run("orders"));
    }
}
```

預期：`CSV:orders`。

- **角色**：`Exporter` 是 Product；`ExportJob` 是 Creator；`CsvJob` 是 Concrete Creator。穩定的 `run()` 不知道具體產品類別。
- **新增 PDF 要改哪裡？** 加入 `PdfExporter` 與 `PdfJob`；建立 / 選擇 Job 的入口仍可能需要更新。不能聲稱整個系統完全不需修改。
- **代價**：Creator 子類數量可能增加；若只是把依賴交給外部注入，未必需要繼承層級。範例的 `run()` 同時也具有 Template Method 結構，模式可以共同存在。

### Abstract Factory（抽象工廠）

```java
class AbstractFactoryDemo {
    interface Button { String render(); }
    interface Checkbox { String render(); }
    interface UiFactory {
        Button createButton();
        Checkbox createCheckbox();
    }
    static class LightFactory implements UiFactory {
        public Button createButton() { return () -> "light button"; }
        public Checkbox createCheckbox() { return () -> "light checkbox"; }
    }
    static class DarkFactory implements UiFactory {
        public Button createButton() { return () -> "dark button"; }
        public Checkbox createCheckbox() { return () -> "dark checkbox"; }
    }
    static String screen(UiFactory factory) {
        return factory.createButton().render() + " + "
                + factory.createCheckbox().render();
    }
    public static void main(String[] args) {
        System.out.println(screen(new DarkFactory()));
    }
}
```

預期：`dark button + dark checkbox`。

最重要的擴充題：

- 新增**產品族** HighContrast：加入新的工廠及產品實作，既有 `UiFactory` 介面通常不用改。
- 新增**產品種類** Menu：`UiFactory` 加入 `createMenu()`，各工廠通常都需要調整。
- 相容性來自工廠實作與客戶端使用約定；不是宣告介面後就自動禁止所有跨族混用。

不適用：只有一種產品，且沒有產品族一致性的需求時，抽象工廠可能太重。

## Builder（建造者）

**意圖：** 分離複雜物件的建構步驟與結果表示。Java 常見用法是讓必要 / 選用參數清楚可讀，並在 `build` 時統一驗證。

例如 `new User("Lin", 30, true, false, ...)` 很難看懂各參數的意義。Builder 讓呼叫端寫出「姓名是 Lin、年齡是 30、角色是 ADMIN」，最後再建立產品。不過，只有兩個清楚參數時，直接使用建構子通常更簡單。

```java
class BuilderDemo {
    static final class User {
        private final String name;
        private final int age;
        private final java.util.List<String> roles;
        private User(Builder b) {
            name = b.name;
            age = b.age;
            roles = java.util.List.copyOf(b.roles); // 防禦性複製
        }
        static class Builder {
            private final String name;
            private int age = 18;
            private final java.util.List<String> roles = new java.util.ArrayList<>();
            Builder(String name) {
                this.name = java.util.Objects.requireNonNull(name);
            }
            Builder age(int age) { this.age = age; return this; }
            Builder role(String role) {
                roles.add(java.util.Objects.requireNonNull(role, "role"));
                return this;
            }
            User build() {
                if (name.isBlank() || age < 0) {
                    throw new IllegalArgumentException("Invalid user");
                }
                return new User(this);
            }
        }
    }
    public static void main(String[] args) {
        User user = new User.Builder("Lin").age(30).role("ADMIN").build();
        System.out.println(user.name + ":" + user.age + ":" + user.roles);
    }
}
```

預期：`Lin:30:[ADMIN]`。

追問與陷阱：

- 方法回傳 `this` 只是 Fluent API；一般 setter 也能這樣寫。
- GoF 常以 Director 協調建構步驟；不是所有 Builder 都必須有獨立 Director。
- Builder 不自動保證產品不可變：集合等參照需要防禦性複製，也不能暴露可變內部資料。
- 此例 `List.copyOf` 複製的是清單結構，且拒絕 null 元素；不是深複製。元素為不可變的 String，因此不會有元素內容被外部修改的問題。若改存可變物件，還需考慮元素的複製與存取方式。
- Builder 本身通常可變，不應跨執行緒共享。
- 工廠與 Builder 可以搭配使用，不是互斥選擇。
