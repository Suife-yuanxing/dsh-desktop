# 清理被 IDE 句柄锁定的旧构建残留:完全退出 IDE 后双击运行(或在终端执行)
# powershell -ExecutionPolicy Bypass -File cleanup-win-unpacked.ps1
$dir = "D:\deepseek harness\dsh-desktop\dist-v0.3\win-unpacked"
if (Test-Path $dir) {
  try {
    [System.IO.Directory]::Delete($dir, $true)
    Write-Host "已删除 $dir" -ForegroundColor Green
  } catch {
    Write-Host "仍被占用: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
  }
} else {
  Write-Host "目录已不存在,无需清理" -ForegroundColor Yellow
}
Get-ChildItem "D:\deepseek harness\dsh-desktop\dist-v0.3" | Select-Object Name
