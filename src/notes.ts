// 以 Vite glob 載入所有 Markdown 筆記（原始文字）
const modules = import.meta.glob('./notes/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

export function getNote(group: string, slug: string): string | undefined {
  return modules[`./notes/${group}/${slug}.md`]
}
