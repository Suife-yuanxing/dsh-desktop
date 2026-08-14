// Host 半边:纯 client UI 插件,空 apply 仅为了让包出现在 host Loader 树里。
// 浏览器半边经 exports["./client"](lib/client.js)由 dsh.client 声明发现。
export function apply() {}
