import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { noteEntries } from '../notes'
import { findItem, navigation } from '../navigation'

interface Result {
  group: string
  slug: string
  title: string
  groupTitle: string
  snippet: string
}

/** 去掉常見 Markdown 符號，讓摘要比較好讀 */
function clean(s: string): string {
  return s.replace(/[`*>#|]/g, '').replace(/\s+/g, ' ').trim()
}

function search(query: string): Result[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const scored: { score: number; r: Result }[] = []

  for (const n of noteEntries) {
    const title = findItem(n.group, n.slug)?.title ?? n.slug
    const inTitle = title.toLowerCase().includes(q)
    const idx = n.text.toLowerCase().indexOf(q)
    if (!inTitle && idx < 0) continue

    const start = Math.max(0, idx - 24)
    const snippet = idx >= 0 ? clean(n.text.slice(start, idx + q.length + 60)) : ''
    scored.push({
      score: (inTitle ? 100 : 0) + (idx >= 0 ? 1 : 0),
      r: {
        group: n.group,
        slug: n.slug,
        title,
        groupTitle: navigation.find((g) => g.id === n.group)?.title ?? '',
        snippet: idx >= 0 ? `${start > 0 ? '…' : ''}${snippet}…` : '',
      },
    })
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((x) => x.r)
}

export default function Search() {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const results = useMemo(() => search(query), [query])

  // 按 "/" 聚焦搜尋列（在輸入欄位中打字時不攔截）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      const typing = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
      if (e.key === '/' && !typing) {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // 點擊搜尋區外面時關閉結果
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const go = (r: Result) => {
    navigate(`/${r.group}/${r.slug}`)
    setOpen(false)
    setQuery('')
    inputRef.current?.blur()
  }

  return (
    <div className="search" ref={boxRef}>
      <span className="search-icon" aria-hidden>
        ⌕
      </span>
      <input
        ref={inputRef}
        value={query}
        placeholder="搜尋主題或內容…"
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setOpen(false)
            inputRef.current?.blur()
          }
          if (e.key === 'Enter' && results[0]) go(results[0])
        }}
      />
      <kbd>/</kbd>

      {open && query.trim() && (
        <ul className="search-results">
          {results.length === 0 && <li className="search-empty">找不到「{query}」</li>}
          {results.map((r) => (
            <li key={`${r.group}/${r.slug}`}>
              <button onClick={() => go(r)}>
                <span className="r-title">{r.title}</span>
                <span className="r-group">{r.groupTitle}</span>
                {r.snippet && <span className="r-snippet">{r.snippet}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
