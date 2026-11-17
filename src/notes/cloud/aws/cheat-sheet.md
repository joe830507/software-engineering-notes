# 易混淆比較與情境關鍵字速查

> 考前或面試前最後一眼看這頁。左欄是題目或需求裡的字眼，右欄是優先想到的服務；用其他條件排除後再決定。

## 通用限定詞

| 題目關鍵字 | 優先想到 |
| --- | --- |
| 最少營運負擔 | 全受管或無伺服器：Lambda、Fargate、DynamoDB、Aurora Serverless |
| 最具成本效益 | Spot、Savings Plans、S3 Lifecycle、Gateway Endpoint |
| 不修改應用程式 | 相容既有協定的服務：Amazon MQ、FSx、Storage Gateway、MGN |
| 最短停機時間遷移資料庫 | DMS 持續複寫 |

## 高頻陷阱

| 陷阱 | 正確觀念 | 範疇 |
| --- | --- | --- |
| NACL 無狀態 | 回程流量不會自動放行，要另外允許 ephemeral ports；Security Group 才是有狀態 | 安全 |
| NAT Gateway 的模式 | Zonal public NAT 建在公有子網路，通常每 AZ 一個；Regional NAT 不需指定子網路，可跨 AZ 自動擴展 | 韌性 |
| VPC Peering 不可轉遞 | A 連 B、B 連 C，不代表 A 能到 C；要轉遞用 Transit Gateway | 網路 |
| SSE-KMS 物件的複寫 | 預設不複寫，要在複寫規則中另外開啟並授權目的端的 KMS key | 韌性 |
| S3 Versioning 是前提 | 複寫（兩端都要）、Object Lock、MFA Delete 都得先開 Versioning | 韌性 |
| Route 53 容錯受 TTL 影響 | 用戶端會快取 DNS；要秒級切換或固定 IP 就選 Global Accelerator | 韌性 |
| SCP 與 Permission Boundary 的範圍 | SCP 限制成員帳號主體，Boundary 限制單一 User 或 Role 的身分政策授權；兩者不授權，資源政策例外見 IAM 篇 | 安全 |
| Gateway Endpoint 的限制 | 只支援 S3 與 DynamoDB、免費；on-prem 與對等 VPC 用不到，那時改用 Interface Endpoint | 安全、成本 |
| CloudFront 的憑證 Region | ACM 憑證必須申請在 us-east-1；ALB 則用自己所在 Region 的憑證 | 安全 |
| Direct Connect 預設不加密 | 專線是私有但非加密；要加密就在上面跑 Site-to-Site VPN 或啟用 MACsec | 安全 |
| EC2 的記憶體與磁碟用量 | 預設指標沒有，必須安裝 CloudWatch Agent | 維運 |
| Multi-AZ 是否能讀 | DB instance 的 standby 不能讀；Multi-AZ DB cluster 的 reader 可以讀 | 韌性 |

## 安全

| 題目關鍵字 | 優先想到 |
| --- | --- |
| 資料庫密碼自動輪替 | Secrets Manager |
| 自己掌控金鑰、專屬硬體 | CloudHSM |
| 稽核金鑰使用紀錄 | SSE-KMS 加 CloudTrail |
| 在 S3 找出 PII | Macie |
| 漏洞、CVE 掃描 | Inspector |
| 異常 API 呼叫、挖礦、惡意 IP | GuardDuty |
| 誰呼叫了 API | CloudTrail |
| 設定被誰改了、是否合規 | Config |
| SQL injection、XSS、速率限制 | WAF |
| 限制整個帳號或 OU 能用的服務與 Region | SCP |
| 多帳號單一登入 | IAM Identity Center |
| 不開 SSH、不用 bastion 登入 EC2 | SSM Session Manager |
| 臨時分享私有物件 | Pre-signed URL |
| S3 內容只能經 CloudFront 存取 | OAC |
| 行動或網頁 App 的使用者註冊與登入 | Cognito User Pool |
| App 使用者直接存取 AWS 資源 | Cognito Identity Pool |
| 法規要求不可刪改 | S3 Object Lock 的 Compliance 模式 |
| 封鎖特定 IP | NACL 或 WAF；Security Group 沒有 Deny |

