# 行為型模式

## Observer（觀察者）

**意圖：** 建立一對多通知關係，讓訂閱者在事件發生時回應。

```java
class ObserverDemo {
    record OrderPlaced(String orderId) {}
    interface Listener { void onEvent(OrderPlaced event); }
    static class OrderEvents {
        // 此例採單執行緒、同步通知；不是執行緒安全的事件匯流排。
        private final java.util.List<Listener> listeners = new java.util.ArrayList<>();
        void subscribe(Listener listener) {
            listeners.add(java.util.Objects.requireNonNull(listener, "listener"));
        }
        void unsubscribe(Listener listener) { listeners.remove(listener); }
        void publish(OrderPlaced event) {
            for (Listener listener : java.util.List.copyOf(listeners)) {
                listener.onEvent(event);
            }
        }
    }
    public static void main(String[] args) {
        OrderEvents events = new OrderEvents();
        Listener email = e -> System.out.println("email:" + e.orderId());
        events.subscribe(email);
        events.subscribe(e -> System.out.println("audit:" + e.orderId()));
        events.publish(new OrderPlaced("O-1"));
        events.unsubscribe(email);
        events.publish(new OrderPlaced("O-2"));
    }
}
```

預期：`email:O-1`、`audit:O-1`、`audit:O-2`。

### 面試追問

- **Push**：事件直接帶資料，訂閱者較少回查；要設計事件契約。
- **Pull**：收到通知後向主體查詢所需狀態；耦合查詢介面，且讀取時間可能晚於原始變更。
- 此例若訂閱者拋例外，後面的訂閱者不會執行，這是明確的 fail-fast 政策。若要隔離失敗，應補錯誤蒐集與重試策略，而非直接吞掉例外。
- 複製 `listeners` 是為了固定這次通知的名單，不會讓 `ArrayList` 的跨執行緒存取自動安全。
- 本例允許同一 listener 重複訂閱，會通知多次；一次 unsubscribe 只移除一筆。通知途中新增的 listener 下次才收到通知；途中移除的 listener 若仍在本次快照中，這次仍會收到。這些都是需要明確決定的行為。
- 注意取消訂閱、記憶體保留、重複訂閱、通知順序與重入。

### Observer 與 Pub/Sub

| 比較 | Observer 常見形式 | Pub/Sub 常見形式 |
| --- | --- | --- |
| 訂閱關係 | 主體保存 listener 參照 | 透過 topic、事件匯流排或 broker 路由 |
| 空間範圍 | 經常在同一行程 | 可以同一行程或跨服務 |
| 同步性 | 可同步，也可非同步 | 可同步，也可非同步；分散式常採非同步 |
| 額外議題 | 通知例外、訂閱生命週期 | 跨服務時還有持久化、重送、排序與冪等性 |

不要把事件驅動架構、Observer 與訊息佇列直接畫上等號。不要因為使用 broker 就宣稱 exactly-once 或交易一致性。

## Strategy（策略）

**意圖：** 把可互換的演算法封裝在共同契約後面，由使用端透過組合採用。

把 Checkout 想成結帳機，ShippingFee 是可替換的運費計算方式。結帳機只問「這筆訂單運費多少」，不必知道免運門檻或快遞規則。此例每次建立 Checkout 時選定策略，沒有提供執行中切換的方法；使用 Strategy 不代表一定要能隨時切換。

```java
class StrategyDemo {
    interface ShippingFee { long calculate(long subtotalCents); }
    static class StandardShipping implements ShippingFee {
        public long calculate(long subtotalCents) {
            return subtotalCents >= 10000 ? 0 : 600;
        }
    }
    static class ExpressShipping implements ShippingFee {
        public long calculate(long subtotalCents) { return 1200; }
    }
    record Checkout(ShippingFee shipping) {
        long total(long subtotalCents) {
            if (subtotalCents < 0) throw new IllegalArgumentException("Invalid subtotal");
            return Math.addExact(subtotalCents, shipping.calculate(subtotalCents));
        }
    }
    public static void main(String[] args) {
        java.util.Map<String, ShippingFee> strategies = java.util.Map.of(
            "standard", new StandardShipping(), "express", new ExpressShipping());
        ShippingFee selected = strategies.get("standard");
        if (selected == null) throw new IllegalArgumentException("Unknown shipping");
        System.out.println(new Checkout(selected).total(5000));
    }
}
```

預期：`5600`，單位是分。

**角色：** `Checkout` 是 Context，`ShippingFee` 是 Strategy；選擇邏輯位於外部組裝處。

### 追問

