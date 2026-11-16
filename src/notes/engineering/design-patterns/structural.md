# 結構型模式

## Proxy（代理）

**意圖：** 透過替身控制對目標物件的存取，例如遠端存取、延遲建立與授權。

### 靜態代理與 JDK 動態代理

```java
class ProxyDemo {
    public interface ReportService { String read(); }
    static class RealReportService implements ReportService {
        public String read() { return "report"; }
    }
    static class AccessProxy implements ReportService {
        private final ReportService target;
        private final boolean allowed;
        AccessProxy(ReportService target, boolean allowed) {
            this.target = target;
            this.allowed = allowed;
        }
        public String read() {
            if (!allowed) throw new SecurityException("Forbidden");
            return target.read();
        }
    }
    public static void main(String[] args) {
        ReportService target = new RealReportService();
        System.out.println(new AccessProxy(target, true).read());
        ReportService proxy = (ReportService) java.lang.reflect.Proxy.newProxyInstance(
            ReportService.class.getClassLoader(),
            new Class<?>[]{ReportService.class},
            (p, method, arguments) -> {
                System.out.println("invoke:" + method.getName());
                try {
                    return method.invoke(target, arguments);
                } catch (java.lang.reflect.InvocationTargetException e) {
                    throw e.getCause(); // 保留目標例外，避免多一層反射包裝
                }
            });
        System.out.println(proxy.read());
    }
}
```

預期：`report`、`invoke:read`、`report`。

**靜態 vs 動態：** 靜態代理明確實作轉送方法，容易閱讀；動態代理以 `InvocationHandler` 集中處理方法呼叫，適合橫切關注點，但增加反射、例外與除錯複雜度。

### Spring AOP 必答

- JDK 動態代理以介面作為代理契約；CGLIB 產生子類，因此無法繼承 `final` 類別，也無法覆寫 `final` / `private` 方法。實際選擇要看框架與設定，不能只看目標是否有介面。
- `this.someTransactionalMethod()` 不經外部代理，因此不會觸發該次呼叫對應的新 advice；不代表外層已存在的交易會消失。可拆成不同 bean，讓呼叫跨越代理邊界。AspectJ 織入則是不同機制。

### 代價與陷阱

同一份介面不代表所有語義都相同。正式代理要考慮 `equals` / `hashCode` / `toString`、例外、重試副作用與身分語義。範例的固定 `allowed` 只是示意，正式授權需依當前請求與資源判定。

## Decorator（裝飾者）

**意圖：** 保留同一契約，以可組合的包裝物件增加責任。

```java
class DecoratorDemo {
    interface Text { String render(); }
    record Plain(String value) implements Text {
        public String render() { return value; }
    }
    record Uppercase(Text inner) implements Text {
        public String render() {
            return inner.render().toUpperCase(java.util.Locale.ROOT);
        }
    }
    record Brackets(Text inner) implements Text {
        public String render() { return "[" + inner.render() + "]"; }
    }
    public static void main(String[] args) {
        Text text = new Brackets(new Uppercase(new Plain("hello")));
        System.out.println(text.render());
    }
}
```

預期：`[HELLO]`。

**角色：** `Text` 是 Component；`Plain` 是 Concrete Component；`Uppercase` / `Brackets` 是 Decorator。

### 面試追問

- **為何比繼承彈性？** 不同功能可在執行時組合，不必為每個組合建立子類。
- **一定要有抽象 Decorator 基類嗎？** 不一定；共用轉送邏輯多時才值得抽出。
- **和 Proxy 差在哪？** 主要看意圖：Decorator 組合附加責任，Proxy 管理存取與間接性；類別圖可能非常相似，日誌也可能出現在兩者。
- **Java I/O 的例子**：用 `BufferedReader` 包裝 `Reader` 來理解，應搭配資源關閉，不要只背建構式。

### 代價

包裝順序可能影響結果，多層包裝不易除錯；不要假設所有裝飾操作都可交換順序。

## Adapter（轉接器）

**意圖：** 將既有介面轉換成使用端期待的介面。

```java
class AdapterDemo {
    interface PaymentGateway { String pay(long cents); }
    static class LegacyPaymentApi {
        String charge(String amountInDollars) {
            return "charged:" + amountInDollars;
        }
    }
    static class LegacyAdapter implements PaymentGateway {
        private final LegacyPaymentApi legacy;
        LegacyAdapter(LegacyPaymentApi legacy) { this.legacy = legacy; }
        public String pay(long cents) {
            if (cents <= 0) throw new IllegalArgumentException("Invalid amount");
            String dollars = java.math.BigDecimal.valueOf(cents, 2).toPlainString();
            return legacy.charge(dollars);
        }
    }
    public static void main(String[] args) {
        PaymentGateway gateway = new LegacyAdapter(new LegacyPaymentApi());
        System.out.println(gateway.pay(12345));
    }
}
```

預期：`charged:123.45`。金額以整數分表示，避免使用 `double` 做金額換算。

**角色：** `PaymentGateway` 是 Target，`LegacyPaymentApi` 是 Adaptee，`LegacyAdapter` 負責轉換。

### 類別轉接器與物件轉接器

可以 `extends LegacyPaymentApi implements PaymentGateway`（類別轉接器），但前提是既有類別可繼承且目標為介面；Java 不能同時繼承兩個類別。物件轉接器以組合持有既有物件，通常更易替換與測試。

### 代價

型別轉換不等於語義相容。真實支付整合還需處理幣別、四捨五入、錯誤碼、超時與冪等性。
