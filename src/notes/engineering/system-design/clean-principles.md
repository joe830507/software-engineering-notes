# Clean Architecture（一）：範式與 SOLID 設計原則

> 對應《Clean Architecture 無瑕的程式碼：整潔的軟體設計與架構篇》Part I–III（第 1–11 章）。先從程式設計的三種範式講起，再到五個設計原則（SOLID）。下一頁接續元件原則、邊界與整潔架構。

## 設計與架構的目標

### 設計與架構是同一件事

書中的立場：**架構與設計沒有差別**。從最高層（系統結構）到最低層（程式碼細節）是連續的，沒有一條明確的分界線。

### 目標：用最少的人力建構與維護

軟體架構的目標是**讓建構與維護系統所需的人力降到最低**。糟糕的架構會呈現出這樣的現象：隨著版本推進，每新增一行程式碼的成本越來越高，工程師人數增加，但產能反而下降。

書中批評「以後再整理」的心態：想靠快速上線搶市場，但**亂的程式碼讓你越寫越慢**，即使短期看起來快，長期更慢。要比競爭對手跑得快，唯一的辦法是保持程式碼乾淨。

### 兩種價值：行為與結構

| 價值 | 說明 |
| --- | --- |
| **行為**（behavior） | 讓系統**符合需求**，做出功能 |
| **結構**（architecture） | 讓系統**容易變更**，也就是軟體（software）之所以叫「軟」的原因 |

兩者都很重要，但如果必須在兩者之間擇一：一個**不能運作但容易修改**的系統，可以被修好；一個**能運作但無法修改**的系統，在需求改變時就會失去價值。所以架構（結構）更重要。

用 **Eisenhower 矩陣**（緊急／重要）來看：功能通常是緊急的，但不一定重要；架構是重要的，卻**很少緊急**。管理階層容易只看到緊急的事，因此**維護結構是開發者的責任**，必須主動為它爭取空間。

## 三種程式設計範式

三種範式各自**拿走**了程式設計師的某種能力，而不是增加：

| 範式 | 限制了什麼 | 帶來什麼 |
| --- | --- | --- |
| **結構化程式設計** | 限制**直接控制權轉移**（`goto`） | 可以把程式拆成可證明、可測試的小單元（功能分解） |
| **物件導向程式設計** | 限制**間接控制權轉移**（函式指標） | 多型讓**依賴方向**可以任意翻轉，形成外掛式架構 |
| **函數式程式設計** | 限制**賦值**（變數不可變） | 避免競爭條件、死結、並行更新問題 |

### 結構化程式設計

- Dijkstra 發現 `goto` 的濫用會破壞把程式拆解成更小單位的能力；用**序列、選擇、迴圈**這三種結構就足以表達任何程式。
- 他想以數學證明程式正確，但沒成功。最後我們改用**科學方式**：像科學理論一樣，**測試只能證明程式有錯，無法證明程式沒錯**。所以結構化程式設計的價值在於讓程式能被**反證**（可測試）。
- 架構意義：**功能分解**。把大問題拆成可獨立測試的小單位。

### 物件導向

書中不用常見的「封裝、繼承、多型」三要素來定義 OO，因為：

- 封裝在 C 語言（標頭檔與實作檔）裡早就做得很好，反而是 C++／Java 把成員曝露在標頭或類別中而削弱了封裝。
- 繼承在 C 中可以用結構體手動模擬，OO 語言只是更方便。
- **多型**才是真正的新能力：C 也能用函式指標做到，但風險高；OO 語言讓它變得**安全方便**。

多型的重點是**依賴反向**：

```text
控制流（執行時）：  高階模組 ──呼叫──► 低階模組
原始碼依賴（編譯時）：高階模組 ──依賴──► 介面 ◄──實作── 低階模組
```

有了多型，**任何原始碼依賴都可以反向**，所以架構師能完全控制依賴方向，並藉此做出**外掛式架構**：高階業務規則不依賴 UI、資料庫，而是它們依賴業務規則，各自可以獨立開發與部署。

### 函數式程式設計

