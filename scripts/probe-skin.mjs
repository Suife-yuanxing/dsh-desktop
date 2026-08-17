// 诊断皮肤: 1) 壁纸媒体元素与播放/静音状态 2) 白边候选(不透明层)
(() => {
  const out = []
  out.push('visibility = ' + document.visibilityState + ' (hidden 时 Chromium 暂停后台媒体)')
  // 1) 媒体元素
  const medias = [...document.querySelectorAll('video, audio')]
  out.push('media elements: ' + medias.length)
  for (const m of medias.slice(0, 6)) {
    const r = m.getBoundingClientRect()
    out.push(
      '  <' + m.tagName.toLowerCase() + '> src=' + String(m.currentSrc || m.src || '(none)').slice(0, 90) +
      ' muted=' + m.muted + ' volume=' + m.volume +
      ' paused=' + m.paused + ' readyState=' + m.readyState +
      ' autoplay=' + m.autoplay + ' loop=' + m.loop +
      ' rect=' + Math.round(r.width) + 'x' + Math.round(r.height) +
      ' class=' + String(m.className).slice(0, 50)
    )
  }
  // 2) 全屏铺底元素(壁纸层)
  const bgCandidates = []
  for (const el of document.querySelectorAll('body *')) {
    const s = getComputedStyle(el)
    if (s.position === 'fixed' && el.getBoundingClientRect().width >= innerWidth * 0.95 && el.getBoundingClientRect().height >= innerHeight * 0.95) {
      bgCandidates.push(el.tagName.toLowerCase() + '.' + String(el.className).slice(0, 40) + ' z=' + s.zIndex + ' bg=' + s.background.slice(0, 60))
    }
    if (bgCandidates.length >= 5) break
  }
  out.push('fullscreen fixed layers: ' + (bgCandidates.length ? '\n  ' + bgCandidates.join('\n  ') : '(none)'))
  // 3) 壁纸标识(dshvt/skin 相关)
  const html = document.documentElement.outerHTML.slice(0, 400000)
  out.push('skin markers: ' + ['dshvt', 'skin-layer', 'wallpaper', 'dsh-desktop-skin'].filter((k) => html.includes(k)).join(', '))
  return out.join('\n')
})()
