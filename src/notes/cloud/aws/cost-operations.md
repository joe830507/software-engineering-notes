# 成本與維運

> 成本題的選項通常都能達成需求，要挑的是**滿足所有限制後最便宜**的那一個；維運題則是「出事前看得到、出事時留得下紀錄、重複的事用程式做」。

## 成本最佳化

EC2 的購買選項（On-Demand、RI、Savings Plans、Spot、Dedicated Host）見「運算」頁，S3 儲存類別與 Lifecycle 見「儲存」頁。這裡彙整**跨服務**的省錢做法。

| 情境 | 做法 |
| --- | --- |
| 私有子網路大量存取 S3 或 DynamoDB | 改用免費的 Gateway Endpoint，不經 NAT Gateway |
| NAT Gateway 費用高 | 它按時數加流量計費；跨 AZ 使用還會多一筆跨 AZ 傳輸費 |
| 開發測試環境夜間與假日閒置 | Instance Scheduler 定時關機，或改用 Aurora Serverless |
| DynamoDB 負載不可預期 | On-demand；穩定後改 Provisioned 加 Auto Scaling |
| Athena 查詢費高 | 轉成 Parquet、分割、壓縮，減少掃描量 |
| 對外流量費高 | 經 CloudFront 提供內容；同 Region 內走私有 IP |
| EFS 費用高 | 用 Lifecycle 把少用的檔案移到 IA 或 Archive |
| EBS 費用高 | gp2 換 gp3，每 GB 約便宜 20%；刪除未掛載的磁碟與舊快照 |
| 資料庫讀取壓力大 | 先加 Read Replica 或 ElastiCache，而不是一直升級主機規格 |
| 間歇性、短時間的工作 | Lambda 或 Fargate，用多少付多少 |

### 看見成本

| 工具 | 用途 |
| --- | --- |
| Cost Explorer | 分析花費趨勢與依服務、標籤的分布 |
| Budgets | 設定預算與超標告警 |
| Compute Optimizer | 依實際使用量建議調整規格 |
| Trusted Advisor | 依最佳實務檢查帳號，涵蓋成本、安全、效能等面向 |
| Cost Allocation Tags | 以標籤把成本歸到專案或團隊 |
| Organizations 合併帳單 | 多帳號用量合併，共享折扣 |

## 監控與稽核

| 項目 | 重點 |
| --- | --- |
| CloudWatch 預設指標 | CPU、網路、磁碟 I/O、狀態檢查；基本監控 5 分鐘一筆，詳細監控 1 分鐘一筆 |
| CloudWatch Agent | 記憶體用量、磁碟使用率、應用日誌都要靠它 |
| CloudWatch Alarm | 可觸發 SNS、Auto Scaling、EC2 動作（停止、終止、重新啟動、復原） |
| CloudWatch Logs | 以 Subscription Filter 即時送往 Lambda、Kinesis、Firehose |
| CloudTrail | 記錄 API 呼叫（誰、何時、做了什麼） |
| Config | 記錄資源組態變更並檢查規則 |
| X-Ray | 分散式追蹤，找出請求在哪個服務變慢 |

三個容易混淆的問題：**CloudWatch 回答「現在狀況如何」，CloudTrail 回答「誰做了什麼」，Config 回答「設定變成什麼、合不合規」。**

## 基礎設施即程式碼與自動化

| 項目 | 重點 |
| --- | --- |
| CloudFormation | 以模板宣告資源；StackSets 跨帳號與跨 Region 部署 |
| CDK | 用程式語言產生 CloudFormation 模板 |
| Systems Manager | Session Manager（免 SSH 登入）、Run Command、Patch Manager、Parameter Store |
| Instance Scheduler | 依排程啟停 EC2 與 RDS，省下離峰費用 |
| Elastic Beanstalk | 上傳程式碼，由平台代管部署 |

## 自測

| 題目關鍵字 | 優先想到 |
| --- | --- |
| 可中斷的批次工作 | Spot |
| 穩定的長期負載 | Savings Plans 或 Reserved Instances |
| 存取模式未知 | S3 Intelligent-Tiering |
| 規格是否過大 | Compute Optimizer |
| 預算超標通知 | Budgets |
| 誰呼叫了 API | CloudTrail |
| 設定被誰改了、是否合規 | Config |
| 記憶體使用率告警 | CloudWatch Agent 加 Alarm |
| 跨帳號、跨 Region 部署同一模板 | CloudFormation StackSets |

## 資料來源

- [Select the best pricing model（Cost Optimization Pillar）](https://docs.aws.amazon.com/wellarchitected/latest/cost-optimization-pillar/select-the-best-pricing-model.html)：定價模型選擇
- 其餘為個人 SAA-C03 學習筆記整理。
