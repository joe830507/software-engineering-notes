# 並行工具與 CompletableFuture

## CountDownLatch、CyclicBarrier、Semaphore

| 工具 | 用途 | 可重複使用 |
| --- | --- | --- |
| `CountDownLatch` | 一個（或多個）執行緒等待其他 N 個任務完成 | 否，計數歸零就結束 |
| `CyclicBarrier` | N 個執行緒互相等待，全部到齊後一起繼續 | 是 |
| `Semaphore` | 控制同時存取某資源的執行緒數量（限流） | 是 |

```java
// CountDownLatch：主執行緒等 8 個分區的批次全部完成
CountDownLatch latch = new CountDownLatch(8);
for (int i = 0; i < 8; i++) {
    int part = i;
    pool.execute(() -> {
        try {
            processPartition(part);
        } finally {
            latch.countDown();     // 一定放 finally，否則任務失敗時主執行緒永遠等不到
        }
    });
}
if (!latch.await(30, TimeUnit.MINUTES)) {
    throw new IllegalStateException("批次逾時");
}

// Semaphore：同時最多 5 個請求呼叫外部 API
Semaphore permits = new Semaphore(5);
permits.acquire();
try {
    callExternalApi();
} finally {
    permits.release();
}
```

## BlockingQueue

| 實作 | 特性 |
| --- | --- |
| `ArrayBlockingQueue` | 有界，陣列，一把鎖 |
| `LinkedBlockingQueue` | 預設無界（`Integer.MAX_VALUE`），可指定容量；讀寫兩把鎖，吞吐量較高 |
| `SynchronousQueue` | 容量為 0，每個 put 必須等到一個 take，`newCachedThreadPool` 使用它 |
| `PriorityBlockingQueue` | 無界，依優先順序 |
| `DelayQueue` | 元素到期後才能取出，可用來做延遲任務 |
| `LinkedTransferQueue` | 生產者可以等待消費者真正接收 |

| 操作 | 拋例外 | 回傳特殊值 | 阻塞 | 逾時 |
| --- | --- | --- | --- | --- |
| 新增 | `add` | `offer` | `put` | `offer(e, time, unit)` |
| 移除 | `remove` | `poll` | `take` | `poll(time, unit)` |

### 生產者-消費者

用 `BlockingQueue` 最簡單：佇列滿時 `put` 會阻塞，佇列空時 `take` 會阻塞，自然限制記憶體用量。

```java
BlockingQueue<Txn> queue = new ArrayBlockingQueue<>(10_000);
Txn POISON = new Txn();   // 結束訊號

// 生產者：讀檔
Thread producer = new Thread(() -> {
    try (BufferedReader br = Files.newBufferedReader(path)) {
        String line;
        while ((line = br.readLine()) != null) {
            queue.put(Txn.parse(line));       // 佇列滿了會等待
        }
    } catch (IOException e) {
        throw new UncheckedIOException(e);
    } catch (InterruptedException e) {
        Thread.currentThread().interrupt();
    } finally {
        for (int i = 0; i < CONSUMERS; i++) {
            try { queue.put(POISON); } catch (InterruptedException ignored) { Thread.currentThread().interrupt(); }
        }
    }
});

// 消費者：批次寫 DB
Runnable consumer = () -> {
    List<Txn> buffer = new ArrayList<>(1000);
    try {
        while (true) {
            Txn t = queue.take();
            if (t == POISON) break;
            buffer.add(t);
            if (buffer.size() == 1000) { dao.batchInsert(buffer); buffer.clear(); }
        }
        if (!buffer.isEmpty()) dao.batchInsert(buffer);
    } catch (InterruptedException e) {
        Thread.currentThread().interrupt();
    }
};
```

## CompletableFuture

把非同步任務串起來，不用阻塞等待結果，也可以組合多個任務、處理例外。

```java
ExecutorService ioPool = ...;   // I/O 任務一定要指定自己的執行緒池，不要用預設的 commonPool

CompletableFuture<Customer> customerF =
        CompletableFuture.supplyAsync(() -> customerApi.get(id), ioPool);
CompletableFuture<List<Policy>> policiesF =
        CompletableFuture.supplyAsync(() -> policyApi.list(id), ioPool);

CustomerView view = customerF
        .thenCombine(policiesF, CustomerView::new)          // 兩個都完成後合併
        .orTimeout(3, TimeUnit.SECONDS)                     // Java 9
        .exceptionally(ex -> {
            log.warn("查詢客戶資料失敗", ex);
            return CustomerView.empty();
        })
        .join();
```

| 方法 | 用途 |
| --- | --- |
| `thenApply` | 轉換結果（同步函數） |
| `thenCompose` | 接另一個非同步任務（扁平化，類似 `flatMap`） |
| `thenCombine` | 合併兩個獨立任務的結果 |
| `thenAccept` / `thenRun` | 消費結果／不需要結果 |
| `allOf` / `anyOf` | 等全部完成／等任一個完成 |
| `exceptionally` / `handle` / `whenComplete` | 例外處理 |

陷阱：

- `supplyAsync` 不指定執行緒池時使用 `ForkJoinPool.commonPool()`，在裡面做 I/O 會拖垮整個 JVM 的共用池。
- 沒有接 `exceptionally` 或 `handle`，例外會被吞掉。
- `thenApply` 可能在完成前一個任務的執行緒或呼叫端的執行緒上執行，`thenApplyAsync` 會丟到執行緒池。
- `get()` 拋 checked exception，`join()` 拋 unchecked 的 `CompletionException`。
