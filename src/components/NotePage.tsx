import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { getNote } from '../notes'
import { findItem } from '../navigation'
import { parseNote, plainTitle } from '../markdown'

function Md({ children }: { children: string }) {
  if (!children) return null
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={{
        // 表格外包一層，窄螢幕可橫向捲動
        table: ({ node: _node, ...props }) => (
          <div className="table-wrap">
            <table {...props} />
          </div>
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  )
}

function NoteView({ md }: { md: string }) {
  const note = useMemo(() => parseNote(md), [md])
  const [tab, setTab] = useState(0)
  const [sub, setSub] = useState(0)

  // 少於 2 個章節就不需要 tabs，整頁直接顯示
  if (note.sections.length < 2) {
    const rest = md.slice(note.preamble.length).trim()
    return (
      <>
        <Md>{note.preamble}</Md>
        {rest && (
          <div className="panel">
            <Md>{rest}</Md>
          </div>
        )}
      </>
    )
  }

  const section = note.sections[tab]
  const hasPills = section.subs.length >= 2

  const selectTab = (i: number) => {
    setTab(i)
    setSub(0)
  }

  return (
    <>
      <Md>{note.preamble}</Md>

      <ul className="nav nav-tabs" role="tablist">
        {note.sections.map((s, i) => (
          <li key={s.title} role="presentation">
            <button
              role="tab"
              aria-selected={i === tab}
              className={`nav-link${i === tab ? ' active' : ''}`}
              onClick={() => selectTab(i)}
            >
              {plainTitle(s.title)}
            </button>
          </li>
        ))}
      </ul>

      <div className="tab-content">
        <Md>{section.intro}</Md>

        {hasPills ? (
          <>
            <ul className="nav nav-pills" role="tablist">
              {section.subs.map((s, i) => (
                <li key={s.title} role="presentation">
                  <button
                    role="tab"
                    aria-selected={i === sub}
                    className={`nav-link${i === sub ? ' active' : ''}`}
                    onClick={() => setSub(i)}
                  >
                    {plainTitle(s.title)}
                  </button>
                </li>
              ))}
            </ul>
            <Md>{section.subs[sub].body}</Md>
          </>
        ) : (
          // 只有 0 或 1 個 ### 時不用 pills，保留原本的小標題直接顯示
          section.subs.map((s) => (
            <div key={s.title}>
              <h3>{s.title}</h3>
              <Md>{s.body}</Md>
            </div>
          ))
        )}
      </div>
    </>
  )
}

export default function NotePage() {
  const { group = '', '*': slug = '' } = useParams()
  const md = getNote(group, slug)
  const title = findItem(group, slug)?.title

  if (md === undefined) {
    return (
      <article className="note">
        <h1>{title ?? '找不到頁面'}</h1>
        <p className="empty">這個主題還沒有筆記。</p>
      </article>
    )
  }
  return (
    <article className="note">
      {/* 以路徑當 key，換頁時 tab 狀態自動重置 */}
      <NoteView key={`${group}/${slug}`} md={md} />
    </article>
  )
}
