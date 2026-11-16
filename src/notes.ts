// 以 Vite glob 載入所有 Markdown 筆記（原始文字）
const modules = import.meta.glob('./notes/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

export interface NoteEntry {
  group: string
  slug: string
  text: string
}

/** 所有筆記（搜尋用） */
export const noteEntries: NoteEntry[] = Object.entries(modules).flatMap(([path, text]) => {
  const m = /^\.\/notes\/([^/]+)\/(.+)\.md$/.exec(path)
  return m ? [{ group: m[1], slug: m[2], text }] : []
})

export function getNote(group: string, slug: string): string | undefined {
  return modules[`./notes/${group}/${slug}.md`]
}
