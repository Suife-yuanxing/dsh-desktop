param([int]$HoverCssX = -69, [int]$HoverCssY = 18)
# DPI-aware hover test: all coords physical, CSS px converted via 1.5 scale factor.
# Buttons: 46x36 CSS each at top-right; min[-138,-92] max[-92,-46] close[-46,0]
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class W {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("shcore.dll")] public static extern int SetProcessDpiAwareness(int value);
  [StructLayout(LayoutKind.Sequential)] public struct R { public int L, T, Rt, B; }
}
"@
try { [W]::SetProcessDpiAwareness(2) | Out-Null } catch { } # PER_MONITOR_DPI_AWARE
Add-Type -AssemblyName System.Drawing
$scale = 1.5

$proc = Get-Process | Where-Object { $_.Name -eq 'DeepSeek Harness' -and $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $proc) { throw "no main window" }
$h = $proc.MainWindowHandle
$r = New-Object W+R
[W]::GetWindowRect($h, [ref]$r) | Out-Null
"window(physical): L=$($r.L) T=$($r.T) R=$($r.Rt) B=$($r.B) (w=$($r.Rt-$r.L) h=$($r.B-$r.T))"

# capture region: top-right 330x66 physical (= 220x44 CSS)
$capW = [int](220 * $scale); $capH = [int](44 * $scale)
$capL = $r.Rt - $capW; $capT = $r.T
function Shot([string]$path) {
  $bmp = New-Object System.Drawing.Bitmap($capW, $capH)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($capL, $capT, 0, 0, (New-Object System.Drawing.Size($capW, $capH)))
  $g.Dispose(); $bmp.Save($path); $bmp.Dispose()
}

# idle: cursor far below-left outside window
[W]::SetCursorPos($r.L + 200, $r.B + 300) | Out-Null
Start-Sleep -Milliseconds 700
Shot "$env:TEMP\hover-idle.png"

# hover (CSS coords relative to top-right corner -> physical)
$hx = $r.Rt + [int]($HoverCssX * $scale); $hy = $r.T + [int]($HoverCssY * $scale)
[W]::SetCursorPos($hx, $hy) | Out-Null
Start-Sleep -Milliseconds 800
Shot "$env:TEMP\hover-on.png"

# restore cursor to page middle
[W]::SetCursorPos($r.L + 600, $r.T + 300) | Out-Null

$idle = [System.Drawing.Bitmap]::FromFile("$env:TEMP\hover-idle.png")
$on = [System.Drawing.Bitmap]::FromFile("$env:TEMP\hover-on.png")
# bands in physical px (CSS band * 1.5): min[123,190] max[192,259] close[261,329]
$bands = @(
  @(123,190,'minimize btn'),
  @(192,259,'maximize btn'),
  @(261,329,'close btn'),
  @(0,89,'far left (no btn)')
)
foreach ($b in $bands) {
  $sum = 0.0; $n = 0; $peak = 0
  for ($x = $b[0]; $x -le $b[1]; $x++) { for ($y = 0; $y -lt $capH; $y++) {
    if ($x -lt $capW) {
      $c1 = $idle.GetPixel($x, $y); $c2 = $on.GetPixel($x, $y)
      $d = [Math]::Abs($c1.R - $c2.R) + [Math]::Abs($c1.G - $c2.G) + [Math]::Abs($c1.B - $c2.B)
      $sum += $d; $n++
      if ($d -gt $peak) { $peak = $d }
    }
  } }
  " {0,-18} meanDelta={1,6:F1} (per-channel {2,5:F1})  peak={3}" -f $b[2], ($sum / $n), ($sum / $n / 3), $peak
}
$idle.Dispose(); $on.Dispose()
