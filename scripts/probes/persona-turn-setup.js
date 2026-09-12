(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(1500);
  const ed = document.querySelector('[contenteditable="true"],[data-composer-card] [contenteditable]');
  return {
    url: location.href,
    hasComposer: !!document.querySelector('[data-composer-card]'),
    hasEditable: !!ed,
    editableTag: ed ? ed.tagName + '.' + String(ed.className).slice(0, 40) : null,
    sessionTitle: (document.querySelector('[class*="_crumbCurrent"]') || {}).textContent || null,
    personaInDom: /猫娘/.test(document.body.innerText || ''),
  };
})()
