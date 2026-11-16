# 執行緒池

## 參數

```java
public ThreadPoolExecutor(
        int corePoolSize,                    // 核心執行緒數
        int maximumPoolSize,                 // 最大執行緒數
        long keepAliveTime,                  // 非核心執行緒閒置多久後回收
        TimeUnit unit,
        BlockingQueue<Runnable> workQueue,   // 任務佇列
        ThreadFactory threadFactory,         // 建立執行緒的方式（命名很重要）
        RejectedExecutionHandler handler)    // 拒絕策略
```

## 提交任務的流程

1. 執行緒數 < `corePoolSize`：**建立新執行緒**執行（即使有閒置的核心執行緒）。
2. 已達核心數：放進 **`workQueue`**。
3. 佇列滿了且執行緒數 < `maximumPoolSize`：**建立非核心執行緒**執行。
4. 佇列滿了且已達最大執行緒數：執行**拒絕策略**。

常被誤解：不是「核心執行緒滿了就增加到最大執行緒數」，而是**先排隊，佇列滿了才擴充**。所以用無界佇列時 `maximumPoolSize` 完全沒有作用。

## 拒絕策略

| 策略 | 行為 |
| --- | --- |
| `AbortPolicy`（預設） | 拋 `RejectedExecutionException` |
| `CallerRunsPolicy` | 由提交任務的執行緒自己執行，形成自然的回壓（減慢提交速度） |
| `DiscardPolicy` | 默默丟棄 |
| `DiscardOldestPolicy` | 丟棄佇列中最舊的任務，再重新提交 |

## 為什麼不建議用 `Executors` 建立

- `newFixedThreadPool`、`newSingleThreadExecutor`：佇列是**無界**的 `LinkedBlockingQueue`，任務堆積會 OOM。
- `newCachedThreadPool`：最大執行緒數是 `Integer.MAX_VALUE`，任務多時建立大量執行緒，耗盡記憶體或 OS 資源。
- `newScheduledThreadPool`：同樣是無界佇列。

建議自己 new `ThreadPoolExecutor`，使用有界佇列並指定有意義的執行緒名稱：

```java
ThreadPoolExecutor pool = new ThreadPoolExecutor(
        8, 16,
        60, TimeUnit.SECONDS,
        new ArrayBlockingQueue<>(1000),                                       // 有界佇列
        new ThreadFactoryBuilder().setNameFormat("policy-batch-%d").build(),  // Guava；也可自己實作
        new ThreadPoolExecutor.CallerRunsPolicy());
```

## 大小怎麼設定

- **CPU 密集**：大約 CPU 核心數 + 1，多了只是增加上下文切換。
- **I/O 密集**：可以多很多。經驗公式：`執行緒數 = 核心數 × (1 + 等待時間 / 計算時間)`。例如每個任務 90% 時間在等 DB，8 核心大約 80 條。
- **真正的上限常常在下游**：開 100 條執行緒，但 DB 連線池只有 20 條，多出來的 80 條只是在等連線。

實務做法：從公式估一個起點，用壓力測試量測吞吐量和回應時間，同時監控佇列長度、活躍執行緒數、拒絕次數，再調整。參數最好可以從設定檔調整。

## `execute()` 與 `submit()`：例外跑到哪裡

- `execute(Runnable)`：沒有回傳值。任務拋出例外時，例外傳到執行緒的 `UncaughtExceptionHandler`，預設**印到 stderr，而且該工作執行緒會結束**，執行緒池會再補一條新的。
- `submit()`：回傳 `Future`。任務的例外會被**包在 Future 裡**，如果沒有人呼叫 `future.get()`，**例外就無聲無息地消失了**。這是「批次明明失敗了卻沒有任何日誌」的常見原因。

解法：在任務內部自己 try-catch 並記錄日誌；或確實呼叫 `get()`；或覆寫 `ThreadPoolExecutor.afterExecute`。

## ForkJoinPool

為「分治」任務設計：大任務遞迴切成小任務（fork），最後合併結果（join）。每個工作執行緒有**自己的雙端佇列**，自己從頭部取任務；閒下來的執行緒會從其他執行緒佇列的**尾部偷任務**（work stealing），減少競爭、讓負載平均。

平行 Stream、`CompletableFuture` 預設的非同步執行、虛擬執行緒的 carrier thread 都用到它。
