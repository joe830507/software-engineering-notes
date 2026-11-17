# 加密、機密與偵測

> 身分決定「誰能碰資料」，這一頁處理「就算被碰到也看不懂」（加密）與「被碰到我要知道」（偵測與稽核）。

## 加密與機密管理

| 服務 | 用途 | 辨識關鍵 |
| --- | --- | --- |
| KMS | 受管金鑰、與多數服務整合 | Key policy、CloudTrail 可稽核、可自動輪替 |
| KMS Envelope Encryption | 加密超過 4 KB 的資料 | `GenerateDataKey` 產生資料金鑰，再用 KMS key 保護它 |
| KMS Multi-Region Keys | 在一個 Region 加密、另一個 Region 解密 | 各 Region 仍是獨立資源，不是全域金鑰 |
| CloudHSM | 專屬單租戶 HSM | 自己完全掌控金鑰、法規要求專屬硬體 |
| ACM | 管理 TLS 憑證與符合條件的自動續期 | 整合服務使用的非匯出型公有憑證免費；可匯出型公有憑證另計費。CloudFront 用的 ACM 憑證須在 us-east-1 |
| Secrets Manager | 機密的儲存與自動輪替 | RDS 原生整合、可跨 Region 複寫、按機密計費 |
| SSM Parameter Store | 設定值與機密（SecureString） | 標準層免費、沒有內建輪替 |

**為什麼要 Envelope Encryption**：KMS 的 `Encrypt` API 只能直接加密小資料（4 KB 以內）。大資料的做法是：向 KMS 要一把**資料金鑰**，用它在本地加密資料，再把「被 KMS key 加密過的資料金鑰」和密文存在一起。解密時先請 KMS 解開資料金鑰，再解資料。這樣大量資料不必經過網路送到 KMS。

**Secrets Manager 與 Parameter Store**：需要**自動輪替資料庫密碼**就選 Secrets Manager；只是存放設定值、不需要輪替、想省費用就用 Parameter Store。

**ACM 的費用與部署邊界**：ALB、CloudFront 等整合服務使用的非匯出型公有憑證不收憑證費，相關服務仍計費。可匯出型公有憑證可部署到 EC2、容器或地端，但另有憑證費；ACM 管理續期後，匯出憑證的重新部署仍須自行處理或自動化。

### 既有未加密 RDS 如何改成加密

RDS 執行個體**建立後不能直接開啟加密**，流程是：

1. 建立快照。
2. 複製快照，複製時指定 KMS key 加密。
3. 由加密的快照還原成新的執行個體。
4. 應用端切換到新端點。

未加密的執行個體也不能建立加密的 Read Replica。

## S3 加密與存取控制

| 項目 | 重點 |
| --- | --- |
| SSE-S3 | 預設加密，AWS 管理金鑰 |
| SSE-KMS | 可稽核、可控制誰能用金鑰；受 KMS API 配額影響，可用 S3 Bucket Key 減少呼叫 |
| SSE-C | 客戶每次請求自帶金鑰，必須走 HTTPS，AWS 不保存金鑰 |
| Client-side encryption | 上傳前自行加密 |
| 強制 HTTPS | Bucket policy 以 `aws:SecureTransport` 為 false 時 Deny |
| Block Public Access | 帳號或 bucket 層級的公開存取總開關 |
| Access Points | 每個應用一個存取點與獨立政策，簡化大型共用 bucket |
| Pre-signed URL | 有時效的上傳或下載連結，沿用簽發者的權限 |
| CloudFront OAC | 讓 bucket 只接受來自指定 CloudFront distribution 的請求；bucket policy 允許 `cloudfront.amazonaws.com` 並以 `aws:SourceArn` 限定；取代舊的 OAI，且支援 SSE-KMS |
| Object Lock | WORM；Governance 模式特權使用者可解除，Compliance 模式連 root 也不行 |
| Glacier Vault Lock | 鎖定 Vault 政策，鎖定後不可更改 |
| CORS | 設定在「被請求」的 bucket 上，允許其他來源的瀏覽器請求 |

