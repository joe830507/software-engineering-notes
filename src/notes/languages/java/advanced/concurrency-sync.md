# 執行緒安全與鎖

## 什麼是執行緒安全

多個執行緒同時存取一個物件時，不需要呼叫端做額外的同步，結果都是正確的，就叫執行緒安全。

造成不安全的三大問題：

1. **原子性**：`count++` 其實是「讀取、加一、寫回」三個步驟，兩個執行緒同時執行會遺失更新。
2. **可見性**：每個 CPU 核心有自己的快取，一個執行緒修改了變數，另一個執行緒可能看不到最新值。
3. **有序性**：編譯器和 CPU 會為了效能重新排序指令，單執行緒結果不變，但多執行緒下可能出錯。

解決方式：不共享（區域變數、`ThreadLocal`）、不可變物件、加鎖（`synchronized`、`Lock`）、原子類別（`AtomicInteger`）、執行緒安全的集合。

## `synchronized`

用法：

```java
synchronized void instanceMethod() {}         // 鎖 this
static synchronized void staticMethod() {}    // 鎖 Class 物件
synchronized (lockObj) { ... }                // 鎖指定物件
```

原理：

- 同步區塊編譯後是 `monitorenter` 和 `monitorexit` 指令（會有兩個 `monitorexit`，一個正常結束、一個例外時確保釋放）；同步方法是在方法上標記 `ACC_SYNCHRONIZED`。
- 每個物件都可以當鎖，鎖的狀態記錄在物件標頭的 **Mark Word**。
- 同時保證**原子性、可見性、有序性**：進入時從主記憶體重新讀取，離開時把修改寫回主記憶體。
- **可重入**：同一個執行緒可以再次取得已持有的鎖，不會自己鎖死自己。

**鎖升級**（HotSpot 最佳化）：無鎖 → 偏向鎖 → 輕量級鎖（CAS 自旋）→ 重量級鎖（作業系統 mutex，執行緒會被阻塞）。偏向鎖在 Java 15 被標記為廢棄且預設關閉（JEP 374），之後版本已移除，所以新版本主要是輕量級鎖和重量級鎖。

常見錯誤：

- 鎖不同的物件等於沒鎖，例如每次 `synchronized (new Object())`。
- 用 `String` 字面值或 `Integer` 當鎖：常數池和快取讓不相關的程式碼共用同一把鎖。
- 鎖住一個會被重新賦值的欄位：`synchronized (list)` 之後又 `list = new ArrayList<>()`。

## `volatile`

`volatile` 讓執行緒之間可靠地傳遞變數更新，並提供必要的先後順序保證。例如，先準備資料再寫入 `ready = true`，另一個執行緒讀到這次更新後，就能看見先前準備好的資料。這不表示其他執行緒會立刻獲得執行機會。

`volatile` 的單次讀寫具有原子性，但不會讓多個步驟變成一個不可分割的操作。`count++` 包含「讀取、加一、寫回」；兩個執行緒可能讀到相同舊值，造成一次更新被蓋掉。此時要用鎖或 `AtomicInteger.incrementAndGet()`。

適用情境：

- 狀態旗標：一個執行緒寫、其他執行緒讀，例如 `volatile boolean running`。
- 雙重檢查鎖定（DCL）的單例。
- 配合 CAS 使用（`AtomicInteger` 內部的值就是 `volatile int`）。

原理：Java 記憶體模型規定，對同一個 `volatile` 變數的寫入 happens-before 後續的讀取。JVM 依處理器架構使用適當的指令與記憶體屏障實現這項保證；這不是禁止所有指令重排序，也不代表每次讀取都要繞過 CPU 快取、直接存取實體記憶體。下方的 `ready` 範例展示了這項保證。

雙重檢查鎖定的單例（`volatile` 不能省，否則可能拿到尚未初始化完成的物件）：

```java
public class Singleton {
    private static volatile Singleton instance;
    private Singleton() {}

    public static Singleton getInstance() {
        if (instance == null) {                    // 第一次檢查，不加鎖
            synchronized (Singleton.class) {
                if (instance == null) {            // 第二次檢查
                    instance = new Singleton();
                }
            }
        }
        return instance;
    }
}
```

## Java 記憶體模型與 happens-before

