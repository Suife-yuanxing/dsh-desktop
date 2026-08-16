// 生成应用图标:官方黑色鲸鱼(SVG)→ 透明镂空多尺寸 ICO + logo.png
// 用法: npx electron scripts/gen-icons.js
// 素材:DeepSeek Harness 官网 nav logo 中的鲸鱼 path(viewBox 裁剪为纯鲸鱼区域)
const { app, BrowserWindow, nativeImage } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const OUT_DIR = path.join(__dirname, '..')
const SIZES = [256, 128, 64, 48, 32, 16]
// 官网鲸鱼 path(currentColor 原为暗色主题白色/亮色黑色;此处固定黑色做透明镂空图标)
const WHALE_PATH = 'M26.5174 3.39471C26.235 3.2567 26.1137 3.52006 25.9487 3.65346C25.8923 3.69659 25.8446 3.75294 25.7969 3.80469C25.3846 4.24516 24.9027 4.53439 24.2737 4.49989C23.3536 4.44814 22.5682 4.73737 21.8735 5.44119C21.7258 4.57349 21.2353 4.0554 20.4889 3.72304C20.0985 3.55054 19.7034 3.37746 19.4297 3.00197C19.2388 2.73459 19.1865 2.43673 19.091 2.14289C19.0301 1.96579 18.9697 1.78466 18.7656 1.75418C18.5442 1.71968 18.4574 1.90541 18.3705 2.06067C18.0232 2.69549 17.8887 3.39471 17.9019 4.10313C17.9324 5.6965 18.6051 6.96556 19.9421 7.86834C20.0939 7.97184 20.133 8.07535 20.0852 8.22658C19.9938 8.53766 19.8857 8.83955 19.7903 9.15063C19.7293 9.34901 19.6384 9.39271 19.4257 9.30588C18.692 8.9994 18.0583 8.54571 17.4982 7.99772C16.5477 7.07827 15.6881 6.06336 14.6162 5.26869C14.3644 5.08296 14.1125 4.91045 13.8521 4.746C12.7584 3.68394 13.9952 2.81164 14.2816 2.70814C14.5812 2.60003 14.3857 2.22857 13.4179 2.23317C12.4502 2.2372 11.5646 2.56151 10.4359 2.99335C10.2708 3.05832 10.0972 3.10547 9.91951 3.14457C8.8954 2.95022 7.83162 2.90709 6.72069 3.03245C4.62877 3.26533 2.95777 4.25436 1.72954 5.94261C0.254043 7.97184 -0.0932678 10.2777 0.33167 12.6824C0.778458 15.2171 2.07225 17.3153 4.06008 18.9558C6.12152 20.6567 8.49577 21.4905 11.2047 21.3306C12.8498 21.2358 14.6812 21.0155 16.7473 19.2669C17.2682 19.5262 17.8151 19.6297 18.7219 19.7074C19.4205 19.7723 20.0933 19.6729 20.6143 19.5648C21.4302 19.3923 21.3739 18.6367 21.0789 18.4981C18.6874 17.3843 19.2124 17.8374 18.7351 17.4706C19.9501 16.033 21.8063 13.4776 22.379 9.99821C22.4353 9.61409 22.5072 9.073 22.4986 8.76192C22.494 8.57216 22.5377 8.49856 22.7545 8.47671C23.3536 8.40771 23.935 8.24383 24.4692 7.94999C26.0188 7.10357 26.6439 5.71318 26.7911 4.04678C26.8129 3.79204 26.7865 3.52869 26.5174 3.39471ZM13.0143 18.3946C10.6964 16.5724 9.5722 15.9726 9.10816 15.9985C8.67402 16.0244 8.75222 16.5212 8.84768 16.8449C8.94773 17.1646 9.07768 17.3849 9.25996 17.6655C9.38589 17.8512 9.47272 18.1272 9.13404 18.3348C8.38766 18.7965 7.08985 18.1796 7.0289 18.1491C5.51833 17.2595 4.25559 16.0853 3.36546 14.4793C2.50581 12.9337 2.0067 11.2753 1.92447 9.50542C1.90262 9.07818 2.02855 8.92695 2.45406 8.84932C3.01413 8.74582 3.59144 8.72397 4.15093 8.80619C6.51656 9.15178 8.53027 10.2092 10.2185 11.8848C11.1822 12.8388 11.9114 13.979 12.6623 15.0929C13.461 16.2757 14.3201 17.4027 15.4144 18.3268C15.8008 18.6505 16.109 18.8966 16.404 19.0783C15.5144 19.1778 14.0297 19.1991 13.0143 18.3958V18.3946ZM14.1252 11.2489C14.1252 11.0591 14.277 10.9079 14.4679 10.9079C14.511 10.9079 14.5501 10.9165 14.5852 10.9292C14.6329 10.9464 14.6766 10.9723 14.7111 11.0114C14.7721 11.0718 14.8066 11.158 14.8066 11.2489C14.8066 11.4386 14.6548 11.5899 14.4639 11.5899C14.273 11.5899 14.1252 11.4386 14.1252 11.2489ZM17.5759 13.0188C17.3545 13.1096 17.1331 13.1873 16.9203 13.1959C16.5903 13.2131 16.2303 13.0791 16.0348 12.9153C15.7312 12.6605 15.5139 12.5179 15.423 12.0734C15.3839 11.8837 15.4057 11.5899 15.4402 11.4214C15.5185 11.0585 15.4316 10.8257 15.1757 10.614C14.9676 10.4415 14.7025 10.3938 14.4115 10.3938C14.3029 10.3938 14.2034 10.3461 14.1292 10.3076C14.0079 10.2472 13.9078 10.096 14.0033 9.91023C14.0338 9.84985 14.1815 9.70322 14.216 9.67734C14.6111 9.45251 15.0665 9.52612 15.488 9.6946C15.8784 9.85445 16.174 10.1477 16.5989 10.5623C17.033 11.0631 17.1112 11.2011 17.3585 11.5772C17.554 11.871 17.7317 12.1729 17.8536 12.5185C17.9272 12.7341 17.8317 12.9107 17.5759 13.0188Z'
// 鲸鱼在原 143x23 画布中的包围区域(clipPath rect)
const VB = '0.163086 1.75 26.634 19.6'
const CANVAS = 1024

