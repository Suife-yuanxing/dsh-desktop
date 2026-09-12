/**
 * check-ego-browser-load.mjs — dsh-ego-browser 宿主半边「可载性」静态冒烟
 *
 * 为什么需要它：cordis:include 是**全有或全无**——单个 loader entry 导入即抛会让
 * 整棵插件树 failed to load，dsh 进程退出（q198 崩溃循环）。所以在动 home patch 的
 * 禁用行之前，先在 node 里把模块 import 一遍，确认 import 期不抛（导入解析/导出缺失）。
 *
 * 用法：node check-ego-browser-load.mjs
 * 判据：exit 0 + 打印 export 面；任何 throw 都会打印完整栈并 exit 1。
 */
const INDEX = 'file:///C:/Users/se%27jng%27k%27s/.dsh/profiles/web/node_modules/dsh-ego-browser/lib/index.js';

const t0 = Date.now();
try {
  const mod = await import(INDEX);
  const keys = Object.keys(mod).sort();
  console.log('import OK in', Date.now() - t0, 'ms');
  console.log('exports:', keys.join(', ') || '(none)');
  console.log('has apply:', typeof mod.apply === 'function');
  console.log('has inject:', mod.inject !== undefined ? JSON.stringify(mod.inject) : '(none)');
} catch (e) {
  console.error('import FAILED:', e?.message);
  console.error(e?.stack?.split('\n').slice(0, 12).join('\n'));
  process.exit(1);
}

// 顺带核对宿主依赖的关键导出是否还在 0.1.5 部署面里
try {
  const tools = await import('file:///C:/Users/se%27jng%27k%27s/.dsh/profiles/web/node_modules/@deepseek-ai/dsh-tools/lib/index.js').catch(() => null);
  if (tools) console.log('dsh-tools exports include defineTool:', 'defineTool' in tools);
  else console.log('dsh-tools: 未能直接 import（由 dsh-tools 的 exports 映射决定，非致命）');
} catch (e) {
  console.log('dsh-tools probe skipped:', e.message);
}
