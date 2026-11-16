import { Link, useLocation } from 'react-router-dom'
import Search from './Search'
import { findItem, navigation } from '../navigation'

interface Props {
  sidebarOpen: boolean
  onOpenSidebar: () => void
  scale: number
  onCycleScale: () => void
}

export default function Topbar({ sidebarOpen, onOpenSidebar, scale, onCycleScale }: Props) {
  const { pathname } = useLocation()
  const [, groupId, ...rest] = pathname.split('/')
  const group = navigation.find((g) => g.id === groupId)
  const item = group ? findItem(group.id, rest.join('/')) : undefined

  return (
    <header className="topbar">
      {!sidebarOpen && (
        <button className="icon-btn" onClick={onOpenSidebar} aria-label="展開側邊欄">
          ☰
        </button>
      )}
      <nav className="crumbs" aria-label="麵包屑">
        <Link to="/">首頁</Link>
        {group && (
          <>
            <span className="sep">/</span>
            <span>{group.title}</span>
          </>
        )}
        {item && (
          <>
            <span className="sep">/</span>
            <span className="current">{item.title}</span>
          </>
        )}
      </nav>
      <Search />
      <button className="scale-btn" onClick={onCycleScale} title="調整內文字級">
        Aa {Math.round(scale * 100)}%
      </button>
    </header>
  )
}
