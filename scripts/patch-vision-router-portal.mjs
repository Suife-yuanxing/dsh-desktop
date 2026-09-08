// dsh-vision-router 图片预览 portal 修复重放器(npm run fix:vision-router-portal)
// 背景:v0.5.2 批次实测,第三方插件 dsh-vision-router 的 presentation boundary
// 垫片(PresentedImage 查看原图浮层)以 position:fixed 内联样式就地渲染,被聊天流
// 祖先的 content-visibility:auto / contain:paint 困在单条消息盒子里 ⇒ 点击模型
// 图片后遮罩只盖一条消息、大图溢出(显示异常)。修复 = 浮层 ReactDOM.createPortal
// 到 document.body(与官方 ImageLightbox 同法)。
// 本脚本幂等:已打过(含 createPresentation(React, ReactDOM) 标记)则跳过;
// 插件市场/self-update 覆盖安装后重跑一次即可。不匹配(上游改版)时报错退出。
import { copyFileSync, readFileSync, writeFileSync, renameSync, existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const CANDIDATES = [
  join(homedir(), '.dsh', 'profiles', 'web', 'node_modules', 'dsh-vision-router', 'lib', 'client-presentation-boundary-main.js'),
  join(homedir(), '.dsh', 'profiles', 'node_modules', 'dsh-vision-router', 'lib', 'client-presentation-boundary-main.js'),
]
const file = CANDIDATES.find((p) => existsSync(p))
if (!file) {
  console.error('fix:vision-router-portal — 未找到 dsh-vision-router 安装(可能未安装该插件),跳过。')
  process.exit(0)
}

const ORIGINALS = {
  create: '  function createPresentation(React) {',
  factory: `            factory: function(require) {
              var React = require('react');
              var primitives;`,
  callsite: '              var presentation = createPresentation(React);',
  overlay: `      );
      return React.createElement(React.Fragment, null, thumb, overlay);`,
}
const PATCHED_MARKER = 'createPresentation(React, ReactDOM)'

let c = readFileSync(file, 'utf8')
if (c.includes(PATCHED_MARKER)) {
  console.log('fix:vision-router-portal — 已打补丁,跳过。')
  process.exit(0)
}
// [2026-09-08 修正] v2.1.0 结构: createPresentation 定义在 factory 之外,factory 作用域的
// ReactDOM 必须经调用点显式传入,否则参数恒 undefined、门控静默走 fallback(旧版 3 锚点
// 脚本对该版本是静默空操作)。故补 callsite 锚点,共 4 锚点。
if (!c.includes(ORIGINALS.create) || !c.includes(ORIGINALS.factory) || !c.includes(ORIGINALS.callsite) || !c.includes(ORIGINALS.overlay)) {
  console.error('fix:vision-router-portal — 锚点不匹配(插件已改版?),拒绝盲改;请人工核对 ' + file)
  process.exit(1)
}

const backup = file + '.bak-portal'
if (!existsSync(backup)) copyFileSync(file, backup)

c = c.replace(
  ORIGINALS.create,
  '  function createPresentation(React, ReactDOM) {',
)
c = c.replace(
  ORIGINALS.factory,
  `            factory: function(require) {
              var React = require('react');
              var ReactDOM;
              try { ReactDOM = require('react-dom'); } catch (_) { ReactDOM = undefined; }
              if (!ReactDOM || typeof ReactDOM.createPortal !== 'function') {
                try { ReactDOM = require('react-dom/client'); } catch (_) { ReactDOM = undefined; }
              }
              var primitives;`,
)
c = c.replace(
  ORIGINALS.callsite,
  '              var presentation = createPresentation(React, ReactDOM);',
)
c = c.replace(
  ORIGINALS.overlay,
  `      );
      // Chat flow ancestors carry content-visibility/contain(paint), which make
      // them the containing block for position:fixed descendants — an in-place
      // overlay gets trapped inside one message's box (backdrop covering a
      // single flow item while the image overflows it). Portal to document.body,
      // the same containment escape the stock ImageLightbox uses.
      var layer = ReactDOM && typeof ReactDOM.createPortal === 'function'
        ? ReactDOM.createPortal(overlay, document.body)
        : overlay;
      return React.createElement(React.Fragment, null, thumb, layer);`,
)

const tmp = file + '.tmp-portal'
writeFileSync(tmp, c)
renameSync(tmp, file)
console.log('fix:vision-router-portal — 已修复并写回(备份: .bak-portal)。重启 dsh 后生效。')
console.log('  ' + file)
