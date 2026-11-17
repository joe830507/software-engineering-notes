# AI／ML 基礎與 AWS 生成式 AI 服務

> 對應 AIF-C01 的 Domain 1（AI 與 ML 基礎，20%）與 Domain 2（生成式 AI 基礎，24%）。AIF 是基礎級證照，考「看得懂、會選擇」，不考寫程式、調超參數或數學推導。
> 作答原則：題目問「最少投入、最快上線」選受管服務（Bedrock、現成的 AI 服務）；問「完全掌控模型與訓練」才選 SageMaker AI。

## 名詞層級

以下是由大到小的包含關係，後兩項是近年新增的應用型態。

| 名詞 | 定義 |
| --- | --- |
| AI | 讓機器表現出類似人類智慧的行為，範圍最大 |
| ML | AI 的子集；不靠人寫規則，而是從資料中學出規則 |
| 深度學習 | ML 的子集；用多層神經網路學習，適合影像、語音、文字等非結構化資料 |
| 生成式 AI | 深度學習的子集；產生新的內容（文字、影像、音訊、程式碼），而不只是分類或預測 |
| Foundation Model（FM） | 用大量通用資料預訓練的大型模型，可適應多種下游任務 |
| LLM | 專門處理文字的 FM |
| Agentic AI | 讓模型自己規劃步驟、呼叫工具、完成多步驟任務，而不只是回答一次問題 |

| 其他基本名詞 | 定義 |
| --- | --- |
| 模型 | 訓練後得到的成品，輸入資料就輸出預測 |
| 演算法 | 從資料學出模型的方法 |
| 訓練 | 用資料調整模型參數的過程 |
| 推論 | 用訓練好的模型對新資料做預測 |
| NLP | 讓機器理解與產生人類語言 |
| 電腦視覺 | 讓機器理解影像與影片 |

## 學習類型與常見技術

| 類型 | 資料 | 做什麼 | 典型例子 |
| --- | --- | --- | --- |
| 監督式學習 | 有標籤 | 學輸入到標準答案的對應 | 垃圾信分類、房價預測 |
| 非監督式學習 | 無標籤 | 自己找出資料中的結構 | 客戶分群、異常偵測 |
| 強化學習 | 沒有固定資料，靠環境回饋 | 透過獎勵與懲罰學出最佳策略 | 機器人控制、遊戲、動態定價 |
| 自監督學習 | 無標籤，由資料自己產生標籤 | 例如遮住一個字讓模型去猜 | FM 的預訓練 |

| 題目要的結果 | 技術 | 類型 |
| --- | --- | --- |
| 一個連續數值（價格、銷量、溫度） | 迴歸 | 監督式 |
| 一個類別（是或否、哪一種） | 分類 | 監督式 |
| 把相似的資料歸成群，事先不知道有哪些群 | 分群 | 非監督式 |
| 找出與多數不同的資料 | 異常偵測 | 多為非監督式 |
| 依時間順序預測未來 | 時間序列預測 | 監督式 |
| 推薦使用者可能喜歡的項目 | 推薦系統 | 多種 |

## 何時用、何時不該用

| 情境 | 原因 |
| --- | --- |
| 需要確定、可重現的結果 | ML 給的是機率性的預測，不是保證的答案 |
| 用簡單規則就能解決 | 寫規則比訓練模型便宜且容易維護 |
| 成本高於效益 | 資料蒐集、訓練、維運的成本超過帶來的價值 |
| 沒有足夠或合適的資料 | 模型品質取決於資料 |

| 考量 | 傾向傳統 ML | 傾向 FM |
| --- | --- | --- |
| 任務 | 單一、定義明確，例如表格資料的預測 | 語言、內容生成、多種任務 |
| 可解釋性與法規 | 要求能解釋每個決策 | 可接受黑箱 |
| 成本與延遲 | 模型小、便宜、快 | 模型大、每次推論較貴 |
| 自有標註資料 | 有足夠資料可訓練 | 資料少，靠預訓練的知識 |

## ML 開發生命週期與 MLOps

