# 面試自測

## 15 題口頭自測

先遮住答案，每題用 30～60 秒回答，再用兩分鐘補一個實例。

| 題目 | 答案關鍵 |
| --- | --- |
| 1. Singleton 為何不代表 thread-safe？ | 實例建立安全，不等於共享可變狀態安全。 |
| 2. DCL 外層沒鎖，如何看見初始化結果？ | `volatile` 安全發布與 happens-before。 |
| 3. Spring 同類別兩個 bean definition 有幾份 singleton？ | 通常各一份，不是按類別全域唯一。 |
| 4. Simple Factory 是 GoF 模式嗎？ | 不是；Factory Method / Abstract Factory 才是。 |
| 5. Abstract Factory 新增產品種類困難在哪？ | 需要修改工廠介面及多個具體工廠。 |
| 6. 為什麼 Builder 複製集合？ | 防止外部或 Builder 後續修改破壞產品不變性。 |
| 7. 有介面就一定用 JDK Proxy 嗎？ | 不一定，框架設定可以指定類別代理。 |
| 8. 自我呼叫 `@Transactional` 為何常失效？ | 未經代理，不會觸發該呼叫的新交易攔截。 |
| 9. Proxy 和 Decorator 能靠類別圖完全區分嗎？ | 不行，要看設計意圖。 |
| 10. Java 的 Adapter 一定得多重繼承嗎？ | 不行也不需要，通常使用組合。 |
| 11. Observer 一定同步嗎？ | 不是，通知機制可以同步或非同步。 |
| 12. Strategy 把 `if` 移到哪裡？ | 業務演算法被抽出；選擇可能留在 registry / 工廠 / 組態。 |
| 13. Filter 不呼叫 chain 怎樣？ | 下游不執行，形成短路。 |
| 14. Template Method 的 hook 有何意義？ | 提供可選擴充點，不強制每個子類別實作。 |
| 15. 何時不用設計模式？ | 沒有對應變動需求、抽象成本高於收益時。 |

## 整合題：設計訂單結帳流程

需求：兩種運費規則、接舊支付 API、依序驗證請求、下單後通知。

合理拆法：

- 運費 → **Strategy**
- 舊支付 → **Adapter**
- 驗證與記錄 → **處理鏈**（Chain of Responsibility）
- 下單事件通知 → **Observer**
- 若需要授權或遠端間接存取，再考慮 **Proxy**

不要為了展示模式把全部 23 種塞進去。

可以用一條具體路徑檢查設計：請求先經驗證鏈，通過後由結帳服務使用運費 Strategy 算總額，再透過 PaymentGateway 呼叫舊支付 Adapter；訂單成功建立後發布事件，讓通知 listener 回應。若驗證鏈短路，後面的支付與通知就不應執行。若通知失敗，也不能只憑這條呼叫路徑就認定付款已被撤銷；必須另訂失敗與交易政策。

進階追問：付款失敗、資料庫已提交但通知未送出、重複事件、庫存競爭要如何處理？這些涉及交易、併發、outbox 與冪等性；GoF 模式本身不會自動解決分散式一致性。

## 七天複習安排

| 天數 | 主題 | 產出與驗收 |
| --- | --- | --- |
| Day 1 | Singleton + Java 記憶體模型 | 不看文件寫 Holder、DCL；解釋 `volatile` 與原子性差異 |
| Day 2 | 三種工廠 + Builder | 新增一個產品族，再新增一個產品種類，比較修改範圍 |
| Day 3 | Strategy + Template Method | 各寫一個費率 / 匯入流程，說明為何用組合或繼承 |
| Day 4 | Proxy + Spring AOP | 說明代理呼叫、自我呼叫、`final` 方法差異 |
| Day 5 | Decorator + Adapter | 用同一 API 練習附加功能與介面轉換，講清意圖 |
| Day 6 | Observer + 責任鏈 | 定義取消訂閱、失敗政策、短路與處理順序 |
| Day 7 | 整合與口試 | 不看筆記回答上面 15 題，補讀 State、Command、Facade |
