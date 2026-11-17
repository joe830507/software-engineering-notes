# 基礎元件

> 對應《系統設計面試指南》第 4–7 章：限流器、一致性雜湊、鍵值儲存、唯一 ID 生成器。這些是後面案例（短網址、聊天、動態訊息……）的共用零件。

## 網路限流器

限流器（rate limiter）控制客戶端能在一段時間內送出多少請求，超過門檻的請求會被擋下。

### 為什麼需要

| 目的 | 說明 |
| --- | --- |
| 防止 DoS 造成資源耗盡 | 不論有意無意，多餘請求都被擋掉 |
| 降低成本 | 限制呼叫量，把資源留給高優先 API；對付費第三方 API 尤其重要 |
| 防止伺服器超載 | 過濾機器人與使用者不當行為造成的流量 |

### 需求（面試中先確認）

- 準確限制過多請求；低延遲，不能拖慢回應；盡量少用記憶體。
- 分散式：多台伺服器或多個 process 共享同一個限流器。
- 被限制時要清楚告知使用者。
- 高容錯：限流器本身（例如快取離線）出問題不能拖垮整個系統。

### 放在哪裡

| 位置 | 評價 |
| --- | --- |
| 客戶端 | 不可靠，請求容易被偽造，也可能無法控制客戶端 |
| 伺服端 | 完全控制演算法 |
| 中介層（API 閘道） | 雲端微服務常見；閘道通常同時處理 SSL 終止、身份驗證、IP 白名單 |

選擇要看：公司現有技術、需要的演算法能否被閘道支援、是否已有 API 閘道、工程資源夠不夠自己做。被限制時回 **HTTP 429**。

### 五種演算法

| 演算法 | 原理 | 優點 | 缺點 |
| --- | --- | --- | --- |
| **Token 桶** | 桶有固定容量，以固定速率補 token；每個請求取走 1 個，沒 token 就丟棄 | 簡單、省記憶體、**允許短時間突發** | 兩個參數（容量、補充速率）不易調 |
| **漏水桶** | 請求進 FIFO 佇列，以固定速率處理，佇列滿就丟棄 | 省記憶體、輸出速率穩定 | 突發流量塞滿佇列時，新請求被拖慢；兩個參數不易調 |
| **固定視窗計數器** | 時間切成固定視窗，每個視窗一個計數器，達門檻就拒絕 | 省記憶體、配額在視窗邊界重設 | **視窗邊界突發**可能讓實際通過量超過限制 |
| **滑動視窗日誌** | 記錄每個請求的時間戳，新請求來時刪掉過期的，數量超限就拒絕 | 在任何滾動視窗內都很準確 | 記憶體用量大，被拒絕的請求時間戳也要保存 |
| **滑動視窗計數器** | 混合：目前視窗請求數 + 前一視窗請求數 × 重疊比例 | 平滑突發、省記憶體 | 假設前一視窗請求均勻分佈，是近似值 |

Token 桶被 Amazon、Stripe 使用；漏水桶被 Shopify 使用。

**固定視窗的邊界問題。** 限制每分鐘 5 個：`2:00:00–2:01:00` 5 個、`2:01:00–2:02:00` 5 個，但 `2:00:30–2:01:30` 這一分鐘實際通過 10 個。

**滑動視窗計數器的計算。** 限制每分鐘 7 個，前一分鐘 5 個、目前這分鐘 3 個，請求出現在目前這分鐘 30% 的位置：

```text
滾動視窗請求數 = 3 + 5 × 70% = 6.5 → 取 6（無條件捨去）
```

6 < 7，這個請求還可接受。書中引用 Cloudflare 的實驗：4 億個請求中只有約 0.003% 被錯誤放行或拒絕。

### Java 範例：Token 桶

