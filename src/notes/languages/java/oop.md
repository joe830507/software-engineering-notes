# 物件導向


## 類別與物件


### 存取修飾子

| 修飾子 | 同類別 | 同套件 | 子類別（不同套件） | 其他 |
| --- | --- | --- | --- | --- |
| `private` | ✓ | | | |
| （預設，package-private） | ✓ | ✓ | | |
| `protected` | ✓ | ✓ | ✓ | |
| `public` | ✓ | ✓ | ✓ | ✓ |

### `static`

- **靜態變數**：屬於類別，所有實例共用一份。
- **靜態方法**：不需要實例就能呼叫，不能直接存取實例成員，也不能用 `this`。
- **靜態區塊**：類別初始化時執行一次。
- **靜態內部類別**：不持有外部類別實例的參考。
- **靜態匯入**：`import static java.lang.Math.max;`

靜態方法**不能被覆寫**。子類別寫同名靜態方法叫「隱藏」，呼叫哪一個取決於**宣告型別**，沒有多型。

### 初始化順序

父類別靜態 → 子類別靜態 → 父類別實例區塊與建構子 → 子類別實例區塊與建構子。靜態的部分只在類別第一次初始化時執行一次。

```java
class Parent {
    static { System.out.println("1. Parent static"); }
    { System.out.println("3. Parent instance block"); }
    Parent() { System.out.println("4. Parent constructor"); }
}
class Child extends Parent {
    static { System.out.println("2. Child static"); }
    { System.out.println("5. Child instance block"); }
    Child() { System.out.println("6. Child constructor"); }
}
new Child();  // 依 1 → 6 的順序印出
```

陷阱：父類別建構子呼叫了被子類別覆寫的方法，這時子類別的欄位還沒初始化，會讀到預設值。

### `this` 與 `super`

- `this`：目前物件；`this(...)` 呼叫同類別的另一個建構子。
- `super`：父類別；`super(...)` 呼叫父類別建構子。
- `this(...)` 和 `super(...)` 都必須是建構子的**第一行**，而且不能同時出現。（Java 25 放寬了這個限制。）

### `hashCode()` 與 `equals()`

規則：`equals` 相等的兩個物件，`hashCode` 一定要相等；`hashCode` 相等不代表 `equals` 相等。只覆寫 `equals` 不覆寫 `hashCode`，物件放進 `HashMap`、`HashSet` 會出錯：內容相同的兩個物件被分到不同 bucket，`contains` 找不到、`Set` 會有重複。

```java
public final class PolicyKey {
    private final String policyNo;
    private final int endorseSeq;

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof PolicyKey other)) return false;   // Java 16 pattern matching
        return endorseSeq == other.endorseSeq && Objects.equals(policyNo, other.policyNo);
    }

    @Override
    public int hashCode() {
        return Objects.hash(policyNo, endorseSeq);
    }
}
```

`equals` 的契約：自反性、對稱性、遞移性、一致性、對 null 回傳 false。

陷阱：放進 `HashSet` 之後又修改了參與 `hashCode` 的欄位，這個物件就再也找不到、也移除不掉。所以當 key 的物件最好是不可變的。

### 淺複製與深複製

- **淺複製**：只複製物件本身，內部參考型別欄位仍指向同一個物件。`Object.clone()` 預設是淺複製。
- **深複製**：連內部參考的物件也一起複製。

實務上推薦**複製建構子或靜態工廠方法**。`Cloneable` 的設計有缺陷：介面沒有 `clone` 方法、`clone` 是 protected、會拋 checked exception。

### 不可變類別

1. 類別宣告為 `final`。
2. 所有欄位 `private final`。
3. 不提供 setter。
4. 建構子傳入可變物件時做**防禦性複製**。
5. getter 回傳可變物件時也回傳複本，或不可修改的視圖。

```java
public final class Policy {
    private final String policyNo;
    private final List<String> insureds;

    public Policy(String policyNo, List<String> insureds) {
        this.policyNo = policyNo;
        this.insureds = List.copyOf(insureds);   // 防禦性複製，結果本身不可修改
    }

    public String policyNo() { return policyNo; }
    public List<String> insureds() { return insureds; }
}
```