- 競爭條件、死結、並行更新問題，都源自**可變變數**。若變數永不改變，這些問題不會發生。
- 實務上不能完全不可變，因此架構上要**區隔可變性**：把元件分成純函數式的部分與必須有可變狀態的部分，讓可變狀態受交易式記憶體等機制保護，並盡量縮小可變部分。
- **事件溯源（event sourcing）**：只保存交易（事件），不保存狀態，需要時重算狀態。就像版本控制只存增量。只做新增與讀取，不做更新與刪除，因此沒有並行更新問題。

## SOLID 原則

SOLID 是在**模組／類別層級**談設計，目的是讓軟體容易變更、容易理解，並成為可重用元件的基礎。

| 原則 | 一句話 |
| --- | --- |
| **S**RP 單一職責 | 一個模組應該只對**一個角色（actor）**負責 |
| **O**CP 開放封閉 | 對擴充開放，對修改封閉 |
| **L**SP Liskov 替換 | 子型別必須能替換其基底型別 |
| **I**SP 介面隔離 | 不要讓使用者依賴它用不到的東西 |
| **D**IP 依賴反向 | 依賴抽象，不依賴具體 |

### SRP：單一職責原則

常見的誤解是「一個函式只做一件事」，那是另一個原則。SRP 的正確表述是：

> 一個模組應該**只對唯一的一個角色負責**。

「角色」指會要求變更的一群人（actor／利害關係人）。

**症狀一：意外的重複。** 書中的 `Employee` 類別有 `calculatePay()`（財務部門使用）、`reportHours()`（人資部門使用）、`save()`（DBA 使用）。`calculatePay()` 與 `reportHours()` 共用同一個計算正規工時的函式 `regularHours()`。後來財務部門要調整計算規則，修改了 `regularHours()`，人資部門的報表就算錯了，而人資部門根本不知道。

**症狀二：合併衝突。** 多位開發者因不同原因修改同一個類別，就容易衝突。

**解法：** 把資料與函式分開，讓**每個類別只服務一個角色**；再用 **Facade** 之類的方式提供統一入口，避免使用者要知道三個類別。

### OCP：開放封閉原則

> 軟體系統要容易變更，就必須設計成**新增行為時只需新增程式碼，而不是修改現有程式碼**。

書中的範例是財務報表：原本把資料顯示在網頁，現在要新增列印報表。若設計得好，新需求只會新增程式碼，不會動到舊的。作法是：

1. 先依責任分離（SRP）：計算報表資料、呈現成網頁或 PDF。
2. 再組織依賴方向：**讓受保護的元件被不受保護的元件依賴**。

```text
Interactor（業務規則，最受保護） ◄── Controller
                                  ◄── Presenter ◄── View
```

所有依賴箭頭都指向 Interactor，所以對「畫面怎麼呈現」的修改不會影響業務規則。越高階的元件越應該被保護，**OCP 是系統層級架構的主要驅動力**。

### LSP：Liskov 替換原則

Liskov 的原始表述：若對每個型別 `S` 的物件 `o1`，都存在型別 `T` 的物件 `o2`，使所有針對 `T` 寫的程式 `P` 在用 `o1` 取代 `o2` 時行為都不變，則 `S` 是 `T` 的子型別。

白話：**子類別不能讓使用基底型別的程式出錯**。經典反例是「正方形繼承長方形」：長方形的寬高可獨立設定，正方形不行，導致使用長方形的程式（例如把寬設成 5、高設成 2 再算面積）在傳入正方形時得到錯誤結果。

**LSP 在架構層級也適用。** 書中例子：計程車派遣服務，各家計程車公司的 REST 介面都遵守同一種格式，系統才能統一派車。但某家公司用 `dest` 而不是 `destination` 當欄位名稱，導致必須加入特例判斷，於是系統裡出現「一堆 `if` 判斷」，破壞了替換性，服務介面也不再可靠。

### ISP：介面隔離原則

> 不要讓使用者依賴它不需要的東西。