```java
public class TokenBucketDemo {
    static class TokenBucket {
        private final long capacity;
        private final double refillPerSecond;
        private double tokens;
        private long lastRefillNanos;

        TokenBucket(long capacity, double refillPerSecond, long nowNanos) {
            this.capacity = capacity;
            this.refillPerSecond = refillPerSecond;
            this.tokens = capacity;
            this.lastRefillNanos = nowNanos;
        }

        synchronized boolean tryAcquire(long nowNanos) {
            double elapsedSeconds = (nowNanos - lastRefillNanos) / 1_000_000_000.0;
            tokens = Math.min(capacity, tokens + elapsedSeconds * refillPerSecond);
            lastRefillNanos = nowNanos;
            if (tokens >= 1) {
                tokens -= 1;
                return true;
            }
            return false;
        }
    }

    public static void main(String[] args) {
        TokenBucket bucket = new TokenBucket(4, 2, 0); // 容量 4，每秒補 2 個
        for (int i = 1; i <= 6; i++)
            System.out.println("t=0s request " + i + " -> " + bucket.tryAcquire(0));
        long oneSecond = 1_000_000_000L;
        for (int i = 1; i <= 3; i++)
            System.out.println("t=1s request " + i + " -> " + bucket.tryAcquire(oneSecond));
    }
}
```

輸出：前 4 個通過、第 5–6 個被拒絕；1 秒後補回 2 個，前 2 個通過、第 3 個被拒絕。這個範例是單機版，分散式版本要把計數放進共用儲存（見下）。

### 架構與細節

- **計數器放記憶體快取**（例如 Redis），不用資料庫，因為磁碟太慢。Redis 提供 `INCR`（計數加一）與 `EXPIRE`（設定過期）。
- **規則**存在設定檔（磁碟），由 worker 定期載入快取。規則形如「登入每分鐘最多 5 次」「行銷訊息每天最多 5 則」。
- **回應標頭**讓客戶端知道狀態：`X-Ratelimit-Remaining`、`X-Ratelimit-Limit`、`X-Ratelimit-Retry-After`。
- 被拒絕的請求可以直接丟棄，或放進佇列稍後處理（例如因系統超載被擋的訂單）。

流程：客戶端 → 限流器（讀規則、讀 Redis 計數）→ 未超限就轉給 API 伺服器並更新計數；超限就回 429。

### 分散式環境的兩個問題

| 問題 | 說明 | 處理 |
| --- | --- | --- |
| **競爭狀況** | 兩個請求都讀到計數 3，各自加一再寫回，結果是 4 而不是 5 | 加鎖會變慢；常用 **Lua 腳本**或 **Redis 已排序集合** |
| **同步** | 多個限流器各自不知道其他客戶端的計數 | 不要用 sticky session（不靈活）；改用 **Redis 等集中儲存** |

### 後續可以聊

- 多資料中心：邊緣伺服器離使用者近，降低延遲；跨區同步可用終究一致性。
- 監控：演算法是否有效？規則是否過嚴（誤擋正常請求）？遇到限時搶購這類突發流量，可改用 Token 桶。
- **硬性 vs 軟性限制**：硬性不可超過門檻；軟性可短時間超過。
- 其他層級：書中只談第 7 層（HTTP），也可以在第 3 層對 IP 限流（例如 Iptables）。
- 客戶端也要守規矩：快取、了解限制、捕捉例外、加入退避時間（back-off）。

## 一致性雜湊

### 問題：取餘數的重新分配

最簡單的負載分配是 `server = hash(key) % N`。N 固定時沒問題，但**增減伺服器時，N 改變，幾乎所有 key 都映射到別台**，快取會大量失效。

書中範例：4 台伺服器時 key 分佈一種樣子，一台離線變 3 台後，大多數 key 都換了伺服器，連原本不在離線那台的 key 也受影響。

### 雜湊環

一致性雜湊在 N 變動時，平均只需重新映射 `k / n` 個 key（k 是 key 總數，n 是槽位數）。

1. 把雜湊空間（例如 SHA-1 的 `0 ~ 2^160 − 1`）首尾相接成**環**。
2. 用同一個雜湊函式（不取餘數）把**伺服器**與 **key** 都映射到環上。
3. 找 key 對應的伺服器：從 key 的位置**順時針**走，遇到的第一台就是。

