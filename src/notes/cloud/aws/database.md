# 資料庫與備份

> 資料庫選型看「資料模型、規模、延遲、一致性」；備援看「要撐過 AZ 還是 Region」。

## 資料庫選型

| 需求 | 選擇 |
| --- | --- |
| 關聯式、沿用既有引擎 | RDS |
| 關聯式、雲原生高效能與高可用 | Aurora；負載不可預期時用 Aurora Serverless v2 |
| Key-value、個位數毫秒、無伺服器、可無限擴展 | DynamoDB |
| DynamoDB 要微秒級讀取 | DAX |
| 快取、Session、排行榜 | ElastiCache |
| 與 MongoDB 相容 | DocumentDB |
| 資料倉儲、複雜分析查詢 | Redshift |
| 全文檢索、日誌分析 | OpenSearch |
| 圖形資料 | Neptune |
| 與 Cassandra 相容 | Keyspaces |

**Aurora Serverless v2** 依負載在 ACU（Aurora Capacity Unit）範圍內自動調整容量；2024 年 11 月起最小容量可設為 0 ACU，閒置一段時間後自動暫停，暫停期間不收運算費，有新連線時再恢復（恢復需要等待，適合開發測試、不適合嚴格低延遲的正式流量）。

| ElastiCache 引擎 | 特性 |
| --- | --- |
| Redis、Valkey | 複寫、Multi-AZ、可持久化、Sorted Set、Pub/Sub |
| Memcached | 多執行緒、純快取、無複寫、無持久化 |

## 備援與讀寫擴展

| 功能 | 目的 | 複寫 | 重點 |
| --- | --- | --- | --- |
| RDS Multi-AZ（DB instance） | 高可用 | 同步 | 自動容錯移轉、端點不變、備援執行個體不能讀取 |
| RDS Multi-AZ DB cluster | 高可用兼讀取 | 半同步 | 一個 writer 加兩個可讀取的 reader，分在 3 個 AZ；容錯移轉通常 35 秒內 |
| RDS Read Replica | 讀取擴展 | 非同步 | 可跨 Region、可升級成獨立資料庫、應用要改用 replica 端點 |
| Aurora | 兩者兼具 | 儲存層 6 份、跨 3 個 AZ | 最多 15 個 replica、reader endpoint 自動分流、容錯移轉通常 30 秒內 |
| Aurora Global Database | 跨 Region 災難復原與就近讀取 | 儲存層複寫，延遲通常低於 1 秒 | 次要 Region 約 1 分鐘內可升級為主要 |
| DynamoDB Global Tables | 多 Region 同時讀寫 | 非同步（預設最終一致） | Active-active，需要啟用 Streams；另有 MRSC 模式，見下 |
| ElastiCache Multi-AZ | 快取高可用 | 非同步 | 主節點故障時自動升級 replica |

**先分辨部署型態：Multi-AZ DB instance 的 standby 只做備援、不能讀；Multi-AZ DB cluster 的兩個 reader 則可承接讀取。** Read Replica 是另一種讀取擴展與複寫機制，不能直接等同於 Multi-AZ 的自動容錯移轉。選型時同時核對高可用、讀取容量與跨 Region 需求。

DynamoDB Global Tables 預設是最終一致的多 Region active-active。2025 年 6 月起另提供 **MRSC（Multi-Region Strong Consistency）** 模式：可在任一 Region 讀到最新資料、RPO 為零，代價是寫入要跨 Region 確認、延遲較高；正式推出時只支援部分 Region，使用前請查最新的支援清單。

### RDS Proxy

放在應用與資料庫之間的**受管連線池**：

- 共用並重用連線，解決大量 Lambda 同時連線把資料庫連線數耗盡的問題。
- 容錯移轉時保留用戶端連線、縮短切換時間。
- 可強制使用 IAM 驗證，資料庫憑證存在 Secrets Manager。

## DynamoDB 重點

| 項目 | 重點 |
| --- | --- |
| LSI | 相同 partition key、不同 sort key；只能在建表時建立；共用資料表容量；可強一致讀取 |
| GSI | 不同的 partition key 與 sort key；隨時可建；容量獨立；只有最終一致 |
| DAX | 記憶體內快取，應用幾乎不用改；適合讀多、可接受最終一致的場景 |
| Streams | 項目層級的變更紀錄，保留 24 小時，可觸發 Lambda |
| TTL | 到期自動刪除項目，不耗寫入容量 |
| On-demand 容量 | 負載不可預期或剛上線 |
| Provisioned 加 Auto Scaling | 負載穩定可預期，單價較低 |

## 備份

| 項目 | 重點 |
| --- | --- |
| RDS 自動備份 | 可還原到任一時間點，保留最長 35 天；還原會建立**新的**執行個體 |
| RDS 手動快照 | 不會過期，可跨 Region、跨帳號複製 |
| DynamoDB PITR | 連續備份，可還原到 35 天內任一秒 |
| EBS 快照 | 增量、存於 S3；可用 Data Lifecycle Manager 排程 |
| AWS Backup | 跨服務集中排程與保留政策，可跨 Region、跨帳號複製，Vault Lock 防刪除 |

## 自測

| 題目關鍵字 | 優先想到 |
| --- | --- |
| 資料庫高可用、自動容錯移轉 | RDS Multi-AZ 或 Aurora |
| 資料庫讀取壓力大、重複查詢 | Read Replica、ElastiCache |
| Lambda 耗盡資料庫連線 | RDS Proxy |
| 跨 Region 災難復原、RPO 秒級 | Aurora Global Database、DynamoDB Global Tables |
| DynamoDB 微秒級讀取 | DAX |
| 排行榜、Session | ElastiCache Redis |
| 集中管理跨服務備份 | AWS Backup |
| 開發測試資料庫夜間閒置 | Aurora Serverless v2（可縮到 0 ACU） |

## 資料來源

- [Multi-AZ DB cluster deployments for Amazon RDS](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/multi-az-db-clusters-concepts.html)：半同步複寫、一個 writer 加兩個 reader 分在 3 個 AZ
- [Failing over a Multi-AZ DB cluster](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/multi-az-db-clusters-concepts-failover.html)：容錯移轉通常 35 秒內
- [Scaling to Zero ACUs with automatic pause and resume](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-serverless-v2-auto-pause.html)：Aurora Serverless v2 縮到 0
- [DynamoDB global tables with multi-Region strong consistency 正式推出](https://aws.amazon.com/about-aws/whats-new/2025/06/amazon-dynamo-db-global-tables-multi-region-strong-consistency-generally-available)：MRSC
- 其餘為個人 SAA-C03 學習筆記整理。
