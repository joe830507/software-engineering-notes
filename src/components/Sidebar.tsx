import { useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { navigation, type NavItem } from '../navigation'

// 各分類的小圖示（純文字符號，避免被系統轉成彩色 emoji）
const ICONS: Record<string, string> = {
  languages: '</>',
  frameworks: '◫',
  database: '▤',
  cloud: '☁',
  engineering: '◎',
  interview: '✎',
}

/** 子樹（含更深層）裡是否有項目對應目前網址 */
function containsPath(items: NavItem[], prefix: string, pathname: string): boolean {
  return items.some(
    (c) =>
      (c.slug !== undefined && pathname === prefix + c.slug) ||
      (c.children !== undefined && containsPath(c.children, prefix, pathname)),
  )
}

export default function Sidebar({ onCollapse }: { onCollapse: () => void }) {
  const { pathname } = useLocation()
  const activeGroup = pathname.split('/')[1]
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  // 預設全部收合；目前頁面所在的群組自動展開。使用者手動切換後以手動結果為準
  const toggle = (key: string, current: boolean) =>
    setCollapsed((c) => ({ ...c, [key]: !current }))

  const renderItems = (groupId: string, items: NavItem[], parentKey: string) => (
    <ul>
      {items.map((it) => {
        const key = `${parentKey}/${it.slug ?? it.title}`
        if (it.children) {
          // 目前頁面在這個子樹裡時，標題用強調色並預設展開
          const active = containsPath(it.children, `/${groupId}/`, pathname)
          const isCollapsed = collapsed[key] ?? !active
          return (
            <li key={key}>
              <button
                className={`sub-title${active ? ' active' : ''}`}
                onClick={() => toggle(key, isCollapsed)}
                aria-expanded={!isCollapsed}
              >
                <span className="label">{it.title}</span>
                <span className="arrow">{isCollapsed ? '▸' : '▾'}</span>
              </button>
              {!isCollapsed && renderItems(groupId, it.children, key)}
            </li>
          )
        }
        return (
          <li key={key}>
            <NavLink to={`/${groupId}/${it.slug}`}>{it.title}</NavLink>
          </li>
        )
      })}
    </ul>
  )

  return (
    <nav className="sidebar">
      <div className="brand">
        <Link to="/" className="brand-link">
          <span className="brand-logo">{'{ }'}</span>
          <span className="brand-text">
            <span className="brand-name">軟體工程筆記</span>
            <span className="brand-sub">SOFTWARE ENGINEERING NOTES</span>
          </span>
        </Link>
        <button className="icon-btn" onClick={onCollapse} aria-label="收起側邊欄">
          «
        </button>
      </div>

      <div className="nav-label">學習空間</div>
      {navigation.map((g) => {
        const isCollapsed = collapsed[g.id] ?? activeGroup !== g.id
        return (
          <section key={g.id}>
            <button
              className={`group-title${activeGroup === g.id ? ' active' : ''}`}
              onClick={() => toggle(g.id, isCollapsed)}
              aria-expanded={!isCollapsed}
            >
              <span className="g-icon" aria-hidden>
                {ICONS[g.id] ?? '•'}
              </span>
              <span className="label">{g.title}</span>
              <span className="arrow">{isCollapsed ? '▸' : '▾'}</span>
            </button>
            {!isCollapsed && renderItems(g.id, g.items, g.id)}
          </section>
        )
      })}
    </nav>
  )
}
