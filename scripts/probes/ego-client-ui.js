(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rows = [...document.querySelectorAll('[class*="_sessionRow"]')];
  const t = rows.find((r) => !r.innerText.includes('新会话')) || rows[1];
  if (t) t.click();
  await sleep(2500);
  const el = document.querySelector('[data-plugin="ego-browser"]');
  const box = el ? el.getBoundingClientRect() : null;
  // 侧栏 tab / 浮岛面板线索
  const tabs = [...document.querySelectorAll('[role="tab"], [class*="_tab"]')].map((b) => (b.innerText || '').trim()).filter(Boolean);
  const sidebarTexts = [...document.querySelectorAll('aside button, [class*="_panel"] button')].map((b) => (b.innerText || '').trim()).filter(Boolean).slice(0, 30);
  return {
    egoEl: el ? {
      tag: el.tagName, cls: String(el.className).slice(0, 80), id: el.id || null,
      title: el.getAttribute('title'), aria: el.getAttribute('aria-label'),
      rect: box ? { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width), h: Math.round(box.height) } : null,
      visible: box ? (box.width > 0 && box.height > 0) : false,
      text: (el.innerText || '').slice(0, 120),
      childCount: el.children.length,
      html: el.outerHTML.slice(0, 300),
    } : null,
    tabsWithBrowser: tabs.filter((x) => /浏览器|Browser|ego/i.test(x)),
    sidebarTextsWithBrowser: sidebarTexts.filter((x) => /浏览器|Browser|ego|watch/i.test(x)),
    allTabCount: tabs.length,
  };
})()