```text
環上位置（順時針遞增，尾端接回開頭）：

  s0 → key0 → s1 → key1 → s2 → key2 → s3 → key3 → （回到 s0）

key0 順時針遇到的第一台是 s1，key1 → s2，key2 → s3，key3 → 繞回 s0
```

- **加一台**：只有新伺服器到它逆時針方向前一台之間的 key 要搬。
- **移除一台**：只有那台負責的 key 要搬給順時針的下一台。

### 兩個問題與虛擬節點

| 問題 | 原因 |
| --- | --- |
| 各伺服器的**分區大小**不均 | 增減伺服器後，環上間隔大小不一 |
| key 在環上**分佈不均** | 伺服器位置湊巧集中，有的伺服器完全沒資料 |

解法是**虛擬節點**：每台實體伺服器在環上對應多個虛擬節點。虛擬節點越多，分佈越均勻（標準差越小）。書中引用實驗：100 個虛擬節點時標準差約為平均值的 10%，200 個約為 5%。代價是需要更多空間儲存虛擬節點資料，要自己權衡。

### Java 範例

```java
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;

public class ConsistentHashDemo {
    static class Ring {
        private final TreeMap<Long, String> ring = new TreeMap<>();
        private final int virtualNodes;

        Ring(int virtualNodes) { this.virtualNodes = virtualNodes; }

        void addServer(String server) {
            for (int i = 0; i < virtualNodes; i++) ring.put(hash(server + "#" + i), server);
        }

        void removeServer(String server) {
            for (int i = 0; i < virtualNodes; i++) ring.remove(hash(server + "#" + i));
        }

        String locate(String key) {
            // 從 key 的位置順時針找第一個虛擬節點；超過尾端就回到環的開頭
            Map.Entry<Long, String> e = ring.ceilingEntry(hash(key));
            return (e != null ? e : ring.firstEntry()).getValue();
        }

        private static long hash(String s) {
            try {
                byte[] d = MessageDigest.getInstance("SHA-1").digest(s.getBytes(StandardCharsets.UTF_8));
                long h = 0;
                for (int i = 0; i < 8; i++) h = (h << 8) | (d[i] & 0xff);
                return h >>> 1; // 取 63 位元，避免負數影響排序
            } catch (Exception ex) {
                throw new IllegalStateException(ex);
            }
        }
    }

    public static void main(String[] args) {
        Ring ring = new Ring(200);
        for (String s : List.of("s0", "s1", "s2", "s3")) ring.addServer(s);

        int total = 10_000;
        Map<String, String> before = new HashMap<>();
        Map<String, Integer> load = new TreeMap<>();
        for (int i = 0; i < total; i++) {
            String s = ring.locate("key" + i);
            before.put("key" + i, s);
            load.merge(s, 1, Integer::sum);
        }
        System.out.println("4 台伺服器的分佈: " + load);

        ring.removeServer("s1");
        int moved = 0;
        for (var e : before.entrySet())
            if (!ring.locate(e.getKey()).equals(e.getValue())) moved++;
        System.out.printf("移除 s1 後搬動 %d 個 key，s1 原本負責 %d 個%n", moved, load.get("s1"));
    }
}
```

實際執行：4 台各約 2,400–2,600 個 key（200 個虛擬節點）；移除 s1 後搬動的 key 數**恰好等於 s1 原本負責的數量**，其他伺服器的 key 完全沒動。

### 優點與使用場景

- 增減伺服器時搬動的 key 最少。
- 資料分佈更均勻，水平擴展容易。
- 改善多個 key 在節點間的負載分布，但**不能自行拆散單一熱鍵**：同一 key 仍映射到同一負責節點，增加虛擬節點也不會改變這點。單一 key 過熱需另用讀取副本、熱門快取或資料拆分等措施。

實際使用：Amazon Dynamo 的分區元件、Apache Cassandra 的跨叢集分區、Discord、Akamai CDN、Maglev 網路負載平衡器。

## 鍵值儲存系統

