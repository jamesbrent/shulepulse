# ShulePulse Database Backup Script
# Run weekly: .\scripts\backup-database.ps1
# Or schedule via Windows Task Scheduler

$BackupDir = "C:\Users\BEST\Desktop\shulepulse-backups"
$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$ProjectRef = "oywptkvlztswblfchvyo"

# Create backup directory if it doesn't exist
if (!(Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
    Write-Host "Created backup directory: $BackupDir" -ForegroundColor Green
}

Write-Host "Starting ShulePulse database backup..." -ForegroundColor Cyan
Write-Host "Timestamp: $Timestamp" -ForegroundColor Gray

# 1. Schema backup (structure only - safe to keep forever)
Write-Host "`n[1/3] Backing up database schema..." -ForegroundColor Yellow
supabase db dump --schema-only > "$BackupDir\schema_$Timestamp.sql"
if ($LASTEXITCODE -eq 0) {
    Write-Host "  Schema backup saved" -ForegroundColor Green
} else {
    Write-Host "  Schema backup FAILED" -ForegroundColor Red
}

# 2. Full backup (schema + data)
Write-Host "`n[2/3] Backing up database (schema + data)..." -ForegroundColor Yellow
supabase db dump > "$BackupDir\full_$Timestamp.sql"
if ($LASTEXITCODE -eq 0) {
    $Size = [math]::Round((Get-Item "$BackupDir\full_$Timestamp.sql").Length / 1MB, 2)
    Write-Host "  Full backup saved ($Size MB)" -ForegroundColor Green
} else {
    Write-Host "  Full backup FAILED" -ForegroundColor Red
}

# 3. Data-only backup (just the data, no structure)
Write-Host "`n[3/3] Backing up data only..." -ForegroundColor Yellow
supabase db dump --data-only > "$BackupDir\data_$Timestamp.sql"
if ($LASTEXITCODE -eq 0) {
    $Size = [math]::Round((Get-Item "$BackupDir\data_$Timestamp.sql").Length / 1MB, 2)
    Write-Host "  Data backup saved ($Size MB)" -ForegroundColor Green
} else {
    Write-Host "  Data backup FAILED" -ForegroundColor Red
}

# Cleanup: Keep only last 4 weeks of backups
Write-Host "`nCleaning up old backups (keeping last 4 weeks)..." -ForegroundColor Gray
$CutoffDate = (Get-Date).AddDays(-28)
Get-ChildItem $BackupDir -Filter "*.sql" | Where-Object { $_.LastWriteTime -lt $CutoffDate } | ForEach-Object {
    Remove-Item $_.FullName -Force
    Write-Host "  Removed: $($_.Name)" -ForegroundColor DarkGray
}

# Summary
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Backup Complete!" -ForegroundColor Green
Write-Host "Location: $BackupDir" -ForegroundColor White
Write-Host "Files:" -ForegroundColor White
Get-ChildItem $BackupDir -Filter "*$Timestamp*" | ForEach-Object {
    Write-Host "  - $($_.Name) ($([math]::Round($_.Length / 1KB)) KB)" -ForegroundColor Gray
}
Write-Host "========================================" -ForegroundColor Cyan
