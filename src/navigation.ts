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
      { slug: 'spring', title: 'Spring/Spring Boot' },
      { slug: 'vue', title: 'Vue.js' },
      { slug: 'react', title: 'React.js' },
    ],
  },
  {
    id: 'database',
    title: 'SQL與資料庫',
    items: [
      { slug: 'oracle', title: 'Oracle' },
      { slug: 'postgresql', title: 'PostgreSQL' },
      { slug: 'mysql', title: 'MySQL' },
    ],
  },
  {
    id: 'engineering',
    title: '軟體工程',
    items: [
      { slug: 'data-structures', title: '資料結構' },
      { slug: 'algorithms', title: '演算法' },
      { slug: 'design-patterns', title: '設計模式' },
      { slug: 'agile', title: '敏捷開發' },
    ],
  },
  {
    id: 'interview',
    title: '面試',
    items: [
      { slug: 'leetcode', title: 'LeetCode' },
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
