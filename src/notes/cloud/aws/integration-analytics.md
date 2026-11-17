# 整合與分析：訊息、串流與資料分析

> 解耦的目的是讓上游不必等下游：訊息服務負責「緩衝與分發」，分析服務負責「把累積的資料變成答案」。

## 訊息與整合服務

| 服務 | 模式 | 重點 | 題目訊號 |
| --- | --- | --- | --- |
| SQS Standard | 佇列，消費者拉取 | 至少一次、不保證順序、吞吐近乎無上限 | 解耦、緩衝突發流量、依佇列長度擴縮 worker |
| SQS FIFO | 佇列 | 嚴格順序、不重複；見下方吞吐說明 | 訂單順序、不可重複處理 |
| SNS | 發布訂閱，主動推送 | 一對多、可依屬性過濾 | 一個事件通知多個系統；SNS 後接多個 SQS |
| EventBridge | 事件匯流排 | 依事件內容路由、支援 SaaS 來源與排程 | AWS 服務事件、第三方 SaaS、cron |
| Kinesis Data Streams | 串流 | 即時、可重播、分片內有序、保留 24 小時到 365 天 | 點擊流、即時分析、多個消費者 |
| Data Firehose | 串流傳遞 | 近即時、全受管、無重播 | 把串流「載入」S3、Redshift、OpenSearch |
| Managed Service for Apache Flink | 串流運算 | 對串流做即時彙總與時間視窗 | 即時異常偵測、即時統計 |
| Amazon MQ | 訊息代理 | ActiveMQ、RabbitMQ；支援 MQTT、AMQP、JMS | 既有應用搬遷、不想改程式 |
| MSK | 受管 Kafka | 與開源 Kafka 相容 | 已經在用 Kafka |
| Step Functions | 工作流程 | 狀態機、重試、人工核准；Standard 最長 1 年，Express 適合高量短流程 | 協調多個 Lambda、長流程 |
| AppFlow | SaaS 資料整合 | Salesforce、SAP 等與 S3、Redshift 互傳 | 定期同步 SaaS 資料 |

### SQS 設定與吞吐

| SQS 設定 | 作用 |
| --- | --- |
| Visibility Timeout | 預設 30 秒；處理時間較長就調高，避免同一訊息被重複處理 |
| Dead-Letter Queue | 失敗達指定次數後移出，方便排查 |
| Long Polling | 減少空輪詢次數與費用 |
| Delay Queue | 訊息延後一段時間才可見 |

FIFO 吞吐：依官方文件，**預設每個 API 動作每秒 300 筆，批次可到 3,000 筆**；啟用 **High Throughput 模式**後上限大幅提高（官方列出 Region 間不同，最高為每秒 70,000 筆、批次 700,000 筆），實際值依 Region 而定，需要時以 Service Quotas 申請。考試與多數教材仍以 300／3,000 為基準。

### 怎麼選

| 情境 | 選擇 | 原因 |
| --- | --- | --- |
| 一個事件要通知多個下游 | SNS → 多個 SQS（fan-out） | 每個下游有自己的佇列，互不影響、可各自重試 |
| 要重播歷史事件、多個消費者各讀一遍 | Kinesis Data Streams | SQS 訊息處理完就刪除，無法重播 |
| 只想把串流存進 S3 | Data Firehose | 全受管、免寫消費者程式 |
| 依事件內容路由、接 SaaS | EventBridge | 規則比對事件內容 |
| 多步驟流程、需要重試與人工核准 | Step Functions | 狀態機明確呈現流程 |

## 分析與資料處理

| 服務 | 一句話辨識 |
| --- | --- |
| Athena | 無伺服器，用 SQL 直接查 S3，按掃描量計費 |
| Redshift | 欄式資料倉儲；Spectrum 可直接查 S3 上的資料 |
| EMR | 受管的 Hadoop、Spark 叢集 |
| Glue | 無伺服器 ETL；Crawler 建立 Data Catalog，供 Athena、Redshift、EMR 共用 |
| Lake Formation | 建立資料湖並做到欄、列層級的權限控管 |
| QuickSight | BI 儀表板，SPICE 為記憶體內引擎 |
| OpenSearch | 搜尋與日誌分析，內建儀表板 |

**Athena 省錢又變快**：把資料轉成 Parquet 或 ORC 欄式格式，並做分割（partition）與壓縮，讓每次查詢掃描的資料量變少。

典型管線：

```text
Kinesis Data Streams → Data Firehose → S3 → Glue（編目與轉換）→ Athena（查詢）→ QuickSight（呈現）
```

## 自測

| 題目關鍵字 | 優先想到 |
| --- | --- |
| 解耦、緩衝突發流量 | SQS |
| 一個事件通知多個系統 | SNS 後接多個 SQS |
| 嚴格順序、不可重複 | SQS FIFO |
| 即時串流、要能重播 | Kinesis Data Streams |
| 把串流載入 S3 或 Redshift | Data Firehose |
| 協調多步驟流程、人工核准 | Step Functions |
| 用 SQL 直接查 S3 | Athena |
| 既有 RabbitMQ／ActiveMQ 不想改程式 | Amazon MQ |

## 資料來源

- [Amazon SQS message quotas](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/quotas-messages.html)：FIFO 預設與 High Throughput 模式的吞吐
- 其餘為個人 SAA-C03 學習筆記整理。
