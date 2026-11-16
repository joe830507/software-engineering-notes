# JVM 記憶體與類別載入

## 執行時期記憶體區域

| 區域 | 執行緒共享 | 存放 | 可能的錯誤 |
| --- | --- | --- | --- |
| **堆積（Heap）** | 共享 | 物件實例、陣列；字串常數池（Java 7 起） | `OutOfMemoryError: Java heap space` |
| **方法區**（Java 8 起實作為 **Metaspace**，在本機記憶體） | 共享 | 類別的結構資訊、方法位元碼、執行時期常數池 | `OutOfMemoryError: Metaspace` |
| **虛擬機堆疊** | 每執行緒 | 堆疊框：區域變數、運算元堆疊、方法回傳位址 | `StackOverflowError`（太深的遞迴） |
| **本機方法堆疊** | 每執行緒 | native 方法使用 | 同上 |
| **程式計數器** | 每執行緒 | 目前執行的位元碼位址 | 唯一不會 OOM 的區域 |

另外有**直接記憶體**（Direct Memory），不屬於 JVM 規範。NIO 的 `ByteBuffer.allocateDirect` 和 Netty 會用到，用 `-XX:MaxDirectMemorySize` 限制，耗盡時是 `OutOfMemoryError: Direct buffer memory`。

Java 8 用 Metaspace 取代 PermGen 的原因：HotSpot 的 PermGen 有容量上限，也能在設定範圍內調整大小；動態產生大量類別（CGLIB 代理、JSP 重新編譯、反覆熱部署）很容易爆；Metaspace 使用本機記憶體，預設只受實體記憶體限制，可以用 `-XX:MaxMetaspaceSize` 設上限。

區域變數存在哪裡：基本型別的區域變數和物件的**參考**存在堆疊上，物件本身在堆積上（逃逸分析最佳化後例外）。

## 物件建立的過程

`new` 的流程：

1. **類別載入檢查**：類別還沒載入就先載入。
2. **配置記憶體**：堆積規整時用「指標碰撞」，不規整時用「空閒清單」。多執行緒同時配置靠 **TLAB**（每個執行緒在 Eden 區有自己的一小塊配置緩衝區）避免競爭。
3. **初始化零值**：所有欄位設成預設值。
4. **設定物件標頭**：Mark Word、類別指標。
5. **執行 `<init>`**：欄位初始值、實例區塊、建構子。

物件的記憶體佈局（64 位元 JVM）：

- **物件標頭**：Mark Word（hashCode、GC 年齡、鎖狀態）、類別指標（開啟壓縮指標時 4 bytes），陣列還有 4 bytes 的長度。
- **實例資料**：欄位。
- **對齊填充**：物件大小補到 8 bytes 的倍數。

所以 `new Object()` 是 16 bytes。一個 `Integer` 也是 16 bytes，是 `int` 的 4 倍，這就是大量裝箱很浪費記憶體的原因。

## 類別載入的過程

1. **載入**：依完整類別名稱找到 `.class` 位元組，在 Metaspace 建立類別結構，在堆積建立對應的 `Class` 物件。
2. **連結**：
   - **驗證**：確認位元組碼格式正確、不會危害 JVM。
   - **準備**：為**靜態變數**配置記憶體並設成**零值**（`static int x = 10;` 這時 x 是 0）。`static final` 的編譯時期常數這時直接是最終值。
   - **解析**：把常數池中的符號參考轉成直接參考，可延後到第一次使用時。
3. **初始化**：執行 `<clinit>`，也就是靜態變數的賦值和靜態區塊（這時 x 才變成 10）。JVM 保證 `<clinit>` 在多執行緒下只執行一次，這是靜態內部類別單例執行緒安全的原因。

會觸發初始化：`new`、讀寫靜態欄位（編譯時期常數除外）、呼叫靜態方法、反射、初始化子類別時先初始化父類別、`main` 所在的類別。

不會觸發：透過子類別參考父類別的靜態欄位（只初始化父類別）、建立該類別的陣列、使用編譯時期常數。

## 雙親委派模型

類別載入器的階層（Java 9 以後）：

1. **Bootstrap ClassLoader**：C++ 實作，載入 `java.base` 等核心模組。
2. **Platform ClassLoader**：載入其他平台模組（Java 8 以前是 Extension ClassLoader）。
3. **Application ClassLoader**：載入 classpath 上的應用程式類別。
4. 自訂 ClassLoader。

類別載入器收到請求時，**先委派給父載入器**，父載入器無法載入時才由自己載入：

```java
protected Class<?> loadClass(String name, boolean resolve) {
    synchronized (getClassLoadingLock(name)) {
        Class<?> c = findLoadedClass(name);       // 1. 已經載入過？
        if (c == null) {
            try {
                c = (parent != null)
                        ? parent.loadClass(name, false)   // 2. 先交給父載入器
                        : findBootstrapClassOrNull(name);
            } catch (ClassNotFoundException ignored) {}
            if (c == null) {
                c = findClass(name);              // 3. 父載入器找不到才自己找
            }
        }
        return c;
    }
}
```

為什麼這樣設計：

1. **安全**：自己寫一個 `java.lang.String` 也不會取代核心類別，因為請求一定先到 Bootstrap。
2. **避免重複載入**：JVM 判斷兩個類別是否相同，要「類別名稱相同**而且**載入器相同」。

打破雙親委派的情況：

- **SPI（例如 JDBC）**：`DriverManager` 由 Bootstrap 載入，但資料庫驅動在 classpath 上 Bootstrap 看不到。解法是用**執行緒上下文類別載入器**（`Thread.getContextClassLoader()`）反過來請下層載入。
- **Tomcat / WebLogic**：每個 Web 應用有自己的類別載入器，**優先載入自己 `WEB-INF` 裡的類別**，讓不同應用可以用不同版本的同一套函式庫。
- **熱部署**：丟掉舊的類別載入器，用新的重新載入。
- **OSGi**：網狀的類別載入結構。

常見問題：

- `ClassNotFoundException`：找不到類別。
- `NoClassDefFoundError`：編譯時有、執行時找不到，或靜態初始化失敗過。
- `ClassCastException: X cannot be cast to X`：同名類別被不同載入器載入，常見於應用伺服器的函式庫衝突。