| 層級 | 說明 |
| --- | --- |
| 程式碼層 | 使用者 `User1` 只用 `op1`，但被迫依賴包含 `op2`、`op3` 的整個類別。`op2` 一改，`User1` 也要重新編譯或部署 |
| 架構層 | 系統 S 依賴框架 F，F 又綁定資料庫 D；若 S 實際不需要 D 的功能，D 的變更仍會迫使 S 要重新部署。依賴你用不到的東西，是在給自己找麻煩 |

### DIP：依賴反向原則

> 高階策略的原始碼應該只依賴抽象，而不依賴具體的低階細節。

實務上的規則（針對**易變**的具體類別）：

| 規則 | 說明 |
| --- | --- |
| 少引用易變的具體類別 | 引用抽象介面 |
| 不要從易變的具體類別衍生 | 繼承的耦合最強 |
| 不要覆寫具體函式 | 具體函式有原始碼依賴，覆寫仍繼承了依賴 |
| 不要提及具體名稱 | 即使是名字，也是一種依賴 |

建立易變物件需要引用具體類別，這時用**抽象工廠**，讓具體物件的建立集中在少數地方。作業系統、標準函式庫（例如 `String`）等**穩定**的具體元素不需要用這個規則。

### 一個合併範例：DIP + OCP + SRP

```java
public class DipDemo {
    // ── 高階政策層（業務規則）：只依賴自己定義的抽象 ──
    record Employee(String name, double hourlyRate) {}

    interface EmployeeGateway {            // 抽象由「政策」擁有，細節去實作它
        Employee find(String name);
    }

    interface PayPolicy {                  // OCP：新增加班規則 = 新增實作，不修改 PayrollUseCase
        double pay(Employee e, double hours);
    }

    static class RegularPay implements PayPolicy {
        public double pay(Employee e, double hours) { return e.hourlyRate() * hours; }
    }

    static class OvertimePay implements PayPolicy {
        public double pay(Employee e, double hours) {
            double overtime = Math.max(0, hours - 40);
            return e.hourlyRate() * (hours - overtime) + e.hourlyRate() * 1.5 * overtime;
        }
    }

    static class PayrollUseCase {          // 只有一個變更理由：薪資計算的使用案例
        private final EmployeeGateway gateway;
        private final PayPolicy policy;
        PayrollUseCase(EmployeeGateway gateway, PayPolicy policy) {
            this.gateway = gateway;
            this.policy = policy;
        }
        double calculate(String name, double hours) {
            return policy.pay(gateway.find(name), hours);
        }
    }

    // ── 低階細節層：原始碼依賴箭頭指向上方的抽象 ──
    static class InMemoryEmployeeGateway implements EmployeeGateway {
        private final java.util.Map<String, Employee> data =
                java.util.Map.of("Bob", new Employee("Bob", 100));
        public Employee find(String name) { return data.get(name); }
    }

    // ── Main：最髒、最具體的地方，負責組裝 ──
    public static void main(String[] args) {
        EmployeeGateway gw = new InMemoryEmployeeGateway();
        System.out.println(new PayrollUseCase(gw, new RegularPay()).calculate("Bob", 45));   // 4500.0
        System.out.println(new PayrollUseCase(gw, new OvertimePay()).calculate("Bob", 45));  // 4750.0
    }
}
```

這個範例是筆者為說明依賴方向所寫，不是書中的程式碼。要點：`PayrollUseCase` 不知道資料從哪裡來（資料庫、記憶體、REST），也不知道加班規則，這些都從外部注入。把 `InMemoryEmployeeGateway` 換成資料庫實作，政策層完全不用動。

## 對照：SOLID 與 Spring 實務

這一節是補充，非書中內容，用於對應到熟悉的 Spring 專案：

| 原則 | 常見的違反 | 修正方向 |
| --- | --- | --- |
| SRP | 一個 `UserService` 同時管註冊、報表、通知 | 依角色與變更理由拆分 |
| OCP | `switch (type)` 到處散落 | Strategy／多型，新增型別只新增類別 |
| LSP | 子類別覆寫方法後丟 `UnsupportedOperationException` | 重新檢視繼承關係，改用組合 |
| ISP | 一個巨大的 `Repository` 介面被所有使用者依賴 | 依使用者切成小介面 |
| DIP | Service 直接 `new` JDBC 實作 | 依賴介面，由容器注入 |
