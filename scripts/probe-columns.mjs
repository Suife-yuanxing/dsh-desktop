// 探测页面列布局:找出与 better-sidebar panel 重叠的另一个侧边栏
(() => {
  const out = []
  const rect = (el) => {
    const r = el.getBoundingClientRect()
    return `x:${Math.round(r.x)} y:${Math.round(r.y)} w:${Math.round(r.width)} h:${Math.round(r.height)}`
  }
  // 1) AppFrame 网格列
  const root = document.getElementById('root')
  const frame = root && root.querySelector(':scope > [data-slot="root"]')
  if (frame) {
    for (const child of frame.children) {
      out.push('frame child: <' + child.tagName.toLowerCase() + ' data-slot=' + (child.dataset.slot || '-') + ' class=' + (child.className && child.className.baseVal !== undefined ? child.className.baseVal : String(child.className)).slice(0, 40) + '> ' + rect(child))
      for (const gc of child.children) {
        out.push('   col: <' + gc.tagName.toLowerCase() + ' data-slot=' + (gc.dataset.slot || '-') + ' class=' + String(gc.className).slice(0, 50) + '> ' + rect(gc))
      }
    }
  } else out.push('frame not found')
  // 2) better-sidebar panel + 原生右列候选
  const panel = document.querySelector('[class*="_panel"]:not([class*="_panelHidden"]):not([class*="_panelResize"])')
  out.push('bsr panel: ' + (panel ? rect(panel) : 'absent'))
  const slots = document.querySelectorAll('[data-slot]')
  const seen = new Set()
  for (const s of slots) {
    const key = s.dataset.slot
    if (seen.has(key)) continue
    seen.add(key)
    if (/detail|right|side|panel|tree|history|session/i.test(key)) out.push('slot [' + key + ']: ' + s.tagName.toLowerCase() + ' ' + rect(s) + ' visible=' + (s.offsetParent !== null))
  }
  // 3) 视口宽
  out.push('viewport: ' + innerWidth + 'x' + innerHeight)
  return out.join('\n')
})()
