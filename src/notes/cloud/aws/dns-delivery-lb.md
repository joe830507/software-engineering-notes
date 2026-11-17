# DNS、負載平衡與邊緣

> 使用者的請求先經過 DNS 找到入口，再經邊緣節點與負載平衡器分流到後端。這一頁依請求的路徑由外到內整理。

## Route 53

Route 53 同時是 DNS 與流量路由服務。

| 路由政策 | 何時選 |
| --- | --- |
| Simple | 單一資源，不做健康檢查 |
| Weighted | 依比例分流：灰度發布、藍綠部署 |
| Latency | 導向延遲最低的 Region |
| Failover | 主備切換，主要端需要健康檢查 |
| Geolocation | 依使用者所在國家或洲：法規、在地化內容 |
| Geoproximity | 依地理距離，可用 bias 擴大或縮小某 Region 的範圍 |
| Multivalue Answer | 回傳多筆健康的紀錄；不是負載平衡器的替代品 |
| IP-based | 依來源 IP 範圍指定端點 |

| 項目 | 重點 |
| --- | --- |
| Alias 與 CNAME | Alias 可用在根網域、指向 AWS 資源時查詢免費；CNAME 不能用在根網域 |
| 健康檢查 | 可檢查端點、其他健康檢查的組合、CloudWatch 告警；私有資源要用告警方式 |
| Public 與 Private Hosted Zone | Private 只在關聯的 VPC 內解析 |
| Resolver Inbound Endpoint | on-prem 查詢 AWS 內的私有網域 |
| Resolver Outbound Endpoint | AWS 查詢 on-prem 網域，搭配轉送規則 |

**DNS 容錯的限制**：用戶端與中間的 DNS 解析器會依 TTL 快取答案，所以 Route 53 Failover 的切換速度受 TTL 影響。要**秒級切換**或需要**固定 IP**，改用 Global Accelerator。

## 負載平衡（ELB）

| 類型 | 層級 | 重點 | 題目訊號 |
| --- | --- | --- | --- |
| ALB | 第 7 層 | 依路徑、主機名稱、標頭路由；目標可為 EC2、IP、Lambda | HTTP、微服務、容器 |
| NLB | 第 4 層 | 超低延遲、每個 AZ 一個靜態 IP 或 Elastic IP、保留來源 IP | TCP、UDP、固定 IP、極高流量 |
| GWLB | 第 3 層 | 以 GENEVE 把流量導到第三方設備 | 防火牆、IDS、封包檢查設備 |

ELB 要自行在每個想使用的 AZ 啟用子網路，才會把流量分到該 AZ。

## Auto Scaling Group（ASG）

ASG 讓 EC2 數量隨負載自動增減，並自動汰換不健康的執行個體。

| 擴縮政策 | 何時選 |
| --- | --- |
| Target Tracking | 把某指標維持在目標值，例如 CPU 50%；最常見的答案 |
| Step Scaling | 依告警超標程度分段加減 |
| Scheduled | 已知的固定時段尖峰 |
| Predictive | 有週期性的負載，提前擴容 |

ASG 搭配 ELB 時，要把健康檢查類型設成 **ELB**，才能汰換「EC2 還活著但應用層已壞」的執行個體；預設只看 EC2 狀態檢查。

## CloudFront 與 Global Accelerator

| 比較 | CloudFront | Global Accelerator |
| --- | --- | --- |
| 協定 | HTTP、HTTPS、WebSocket | TCP、UDP |
| 快取 | 有 | 沒有 |
| 入口 | 網域名稱，邊緣節點 IP 會變動 | 2 個固定的 Anycast IP |
| 適用 | 靜態與動態網頁、影音、API | 遊戲、IoT、VoIP、需要固定 IP、跨 Region 快速容錯 |
| 容錯 | Origin Group 做來源備援 | 健康檢查後數秒內切換，不受 DNS TTL 影響 |

| 邊緣運算 | 特性 | 何時選 |
| --- | --- | --- |
| CloudFront Functions | 輕量 JavaScript、只在 viewer request 與 response、次毫秒 | 改標頭、URL 重寫、簡單驗證 |
| Lambda@Edge | Node.js 或 Python、四個觸發點、可呼叫外部服務 | 較重的邏輯、需要存取網路或請求內容本體 |

| CloudFront 存取控制 | 用途 |
| --- | --- |
| OAC | 限制 S3 來源只能經 CloudFront 存取，使用者無法繞過 CloudFront 直接讀 bucket |
| Signed URL | 限制私有或付費內容；一個 URL 對應一個檔案 |
| Signed Cookie | 一次授權多個檔案，或不想改動既有 URL |
| Geo Restriction | 依國家允許或封鎖 |

S3 Pre-signed URL 是**直接對 S3 授權**，CloudFront Signed URL 是對**經過 CloudFront** 的內容授權；題目的內容若經 CloudFront 發送，選後者。

快取層的對應：內容用 CloudFront，資料庫查詢結果與 Session 用 ElastiCache，DynamoDB 用 DAX。

## API Gateway

| 項目 | 重點 |
| --- | --- |
| REST API | 功能最完整：API key 與 Usage Plan、請求驗證、快取、可掛 WAF、可設為私有 |
| HTTP API | 較便宜、延遲較低，功能較少；內建 JWT authorizer |
| WebSocket API | 雙向即時通訊：聊天、即時通知 |
| 端點類型 | Edge-optimized 經 CloudFront 邊緣服務全球用戶端；Regional 服務同 Region 用戶端；Private 只能從 VPC 經 Interface Endpoint 存取 |
| 節流 | 超過上限回傳 429；用 Usage Plan 加 API key 對個別客戶限流 |
| 快取 | 以 stage 為單位啟用，減少對後端的呼叫 |
| 驗證 | IAM（SigV4）、Cognito User Pool authorizer、Lambda authorizer |
| 逾時 | 整合逾時預設上限 29 秒（Regional 與 Private 的 REST API 可申請調高，Edge-optimized 不行）；較長的工作改成非同步，先回應再交給 SQS 或 Step Functions |

## 自測

| 題目關鍵字 | 優先想到 |
| --- | --- |
| 依路徑或主機名稱路由 | ALB |
| TCP 或 UDP、固定 IP、極低延遲 | NLB |
| 串接第三方防火牆設備 | Gateway Load Balancer |
| 主備切換 | Route 53 Failover 加健康檢查 |
| 灰度發布、依比例分流 | Route 53 Weighted |
| 依使用者國家限制或在地化 | Route 53 Geolocation |
| 固定 IP、秒級跨 Region 容錯 | Global Accelerator |
| 全球靜態內容加速 | CloudFront 加 S3 |
| 已知時段尖峰 | Scheduled Scaling |

## 資料來源

- [Quotas for configuring and running a REST API in API Gateway](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-execution-service-limits-table.html)：整合逾時
- 其餘為個人 SAA-C03 學習筆記整理。
