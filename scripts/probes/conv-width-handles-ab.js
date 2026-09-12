(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rows = [...document.querySelectorAll('[class*="_sessionRow"]')];
  const t = rows.find((r) => !r.innerText.includes('新会话')) || rows[1];
  if (t) t.click();
  await sleep(2500);

  const mk = (id, css) => {
    const old = document.getElementById(id); if (old) old.remove();
    const st = document.createElement('style'); st.id = id; st.textContent = css; document.head.appendChild(st);
  };
  // 1) 让两条柄的"黑条"(::after)常显,等价于鼠标悬停态 —— 便于截图取证
  mk('probe-handle-visible', '[class*="_widthHandle"]:after{opacity:1!important}');
  // 2) 批次140 候选规则:只摘右侧柄(可用 --apply-right-hide=1 打开)
  const HIDE_RIGHT = (location.hash || '').includes('hideRight');
  if (HIDE_RIGHT) mk('probe-hide-right', '[data-width-handle="right"]{display:none!important}');
  await sleep(400);

  const L = document.querySelector('[data-width-handle="left"]');
  const R = document.querySelector('[data-width-handle="right"]');
  const rect = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
  const after = (el) => {
    if (!el) return null;
    const a = getComputedStyle(el, '::after');
    return { opacity: a.opacity, width: a.width, bg: a.backgroundColor, bgImage: a.backgroundImage.slice(0, 90) };
  };
  const hit = (x, y) => {
    const el = document.elementFromPoint(x, y);
    return el ? { tag: el.tagName, cls: String(el.className || '').slice(0, 60), side: el.getAttribute('data-width-handle') } : null;
  };
  const lr = rect(L), rr = rect(R);
  return {
    mode: HIDE_RIGHT ? 'after(右柄已摘)' : 'before(现状)',
    left: { rect: lr, display: L && getComputedStyle(L).display, cursor: L && getComputedStyle(L).cursor, pe: L && getComputedStyle(L).pointerEvents, after: after(L) },
    right: { rect: rr, display: R && getComputedStyle(R).display, cursor: R && getComputedStyle(R).cursor, pe: R && getComputedStyle(R).pointerEvents, after: after(R) },
    hitAtLeftStrip: lr ? hit(Math.round(lr.x + lr.w / 2), 400) : null,
    hitAtRightStrip: rr ? hit(Math.round(rr.x + rr.w / 2), 400) : null,
    barX: { leftBarApprox: lr ? Math.round(lr.x + lr.w - 16) : null, rightBarApprox: rr ? Math.round(rr.x + 16) : null },
  };
})()
