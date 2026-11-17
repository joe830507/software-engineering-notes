export interface NavItem {
  /** 對應 src/notes/<group>/<slug>.md；slug 可含子資料夾，例如 java/basics。有 children 的項目可省略 */
  slug?: string
  title: string
  /** 子頁面，會在 sidebar 形成第三層 */
  children?: NavItem[]
}

export interface NavGroup {
  /** 資料夾名稱，同時是網址的第一段 */
  id: string
  title: string
  items: NavItem[]
}

// 擴充分類：在這裡新增 group / item，再到 src/notes/<id>/<slug>.md 寫筆記即可
export const navigation: NavGroup[] = [
  {
    id: 'languages',
    title: '程式語言',
    items: [
      {
        title: 'Java',
        children: [
          { slug: 'java/basics', title: '基礎語法' },
          { slug: 'java/control-arrays', title: '流程控制與陣列' },
          { slug: 'java/string', title: '字串' },
          { slug: 'java/oop', title: '物件導向' },
          { slug: 'java/exception', title: '例外處理' },
          { slug: 'java/collections', title: '集合框架' },
          { slug: 'java/generics-lambda', title: '泛型、Lambda 與 Stream' },
          { slug: 'java/time-versions', title: '日期時間與版本特性' },
          {
            title: '進階',
            children: [
              { slug: 'java/advanced/concurrency-basics', title: '執行緒基礎' },
              { slug: 'java/advanced/concurrency-sync', title: '執行緒安全與鎖' },
              { slug: 'java/advanced/concurrency-atomic', title: 'CAS、原子類別與 ThreadLocal' },
              { slug: 'java/advanced/thread-pool', title: '執行緒池' },
              { slug: 'java/advanced/concurrency-tools', title: '並行工具與 CompletableFuture' },
              { slug: 'java/advanced/deadlock-virtual-thread', title: '死結與虛擬執行緒' },
              { slug: 'java/advanced/collections-advanced', title: '集合進階' },
              { slug: 'java/advanced/jvm-memory', title: 'JVM 記憶體與類別載入' },
              { slug: 'java/advanced/jvm-gc', title: '垃圾回收' },
              { slug: 'java/advanced/jvm-troubleshooting', title: 'JVM 排查與調校' },
              { slug: 'java/advanced/reflection-serialization', title: '反射、註解與序列化' },
            ],
          },
        ],
      },
      {
        title: 'Javascript',
        children: [
          { slug: 'javascript/types', title: '型別與運算' },
          { slug: 'javascript/scope-closure', title: '作用域、提升與閉包' },
          { slug: 'javascript/functions-this', title: '函式與 this' },
          { slug: 'javascript/objects-prototype', title: '物件、原型與類別' },
          { slug: 'javascript/arrays-strings', title: '陣列、字串與正規表示式' },
          { slug: 'javascript/es-modern', title: 'ES6+ 語法與版本特性' },
          {
            title: '進階',
            children: [
              { slug: 'javascript/advanced/event-loop', title: '事件迴圈' },
              { slug: 'javascript/advanced/promise-async', title: 'Promise 與 async/await' },
              { slug: 'javascript/advanced/generators-workers', title: '產生器、非同步迭代與 Worker' },
              { slug: 'javascript/advanced/memory-gc', title: '記憶體與垃圾回收' },
              { slug: 'javascript/advanced/modules-typescript', title: '模組、工具鏈與 TypeScript' },
              { slug: 'javascript/advanced/browser-dom', title: '瀏覽器與 DOM' },
              { slug: 'javascript/advanced/web-network-security', title: '網路、效能與安全' },
              { slug: 'javascript/advanced/handwriting', title: '手寫程式題' },
              { slug: 'javascript/advanced/troubleshooting', title: '問題排查與工程實務' },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'frameworks',
    title: '語言框架',
    items: [
      {
        title: 'Spring/Spring Boot',
        children: [
          {
            title: '核心',
            children: [
              { slug: 'spring/overview-ioc', title: '全景與 IoC 容器' },
              { slug: 'spring/bean-lifecycle-config', title: 'Bean 生命週期、作用域與設定' },
              { slug: 'spring/aop-proxy', title: 'AOP 與代理' },
              { slug: 'spring/events-async-resilience', title: '事件、非同步、排程與韌性' },
            ],
          },
          {
            title: 'Spring Boot',
            children: [
              { slug: 'spring/boot-startup-autoconfig', title: '啟動流程與自動配置' },
              { slug: 'spring/config-logging', title: '外部化設定與日誌' },
            ],
          },
          {
            title: 'Web',
            children: [
              { slug: 'spring/web-mvc', title: 'Spring MVC 請求流程' },
              { slug: 'spring/rest-api', title: 'REST API 實務' },
              { slug: 'spring/http-client-concurrency', title: 'HTTP 客戶端與並行模型' },
            ],
          },
          {
            title: '資料',
            children: [
              { slug: 'spring/jdbc-transaction', title: 'JDBC 與交易管理' },
              { slug: 'spring/data-jpa', title: 'Spring Data JPA' },
              { slug: 'spring/database-infra', title: '連線池、遷移與多資料來源' },
              { slug: 'spring/cache-kafka', title: '快取、Redis 與 Kafka' },
            ],
          },
          {
            title: 'ORM 與資料存取',
            children: [
              { slug: 'spring/orm-overview', title: '選型總覽' },
              { slug: 'spring/jpa-hibernate-advanced', title: 'JPA / Hibernate 進階' },
              { slug: 'spring/mybatis-basics', title: 'MyBatis 基礎' },
              { slug: 'spring/mybatis-advanced', title: 'MyBatis 進階' },
              { slug: 'spring/mybatis-plus', title: 'MyBatis-Plus' },
              { slug: 'spring/jdbc-client-data-jdbc', title: 'JdbcClient 與 Spring Data JDBC' },
              { slug: 'spring/jooq', title: 'jOOQ' },
            ],
          },
          {
            title: '安全',
            children: [
              { slug: 'spring/security-architecture', title: 'Spring Security 架構' },
              { slug: 'spring/security-jwt-oauth2', title: 'JWT、OAuth2 與方法層級授權' },
            ],
          },
          {
            title: '測試與維運',
            children: [
              { slug: 'spring/testing', title: '測試' },
              { slug: 'spring/actuator-observability', title: 'Actuator 與可觀測性' },
              { slug: 'spring/packaging-deployment', title: '打包、部署與啟動效能' },
              { slug: 'spring/cloud-upgrade', title: 'Spring Cloud 與版本升級' },
            ],
          },
          { slug: 'spring/interview', title: '面試題與速查' },
        ],
      },
      {
        title: 'Vue.js',
        children: [
          { slug: 'vue/vue3-overview-reactivity', title: 'Vue 3 總覽與響應式' },
          { slug: 'vue/vue3-components', title: '元件' },
          { slug: 'vue/vue3-composables-ecosystem', title: 'Composables 與生態系' },
          { slug: 'vue/vue3-typescript-performance', title: 'TypeScript 與效能' },
          { slug: 'vue/vue2-migration', title: 'Vue 2 遷移與學習路線' },
        ],
      },
      { slug: 'react', title: 'React.js' },
    ],
  },
  {
    id: 'database',
    title: 'SQL與資料庫',
    items: [
      {
        title: 'SQL',
        children: [
          { slug: 'sql/basics', title: '基礎查詢與篩選' },
          { slug: 'sql/joins-sets', title: '結合與集合運算' },
          { slug: 'sql/functions-aggregation', title: '函式、分組、子查詢與 CASE' },
          { slug: 'sql/window', title: '視窗函數' },
          { slug: 'sql/ddl-transaction', title: '資料定義、約束、交易與檢視表' },
          { slug: 'sql/advanced-patterns', title: '進階技巧' },
          { slug: 'sql/style-theory', title: '寫法風格與關聯模型理論' },
        ],
      },
      { slug: 'oracle', title: 'Oracle' },
      { slug: 'postgresql', title: 'PostgreSQL' },
      { slug: 'mysql', title: 'MySQL' },
      {
        title: '效能最佳化',
        children: [
          { slug: 'performance/overview', title: '最佳化流程與核心名詞' },
          { slug: 'performance/index-design', title: '索引設計' },
          { slug: 'performance/query-rewriting', title: 'SQL 改寫準則' },
          { slug: 'performance/execution-plan', title: '執行計畫判讀' },
          { slug: 'performance/application-production', title: '應用層調校與上線' },
        ],
      },
    ],
  },
  {
    id: 'cloud',
    title: '雲端',
    items: [{ slug: 'aws', title: 'AWS' }],
  },
  {
    id: 'engineering',
    title: '軟體工程',
    items: [
      { slug: 'data-structures', title: '資料結構' },
      { slug: 'algorithms', title: '演算法' },
      {
        title: '設計模式',
        children: [
          { slug: 'design-patterns/overview', title: '總覽與答題方法' },
          { slug: 'design-patterns/creational', title: '創建型模式' },
          { slug: 'design-patterns/structural', title: '結構型模式' },
          { slug: 'design-patterns/behavioral', title: '行為型模式' },
          { slug: 'design-patterns/comparison', title: '比較與速查' },
          { slug: 'design-patterns/interview', title: '面試自測' },
        ],
      },
      { slug: 'agile', title: '敏捷開發' },
    ],
  },
  {
    id: 'interview',
    title: '面試',
    items: [
      {
        title: 'LeetCode',
        children: [
          { slug: 'leetcode/overview', title: '刷題方法與面試流程' },
          { slug: 'leetcode/patterns', title: '解題模式速查' },
          { slug: 'leetcode/arrays-hashing', title: '陣列與雜湊表' },
          { slug: 'leetcode/two-pointers-window', title: '雙指標與滑動視窗' },
          { slug: 'leetcode/linked-list', title: '鏈結串列' },
          { slug: 'leetcode/stack-monotonic', title: '堆疊與單調堆疊' },
          { slug: 'leetcode/tree-graph', title: '二元樹與圖' },
          { slug: 'leetcode/backtracking', title: '遞迴與回溯' },
          { slug: 'leetcode/binary-search-intervals', title: '二分搜尋與區間' },
          { slug: 'leetcode/dp', title: '動態規劃' },
          { slug: 'leetcode/heap-trie', title: '堆積與字典樹' },
          { slug: 'leetcode/graph-advanced', title: '拓撲排序、並查集與最短路徑' },
          { slug: 'leetcode/greedy-bit', title: '貪婪與位元運算' },
        ],
      },
      { slug: 'behavior-interview', title: 'Behavior Interview' },
    ],
  },
]

/** 找出第一個有 slug 的頁面（首頁導向用） */
export function firstLeaf(): { group: string; slug: string } | undefined {
  for (const g of navigation) {
    const slug = firstSlug(g.items)
    if (slug) return { group: g.id, slug }
  }
  return undefined
}

export function firstSlug(items: NavItem[]): string | undefined {
  for (const it of items) {
    if (it.slug) return it.slug
    const s = it.children && firstSlug(it.children)
    if (s) return s
  }
  return undefined
}

/** 依網址的 group 與 slug 找到導覽項目（取標題用） */
export function findItem(group: string, slug: string): NavItem | undefined {
  const walk = (items: NavItem[]): NavItem | undefined => {
    for (const it of items) {
      if (it.slug === slug) return it
      const hit = it.children && walk(it.children)
      if (hit) return hit
    }
    return undefined
  }
  return walk(navigation.find((g) => g.id === group)?.items ?? [])
}
