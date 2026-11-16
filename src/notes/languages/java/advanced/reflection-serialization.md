# 反射、註解與序列化

## 反射

反射可以在執行時期取得類別的資訊（欄位、方法、建構子、註解），並動態建立物件、呼叫方法、存取欄位，包含 private 成員。

用途：框架的基礎。Spring 的依賴注入、MyBatis 的結果對應、Jackson 的 JSON 轉換、JUnit 找出測試方法、動態代理。

缺點：

- 效能比直接呼叫差（JIT 較難最佳化，Java 18 起內部改用 MethodHandle 實作，差距縮小）。
- 繞過封裝，破壞類別的設計。
- 編譯時期無法檢查，錯誤延到執行時期。
- Java 9 模組化後，存取 JDK 內部的 private 成員會被擋（Java 17 起強制），需要 `--add-opens`。

## 註解（Annotation）

註解本身只是中繼資料，**要有程式去讀它才有作用**。

- `@Retention`：
  - `SOURCE`：只在原始碼，例如 `@Override`。
  - `CLASS`：進入 class 檔但執行時讀不到，預設值。
  - `RUNTIME`：執行時可用反射讀取，框架用的都是這種。
- `@Target`：可以標在哪裡（類別、方法、欄位、參數）。
- 讀取方式：執行時期用反射（Spring、JUnit），或編譯時期用註解處理器（Lombok、MapStruct 在編譯時產生程式碼）。

## 序列化

- 類別要實作 `Serializable`。
- **一定要宣告 `serialVersionUID`**：沒宣告時由編譯器依類別結構計算，類別稍微改動（加一個欄位）就會變，反序列化舊資料時拋 `InvalidClassException`。
- `transient` 欄位不會被序列化，反序列化後是預設值。
- static 欄位不會被序列化。

**Java 原生序列化有嚴重的安全問題**：反序列化不受信任的資料可能導致遠端程式執行（gadget chain），歷史上 Apache Commons Collections、WebLogic 都出過相關漏洞。對外的資料交換應該用 JSON 等格式；必須使用時要設定反序列化過濾器（Java 9 的 `ObjectInputFilter`）。
