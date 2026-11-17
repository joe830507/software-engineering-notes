# 儲存：EBS、檔案系統與 S3

> 儲存選型先問「存取方式」：區塊（掛載成磁碟）、檔案（多台共享）、物件（HTTP API）。再問延遲、容量與價格。

## 儲存選型

| 服務 | 類型 | 存取方式 | 何時選 |
| --- | --- | --- | --- |
| EBS | 區塊 | 單一 AZ，通常掛在一台 EC2 | 開機碟、資料庫 |
| Instance Store | 區塊（暫存） | 主機實體磁碟，停機即消失 | 極高 IOPS、可丟失的暫存或快取 |
| EFS | 檔案（NFS） | 多 AZ、大量 Linux 主機同時掛載 | 共享檔案、容器與 Lambda 共用儲存 |
| FSx for Windows File Server | 檔案（SMB） | 整合 AD、支援 DFS | Windows 檔案共享 |
| FSx for Lustre | 平行檔案系統 | 可與 S3 連動 | HPC、機器學習訓練；Scratch 便宜但不複寫，Persistent 會複寫 |
| FSx for NetApp ONTAP | NFS、SMB、iSCSI | 多協定 | 既有 NetApp 環境搬遷 |
| FSx for OpenZFS | 檔案（NFS） | Linux 為主 | 既有 ZFS 環境搬遷 |
| S3 | 物件 | HTTP API | 靜態內容、資料湖、備份封存 |

## EBS

| 類型 | 定位 | 重點 |
| --- | --- | --- |
| gp3 | 一般用途 SSD | 基準 3,000 IOPS、125 MiB/s，IOPS 與吞吐量可獨立加購，不必加大容量 |
| gp2 | 舊款一般用途 SSD | IOPS 隨容量成長，每 GiB 3 IOPS，上限 16,000 |
| io1、io2 Block Express | 高效能 SSD | 需要穩定高 IOPS 的關鍵資料庫；io2 Block Express 最高 256,000 IOPS |
| st1 | 吞吐量型 HDD | 大數據、日誌等循序讀寫；不能當開機碟 |
| sc1 | 冷 HDD | 最便宜、很少存取；不能當開機碟 |

gp3 的上限已在 2025 年提高到 80,000 IOPS 與 2,000 MiB/s，但多數教材與舊題仍以 16,000 IOPS 為界，超過就選 io1 或 io2。

| EBS 功能 | 重點 |
| --- | --- |
| 快照 | 增量、存於 S3；可用 Data Lifecycle Manager 排程 |
| Multi-Attach | 只有 io1、io2；同一 AZ 內多台執行個體同時掛載 |
| 加密 | 加密的磁碟，其快照與由快照建立的磁碟也都加密；未加密的要靠複製快照時加密 |
| 省錢 | gp2 換 gp3，每 GB 約便宜 20%；刪除未掛載的磁碟與舊快照 |

## S3

### 儲存類別

| 類別 | 何時選 | 取回 | 最短計費天數 |
| --- | --- | --- | --- |
| Standard | 頻繁存取 | 即時 | 無 |
| Intelligent-Tiering | 存取模式未知或會變動 | 即時 | 無；按物件數收監控費 |
| Standard-IA | 不常存取但要立刻拿得到 | 即時，取回要收費 | 30 天 |
| One Zone-IA | 不常存取且可重建的資料 | 即時；只存在一個 AZ | 30 天 |
| Glacier Instant Retrieval | 一季存取一次，仍要毫秒取回 | 即時 | 90 天 |
| Glacier Flexible Retrieval | 封存，可以等 | Expedited 1–5 分鐘、Standard 3–5 小時、Bulk 5–12 小時 | 90 天 |
| Glacier Deep Archive | 長期合規封存，最便宜 | Standard 12 小時內、Bulk 48 小時內 | 180 天 |

Standard-IA、One Zone-IA 與 Glacier Instant Retrieval 的最小計費物件大小是 128 KB，較小的物件也按 128 KB 收費；Lifecycle 預設也不會轉移小於 128 KB 的物件。**大量小檔轉到 IA 反而更貴。**

| S3 成本工具 | 用途 |
| --- | --- |
| Lifecycle Rule | 自動轉移到較便宜的類別或到期刪除；物件要在 Standard 滿 30 天才能轉 IA |
| 清除未完成的 Multipart Upload | 用 Lifecycle 規則自動清除殘留的分段 |
| Storage Lens | 跨帳號檢視用量與成本最佳化建議 |
| Requester Pays | 由下載方支付請求與傳輸費 |

### 版本控制與複寫

