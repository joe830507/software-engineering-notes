# 死結與虛擬執行緒

## 死結

四個必要條件（缺一就不會死結）：

1. **互斥**：資源一次只能被一個執行緒使用。
2. **持有並等待**：持有一個資源，同時等待另一個資源。
3. **不可搶奪**：資源只能由持有者主動釋放。
4. **循環等待**：A 等 B 的資源，B 等 A 的資源。

典型死結：兩個執行緒以相反的順序取得鎖。

```java
void transfer(Account from, Account to, BigDecimal amt) {
    synchronized (from) {
        synchronized (to) {
            from.debit(amt);
            to.credit(amt);
        }
    }
}
// 執行緒 1：transfer(a, b)，執行緒 2：transfer(b, a) → 可能死結
```

解法：固定取得鎖的順序，破壞「循環等待」。

```java
void transferSafe(Account from, Account to, BigDecimal amt) {
    Account first  = from.getId() < to.getId() ? from : to;
    Account second = first == from ? to : from;
    synchronized (first) {
        synchronized (second) {
            from.debit(amt);
            to.credit(amt);
        }
    }
}
```

避免方法：固定加鎖順序、用 `tryLock` 加逾時、縮小鎖的範圍、避免在持有鎖時呼叫外部方法（不知道它會不會再去拿別的鎖）。

排查：`jstack <pid>` 或 `jcmd <pid> Thread.print`，輸出最後會直接列出 `Found one Java-level deadlock`，並顯示哪些執行緒在等哪把鎖。

資料庫的死結是同樣的原理：兩個交易以不同順序更新同一組資料列。Oracle 會偵測並讓其中一個交易拋 `ORA-00060`。解法一樣是**統一更新順序**，例如批次更新前先依主鍵排序。

## 虛擬執行緒（Java 21）

虛擬執行緒是 JVM 管理的輕量級執行緒，不是一對一對應作業系統執行緒。建立成本很低，可以同時有幾十萬、上百萬個。當虛擬執行緒執行阻塞 I/O 時，JVM 會把它從底層的平台執行緒（carrier thread）上卸下，讓 carrier 去執行其他虛擬執行緒，所以可以用**同步阻塞的寫法**得到接近非同步的吞吐量。

```java
try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
    for (String id : ids) {
        executor.submit(() -> callRemoteService(id));   // 每個任務一個虛擬執行緒
    }
}   // close() 會等待所有任務完成
```

- **適合**：大量 I/O 等待的工作，例如一個請求要呼叫多個外部服務。
- **不適合**：CPU 密集的計算，虛擬執行緒不會讓 CPU 變多。

注意事項：

1. **不要池化虛擬執行緒**：它很便宜，每個任務建一個就好。要限制並行數量（例如保護 DB）用 `Semaphore`，不是用執行緒池大小。
2. **Pinning**：Java 21～23 中，虛擬執行緒在 `synchronized` 區塊內阻塞時，會「釘住」carrier thread 無法卸下，大量發生時吞吐量大幅下降。當時的建議是把長時間持有的 `synchronized` 改成 `ReentrantLock`。**Java 24（JEP 491）已解決 `synchronized` 的 pinning**。呼叫 native 方法時仍會 pinning。
3. **ThreadLocal**：每個虛擬執行緒有自己的 ThreadLocal，數量龐大時，在 ThreadLocal 裡放大物件（例如快取）會吃掉大量記憶體。新的替代方案是 Scoped Values（Java 25 正式版）。
4. **下游資源仍有上限**：虛擬執行緒可以開一百萬個，DB 連線池不會因此變大，要注意連線池耗盡和下游被打爆。
5. Spring Boot 3.2 起可用 `spring.threads.virtual.enabled=true` 讓 Tomcat 用虛擬執行緒處理請求。
