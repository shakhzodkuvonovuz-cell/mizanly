$base = "C:\Users\shakh\OneDrive\Desktop\mizanly\apps\mobile\app\(screens)"

# Files that use CRLF line endings
$files = @(
  "search-results.tsx",
  "conversation-media.tsx",
  "broadcast-channels.tsx",
  "drafts.tsx"
)

foreach ($f in $files) {
  $p = Join-Path $base $f
  if (Test-Path $p) {
    $text = [System.IO.File]::ReadAllText($p)
    $crlf = "`r`n"
    $lf = "`n"
    
    # Try CRLF first
    $pat = "<FlatList$crlf"
    $rep = "<FlatList$crlf          removeClippedSubviews={true}$crlf"
    $updated = $text.Replace($pat, $rep)
    
    if ($text -eq $updated) {
      # Try LF
      $pat = "<FlatList$lf"
      $rep = "<FlatList$lf          removeClippedSubviews={true}$lf"
      $updated = $text.Replace($pat, $rep)
    }
    
    if ($text -ne $updated) {
      [System.IO.File]::WriteAllText($p, $updated)
      Write-Host "Updated: $f"
    } else {
      Write-Host "No change: $f"
    }
  } else {
    Write-Host "Missing: $f"
  }
}

# Subfolder files
$subFiles = @(
  "followers\[userId].tsx",
  "following\[userId].tsx",
  "hashtag\[tag].tsx"
)

foreach ($sf in $subFiles) {
  $p = Join-Path $base $sf
  if (Test-Path $p) {
    $text = [System.IO.File]::ReadAllText($p)
    $crlf = "`r`n"
    $lf = "`n"
    
    $pat = "<FlatList$crlf"
    $rep = "<FlatList$crlf          removeClippedSubviews={true}$crlf"
    $updated = $text.Replace($pat, $rep)
    
    if ($text -eq $updated) {
      $pat = "<FlatList$lf"
      $rep = "<FlatList$lf          removeClippedSubviews={true}$lf"
      $updated = $text.Replace($pat, $rep)
    }
    
    if ($text -ne $updated) {
      [System.IO.File]::WriteAllText($p, $updated)
      Write-Host "Updated: $sf"
    } else {
      Write-Host "No change: $sf"
    }
  } else {
    Write-Host "Missing: $sf"
  }
}
