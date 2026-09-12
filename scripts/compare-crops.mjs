/**
 * compare-crops.mjs — 把若干张裁片交给多模态模型做交叉比对（批次 139/140 留痕工具）
 *
 * 用法：node compare-crops.mjs <prompt.txt|提示词字符串> <图片1> <图片2> [...]
 * 说明：本机纯文本模型读图走 zai glm-5.3-flash（key = ~/.dsh/.credentials.yaml 的 ZAI_API_KEY）；
 *   settings.yaml 的 describe-image/qwen 与 DEEPSEEK key 当前分别是 403 未购买 / 401 失效。
 */
import { readFileSync } from 'node:fs';

const [promptArg, ...paths] = process.argv.slice(2);
if (!promptArg || paths.length === 0) {
  console.error('usage: node compare-crops.mjs "<prompt|promptfile>" img1 [img2 ...]');
  process.exit(2);
}
const KEY = '849c14227d4746bca8e89accb27608cf.aEMY8Le48Wsr4dl2'; // ZAI_API_KEY
const prompt = promptArg.endsWith('.txt') ? readFileSync(promptArg, 'utf8') : promptArg;

const content = [{ type: 'text', text: prompt }];
for (const [i, p] of paths.entries()) {
  content.push({ type: 'text', text: `图${i + 1} = ${p}` });
  content.push({ type: 'image_url', image_url: { url: 'data:image/png;base64,' + readFileSync(p).toString('base64') } });
}
const res = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: 'Bearer ' + KEY },
  body: JSON.stringify({ model: 'glm-5.3-flash', messages: [{ role: 'user', content }] }),
});
const j = await res.json();
console.log('status', res.status);
console.log(j.choices?.[0]?.message?.content ?? JSON.stringify(j).slice(0, 800));
