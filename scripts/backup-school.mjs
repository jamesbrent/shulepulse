#!/usr/bin/env node
/**
 * ShulePulse Per-School Database Backup
 * 
 * Exports each school's data into separate .sql.gz files
 * and uploads them to Cloudflare R2.
 * 
 * Env vars required:
 *   DATABASE_URL          - PostgreSQL connection string (pooler)
 *   R2_ACCOUNT_ID         - Cloudflare account ID
 *   R2_ACCESS_KEY_ID      - R2 API token access key
 *   R2_SECRET_ACCESS_KEY  - R2 API token secret key
 *   R2_BUCKET_NAME        - R2 bucket name (e.g. shulepulse-backups)
 */

import { Client } from 'pg';
import { gzip } from 'zlib';
import { promisify } from 'util';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const gzipAsync = promisify(gzip);

// ── Config ──────────────────────────────────────────────────────
const DATABASE_URL = process.env.DATABASE_URL;
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
const DATE = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

// ── Validate env vars ───────────────────────────────────────────
for (const [key, val] of Object.entries({
  DATABASE_URL, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
})) {
  if (!val) { console.error(`Missing env var: ${key}`); process.exit(1); }
}

// ── R2 Client ───────────────────────────────────────────────────
const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

// ── Tables with direct school_id ────────────────────────────────
const DIRECT_TABLES = [
  // Core
  'students', 'teachers', 'classes', 'subjects', 'attendance', 'grades',
  'profiles', 'parents', 'parent_student_links', 'promotion_history',
  'transfer_history', 'grade_levels', 'discipline_records', 'student_payments',
  // Academics
  'class_subject_requirements', 'teacher_subject_assignments', 'timetable_slots',
  'exam_uploads', 'question_papers', 'class_comments', 'cbc_assessments',
  'grading_systems', 'grading_bands', 'exam_type_config', 'grade_audit_logs',
  // Communication
  'notices', 'parent_messages',
  // Finance - Fees
  'fee_categories', 'fee_structures', 'fee_assessments', 'fee_payments',
  'student_ledger', 'receipts', 'fee_adjustments',
  // Finance - GL
  'chart_of_accounts', 'journal_entries', 'fiscal_periods', 'journal_number_counters',
  // Finance - Fixed Assets
  'asset_categories', 'suppliers', 'fixed_assets', 'asset_events',
  'asset_custody_history', 'asset_location_history', 'asset_maintenance',
  'asset_depreciation_runs', 'asset_depreciation_lines', 'asset_documents',
  // Finance - Tax
  'tax_rules', 'asset_tax_schedules',
  // Finance - AP
  'ap_tax_config', 'ap_suppliers', 'ap_invoices', 'ap_invoice_lines',
  'ap_payments', 'ap_payment_allocations', 'finance_attachments',
  // Finance - Expenses
  'expenses', 'expense_lines',
  // Finance - Treasury
  'cash_transfers', 'bank_reconciliations', 'bank_reconciliation_lines',
  // Payroll
  'payroll_statutory_config', 'payroll_employees', 'payroll_employee_items',
  'payroll_periods', 'payroll_runs', 'payroll_lines', 'payroll_payment_requests',
  'payroll_account_mapping', 'salary_grades',
  // HR
  'non_teaching_staff', 'departments',
  // Library
  'library_categories', 'library_shelves', 'library_books', 'library_members',
  'library_rules', 'library_loans', 'library_reservations', 'library_settings',
  'library_book_copies', 'library_fines',
  // Front Office
  'visitors', 'appointments', 'prospective_students', 'front_office_requests', 'school_events',
  // Platform
  'audit_logs', 'support_tickets', 'school_feature_overrides',
];

// Tables indirectly scoped (need JOIN to parent)
const INDIRECT_TABLES = [
  { child: 'student_documents', parent: 'students', fk: 'student_id' },
  { child: 'fee_structure_items', parent: 'fee_structures', fk: 'fee_structure_id' },
  { child: 'journal_entry_lines', parent: 'journal_entries', fk: 'journal_entry_id' },
  { child: 'ticket_messages', parent: 'support_tickets', fk: 'ticket_id' },
  { child: 'ticket_sla', parent: 'support_tickets', fk: 'ticket_id' },
];

// ── Helpers ─────────────────────────────────────────────────────

