# CAS、原子類別與 ThreadLocal

## CAS

CAS（Compare-And-Swap）是 CPU 提供的原子指令：「如果記憶體中的值等於預期值，就更新成新值，否則不做事」，並回傳是否成功。`AtomicInteger`、`ConcurrentHashMap`、AQS 都依賴它。它是一種**樂觀鎖**，不需要阻塞執行緒。

```java
// AtomicInteger.incrementAndGet 的概念（實際用 Unsafe / VarHandle 實作）
int prev, next;
do {
    prev = value;          // 讀取目前值
    next = prev + 1;
} while (!compareAndSet(prev, next));   // 期間被別人改過就重試
return next;
```

三個問題：

1. **ABA 問題**：值從 A 被改成 B 又改回 A，CAS 會以為沒變過。對單純計數沒影響，但對鏈結結構（例如無鎖堆疊）會出錯。解法是加版本號：`AtomicStampedReference`。
2. **自旋成本**：競爭激烈時一直失敗重試，浪費 CPU。高競爭的計數改用 `LongAdder`。
3. **只能保證一個變數的原子操作**：多個變數要包成一個物件用 `AtomicReference`，或改用鎖。

## `AtomicLong` 與 `LongAdder`

`AtomicLong` 所有執行緒對同一個值做 CAS，高並行時大量失敗重試。`LongAdder` 把計數分散到一個 `base` 和多個 `Cell`，不同執行緒更新不同的 Cell，競爭大幅減少，`sum()` 時再加總。

代價：`sum()` **不是精確的即時快照**（加總時可能還有更新在進行），而且比較耗記憶體。適合「高頻率寫入、偶爾讀取」的統計計數，例如 API 呼叫次數；需要精確的 `compareAndSet` 時仍用 `AtomicLong`。

## ThreadLocal

讓每個執行緒有自己的變數副本。值不是存在 ThreadLocal 裡，而是存在**每個 `Thread` 物件的 `threadLocals` 欄位**（一個 `ThreadLocalMap`），key 是 ThreadLocal 物件，value 是值。

### 為什麼會記憶體洩漏

- `ThreadLocalMap` 的 Entry 對 key（ThreadLocal）是**弱參考**，對 value 是**強參考**。
- ThreadLocal 物件沒有其他強參考時，key 會被 GC 回收變成 null，但 value 還被 Entry 強參考著。
- 如果執行緒一直活著（**執行緒池的執行緒會重複使用**），這些 value 就永遠不會被回收。
- `ThreadLocalMap` 在 `get`、`set`、`remove` 時會順便清理 key 為 null 的 Entry，但不保證清得乾淨。

更常見的實際問題是**資料串到下一個請求**：執行緒池的執行緒處理完請求 A 沒有清除 ThreadLocal，處理請求 B 時讀到了 A 的使用者資訊，造成資料外洩或錯誤。

```java
private static final ThreadLocal<UserContext> CTX = new ThreadLocal<>();

public void handle(Request req) {
    CTX.set(UserContext.from(req));
    try {
        process();
    } finally {
        CTX.remove();   // 一定要在 finally 清除
    }
}
```

### 常見用途

- 每個請求的使用者資訊、交易追蹤編號（日誌的 MDC 就是用 ThreadLocal 實作）。
- Spring 的交易管理（綁定目前執行緒的 Connection）。
- 非執行緒安全物件的每執行緒副本（例如舊系統的 `SimpleDateFormat`）。

### 子執行緒

一般 ThreadLocal 不會傳給子執行緒。`InheritableThreadLocal` 會在**建立**子執行緒時複製，但執行緒池的執行緒是重複使用的，不會重新複製，所以需要 TransmittableThreadLocal 這類套件或手動傳遞。