| 階段 | 做什麼 | 對應的 AWS 服務或功能 |
| --- | --- | --- |
| 定義商業問題 | 確認目標與成功指標 | |
| 資料蒐集與準備 | 蒐集、清理、標註、探索 | S3、Glue、SageMaker Data Wrangler、SageMaker Ground Truth |
| 特徵工程 | 把原始資料轉成模型可用的特徵 | SageMaker Feature Store |
| 訓練與調校 | 選演算法、訓練、調超參數 | SageMaker AI 的訓練工作與自動調校 |
| 評估 | 用沒看過的資料檢驗模型 | SageMaker Clarify、Bedrock Model Evaluation |
| 部署 | 把模型放上線提供推論 | SageMaker 端點、Bedrock |
| 監控 | 觀察預測品質與資料漂移 | SageMaker Model Monitor、CloudWatch |
| 重新訓練 | 品質下降時用新資料再訓練 | SageMaker Pipelines |

資料通常切成訓練集、驗證集、測試集：**訓練集用來學，驗證集用來調整，測試集留到最後評估**。超參數是訓練前由人設定的值（如學習率、訓練回合數），參數則是模型在訓練中自己學出來的值。

| MLOps 概念 | 意義 |
| --- | --- |
| 實驗管理 | 記錄每次訓練的設定與結果，方便比較 |
| 可重複的流程 | 用 pipeline 自動化，而不是手動執行 |
| 模型註冊 | 集中管理模型版本與核准狀態 |
| 模型監控 | 偵測資料漂移與模型漂移 |
| 重新訓練 | 依監控結果或排程更新模型 |

### 推論類型（SageMaker AI）

| 類型 | 特性 | 何時選 |
| --- | --- | --- |
| 即時（Real-time） | 常駐端點、低延遲 | 互動式應用，需要立即回應 |
| 無伺服器（Serverless） | 沒有流量時不收費，有冷啟動 | 流量間歇、不可預期 |
| 非同步（Asynchronous） | 請求排入佇列，可處理大型輸入與較長的處理時間 | 輸入檔很大或處理要數分鐘，不必立即回應 |
| 批次（Batch Transform） | 一次處理整批資料，不需要常駐端點 | 離線對大量資料做預測 |

## 模型評估指標

分類問題的指標都從混淆矩陣的四個數字算出來：真陽性、偽陽性、真陰性、偽陰性。

| 指標 | 意義 | 何時看重 |
| --- | --- | --- |
| Accuracy | 全部預測中答對的比例 | 各類別數量平衡時 |
| Precision | 預測為陽性的當中，真的是陽性的比例 | 誤報的代價高，例如把正常信判成垃圾信 |
| Recall | 實際為陽性的當中，被抓出來的比例 | 漏報的代價高，例如疾病篩檢、詐欺偵測 |
| F1 | Precision 與 Recall 的調和平均 | 類別不平衡、兩者都重要 |
| AUC-ROC | 模型區分兩個類別的整體能力，越接近 1 越好 | 比較不同模型 |

| 迴歸指標 | 意義 |
| --- | --- |
| MAE | 預測誤差的平均絕對值 |
| MSE、RMSE | 誤差平方的平均，對大誤差懲罰較重；RMSE 是它的平方根 |
| R² | 模型解釋了多少比例的資料變異，越接近 1 越好 |

## AWS 受管 AI 服務（直接呼叫 API，不需訓練）

| 服務 | 一句話辨識 |
| --- | --- |
| Comprehend | 文字分析：情緒、實體、關鍵詞、語言偵測、PII |
| Translate | 文字翻譯 |
| Transcribe | 語音轉文字 |
| Polly | 文字轉語音 |
| Lex | 聊天與語音機器人 |
| Rekognition | 影像與影片辨識、人臉比對、內容審核 |
| Textract | 從掃描文件擷取文字、表格、表單 |
| Personalize | 個人化推薦 |
| Kendra | 企業文件的智慧搜尋 |
| SageMaker AI | 自行建置、訓練、部署機器學習模型 |

## 生成式 AI 核心概念

| 名詞 | 定義 |
| --- | --- |
| Token | 模型處理文字的最小單位，可能是一個字、半個字或標點；輸入與輸出都以 token 計費 |
| Context window | 模型一次能處理的 token 上限，包含輸入與輸出 |
| Embedding | 把文字、影像等轉成一串數字（向量），語意相近的內容向量也相近 |
| Chunking | 把長文件切成小段再做 embedding，讓檢索更精準、也符合 context window |
| Transformer | 現代 LLM 的架構，用注意力機制一次看整段文字的前後關係 |
| 多模態模型 | 能同時處理多種形式的輸入或輸出，例如文字加影像 |
| Diffusion 模型 | 從雜訊逐步還原出影像，是影像生成的主流做法 |
| Prompt engineering | 設計輸入的指令與範例，引導模型產生想要的輸出 |
| Context engineering | 決定要把哪些資訊（文件、對話紀錄、工具結果）放進 context window，讓模型有正確的依據 |