## 韌性

| 題目關鍵字 | 優先想到 |
| --- | --- |
| 解耦、緩衝突發流量 | SQS |
| 一個事件通知多個系統 | SNS 後接多個 SQS |
| 嚴格順序、不可重複 | SQS FIFO |
| 即時串流、要能重播 | Kinesis Data Streams |
| 把串流載入 S3 或 Redshift | Data Firehose |
| 協調多步驟流程、人工核准 | Step Functions |
| 資料庫高可用、自動容錯移轉 | RDS Multi-AZ 或 Aurora |
| Lambda 耗盡資料庫連線 | RDS Proxy |
| 跨 Region 災難復原、RPO 秒級 | Aurora Global Database、DynamoDB Global Tables |
| 主備切換 | Route 53 Failover 加健康檢查 |
| 灰度發布、依比例分流 | Route 53 Weighted |
| 依使用者國家限制或在地化 | Route 53 Geolocation |
| 固定 IP、秒級跨 Region 容錯 | Global Accelerator |
| 已知時段尖峰 | Scheduled Scaling |
| 集中管理跨服務備份 | AWS Backup |

## 高效能

| 題目關鍵字 | 優先想到 |
| --- | --- |
| 依路徑或主機名稱路由 | ALB |
| TCP 或 UDP、固定 IP、極低延遲 | NLB |
| 串接第三方防火牆設備 | Gateway Load Balancer |
| 全球靜態內容加速 | CloudFront 加 S3 |
| 遠距離上傳大檔到 S3 | Transfer Acceleration 加 Multipart Upload |
| 多台 Linux 共享檔案 | EFS |
| Windows 檔案共享、AD | FSx for Windows File Server |
| HPC、機器學習、要與 S3 連動 | FSx for Lustre |
| HPC 節點間低延遲 | Cluster Placement Group 加 EFA |
| DynamoDB 微秒級讀取 | DAX |
| 資料庫讀取壓力大、重複查詢 | Read Replica、ElastiCache |
| 排行榜、Session | ElastiCache Redis |
| 用 SQL 直接查 S3 | Athena |
| 執行超過 15 分鐘 | 不能用 Lambda，改 Fargate 或 EC2 |
| 大量 VPC 互連 | Transit Gateway |
| on-prem 專線、穩定頻寬 | Direct Connect；要快速建立則選 VPN |

## 成本

| 題目關鍵字 | 優先想到 |
| --- | --- |
| 可中斷的批次工作 | Spot |
| 穩定的長期負載 | Savings Plans 或 Reserved Instances |
| 自帶以 core 計價的授權 | Dedicated Host |
| 存取模式未知 | S3 Intelligent-Tiering |
| 幾乎不讀、要最便宜 | Glacier Deep Archive |
| 很少讀但要毫秒取回 | Glacier Instant Retrieval |
| 頻寬不足、大量離線搬遷 | Snowball Edge |
| 異質資料庫遷移 | SCT 加 DMS |

## 生成式 AI：選服務

| 題目關鍵字 | 優先想到 |
| --- | --- |
| 用 API 存取多家 FM、不管基礎設施 | Bedrock |
| 自己訓練與部署模型、完全掌控 | SageMaker AI |
| 快速部署預訓練的開源模型 | SageMaker JumpStart |
| 讓模型根據公司文件回答 | RAG、Bedrock Knowledge Bases |
| 讓 AI 執行多步驟任務、呼叫 API | Bedrock Agents |
| 把 agent 安全地部署到正式環境 | Bedrock AgentCore |
| 以程式碼開發 agent 的開源框架 | Strands Agents |
| 統一 agent 連接外部工具的標準 | MCP |
| 過濾有害內容、遮蔽 PII、封鎖主題 | Bedrock Guardrails |
| 比較多個模型的品質 | Bedrock Model Evaluation |
| 商務人員用自然語言查資料、做儀表板 | Amazon Quick |
| AI 協助寫程式 | Kiro |
| 資料標註 | SageMaker Ground Truth |
| 偵測偏差、解釋預測 | SageMaker Clarify |
| 監控上線模型的漂移 | SageMaker Model Monitor |
| 低信心預測交給人工審核 | Amazon A2I |