function buildHtml() {
  // 鲸鱼宽高比 26.634:19.6 ≈ 1.358;宽撑满画布、垂直居中(透明上下留空)
  const h = Math.round(CANVAS * 19.6 / 26.634)
  const top = Math.round((CANVAS - h) / 2)
  return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0;width:${CANVAS}px;height:${CANVAS}px;background:transparent}
svg{position:absolute;left:0;top:${top}px}
</style></head><body>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VB}" width="${CANVAS}" height="${h}"><path fill="#000000" d="${WHALE_PATH}"/></svg>
</body></html>`
}

async function main() {
  await app.whenReady()
  const win = new BrowserWindow({
    width: CANVAS, height: CANVAS,
    show: false, frame: false, transparent: true,
    webPreferences: { offscreen: true },
  })
  win.setBackgroundColor('#00000000')
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(buildHtml()))
  await new Promise((r) => setTimeout(r, 400))
  const img = await win.webContents.capturePage()
  const big = nativeImage.createFromBuffer(img.toPNG(), { width: CANVAS, height: CANVAS })

  // 多尺寸 PNG(PNG-embedded ICO)
  const pngs = SIZES.map((s) => big.resize({ width: s, height: s, quality: 'best' }).toPNG())

  // ICO:ICONDIR + ICONDIRENTRY*6 + PNG blobs
  const count = SIZES.length
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(count, 4)
  const entries = []
  const offsets = []
  let offset = 6 + 16 * count
  for (let i = 0; i < count; i++) {
    offsets.push(offset)
    offset += pngs[i].length
  }
  for (let i = 0; i < count; i++) {
    const e = Buffer.alloc(16)
    e.writeUInt8(SIZES[i] >= 256 ? 0 : SIZES[i], 0)
    e.writeUInt8(SIZES[i] >= 256 ? 0 : SIZES[i], 1)
    e.writeUInt8(0, 2); e.writeUInt8(0, 3)
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6)
    e.writeUInt32LE(pngs[i].length, 8)
    e.writeUInt32LE(offsets[i], 12)
    entries.push(e)
  }
  const ico = Buffer.concat([header, ...entries, ...pngs])
  fs.writeFileSync(path.join(OUT_DIR, 'icon.ico'), ico)
  // 256px PNG 作为 logo.png(installer/关于窗用)
  fs.writeFileSync(path.join(OUT_DIR, 'logo.png'), pngs[0])
  console.log(`icon.ico(${ico.length}B) + logo.png 已生成: 黑色鲸鱼, 透明底, ${SIZES.join('/')}px`)
  app.quit()
}

main().catch((e) => { console.error(e); app.exit(1) })
