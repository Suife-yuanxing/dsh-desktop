import { readFileSync } from 'node:fs';
const s = readFileSync('D:/deepseek harness/dsh-desktop/dsh-plugin/lib/client.js', 'utf8');
const rules = [
  '[class*="_headerUtilities"]{display:none!important}',
  '[data-conversation-header-corner],[class*="_headerCorner"]{display:none!important}',
  '[data-width-handle="right"]{display:none!important}',
];
for (const r of rules) console.log(String(s.split(r).length - 1).padStart(2), 'x', r);
