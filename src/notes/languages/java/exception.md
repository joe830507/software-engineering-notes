# 例外處理


## 例外體系

```
Throwable
├── Error                      嚴重錯誤，程式通常無法處理
│   ├── OutOfMemoryError
│   └── StackOverflowError
└── Exception
    ├── RuntimeException       unchecked：不強制處理
    │   ├── NullPointerException
    │   ├── IllegalArgumentException
    │   ├── IllegalStateException
    │   ├── IndexOutOfBoundsException
    │   ├── ClassCastException
    │   └── ArithmeticException
    └── 其他 Exception           checked：編譯器強制 catch 或 throws
        ├── IOException
        └── SQLException
```

- **Checked**：代表「呼叫端可以合理處理」的情況，例如檔案不存在。
- **Unchecked**：通常代表程式錯誤，例如 null、參數錯誤。
- Spring 把 `SQLException` 轉成 unchecked 的 `DataAccessException`，因為大部分情況呼叫端無法處理，強制 catch 只會產生一堆空的 catch。

## `final`、`finally`、`finalize`

- `final`：修飾類別不能被繼承、方法不能被覆寫、變數只能賦值一次。
- `finally`：`try` 後一定會執行的區塊，用來釋放資源。例外：`System.exit()`、JVM 當掉、執行緒被殺。
- `finalize`：GC 前可能被呼叫，時間不確定、拖慢 GC，Java 9 起 deprecated。釋放資源要用 try-with-resources 或 `Cleaner`。

## 最佳實踐

1. **不要吞掉例外**：`catch (Exception e) {}` 是最常見的壞習慣。
2. **包裝時保留原因**：`throw new BizException("出單失敗", e);`，不要只傳 `e.getMessage()`。
3. **不要用例外控制流程**：建立堆疊的成本高。
4. **catch 具體的例外**，不要一律 catch `Exception`。
5. **記錄日誌和往外拋擇一**：每一層都 log 同一個例外，日誌會重複好幾份。
6. **`InterruptedException` 不能吞**：要呼叫 `Thread.currentThread().interrupt()` 恢復中斷狀態，或往外拋。
7. **資源用 try-with-resources**。

## `finally` 裡的 `return`

```java
int test() {
    int x = 1;
    try {
        return x;      // 回傳值 1 先被暫存起來
    } finally {
        x = 2;         // 不影響已暫存的回傳值
    }
}   // 回傳 1

int test2() {
    try {
        throw new RuntimeException("boom");
    } finally {
        return 2;      // 蓋掉 try 的結果，連例外都被吞掉
    }
}   // 回傳 2，例外消失
```

不要在 `finally` 裡寫 `return`，也不要拋例外。

## try-with-resources

實作 `AutoCloseable` 的資源宣告在 `try (...)` 中，結束時會**依宣告的相反順序**自動呼叫 `close()`。

```java
try (Connection conn = ds.getConnection();
     PreparedStatement ps = conn.prepareStatement(sql)) {
    // ...
}   // 先關 ps，再關 conn
```

如果 `try` 區塊拋出例外 A，`close()` 又拋出例外 B，最後拋出的是 **A**，B 被附加在 A 上，用 `A.getSuppressed()` 取得。舊式寫法在 `finally` 裡 close，B 會蓋掉 A，真正的原因就不見了。
