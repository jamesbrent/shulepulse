import { supabase } from '../../lib/supabase'

const DEFAULT_SETTINGS = {
  general: {
    platform_name: 'ShulePulse',
    logo_url: '',
    favicon_url: '',
    company_name: '',
    support_email: '',
    support_phone: '',
    website_url: '',
    default_language: 'en',
    default_timezone: 'Africa/Nairobi',
    default_currency: 'KES',
    date_format: 'DD/MM/YYYY',
    time_format: '24h',
  },
  branding: {
    logo_url: '',
    login_bg_url: '',
    primary_color: '#2563eb',
    secondary_color: '#16a34a',
    email_template: '',
    sms_template: '',
    report_header: '',
    footer_text: '',
  },
  subscription: {
    trial_duration_days: 14,
    grace_period_days: 7,
    auto_suspension: true,
    auto_renewal: true,
    tax_rate: 16,
    invoice_prefix: 'INV-',
    receipt_prefix: 'RCT-',
  },
  modules: {
    admissions: true,
    student_management: true,
    fees: true,
    examinations: true,
    cbc: true,
    parent_portal: true,
    payroll: false,
    library: false,
    inventory: false,
    transport: false,
    hostel: false,
    sms: false,
    notifications: true,
  },
  auth_security: {
    min_password_length: 8,
    two_factor_enabled: false,
    session_timeout_minutes: 60,
    max_login_attempts: 5,
    account_lock_duration_minutes: 30,
    ip_restrictions_enabled: false,
    ip_restrictions: [],
    device_tracking: false,
  },
  sms: {
    provider: '',
    api_key: '',
    sender_id: 'ShulePulse',
    test_recipient: '',
    sms_balance: 0,
    default_template: '',
  },
  email: {
    smtp_host: '',
    smtp_port: 587,
    email_username: '',
    email_password: '',
    sender_email: '',
    sender_name: 'ShulePulse',
    test_recipient: '',
  },
  payment_gateways: {
    mpesa_consumer_key: '',
    mpesa_consumer_secret: '',
    mpesa_paybill: '',
    mpesa_till: '',
    mpesa_callback_url: '',
    bank_name: '',
    bank_account: '',
    bank_branch: '',
    stripe_enabled: false,
    stripe_publishable_key: '',
    stripe_secret_key: '',
    flutterwave_enabled: false,
    flutterwave_public_key: '',
    flutterwave_secret_key: '',
    pesapal_enabled: false,
    pesapal_consumer_key: '',
    pesapal_consumer_secret: '',
  },
  academic_defaults: {
    academic_year: new Date().getFullYear().toString(),
    number_of_terms: 3,
    default_grading_system: 'A-F',
    cbc_enabled: false,
    default_class_structure: 'PP1,PP2,Grade1-Grade6',
    default_fee_categories: 'Tuition,Transport,Lunch,Books',
  },
  notifications: {
    email_enabled: true,
    sms_enabled: false,
    push_enabled: false,
    in_app_enabled: true,
    events: {
      new_school_registration: true,
      subscription_expiry: true,
      payment_received: true,
      failed_payment: true,
      support_ticket: true,
      system_error: true,
    },
  },
  storage_backups: {
    auto_backup: true,
    backup_frequency: 'daily',
    backup_retention_days: 30,
    storage_limit_mb: 10240,
    file_upload_limit_mb: 50,
  },
  audit_logs: {
    user_activity: true,
    system_logs: true,
    error_logs: true,
    login_logs: true,
    payment_logs: true,
    data_export_logs: true,
    retention_days: 90,
  },
  api_integrations: {
    api_keys: [],
    webhooks: [],
    third_party_integrations: {},
    developer_access: false,
  },
  maintenance: {
    enabled: false,
    message: 'ShulePulse is under scheduled maintenance. Please check back shortly.',
    allowed_ips: [],
  },
  legal: {
    terms_of_service: '',
    privacy_policy: '',
    cookie_policy: '',
    data_retention_policy: '',
    user_agreement: '',
  },
  tenant_defaults: {
    default_modules: ['admissions', 'student_management', 'fees', 'examinations', 'parent_portal', 'notifications'],
    default_grading_system: 'A-F',
    default_fee_categories: ['Tuition', 'Transport', 'Lunch', 'Books'],
    default_roles: ['admin', 'teacher', 'parent'],
    default_branding: {},
    default_storage_quota_mb: 5120,
    default_trial_period_days: 14,
  },
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

// Deep merge: DB values override defaults, null/undefined fall back to
// defaults, and object defaults are never replaced by scalars/arrays so
// every section always exposes every field the UI expects.
function deepMergeSection(defaults, overrides) {
  const merged = { ...defaults }
  if (!isPlainObject(overrides)) return merged
  for (const [key, dbValue] of Object.entries(overrides)) {
    const defaultValue = merged[key]
    if (isPlainObject(defaultValue) && isPlainObject(dbValue)) {
      merged[key] = deepMergeSection(defaultValue, dbValue)
    } else if (
      dbValue !== null &&
      dbValue !== undefined &&
      !(isPlainObject(defaultValue) && Array.isArray(dbValue)) &&
      !(Array.isArray(defaultValue) && isPlainObject(dbValue))
    ) {
      merged[key] = dbValue
    }
  }
  return merged
}

export async function fetchPlatformSettings() {
  // Use masked RPC to prevent secrets from reaching the browser (VULN-49)
  const { data, error } = await supabase.rpc('get_platform_settings_safe')
  if (error && error.code !== 'PGRST116') throw error

  const dbSettings = isPlainObject(data) ? data : {}
  const merged = {}
  for (const [section, defaults] of Object.entries(DEFAULT_SETTINGS)) {
    merged[section] = deepMergeSection(defaults, dbSettings[section])
  }
  return { id: dbSettings.id || 1, ...merged }
}

export async function fetchMaintenanceStatus() {
  // Public RPC: returns { enabled, message } for ANY visitor (anon + authed),
  // so the App/Login gates can actually fire for non-superadmins (BUG FIX:
  // previously the flag was only readable by superadmins and everyone else
  // fell back to the defaults => maintenance was never enforced).
  const { data, error } = await supabase.rpc('get_maintenance_status')
  if (error || !data || typeof data !== 'object') {
    return {
      enabled: false,
      message: DEFAULT_SETTINGS.maintenance.message,
      session_timeout_minutes: null,
    }
  }
  return {
    enabled: !!data.enabled,
    message: data.message || DEFAULT_SETTINGS.maintenance.message,
    session_timeout_minutes: Number.isFinite(Number(data.session_timeout_minutes))
      ? Number(data.session_timeout_minutes)
      : null,
  }
}

export async function updatePlatformSettings(section, values) {
  // Use safe RPC that strips masked values before saving (VULN-49)
  const { data, error } = await supabase.rpc('update_platform_settings_safe', {
    p_section: section,
    p_values: values,
  })
  if (error) throw error
  return data
}

export { DEFAULT_SETTINGS }
