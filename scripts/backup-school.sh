#!/bin/bash
# ShulePulse Per-School Database Backup
# Exports each school's data separately, compresses, and uploads to R2
# Usage: ./scripts/backup-school.sh
# Env vars required: DATABASE_URL, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME

set -euo pipefail

DATE=$(date +%Y-%m-%d)
BACKUP_DIR="/tmp/shulepulse-backups/$DATE"
mkdir -p "$BACKUP_DIR"

echo "=== ShulePulse Per-School Backup ==="
echo "Date: $DATE"
echo ""

# ── 1. Get list of all schools ──────────────────────────────────
echo "[1/4] Fetching school list..."
psql "$DATABASE_URL" -t -A -c "SELECT id, name FROM schools ORDER BY name;" > "$BACKUP_DIR/schools.txt"
SCHOOL_COUNT=$(wc -l < "$BACKUP_DIR/schools.txt")
echo "  Found $SCHOOL_COUNT schools"

# ── 2. Tables with direct school_id ─────────────────────────────
DIRECT_TABLES=(
  students teachers classes subjects attendance grades profiles
  parents parent_student_links promotion_history transfer_history
  grade_levels discipline_records student_payments
  class_subject_requirements teacher_subject_assignments timetable_slots
  exam_uploads question_papers class_comments cbc_assessments
  grading_systems grading_bands exam_type_config grade_audit_logs
  notices parent_messages
  fee_categories fee_structures fee_assessments fee_payments student_ledger receipts fee_adjustments
  chart_of_accounts journal_entries fiscal_periods journal_number_counters
  asset_categories suppliers fixed_assets asset_events asset_custody_history
  asset_location_history asset_maintenance asset_depreciation_runs
  asset_depreciation_lines asset_documents
  tax_rules asset_tax_schedules
  ap_tax_config ap_suppliers ap_invoices ap_invoice_lines ap_payments
  ap_payment_allocations finance_attachments
  expenses expense_lines
  cash_transfers bank_reconciliations bank_reconciliation_lines
  payroll_statutory_config payroll_employees payroll_employee_items
  payroll_periods payroll_runs payroll_lines payroll_payment_requests
  payroll_account_mapping salary_grades
  non_teaching_staff departments
  library_categories library_shelves library_books library_members
  library_rules library_loans library_reservations library_settings
  library_book_copies library_fines
  visitors appointments prospective_students front_office_requests school_events
  audit_logs support_tickets school_feature_overrides
)

# ── 3. Tables indirectly scoped (need JOIN) ─────────────────────
# student_documents → students.school_id
# fee_structure_items → fee_structures.school_id
# journal_entry_lines → journal_entries.school_id
# ticket_messages → support_tickets.school_id
# ticket_sla → support_tickets.school_id

# ── 4. Export each school ───────────────────────────────────────
echo "[2/4] Exporting per-school data..."
SUCCESS=0
FAILED=0

