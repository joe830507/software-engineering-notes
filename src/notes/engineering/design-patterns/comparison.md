# 比較與速查

## 容易混淆的模式

| 比較 | 判斷關鍵 |
| --- | --- |
| Strategy vs Template Method | Strategy 用組合替換演算法；Template Method 用繼承變更固定流程中的步驟。 |
| Strategy vs State | 前者重點是演算法可互換；後者重點是物件依內部狀態改變行為與轉移。不能只用「誰切換」判斷。 |
| Proxy vs Decorator | 結構可能相同，優先看存取控制 / 間接性，還是可組合的附加責任。 |
| Adapter vs Decorator | Adapter 對接不同契約；Decorator 通常維持原契約並擴充責任。 |
| Adapter vs Facade | Adapter 解決契約不相容；Facade 對複雜子系統提供較簡單入口。 |
| Factory vs Strategy | 前者處理建立；後者處理行為替換，可以搭配。 |
| Builder vs Factory | Builder 管理建構步驟與參數；Factory 抽離產品建立與選擇，並非只能建立簡單物件。 |
| Observer vs 責任鏈 | Observer 通知多位訂閱者；責任鏈依序路由 / 處理請求，常能短路。 |

## 與框架的對照

以「訂單狀態」和「運費規則」比較 State 與 Strategy：標準配送、快遞配送是兩套可選算法，適合 Strategy；待付款訂單可以付款，已取消訂單不能再付款，這是狀態限制了允許的操作，適合 State。State 可以把轉移放在狀態物件或 Context 中，不能只靠「外部選擇還是內部切換」來區分。

再比較 Bridge 與 Adapter：「通知種類 × 傳送管道」若要各自擴充，可以事先把通知與 Email / SMS 管道分離，這是 Bridge 的設計方向；若現在已經有一個方法不相容的舊簡訊 API，要接到管道介面上，則是 Adapter。兩者甚至可以出現在同一個系統中。

| 框架 / API | 可連結觀念 | 必須補充的邊界 |
| --- | --- | --- |
| Spring singleton bean | 共享實例管理 | 每容器、每 bean definition；不保證業務方法執行緒安全。 |
| Spring AOP、交易攔截 | Proxy | 呼叫須經過代理；預設代理模式下自我呼叫是常見陷阱。 |
| JdbcTemplate | 模板流程 + callback / Strategy | 不要求業務類別繼承 JdbcTemplate。 |
| Servlet Filter | 責任鏈 / 攔截鏈 | 可前後處理與短路，不必第一個處理完就結束。 |
| BufferedReader 包裝 Reader | Decorator | 加入緩衝等責任，仍需管理資源生命週期。 |
| Spring 事件 | Observer / 事件通知 | 同步、非同步與交易時機須依設定及使用方式判斷。 |
| Spring FactoryBean | 建立物件的擴充點 | 不要僅憑名稱就等同 GoF Factory Method 的完整結構。 |

## 其餘 12 種 GoF 模式速查

前面的頁面完整涵蓋了 11 種，其餘的整理如下：

| 分類 | 模式 | 一句話意圖 | Java / 後端練習方向 |
| --- | --- | --- | --- |
| 創建型 | Prototype 原型 | 透過複製既有物件建立新物件 | 設定範本；辨別淺拷貝與深拷貝，不必強用 `Object.clone` |
| 結構型 | Bridge 橋接 | 分離抽象與實作，讓兩個維度獨立變化 | 通知種類 × 傳送管道；區分事先設計的分離與 Adapter 的相容轉換 |
| 結構型 | Composite 組合 | 讓個別物件與樹狀組合具有共同操作 | 目錄 / 檔案、組織樹；避免強迫葉節點支援無意義操作 |
| 結構型 | Facade 外觀 | 提供子系統的簡化入口 | 訂單流程入口；避免變成承攬所有業務的巨型服務 |
| 結構型 | Flyweight 享元 | 共享可共用的內在狀態以節省記憶體 | 大量字元 / 樣式；區分內在與外在狀態，不是任何快取都叫享元 |
| 行為型 | Command 命令 | 將請求封裝為物件 | 工作佇列、undo；需要可序列化與重試時補冪等設計 |
| 行為型 | Interpreter 解譯器 | 表示並解譯簡單語法 | 小型條件表達式；複雜語言可交給 parser 工具 |
| 行為型 | Iterator 迭代器 | 隱藏集合表示，提供遍歷方式 | `Iterator`；遍歷期間修改集合的契約 |
| 行為型 | Mediator 中介者 | 集中協調多個物件互動 | 聊天室、流程協調；避免中介者過度肥大 |
| 行為型 | Memento 備忘錄 | 保存並恢復狀態而不暴露內部細節 | 編輯器快照；記憶體成本與敏感資料 |
| 行為型 | State 狀態 | 依內部狀態改變行為 | 訂單待付款 / 已付款 / 已取消；檢查非法轉移 |
| 行為型 | Visitor 訪問者 | 將操作從穩定物件結構分離 | AST 分析；新增操作容易，新增節點種類較麻煩 |