## 網路層防護

| 比較 | Security Group | NACL |
| --- | --- | --- |
| 層級 | ENI（執行個體） | Subnet |
| 狀態 | 有狀態，回程自動放行 | 無狀態，回程要另外放行 |
| 規則 | 只有 Allow | Allow 與 Deny |
| 評估 | 所有規則一起評估 | 依編號由小到大，先符合先套用 |
| 典型用途 | 一般存取控制、可參照其他 SG | 封鎖特定 IP、子網路層防線 |

NACL 的回程規則要放行 ephemeral ports 1024–65535。

| 服務 | 防護對象 | 辨識關鍵 |
| --- | --- | --- |
| WAF | 第 7 層：SQL injection、XSS、速率限制、地理封鎖 | 掛在 CloudFront、ALB、API Gateway |
| Shield Standard | 第 3、4 層 DDoS | 免費、自動啟用 |
| Shield Advanced | 進階 DDoS 防護 | 付費、應變團隊支援、DDoS 造成的擴容費用保護 |
| Firewall Manager | 跨帳號集中管理 WAF、Shield、SG 規則 | 需要 Organizations |
| Network Firewall | VPC 層級的受管防火牆，可做封包深度檢查 | 比 SG、NACL 更深入的檢查 |
| Bastion Host | 經公有子網路跳板 SSH 進私有子網路 | 要開 22 port 並管理金鑰 |
| SSM Session Manager | 不開 22 port、不用 bastion、不用 SSH key | 連線紀錄可稽核 |

DDoS 最佳實務：在邊緣用 CloudFront 或 Global Accelerator 吸收流量，並用 Route 53 承接 DNS 層攻擊；只讓邊緣服務能連到來源，攻擊流量就碰不到你的後端。

## 偵測與稽核

這些服務名字都像「監控安全」，要靠它**回答的問題**區分。

| 服務 | 回答的問題 |
| --- | --- |
| CloudTrail | **誰**在何時呼叫了哪個 API |
| Config | 資源**組態**何時被改、是否符合規則，可自動修復 |
| GuardDuty | 帳號內是否有惡意活動；分析 CloudTrail、VPC Flow Logs、DNS 紀錄，不需代理程式 |
| Inspector | EC2、ECR 映像、Lambda 是否有已知漏洞（CVE）或非預期的網路暴露 |
| Macie | S3 裡是否有 PII 等敏感資料 |
| Security Hub | 彙整各安全服務的發現並對照合規標準 |
| VPC Flow Logs | 哪些連線被接受或拒絕；只有中繼資料，沒有封包內容 |
| Traffic Mirroring | 複製實際封包做深度檢查 |
| Trusted Advisor | 依最佳實務檢查帳號（安全、成本、效能等面向） |

## 自測

| 題目關鍵字 | 優先想到 |
| --- | --- |
| 資料庫密碼自動輪替 | Secrets Manager |
| 自己掌控金鑰、專屬硬體 | CloudHSM |
| 稽核金鑰使用紀錄 | SSE-KMS 加 CloudTrail |
| 在 S3 找出 PII | Macie |
| 漏洞、CVE 掃描 | Inspector |
| 異常 API 呼叫、挖礦、惡意 IP | GuardDuty |
| 設定被誰改了、是否合規 | Config |
| SQL injection、XSS、速率限制 | WAF |
| 不開 SSH、不用 bastion 登入 EC2 | SSM Session Manager |
| 臨時分享私有物件 | Pre-signed URL |
| S3 內容只能經 CloudFront 存取 | OAC |
| 法規要求不可刪改 | S3 Object Lock 的 Compliance 模式 |
| 封鎖特定 IP | NACL 或 WAF；Security Group 沒有 Deny |

## 資料來源

個人 SAA-C03 學習筆記整理；服務名稱與功能對照 AWS 官方文件。

- [ACM exportable public certificates](https://docs.aws.amazon.com/acm/latest/userguide/acm-exportable-certificates.html)：收費與續期後部署責任（2026-11-17 核對）。
