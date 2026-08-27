# v0.5.0 local 轨运行时组装:npx 官方树自带完整依赖闭包,而 monorepo 的 pnpm 布局是
# workspace 直接链接+各成员自持 node_modules —— `apps/cli/lib/bin.js`(本地构建产物)
# 直跑时 vendor/loader 等 importer 的 ESM 解析链向上找不到 workspace 包。
# 本脚本把全部 workspace 成员依赖链接镜像到 monorepo 根 node_modules(只补缺失,
# 幂等可重放;pnpm install/uninstall 重排后需要再跑一次)。
#
# 用法: powershell -File scripts/link-local-runtime.ps1 [-RepoRoot <deepseek-harness>]
# 验证: node --expose-internals apps/cli/lib/bin.js web --help
param(
  [string]$RepoRoot = ''
)

$ErrorActionPreference = 'Stop'
if (-not $RepoRoot) {
  # 缺省从本脚本位置向上找兄弟仓: dsh-desktop/scripts -> ../.. -> deepseek-harness
  $here = Split-Path -Parent $MyInvocation.MyCommand.Path
  $cand = Join-Path (Split-Path -Parent (Split-Path -Parent $here)) 'deepseek-harness'
  if (-not (Test-Path (Join-Path $cand 'pnpm-workspace.yaml'))) {
    Write-Error "兄弟仓未找到于 $cand ,请用 -RepoRoot 显式指定 deepseek-harness 目录"
  }
  $RepoRoot = $cand
}
$rootNm = Join-Path $RepoRoot 'node_modules'
if (-not (Test-Path (Join-Path $RepoRoot 'pnpm-workspace.yaml'))) { Write-Error "$RepoRoot 不是 deepseek-harness 工作区根" }

# 组装 workspace 全成员清单(root 自身除外): packages/*/* 、vendor/* 、apps/* 、
# examples/ 、python/sdk-runtime(+python 下其余 deploy root 如有)。
$nms = @()
foreach ($g in (Get-ChildItem (Join-Path $RepoRoot 'packages') -Directory)) {
  foreach ($p in (Get-ChildItem $g.FullName -Directory)) { $nms += (Join-Path $p.FullName 'node_modules') }
}
foreach ($top in @('vendor', 'apps')) {
  foreach ($m in (Get-ChildItem (Join-Path $RepoRoot $top) -Directory)) { $nms += (Join-Path $m.FullName 'node_modules') }
}
foreach ($extra in @('examples\node_modules', 'python\sdk-runtime\node_modules')) {
  $nms += (Join-Path $RepoRoot $extra)
}

function Mirror($sourceDir, $targetPath) {
  if (-not (Test-Path $targetPath)) {
    New-Item -ItemType Junction -Path $targetPath -Target $sourceDir.FullName | Out-Null
    return $true
  }
  return $false
}

$added = 0; $existed = 0; $scanned = 0
foreach ($nm in ($nms | Where-Object { Test-Path $_ })) {
  if ((Resolve-Path $nm).Path -eq (Resolve-Path $rootNm).Path) { continue }
  $scanned++
  foreach ($child in (Get-ChildItem $nm -Directory | Where-Object { $_.Name -notmatch '^(\.bin|\.ignored|\.pnpm)' })) {
    if ($child.Name.StartsWith('@')) {
      foreach ($pkg in (Get-ChildItem $child.FullName -Directory)) {
        if (Mirror $pkg "$rootNm\$($child.Name)\$($pkg.Name)") { $added++ } else { $existed++ }
      }
    } else {
      if (Mirror $child "$rootNm\$($child.Name)") { $added++ } else { $existed++ }
    }
  }
}

Write-Host "link-local-runtime: 成员 node_modules=$scanned 新增链接=$added 已存在=$existed"
Write-Host "提示: 该组装态位于 git ignored 的 node_modules 内,重装依赖后请重放本脚本。"
