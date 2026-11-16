# 執行緒基礎

## 建立執行緒的方式

1. 繼承 `Thread`，覆寫 `run()`。
2. 實作 `Runnable`，交給 `Thread`。
3. 實作 `Callable`，搭配 `FutureTask` 或執行緒池，可以有回傳值、可以拋 checked exception。
4. **執行緒池**（實務上的做法）。
5. Java 21 虛擬執行緒：`Thread.ofVirtual().start(task)` 或 `Executors.newVirtualThreadPerTaskExecutor()`。

本質上建立執行緒只有 `new Thread()` 一種，其他方式都是在決定「要執行的任務是什麼」以及「由誰來管理執行緒」。

## `start()` 與 `run()`

`start()` 會向 JVM 申請建立新執行緒，由新執行緒去執行 `run()`；直接呼叫 `run()` 只是在目前執行緒執行一個普通方法，沒有任何並行。同一個 `Thread` 物件呼叫兩次 `start()` 會拋 `IllegalThreadStateException`。

## 執行緒狀態

| 狀態 | 說明 | 進入方式 |
| --- | --- | --- |
| `NEW` | 建立但還沒 start | `new Thread()` |
| `RUNNABLE` | 可執行（包含正在執行和等待 CPU） | `start()` |
| `BLOCKED` | 等待進入 `synchronized` 區塊 | 鎖被別人持有 |
| `WAITING` | 無限期等待被喚醒 | `wait()`、`join()`、`LockSupport.park()` |
| `TIMED_WAITING` | 有時間限制的等待 | `sleep(n)`、`wait(n)`、`join(n)` |
| `TERMINATED` | 執行結束 | `run()` 結束或拋出例外 |

看 thread dump 時要注意：

- 等待 `ReentrantLock` 的執行緒狀態是 `WAITING`（底層是 `LockSupport.park`），不是 `BLOCKED`。
- 執行緒在做阻塞 I/O（例如等 socket 回應）時，Java 層看到的狀態仍是 `RUNNABLE`。

## `sleep()` 與 `wait()`

| | `Thread.sleep()` | `Object.wait()` |
| --- | --- | --- |
| 所屬 | `Thread` 的靜態方法 | `Object` 的方法 |
| 釋放鎖 | **不釋放** | **釋放** |
| 使用條件 | 任何地方 | 必須在 `synchronized` 區塊內，否則拋 `IllegalMonitorStateException` |
| 喚醒 | 時間到 | `notify()`、`notifyAll()` 或時間到 |
| 用途 | 暫停 | 執行緒間的協調 |

`wait()` 一定要放在 **`while` 迴圈**裡，因為可能發生「虛假喚醒（spurious wakeup）」，或被喚醒時條件已被其他執行緒改變：

```java
synchronized (lock) {
    while (!condition) {   // 不能用 if
        lock.wait();
    }
    // 條件成立，處理
}
```

`notify` 隨機喚醒一個等待的執行緒，如果喚醒的是不相關的執行緒，可能造成所有人都在等待。除非很確定，否則用 `notifyAll`。

## 如何正確停止執行緒

**不要用 `Thread.stop()`**（已廢棄，Java 20 起直接拋例外），它會讓執行緒在任意位置停止並釋放所有鎖，資料可能處於不一致的狀態。

正確做法是**中斷（interrupt）協作機制**：

```java
Thread worker = new Thread(() -> {
    while (!Thread.currentThread().isInterrupted()) {
        try {
            processNext();
            Thread.sleep(1000);
        } catch (InterruptedException e) {
            // sleep、wait、join 被中斷時會拋例外，並且清除中斷旗標
            Thread.currentThread().interrupt();   // 重新設定旗標，讓 while 條件看得到
        }
    }
    cleanup();
});
worker.start();
// ...
worker.interrupt();
```

執行緒池則用 `shutdown()`（不接新任務，等已提交的執行完）或 `shutdownNow()`（對所有工作執行緒呼叫 `interrupt()`，並回傳還沒執行的任務），再用 `awaitTermination` 等待。
