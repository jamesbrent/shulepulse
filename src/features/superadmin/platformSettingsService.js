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

export async function fetchPlatformSettings() {
  const { data, error } = await supabase
    .from('platform_settings')
    .select('*')
    .eq('id', 1)
    .single()

  if (error && error.code !== 'PGRST116') throw error
  return data || { id: 1, ...DEFAULT_SETTINGS }
}

export async function updatePlatformSettings(section, values) {
  const update = {}
  update[section] = values
  update.updated_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('platform_settings')
    .upsert({ id: 1, ...update }, { onConflict: 'id' })
    .select()
    .single()

  if (error) throw error
  return data
}

export { DEFAULT_SETTINGS }