### FM 生命週期

1. **資料選擇**：決定用哪些資料預訓練或客製。
2. **模型選擇**：依任務、成本、延遲挑選合適的 FM。
3. **預訓練**：用大量無標籤資料以自監督方式訓練，成本最高，通常由模型供應商完成。
4. **微調**：用較少的專屬資料讓模型適應特定任務。
5. **評估**：以自動指標與人工評估檢驗品質。
6. **部署**：上線提供推論。
7. **回饋**：蒐集使用結果，回頭改進模型或 prompt。

### 優點與限制

| 限制 | 說明 | 緩解方式 |
| --- | --- | --- |
| 幻覺 | 產生看似合理但錯誤的內容 | RAG、Guardrails 的 grounding 檢查、人工審核 |
| 不確定性 | 同樣的輸入可能得到不同輸出 | 調低 temperature |
| 可解釋性低 | 難以說明為何產生某個輸出 | 需要解釋時改用較簡單的模型 |
| 知識有截止日 | 不知道訓練之後的事，也不知道企業內部資料 | RAG |
| 不準確 | 特定領域的回答可能有誤 | RAG、微調、評估 |

優點是適應性（同一個模型處理多種任務）、回應快、能用自然語言對話與生成內容。

### 選擇模型的考量

| 考量 | 要問的問題 |
| --- | --- |
| 模型類型與模態 | 需要文字、影像、embedding 還是多模態 |
| 效能 | 在這個任務上的品質是否足夠 |
| 延遲 | 使用者能等多久；小模型通常較快 |
| 成本 | 每個 token 的單價與預期用量 |
| 模型複雜度 | 大模型能力強但貴且慢；**不是越大越好** |
| 限制 | Context window、輸出長度、支援的語言 |
| 合規 | 資料落地、產業法規、授權條款 |

## Agentic AI

Agent 是以 FM 為大腦、能自行規劃並使用工具完成任務的系統。

| 概念 | 說明 |
| --- | --- |
| 工具使用 | Agent 呼叫 API、查資料庫、執行程式碼，取得模型本身沒有的資訊或能力 |
| Model Context Protocol（MCP） | 開放標準，統一 agent 連接外部工具與資料來源的方式，不必為每個工具各寫一套整合 |
| 記憶管理 | 短期記憶保留當前對話；長期記憶跨對話保存使用者偏好與事實 |
| 工作流程編排 | 把任務拆成步驟，決定順序、分支與重試 |
| 多代理系統 | 多個各有專長的 agent 協作；常見模式是由一個主管 agent 分派工作給其他 agent |

## AWS 的生成式 AI 服務

| 服務 | 定位 |
| --- | --- |
| Amazon Bedrock | 以單一 API 使用多家供應商的 FM，全受管、無伺服器 |
| Amazon Nova | Amazon 自家的 FM 系列，透過 Bedrock 使用，涵蓋文字、多模態、影像與影片生成 |
| Amazon Bedrock AgentCore | 把 agent 部署到正式環境並安全營運的一組服務，可搭配任何框架與模型 |
| Strands Agents | AWS 開源的 agent 開發 SDK，用少量程式碼定義模型、工具與 prompt |
| Amazon SageMaker AI | 自行建置、訓練、部署模型的完整平台 |
| SageMaker JumpStart | SageMaker 內的模型中心，提供預訓練模型與解決方案範本，可一鍵部署或微調 |
| Amazon Quick | 給商務使用者的 AI 工作平台，結合商業智慧（原 QuickSight）、企業資料問答與自動化 |
| Kiro | AI 輔助的開發環境，以規格驅動的方式協助撰寫程式 |
| AWS Transform | 以 agent 協助大型應用與基礎設施的遷移與現代化 |

舊教材中的 Amazon Q Business、Amazon Q Developer、QuickSight，在目前的考試指南裡對應的是 Amazon Quick 與 Kiro。

### Amazon Bedrock 的功能

