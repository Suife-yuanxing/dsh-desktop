/**
 * zstd-journal.mjs — 用 Node 的 zstd 流式解码器读会话日志(多帧),按需 grep
 * 用法: node zstd-journal.mjs <file.zstd> [grepPattern]
 */
import { readFileSync } from 'node:fs';
import zlib from 'node:zlib';
import { Readable } from 'node:stream';

const [file, pattern] = process.argv.slice(2);
console.log('has createZstdDecompress:', typeof zlib.createZstdDecompress === 'function');
const buf = readFileSync(file);
let text = '';
if (typeof zlib.createZstdDecompress === 'function') {
  const chunks = [];
  await new Promise((res, rej) => {
    Readable.from([buf]).pipe(zlib.createZstdDecompress())
      .on('data', (c) => chunks.push(c))
      .on('end', res).on('error', rej);
  });
  text = Buffer.concat(chunks).toString('utf8');
} else {
  text = zlib.zstdDecompressSync(buf).toString('utf8');
}
// 多帧补全:文件由「记录级 zstd 帧」串接而成,单次解码只出第一帧(实测 200 字符)。
// 启发式:扫全部魔法字 28 B5 2F FD,逐偏移尝试解码,成功的拼接(帧内出现同字节序列者解不出,自然跳过)。
if (text.length < buf.length / 8) {
  const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
  const parts = [];
  let ok = 0, fail = 0;
  for (let i = 0; i + 4 <= buf.length; i++) {
    if (buf[i] !== MAGIC[0] || buf[i + 1] !== MAGIC[1] || buf[i + 2] !== MAGIC[2] || buf[i + 3] !== MAGIC[3]) continue;
    try {
      const d = zlib.zstdDecompressSync(buf.subarray(i));
      if (d.length) { parts.push(d); ok++; }
    } catch { fail++; }
  }
  console.log('multi-frame walk: frames ok =', ok, '| failed candidates =', fail);
  const joined = Buffer.concat(parts).toString('utf8');
  if (joined.length > text.length) text = text + '\n' + joined;
}
console.log('decoded chars:', text.length, '| lines:', text.split('\n').length);
if (pattern) {
  const re = new RegExp(pattern, 'g');
  const hits = [...text.matchAll(re)];
  console.log('pattern', JSON.stringify(pattern), 'hits:', hits.length);
  for (const h of hits.slice(0, 5)) console.log('  …' + text.slice(Math.max(0, h.index - 80), h.index + 120).replace(/\n/g, '\\n'));
}
for (const needle of ['猫娘', 'You are an AI agent powered by DeepSeek Harness', 'deployment:persona-prefix', 'personaPrefix']) {
  console.log('  contains', JSON.stringify(needle), ':', text.includes(needle));
}
