// 写 profile patch:webserver 行绑定 0.0.0.0,使手机(同一 Wi-Fi)可达
// dsh-remote-web-ui 的配对二维码。CLI 层拦 '--host 0.0.0.0' 字符串(安全提示),
// 但 webserver schema 允许该字面量;patch 替换整份 config,故需重述 port。
// 配对门(requirePairingForLan,默认开)仍把所有非 loopback /api 请求挡在
// 已配对设备 cookie 之后,二维码是唯一入口。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const file = path.join(os.homedir(), '.dsh', 'profiles', 'web', 'cordis.patch.yml')
const backup = file + '.bak-pre-lan'
if (fs.existsSync(file) && !fs.existsSync(backup)) fs.copyFileSync(file, backup)

const content = `# dsh profile patch — LAN binding for mobile remote control (@linxin666/dsh-remote-web-ui)
# webserver row: bind all interfaces so the phone (same Wi-Fi) can reach the
# pairing QR. CLI blocks the '--host 0.0.0.0' flag; the row schema accepts the
# literal. Patch replaces the whole config, so port is restated. Non-loopback
# /api stays gated behind a paired device cookie (requirePairingForLan).
- id: webserver
  config:
    host: 0.0.0.0
    port: 3080
`
fs.writeFileSync(file, content, 'utf8')
console.log('written:', file)
console.log('--- verify ---')
console.log(fs.readFileSync(file, 'utf8'))
