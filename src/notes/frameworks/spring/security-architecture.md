# Spring Security 架構

Spring Security 的設定看起來像一堆咒語，但只要理解它的架構，每一行設定都有清楚的意義。

## 整體結構：一串 Filter

Spring Security 完全建立在 Servlet Filter 上。它在 Servlet 容器中只註冊**一個** Filter，再由這個 Filter 把請求轉給 Spring 容器中的一整串安全 Filter：

```
請求
  → DelegatingFilterProxy（Servlet 容器中的 Filter）
  → FilterChainProxy（Spring bean）
  → 依請求選擇 SecurityFilterChain
       ├─ 鏈 1：/api/**     JWT 認證
       └─ 鏈 2：/admin/**   表單登入
  → DispatcherServlet
```

| 元件 | 角色 |
| --- | --- |
| `DelegatingFilterProxy` | Servlet 容器認得的 Filter，本身不做事，只是把請求轉給 Spring 容器中名為 `springSecurityFilterChain` 的 bean。它的存在是因為 Servlet 容器早於 Spring 容器啟動，無法直接使用 Spring bean |
| `FilterChainProxy` | Spring Security 的總入口，管理多條 `SecurityFilterChain`，對每個請求選出**第一條符合的鏈**來執行 |
| `SecurityFilterChain` | 你用 `HttpSecurity` 設定出來的東西，包含一個請求比對條件和一串 Filter |

可以定義多條 `SecurityFilterChain`，用 `securityMatcher` 區分適用範圍、用 `@Order` 決定比對順序。例如 API 用 JWT、管理後台用表單登入：

```java
@Bean
@Order(1)
SecurityFilterChain api(HttpSecurity http) throws Exception {
    http.securityMatcher("/api/**")
        .authorizeHttpRequests(auth -> auth.anyRequest().authenticated())
        .oauth2ResourceServer(o -> o.jwt(Customizer.withDefaults()));
    return http.build();
}

@Bean
@Order(2)
SecurityFilterChain web(HttpSecurity http) throws Exception {
    http.authorizeHttpRequests(auth -> auth.anyRequest().authenticated())
        .formLogin(Customizer.withDefaults());
    return http.build();
}
```

### 鏈中有哪些 Filter

JWT 資源伺服器實際產生的 Filter 順序（已驗證）：

| 順序 | Filter | 作用 |
| --- | --- | --- |
| 1 | `DisableEncodeUrlFilter` | 防止 session id 出現在 URL |
| 2 | `WebAsyncManagerIntegrationFilter` | 讓非同步請求也能取得 `SecurityContext` |
| 3 | `SecurityContextHolderFilter` | 載入 `SecurityContext`，請求結束時清除 |
| 4 | `HeaderWriterFilter` | 加上安全相關的回應標頭（`X-Content-Type-Options`、`X-Frame-Options` 等） |
| 5 | `LogoutFilter` | 處理登出 |
| 6 | `OAuth2ProtectedResourceMetadataFilter` | 提供 OAuth 2.0 受保護資源的中繼資料端點 |
| 7 | `BearerTokenAuthenticationFilter` | **從 `Authorization: Bearer` 標頭取出 JWT 並認證** |
| 8 | `RequestCacheAwareFilter` | 登入後導回原本要去的頁面 |
| 9 | `SecurityContextHolderAwareRequestFilter` | 讓 `HttpServletRequest.isUserInRole()` 等 API 可用 |
| 10 | `AnonymousAuthenticationFilter` | 尚未認證的請求放入一個「匿名」身分 |
| 11 | `SessionManagementFilter` | session 相關處理 |
| 12 | `ExceptionTranslationFilter` | **把認證或授權例外轉成 401 或 403** |
| 13 | `AuthorizationFilter` | **最後一關：檢查這個身分能不能存取這個 URL** |

用表單登入時，第 7 個會換成 `UsernamePasswordAuthenticationFilter`；有開啟 CSRF、CORS 時會出現 `CsrfFilter`、`CorsFilter`。

排查問題時，設定 `logging.level.org.springframework.security=TRACE`，日誌會印出每個請求經過了哪些 Filter、在哪一關被擋下。

## 認證流程

以帳號密碼登入為例：

```
UsernamePasswordAuthenticationFilter
  → AuthenticationManager（ProviderManager）.authenticate(未認證的 token：帳號＋密碼)
  → 交給支援這種 token 的 Provider：DaoAuthenticationProvider
  → UserDetailsService.loadUserByUsername(帳號) → UserDetails（含雜湊後的密碼、權限）
  → PasswordEncoder.matches(輸入的密碼, 雜湊值) → true
  → 回傳已認證的 Authentication（含權限）
  → 存進 SecurityContextHolder
```

| 概念 | 說明 |
| --- | --- |
| `Authentication` | 「你是誰」。認證前裝著帳號密碼，認證後裝著使用者資訊與權限清單 |
| `GrantedAuthority` | 一個權限字串，例如 `ROLE_ADMIN`、`SCOPE_orders:write` |
| `SecurityContextHolder` | 存放目前 `Authentication` 的地方，**預設是 `ThreadLocal`** |
| `AuthenticationManager` | 認證的入口，通常是 `ProviderManager`，它會依序詢問多個 `AuthenticationProvider` |
| `UserDetailsService` | 依帳號載入使用者資料，你通常要實作它去查資料庫 |
| `PasswordEncoder` | 密碼雜湊與比對 |

在程式中取得目前使用者：

```java
@GetMapping("/me")
public Map<String, Object> me(@AuthenticationPrincipal Jwt jwt) { // 直接注入
    return Map.of("sub", jwt.getSubject());
}

// 或在任何地方
Authentication auth = SecurityContextHolder.getContext().getAuthentication();
```