| 項目 | 重點 |
| --- | --- |
| Versioning | 防誤刪與覆寫；啟用後只能暫停、不能關閉；可加 MFA Delete |
| 複寫（CRR、SRR） | 來源與目的都要先開 Versioning |
| 既有物件 | 不會自動複寫，要用 S3 Batch Replication |
| Delete Marker | 預設不複寫，可選擇開啟 |
| SSE-KMS 物件 | 預設不複寫，要在規則中另外開啟並授權目的端的 KMS key |
| 連鎖複寫 | 不支援：A 到 B、B 到 C，A 的物件不會到 C |
| Event Notifications | 物件事件送到 SQS、SNS、Lambda 或 EventBridge |
| Batch Operations | 對大量既有物件批次執行複製、加密、加標籤 |

### 效能

| 做法 | 用途 |
| --- | --- |
| Multipart Upload | 大檔分段平行上傳，超過 100 MB 建議使用 |
| Transfer Acceleration | 經邊緣節點加速遠距離上傳 |
| Byte-Range Fetch | 平行下載或只取檔案的一部分 |
| Object Lambda | 在讀取時即時轉換內容，例如遮蔽 PII；服務已有新客戶使用限制，見下方說明 |

**Object Lambda 供應限制**：自 2025 年 11 月 7 日起，只提供已使用此服務的既有客戶與特定 AWS Partner Network（APN）合作夥伴；使用或部署相關 APN 合作夥伴方案的客戶仍可使用。新建系統可改由 API Gateway 或 Lambda Function URL 呼叫 Lambda，讀取 S3 後轉換內容，或由應用程式處理。底層資料仍可留在 S3。此限制於 2026-11-17 依[官方公告](https://docs.aws.amazon.com/AmazonS3/latest/userguide/amazons3-ol-change.html)核對。

加密與存取控制（SSE、OAC、Object Lock 等）見「加密、機密與偵測」。

## 混合雲與資料搬遷

| 工具 | 用途 | 題目訊號 |
| --- | --- | --- |
| Application Discovery Service | 盤點 on-prem 伺服器與相依關係 | 遷移前的規劃 |
| Application Migration Service（MGN） | 整台伺服器原樣搬上 EC2 | Lift-and-shift、Rehost |
| DMS | 資料庫遷移，來源可持續運作並持續複寫變更 | 停機時間最短 |
| SCT | 不同資料庫引擎之間轉換 schema | Oracle 轉 Aurora PostgreSQL 這類異質遷移 |
| DataSync | 線上搬遷或排程同步大量檔案，保留中繼資料 | NFS、SMB、HDFS 搬到 S3、EFS、FSx |
| S3 File Gateway | on-prem 以 NFS 或 SMB 存取，資料落在 S3 | 本地應用不改、資料上雲 |
| Volume Gateway | on-prem 以 iSCSI 掛載，備份成 EBS 快照 | 區塊儲存的混合備份 |
| Tape Gateway | 虛擬磁帶櫃，資料存進 Glacier | 取代實體磁帶備份 |
| Transfer Family | 受管的 SFTP、FTPS、FTP，後端是 S3 或 EFS | 合作夥伴仍用 SFTP 交換檔案 |
| Snow Family | 以實體設備離線搬遷 | 頻寬不足、用網路要傳數週以上 |

Snow Family 現況：Snowcone 與 Snowmobile 已停止供應，Snowball Edge 自 2025 年 11 月起只提供給既有客戶；考題與教材仍可能以舊的產品線出題。

## 自測

| 題目關鍵字 | 優先想到 |
| --- | --- |
| 多台 Linux 共享檔案 | EFS |
| Windows 檔案共享、AD | FSx for Windows File Server |
| HPC、機器學習、要與 S3 連動 | FSx for Lustre |
| 存取模式未知 | S3 Intelligent-Tiering |
| 幾乎不讀、要最便宜 | Glacier Deep Archive |
| 很少讀但要毫秒取回 | Glacier Instant Retrieval |
| 遠距離上傳大檔到 S3 | Transfer Acceleration 加 Multipart Upload |
| 頻寬不足、大量離線搬遷 | Snowball Edge |
| 異質資料庫遷移 | SCT 加 DMS |

## 資料來源

- [Amazon EBS General Purpose SSD volumes](https://docs.aws.amazon.com/ebs/latest/userguide/general-purpose.html)：gp3 的 IOPS 與吞吐量上限
- [Amazon EBS General Purpose Volumes](https://aws.amazon.com/en/ebs/general-purpose/)：gp3 相對 gp2 的單價
- [Understanding S3 Glacier storage classes](https://docs.aws.amazon.com/AmazonS3/latest/userguide/glacier-storage-classes.html)：Glacier 各類別的最短儲存期間與最小物件大小
- [AWS Snow device updates](https://aws.amazon.com/blogs/storage/aws-snow-device-updates)：Snow Family 的供應現況
- 其餘為個人 SAA-C03 學習筆記整理；S3 各類別的最新單價與最小計費規則請以 [S3 儲存類別頁](https://aws.amazon.com/s3/storage-classes/) 為準。
