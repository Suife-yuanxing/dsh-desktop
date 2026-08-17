// dshvt 声音补丁:视频壁纸取消硬编码静音,音量跟随 state.volume(设置页同一滑块)
// 幂等: 已打补丁则跳过。备份 .bak-sound
import fs from 'node:fs'

const f = 'D:/dshvt/lib/client.js'
let c = fs.readFileSync(f, 'utf8')

if (c.includes('media.muted = false; media.playsInline')) {
  console.log('already patched')
  process.exit(0)
}

// 1) 视频创建块(L776-779, 5tab/6tab 缩进): muted=true → muted=false + volume
const OLD_CREATE = '\t\t\t\t\tif (wantTag === "VIDEO") {\n\t\t\t\t\t\tmedia = document.createElement("video");\n\t\t\t\t\t\tmedia.autoplay = true; media.loop = true; media.muted = true; media.playsInline = true;\n\t\t\t\t\t}'
const NEW_CREATE = '\t\t\t\t\tif (wantTag === "VIDEO") {\n\t\t\t\t\t\tmedia = document.createElement("video");\n\t\t\t\t\t\tmedia.autoplay = true; media.loop = true; media.muted = false; media.playsInline = true;\n\t\t\t\t\t\tmedia.volume = typeof state.volume === "number" ? state.volume : 0.35;\n\t\t\t\t\t}'
let n = c.split(OLD_CREATE).length - 1
if (n !== 1) { console.log('FAIL create-block matched', n); process.exit(1) }
fs.copyFileSync(f, f + '.bak-sound')
c = c.replace(OLD_CREATE, NEW_CREATE)

// 2) 复用已有 video 时也同步音量(src 更新行后, 4tab 缩进)
const OLD_SRC = '\t\t\t\tif (media.getAttribute("src") !== state.bg.url) media.setAttribute("src", state.bg.url);'
const NEW_SRC = '\t\t\t\tif (media.getAttribute("src") !== state.bg.url) media.setAttribute("src", state.bg.url);\n\t\t\t\tif (wantTag === "VIDEO" && typeof state.volume === "number") media.volume = state.volume;'
n = c.split(OLD_SRC).length - 1
if (n !== 1) { console.log('FAIL src-line matched', n); process.exit(1) }
c = c.replace(OLD_SRC, NEW_SRC)

fs.writeFileSync(f, c, 'utf8')
console.log('patched: muted=false + volume follows state.volume')
