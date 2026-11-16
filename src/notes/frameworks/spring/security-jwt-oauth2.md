# JWT、OAuth2 與方法層級授權

## OAuth 2.0 的角色

| 角色 | 說明 | 在 Spring 中 |
| --- | --- | --- |
| 資源擁有者 | 使用者 | |
| 用戶端（Client） | 想存取資源的應用程式 | `spring-boot-starter-security-oauth2-client` |
| 授權伺服器 | 驗證使用者、發 token | Keycloak、Auth0、Okta、Cognito，或 Spring Security 內建的授權伺服器 |
| 資源伺服器 | 提供 API，驗證 token | `spring-boot-starter-security-oauth2-resource-server` |

後端 API 最常扮演的是**資源伺服器**：不管使用者怎麼登入，只負責驗證請求中的 token。

常用的授權類型：

| 授權類型 | 使用情境 |
| --- | --- |
| Authorization Code + PKCE | 使用者登入（網頁、手機 App、單頁應用程式） |
| Client Credentials | 服務對服務，沒有使用者參與 |
| Refresh Token | 用長效的 refresh token 換新的 access token |

隱式授權（Implicit）和密碼授權（Password）都已淘汰，不要再使用。

## JWT

### 結構與驗證

JWT 由三段 Base64URL 字串以 `.` 串接：標頭（演算法）、內容（claims）、簽章。

內容只是編碼，**不是加密**，任何人都能解開閱讀。所以不要在 JWT 中放敏感資料。

資源伺服器驗證 JWT 時要檢查：

1. 簽章正確（用授權伺服器的公鑰）。
2. `exp` 未過期、`nbf` 已生效。
3. `iss`（發行者）是信任的授權伺服器。
4. `aud`（對象）包含自己，避免拿 A 服務的 token 來存取 B 服務。

### 設定資源伺服器

正式環境通常只要一行設定，Spring 會從授權伺服器的中繼資料自動取得公鑰（JWKS）並驗證 `iss`：

```yaml
spring:
  security:
    oauth2:
      resourceserver:
        jwt:
          issuer-uri: https://auth.example.com/realms/demo
          audiences: orders-api
```

```java
@Configuration
@EnableMethodSecurity
public class SecurityConfig {

    @Bean
    SecurityFilterChain api(HttpSecurity http) throws Exception {
        http
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/public/**", "/actuator/health/**").permitAll()
                .requestMatchers(HttpMethod.POST, "/api/orders").hasAuthority("SCOPE_orders:write")
                .anyRequest().authenticated())
            .oauth2ResourceServer(oauth2 -> oauth2.jwt(Customizer.withDefaults()))
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .csrf(csrf -> csrf.disable()); // 純 token API 沒有 cookie，不需要 CSRF
        return http.build();
    }
}
```

來源的驗證專案沒有授權伺服器，所以改用對稱金鑰（HS256）自己簽發與驗證 token：

```java
@Bean
JwtDecoder jwtDecoder(SecretKey key) {
    return NimbusJwtDecoder.withSecretKey(key).macAlgorithm(MacAlgorithm.HS256).build();
}

@Bean
JwtEncoder jwtEncoder(SecretKey key) {
    return new NimbusJwtEncoder(new ImmutableSecret<>(key));
}
```

已驗證：用 `JwtEncoder` 簽發一個 `scope` 為 `orders:write orders:read` 的 token，可以成功建立訂單；把 token 最後多加一個字元，回應 401。

### 權限的對應規則

預設把 JWT 的 `scope`（或 `scp`）claim 中每個值加上 `SCOPE_` 前綴，成為 `GrantedAuthority`。所以 `scope: "orders:write"` 會變成 `SCOPE_orders:write`。

授權伺服器把角色放在其他 claim（例如 Keycloak 的 `realm_access.roles`）時，Boot 4.1 起可以直接用屬性設定：

```yaml
spring:
  security:
    oauth2:
      resourceserver:
        jwt:
          authorities-claim-expressions: "realm_access.roles"   # SpEL 運算式，取出巢狀 claim
          authority-prefix: "ROLE_"
```

（這個屬性依據 Boot 4.1 的發布說明撰寫，來源未實測，使用前請以官方文件確認屬性名稱。）舊版本或更複雜的情況，提供一個自訂的 `JwtAuthenticationConverter` bean。

### JWT 的取捨

| 優點 | 缺點 |
| --- | --- |
| 無狀態，資源伺服器不用查資料庫或呼叫授權伺服器 | **無法撤銷**：在過期前，被偷走的 token 都有效 |
| 容易水平擴展 | token 比 session id 大，每個請求都要帶 |
| 跨服務傳遞身分很方便 | 權限變更要等 token 過期才生效 |

對策：access token 設定很短的有效期（5 到 15 分鐘），搭配 refresh token；需要立即撤銷的場景（例如帳號被盜），用黑名單或改用 opaque token 加 introspection。

**瀏覽器端的 token 放哪裡**：放在 `localStorage` 會被 XSS 偷走。單頁應用程式的推薦做法是 **BFF（Backend for Frontend）** 模式：由後端擔任 OAuth2 用戶端，token 存在伺服器端，瀏覽器只拿到 `HttpOnly`、`Secure`、`SameSite` 的 session cookie（此時記得開啟 CSRF 保護）。

## 方法層級授權

URL 規則適合粗粒度的控制，細粒度的規則（例如「只能修改自己的訂單」）放在方法上：

```java
@Configuration
@EnableMethodSecurity
class MethodSecurityConfig { }

@Service
public class OrderService {

    @PreAuthorize("hasAuthority('SCOPE_orders:admin')")
    public void delete(long id) { ... }

    @PreAuthorize("#customerId == authentication.name")   // 參數與目前使用者比對
    public List<Order> findByCustomer(String customerId) { ... }

    @PostAuthorize("returnObject.ownerId == authentication.name") // 根據回傳值判斷
    public Order find(long id) { ... }
}
```

已驗證：一般使用者呼叫 `delete` 得到 403，具有 `SCOPE_orders:admin` 權限時得到 204。

`@PreAuthorize` 也是用代理實作的，**自呼叫時權限檢查會被跳過**。這是安全漏洞，要特別留意。

複雜的規則可以寫成 bean 再從運算式中呼叫：`@PreAuthorize("@orderAccess.canEdit(#id, authentication)")`。或者定義組合註解，讓規則有名字：

```java
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
@PreAuthorize("hasRole('ADMIN')")
public @interface AdminOnly { }
```

面試時能說出 JWT 的三個缺點與對策，以及 `hasRole` 與 `hasAuthority` 的差別。
