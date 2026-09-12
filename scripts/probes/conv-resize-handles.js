(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // 切到有内容的会话(blank 会话 headerHidden,且内容区可能根本没渲染)
  const rows = [...document.querySelectorAll('[class*="_sessionRow"]')];
  const target = rows.find((r) => !r.innerText.includes('新会话')) || rows[1];
  if (target) target.click();
  await sleep(3500);

  const rect = (el) => {
    if (!el) return null;
    const b = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height),
      cursor: cs.cursor, display: cs.display, opacity: cs.opacity, visibility: cs.visibility,
      bg: cs.backgroundColor, z: cs.zIndex, pos: cs.position, pe: cs.pointerEvents,
    };
  };
  const desc = (el) => ({
    tag: el.tagName,
    cls: String(el.className || '').slice(0, 90),
    id: el.id || null,
    title: el.getAttribute('title'),
    aria: el.getAttribute('aria-label'),
    data: [...el.attributes].filter((a) => a.name.startsWith('data-')).map((a) => a.name + '=' + a.value).slice(0, 6).join(' '),
    rect: rect(el),
  });

  // 1) 所有 col-resize / row-resize 命中元素(拖拽柄家族)
  const resizeCursors = new Set(['col-resize', 'row-resize', 'ew-resize', 'ns-resize', 'nwse-resize', 'nesw-resize', 'e-resize', 'w-resize']);
  const handles = [...document.querySelectorAll('body *')].filter((el) => resizeCursors.has(getComputedStyle(el).cursor));
  // 2) 类名/ID 含 handle|resize|gutter|split 的元素
  const named = [...document.querySelectorAll('body *')].filter((el) => /handle|resize|gutter|splitter|drag/i.test(String(el.className || '') + ' ' + el.id));

  // 3) 参照物:三栏容器与中列
  const refs = {};
  for (const sel of ['[data-dsh-frame]', '[data-pane="conversation"]', '[data-dsh-center-col]', '[data-slot="conversation"]', '[data-dsh-panel-host]', 'aside', 'main']) {
    const el = document.querySelector(sel);
    refs[sel] = el ? rect(el) : null;
  }

  return {
    viewport: { w: innerWidth, h: innerHeight },
    refs,
    handleCount: handles.length,
    handles: handles.slice(0, 20).map(desc),
    namedCount: named.length,
    named: named.slice(0, 25).map(desc),
  };
})()