## 生成式 AI：選做法

| 題目關鍵字 | 優先想到 |
| --- | --- |
| 最低成本、最快改善輸出 | Prompt engineering |
| 需要最新或私有資料、資料常更新 | RAG |
| 需要特定語氣、格式或專門任務，且有標籤資料 | 微調 |
| 讓模型熟悉領域用語，只有無標籤資料 | 持續預訓練 |
| 降低推論成本與延遲、接受小模型 | 蒸餾 |
| 要輸出穩定一致 | 調低 temperature |
| 需要逐步推理 | Chain-of-thought |
| 要模型照範例的格式輸出 | Few-shot |
| 減少幻覺 | RAG、Guardrails 的 grounding 檢查、調低 temperature |
| 穩定的大流量 | Provisioned Throughput |
| 大量、不急的請求 | 批次推論 |
| 重複的長 prompt 想省錢 | Prompt caching |
| 輸入檔很大、不需即時回應 | 非同步推論 |
| 流量間歇、閒置時不想付費 | 無伺服器推論 |
| 評估摘要品質 | ROUGE |
| 評估翻譯品質 | BLEU |
| 評估語意相似度 | BERTScore |
| 漏報代價高 | Recall |
| 誤報代價高 | Precision |
| 訓練表現好、上線表現差 | Overfitting |
| 法規要求解釋每個決策 | 可解釋的傳統 ML 模型 |

## 易混淆的組合

| 組合 | 區別 |
| --- | --- |
| Bedrock 與 SageMaker AI | Bedrock 是以 API 使用現成 FM，不管基礎設施；SageMaker AI 是自己建置、訓練、部署模型 |
| RAG 與微調 | RAG 補充知識、不改模型、資料可隨時更新；微調改變模型的行為，需要訓練 |
| 微調與持續預訓練 | 微調用有標籤的資料；持續預訓練用無標籤的資料 |
| Temperature 與 Top P | 兩者都控制隨機性；Temperature 調整機率分布，Top P 限制候選範圍 |
| ROUGE 與 BLEU | ROUGE 用於摘要；BLEU 用於翻譯 |
| Overfitting 與 Underfitting | 前者訓練好、測試差；後者兩邊都差 |
| Interpretability 與 Explainability | 前者是模型本身看得懂；後者是事後能說明黑箱的輸出 |
| Clarify 與 Model Monitor | Clarify 偵測偏差並解釋預測；Model Monitor 監控上線後的漂移 |
| Ground Truth 與 A2I | Ground Truth 用於訓練前的資料標註；A2I 用於上線後的人工審核 |
| Guardrails 與 IAM | Guardrails 管內容；IAM 管誰能呼叫 |
| Comprehend 與 Textract | Comprehend 分析文字的意思；Textract 從文件影像中擷取文字 |
| Transcribe 與 Polly | Transcribe 是語音轉文字；Polly 是文字轉語音 |
| Lex 與 Bedrock Agents | Lex 是以意圖與槽位定義的對話機器人；Agents 由 FM 自行規劃並呼叫工具 |
| Knowledge Bases 與 Agents | Knowledge Bases 負責檢索資料；Agents 負責採取行動 |
| JumpStart 與 Bedrock | JumpStart 把模型部署在自己的 SageMaker 端點；Bedrock 以無伺服器 API 提供 |
| Prompt injection 與 Jailbreaking | 前者是夾帶指令改變行為；後者是繞過安全限制 |
| Artifact 與 Audit Manager | Artifact 提供 AWS 自己的合規報告；Audit Manager 蒐集客戶環境的合規證據 |
| CloudTrail、Config、CloudWatch | 誰做了什麼、設定變成什麼、現在狀況如何 |
| Security Group 與 NACL | 有狀態且只有 Allow、掛在 ENI；無狀態且有 Allow 與 Deny、掛在子網路 |
| Multi-AZ 與 Read Replica | Multi-AZ DB instance 同步備援、standby 不能讀；Multi-AZ DB cluster 半同步且 reader 可讀；Read Replica 非同步，用於讀取擴展等需求 |

## 資料來源

個人 SAA-C03 與 AIF-C01 學習筆記整理，已與前面各頁交叉對照。
