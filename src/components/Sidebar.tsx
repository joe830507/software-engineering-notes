import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { navigation, type NavItem } from '../navigation'

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

  const toggle = (key: string) => setCollapsed((c) => ({ ...c, [key]: !c[key] }))

  const renderItems = (groupId: string, items: NavItem[], parentKey: string) => (
    <ul>
      {items.map((it) => {
        const key = `${parentKey}/${it.slug ?? it.title}`
        if (it.children) {
          const isCollapsed = collapsed[key] ?? false
          // 目前頁面在這個子樹裡時，標題用強調色
          const active = containsPath(it.children, `/${groupId}/`, pathname)
          return (
            <li key={key}>
              <button
                className={`sub-title${active ? ' active' : ''}`}
                onClick={() => toggle(key)}
                aria-expanded={!isCollapsed}
              >
                <span className="arrow">{isCollapsed ? '▸' : '▾'}</span>
                {it.title}
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
      <div className="site-header">
        <h1 className="site-title">軟體工程筆記</h1>
        <button className="collapse-btn" onClick={onCollapse} aria-label="收起側邊欄">
          «
        </button>
      </div>
      {navigation.map((g) => {
        const isCollapsed = collapsed[g.id] ?? false
        return (
          <section key={g.id}>
            <button
              className={`group-title${activeGroup === g.id ? ' active' : ''}`}
              onClick={() => toggle(g.id)}
              aria-expanded={!isCollapsed}
            >
              <span className="arrow">{isCollapsed ? '▸' : '▾'}</span>
              {g.title}
            </button>
            {!isCollapsed && renderItems(g.id, g.items, g.id)}
          </section>
        )
      })}
    </nav>
  )
}
