# IAM、Organizations 與身分整合

> 安全題的判斷順序：先看「**誰**」在存取（身分），再看資料是否加密，最後看網路邊界與偵測。這一頁處理第一步。

## IAM 基本元件

| 元件 | 說明 |
| --- | --- |
| User | 代表一個人或應用程式的長期身分，可有密碼與 Access Key |
| Group | User 的集合，只用來批次授權，不能巢狀 |
| Role | 沒有長期憑證的身分，由「被信任的主體」透過 STS 取得**臨時憑證** |
| Policy | JSON 文件，由 Effect、Action、Resource、Condition（以及資源政策的 Principal）組成 |

設計原則：

- **最小權限**：只給完成工作所需的權限。
- **能用 Role 就不用長期 Access Key**：EC2、Lambda、ECS 等服務用 Role；跨帳號與聯合身分也是用 Role。EC2 透過 Instance Profile 取得 Role 的臨時憑證。
- **Root 帳號只做必須由 Root 才能做的事**，並啟用 MFA，不產生 Access Key。

## 權限評估順序

IAM 預設一切拒絕（隱含拒絕），除非有明確允許；**明確拒絕（Explicit Deny）永遠勝過任何允許**。

以下是同帳號請求的檢查項目，不能當成每列都必須有 Allow 的固定流水線。先確認政策是否存在、是否適用，再依授權來源判斷。

| 步驟 | 檢查什麼 | 沒有允許時 |
| --- | --- | --- |
| 1 | 所有適用的政策（SCP、RCP、資源政策、身分政策、Permission Boundary、Session policy）是否有 Explicit Deny | 有任何一個就直接拒絕 |
| 2 | 適用的 **RCP**（Resource Control Policy）是否允許 | 受其約束時拒絕 |
| 3 | 適用的 **SCP**（Service Control Policy）是否允許 | 受其約束時拒絕 |
| 4 | 資源政策（Resource-based policy） | 見下方說明 |
| 5 | 身分政策（Identity-based policy） | 若無其他有效授權則拒絕 |
| 6 | 已設定的 Permissions Boundary 是否允許 | 一般身分政策授權須與其取交集；未設定不代表拒絕 |
| 7 | 建立 session 時傳入的 Session policy 是否允許 | 一般 session 權限須與其取交集；使用臨時憑證不代表一定有此政策 |

### 同帳號資源政策的例外

資源政策在 `Principal` 直接指定下列 ARN 時，對該筆授權的限制不同：

| 授權對象 | 隱含拒絕的影響 |
| --- | --- |
| IAM user ARN | 不受身分政策或 Boundary 的隱含拒絕限制 |
| IAM role ARN | 仍受 Boundary 與 Session policy 的隱含拒絕限制 |
| Assumed-role session ARN | 不受身分政策、Boundary 或 Session policy 的隱含拒絕限制 |

這些例外不能覆蓋適用的 Explicit Deny，也不能繞過適用的 SCP／RCP。Role ARN 與 role session ARN 不是相同授權對象。

補充：

- 多數同帳號情境可由身分政策或資源政策提供 Allow，但仍須套用其他限制。AssumeRole 需符合 Role 信任政策；KMS 需符合 Key policy 的授權方式，例如直接授權或允許帳號以 IAM 政策授權。
- **跨帳號**直接存取資源時，請求者帳號檢查身分政策與其限制，資源擁有者帳號檢查資源政策與其限制，**兩邊都 Allow 才通過**。
- SCP 與 RCP 都只是「上限」，不授權；SCP 套用在帳號內的**主體**，RCP 套用在帳號內的**資源**。管理帳號不受 SCP 限制，service-linked role 也不受 SCP 影響。

> 對照舊教材：許多資料只寫「Deny → SCP → 身分／資源政策 → Boundary → Session」。新版官方文件加入 RCP，考題與實務都可能出現。

## 權限機制比較

