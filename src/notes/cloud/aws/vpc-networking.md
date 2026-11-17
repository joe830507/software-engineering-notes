# VPC 與網路連線

> VPC 是你在 AWS 上的私有網路。這一頁處理子網路、出入口、VPC 之間與地端的互連；DNS、負載平衡與邊緣見下一頁。

## VPC 基本結構

| 元件 | 說明 |
| --- | --- |
| VPC | 一個 Region 內的私有網路，指定 CIDR 範圍 |
| Subnet | VPC 的子區段，**綁定單一 AZ**；有通往 Internet Gateway 的路由就是公有子網路，否則為私有子網路 |
| Route Table | 決定子網路的流量往哪走 |
| Internet Gateway | VPC 與網際網路的雙向出入口 |
| NAT Gateway | 讓私有子網路**主動連出**網際網路（IPv4），外部無法主動連進來 |
| Egress-only Internet Gateway | IPv6 的「只出不進」；IPv6 位址本身都是公開的 |

**NAT Gateway 要先分辨可用性模式與連線類型**：

- **Zonal public NAT Gateway**：建在公有子網路，透過 Internet Gateway 對外連線；要跨 AZ 高可用，通常每個 AZ 各建一個，私有子網路指向同 AZ 的 NAT。
- **Regional NAT Gateway**：建立時選擇 VPC，不需指定承載它的公有子網路；自動模式可隨工作負載擴展至多個 AZ，私有子網路可共用同一個 NAT Gateway ID。擴展到新 AZ 最多可能需 60 分鐘，期間可能跨 AZ 處理流量。
- **Private NAT**：用於私有網路之間的位址轉換，不能直接提供網際網路出口；需要此類型時使用 Zonal 模式，Regional NAT Gateway 不支援 private NAT。

教材中的「每個 AZ 各一個、建在公有子網路」適用於 Zonal public NAT，不能套用到所有 NAT Gateway。

## 兩層防護

Security Group 與 NACL 的比較見「加密、機密與偵測」一頁。實務上以 Security Group 為主（有狀態、可參照其他 SG），NACL 只在需要「明確封鎖某個 IP」或加一層子網路防線時使用。

## VPC Endpoint：不經網際網路存取 AWS 服務

| 比較 | Gateway Endpoint | Interface Endpoint（PrivateLink） |
| --- | --- | --- |
| 支援服務 | 只有 S3 與 DynamoDB | 多數 AWS 服務與自建服務 |
| 實作 | 路由表新增項目 | 子網路內的 ENI 與私有 IP |
| 費用 | 免費 | 按時數與流量計費 |
| 從 on-prem 或對等 VPC 使用 | 不行 | 可以 |

私有子網路大量存取 S3 或 DynamoDB 時，改用**免費的 Gateway Endpoint**，流量不經 NAT Gateway，同時省下 NAT 的處理費。

## 網路連線選型

| 需求 | 選擇 | 注意 |
| --- | --- | --- |
| 私有子網路的 IPv4 對外連線 | Public NAT Gateway | Zonal 模式放在公有子網路；Regional 模式不需指定子網路 |
| IPv6 只出不進 | Egress-only Internet Gateway | |
| 兩個 VPC 互連 | VPC Peering | **不可轉遞**、CIDR 不能重疊 |
| 大量 VPC 與 on-prem 互連 | Transit Gateway | 中樞輻射架構、可轉遞、可跨 Region 對等 |
| 把自己的服務私下提供給其他 VPC 或帳號 | PrivateLink | 服務端用 NLB 建立 Endpoint Service |
| on-prem 要快速建立連線 | Site-to-Site VPN | 走公網的 IPsec，數分鐘可建好 |
| on-prem 要穩定、大頻寬、低延遲 | Direct Connect | 建置要數週以上；**預設不加密** |
| 一條專線連多個 Region 的 VPC | Direct Connect Gateway | |
| 專線的備援 | 第二條 Direct Connect，或以 VPN 作備援 | 最高韌性是兩個不同地點的專線 |

**VPC Peering 為什麼不能轉遞**：A↔B、B↔C 各有 Peering，A 的封包不能「借道」B 到 C。要讓很多 VPC 兩兩互通，Peering 的連線數會爆炸成 n(n−1)/2，這時改用 Transit Gateway 當中樞。

**Direct Connect 預設不加密**：專線是私有的，但不是加密的。要加密就在專線上再跑 Site-to-Site VPN，或啟用 MACsec。

## 進階網路效能

| 項目 | 重點 |
| --- | --- |
| Placement Group：Cluster | 同一 AZ 內緊密放置；HPC、節點間低延遲高吞吐；風險是同時故障 |
| Placement Group：Spread | 每台放在不同硬體，每個 AZ 每群組最多 7 台；少量關鍵節點 |
| Placement Group：Partition | 分割到不同機櫃，每個 AZ 最多 7 個 partition；Kafka、Cassandra、HDFS |
| Enhanced Networking（ENA） | 一般高效能網路 |
| Elastic Fabric Adapter（EFA） | HPC 節點間通訊 |

## 自測

| 題目關鍵字 | 優先想到 |
| --- | --- |
| 私有子網路要連網際網路 | Public NAT Gateway；先分辨 Zonal 或 Regional 模式 |
| 私有子網路存取 S3 省錢 | Gateway Endpoint |
| 大量 VPC 互連 | Transit Gateway |
| 把服務私下提供給別的帳號 | PrivateLink |
| on-prem 專線、穩定頻寬 | Direct Connect；要快速建立則選 VPN |
| HPC 節點間低延遲 | Cluster Placement Group 加 EFA |

## 資料來源

個人 SAA-C03 學習筆記整理；Placement Group 與 Endpoint 的限制以 AWS 官方文件為準。

- [Regional NAT gateways](https://docs.aws.amazon.com/vpc/latest/userguide/nat-gateways-regional.html)：可用性模式、自動擴展與 private NAT 限制（2026-11-17 核對）。
