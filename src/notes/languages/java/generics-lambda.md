# 泛型、Lambda 與 Stream


## 泛型


### 型別擦除

泛型主要由編譯器負責型別檢查。編譯器檢查完型別後，把型別參數擦除成它的上界（沒有上界就是 `Object`），並在需要的地方插入強制轉型。所以執行時期 `List<String>` 和 `List<Integer>` 是同一個類別。

不過，類別、欄位與方法宣告中的部分泛型資訊仍可保留在 class 檔，供反射讀取；型別擦除不代表所有泛型資訊都消失。

擦除造成的限制：

- 不能 `new T()`、`new T[]`。
- 不能 `instanceof List<String>`（只能 `instanceof List<?>`）。
- 不能用基本型別當型別參數（`List<int>` 不行）。
- 不能用泛型參數多載：`void f(List<String>)` 和 `void f(List<Integer>)` 擦除後簽章相同。
- 靜態欄位不能使用類別的型別參數。

### `? extends T` 與 `? super T`（PECS）

先看 `List<? extends Number>`：它裝的是「某一種 Number 子型別」，但我們不知道是哪一種。讀出來可以當 Number 使用；卻不能隨便加入 Integer，因為它實際上可能是 `List<Double>`。這限制的是加入元素的型別，不代表清單完全不可修改，例如仍可呼叫 `clear()`（前提是清單支援修改）。

反過來，`List<? super Integer>` 的元素型別可能是 Integer、Number 或 Object，因此放入 Integer 是安全的。

口訣是 **Producer Extends, Consumer Super（PECS）**。

- 只從集合**讀取**（集合是生產者）：用 `? extends T`。讀出來一定是 T，但不能寫入（除了 null）。
- 只往集合**寫入**（集合是消費者）：用 `? super T`。可以寫入 T，但讀出來只能當 `Object`。

```java
double sum(List<? extends Number> nums) {   // 可傳 List<Integer>、List<Double>
    double s = 0;
    for (Number n : nums) s += n.doubleValue();
    return s;
}

void fill(List<? super Integer> list) {      // 可傳 List<Integer>、List<Number>、List<Object>
    list.add(1);
}
```

`List<Integer>` 不是 `List<Number>` 的子型別，否則就能把 `List<Integer>` 當成 `List<Number>` 再加入 `Double`，型別安全就被破壞了。陣列是協變的（`Integer[]` 是 `Number[]` 的子型別），所以會在執行時期才拋 `ArrayStoreException`。



## Lambda、Stream 與 Optional


### 函數式介面

只有一個抽象方法的介面，可以加 `@FunctionalInterface` 讓編譯器檢查。Lambda 就是這個抽象方法的實作。

| 介面 | 方法 | 用途 |
| --- | --- | --- |
| `Supplier<T>` | `T get()` | 提供值 |
| `Consumer<T>` | `void accept(T)` | 消費值 |
| `Function<T, R>` | `R apply(T)` | 轉換 |
| `Predicate<T>` | `boolean test(T)` | 判斷 |
| `UnaryOperator<T>` | `T apply(T)` | 同型別轉換 |
| `BinaryOperator<T>` | `T apply(T, T)` | 合併 |
| `Runnable` | `void run()` | 無參數無回傳 |
| `Callable<V>` | `V call() throws Exception` | 可回傳、可拋 checked exception |

方法參考的四種形式：

- `String::valueOf`：靜態方法
- `str::length`：特定物件的方法
- `String::length`：任意物件的方法
- `ArrayList::new`：建構子

Lambda 與匿名內部類別的差異：Lambda 的 `this` 指向外部類別；不會產生額外的 `.class` 檔；沒有自己的作用域，不能宣告和外部同名的區域變數。

### 為什麼只能用 effectively final 的變數

區域變數存在堆疊上，方法結束就消失，但 Lambda 或內部類別的物件可能活得更久。Java 的做法是**把變數的值複製一份**進去。如果允許之後再修改，內外的值就會不一致，所以規定不能改。需要在 Lambda 裡累加時，用 `AtomicInteger`、單元素陣列，或改用 Stream 的 `reduce`／`count`。

### Stream

Stream 是對資料做宣告式處理的管線：**來源 → 中間操作 → 終端操作**。中間操作是**惰性**的，要等到終端操作才真正執行；一個 Stream 只能被消費一次。

```java
Map<String, BigDecimal> premiumByProduct = policies.stream()
        .filter(p -> p.getStatus() == Status.ACTIVE)
        .collect(Collectors.groupingBy(Policy::getProductCode,
                 Collectors.reducing(BigDecimal.ZERO, Policy::getPremium, BigDecimal::add)));
```

- 中間操作：`filter`、`map`、`flatMap`、`distinct`、`sorted`、`peek`、`limit`、`skip`
- 終端操作：`forEach`、`collect`、`reduce`、`count`、`anyMatch`、`findFirst`、`toList()`（Java 16）
- 短路操作：`anyMatch`、`findFirst`、`limit` 不一定要處理完所有元素

惰性的意義：`filter(...).map(...).findFirst()` 是**一筆一筆**通過整條管線，找到第一筆就停止。

常見陷阱：

- `Collectors.toMap` 遇到重複 key 會拋 `IllegalStateException`，要傳入合併函數；value 為 null 會 NPE。
- `Stream.toList()` 回傳不可修改的 List。
- 不要在 Stream 裡修改外部狀態（副作用）。
- 邏輯太複雜時，寫回 for 迴圈反而清楚。

### Optional

用在**方法回傳值**，明確告訴呼叫端「可能沒有結果」。不要用在欄位、方法參數、集合元素。

```java
Optional<Policy> findByNo(String no);

String holder = repo.findByNo(no)
        .map(Policy::getHolderName)
        .orElse("未知");

Policy p = repo.findByNo(no)
        .orElseThrow(() -> new NotFoundException("保單不存在：" + no));
```

不好的用法：`if (opt.isPresent()) { return opt.get(); }`（跟判斷 null 沒差別）、直接 `opt.get()`（空的時候拋 `NoSuchElementException`）。

`orElse(createDefault())` 不管有沒有值，`createDefault()` **都會執行**；`orElseGet(() -> createDefault())` 只在沒值時才執行。
