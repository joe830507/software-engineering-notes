# JVM 排查與調校

## 常見的 OutOfMemoryError

| 訊息 | 原因 | 方向 |
| --- | --- | --- |
| `Java heap space` | 堆積放不下 | 記憶體洩漏，或資料量太大（一次讀整個檔案、一次查全部資料） |
| `GC overhead limit exceeded` | 花超過 98% 時間 GC，卻只回收不到 2% 記憶體 | 通常也是洩漏 |
| `Metaspace` | 類別太多 | 動態產生大量類別（代理、Groovy 腳本）、類別載入器洩漏（反覆熱部署） |
| `unable to create native thread` | 無法再建立作業系統執行緒 | 執行緒建太多（沒用執行緒池、執行緒池無上限）、OS 的使用者程序數限制 |
| `Direct buffer memory` | 直接記憶體耗盡 | NIO、Netty 的 buffer 沒有釋放 |
| `Requested array size exceeds VM limit` | 陣列太大 | 程式錯誤 |

`StackOverflowError` 是 `Error` 但不是 OOM，通常是遞迴沒有終止條件，或遞迴太深（例如很深的 JSON 結構、循環參考的 `toString`）。

## 常用的 JVM 參數

```bash
# 堆積大小：伺服器上通常設成相同，避免動態調整
-Xms4g -Xmx4g

# 每個執行緒的堆疊大小
-Xss512k

# Metaspace 上限
-XX:MaxMetaspaceSize=512m

# 使用 G1、設定停頓目標
-XX:+UseG1GC -XX:MaxGCPauseMillis=200

# OOM 時自動產生 heap dump（正式環境一定要設）
-XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/data/dump/

# GC 日誌（Java 9 起的統一日誌格式）
-Xlog:gc*:file=/data/logs/gc.log:time,uptime:filecount=10,filesize=50m

# 容器環境：依容器的記憶體限制比例設定堆積（Java 10 起支援容器偵測）
-XX:MaxRAMPercentage=75.0
```

## 排查工具

| 工具 | 用途 |
| --- | --- |
| `jps -l` | 列出 Java 程序和 PID |
| `jstack <pid>` | thread dump：看執行緒在做什麼、死結、卡住的地方 |
| `jmap -heap <pid>`（Java 8）／`jhsdb jmap --heap --pid <pid>` | 堆積使用概況 |
| `jmap -histo:live <pid>` | 各類別的實例數量和大小（**會觸發 Full GC**） |
| `jmap -dump:live,format=b,file=heap.hprof <pid>` | 產生 heap dump（會暫停應用程式，大堆積要很久） |
| `jstat -gcutil <pid> 1000` | 每秒印出各區使用率、GC 次數和耗時 |
| `jcmd <pid> ...` | 新版整合工具：`Thread.print`、`GC.heap_dump`、`GC.class_histogram`、`VM.flags`、`JFR.start` |
| **JFR + JMC** | Java Flight Recorder，低開銷的持續性能記錄，正式環境可用 |
| **Eclipse MAT** | 分析 heap dump，找出佔用最多記憶體的物件與 GC Root 路徑 |
| **Arthas** | 阿里巴巴開源，線上即時診斷：看方法參數與回傳值、耗時、反編譯、熱更新 |
| VisualVM | 圖形化監控 |

## JIT 編譯

JVM 一開始用**直譯器**逐行執行位元組碼，同時統計每個方法的執行次數。執行次數多的「熱點」程式碼會被 **JIT（Just-In-Time）編譯器**編譯成機器碼並快取，之後直接執行機器碼。

HotSpot 有兩個編譯器：**C1**（編譯快、最佳化較少）和 **C2**（編譯慢、最佳化程度高）。預設使用**分層編譯**：先直譯，再用 C1 編譯，最熱的程式碼再用 C2 重新編譯。

JIT 會做的最佳化：方法內聯、迴圈展開、逃逸分析、去除無用程式碼、鎖消除。

這也是 Java 應用**剛啟動時比較慢**的原因（需要暖機），做效能測試時要先跑一段時間再量測。GraalVM Native Image、CDS 這類技術就是想解決這個問題。

## 逃逸分析

JIT 分析一個物件的作用範圍：如果物件只在方法內使用，沒有被回傳、沒有被存到欄位、沒有傳給其他執行緒，就是「沒有逃逸」。對沒有逃逸的物件可以：

1. **純量替換**：不建立物件，把物件的欄位拆成區域變數，直接放在堆疊或暫存器上。所以「物件一定配置在堆積」嚴格說不完全正確。
2. **鎖消除**：物件只有一個執行緒會用到，對它的 `synchronized` 可以移除，例如方法內部使用的 `StringBuffer`。

預設開啟（`-XX:+DoEscapeAnalysis`）。
