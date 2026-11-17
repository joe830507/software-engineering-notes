# 運算：EC2、Lambda 與容器

> 運算選型的主軸是「**你想自己管多少**」：EC2 管到作業系統，容器管到應用打包，Lambda 只管函式程式碼。

## 運算選型

| 選項 | 何時選 | 重點 |
| --- | --- | --- |
| EC2 | 需要完全掌控作業系統 | C 系列偏運算、R 與 X 偏記憶體、I 與 D 偏儲存、G 與 P 是 GPU、T 可突增 |
| Lambda | 事件驅動、短時間執行 | 最長 15 分鐘；冷啟動用 Provisioned Concurrency |
| ECS on EC2 | 容器、要掌控主機 | 自己管理叢集的執行個體 |
| ECS on Fargate | 容器、不想管主機 | 無伺服器；Task Role 給容器 AWS 權限 |
| EKS | 需要 Kubernetes 或跨雲可攜 | 受管控制平面 |
| Elastic Beanstalk | 上傳程式碼就部署 | 平台代管，但底層資源仍看得到、可調整 |
| AWS Batch | 受管的批次運算 | 可搭配 Spot |

**執行超過 15 分鐘的工作不能用 Lambda**，改用 Fargate 或 EC2。

## EC2

| 項目 | 重點 |
| --- | --- |
| 機型命名 | 家族字母表示用途（C、R、M、T、G、P…），數字是世代，後綴如 `g` 表示 Graviton（Arm） |
| T 系列 | 可突增（burstable），平時累積 CPU credit，需要時消耗 |
| Instance Store | 主機實體磁碟，停機即消失；極高 IOPS、可丟失的暫存資料 |
| EC2 Hibernate | 記憶體內容寫入加密的根磁碟，開機後快速恢復狀態 |
| 預設 CloudWatch 指標 | 沒有記憶體與磁碟使用率，必須安裝 CloudWatch Agent |

### 購買選項

| 選項 | 折扣幅度 | 何時選 | 注意 |
| --- | --- | --- | --- |
| On-Demand | 無 | 短期、不可預期、不能中斷 | |
| Reserved Instances | 最高約 72% | 1 或 3 年的穩定負載 | Standard 折扣高；Convertible 可換機型系列但折扣較低 |
| Compute Savings Plans | 最高約 66% | 承諾每小時用量金額，想保留彈性 | 跨機型系列、Region，也涵蓋 Fargate 與 Lambda |
| EC2 Instance Savings Plans | 最高約 72% | 確定機型系列與 Region | 綁定系列與 Region |
| Spot | 最高約 90% | 可中斷的批次、CI、無狀態工作 | 回收前 2 分鐘通知 |
| Dedicated Host | 隨需價無折扣；Reservation 最高約 70% | 以 socket 或 core 計的自帶授權、合規要求 | 可看到並控制實體主機；也適用 Savings Plans |
| Dedicated Instance | 無 | 硬體不與其他客戶共用 | 不能控制放在哪台主機 |
| Capacity Reservation | 無 | 保證特定 AZ 一定有容量 | 沒用也要付費 |

Auto Scaling Group 可混用：以 On-Demand 或 Savings Plans 承接基本量，尖峰用 Spot。

## Lambda

Lambda 以事件觸發、按執行時間與記憶體計費。依官方配額頁，常考的限制如下：

| 項目 | 數值 |
| --- | --- |
| 逾時 | 最長 900 秒（15 分鐘） |
| 記憶體 | 128 MB 到 10,240 MB；約 1,769 MB 相當於 1 個 vCPU，CPU 隨記憶體等比增加 |
| 暫存空間 `/tmp` | 512 MB 到 10,240 MB |
| 同步呼叫 payload | 請求與回應各 6 MB；串流回應 200 MB |
| 非同步呼叫 payload | 1 MB |
| 部署套件 | zip 上傳 50 MB；解壓縮後（含 layers）250 MB；容器映像可更大 |
| Layers | 每個函式最多 5 個 |
| 每 Region 並行 | 預設 1,000，所有函式共用，可申請調高；新帳號的配額較低 |

| Lambda 並行設定 | 作用 |
| --- | --- |
| 帳號並行上限 | 超過就被節流 |
| Reserved Concurrency | 為某個函式保留額度，同時也是它的上限；免費；可防止單一函式吃光額度或壓垮下游資料庫 |
| Provisioned Concurrency | 預先暖好執行環境以消除冷啟動；要付費 |

**冷啟動**是新執行環境初始化的延遲；要降低就用 Provisioned Concurrency、減小套件、避免在初始化階段做重工作。

**Lambda 連資料庫的坑**：大量並行的 Lambda 各自開連線會耗盡資料庫連線數，解法是 **RDS Proxy**（見資料庫頁）。

典型無伺服器架構：API Gateway 接請求，Lambda 處理，DynamoDB 存資料，Cognito 驗證使用者。

## 容器

| 服務 | 定位 |
| --- | --- |
| ECR | 容器映像倉庫 |
| ECS | AWS 自家的容器編排；Task Definition 描述容器，Service 維持數量 |
| Fargate | ECS 與 EKS 的無伺服器運算引擎，不管主機 |
| EKS | 受管 Kubernetes 控制平面 |

選擇：已有 Kubernetes 或要跨雲可攜 → EKS；單純想在 AWS 跑容器、不想學 Kubernetes → ECS；不想管主機 → Fargate。

## 自測

| 題目關鍵字 | 優先想到 |
| --- | --- |
| 可中斷的批次工作 | Spot |
| 穩定的長期負載 | Savings Plans 或 Reserved Instances |
| 自帶以 core 計價的授權 | Dedicated Host |
| 執行超過 15 分鐘 | 不能用 Lambda，改 Fargate 或 EC2 |
| 不想管主機的容器 | ECS on Fargate |
| 需要 Kubernetes | EKS |
| 上傳程式碼就部署 | Elastic Beanstalk |
| 消除 Lambda 冷啟動 | Provisioned Concurrency |

## 資料來源

- [Lambda quotas](https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html)：逾時、記憶體、`/tmp`、payload、部署套件、並行
- [Select the best pricing model（Cost Optimization Pillar）](https://docs.aws.amazon.com/wellarchitected/latest/cost-optimization-pillar/select-the-best-pricing-model.html)：Savings Plans 折扣範圍
- [Amazon EC2 Dedicated Hosts Pricing](https://aws.amazon.com/ec2/dedicated-hosts/pricing/)：Reservation 最高 70%、適用 Savings Plans
- 其餘為個人 SAA-C03 學習筆記整理。
