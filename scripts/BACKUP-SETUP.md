# ShulePulse Backup Setup Guide

## Overview
Automated daily backups to Cloudflare R2, segmented per school.
Each school gets its own backup file: `backups/{school_id}/{YYYY-MM-DD}.sql.gz`

## Prerequisites
- Cloudflare account (free tier works)
- GitHub repository access
- Supabase project access

---

## Step 1: Create R2 Bucket

1. Go to https://dash.cloudflare.com → R2 Object Storage
2. Click "Create bucket"
3. Name: `shulepulse-backups`
4. Location: closest to your users (e.g., ENAM for Kenya)
5. Click "Create bucket"

## Step 2: Create R2 API Token

1. In R2 dashboard, go to "Manage R2 API Tokens"
2. Click "Create API token"
3. Token name: `shulepulse-backup`
4. Permissions: "Object Read & Write"
5. Bucket: "Apply to specific buckets" → select `shulepulse-backups`
6. Click "Create API Token"
7. Copy the Access Key ID and Secret Access Key

## Step 3: Set Up R2 Lifecycle Rule

1. In R2 dashboard, click on `shulepulse-backups` bucket
2. Go to "Settings" tab
3. Under "Lifecycle rules", click "Add rule"
4. Rule name: `delete-old-backups`
5. Prefix: `backups/`
6. Action: "Delete objects"
7. Condition: "Objects older than" → `30 days`
8. Click "Save"

This auto-deletes backups older than 30 days per school.

## Step 4: Get Database Connection String

1. Go to Supabase Dashboard → Project Settings → Database
2. Under "Connection string", copy the "URI" value
3. It looks like: `postgresql://postgres.oywptkvlztswblfchvyo:PASSWORD@aws-0-us-east-1.pooler.supabase.com:6543/postgres`

**Important:** Use the **pooler** connection string (port 6543), not the direct one.

## Step 5: Add GitHub Secrets

Go to your GitHub repo → Settings → Secrets and variables → Actions → New repository secret

Add these secrets:

| Secret Name | Value |
|------------|-------|
| `DATABASE_URL` | Your Supabase connection string from Step 4 |
| `R2_ACCOUNT_ID` | Your Cloudflare Account ID (shown on R2 dashboard) |
| `R2_ACCESS_KEY_ID` | From Step 2 |
| `R2_SECRET_ACCESS_KEY` | From Step 2 |
| `R2_BUCKET_NAME` | `shulepulse-backups` |

## Step 6: Test the Backup

1. Go to GitHub → Actions → "Daily Per-School Backup"
2. Click "Run workflow" → select `main` branch → "Run workflow"
3. Wait for it to complete (check the logs)
4. Verify files appear in R2 bucket

## Step 7: Verify R2 Contents

After a successful run, the R2 bucket should contain:
```
backups/
  ├── {school-uuid-1}/
  │   └── 2026-08-26.sql.gz
  ├── {school-uuid-2}/
  │   └── 2026-08-26.sql.gz
  └── ...
```

## Manual Restore

To restore a school's backup:

```bash
# Download the backup
aws s3 cp s3://shulepulse-backups/backups/{school_id}/{date}.sql.gz . \
  --endpoint-url https://{ACCOUNT_ID}.r2.cloudflarestorage.com \
  --region auto

# Decompress
gunzip {date}.sql.gz

# Restore (WARNING: this replaces data for that school)
psql "$DATABASE_URL" < {date}.sql
```

## Monitoring

- Check GitHub Actions periodically for failed runs
- R2 usage is free for the first 10 GB (more than enough for backups)
- Backups auto-delete after 30 days via lifecycle rule
