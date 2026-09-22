Add-Type -AssemblyName System.Drawing
$path = 'E:\Grana-temporarios\prints\publicitarios\01-home-publicitario-v2.png'
$src = [System.Drawing.Bitmap]::new($path)
$bg = $src.GetPixel(10,150)
$g = [System.Drawing.Graphics]::FromImage($src)
$brush = [System.Drawing.SolidBrush]::new($bg)
$g.FillRectangle($brush,365,185,48,65)
$g.Dispose()
$brush.Dispose()
$src.Save($path,[System.Drawing.Imaging.ImageFormat]::Png)
$src.Dispose()
