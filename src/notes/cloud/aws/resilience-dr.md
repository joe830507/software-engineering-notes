# 韌性與災難復原

> 韌性題先分清楚要的是**高可用**（撐過 AZ 故障）、**災難復原**（撐過 Region 故障）還是**解耦**（撐過下游變慢），三者的答案不同。

## 三個層次

| 目標 | 撐過什麼 | 主要手段 |
| --- | --- | --- |
| 高可用（HA） | 單一 AZ 故障 | 跨 AZ 部署：ASG、ELB、RDS Multi-AZ、Aurora |
| 災難復原（DR） | 整個 Region 故障 | 跨 Region 複寫與備援環境：Aurora Global Database、S3 複寫、Route 53 Failover |
| 解耦 | 下游變慢或暫時失敗 | SQS、SNS、EventBridge、重試與 DLQ |

資源各落在哪一層（單一 AZ、Region、全球）見總覽頁的「各資源的作用範圍」。

## RPO 與 RTO

| 指標 | 意義 | 決定什麼 |
| --- | --- | --- |
| RPO（Recovery Point Objective） | 可容忍**遺失多少資料**（時間） | 資料複寫或備份的頻率 |
| RTO（Recovery Time Objective） | 可容忍**停機多久** | 備援環境準備到多熱 |

兩者越小，成本越高。先由商業需求定出 RPO／RTO，再選對應的策略，而不是反過來。

## 災難復原策略

| 策略 | 典型 RPO（資料遺失時間） | 典型 RTO（復原耗時） | 平時在備援 Region 做什麼 | 成本 |
| --- | --- | --- | --- | --- |
| Backup and Restore | 小時級 | 小時級，目標可為 24 小時內 | 保留備份，災難時重建與還原 | 最低 |
| Pilot Light | 分鐘級 | 數十分鐘 | 核心資料與複寫服務持續運作，應用運算資源關閉或尚未部署 | 低 |
| Warm Standby | 秒級 | 分鐘級 | 縮小版完整環境持續運作，災難時擴容 | 中 |
| Multi-Site Active-Active | 接近零 | 可接近零 | 多個 Region 同時提供服務，處理資料同步與寫入衝突 | 最高 |

以上是典型規劃目標，**不是 SLA 或保證值**。RPO 取決於備份頻率與複寫延遲；RTO 取決於故障偵測、重建、還原、切換與驗證耗時，需以演練確認。連續備份與 PITR 也可能讓 Backup and Restore 的 RPO 降至分鐘級。

Elastic Disaster Recovery（DRS）以區塊層級持續複寫伺服器，適合把 on-prem 或其他雲的機器做成 Pilot Light。

## 各層的韌性元件

| 層 | 元件 | 重點 |
| --- | --- | --- |
| 入口 | Route 53 Failover、Global Accelerator | DNS 受 TTL 影響；Global Accelerator 可秒級切換 |
| 運算 | ASG 跨 AZ、ELB 健康檢查 | ASG 健康檢查類型設成 ELB |
| 資料庫 | RDS Multi-AZ、Aurora、Aurora Global Database、DynamoDB Global Tables | 見資料庫頁 |
| 儲存 | S3 CRR、EBS 快照跨 Region、AWS Backup | S3 複寫要先開 Versioning |
| 連線 | 兩條 Direct Connect 或 DX 加 VPN | 最高韌性是不同地點的兩條專線 |
| 解耦 | SQS、DLQ、Step Functions | 失敗時有重試與落點 |

## 常見陷阱

| 陷阱 | 正確觀念 |
| --- | --- |
| 所有 NAT Gateway 都是單一 AZ | Zonal NAT 是單一 AZ，通常每個 AZ 各建一個；Regional NAT 可跨 AZ 自動擴展，仍需考量新 AZ 的擴展時間 |
| Route 53 Failover 能秒級切換 | 受用戶端與解析器的 TTL 快取影響；要秒級選 Global Accelerator |
| S3 複寫能搬舊資料 | 既有物件不會自動複寫，要用 Batch Replication |
| SSE-KMS 物件會被複寫 | 預設不複寫，要在規則中另外開啟並授權目的端 KMS key |
| 複寫可以連鎖 | A 到 B、B 到 C，A 的物件不會到 C |
| 備援 RDS 可以讀 | Multi-AZ（DB instance）的備援執行個體不能讀取；要讀請用 Read Replica 或 Multi-AZ DB cluster |
| 所有 Multi-AZ 都不能擴展讀取 | DB instance 的 standby 不能讀；Multi-AZ DB cluster 有兩個可讀 reader，可兼顧高可用與讀取容量 |

## 自測

| 題目關鍵字 | 優先想到 |
| --- | --- |
| 撐過 AZ 故障 | 跨 AZ：Multi-AZ、ASG 加 ELB |
| 跨 Region 災難復原、RPO 秒級 | Aurora Global Database、DynamoDB Global Tables |
| 平時成本最低、可接受小時級復原 | Backup and Restore |
| 資料持續複寫、機器平時關閉 | Pilot Light |
| 接近零停機 | Multi-Site Active-Active |
| 主備切換 | Route 53 Failover 加健康檢查 |
| 固定 IP、秒級跨 Region 容錯 | Global Accelerator |
| 集中管理跨服務備份 | AWS Backup |

## 資料來源

個人 SAA-C03 學習筆記整理；DR 策略的分類對應 AWS Well-Architected Reliability Pillar 的災難復原建議。

- [Regional NAT gateways](https://docs.aws.amazon.com/vpc/latest/userguide/nat-gateways-regional.html)：跨 AZ 自動擴展。
- [Multi-AZ DB cluster deployments](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/multi-az-db-clusters-concepts.html)：可讀取的 reader 與高可用架構。
- 上述 NAT 與 Multi-AZ 說明於 2026-11-17 核對。
- [REL13-BP02：災難復原策略](https://docs.aws.amazon.com/wellarchitected/latest/framework/rel_planning_for_recovery_disaster_recovery.html)：典型 RPO／RTO 與適用條件（2026-11-17 核對）。
