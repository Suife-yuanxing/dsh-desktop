# 托盘"重启 dsh 服务"全链路耗时测量:模拟 main.js restartDsh 的各段
# t0 taskkill 整树 | t1 spawn npx | t2 端口 listen | t3 HTTP GET / 200
$ErrorActionPreference = 'Continue'

# 1) 杀现有 dsh 树
$t0 = Get-Date
$conns = Get-NetTCPConnection -LocalPort 3080 -State Listen -ErrorAction SilentlyContinue
if ($conns) { taskkill /PID $($conns[0].OwningProcess) /T /F | Out-Null }
$t1 = Get-Date

# 2) WMI 拉起 npx(与壳同路径:cmd /c npx -y dsh web,cwd 用户目录)
$cmd = 'powershell.exe -NoProfile -WindowStyle Hidden -Command "Set-Location $env:USERPROFILE; npx -y @deepseek-ai/dsh@0.1.0-rc.6 web *>> $env:USERPROFILE\.dsh\logs\dsh-restart.log"'
$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $cmd }

# 3) 100ms 精细轮询:端口 → HTTP
$portUp = $null; $httpOk = $null
while (-not $portUp -and ((Get-Date) - $t1).TotalSeconds -lt 90) {
  if ((Test-NetConnection 127.0.0.1 -Port 3080 -WarningAction SilentlyContinue).TcpTestSucceeded) { $portUp = Get-Date }
  else { Start-Sleep -Milliseconds 100 }
}
while ($portUp -and -not $httpOk -and ((Get-Date) - $t1).TotalSeconds -lt 120) {
  try {
    $resp = Invoke-WebRequest -Uri 'http://127.0.0.1:3080/' -UseBasicParsing -TimeoutSec 3
    if ($resp.StatusCode -eq 200) { $httpOk = Get-Date } else { Start-Sleep -Milliseconds 100 }
  } catch { Start-Sleep -Milliseconds 100 }
}

# 4) 主 bundle 下载耗时(模拟浏览器取资源)
$bundleT = $null
if ($httpOk) {
  $html = $resp.Content
  if ($html -match 'src="(/assets/[^"]+\.js)"') {
    $bt = Get-Date
    Invoke-WebRequest -Uri "http://127.0.0.1:3080$($Matches[1])" -UseBasicParsing -TimeoutSec 10 | Out-Null
    $bundleT = ((Get-Date) - $bt).TotalSeconds
  }
}

"kill tree:      {0:N2}s" -f ($t1 - $t0).TotalSeconds
"npx -> port up: {0:N2}s" -f ($portUp - $t1).TotalSeconds
"port -> http200:{0:N2}s" -f ($httpOk - $portUp).TotalSeconds
"main bundle dl: {0:N2}s" -f $bundleT
"TOTAL:          {0:N2}s" -f ($httpOk - $t0).TotalSeconds
