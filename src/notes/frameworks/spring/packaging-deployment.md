# 打包、部署與啟動效能

## 可執行 jar 與容器映像檔

### 可執行 jar 的結構

`./mvnw package` 產生的 jar 叫做「uber jar」或「fat jar」，裡面包含所有依賴：

```
app.jar
├── META-INF/MANIFEST.MF          # Main-Class 指向 Spring Boot 的啟動器
├── org/springframework/boot/loader/  # 啟動器：負責從巢狀 jar 載入類別
└── BOOT-INF/
    ├── classes/                  # 你的程式碼與 application.yml
    ├── lib/                      # 所有依賴的 jar
    ├── classpath.idx
    └── layers.idx                # 分層資訊，給 Docker 用
```

標準 Java 無法載入「jar 裡面的 jar」，所以 Spring Boot 自己寫了一個啟動器。`MANIFEST.MF` 的 `Main-Class` 是 `org.springframework.boot.loader.launch.JarLauncher`，你的主類別記錄在 `Start-Class`。

Boot 4 移除了兩個舊功能：「完全可執行的 jar」（可以直接 `./app.jar` 執行、當成 init.d 服務的那種），以及舊版的 classic loader。

### 容器映像檔

**分層**的概念：Docker 映像檔由多層組成，只有變動的層需要重新建置與上傳。依賴很少變動，程式碼經常變動，所以把它們分開，每次部署只需要推送幾百 KB 的程式碼層，而不是整個 80MB 的 jar。

來源的驗證專案實測，各層大小如下：

| 層 | 內容 | 大小 |
| --- | --- | --- |
| `dependencies` | 正式版的依賴 | 83 MB |
| `spring-boot-loader` | 啟動器 | 637 KB |
| `snapshot-dependencies` | SNAPSHOT 版本的依賴 | 0 |
| `application` | 你的程式碼與設定 | 195 KB |

用 `tools` 模式解開（Boot 4.1 已移除舊的 `layertools` 模式）：

```bash
java -Djarmode=tools -jar target/app.jar extract --layers --launcher --destination extracted
```

多階段建置的 Dockerfile：

```dockerfile
FROM eclipse-temurin:25-jre AS builder
WORKDIR /builder
COPY target/*.jar app.jar
RUN java -Djarmode=tools -jar app.jar extract --layers --launcher --destination extracted

FROM eclipse-temurin:25-jre
WORKDIR /app
RUN useradd --system --uid 1001 spring
USER spring
# 依變動頻率由低到高複製，讓前面的層可以被快取
COPY --from=builder /builder/extracted/dependencies/ ./
COPY --from=builder /builder/extracted/spring-boot-loader/ ./
COPY --from=builder /builder/extracted/snapshot-dependencies/ ./
COPY --from=builder /builder/extracted/application/ ./
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "org.springframework.boot.loader.launch.JarLauncher"]
```

重點：

- 不要用 root 執行。
- 用 `-XX:MaxRAMPercentage` 而不是寫死 `-Xmx`。JVM 會依容器的記憶體限制計算堆積大小。預設只用 25%，太保守；設 75% 左右，留空間給堆積以外的記憶體（執行緒堆疊、Metaspace、直接記憶體）。

不想寫 Dockerfile 的話，Cloud Native Buildpacks 可以直接產生分層良好的映像檔：

```bash
./mvnw spring-boot:build-image -Dspring-boot.build-image.imageName=myorg/app:1.0
```

## 加快啟動

### CDS

JVM 每次啟動都要讀取、解析、驗證幾千個類別。CDS（Class Data Sharing）把這些工作的結果存成一個檔案，下次啟動直接載入。Spring Boot 3.3 起對 CDS 有很好的支援。

```bash
# 1. 解開成「可執行 jar ＋ lib 目錄」的結構（不加 --layers）
java -Djarmode=tools -jar target/app.jar extract --destination application
cd application

# 2. 訓練：啟動到容器 refresh 完成就結束，並把載入過的類別存成 CDS 檔
java -XX:ArchiveClassesAtExit=application.jsa -Dspring.context.exit=onRefresh -jar app.jar

# 3. 之後每次啟動都使用這個檔案
java -XX:SharedArchiveFile=application.jsa -jar app.jar
```

來源在驗證專案上實測（JDK 21、Windows、含 JPA、Flyway、Security、Kafka 自動配置），各執行三次：

| 方式 | 啟動時間 |
| --- | --- |
| 一般啟動 | 5.53 到 5.66 秒 |
| 使用 CDS | 2.81 到 3.00 秒 |

大約快了一倍，完全不用改程式碼。代價是 CDS 檔案必須用**同一個 JDK、同一份 classpath** 產生，所以通常在建置 Docker 映像檔時執行訓練步驟。

JDK 24 起還有更進一步的 AOT cache（JEP 483），除了類別資料，還會快取類別的載入與連結結果。JDK 25（JEP 514）把它簡化成一步：訓練時加 `-XX:AOTCacheOutput=app.aot`，之後啟動加 `-XX:AOTCache=app.aot`。使用 JDK 25 的專案可以優先考慮它。

### GraalVM 原生映像檔

GraalVM 可以把 Java 應用程式預先編譯成原生執行檔，啟動時間降到幾十毫秒，記憶體也大幅減少。

```bash
./mvnw -Pnative native:compile
```

代價很大：

| 面向 | JVM | 原生映像檔 |
| --- | --- | --- |
| 啟動時間 | 秒級 | 毫秒級 |
| 記憶體 | 較高 | 較低 |
| 尖峰吞吐量 | 較高（JIT 會依實際執行情況最佳化） | 較低 |
| 建置時間 | 秒級 | 數分鐘，需要大量記憶體 |
| 反射、動態代理、資源檔 | 隨意使用 | 必須在建置時就知道，需要額外的提示設定 |
| 函式庫相容性 | 全部 | 部分函式庫不支援 |
| 除錯與分析工具 | 豐富 | 有限 |

Spring 的 AOT 引擎在建置時就把容器的設定「算好」，產生程式碼取代執行時的反射與掃描，這也是原生映像檔能運作的原因。代價是 `@Profile`、`@Conditional` 這類決策在建置時就固定了。

適合原生映像檔的情境：Serverless（冷啟動很重要）、命令列工具、需要極速擴展的服務。一般長時間執行的服務，用 JVM 加 CDS 或 AOT cache 通常是更平衡的選擇。

## 部署檢查清單

| 項目 | 做法 |
| --- | --- |
| 優雅關機 | 預設已開啟；Kubernetes 要設定 `preStop` 與 `terminationGracePeriodSeconds` |
| 探針 | liveness 打 `/actuator/health/liveness`，readiness 打 `/actuator/health/readiness`，不要檢查外部依賴；使用獨立管理埠時，改打主埠的 `/livez`、`/readyz` |
| 資源限制 | 設定記憶體 limit，JVM 用 `MaxRAMPercentage` |
| 設定 | 用環境變數與 Secret，映像檔中不含任何環境相關的設定 |
| 日誌 | 輸出到 stdout，用結構化格式 |
| 資料庫遷移 | Flyway 隨應用程式啟動執行，或在部署流程中獨立執行；schema 變更要向下相容 |
| 版本資訊 | 用 `spring-boot-maven-plugin` 的 `build-info` 目標與 `git-commit-id` 外掛，讓 `/actuator/info` 顯示版本與 commit |

面試時能說明為什麼映像檔要分層（只推送變動的層），以及原生映像檔的主要代價（建置慢、反射需提示、尖峰吞吐量較低）。
