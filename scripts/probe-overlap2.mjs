// 诊断顶部 UI 重叠 + 整体列布局(找出重叠元素)
(() => {
  const out = []
  const rect = (el) => { const r = el.getBoundingClientRect(); return 'x:' + Math.round(r.x) + ' y:' + Math.round(r.y) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) }
  // 1) frame 列结构
  const root = document.getElementById('root')
  const frame = root && root.querySelector(':scope > [data-slot="root"] > div')
  if (frame) {
    for (const gc of frame.children) {
      const cn = String(gc.className).slice(0, 44)
      if (gc.getBoundingClientRect().width > 0) out.push('col: ' + cn + ' ' + rect(gc))
    }
  }
  // 2) 顶部固定/绝对元素(y < 100, 宽>200): 顶部重叠候选
  out.push('--- top fixed/absolute els ---')
  for (const el of document.querySelectorAll('body *')) {
    const s = getComputedStyle(el)
    if ((s.position === 'fixed' || s.position === 'absolute') && el.getBoundingClientRect().width > 200 && el.getBoundingClientRect().top < 100 && el.getBoundingClientRect().height > 20) {
      out.push('  <' + el.tagName.toLowerCase() + '> cls=' + String(el.className).slice(0, 50) + ' pos=' + s.position + ' z=' + s.zIndex + ' ' + rect(el) + ' text=' + (el.textContent || '').trim().slice(0, 40).replace(/\s+/g, ' '))
      if (out.length > 30) break
    }
  }
  // 3) mnemon 痕迹
  const html = document.documentElement.outerHTML
  const mk = ['mnemon'].filter((k) => html.toLowerCase().includes(k))
  out.push('mnemon DOM: ' + (mk.length ? 'FOUND' : 'absent'))
  // 4) aionui 是否复活
  out.push('aionui: ' + (document.querySelectorAll('[class*="aionui-"]').length + ' els'))
  return out.join('\n')
})()