鍵值儲存（key-value store）把資料存成 `key → value`，key 唯一，value 對系統來說通常是不透明物件。書中設計的目標：

- 鍵值對小於 10 KB，能存大量資料。
- 高可用（故障時也能快速回應）、高擴展、能依流量自動加減伺服器。
- **一致性程度可調整**，延遲低。

操作只有兩個：`put(key, value)` 與 `get(key)`。

### 單機與分散式

單機可以用記憶體雜湊表，並用「資料壓縮」與「只把常用資料放記憶體」撐更久，但終究有上限，所以要做**分散式鍵值儲存**。

### CAP 定理

分散式系統**最多同時滿足三項中的兩項**：

| 屬性 | 意義 |
| --- | --- |
| 一致性（C） | 連到哪個節點，所有客戶端都在同一時間看到相同資料 |
| 可用性（A） | 即使部分節點故障，仍能得到回應 |
| 分區容錯（P） | 兩節點之間斷線，系統仍能運作 |

網路故障無可避免，所以分散式系統**一定要有 P**，實際上只剩兩種選擇：

| 類型 | 發生分區時 | 例子 |
| --- | --- | --- |
| **CP** | 拒絕寫入以保持一致，犧牲可用性 | 銀行系統：餘額必須正確，有問題寧可先告知系統不可用 |
| **AP** | 繼續接受讀寫，可能回舊資料，恢復後再同步 | 以可用性優先的系統 |

書中說明，CA 在實務上不存在，因為不能容忍網路分區的分散式系統不實際。

### 核心技術一覽

| 目標／問題 | 技術 |
| --- | --- |
| 存大量資料 | 一致性雜湊分散負載 |
| 高可用讀取 | 資料複製、多資料中心 |
| 高可用寫入 | 向量時鐘版本控制與衝突解決 |
| 資料分區、漸進擴展、處理異質性 | 一致性雜湊（虛擬節點數與伺服器容量成正比） |
| 一致性可調 | 最低門檻共識（quorum） |
| 暫時性故障 | 草率仲裁 + 提示換手 |
| 永久性故障 | 反熵 + Merkle 樹 |
| 資料中心停擺 | 跨資料中心複製 |

### 資料複製與 Quorum

資料非同步複製到 **N** 台：key 映射到環上後，順時針取前 N 台**不同的實體伺服器**（虛擬節點可能指向同一台，要略過）。N 台最好放在不同資料中心。

定義：

- **N**：副本數。
- **W**：寫入要被 W 個副本確認才算成功。
- **R**：讀取要等 R 個副本回應。

| 設定 | 效果 |
| --- | --- |
| R = 1、W = N | 針對**快速讀取**最佳化 |
| W = 1、R = N | 針對**快速寫入**最佳化 |
| **W + R > N** | 在**同一固定的 N 個副本集合**內，成功寫入的 W 個副本與讀取的 R 個副本必有交集，例如 N=3、W=R=2；這本身不是強一致的完整保證 |
| W + R ≤ N | 讀寫集合可能沒有交集，因此可能讀到舊值 |

W 或 R 設為 1 時只需等第一個成功回應；設越大，通常要等更多副本，延遲與可用性成本也越高。只有設為 N 時才必須等全部副本。

**補充原書的簡化說法：** 集合相交不等於已建立線性一致性，還要處理版本判定、並行寫入、未完成寫入與讀寫排序。後文的 **sloppy quorum** 允許替代節點，讀寫集合甚至可能不相交，不能直接套用固定副本集合的推論。[Dynamo 原始論文第 4.5–4.6 節](https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf) 說明了 quorum-like 操作與 sloppy quorum 的取捨。

### 一致性模型

| 模型 | 說明 |
| --- | --- |
| 強一致 | 讀取一定看到最新寫入 |
| 弱一致 | 後續讀取可能看不到最新值 |
| **終究一致** | 弱一致的一種：給足夠時間，所有更新都會傳到，副本一致 |