| 功能 | 用途 |
| --- | --- |
| 模型存取 | 以同一套 API 使用 Amazon、Anthropic、Meta、Mistral 等多家的模型 |
| Knowledge Bases | 受管的 RAG：連接資料來源，自動完成切塊、embedding、存入向量庫與檢索 |
| Agents | 讓模型規劃多步驟任務，並呼叫 API 與 Knowledge Bases |
| Guardrails | 過濾有害內容、封鎖指定主題、遮蔽 PII、檢查回答是否有依據 |
| Model Evaluation | 以自動指標、LLM 評審或人工比較模型與 RAG 的品質 |
| Prompt Management | 建立、版本化與重複使用 prompt |
| Flows | 以視覺化方式串接 prompt、模型、Knowledge Bases 等步驟 |
| 模型客製化 | 微調、持續預訓練、蒸餾；得到的是只有自己能用的模型副本 |
| Custom Model Import | 把在別處訓練的模型匯入 Bedrock 使用 |
| Prompt caching | 快取重複出現的 prompt 前段，降低成本與延遲 |
| 批次推論 | 非即時地處理大量請求，單價較低 |
| Provisioned Throughput | 預購固定的處理容量，適合穩定的大流量 |

**資料處理原則**：客戶的 prompt 與輸出不會用來訓練基礎模型，也不會分享給模型供應商；傳輸中與靜態資料都有加密保護。**加密不代表推論一定在呼叫端所選的 Region 執行**，資料處理位置還要看推論模式。

| 推論模式 | 資料處理位置 |
| --- | --- |
| 區域內推論 | 使用支援區域內推論的模型與呼叫方式，在指定 Region 處理 |
| Geographic cross-Region inference | 可路由到 profile 所列地理範圍內的其他 Region，不保證在單一 Region |
| Global cross-Region inference | 可路由到全球支援的商用 AWS Region，不保證留在原地理範圍 |

有單一 Region 的資料落地需求時，應確認模型、推論模式與 profile 的目的地清單；不能只看 SDK 設定的 Region。以上跨區域推論行為於 2026-11-17 依[官方文件](https://docs.aws.amazon.com/bedrock/latest/userguide/cross-region-inference.html)核對。

### AgentCore 的組成

| 元件 | 用途 |
| --- | --- |
| Runtime | 無伺服器的 agent 執行環境，每個工作階段彼此隔離 |
| Memory | 受管的短期與長期記憶 |
| Gateway | 把既有的 API 與 Lambda 轉成 agent 可用的工具，支援 MCP |
| Identity | 管理 agent 的身分，以及它代表使用者存取其他服務時的授權 |
| Policy | 以規則限制 agent 可以執行哪些動作 |
| Observability | 追蹤與監控 agent 的每個步驟 |
| 內建工具 | 安全的程式碼執行環境與雲端瀏覽器 |

### 計價取捨

| 計價方式 | 特性 | 何時選 |
| --- | --- | --- |
| On-demand（依 token） | 用多少付多少，沒有承諾 | 流量不可預期、剛開始試驗 |
| 批次推論 | 單價較低，但不是即時 | 大量、不急的工作 |
| Provisioned Throughput | 預付固定容量，保證處理量 | 穩定的大流量 |
| 自訂模型 | 另有訓練費與模型儲存費，推論通常需要專屬容量 | 確實需要微調時 |

影響成本的因素：輸入與輸出的 token 數量、模型大小、是否跨 Region、是否使用快取。**輸出 token 的單價通常比輸入高。**

## 資料來源

範疇、配分與考試範圍內的服務清單依 AWS 官方考試指南；各服務與概念的說明為個人 AIF-C01 學習手冊整理，部分新服務（Quick、Kiro、AgentCore 等）的細節請以官方文件為準。

- [AWS Certified AI Practitioner (AIF-C01) 考試指南](https://docs.aws.amazon.com/aws-certification/latest/ai-practitioner-01/ai-practitioner-01.html)
- [Content Domain 1](https://docs.aws.amazon.com/aws-certification/latest/ai-practitioner-01/ai-practitioner-01-domain1.html)、[Domain 2](https://docs.aws.amazon.com/aws-certification/latest/ai-practitioner-01/ai-practitioner-01-domain2.html)
- [In-Scope AWS Services](https://docs.aws.amazon.com/aws-certification/latest/ai-practitioner-01/aif-01-in-scope-services.html)：考試範圍內的服務。已查證 Bedrock、AgentCore、Nova、Quick、Kiro、AWS Transform、Strands Agents、SageMaker JumpStart、Personalize 等都在清單上；Kendra、Augmented AI、S3 Vectors、Amazon Q 未列在清單（官方說明清單非窮盡、可能變動），本筆記保留是為了與 SAA 與實務對照。
- 考試形式：官方頁面載明 50 題計分、15 題不計分、通過分數 700（100–1,000 量表）；時間與費用請見 [認證頁](https://aws.amazon.com/certification/certified-ai-practitioner/)。
