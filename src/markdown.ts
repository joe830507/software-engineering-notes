export interface SubSection {
  title: string
  body: string
}

export interface Section {
  title: string
  /** 第一個 ### 之前的內容 */
  intro: string
  subs: SubSection[]
}

export interface ParsedNote {
  /** 第一個 ## 之前的內容（含 # 標題與引言） */
  preamble: string
  sections: Section[]
}

/** 去掉標題中的 Markdown 行內語法（反引號、粗體），作為 tab 文字 */
export function plainTitle(title: string): string {
  return title.replace(/`/g, '').replace(/\*\*/g, '').trim()
}

/**
 * 依 `## ` 與 `### ` 標題把筆記切成「章節 → 小節」兩層。
 * 程式碼區塊（```）內的行不會被當成標題。
 */
export function parseNote(md: string): ParsedNote {
  const lines = md.split('\n')
  const preamble: string[] = []
  const sections: { title: string; intro: string[]; subs: { title: string; body: string[] }[] }[] = []
  let inFence = false

  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence

    const h2 = !inFence && /^## (.+)/.exec(line)
    const h3 = !inFence && /^### (.+)/.exec(line)

    if (h2) {
      sections.push({ title: h2[1].trim(), intro: [], subs: [] })
    } else if (h3 && sections.length > 0) {
      sections[sections.length - 1].subs.push({ title: h3[1].trim(), body: [] })
    } else if (sections.length === 0) {
      preamble.push(line)
    } else {
      const sec = sections[sections.length - 1]
      if (sec.subs.length === 0) sec.intro.push(line)
      else sec.subs[sec.subs.length - 1].body.push(line)
    }
  }

  return {
    preamble: preamble.join('\n').trim(),
    sections: sections.map((s) => ({
      title: s.title,
      intro: s.intro.join('\n').trim(),
      subs: s.subs.map((x) => ({ title: x.title, body: x.body.join('\n').trim() })),
    })),
  }
}
