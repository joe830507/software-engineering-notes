import { Link } from 'react-router-dom'
import { firstSlug, navigation } from '../navigation'
import { getNote } from '../notes'

export default function Home() {
  return (
    <article className="note home">
      <h1>軟體工程筆記</h1>
      <p className="lead">
        這是一個用來<strong>學習</strong>與<strong>記錄</strong>的個人筆記站，把學過、查過、踩過坑的軟體工程知識整理成可以隨時回頭翻閱的文字。
      </p>

      <h2>這個網站的用途</h2>
      <ul>
        <li>
          <strong>學習</strong>：把零散的知識系統化，從基礎一路寫到進階，用自己的話整理，比只看過一次更能記住。
        </li>
        <li>
          <strong>筆記</strong>：需要時能快速查到重點、範例與常見陷阱，不用再重新翻書或搜尋。
        </li>
        <li>
          <strong>面試複習</strong>：把常考的概念與題目放在一起，方便面試前快速回顧。
        </li>
      </ul>

      <h2>怎麼使用</h2>
      <p>
        從左側選單挑選主題。較長的筆記會依小節分成上方的<strong>分頁標籤</strong>，有些小節底下還會再細分，一次只看一個重點，不用一路往下捲。左側選單可以拖曳邊緣調整寬度，也能整個收起。
      </p>

      <h2>內容分類</h2>
      <div className="cards">
        {navigation.map((g) => {
          const first = firstSlug(g.items)
          return (
            <section key={g.id} className="card">
              <h3>
                {first ? <Link to={`/${g.id}/${first}`}>{g.title}</Link> : g.title}
              </h3>
              <ul>
                {g.items.map((it) => {
                  const slug = firstSlug([it])
                  const written = slug !== undefined && getNote(g.id, slug) !== undefined
                  return (
                    <li key={it.title}>
                      {slug && written ? (
                        <Link to={`/${g.id}/${slug}`}>{it.title}</Link>
                      ) : (
                        <span className="soon">{it.title}</span>
                      )}
                      {!written && <span className="badge">準備中</span>}
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
      </div>

      <p className="footnote">內容會持續更新與擴充，分類也會隨著學習慢慢增加。</p>
    </article>
  )
}
