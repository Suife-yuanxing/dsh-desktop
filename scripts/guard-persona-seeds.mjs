/**
 * guard-persona-seeds.mjs — 人设补丁全桶巡检哨兵（只读，零运行时改动）
 * 背景: 批次 181（问题54 第四形态）：0.1.5-rc.2 官方 npx 种子改用 npm 平铺布局（无 .pnpm），
 *       [Y]/[J2] 扫描根的 pnpmRoot 存在性检查把整个哈希桶变成盲区 → 人设静默失效
 *       （2026-09-15 11:18 ~ 2026-09-16 20:19 故障窗口，详见项目手册批次 181）。
 * 用途: 每次壳更新 / dsh 版本切换 / 新种子落盘后手动跑一次，早于用户感知发现盲区。
 *       FAIL 时执行 `node ~/.dsh/patches.cjs` 全量重放即可自愈（[Y2]/[J3]/[Y3] 已覆盖三层）。
 * 用法: node guard-persona-seeds.mjs [--json]
 * 判定:
 *   - npx 活跃桶（含 @deepseek-ai/dsh/lib/bin.js）与 host profiles 层参与 FAIL 判定;
 *   - dsh-*-pnpm-seed 人工缓存桶标记 [cache]，缺失降级 WARN（壳不消费它们）;
 *   - system-prompt 补丁态判据: 源码含 fallback 锚点 `personaPrefix || config.persona`（批次143 [Y]）
 *     或别名 schema 声明（z.object 内 persona 键）; 裸包形态 `config.personaPrefix ?? ""` 且无 fallback = 裸包;
 *   - 预设 shadow 判据: dsh-agent-presets 各预设 agent.cordis.yml 残留 `- id: persona` 行 = 回潮（[J3] 缺口）。
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const asJson = process.argv.includes('--json');

/** 三层取数: 返回该桶内找到的全部 dsh-system-prompt/lib/index.js 路径 */
function findSystemPromptCopies(bucket) {
  const out = [];
  const top = join(bucket, 'node_modules', '@deepseek-ai', 'dsh-system-prompt', 'lib', 'index.js');
  if (existsSync(top)) out.push(top);
  const hoist = join(bucket, 'node_modules', '.pnpm', 'node_modules', '@deepseek-ai', 'dsh-system-prompt', 'lib', 'index.js');
  if (existsSync(hoist)) out.push(hoist);
  const pnpmDir = join(bucket, 'node_modules', '.pnpm');
  if (existsSync(pnpmDir)) {
    for (const ent of readdirSync(pnpmDir)) {
      if (!ent.startsWith('@deepseek-ai+dsh-system-prompt@')) continue;
      const p = join(pnpmDir, ent, 'node_modules', '@deepseek-ai', 'dsh-system-prompt', 'lib', 'index.js');
      if (existsSync(p)) out.push(p);
    }
  }
  return out;
}

/** 三层取数: dsh-agent-presets 各预设的 agent.cordis.yml */
function findPresetYamls(bucket) {
  const out = [];
  const roots = [
    join(bucket, 'node_modules', '@deepseek-ai', 'dsh-agent-presets', 'presets'),
    join(bucket, 'node_modules', '.pnpm', 'node_modules', '@deepseek-ai', 'dsh-agent-presets', 'presets'),
  ];
  const pnpmDir = join(bucket, 'node_modules', '.pnpm');
  if (existsSync(pnpmDir)) {
    for (const ent of readdirSync(pnpmDir)) {
      if (!ent.startsWith('@deepseek-ai+dsh-agent-presets@')) continue;
      roots.push(join(pnpmDir, ent, 'node_modules', '@deepseek-ai', 'dsh-agent-presets', 'presets'));
    }
  }
  for (const r of roots) {
    if (!existsSync(r)) continue;
    for (const name of readdirSync(r)) {
      const y = join(r, name, 'agent.cordis.yml');
      if (existsSync(y)) out.push(y);
    }
  }
  return out;
}

