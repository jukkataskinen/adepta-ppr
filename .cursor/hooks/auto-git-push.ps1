$null = [Console]::In.ReadToEnd()

try {
  git rev-parse --is-inside-work-tree *> $null
  if ($LASTEXITCODE -ne 0) { exit 0 }

  $status = git status --porcelain
  if (-not $status) { exit 0 }

  git add -A
  if ($LASTEXITCODE -ne 0) { exit 0 }

  $msg = @"
chore: automaattinen commit ja push

Cursor hook commitoi ja pushaa muutokset automaattisesti.
"@

  git commit -m $msg
  if ($LASTEXITCODE -ne 0) { exit 0 }

  git push
  exit 0
}
catch {
  exit 0
}
