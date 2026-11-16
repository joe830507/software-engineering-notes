import { useCallback, useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useMediaQuery } from './useMediaQuery'
import Sidebar from './components/Sidebar'
import Topbar from './components/Topbar'
import NotePage from './components/NotePage'
import Home from './components/Home'

const MIN_WIDTH = 200
const MAX_WIDTH = 520
const DEFAULT_WIDTH = 270
const SCALES = [0.9, 1, 1.1, 1.25]

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
  const [width, setWidth] = useState(() => load('sidebarWidth', DEFAULT_WIDTH))
  const [open, setOpen] = useState(() => load('sidebarOpen', true))
  const [scale, setScale] = useState(() => load('noteScale', 1))
  const [dragging, setDragging] = useState(false)

  // 手機：側邊欄是蓋在內容上的抽屜，預設收起，換頁後自動關閉
  const isMobile = useMediaQuery('(max-width: 720px)')
  const [drawer, setDrawer] = useState(false)
  const { pathname } = useLocation()
  useEffect(() => setDrawer(false), [pathname])
  useEffect(() => {
    // 抽屜打開時鎖住背景捲動
    document.body.style.overflow = isMobile && drawer ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [isMobile, drawer])

  const showSidebar = isMobile ? drawer : open
  const openSidebar = () => (isMobile ? setDrawer(true) : setOpen(true))
  const closeSidebar = () => (isMobile ? setDrawer(false) : setOpen(false))

  useEffect(() => save('sidebarWidth', width), [width])
  useEffect(() => save('sidebarOpen', open), [open])
  useEffect(() => save('noteScale', scale), [scale])

  const cycleScale = () => {
    const i = SCALES.indexOf(scale)
    setScale(SCALES[(i + 1) % SCALES.length])
  }

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
      style={{ '--sidebar-width': `${width}px`, '--scale': scale } as React.CSSProperties}
    >
      {isMobile && drawer && <div className="drawer-backdrop" onClick={closeSidebar} />}
      {showSidebar && (
        <div className="sidebar-wrap">
          <Sidebar onCollapse={closeSidebar} />
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
      <div className="main">
        <Topbar
          sidebarOpen={showSidebar}
          onOpenSidebar={openSidebar}
          scale={scale}
          onCycleScale={cycleScale}
        />
        <main className="content">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/:group/*" element={<NotePage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}
