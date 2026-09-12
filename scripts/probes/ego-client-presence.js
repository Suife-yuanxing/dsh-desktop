(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(1500);
  const perf = performance.getEntriesByType('resource').map((e) => e.name);
  const pluginUrls = perf.filter((u) => u.includes('/plugins/'));
  const boot = window.__DSH_BOOT__ || {};
  const entries = boot.entries || [];
  const flat = JSON.stringify(entries);
  return {
    pluginUrlCount: pluginUrls.length,
    pluginUrlsSample: pluginUrls.slice(0, 4),
    egoInPluginUrls: pluginUrls.filter((u) => /ego/i.test(u)),
    bootHasEgo: /ego/i.test(flat),
    bootEntryCount: Array.isArray(entries) ? entries.length : null,
    cssTagsEgo: [...document.querySelectorAll('style[data-plugin-css]')].map((s) => s.dataset.pluginCss).filter((x) => /ego/i.test(x)),
    domEgo: [...document.querySelectorAll('[data-plugin]')].map((e) => e.dataset.plugin).filter((x) => /ego/i.test(x)),
    settingsNavTexts: [...document.querySelectorAll('nav button, [class*="_navItem"], [class*="_sectionItem"]')].map((b) => (b.innerText || '').trim()).filter(Boolean).slice(0, 40),
  };
})()