書中以「每個副本確認寫入後才接受新讀寫」說明強一致的成本；實作仍需有正確的操作排序與故障處理協定，不能只靠等待全部副本。書中設計採終究一致，參考 Dynamo 的版本管理與客戶端衝突協調；後面的 Cassandra 儲存路徑是另一個參考，不代表兩者的衝突處理方式相同。

### 向量時鐘

用 `D([Server, version], ...)` 記錄每個資料版本經過哪些伺服器。寫到伺服器 `Si` 時：若 `[Si, vi]` 已存在就加一，否則新增 `[Si, 1]`。

```text
D1([Sx,1])              Sx 寫入
D2([Sx,2])              Sx 再寫（D2 覆蓋 D1）
D3([Sx,2],[Sy,1])       Sy 在 D2 基礎上寫
D4([Sx,2],[Sz,1])       Sz 在 D2 基礎上寫    ← D3 與 D4 衝突
D5([Sx,3],[Sy,1],[Sz,1])  客戶端讀到兩者、解決衝突後由 Sx 寫回
```

- **祖先關係**：版本 X 每個計數都 ≥ Y 對應計數 → X 是 Y 的後代，沒有衝突。
- **衝突**：X 有些計數小於 Y、有些大於 Y → 兩者是同級，要協調。例如 `D([s0,1],[s1,2])` 與 `D([s0,2],[s1,1])`。

缺點：客戶端要實作衝突解決邏輯；`[server, version]` 成對資料可能越長越多，因此設門檻、超過就刪除最舊的（可能影響協調效果，但 Dynamo 論文指出 Amazon 沒遇到過）。

### 故障偵測與處理

**偵測：Gossip 協定。** 單一來源說某台故障不夠，需要至少兩個獨立來源。all-to-all 多播在大叢集效率差，改用 gossip：

1. 每個節點維護成員列表（成員 ID 與心跳計數）。
2. 定期遞增自己的心跳，並隨機傳給一組節點，由它們繼續擴散。
3. 收到後更新成員列表。
4. 某成員心跳超過預設時間沒增加，標記為離線。

**暫時性故障：草率仲裁 + 提示換手。** 嚴格 quorum 可能擋住讀寫。草率仲裁改成在環上選前 W／R 個**健康**的伺服器，忽略離線的。離線機器的請求由別台暫時代理，等它恢復後把修改推回去，這個過程稱為**提示換手（hinted handoff）**。

**永久性故障：反熵 + Merkle 樹。** Merkle 樹（雜湊樹）每個非葉節點的標籤是子節點雜湊值。步驟：把 key 空間分桶 → 對桶內 key 雜湊 → 每桶一個雜湊節點 → 往上算到根。比對兩個副本時先比根，不同再往下，**只同步有差異的桶**，傳輸量與差異成正比，而不是與整份資料成正比。

### 讀寫路徑（以 Cassandra 為基礎）

| 路徑 | 步驟 |
| --- | --- |
| 寫入 | 寫入**提交日誌** → 寫入記憶體快取 → 記憶體滿或達門檻時，**刷新到磁碟的 SSTable**（已排序字串表） |
| 讀取 | 先看記憶體快取，有就直接回；沒有就問 **Bloom 篩選器**判斷可能在哪些 SSTable，再從 SSTable 取結果 |

系統去中心化，每個節點都有相同職責（客戶端 API、故障偵測、衝突解決、故障修復、複製、儲存引擎），因此沒有單點故障。協調者（coordinator）則是客戶端與節點之間的代理。

## 唯一 ID 生成器

### 需求

資料庫的 `auto_increment` 在分散式環境不好用：單一資料庫不夠大，且在多個資料庫間要以最小延遲產生唯一 ID 很困難。書中的需求：

- ID 唯一、只含數字、**64 位元**。
- 依**時間排序**（晚上建立的 ID 大於早上的，不必只遞增 1）。
- 每秒可產生 10,000 個以上。

### 四種做法比較

