// 验证 better-sidebar 补丁在 shell 页面内生效:
//  1) :root 动效/gap 变量已定义
//  2) .panel 规则 = 浮动卡片(top:85px) + 动效曲线
//  3) toggleCluster top:88px
//  4) #root margin-right 带 gap*2
(() => {
  const out = []
  const cs = getComputedStyle(document.documentElement)
  out.push('var duration = ' + cs.getPropertyValue('--dsh-bsr-slide-duration').trim())
  out.push('var ease = ' + cs.getPropertyValue('--dsh-bsr-slide-ease').trim())
  out.push('var gap = ' + cs.getPropertyValue('--dsh-bsr-gap').trim())
  let panel = null, cluster = null, bottom = null
  for (const ss of document.styleSheets) {
    let rules; try { rules = ss.cssRules } catch { continue }
    if (!rules) continue
    for (const r of rules) {
      if (!(r instanceof CSSStyleRule)) continue
      if (/_panel$/.test(r.selectorText) && /position:\s*fixed|top/.test(r.cssText) && r.style.top === '85px') panel = r.cssText.slice(0, 260)
      if (/_toggleCluster$/.test(r.selectorText)) cluster = r.cssText.slice(0, 160)
      if (/_bottomPanel$/.test(r.selectorText)) bottom = r.cssText.slice(0, 200)
    }
  }
  out.push('panelRule = ' + (panel ? panel : 'NOT FOUND'))
  out.push('clusterRule = ' + (cluster ? cluster : 'NOT FOUND'))
  out.push('bottomRule = ' + (bottom ? bottom : '(absent — css only in full bundles OK)'))
  const root = document.getElementById('root')
  out.push('rootMarginRight = ' + (root ? getComputedStyle(root).marginRight : 'no #root'))
  out.push('bottomPanelEl = ' + (document.querySelector('[class*="_bottomPanel"]:not([class*="_bottomPanelHidden"])') ? 'PRESENT (BAD)' : 'absent (good)'))
  return out.join('\n')
})()
