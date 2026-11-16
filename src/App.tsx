import { useCallback, useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import NotePage from './components/NotePage'
import { firstLeaf } from './navigation'

const MIN_WIDTH = 180
const MAX_WIDTH = 520
const DEFAULT_WIDTH = 260

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v === null ? fallback : (JSON.parse(v) as T)
  } catch {
    return fallback
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 無痕模式等情況下忽略
  }
}

export default function App() {
  const first = firstLeaf()
  const home = first ? `/${first.group}/${first.slug}` : '/'

  const [width, setWidth] = useState(() => load('sidebarWidth', DEFAULT_WIDTH))
  const [open, setOpen] = useState(() => load('sidebarOpen', true))
  const [dragging, setDragging] = useState(false)

  useEffect(() => save('sidebarWidth', width), [width])
  useEffect(() => save('sidebarOpen', open), [open])

  const startDrag = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    setDragging(true)
    const onMove = (ev: PointerEvent) =>
      setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, ev.clientX)))
    const onUp = () => {
      setDragging(false)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [])

  return (
    <div
      className={`layout${dragging ? ' dragging' : ''}`}
      style={{ '--sidebar-width': `${width}px` } as React.CSSProperties}
    >
      {open && (
        <div className="sidebar-wrap">
          <Sidebar onCollapse={() => setOpen(false)} />
          <div
            className="resizer"
            role="separator"
            aria-orientation="vertical"
            aria-label="調整側邊欄寬度"
            onPointerDown={startDrag}
            onDoubleClick={() => setWidth(DEFAULT_WIDTH)}
          />
        </div>
      )}
      {!open && (
        <button className="expand-btn" onClick={() => setOpen(true)} aria-label="展開側邊欄">
          ☰
        </button>
      )}
      <main className="content">
        <Routes>
          <Route path="/" element={<Navigate to={home} replace />} />
          <Route path="/:group/*" element={<NotePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}
