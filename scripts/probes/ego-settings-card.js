(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // 找「设置」入口并打开
  const cands = [...document.querySelectorAll('button, [role="button"], a')];
  const gear = cands.find((b) => /设置|Settings/.test((b.getAttribute('aria-label') || '') + ' ' + (b.title || '') + ' ' + (b.innerText || '')));
  if (gear) gear.click();
  await sleep(2500);
  const navItems = [...document.querySelectorAll('[class*="_navItem"], nav button, [role="tab"], [class*="_section"] button')]
    .map((b) => (b.innerText || '').trim()).filter(Boolean);
  const bodyText = document.body.innerText || '';
  const egoCards = [...document.querySelectorAll('[data-plugin="ego-browser"], .dsh-ego-card, [class*="ego"]')]
    .map((e) => ({ tag: e.tagName, cls: String(e.className).slice(0, 60), id: e.id || null, text: (e.innerText || '').trim().slice(0, 80) }));
  return {
    gearClicked: !!gear,
    navItems: [...new Set(navItems)].slice(0, 30),
    bodyMentionsEgo: /ego|浏览器/i.test(bodyText),
    egoMentionsInBody: (bodyText.match(/.{0,20}(ego|Agent 浏览器|Agent Browser).{0,30}/gi) || []).slice(0, 8),
    egoCards,
    hasSettingsRootVisible: !!document.querySelector('[class*="_settings"], [data-slot*="settings"]'),
  };
})()