- **Map 是 Factory 嗎？** 此例只查找既有策略，是 registry；沒有建立物件，不要硬稱工廠。需要時可存 `Supplier` 來延後建立。
- **Spring 怎麼做？** 可把策略實作交給容器，再由服務注入策略集合並依業務代碼建立 registry；bean 名稱不一定適合作為永久業務協定。
- **能用 Lambda 嗎？** 單一抽象方法介面可以；複雜規則仍可用具名類別提高可讀性。
- **共享策略安全嗎？** 無狀態或不可變策略較容易安全共享；模式本身沒有執行緒安全保證。

### 代價

類別及選擇機制增加。兩個簡短且不會擴充的分支，可以保留直觀的條件式。

## Chain of Responsibility（責任鏈）

**意圖：** 降低發送者對具體處理者的依賴，將請求交給一組可串接處理者。

有兩種面試常見形態：經典「第一個能處理者處理後停止」，以及 Filter 類「多個處理者執行，可短路」。下面示範後者。

```java
class ChainDemo {
    record Request(boolean authenticated) {}
    interface Next { String proceed(Request request); }
    interface Filter { String apply(Request request, Next next); }
    static Next chain(java.util.List<Filter> filters, Next terminal) {
        Next result = terminal;
        for (int i = filters.size() - 1; i >= 0; i--) {
            Filter filter = filters.get(i);
            Next downstream = result;
            result = request -> filter.apply(request, downstream);
        }
        return result;
    }
    public static void main(String[] args) {
        Filter log = (request, next) -> {
            System.out.println("before");
            try { return next.proceed(request); }
            finally { System.out.println("after"); }
        };
        Filter auth = (request, next) -> request.authenticated()
                ? next.proceed(request) : "401";
        Next pipeline = chain(java.util.List.of(log, auth), request -> "200");
        System.out.println(pipeline.proceed(new Request(false)));
        System.out.println(pipeline.proceed(new Request(true)));
    }
}
```

預期：`before`、`after`、`401`、`before`、`after`、`200`。

用未登入請求追一次流程：先進 log 印出 before，再進 auth；auth 回傳 401 而不呼叫 next，因此 terminal 不會執行。返回 log 時 finally 印出 after，最後 main 才印出 401。已登入時則會繼續進入 terminal，回傳 200。這種「進去一層層、回來反方向」的結構也常稱為洋蔥模型。

### 追問

- **為什麼反向組裝？** 讓列表第一個 Filter 成為最外層，按列表順序進入。
- **不呼叫 `next`？** 短路，後續處理者不會執行。
- **呼叫 `next` 兩次？** 下游可能執行兩次；是否允許必須由契約決定，一般請求鏈應避免。
- **Servlet Filter** 使用 `FilterChain.doFilter()` 繼續傳遞，也可在前後處理；MVC Interceptor 有不同生命週期，不能說兩者 API 與安全邊界相同。
- Interceptor 不宜直接被視為完整安全層；授權還要考慮請求匹配與框架提供的安全機制。

### 代價

順序敏感、可能無人處理、可能短路；要明確定義最終處理者、例外與清理政策。

## Template Method（樣板方法）

**意圖：** 父類別固定演算法骨架，把部分步驟交給子類別覆寫。

```java
class TemplateMethodDemo {
    abstract static class ImportJob {
        public final void run(String raw) {
            validate(raw);
            String parsed = parse(raw);
            save(parsed);
            afterImport();
        }
        private void validate(String raw) {
            if (raw == null || raw.isBlank()) {
                throw new IllegalArgumentException("Empty input");
            }
        }
        protected abstract String parse(String raw);
        protected void save(String parsed) {
            System.out.println("save:" + parsed);
        }
        protected void afterImport() {} // 可選 hook
    }
    static class CsvImportJob extends ImportJob {
        protected String parse(String raw) { return raw.replace(',', '|'); }
        protected void afterImport() { System.out.println("done"); }
    }
    public static void main(String[] args) {
        new CsvImportJob().run("a,b");
    }
}
```

預期：`save:a|b`、`done`。這只是字串處理示範，不是完整 CSV parser。

### 追問

- **為何 `run` 用 `final`？** 防止子類別改變流程；這是常見保護方式，不是所有樣板方法都必須 `final`。
- **abstract step 與 hook？** 前者要求子類別提供實作；後者給預設行為，可選擇覆寫。
- **afterImport 一定執行嗎？** 不會；此例 validate、parse 或 save 拋錯時，後面的步驟會跳過。afterImport 是成功路徑的 hook，若要保證釋放資源，應使用 try-with-resources 或 finally，不能只靠方法名稱推斷。
- **好萊塢原則？** 由框架 / 父類別控制流程，再回呼擴充點；這種控制反轉不專屬此模式。
- **JdbcTemplate？** 固定 JDBC 工作流程，再由使用者傳入 `RowMapper` 等 callback；這是模板流程結合 callback / Strategy，不是靠使用者繼承覆寫的標準教科書形式。

### 代價

依賴繼承、子類別受父類別變動影響；需要自由組合多個獨立步驟時，Strategy 或 callback 往往更彈性。
