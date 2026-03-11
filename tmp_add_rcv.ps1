$base = "C:\Users\shakh\OneDrive\Desktop\mizanly\apps\mobile\app\(screens)"
$files = @(
  "search-results.tsx",
  "search.tsx",
  "conversation-media.tsx",
  "archive.tsx",
  "bookmark-folders.tsx",
  "blocked.tsx",
  "muted.tsx",
  "circles.tsx",
  "close-friends.tsx",
  "mutual-followers.tsx",
  "broadcast-channels.tsx",
  "collab-requests.tsx",
  "follow-requests.tsx",
  "drafts.tsx"
)

$subfolders = @(
  @{name="followers\[userId].tsx"; path="followers\[userId].tsx"},
  @{name="following\[userId].tsx"; path="following\[userId].tsx"},
  @{name="hashtag\[tag].tsx"; path="hashtag\[tag].tsx"}
)

foreach ($f in $files) {
  $p = Join-Path $base $f
  if (Test-Path $p) {
    $text = [System.IO.File]::ReadAllText($p)
    $nl = "`n"
    $pat = "<FlatList$nl"
    $rep = "<FlatList$nl          removeClippedSubviews={true}$nl"
    $updated = $text.Replace($pat, $rep)
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

foreach ($sf in $subfolders) {
  $p = Join-Path $base $sf.path
  if (Test-Path $p) {
    $text = [System.IO.File]::ReadAllText($p)
    $nl = "`n"
    $pat = "<FlatList$nl"
    $rep = "<FlatList$nl          removeClippedSubviews={true}$nl"
    $updated = $text.Replace($pat, $rep)
    if ($text -ne $updated) {
      [System.IO.File]::WriteAllText($p, $updated)
      Write-Host "Updated: $($sf.name)"
    } else {
      Write-Host "No change: $($sf.name)"
    }
  } else {
    Write-Host "Missing: $($sf.name)"
  }
}
