# Spring MVC 請求處理流程

## 從 HTTP 請求到你的方法

```
HTTP 請求
  → Tomcat（從執行緒池取一條執行緒）
  → Filter 鏈（含 Spring Security）
  → DispatcherServlet
  → HandlerMapping（找出要呼叫哪個 Controller 方法）
  → HandlerInterceptor.preHandle
  → HandlerAdapter（解析參數 → 呼叫方法 → 處理回傳值）
  → HandlerInterceptor.postHandle
  → 例外處理（HandlerExceptionResolver）
  → HandlerInterceptor.afterCompletion
  → 回應經過 Filter 鏈返回
```

`DispatcherServlet` 是 Spring MVC 唯一的 Servlet，也叫「前端控制器」。所有請求都先到它，再由它分派給適當的處理器。它的核心方法 `doDispatch()` 大致如下：

1. **找處理器**：依序詢問每個 `HandlerMapping`。最常用的是 `RequestMappingHandlerMapping`，它在啟動時掃描所有 `@RequestMapping`，建立「路徑加 HTTP 方法加版本」對應到「方法」的表格。找到後回傳 `HandlerExecutionChain`，裡面有處理器和要套用的攔截器。
2. **找轉接器**：`HandlerAdapter` 負責實際呼叫處理器。`@RequestMapping` 方法由 `RequestMappingHandlerAdapter` 處理。
3. **呼叫攔截器的 `preHandle`**：回傳 `false` 就中止。
4. **呼叫方法**：
   - 用 `HandlerMethodArgumentResolver` 解析每個參數：`@PathVariable` 從路徑取、`@RequestParam` 從查詢字串取、`@RequestBody` 交給 `HttpMessageConverter` 把 JSON 轉成物件。
   - 執行你的方法。
   - 用 `HandlerMethodReturnValueHandler` 處理回傳值：`@RestController` 的回傳值交給 `HttpMessageConverter` 轉成 JSON 寫進回應。
5. **處理例外**：方法拋出例外時，依序交給 `HandlerExceptionResolver`：先找 `@ExceptionHandler`，再看例外類別上的 `@ResponseStatus`，最後是 Spring 內建例外的預設處理。
6. **呼叫攔截器的 `afterCompletion`**：不管成功失敗都會執行。

## Filter、Interceptor、AOP 的差別

三者都能「在 Controller 前後做事」，常被混用。已驗證的執行順序：

```
filter:before → interceptor:preHandle → controller → interceptor:afterCompletion → filter:after
```

| 面向 | Filter | HandlerInterceptor | AOP |
| --- | --- | --- | --- |
| 屬於 | Servlet 規範 | Spring MVC | Spring AOP |
| 位置 | `DispatcherServlet` 之外 | `DispatcherServlet` 之內 | 任何 bean 的方法呼叫 |
| 知道要呼叫哪個 Controller 方法嗎 | 不知道 | 知道（`handler` 參數） | 知道 |
| 能看到原始請求與回應的位元組嗎 | 能，可以包裝 request / response | 有限 | 不能 |
| 會處理靜態資源、錯誤頁的請求嗎 | 會 | 依設定的路徑 | 不會 |
| 典型用途 | 安全、CORS、壓縮、請求記錄、trace ID | 依 Controller 決定的檢查、多租戶 | 交易、快取、業務層的日誌 |

**Spring Security 是用 Filter 實作的**，所以它在 `DispatcherServlet` 之前就處理完認證。這也代表在 Security 中拋出的例外，不會被你的 `@ControllerAdvice` 捕捉。

### 寫 Filter

繼承 `OncePerRequestFilter`，它保證在請求轉發（forward）或錯誤分派時不會重複執行：

```java
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class CorrelationIdFilter extends OncePerRequestFilter {
    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {
        String id = Optional.ofNullable(req.getHeader("X-Correlation-Id")).orElseGet(() -> UUID.randomUUID().toString());
        MDC.put("correlationId", id);
        res.setHeader("X-Correlation-Id", id);
        try {
            chain.doFilter(req, res);
        } finally {
            MDC.remove("correlationId");
        }
    }
}
```

Spring Boot 會把所有 `Filter` 型別的 bean 自動註冊到 Servlet 容器，套用到所有路徑。只想套用到特定路徑，或者不想自動註冊，用 `FilterRegistrationBean` 包裝。

### 註冊 Interceptor

```java
@Configuration
public class WebConfig implements WebMvcConfigurer {
    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new TenantInterceptor()).addPathPatterns("/api/**");
    }
}
```

## 執行緒模型

傳統 Spring MVC 是「**一個請求一條執行緒**」：Tomcat 從執行緒池取一條執行緒，這條執行緒從頭到尾處理這個請求，包括等待資料庫回應的時間。

| 設定 | 預設值 | 意義 |
| --- | --- | --- |
| `server.tomcat.threads.max` | 200 | 最多同時處理 200 個請求 |
| `server.tomcat.threads.min-spare` | 10 | 閒置時保留的執行緒數 |
| `server.tomcat.max-connections` | 8192 | 最多接受的連線數 |
| `server.tomcat.accept-count` | 100 | 連線數滿了之後，作業系統層級的等待佇列長度 |

這個模型簡單好除錯，但在大量 I/O 等待的情境下，200 條執行緒會被「等待」佔滿。解法有兩個方向：WebFlux 或虛擬執行緒，見「HTTP 客戶端與並行模型」。