好處：天生執行緒安全、可以安全地當 `HashMap` 的 key、可以快取與共用。`String`、`Integer`、`BigDecimal`、`LocalDate` 都是不可變類別。

### `record`（Java 16）

```java
public record Point(int x, int y) {}
```

自動產生：private final 欄位、建構子、同名存取方法（`x()`）、`equals`、`hashCode`、`toString`。`record` 的欄位如果是可變集合，仍要在 compact constructor 裡自己複製。



## 繼承、多型與介面


### 物件導向三大特性

- **封裝**：把資料和操作資料的方法放在一起，用存取修飾子隱藏內部細節，只公開必要的介面。
- **繼承**：子類別重用父類別並擴充。Java 只支援類別的**單一繼承**，但可以實作多個介面。
- **多型**：同一個方法呼叫，依實際物件型別執行不同實作。條件是有繼承或實作、子類別覆寫方法、用父類別型別的參考指向子類別物件。

### 多載（Overload）與覆寫（Override）

| | 多載 Overload | 覆寫 Override |
| --- | --- | --- |
| 位置 | 同一個類別（或子類別） | 子類別覆寫父類別 |
| 方法名稱 | 相同 | 相同 |
| 參數列 | **必須不同** | 必須相同 |
| 回傳型別 | 無限制 | 相同或其子型別 |
| 存取權限 | 無限制 | 不能更嚴格 |
| 例外 | 無限制 | 不能拋出更廣的 checked exception |
| 決定時機 | 編譯時期（靜態綁定） | 執行時期（動態綁定） |

只有回傳型別不同不構成多載。`private`、`static`、`final` 方法不能被覆寫。

### 抽象類別與介面

| | 抽象類別 | 介面 |
| --- | --- | --- |
| 繼承數量 | 只能繼承一個 | 可以實作多個 |
| 建構子 | 有 | 沒有 |
| 成員變數 | 任何變數 | 只有 `public static final` 常數 |
| 方法 | 抽象與具體方法都可以 | 抽象方法；Java 8 起有 `default`、`static`；Java 9 起有 `private` |
| 設計意義 | 「是一種」（is-a），共用狀態與部分實作 | 「能做什麼」（can-do），定義能力或契約 |

選擇原則：要定義契約、需要多重實作時用介面；有共用狀態或骨架流程時用抽象類別。兩個介面有相同的 `default` 方法時，實作類別必須覆寫，並可用 `InterfaceA.super.method()` 指定呼叫哪一個。

### 內部類別

| 種類 | 說明 | 注意 |
| --- | --- | --- |
| 成員內部類別 | 定義在類別內，非 static | **隱含持有外部類別實例的參考** |
| 靜態巢狀類別 | `static class` | 不持有外部參考，最常用（例如 Builder） |
| 區域內部類別 | 定義在方法內 | 只能使用 effectively final 的區域變數 |
| 匿名內部類別 | 沒有名稱，當場實作 | 同上；Java 8 後多半改用 Lambda |

陷阱：非靜態內部類別持有外部參考，如果內部物件活得比外部物件久（交給執行緒或放進快取），外部物件就無法被回收。

### `enum`

- 每個列舉常數都是該 enum 的 `public static final` 單例。
- 可以有欄位、private 建構子、方法，也可以每個常數覆寫自己的方法。
- 內建 `values()`、`valueOf()`、`ordinal()`、`name()`。
- 可以用 `==` 比較，用在 `switch` 很方便。
- 用 `EnumMap`、`EnumSet` 效能很好。

```java
public enum TxnCode {
    SALE("05", 1), REFUND("06", -1);

    private final String code;
    private final int sign;

    TxnCode(String code, int sign) { this.code = code; this.sign = sign; }

    public BigDecimal signed(BigDecimal amt) {
        return sign > 0 ? amt : amt.negate();
    }
}
```

不要把 `ordinal()` 存進資料庫，調整常數順序就會錯亂，要存自己定義的代碼。
