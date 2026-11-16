# 字串


## 為什麼 String 是不可變的

`String` 內部的陣列是 `private final`，沒有提供任何修改的方法，所有看起來像修改的操作都會回傳新字串。好處：

1. **字串常數池**：多個變數可以安全地共用同一個物件。
2. **安全性**：字串常被用在檔案路徑、URL、類別名稱，如果可變，檢查完之後可能被改掉。
3. **執行緒安全**：不需要同步。
4. **hashCode 可以快取**：當 `HashMap` 的 key 效率高。

Java 9 起內部從 `char[]` 改成 `byte[]` 加 `coder`（Compact Strings），純 Latin-1 字串每個字元只用 1 byte。

## 字串常數池

```java
String s1 = "abc";              // 常數池
String s2 = "abc";              // 同一個物件
String s3 = new String("abc");  // 堆積上的新物件
String s4 = s3.intern();        // 回傳常數池中的那一個

s1 == s2;  // true
s1 == s3;  // false
s1 == s4;  // true

String s5 = "a" + "bc";         // 編譯時期就合併成 "abc"
s1 == s5;  // true

String a = "a";
String s6 = a + "bc";           // 執行時期才串接，產生新物件
s1 == s6;  // false

final String fa = "a";
String s7 = fa + "bc";          // fa 是編譯時期常數，會被合併
s1 == s7;  // true
```

`new String("abc")` 建立 1 或 2 個物件：常數池沒有 `"abc"` 時，池中一個加堆積一個；池中已有時只建堆積那一個。

## String、StringBuilder、StringBuffer

| | String | StringBuilder | StringBuffer |
| --- | --- | --- | --- |
| 可變性 | 不可變 | 可變 | 可變 |
| 執行緒安全 | 是（因為不可變） | 否 | 是（方法加 `synchronized`） |
| 效能 | 大量串接時最差 | 最好 | 比 StringBuilder 稍差 |

單一運算式的 `+` 編譯器會最佳化，不會慢。但**在迴圈裡用 `+=`** 每一圈都產生新物件，要改用 `StringBuilder`。

比較字串時 `"abc".equals(str)` 比 `str.equals("abc")` 安全，因為前者不會因為 `str` 是 null 而 NPE。

## 金額為什麼不能用 `double`

`double` 是二進位浮點數，很多十進位小數無法精確表示，`0.1 + 0.2` 得到 `0.30000000000000004`。金額要用 `BigDecimal`，或用 `long` 以「分」為單位。

`BigDecimal` 的四個陷阱：

```java
// 1. 不要用 double 建構
new BigDecimal(0.1);        // 0.1000000000000000055511151231257827...
new BigDecimal("0.1");      // 正確
BigDecimal.valueOf(0.1);    // 正確

// 2. equals 會比較 scale，數值比較要用 compareTo
new BigDecimal("2.0").equals(new BigDecimal("2.00"));     // false
new BigDecimal("2.0").compareTo(new BigDecimal("2.00"));  // 0

// 3. 除不盡時沒指定精度會拋 ArithmeticException
BigDecimal.ONE.divide(new BigDecimal("3"), 2, RoundingMode.HALF_UP);  // 0.33

// 4. 不可變，運算結果要接回來
BigDecimal total = BigDecimal.ZERO;
total = total.add(amount);
```

捨入模式：`HALF_UP` 是一般四捨五入；`HALF_EVEN` 是銀行家捨入；`UP` 無條件進位；`DOWN` 無條件捨去。用哪一種由業務規格決定。
