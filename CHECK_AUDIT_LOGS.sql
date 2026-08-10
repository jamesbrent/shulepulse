SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'grade_audit_logs'
ORDER BY ordinal_position;
