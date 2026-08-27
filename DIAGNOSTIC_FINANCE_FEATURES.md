# Finance Features Access Diagnostic

## Issue Summary
Receipts (and possibly Payments, Statements, Debtors) show "Feature Not Available" even though the school is on Enterprise plan.

## Root Cause Analysis

The frontend UI fix has been applied (FeatureLocked.jsx now shows correct plan info for finance features).

However, the **real issue** is in the backend data. The school must be checked for:

1. **School's Plan Assignment** — Is the school's `plan` field set to `'enterprise'`?
2. **Subscription Status** — Is the school's `subscription_status` set to `'active'`?
3. **Feature Overrides** — Are there any `school_feature_overrides` disabling these features?

## Run These Checks in Supabase SQL Editor

### Check 1: Verify school's plan and subscription status
```sql
SELECT 
  s.id,
  s.name,
  s.plan,
  s.subscription_status,
  s.subscription_start,
  s.subscription_end
FROM schools s
WHERE s.name LIKE '%SCHOOL_NAME%'  -- Replace with your school name
LIMIT 1;
```

### Check 2: Verify enterprise plan has finance features
```sql
SELECT COUNT(*) as feature_count
FROM plan_features pf
WHERE pf.plan_key = 'enterprise'
  AND pf.feature_key IN (
    'finance.fees',
    'finance.payments',
    'finance.receipts',
    'finance.statements',
    'finance.debtors'
  );
```
Expected: Should return 5 rows (all 5 features)

### Check 3: Check for any overrides disabling these features for the school
```sql
SELECT 
  sfo.feature_key,
  sfo.enabled
FROM school_feature_overrides sfo
WHERE sfo.school_id = 'YOUR_SCHOOL_ID'  -- Replace with school UUID
  AND sfo.feature_key IN (
    'finance.receipts',
    'finance.payments',
    'finance.statements',
    'finance.debtors',
    'finance.fees'
  );
```

### Check 4: Test the RPC function directly
```sql
SELECT * FROM get_school_features('YOUR_SCHOOL_ID')
WHERE feature_key LIKE 'finance%'
ORDER BY feature_key;
```

## If School's Plan is Not 'enterprise'

Update it with:
```sql
UPDATE schools
SET plan = 'enterprise',
    subscription_status = 'active',
    subscription_start = NOW()
WHERE id = 'YOUR_SCHOOL_ID';
```

## If There Are Disabling Overrides

Remove them with:
```sql
DELETE FROM school_feature_overrides
WHERE school_id = 'YOUR_SCHOOL_ID'
  AND feature_key IN ('finance.receipts', 'finance.payments', 'finance.statements', 'finance.debtors');
```

## How to Get Your School ID

1. Log in to Supabase dashboard
2. Go to SQL Editor
3. Run: `SELECT id, name FROM schools WHERE name LIKE '%school_name%';`
4. Copy the UUID from the `id` column

## Notes

- Finance features (receipts, payments, statements, debtors) are configured to require **Enterprise** plan
- Basic plan only includes fees management
- Pro plan includes basic finance features
- Enterprise plan includes all finance + accounting + payroll features
- After updating the database, clear your browser cache and refresh the page