| 做法 | 優點 | 缺點 |
| --- | --- | --- |
| **多 master 複寫** | 用資料庫 `auto_increment`，但每次加 k（k 為資料庫數量），可隨資料庫數量擴展 | 難以跨多資料中心；ID 不隨時間遞增；增減伺服器擴展性差 |
| **UUID** | 128 位元，各 Web 伺服器自行產生，不需協調，容易擴展 | 128 位元不符 64 位元要求；不隨時間遞增；可能含非數字 |
| **票證伺服器**（Flickr） | 單一資料庫集中管理 `auto_increment`，簡單，適合中小型應用 | **單點故障**；多台票證伺服器要解決同步 |
| **Twitter Snowflake** | 分治：ID 切成多個欄位，符合所有需求 | 要處理時鐘同步 |

### Snowflake 的 64 位元配置

```text
| 1 bit | 41 bits       | 5 bits        | 5 bits    | 12 bits  |
| 符號  | 時間戳（毫秒） | 資料中心 ID   | 機器 ID   | 序列編號 |
```

| 欄位 | 說明 |
| --- | --- |
| 符號位元 | 永遠為 0，保留給未來 |
| 時間戳 | 自某起算時間（Twitter 預設 `1288834974657`，約 UTC 2010-11-04 01:42:54）以來的毫秒數 |
| 資料中心 ID | 5 位元 → 32 個資料中心 |
| 機器 ID | 5 位元 → 每個資料中心 32 台 |
| 序列編號 | 12 位元，同一毫秒內遞增，**每毫秒重設為 0** |

- 41 位元的時間戳最多約 **69 年**；起算時間設得更接近今天可延後到期，到期要換起算時間或遷移 ID 技術。
- 12 位元序列 = 4,096 種組合：理論上同一台機器每毫秒最多 4,096 個 ID。
- 資料中心 ID 與機器 ID 在啟動時決定，通常不變；**隨意修改可能造成 ID 衝突**。

### Java 範例

```java
public class SnowflakeDemo {
    static final long EPOCH = 1288834974657L; // Twitter 預設起算時間

    static class Snowflake {
        private final long datacenterId, machineId;
        private long lastTimestamp = -1L, sequence = 0L;

        Snowflake(long datacenterId, long machineId) {
            if (datacenterId < 0 || datacenterId > 31 || machineId < 0 || machineId > 31)
                throw new IllegalArgumentException("datacenterId / machineId 必須在 0..31");
            this.datacenterId = datacenterId;
            this.machineId = machineId;
        }

        synchronized long nextId(long nowMillis) {
            if (nowMillis < lastTimestamp) throw new IllegalStateException("時鐘倒退，拒絕產生 ID");
            if (nowMillis == lastTimestamp) {
                sequence = (sequence + 1) & 0xFFF;       // 12 位元序列號
                if (sequence == 0) {                      // 同一毫秒用完 4096 個，等下一毫秒
                    while (nowMillis <= lastTimestamp) nowMillis = System.currentTimeMillis();
                }
            } else {
                sequence = 0;
            }
            lastTimestamp = nowMillis;
            return ((nowMillis - EPOCH) << 22) | (datacenterId << 17) | (machineId << 12) | sequence;
        }
    }

    public static void main(String[] args) {
        Snowflake sf = new Snowflake(1, 3);
        long a = sf.nextId(1_700_000_000_000L);
        long b = sf.nextId(1_700_000_000_000L); // 同一毫秒，序列號 +1
        long c = sf.nextId(1_700_000_000_001L);
        System.out.println(a < b && b < c);      // true
        System.out.println((b & 0xFFF) + " " + ((b >> 12) & 0x1F) + " " + ((b >> 17) & 0x1F)); // 1 3 1
    }
}
```

這是教學用的簡化版。實際環境還要處理機器 ID 的配置與時鐘回撥的恢復策略。

### 後續可以聊

- **時鐘同步**：假設各台機器時鐘相同在多核、多機環境未必成立，常用 **NTP**。
- **欄位長度調整**：低並行、跨時間長的應用，可減少序列位元、增加時間戳位元。
- **高可用**：ID 生成器是其他系統的基礎，必須高可用。