while IFS='|' read -r SCHOOL_ID SCHOOL_NAME; do
  # Sanitize school name for filename
  SAFE_NAME=$(echo "$SCHOOL_NAME" | tr ' ' '_' | tr -cd '[:alnum:]_-')
  SCHOOL_FILE="$BACKUP_DIR/${SAFE_NAME}_${SCHOOL_ID}.sql"

  echo "  Exporting: $SCHOOL_NAME ($SCHOOL_ID)"

  # Start the SQL file
  {
    echo "-- ShulePulse Backup"
    echo "-- School: $SCHOOL_NAME"
    echo "-- School ID: $SCHOOL_ID"
    echo "-- Date: $DATE"
    echo ""
    echo "BEGIN;"
    echo ""

    # Export school metadata
    echo "-- School metadata"
    psql "$DATABASE_URL" -t -A -c \
      "SELECT 'INSERT INTO schools (id, name, created_at) VALUES (''' || id || ''', ''' || replace(name, '''', '''''') || ''', ''' || created_at || ''') ON CONFLICT (id) DO NOTHING;' FROM schools WHERE id = '$SCHOOL_ID';"
    echo ""

    # Export each direct school_id table
    for TABLE in "${DIRECT_TABLES[@]}"; do
      # Check if table exists
      EXISTS=$(psql "$DATABASE_URL" -t -A -c \
        "SELECT 1 FROM information_schema.tables WHERE table_name = '$TABLE' LIMIT 1;" 2>/dev/null || echo "")
      if [ "$EXISTS" != "1" ]; then
        continue
      fi

      # Get column list for COPY
      COLUMNS=$(psql "$DATABASE_URL" -t -A -c \
        "SELECT string_agg(column_name, ', ' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_name = '$TABLE' AND table_schema = 'public';")

      if [ -z "$COLUMNS" ]; then
        continue
      fi

      ROW_COUNT=$(psql "$DATABASE_URL" -t -A -c \
        "SELECT COUNT(*) FROM $TABLE WHERE school_id = '$SCHOOL_ID';" 2>/dev/null || echo "0")

      if [ "$ROW_COUNT" = "0" ]; then
        continue
      fi

      echo "-- Table: $TABLE ($ROW_COUNT rows)"
      psql "$DATABASE_URL" -t -A -c \
        "SELECT 'INSERT INTO $TABLE (' || $COLUMNS || ') VALUES (' || $COLUMNS || ');' FROM $TABLE WHERE school_id = '$SCHOOL_ID';" 2>/dev/null || true
      echo ""
    done

    # Export indirectly scoped tables
    echo "-- Indirectly scoped tables"

    # student_documents
    EXISTS=$(psql "$DATABASE_URL" -t -A -c \
      "SELECT 1 FROM information_schema.tables WHERE table_name = 'student_documents' LIMIT 1;" 2>/dev/null || echo "")
    if [ "$EXISTS" = "1" ]; then
      psql "$DATABASE_URL" -t -A -c \
        "SELECT string_agg('INSERT INTO student_documents (' || string_agg(column_name, ', ') || ') VALUES (' || vals || ');', E'\n')
         FROM (
           SELECT sd.*, (SELECT string_agg(
             CASE
               WHEN v IS NULL THEN 'NULL'
               WHEN t IN ('uuid','text','character varying','name') THEN '''' || replace(v::text, '''', '''''') || ''''
               WHEN t IN ('integer','bigint','smallint','numeric','real','double precision') THEN v::text
               WHEN t = 'boolean' THEN v::text
               WHEN t = 'jsonb' THEN '''' || replace(v::text, '''', '''''') || '''::jsonb'
               WHEN t = 'timestamp with time zone' THEN '''' || v::text || '''::timestamptz'
               WHEN t = 'timestamp without time zone' THEN '''' || v::text || '''::timestamp'
               WHEN t = 'date' THEN '''' || v::text || '''::date'
               ELSE '''' || replace(v::text, '''', '''''') || ''''
             END, ', ')
           FROM jsonb_each_text(to_jsonb(sd))
           JOIN information_schema.columns c ON c.column_name = key AND c.table_name = 'student_documents'
         ) AS vals
         FROM student_documents sd
         JOIN students s ON s.id = sd.student_id
         WHERE s.school_id = '$SCHOOL_ID'
         LIMIT 1
         OFFSET 0
         ) sub;" 2>/dev/null || true
    fi

    # For simpler indirect tables, use a direct approach
    for PAIR in "fee_structure_items|fee_structures" "journal_entry_lines|journal_entries" "ticket_messages|support_tickets" "ticket_sla|support_tickets"; do
      CHILD=$(echo "$PAIR" | cut -d'|' -f1)
      PARENT=$(echo "$PAIR" | cut -d'|' -f2)

      EXISTS=$(psql "$DATABASE_URL" -t -A -c \
        "SELECT 1 FROM information_schema.tables WHERE table_name = '$CHILD' LIMIT 1;" 2>/dev/null || echo "")
      if [ "$EXISTS" != "1" ]; then
        continue
      fi

      PARENT_FK=$(psql "$DATABASE_URL" -t -A -c \
        "SELECT string_agg(kcu.column_name, ', ')
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
         WHERE tc.table_name = '$CHILD' AND tc.constraint_type = 'FOREIGN KEY'
         LIMIT 1;" 2>/dev/null || echo "")

      if [ -n "$PARENT_FK" ]; then
        # Use raw SQL with explicit JOIN
        psql "$DATABASE_URL" -t -A -c \
          "INSERT INTO $CHILD SELECT c.* FROM $CHILD c
           JOIN $PARENT p ON p.id = c.${PARENT}_id
           WHERE p.school_id = '$SCHOOL_ID';" 2>/dev/null || true
      fi
    done

    echo ""
    echo "COMMIT;"

  } > "$SCHOOL_FILE"

  # Compress
  gzip "$SCHOOL_FILE"
  SIZE=$(du -h "${SCHOOL_FILE}.gz" | cut -f1)
  echo "    ✓ ${SAFE_NAME}_${SCHOOL_ID}.sql.gz ($SIZE)"
  SUCCESS=$((SUCCESS + 1))

done < <(psql "$DATABASE_URL" -t -A -c "SELECT id || '|' || name FROM schools ORDER BY name;" | sed 's/|/|/')

echo ""
echo "[3/4] Export complete: $SUCCESS schools exported, $FAILED failed"

# ── 5. Upload to R2 ─────────────────────────────────────────────
echo "[4/4] Uploading to R2..."
R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

for FILE in "$BACKUP_DIR"/*.sql.gz; do
  [ -f "$FILE" ] || continue
  FILENAME=$(basename "$FILE")
  # Extract school_id from filename (format: SchoolName_UUID.sql.gz)
  SCHOOL_UUID=$(echo "$FILENAME" | grep -oP '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' || echo "unknown")

  aws s3 cp "$FILE" \
    "s3://${R2_BUCKET_NAME}/backups/${SCHOOL_UUID}/${DATE}.sql.gz" \
    --endpoint-url "$R2_ENDPOINT" \
    --region auto \
    --no-progress 2>/dev/null

  echo "  ✓ Uploaded: backups/${SCHOOL_UUID}/${DATE}.sql.gz"
done

echo ""
echo "=== Backup Complete ==="
echo "Local: $BACKUP_DIR"
echo "R2: backups/*/${DATE}.sql.gz"
