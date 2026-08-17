param()
Add-Type -AssemblyName System.Drawing
$idle = [System.Drawing.Bitmap]::FromFile("$env:TEMP\hover-idle.png")
$on = [System.Drawing.Bitmap]::FromFile("$env:TEMP\hover-on.png")
$w = 220; $h = 44
$cols = @(0) * $w
$minX = 9999; $maxX = -1; $minY = 9999; $maxY = -1; $cnt = 0
for ($x = 0; $x -lt $w; $x++) {
  for ($y = 0; $y -lt $h; $y++) {
    $c1 = $idle.GetPixel($x, $y); $c2 = $on.GetPixel($x, $y)
    $d = [Math]::Abs($c1.R - $c2.R) + [Math]::Abs($c1.G - $c2.G) + [Math]::Abs($c1.B - $c2.B)
    if ($d -gt 12) {
      $cols[$x]++
      if ($x -lt $minX) { $minX = $x }; if ($x -gt $maxX) { $maxX = $x }
      if ($y -lt $minY) { $minY = $y }; if ($y -gt $maxY) { $maxY = $y }
      $cnt++
    }
  }
}
"diff bbox: x[$minX..$maxX] y[$minY..$maxY] count=$cnt"
# column-band histogram: 20px bands across 220
for ($b = 0; $b -lt 11; $b++) {
  $s = 0; for ($x = $b * 20; $x -lt ($b + 1) * 20; $x++) { $s += $cols[$x] }
  "x {0,3}-{1,3}: {2,5}" -f ($b * 20), ($b * 20 + 19), $s
}
# row-band histogram for button zone height
"rows:"
for ($b = 0; $b -lt 4; $b++) {
  $s = 0
  for ($x = 0; $x -lt $w; $x++) { for ($y = $b * 11; $y -lt ($b + 1) * 11; $y++) {
    $c1 = $idle.GetPixel($x, $y); $c2 = $on.GetPixel($x, $y)
    $d = [Math]::Abs($c1.R - $c2.R) + [Math]::Abs($c1.G - $c2.G) + [Math]::Abs($c1.B - $c2.B)
    if ($d -gt 12) { $s++ }
  } }
  "y {0,2}-{1,2}: {2,5}" -f ($b * 11), ($b * 11 + 10), $s
}
$idle.Dispose(); $on.Dispose()