const FALLBACK_RE = /personaPrefix\s*\|\|\s*config\.persona|config\.persona\s*\|\|\s*config\.personaPrefix/;
const ALIAS_SCHEMA_RE = /persona:\s*z\.string\(\)/;
const BARE_RE = /personaPrefix\s*\?\?\s*""/;
const PATCH_MARK_RE = /PATCH_MARK|\[Y2?\s/;

function classifySystemPrompt(file) {
  let src = '';
  try { src = readFileSync(file, 'utf8'); } catch { return 'unreadable'; }
  if (FALLBACK_RE.test(src) || ALIAS_SCHEMA_RE.test(src) || PATCH_MARK_RE.test(src)) return 'patched';
  if (BARE_RE.test(src)) return 'bare';
  return 'unknown';
}

function presetShadowRows(file) {
  let src = '';
  try { src = readFileSync(file, 'utf8'); } catch { return -1; }
  return (src.match(/^\s*-\s*id:\s*persona\s*$/gm) || []).length;
}

const probeIdx = process.argv.indexOf('--probe');
if (probeIdx !== -1) {
  // 负例/单文件自测: 打印该文件的分类后退出（如 monorepo 裸包样本）
  for (const f of process.argv.slice(probeIdx + 1)) {
    console.log(`${classifySystemPrompt(f).padEnd(10)} ${f}`);
  }
  process.exit(0);
}

const buckets = [];
const npxRoot = join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'npm-cache', '_npx');
if (existsSync(npxRoot)) {
  for (const ent of readdirSync(npxRoot)) {
    const bucket = join(npxRoot, ent);
    const bin = join(bucket, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
    if (!existsSync(bin)) continue;
    let ver = '?';
    try { ver = JSON.parse(readFileSync(join(bucket, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'), 'utf8')).version ?? '?'; } catch {}
    buckets.push({ name: ent, kind: 'npx-active', version: ver, dir: bucket });
  }
  const seen = new Set(buckets.map(b => b.name));
  for (const ent of readdirSync(npxRoot)) {
    if (!ent.includes('pnpm-seed') || seen.has(ent)) continue;
    const bucket = join(npxRoot, ent);
    const hasDsh = findSystemPromptCopies(bucket).length > 0;
    if (!hasDsh) continue;
    let ver = '?';
    const pnpmRoot = join(bucket, 'node_modules', '.pnpm');
    if (existsSync(pnpmRoot)) {
      for (const ent2 of readdirSync(pnpmRoot)) {
        if (!ent2.startsWith('@deepseek-ai+dsh@')) continue;
        try { ver = JSON.parse(readFileSync(join(pnpmRoot, ent2, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'), 'utf8')).version ?? '?'; } catch {}
        break;
      }
    }
    buckets.push({ name: ent, kind: 'pnpm-seed-cache', version: ver, dir: bucket });
  }
}

const home = homedir();
const hostDir = join(home, '.dsh', 'profiles', 'node_modules', '@deepseek-ai', 'dsh-system-prompt');
const hostIndex = join(hostDir, 'lib', 'index.js');

if (asJson) {
  const report = { buckets: [], host: null };
  for (const b of buckets) {
    const sps = findSystemPromptCopies(b.dir).map(f => ({ file: f, state: classifySystemPrompt(f) }));
    const presets = findPresetYamls(b.dir).map(f => ({ file: f, personaShadowRows: presetShadowRows(f) }));
    report.buckets.push({ name: b.name, kind: b.kind, version: b.version, systemPrompt: sps, presets });
  }
  if (existsSync(hostIndex)) {
    report.host = { file: hostIndex, state: classifySystemPrompt(hostIndex) };
  }
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

let fail = 0, warn = 0;
console.log('=== 人设补丁全桶巡检（npx 缓存 + host 层） ===');
for (const b of buckets) {
  const tag = b.kind === 'npx-active' ? '[active]' : '[cache] ';
  const sps = findSystemPromptCopies(b.dir);
  const presets = findPresetYamls(b.dir);
  const spStates = sps.map(classifySystemPrompt);
  const bareCount = spStates.filter(s => s === 'bare' || s === 'unknown' || s === 'unreadable').length;
  const shadowRows = presets.reduce((a, f) => a + Math.max(0, presetShadowRows(f)), 0);
  const spOk = sps.length > 0 && bareCount === 0;
  const prOk = shadowRows === 0;
  const verdict = b.kind === 'pnpm-seed-cache'
    ? (spOk && prOk ? 'OK' : 'WARN')
    : (spOk && prOk ? 'OK' : 'FAIL');
  if (verdict === 'FAIL') fail++;
  if (verdict === 'WARN') warn++;
  console.log(`${tag} ${b.name}  dsh@${b.version}`);
  for (const f of sps) console.log(`    system-prompt: ${classifySystemPrompt(f).padEnd(10)} ${f.replace(b.dir, '<bucket>')}`);
  if (sps.length === 0) console.log('    system-prompt: NOT-FOUND');
  if (presets.length > 0) console.log(`    presets: ${presets.length} 个, shadow 行合计 ${shadowRows}`);
  if (verdict !== 'OK') {
    const why = [];
    if (!spOk) why.push('system-prompt 裸包/不可读（[Y2] 缺口）');
    if (!prOk) why.push('预设 persona shadow 回潮（[J3] 缺口）');
    console.log(`    ⇒ ${verdict}: ${why.join('; ')}`);
    if (verdict === 'FAIL') console.log('      自愈: node "%USERPROFILE%\\.dsh\\patches.cjs" 全量重放后复跑本哨兵');
  }
}

if (existsSync(hostIndex)) {
  const st = classifySystemPrompt(hostIndex);
  const ok = st === 'patched';
  if (!ok) fail++;
  console.log(`[host  ] ${hostIndex}`);
  console.log(`    system-prompt: ${st}`);
  if (!ok) console.log('    ⇒ FAIL: host 层副本为裸包/不可读（[Y3] 缺口）');
} else {
  console.log('[host  ] profiles 层无 dsh-system-prompt 副本（junction 未建, 跳过）');
}

console.log('');
console.log(fail === 0
  ? `PERSONA-SEEDS GUARD: ALL GREEN（FAIL=0, WARN=${warn}）`
  : `PERSONA-SEEDS GUARD: ${fail} FAIL / ${warn} WARN — 先跑 patches.cjs 重放, 再复跑本哨兵`);
process.exit(fail === 0 ? 0 : 1);
