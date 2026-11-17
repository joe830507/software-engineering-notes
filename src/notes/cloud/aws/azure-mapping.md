# AWS 與 Azure 服務對照

> 給已經熟悉 Azure（或要在兩朵雲之間溝通）的人，用來快速對應服務。對照是「功能最接近」，不代表行為完全相同；表中『差異提醒』欄標出常見落差。

多數 AWS 服務在 Azure 都有對應，差別常在 AWS 把功能拆成多個服務，Azure 則整合在同一個平台內。

| 領域 | AWS | Azure | 差異提醒 |
| --- | --- | --- | --- |
| 網路 | VPC | Virtual Network | AWS 的子網路綁定單一 AZ |
| 網路 | Security Group | Network Security Group | NSG 同樣有狀態，但有 Deny 與優先序，且可掛在子網路 |
| 網路 | NACL | 沒有直接對應 | 最接近的是掛在子網路的 NSG |
| 網路 | Transit Gateway | Virtual WAN | |
| 網路 | Direct Connect | ExpressRoute | |
| 網路 | Site-to-Site VPN | VPN Gateway | |
| 網路 | Interface Endpoint、PrivateLink | Private Endpoint、Private Link | |
| 網路 | Gateway Endpoint | Service Endpoint | |
| 網路 | Route 53 | Azure DNS 加 Traffic Manager | AWS 把 DNS 與流量路由放在同一個服務 |
| 網路 | ALB | Application Gateway | |
| 網路 | NLB | Azure Load Balancer | |
| 網路 | CloudFront | Azure Front Door、Azure CDN | |
| 網路 | Global Accelerator | Front Door、跨區域 Load Balancer | |
| 身分 | IAM Role | Managed Identity、Entra ID 角色指派 | |
| 身分 | Organizations 加 SCP | Management Groups 加 Azure Policy | |
| 身分 | IAM Identity Center | Microsoft Entra ID 單一登入 | |
| 身分 | Control Tower | Azure Landing Zones | |
| 安全 | KMS、Secrets Manager、ACM | Key Vault | 「AWS 拆分、Azure 整合」的典型例子 |
| 安全 | GuardDuty | Microsoft Defender for Cloud | |
| 安全 | WAF、Shield | Azure WAF、Azure DDoS Protection | |
| 安全 | CloudTrail | Activity Log | |
| 安全 | Config | Azure Policy、Resource Graph | |
| 運算 | EC2、Auto Scaling Group | Virtual Machines、VM Scale Sets | |
| 運算 | Lambda | Azure Functions | |
| 運算 | ECS on Fargate | Container Apps、Container Instances | |
| 運算 | EKS | AKS | |
| 運算 | Elastic Beanstalk | App Service | |
| 儲存 | S3 | Blob Storage | 儲存類別對應 Hot、Cool、Cold、Archive 存取層 |
| 儲存 | EBS | Managed Disks | |
| 儲存 | EFS、FSx for Windows | Azure Files | Azure Files 同時提供 NFS 與 SMB |
| 儲存 | FSx for NetApp ONTAP | Azure NetApp Files | |
| 儲存 | Snow Family | Azure Data Box | 少數一對一對應的例子 |
| 儲存 | AWS Backup | Azure Backup | 少數一對一對應的例子 |
| 資料庫 | RDS | Azure SQL Database、Azure Database for MySQL 與 PostgreSQL | |
| 資料庫 | DynamoDB | Cosmos DB | |
| 資料庫 | ElastiCache | Azure Cache for Redis | |
| 分析 | Redshift | Azure Synapse Analytics | |
| 分析 | Athena | Synapse 無伺服器 SQL | |
| 分析 | Glue | Data Factory | |
| 分析 | Kinesis Data Streams | Event Hubs | |
| 整合 | SQS | Queue Storage、Service Bus Queue | |
| 整合 | SNS | Service Bus Topic、Event Grid | |
| 整合 | EventBridge | Event Grid | |
| 整合 | Step Functions | Logic Apps、Durable Functions | |
| 維運 | CloudWatch | Azure Monitor、Log Analytics | |
| 維運 | CloudFormation | ARM Template、Bicep | |
| 遷移 | MGN、Application Discovery Service | Azure Migrate | |
| 遷移 | Elastic Disaster Recovery | Azure Site Recovery | |

## 設計差異的共同模式

- **AWS 拆分、Azure 整合**：例如 KMS、Secrets Manager、ACM 三個服務在 Azure 多半由 Key Vault 一個服務涵蓋；Route 53 同時包含 DNS 與流量路由，Azure 則分成 Azure DNS 與 Traffic Manager。
- **網路邊界不同**：AWS 的子網路綁定單一 AZ，Security Group 只有 Allow；Azure 的 NSG 有 Deny 與優先序，且可掛在子網路。
- **少數一對一**：Snow Family 對 Data Box、AWS Backup 對 Azure Backup。

## 資料來源

個人整理的 AWS 與 Azure 服務對照；兩邊產品更名頻繁，使用前請對照各自的官方文件。
