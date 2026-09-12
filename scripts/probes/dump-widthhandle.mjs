import { readFileSync } from 'node:fs';
const f = 'C:/Users/se\'jng\'k\'s/AppData/Local/npm-cache/_npx/dsh-0.1.5-rc.1-pnpm-seed/node_modules/.pnpm/@deepseek-ai+dsh-client-ui-_f23812b652dc54e235e4d27724a455b1/node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js';
const s = readFileSync(f, 'utf8');
const lines = s.split(/\r?\n/);
// 1) 渲染侧:widthHandle 元素
console.log('=== render around widthHandle ===');
lines.forEach((l, i) => {
  if (l.includes('widthHandle')) {
    const from = Math.max(0, i - 12), to = Math.min(lines.length, i + 8);
    console.log(`--- lines ${from + 1}..${to} ---`);
    for (let k = from; k < to; k++) console.log(k + 1, lines[k].slice(0, 300));
  }
});
// 2) CSS:所有含 widthHandle 的规则
console.log('\n=== css rules mentioning widthHandle ===');
for (const m of s.matchAll(/[^{}]*widthHandle[^{}]*\{[^}]*\}/g)) console.log(m[0]);
// 3) 谁在设置 --dsh-conversation-column-width / 拖拽逻辑
console.log('\n=== drag logic (pointerdown / columnWidth) ===');
lines.forEach((l, i) => {
  if (/columnWidth|conversation-column-width|WIDTH_MIN|WIDTH_MAX/.test(l)) console.log(i + 1, l.trim().slice(0, 240));
});