JMM 定義多執行緒之間的記憶體可見性規則。Java 不保證一個執行緒的寫入什麼時候會被另一個執行緒看到，**除非兩個操作之間有 happens-before 關係**。A happens-before B，代表 A 的結果對 B 一定可見，且順序在 B 之前。

主要規則：

1. **程式順序規則**：同一個執行緒內，前面的操作 happens-before 後面的操作。
2. **監視器鎖規則**：對一把鎖的解鎖 happens-before 之後對同一把鎖的加鎖。
3. **volatile 規則**：對 volatile 變數的寫入 happens-before 之後對它的讀取。
4. **執行緒啟動規則**：`thread.start()` happens-before 該執行緒內的所有操作。
5. **執行緒結束規則**：執行緒內的所有操作 happens-before 其他執行緒從 `join()` 返回。
6. **中斷規則**：`interrupt()` happens-before 被中斷的執行緒偵測到中斷。
7. **遞移性**：A hb B、B hb C，則 A hb C。

```java
int data;
volatile boolean ready;

// 執行緒 1
data = 42;          // (1)
ready = true;       // (2) volatile 寫

// 執行緒 2
if (ready) {        // (3) volatile 讀
    print(data);    // (4) 一定印出 42
}
// (1) hb (2)（程式順序），(2) hb (3)（volatile），(3) hb (4)（程式順序），
// 依遞移性 (1) hb (4)，所以 data 的寫入一定可見。
```

## `synchronized` 與 `ReentrantLock`

| | `synchronized` | `ReentrantLock` |
| --- | --- | --- |
| 層級 | JVM 關鍵字 | Java 類別（基於 AQS） |
| 釋放 | 自動（離開區塊或拋例外） | **必須在 finally 手動 `unlock()`** |
| 嘗試取得 | 不行 | `tryLock()`、`tryLock(timeout)` |
| 可中斷 | 等待時不可中斷 | `lockInterruptibly()` |
| 公平性 | 非公平 | 可選公平或非公平（預設非公平） |
| 條件變數 | 一個（`wait` / `notify`） | 多個 `Condition` |
| 可重入 | 是 | 是 |

```java
private final ReentrantLock lock = new ReentrantLock();

public boolean transfer() throws InterruptedException {
    if (!lock.tryLock(3, TimeUnit.SECONDS)) {   // 拿不到就放棄，避免無限等待
        return false;
    }
    try {
        // 臨界區
        return true;
    } finally {
        lock.unlock();
    }
}
```

選擇原則：一般情況用 `synchronized`，簡單且不會忘記釋放；需要逾時、可中斷、公平鎖、多個條件時才用 `ReentrantLock`。

讀多寫少：`ReentrantReadWriteLock`（讀讀不互斥、讀寫互斥）；更高效能的是 Java 8 的 `StampedLock`，有樂觀讀模式，但不可重入、不支援 Condition，使用上要小心。

## AQS

`AbstractQueuedSynchronizer` 是 JUC 大部分同步工具的基礎框架，`ReentrantLock`、`Semaphore`、`CountDownLatch`、`ReentrantReadWriteLock` 都基於它。核心是一個 **`volatile int state`** 加上一個 **FIFO 等待佇列**（CLH 佇列的變體）。

運作方式：

- 執行緒用 **CAS** 嘗試修改 `state` 取得資源，成功就繼續執行。
- 失敗就被包成節點放進等待佇列尾端，用 `LockSupport.park()` 掛起。
- 持有者釋放資源時修改 `state`，並 `unpark` 喚醒佇列中的下一個節點。

`state` 在不同工具的意義：

| 工具 | state 的意義 |
| --- | --- |
| `ReentrantLock` | 0 表示沒人持有；大於 0 表示被持有，數字是重入次數 |
| `Semaphore` | 剩餘的許可數 |
| `CountDownLatch` | 剩餘的計數，減到 0 時所有等待的執行緒被釋放 |
| `ReentrantReadWriteLock` | 高 16 位元是讀鎖數量，低 16 位元是寫鎖重入次數 |

公平與非公平：非公平鎖在 `lock()` 時先直接 CAS 搶一次，搶不到才排隊，吞吐量較高但可能造成飢餓；公平鎖會先檢查佇列中是否有人在等，有就乖乖排隊。