因為 `SecurityContextHolder` 預設是 `ThreadLocal`，`@Async` 方法中拿不到。

## 401、403 與授權規則

### 401 與 403

| 狀態碼 | 意義 | 由誰產生 |
| --- | --- | --- |
| 401 Unauthorized | 「我不知道你是誰」：沒有提供認證資訊或認證失敗 | `AuthenticationEntryPoint` |
| 403 Forbidden | 「我知道你是誰，但你沒有權限」 | `AccessDeniedHandler` |

`ExceptionTranslationFilter` 負責決定回哪一個。已驗證的行為：

- 沒帶 token 存取受保護的端點：401，回應標頭有 `WWW-Authenticate: Bearer`。
- 帶了 token 但缺少 `SCOPE_orders:write` 權限去建立訂單：403。
- token 簽章被竄改：401。

### 授權規則

```java
http.authorizeHttpRequests(auth -> auth
    .requestMatchers("/api/public/**", "/actuator/health/**").permitAll()
    .requestMatchers(HttpMethod.POST, "/api/orders").hasAuthority("SCOPE_orders:write")
    .requestMatchers("/api/admin/**").hasRole("ADMIN")   // 等於 hasAuthority("ROLE_ADMIN")
    .anyRequest().authenticated());                      // 一定要有兜底規則
```

規則**由上往下比對，第一條符合的就生效**，所以具體的規則要放前面。最後一定要用 `anyRequest()` 收尾，否則漏掉的路徑可能沒有任何保護。

`hasRole("ADMIN")` 會自動加上 `ROLE_` 前綴，`hasAuthority` 不會。這是常見的混淆來源：資料庫中存的是 `ADMIN` 還是 `ROLE_ADMIN`，決定了你要用哪一個。

## 密碼、CSRF 與 CORS

### 密碼儲存

```java
@Bean
PasswordEncoder passwordEncoder() {
    return PasswordEncoderFactories.createDelegatingPasswordEncoder();
}
```

`DelegatingPasswordEncoder` 會在雜湊值前面加上演算法標記，例如 `{bcrypt}$2a$10$...`。好處是未來要換演算法時，舊密碼仍然可以驗證，使用者下次登入時再升級。預設使用 bcrypt。Security 7 也新增了以 Password4j 實作的 Argon2、bcrypt、scrypt 等編碼器。

**絕對不要**：明文儲存、用 MD5 或 SHA-256 這類快速雜湊（它們的設計目標就是快，即使加了鹽，攻擊者用 GPU 每秒仍能嘗試數十億次）、自己發明加密方式。

### CSRF

攻擊者誘導已登入的使用者在惡意網站上發出請求到你的網站，瀏覽器會**自動附上 cookie**，你的伺服器以為是使用者本人。

- 用 cookie 或 session 做認證的應用（傳統網頁、BFF）：**必須開啟 CSRF 保護**（預設已開啟）。單頁應用程式可以用 Security 7 新增的 `http.csrf(csrf -> csrf.spa())` 一行設定好。
- 純 token 的 API（`Authorization` 標頭，瀏覽器不會自動附上）：可以關閉 CSRF。

### CORS

瀏覽器預設禁止網頁用 JavaScript 呼叫不同來源的 API。前後端分屬不同網域時，後端要明確允許：

```java
@Bean
CorsConfigurationSource corsConfigurationSource() {
    var config = new CorsConfiguration();
    config.setAllowedOrigins(List.of("https://app.example.com")); // 不要用 * 搭配 credentials
    config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE"));
    config.setAllowedHeaders(List.of("Authorization", "Content-Type"));
    var source = new UrlBasedCorsConfigurationSource();
    source.registerCorsConfiguration("/api/**", config);
    return source;
}

// SecurityFilterChain 中
http.cors(Customizer.withDefaults()); // 使用上面的 bean
```

CORS 必須在 Spring Security 中啟用（而不是只用 `@CrossOrigin`），因為瀏覽器的預檢請求（`OPTIONS`）不帶認證資訊，會在 Security 這一關就被擋下。啟用 `http.cors(...)` 後，如果容器中沒有 `CorsConfigurationSource` bean，Security 會沿用 Spring MVC 的 CORS 設定，所以關鍵是「在 Security 中啟用」，設定本身可以只寫一份。

## Spring Security 7 的變動

| 變動 | 說明 |
| --- | --- |
| `and()` 移除 | 只能用 lambda 風格的 DSL，舊教學中 `.and().formLogin()` 的鏈式寫法無法編譯 |
| `authorizeRequests` 移除 | 改用 `authorizeHttpRequests` |
| `AntPathRequestMatcher`、`MvcRequestMatcher` 移除 | 改用 `PathPatternRequestMatcher`，`requestMatchers("/api/**")` 的字串寫法不受影響 |
| `AuthorizationManager#check` 移除 | 改用 `authorize` |
| 授權伺服器併入 | Spring Authorization Server 成為 Spring Security 的一部分 |
| 多因素認證 | 內建 MFA 支援（`@EnableMultiFactorAuthentication`） |
| OAuth2 密碼授權類型移除 | Resource Owner Password Credentials 早已不建議使用 |

多因素認證的設定方式：

```java
@Configuration
@EnableMultiFactorAuthentication(authorities = {
        FactorGrantedAuthority.PASSWORD_AUTHORITY, // "FACTOR_PASSWORD"
        FactorGrantedAuthority.OTT_AUTHORITY })    // "FACTOR_OTT"（一次性 token）
class MfaConfig { }
```

使用者每完成一種認證方式，就會得到對應的 `FACTOR_*` 權限；要求的因素都齊全後才能存取受保護的資源，缺少時 Security 會引導到對應的登入頁面。
