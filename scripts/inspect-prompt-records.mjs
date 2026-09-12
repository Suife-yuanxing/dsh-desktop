/**
 * inspect-prompt-records.mjs — 在会话日志里定位「系统提示词记录」并检查人设前缀
 * 用法: node inspect-prompt-records.mjs <file.zstd>
 */
import { readFileSync } from 'node:fs';
import zlib from 'node:zlib';

const file = process.argv[2];
const buf = readFileSync(file);
const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
const parts = [];
for (let i = 0; i + 4 <= buf.length; i++) {
  if (buf[i] !== MAGIC[0]) continue;
  try { const d = zlib.zstdDecompressSync(buf.subarray(i)); if (d.length) parts.push(d) } catch { }
}
const text = parts.map((b) => b.toString('utf8')).join('\n');
console.log('frames:', parts.length, 'chars:', text.length);

const IDENT = 'You are an AI agent powered by DeepSeek Harness.';
const idxs = [];
let from = 0;
for (;;) { const i = text.indexOf(IDENT, from); if (i < 0) break; idxs.push(i); from = i + 1 }
console.log('identity sentence occurrences:', idxs.length);
idxs.slice(0, 6).forEach((i, n) => {
  const before = text.slice(Math.max(0, i - 260), i);
  console.log(`--- #${n + 1} @${i} 前 260 字 ---`);
  console.log(JSON.stringify(before));
  console.log(`    含猫娘: ${before.includes('猫娘')} | 含 legacy persona 文案: ${before.includes('你是一只温柔可爱的猫娘')}`);
});

// 记录类型分布:看日志里有没有「请求/提示词」类的记录
const types = {};
for (const line of text.split('\n')) {
  const m = line.match(/^\{"type":"([^"]+)"/);
  if (m) types[m[1]] = (types[m[1]] || 0) + 1;
}
console.log('record types:', JSON.stringify(types));
const personaHits = [...text.matchAll(/你是一只温柔可爱的猫娘/g)].length;
console.log('「你是一只温柔可爱的猫娘」全文命中:', personaHits);
