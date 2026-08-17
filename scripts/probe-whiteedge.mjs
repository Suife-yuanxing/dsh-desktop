// 验证白边修复:皮肤透明 CSS 是否注入 + 各层背景/边框计算值
(() => {
  const out = []
  // 1) BG_STYLE_ID 是什么(dshvt 源码常量,查 style 标签)
  const styles = [...document.querySelectorAll('style')].filter((s) => (s.id || '').includes('skin') || (s.textContent || '').includes('background:transparent!important'))
  out.push('skin style tags: ' + (styles.length ? styles.map((s) => '#' + s.id + '(' + s.textContent.length + 'B)').join(', ') : 'NONE'))
  // 2) 逐层验证: #root → data-slot=root → frame → sidebarCol/conversationCol → slot 容器
  const chain = []
  const root = document.getElementById('root')
  let el = root
  for (let i = 0; i < 4 && el; i++) {
    const s = getComputedStyle(el)
    chain.push(i + ':' + (el.dataset ? el.dataset.slot || el.tagName.toLowerCase() : el.tagName.toLowerCase()) + ' bg=' + s.backgroundColor + ' border=' + s.borderTopColor)
    el = el.firstElementChild
  }
  out.push('root chain:\n  ' + chain.join('\n  '))
  // 3) slot 容器(sidebar/conversation)及其直接子元素
  for (const slot of ['sidebar', 'conversation']) {
    const sl = document.querySelector('div[data-slot="' + slot + '"]')
    if (!sl) { out.push('[' + slot + ']: not found'); continue }
    const s = getComputedStyle(sl)
    out.push('[' + slot + '] bg=' + s.backgroundColor + ' border=' + s.borderRightColor)
    for (const ch of sl.children) {
      const cs = getComputedStyle(ch)
      out.push('  > ' + String(ch.className).slice(0, 30) + ' bg=' + cs.backgroundColor + ' border=' + cs.borderRightColor)
    }
  }
  return out.join('\n')
})()