| 機制 | 套用對象 | 能否授權 | 重點 |
| --- | --- | --- | --- |
| Identity-based policy | User、Group、Role | 能 | 最常見的授權方式 |
| Resource-based policy | 資源本身（S3 bucket、SQS、KMS key、Lambda） | 能 | 可直接指定跨帳號 Principal |
| IAM Role | 服務、跨帳號、聯合身分 | 能 | 透過 STS 取得臨時憑證，優於長期 Access Key |
| Permission Boundary | 單一 User 或 Role | 不能，只設上限 | 讓開發者自建 Role 但不會超權 |
| SCP | OU 或成員帳號，含該帳號的 root user | 不能，只設上限 | 不影響管理帳號與 service-linked role |
| RCP | 帳號內的資源 | 不能，只設上限 | 集中限制資源可被誰存取（資料邊界） |
| Session policy | 一次臨時 session | 不能，只設上限 | AssumeRole 時傳入，進一步縮小該 session 權限 |
| Policy Condition | 任一 policy 內 | 加上條件 | `aws:SourceIp`、`aws:SecureTransport`、`aws:PrincipalOrgID`、MFA |

完整 S3 bucket policy 範例（將兩個 `my-bucket` 換成實際名稱）：

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyInsecureTransport",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": ["arn:aws:s3:::my-bucket", "arn:aws:s3:::my-bucket/*"],
      "Condition": { "Bool": { "aws:SecureTransport": "false" } }
    }
  ]
}
```

此政策拒絕非 TLS 請求；`Principal: "*"` 表示拒絕規則適用於所有主體，不是開放公開存取。實際存取仍需另有 Allow。若 bucket 已有政策，應合併此 Statement，保留必要的原有授權。

## 多帳號與身分整合

| 服務 | 用途 | 辨識關鍵 |
| --- | --- | --- |
| Organizations | 多帳號集中管理、合併帳單 | OU、SCP、Tag Policy |
| Control Tower | 自動建立多帳號 Landing Zone | 預防型控制用 SCP、偵測型控制用 Config |
| IAM Identity Center | 多帳號與 SAML 應用的單一登入 | Permission Set；可接外部 IdP 或 AD |
| AWS Managed Microsoft AD | 雲端上真正的 AD | 可與 on-prem AD 建立信任 |
| AD Connector | 把驗證請求轉送回 on-prem AD | 不在雲端存目錄資料 |
| Simple AD | 獨立的輕量目錄 | 不能與 on-prem AD 建立信任 |
| Resource Access Manager（RAM） | 跨帳號共享子網路、Transit Gateway 等資源 | 不必複製資源 |

為什麼要多帳號：帳號是 AWS 最強的**隔離邊界**（權限、配額、帳單、爆炸半徑），因此常見做法是依環境（開發、正式）與團隊拆帳號，再用 Organizations 加 SCP 設定共同護欄。

## 應用程式使用者身分（Cognito）

IAM 管的是「AWS 資源的操作者」；你的 App 的**終端使用者**則用 Cognito。

| 元件 | 用途 | 辨識關鍵 |
| --- | --- | --- |
| User Pool | 應用程式使用者的註冊與登入目錄，簽發 JWT | 可接社群登入與 SAML／OIDC IdP、支援 MFA；可直接當 API Gateway 與 ALB 的驗證來源 |
| Identity Pool | 把身分換成 AWS 臨時憑證 | 讓行動或網頁用戶端直接存取 S3、DynamoDB；可允許未登入的訪客身分 |

常見組合：**User Pool 負責登入，Identity Pool 再把 token 換成 IAM Role 的臨時憑證**。

## 自測

| 題目情境 | 答案方向 |
| --- | --- |
| 限制整個帳號或 OU 能用的服務與 Region | SCP |
| 讓開發者自建 Role，但不可超過某範圍 | Permission Boundary |
| 多帳號單一登入 | IAM Identity Center |
| App 的使用者註冊與登入 | Cognito User Pool |
| App 使用者直接存取 S3 | Cognito Identity Pool |
| 跨帳號存取 S3 且不想建 IAM User | 資源政策或在對方帳號建 Role 後 AssumeRole |
| 想知道誰在何時呼叫了 API | CloudTrail（見「加密、機密與偵測」） |

## 資料來源

- [Policy evaluation logic](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_evaluation-logic.html)：評估順序與 RCP
- [Cross-account policy evaluation logic](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_evaluation-logic-cross-account.html)：跨帳號需兩邊都允許
- 權限機制比較、身分整合與 Cognito：個人 SAA-C03 學習筆記
- [Permissions boundaries](https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_boundaries.html)：同帳號資源政策授權的例外。
- [Principal policy element](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements_principal.html)：資源政策的主體欄位。
- 權限評估與範例於 2026-11-17 核對。