async function tableExists(client, tableName) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.tables 
     WHERE table_name = $1 AND table_schema = 'public' LIMIT 1`,
    [tableName]
  );
  return rows.length > 0;
}

async function getColumns(client, tableName) {
  const { rows } = await client.query(
    `SELECT column_name FROM information_schema.columns 
     WHERE table_name = $1 AND table_schema = 'public' 
     ORDER BY ordinal_position`,
    [tableName]
  );
  return rows.map(r => r.column_name);
}

function escapeValue(val, colType) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'::jsonb`;
  const str = String(val).replace(/'/g, "''");
  return `'${str}'`;
}

async function exportTableData(client, tableName, columns, whereClause) {
  const colList = columns.join(', ');
  const query = `SELECT ${colList} FROM ${tableName} ${whereClause}`;
  
  try {
    const { rows } = await client.query(query);
    if (rows.length === 0) return '';
    
    const lines = [`-- Table: ${tableName} (${rows.length} rows)`];
    for (const row of rows) {
      const values = columns.map(col => escapeValue(row[col]));
      lines.push(`INSERT INTO ${tableName} (${colList}) VALUES (${values.join(', ')});`);
    }
    lines.push('');
    return lines.join('\n');
  } catch (err) {
    console.error(`  ⚠ Error exporting ${tableName}: ${err.message}`);
    return `-- Error exporting ${tableName}: ${err.message}\n`;
  }
}

async function uploadToR2(schoolId, sqlContent) {
  const compressed = await gzipAsync(Buffer.from(sqlContent, 'utf-8'));
  const key = `backups/${schoolId}/${DATE}.sql.gz`;
  
  await r2.send(new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    Body: compressed,
    ContentType: 'application/gzip',
    Metadata: {
      'school-id': schoolId,
      'backup-date': DATE,
      'uncompressed-size': String(sqlContent.length),
    },
  }));
  
  return key;
}

// ── Main ────────────────────────────────────────────────────────

async function main() {
  console.log('=== ShulePulse Per-School Backup ===');
  console.log(`Date: ${DATE}`);
  console.log('');
  
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  
  try {
    // 1. Get all schools
    console.log('[1/3] Fetching schools...');
    const { rows: schools } = await client.query(
      'SELECT id, name FROM schools ORDER BY name'
    );
    console.log(`  Found ${schools.length} schools`);
    
    // Check which tables actually exist
    console.log('[2/3] Checking table availability...');
    const existingDirect = [];
    for (const table of DIRECT_TABLES) {
      if (await tableExists(client, table)) {
        existingDirect.push(table);
      }
    }
    console.log(`  ${existingDirect.length} of ${DIRECT_TABLES.length} direct tables exist`);
    
    const existingIndirect = [];
    for (const { child, parent, fk } of INDIRECT_TABLES) {
      const childExists = await tableExists(client, child);
      const parentExists = await tableExists(client, parent);
      if (childExists && parentExists) {
        existingIndirect.push({ child, parent, fk });
      }
    }
    console.log(`  ${existingIndirect.length} of ${INDIRECT_TABLES.length} indirect table pairs exist`);
    
    // 3. Export each school
    console.log('[3/3] Exporting and uploading...');
    let success = 0;
    let failed = 0;
    
    for (const school of schools) {
      const { id: schoolId, name: schoolName } = school;
      console.log(`  ${schoolName} (${schoolId})`);
      
      try {
        let sql = `-- ShulePulse Backup\n-- School: ${schoolName}\n-- School ID: ${schoolId}\n-- Date: ${DATE}\n\nBEGIN;\n\n`;
        
        // School metadata
        sql += `-- School metadata\n`;
        sql += await exportTableData(client, 'schools', 
          await getColumns(client, 'schools'), 
          `WHERE id = '${schoolId}'`
        );
        
        // Direct school_id tables
        for (const table of existingDirect) {
          const columns = await getColumns(client, table);
          if (columns.length === 0) continue;
          sql += await exportTableData(client, table, columns, 
            `WHERE school_id = '${schoolId}'`
          );
        }
        
        // Indirectly scoped tables
        for (const { child, parent, fk } of existingIndirect) {
          const columns = await getColumns(client, child);
          if (columns.length === 0) continue;
          sql += await exportTableData(client, child, columns,
            `WHERE ${fk} IN (SELECT id FROM ${parent} WHERE school_id = '${schoolId}')`
          );
        }
        
        sql += '\nCOMMIT;\n';
        
        // Upload to R2
        const key = await uploadToR2(schoolId, sql);
        const sizeKB = Math.round(sql.length / 1024);
        console.log(`    ✓ ${key} (${sizeKB} KB)`);
        success++;
        
      } catch (err) {
        console.error(`    ✗ Failed: ${err.message}`);
        failed++;
      }
    }
    
    console.log('');
    console.log(`=== Complete: ${success} exported, ${failed} failed ===`);
    
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
