import { useState, useEffect } from 'react'
import {
  Settings, Globe, Palette, CreditCard, Puzzle,
  Shield, MessageSquare, Mail, Wallet, BookOpen,
  Bell, HardDrive, ClipboardList, Link2, Wrench,
  FileText, Save, Loader, Check, Eye, EyeOff,
  ChevronRight, Plus, X, ToggleLeft, ToggleRight,
} from 'lucide-react'
import { fetchPlatformSettings, updatePlatformSettings, DEFAULT_SETTINGS } from '../../features/superadmin/platformSettingsService'
import './PlatformSettingsPage.css'

const SECTIONS = [
  { key: 'general', label: 'General', icon: <Globe size={16} /> },
  { key: 'branding', label: 'Branding', icon: <Palette size={16} /> },
  { key: 'subscription', label: 'Subscription & Billing', icon: <CreditCard size={16} /> },
  { key: 'modules', label: 'Module Management', icon: <Puzzle size={16} /> },
  { key: 'auth_security', label: 'Authentication & Security', icon: <Shield size={16} /> },
  { key: 'sms', label: 'SMS Configuration', icon: <MessageSquare size={16} /> },
  { key: 'email', label: 'Email Configuration', icon: <Mail size={16} /> },
  { key: 'payment_gateways', label: 'Payment Gateways', icon: <Wallet size={16} /> },
  { key: 'academic_defaults', label: 'Academic Defaults', icon: <BookOpen size={16} /> },
  { key: 'notifications', label: 'Notifications', icon: <Bell size={16} /> },
  { key: 'storage_backups', label: 'Storage & Backups', icon: <HardDrive size={16} /> },
  { key: 'audit_logs', label: 'Audit & Logs', icon: <ClipboardList size={16} /> },
  { key: 'api_integrations', label: 'API & Integrations', icon: <Link2 size={16} /> },
  { key: 'maintenance', label: 'Maintenance Mode', icon: <Wrench size={16} /> },
  { key: 'legal', label: 'Legal & Compliance', icon: <FileText size={16} /> },
]

function Field({ label, desc, children }) {
  return (
    <div className="ps-field">
      <div className="ps-field-label">
        <span>{label}</span>
        {desc && <span className="ps-field-desc">{desc}</span>}
      </div>
      <div className="ps-field-control">{children}</div>
    </div>
  )
}

function TextInput({ value, onChange, placeholder, type = 'text', password }) {
  const [show, setShow] = useState(false)
  if (password) {
    return (
      <div className="ps-password-wrap">
        <input type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="ps-input" />
        <button type="button" className="ps-password-toggle" onClick={() => setShow(!show)}>
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
    )
  }
  return <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="ps-input" />
}

function Toggle({ value, onChange, label }) {
  return (
    <button type="button" className={`ps-toggle ${value ? 'on' : ''}`} onClick={() => onChange(!value)} title={label}>
      {value ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
    </button>
  )
}

function Select({ value, onChange, options }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="ps-select">
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

function TagInput({ values, onChange, placeholder }) {
  const [input, setInput] = useState('')
  const add = () => {
    if (input.trim() && !values.includes(input.trim())) {
      onChange([...values, input.trim()])
    }
    setInput('')
  }
  return (
    <div className="ps-tag-wrap">
      <div className="ps-tag-list">
        {values.map((v, i) => (
          <span key={i} className="ps-tag">
            {v}
            <button type="button" onClick={() => onChange(values.filter((_, j) => j !== i))}><X size={12} /></button>
          </span>
        ))}
      </div>
      <div className="ps-tag-input-row">
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }} placeholder={placeholder} className="ps-input" />
        <button type="button" className="ps-tag-add" onClick={add}><Plus size={14} /></button>
      </div>
    </div>
  )
}

export default function PlatformSettingsPage() {
  const [activeSection, setActiveSection] = useState('general')
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      try {
        const data = await fetchPlatformSettings()
        const merged = { ...data }
        for (const [key, defaults] of Object.entries(DEFAULT_SETTINGS)) {
          merged[key] = { ...defaults, ...(data[key] || {}) }
        }
        setSettings(merged)
      } catch (err) {
        showToast(err.message, 'error')
      }
      setLoading(false)
    })()
  }, [])

  const updateField = (section, field, value) => {
    setSettings((prev) => ({
      ...prev,
      [section]: { ...prev[section], [field]: value },
    }))
  }

  const updateNested = (section, parent, field, value) => {
    setSettings((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [parent]: { ...prev[section]?.[parent], [field]: value },
      },
    }))
  }

  const handleSave = async (section) => {
    setSaving(true)
    try {
      await updatePlatformSettings(section, settings[section])
      showToast(`${SECTIONS.find((s) => s.key === section)?.label || section} saved`)
    } catch (err) {
      showToast(err.message, 'error')
    }
    setSaving(false)
  }

  const handleSaveAll = async () => {
    setSaving(true)
    try {
      for (const section of SECTIONS.map((s) => s.key)) {
        await updatePlatformSettings(section, settings[section])
      }
      showToast('All settings saved')
    } catch (err) {
      showToast(err.message, 'error')
    }
    setSaving(false)
  }

  if (loading) {
    return <div className="loading-state" style={{ padding: 80 }}>Loading settings...</div>
  }

  if (!settings) {
    return <div className="loading-state" style={{ padding: 80 }}>Failed to load settings</div>
  }

  const s = settings

  const renderGeneral = () => (
    <>
      <Field label="Platform Name" desc="Displayed in the browser title and emails">
        <TextInput value={s.general.platform_name} onChange={(v) => updateField('general', 'platform_name', v)} placeholder="ShulePulse" />
      </Field>
      <Field label="Company Name" desc="Legal business name">
        <TextInput value={s.general.company_name} onChange={(v) => updateField('general', 'company_name', v)} placeholder="Acme Corp" />
      </Field>
      <Field label="Support Email">
        <TextInput value={s.general.support_email} onChange={(v) => updateField('general', 'support_email', v)} placeholder="support@shulepulse.com" type="email" />
      </Field>
      <Field label="Support Phone">
        <TextInput value={s.general.support_phone} onChange={(v) => updateField('general', 'support_phone', v)} placeholder="+254 700 000 000" />
      </Field>
      <Field label="Website URL">
        <TextInput value={s.general.website_url} onChange={(v) => updateField('general', 'website_url', v)} placeholder="https://shulepulse.com" type="url" />
      </Field>
      <Field label="Default Language">
        <Select value={s.general.default_language} onChange={(v) => updateField('general', 'default_language', v)} options={[{ value: 'en', label: 'English' }, { value: 'sw', label: 'Swahili' }]} />
      </Field>
      <Field label="Default Time Zone">
        <Select value={s.general.default_timezone} onChange={(v) => updateField('general', 'default_timezone', v)} options={[{ value: 'Africa/Nairobi', label: 'Africa/Nairobi (UTC+3)' }, { value: 'Africa/Dar_es_Salaam', label: 'Africa/Dar es Salaam (UTC+3)' }, { value: 'UTC', label: 'UTC' }]} />
      </Field>
      <Field label="Default Currency">
        <TextInput value={s.general.default_currency} onChange={(v) => updateField('general', 'default_currency', v)} placeholder="KES" />
      </Field>
      <Field label="Date Format">
        <Select value={s.general.date_format} onChange={(v) => updateField('general', 'date_format', v)} options={[{ value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' }, { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' }, { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' }]} />
      </Field>
      <Field label="Time Format">
        <Select value={s.general.time_format} onChange={(v) => updateField('general', 'time_format', v)} options={[{ value: '24h', label: '24-hour' }, { value: '12h', label: '12-hour (AM/PM)' }]} />
      </Field>
    </>
  )

  const renderBranding = () => (
    <>
      <Field label="Primary Color" desc="Main brand color used across the platform">
        <div className="ps-color-row">
          <input type="color" value={s.branding.primary_color} onChange={(e) => updateField('branding', 'primary_color', e.target.value)} className="ps-color-input" />
          <TextInput value={s.branding.primary_color} onChange={(v) => updateField('branding', 'primary_color', v)} placeholder="#2563eb" />
        </div>
      </Field>
      <Field label="Secondary Color">
        <div className="ps-color-row">
          <input type="color" value={s.branding.secondary_color} onChange={(e) => updateField('branding', 'secondary_color', e.target.value)} className="ps-color-input" />
          <TextInput value={s.branding.secondary_color} onChange={(v) => updateField('branding', 'secondary_color', v)} placeholder="#16a34a" />
        </div>
      </Field>
      <Field label="Logo URL" desc="URL to the platform logo">
        <TextInput value={s.branding.logo_url} onChange={(v) => updateField('branding', 'logo_url', v)} placeholder="https://example.com/logo.png" />
      </Field>
      <Field label="Login Page Background" desc="Background image URL for the login page">
        <TextInput value={s.branding.login_bg_url} onChange={(v) => updateField('branding', 'login_bg_url', v)} placeholder="https://example.com/bg.jpg" />
      </Field>
    </>
  )

  const renderSubscription = () => (
    <>
      <Field label="Trial Duration (days)" desc="Number of days for free trial">
        <TextInput value={s.subscription.trial_duration_days} onChange={(v) => updateField('subscription', 'trial_duration_days', Number(v))} type="number" />
      </Field>
      <Field label="Grace Period (days)" desc="Days after expiry before suspension">
        <TextInput value={s.subscription.grace_period_days} onChange={(v) => updateField('subscription', 'grace_period_days', Number(v))} type="number" />
      </Field>
      <Field label="Auto Suspension" desc="Automatically suspend schools after grace period">
        <Toggle value={s.subscription.auto_suspension} onChange={(v) => updateField('subscription', 'auto_suspension', v)} />
      </Field>
      <Field label="Auto Renewal" desc="Automatically renew subscriptions">
        <Toggle value={s.subscription.auto_renewal} onChange={(v) => updateField('subscription', 'auto_renewal', v)} />
      </Field>
      <Field label="Tax/VAT Rate (%)" desc="Default tax rate for invoices">
        <TextInput value={s.subscription.tax_rate} onChange={(v) => updateField('subscription', 'tax_rate', Number(v))} type="number" />
      </Field>
      <Field label="Invoice Prefix">
        <TextInput value={s.subscription.invoice_prefix} onChange={(v) => updateField('subscription', 'invoice_prefix', v)} placeholder="INV-" />
      </Field>
      <Field label="Receipt Prefix">
        <TextInput value={s.subscription.receipt_prefix} onChange={(v) => updateField('subscription', 'receipt_prefix', v)} placeholder="RCT-" />
      </Field>
    </>
  )

  const renderModules = () => {
    const MODULES = [
      { key: 'admissions', label: 'Admissions' },
      { key: 'student_management', label: 'Student Management' },
      { key: 'fees', label: 'Fees' },
      { key: 'examinations', label: 'Examinations' },
      { key: 'cbc', label: 'CBC' },
      { key: 'parent_portal', label: 'Parent Portal' },
      { key: 'payroll', label: 'Payroll' },
      { key: 'library', label: 'Library' },
      { key: 'inventory', label: 'Inventory' },
      { key: 'transport', label: 'Transport' },
      { key: 'hostel', label: 'Hostel' },
      { key: 'sms', label: 'SMS' },
      { key: 'notifications', label: 'Notifications' },
    ]
    return (
      <div className="ps-modules-grid">
        {MODULES.map((m) => (
          <label key={m.key} className="ps-module-item">
            <Toggle value={s.modules[m.key]} onChange={(v) => updateField('modules', m.key, v)} />
            <span>{m.label}</span>
          </label>
        ))}
      </div>
    )
  }

  const renderAuthSecurity = () => (
    <>
      <Field label="Minimum Password Length">
        <TextInput value={s.auth_security.min_password_length} onChange={(v) => updateField('auth_security', 'min_password_length', Number(v))} type="number" />
      </Field>
      <Field label="Two-Factor Authentication (2FA)">
        <Toggle value={s.auth_security.two_factor_enabled} onChange={(v) => updateField('auth_security', 'two_factor_enabled', v)} />
      </Field>
      <Field label="Session Timeout (minutes)">
        <TextInput value={s.auth_security.session_timeout_minutes} onChange={(v) => updateField('auth_security', 'session_timeout_minutes', Number(v))} type="number" />
      </Field>
      <Field label="Maximum Login Attempts">
        <TextInput value={s.auth_security.max_login_attempts} onChange={(v) => updateField('auth_security', 'max_login_attempts', Number(v))} type="number" />
      </Field>
      <Field label="Account Lock Duration (minutes)">
        <TextInput value={s.auth_security.account_lock_duration_minutes} onChange={(v) => updateField('auth_security', 'account_lock_duration_minutes', Number(v))} type="number" />
      </Field>
      <Field label="IP Restrictions">
        <Toggle value={s.auth_security.ip_restrictions_enabled} onChange={(v) => updateField('auth_security', 'ip_restrictions_enabled', v)} />
      </Field>
      <Field label="Device Tracking">
        <Toggle value={s.auth_security.device_tracking} onChange={(v) => updateField('auth_security', 'device_tracking', v)} />
      </Field>
    </>
  )

  const renderSms = () => (
    <>
      <Field label="SMS Provider">
        <Select value={s.sms.provider} onChange={(v) => updateField('sms', 'provider', v)} options={[{ value: '', label: 'Select provider...' }, { value: 'africastalking', label: 'Africa\'s Talking' }, { value: 'twilio', label: 'Twilio' }, { value: 'vonage', label: 'Vonage' }]} />
      </Field>
      <Field label="API Key">
        <TextInput value={s.sms.api_key} onChange={(v) => updateField('sms', 'api_key', v)} password />
      </Field>
      <Field label="Sender ID">
        <TextInput value={s.sms.sender_id} onChange={(v) => updateField('sms', 'sender_id', v)} placeholder="ShulePulse" />
      </Field>
      <Field label="Test Recipient" desc="Phone number for test SMS">
        <TextInput value={s.sms.test_recipient} onChange={(v) => updateField('sms', 'test_recipient', v)} placeholder="+254700000000" />
      </Field>
      <Field label="SMS Balance" desc="Current SMS credit balance">
        <TextInput value={s.sms.sms_balance} onChange={(v) => updateField('sms', 'sms_balance', Number(v))} type="number" />
      </Field>
    </>
  )

  const renderEmail = () => (
    <>
      <Field label="SMTP Host">
        <TextInput value={s.email.smtp_host} onChange={(v) => updateField('email', 'smtp_host', v)} placeholder="smtp.example.com" />
      </Field>
      <Field label="SMTP Port">
        <TextInput value={s.email.smtp_port} onChange={(v) => updateField('email', 'smtp_port', Number(v))} type="number" placeholder="587" />
      </Field>
      <Field label="Email Username">
        <TextInput value={s.email.email_username} onChange={(v) => updateField('email', 'email_username', v)} placeholder="noreply@shulepulse.com" />
      </Field>
      <Field label="Email Password">
        <TextInput value={s.email.email_password} onChange={(v) => updateField('email', 'email_password', v)} password />
      </Field>
      <Field label="Sender Email">
        <TextInput value={s.email.sender_email} onChange={(v) => updateField('email', 'sender_email', v)} placeholder="noreply@shulepulse.com" type="email" />
      </Field>
      <Field label="Sender Name">
        <TextInput value={s.email.sender_name} onChange={(v) => updateField('email', 'sender_name', v)} placeholder="ShulePulse" />
      </Field>
      <Field label="Test Recipient" desc="Email address for test emails">
        <TextInput value={s.email.test_recipient} onChange={(v) => updateField('email', 'test_recipient', v)} placeholder="admin@example.com" type="email" />
      </Field>
    </>
  )

  const renderPaymentGateways = () => (
    <>
      <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#92400e', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <Shield size={16} style={{ marginTop: 2, flexShrink: 0 }} />
        <div><strong>Security Notice:</strong> API keys and secrets are stored in the database. Ensure your Supabase project has Row Level Security enforced and restrict access to platform_settings to superadmin only. Consider migrating sensitive keys to Supabase Vault for production use.</div>
      </div>
      <h4 className="ps-subsection">M-Pesa</h4>
      <Field label="Consumer Key">
        <TextInput value={s.payment_gateways.mpesa_consumer_key} onChange={(v) => updateField('payment_gateways', 'mpesa_consumer_key', v)} password />
      </Field>
      <Field label="Consumer Secret">
        <TextInput value={s.payment_gateways.mpesa_consumer_secret} onChange={(v) => updateField('payment_gateways', 'mpesa_consumer_secret', v)} password />
      </Field>
      <Field label="Paybill Number">
        <TextInput value={s.payment_gateways.mpesa_paybill} onChange={(v) => updateField('payment_gateways', 'mpesa_paybill', v)} placeholder="123456" />
      </Field>
      <Field label="Till Number">
        <TextInput value={s.payment_gateways.mpesa_till} onChange={(v) => updateField('payment_gateways', 'mpesa_till', v)} placeholder="123456" />
      </Field>
      <Field label="Callback URL">
        <TextInput value={s.payment_gateways.mpesa_callback_url} onChange={(v) => updateField('payment_gateways', 'mpesa_callback_url', v)} placeholder="https://api.shulepulse.com/mpesa/callback" />
      </Field>

      <h4 className="ps-subsection">Bank Payments</h4>
      <Field label="Bank Name">
        <TextInput value={s.payment_gateways.bank_name} onChange={(v) => updateField('payment_gateways', 'bank_name', v)} />
      </Field>
      <Field label="Account Number">
        <TextInput value={s.payment_gateways.bank_account} onChange={(v) => updateField('payment_gateways', 'bank_account', v)} />
      </Field>
      <Field label="Branch">
        <TextInput value={s.payment_gateways.bank_branch} onChange={(v) => updateField('payment_gateways', 'bank_branch', v)} />
      </Field>

      <h4 className="ps-subsection">Other Payment Providers</h4>
      <Field label="Stripe">
        <Toggle value={s.payment_gateways.stripe_enabled} onChange={(v) => updateField('payment_gateways', 'stripe_enabled', v)} />
      </Field>
      {s.payment_gateways.stripe_enabled && (
        <>
          <Field label="Stripe Publishable Key">
            <TextInput value={s.payment_gateways.stripe_publishable_key} onChange={(v) => updateField('payment_gateways', 'stripe_publishable_key', v)} password />
          </Field>
          <Field label="Stripe Secret Key">
            <TextInput value={s.payment_gateways.stripe_secret_key} onChange={(v) => updateField('payment_gateways', 'stripe_secret_key', v)} password />
          </Field>
        </>
      )}
      <Field label="Flutterwave">
        <Toggle value={s.payment_gateways.flutterwave_enabled} onChange={(v) => updateField('payment_gateways', 'flutterwave_enabled', v)} />
      </Field>
      {s.payment_gateways.flutterwave_enabled && (
        <>
          <Field label="Flutterwave Public Key">
            <TextInput value={s.payment_gateways.flutterwave_public_key} onChange={(v) => updateField('payment_gateways', 'flutterwave_public_key', v)} password />
          </Field>
          <Field label="Flutterwave Secret Key">
            <TextInput value={s.payment_gateways.flutterwave_secret_key} onChange={(v) => updateField('payment_gateways', 'flutterwave_secret_key', v)} password />
          </Field>
        </>
      )}
      <Field label="Pesapal">
        <Toggle value={s.payment_gateways.pesapal_enabled} onChange={(v) => updateField('payment_gateways', 'pesapal_enabled', v)} />
      </Field>
      {s.payment_gateways.pesapal_enabled && (
        <>
          <Field label="Pesapal Consumer Key">
            <TextInput value={s.payment_gateways.pesapal_consumer_key} onChange={(v) => updateField('payment_gateways', 'pesapal_consumer_key', v)} password />
          </Field>
          <Field label="Pesapal Consumer Secret">
            <TextInput value={s.payment_gateways.pesapal_consumer_secret} onChange={(v) => updateField('payment_gateways', 'pesapal_consumer_secret', v)} password />
          </Field>
        </>
      )}
    </>
  )

  const renderAcademicDefaults = () => (
    <>
      <Field label="Default Academic Year">
        <TextInput value={s.academic_defaults.academic_year} onChange={(v) => updateField('academic_defaults', 'academic_year', v)} placeholder="2026" />
      </Field>
      <Field label="Number of Terms">
        <TextInput value={s.academic_defaults.number_of_terms} onChange={(v) => updateField('academic_defaults', 'number_of_terms', Number(v))} type="number" />
      </Field>
      <Field label="Default Grading System">
        <Select value={s.academic_defaults.default_grading_system} onChange={(v) => updateField('academic_defaults', 'default_grading_system', v)} options={[{ value: 'A-F', label: 'A-F' }, { value: 'Percentage', label: 'Percentage' }, { value: 'CBC', label: 'CBC' }]} />
      </Field>
      <Field label="CBC Enabled">
        <Toggle value={s.academic_defaults.cbc_enabled} onChange={(v) => updateField('academic_defaults', 'cbc_enabled', v)} />
      </Field>
      <Field label="Default Class Structure" desc="Comma-separated list of default classes">
        <TextInput value={s.academic_defaults.default_class_structure} onChange={(v) => updateField('academic_defaults', 'default_class_structure', v)} placeholder="PP1,PP2,Grade1-Grade6" />
      </Field>
      <Field label="Default Fee Categories" desc="Comma-separated list">
        <TextInput value={s.academic_defaults.default_fee_categories} onChange={(v) => updateField('academic_defaults', 'default_fee_categories', v)} placeholder="Tuition,Transport,Lunch,Books" />
      </Field>
    </>
  )

  const renderNotifications = () => (
    <>
      <Field label="Email Notifications">
        <Toggle value={s.notifications.email_enabled} onChange={(v) => updateField('notifications', 'email_enabled', v)} />
      </Field>
      <Field label="SMS Notifications">
        <Toggle value={s.notifications.sms_enabled} onChange={(v) => updateField('notifications', 'sms_enabled', v)} />
      </Field>
      <Field label="Push Notifications">
        <Toggle value={s.notifications.push_enabled} onChange={(v) => updateField('notifications', 'push_enabled', v)} />
      </Field>
      <Field label="In-App Notifications">
        <Toggle value={s.notifications.in_app_enabled} onChange={(v) => updateField('notifications', 'in_app_enabled', v)} />
      </Field>
      <h4 className="ps-subsection">Notification Events</h4>
      {Object.entries(s.notifications.events || {}).map(([key, val]) => (
        <Field key={key} label={key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}>
          <Toggle value={val} onChange={(v) => updateNested('notifications', 'events', key, v)} />
        </Field>
      ))}
    </>
  )

  const renderStorageBackups = () => (
    <>
      <Field label="Automatic Backups">
        <Toggle value={s.storage_backups.auto_backup} onChange={(v) => updateField('storage_backups', 'auto_backup', v)} />
      </Field>
      <Field label="Backup Frequency">
        <Select value={s.storage_backups.backup_frequency} onChange={(v) => updateField('storage_backups', 'backup_frequency', v)} options={[{ value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }]} />
      </Field>
      <Field label="Backup Retention (days)">
        <TextInput value={s.storage_backups.backup_retention_days} onChange={(v) => updateField('storage_backups', 'backup_retention_days', Number(v))} type="number" />
      </Field>
      <Field label="Storage Limit (MB)" desc="Total storage per school">
        <TextInput value={s.storage_backups.storage_limit_mb} onChange={(v) => updateField('storage_backups', 'storage_limit_mb', Number(v))} type="number" />
      </Field>
      <Field label="File Upload Limit (MB)">
        <TextInput value={s.storage_backups.file_upload_limit_mb} onChange={(v) => updateField('storage_backups', 'file_upload_limit_mb', Number(v))} type="number" />
      </Field>
    </>
  )

  const renderAuditLogs = () => (
    <>
      <Field label="User Activity Logs">
        <Toggle value={s.audit_logs.user_activity} onChange={(v) => updateField('audit_logs', 'user_activity', v)} />
      </Field>
      <Field label="System Logs">
        <Toggle value={s.audit_logs.system_logs} onChange={(v) => updateField('audit_logs', 'system_logs', v)} />
      </Field>
      <Field label="Error Logs">
        <Toggle value={s.audit_logs.error_logs} onChange={(v) => updateField('audit_logs', 'error_logs', v)} />
      </Field>
      <Field label="Login Logs">
        <Toggle value={s.audit_logs.login_logs} onChange={(v) => updateField('audit_logs', 'login_logs', v)} />
      </Field>
      <Field label="Payment Logs">
        <Toggle value={s.audit_logs.payment_logs} onChange={(v) => updateField('audit_logs', 'payment_logs', v)} />
      </Field>
      <Field label="Data Export Logs">
        <Toggle value={s.audit_logs.data_export_logs} onChange={(v) => updateField('audit_logs', 'data_export_logs', v)} />
      </Field>
      <Field label="Log Retention" desc="How long to retain logs">
        <Select value={String(s.audit_logs.retention_days)} onChange={(v) => updateField('audit_logs', 'retention_days', Number(v))} options={[{ value: '30', label: '30 Days' }, { value: '90', label: '90 Days' }, { value: '365', label: '1 Year' }, { value: '-1', label: 'Forever' }]} />
      </Field>
    </>
  )

  const renderApiIntegrations = () => (
    <>
      <Field label="Developer Access" desc="Allow API access for developers">
        <Toggle value={s.api_integrations.developer_access} onChange={(v) => updateField('api_integrations', 'developer_access', v)} />
      </Field>
      <Field label="API Keys" desc="Manage API keys for third-party services">
        <TagInput values={s.api_integrations.api_keys} onChange={(v) => updateField('api_integrations', 'api_keys', v)} placeholder="Enter API key and press Enter" />
      </Field>
      <Field label="Webhook URLs" desc="URLs to receive webhook events">
        <TagInput values={s.api_integrations.webhooks} onChange={(v) => updateField('api_integrations', 'webhooks', v)} placeholder="Enter webhook URL and press Enter" />
      </Field>
    </>
  )

  const renderMaintenance = () => (
    <>
      <Field label="Enable Maintenance Mode">
        <Toggle value={s.maintenance.enabled} onChange={(v) => updateField('maintenance', 'enabled', v)} />
      </Field>
      {s.maintenance.enabled && (
        <>
          <Field label="Maintenance Message" desc="Shown to users during maintenance">
            <textarea value={s.maintenance.message} onChange={(e) => updateField('maintenance', 'message', e.target.value)} className="ps-textarea" rows={3} />
          </Field>
          <Field label="Allowed IPs" desc="IPs that can access the platform during maintenance">
            <TagInput values={s.maintenance.allowed_ips} onChange={(v) => updateField('maintenance', 'allowed_ips', v)} placeholder="Enter IP and press Enter" />
          </Field>
        </>
      )}
    </>
  )

  const renderLegal = () => (
    <>
      <Field label="Terms of Service" desc="URL or markdown content">
        <textarea value={s.legal.terms_of_service} onChange={(e) => updateField('legal', 'terms_of_service', e.target.value)} className="ps-textarea" rows={4} placeholder="https://shulepulse.com/terms" />
      </Field>
      <Field label="Privacy Policy">
        <textarea value={s.legal.privacy_policy} onChange={(e) => updateField('legal', 'privacy_policy', e.target.value)} className="ps-textarea" rows={4} placeholder="https://shulepulse.com/privacy" />
      </Field>
      <Field label="Cookie Policy">
        <textarea value={s.legal.cookie_policy} onChange={(e) => updateField('legal', 'cookie_policy', e.target.value)} className="ps-textarea" rows={4} placeholder="https://shulepulse.com/cookies" />
      </Field>
      <Field label="Data Retention Policy">
        <textarea value={s.legal.data_retention_policy} onChange={(e) => updateField('legal', 'data_retention_policy', e.target.value)} className="ps-textarea" rows={4} />
      </Field>
      <Field label="User Agreement">
        <textarea value={s.legal.user_agreement} onChange={(e) => updateField('legal', 'user_agreement', e.target.value)} className="ps-textarea" rows={4} />
      </Field>
    </>
  )

  const renderSection = () => {
    switch (activeSection) {
      case 'general': return renderGeneral()
      case 'branding': return renderBranding()
      case 'subscription': return renderSubscription()
      case 'modules': return renderModules()
      case 'auth_security': return renderAuthSecurity()
      case 'sms': return renderSms()
      case 'email': return renderEmail()
      case 'payment_gateways': return renderPaymentGateways()
      case 'academic_defaults': return renderAcademicDefaults()
      case 'notifications': return renderNotifications()
      case 'storage_backups': return renderStorageBackups()
      case 'audit_logs': return renderAuditLogs()
      case 'api_integrations': return renderApiIntegrations()
      case 'maintenance': return renderMaintenance()
      case 'legal': return renderLegal()
      default: return renderGeneral()
    }
  }

  return (
    <div className="ps-root">
      <div className="ps-sidebar">
        <div className="ps-sidebar-header">
          <Settings size={16} />
          <span>Sections</span>
        </div>
        <nav className="ps-nav">
          {SECTIONS.map((section) => (
            <button
              key={section.key}
              className={`ps-nav-item ${activeSection === section.key ? 'active' : ''}`}
              onClick={() => setActiveSection(section.key)}
            >
              <span className="ps-nav-icon">{section.icon}</span>
              <span className="ps-nav-label">{section.label}</span>
              <ChevronRight size={14} className="ps-nav-chevron" />
            </button>
          ))}
        </nav>
      </div>

      <div className="ps-content">
        <div className="ps-content-header">
          <div>
            <h2>{SECTIONS.find((s) => s.key === activeSection)?.label}</h2>
            <p className="text-muted">
              {activeSection === 'general' && 'Configure basic platform information'}
              {activeSection === 'branding' && 'Manage the global ShulePulse brand'}
              {activeSection === 'subscription' && 'Manage SaaS billing rules'}
              {activeSection === 'modules' && 'Enable or disable modules platform-wide'}
              {activeSection === 'auth_security' && 'Control platform security'}
              {activeSection === 'sms' && 'Configure SMS services'}
              {activeSection === 'email' && 'Configure email services'}
              {activeSection === 'payment_gateways' && 'Manage payment integrations'}
              {activeSection === 'academic_defaults' && 'Default settings for newly created schools'}
              {activeSection === 'notifications' && 'Control system notifications'}
              {activeSection === 'storage_backups' && 'Manage data safety'}
              {activeSection === 'audit_logs' && 'Configure logging'}
              {activeSection === 'api_integrations' && 'Manage external services'}
              {activeSection === 'maintenance' && 'Platform administration tools'}
              {activeSection === 'legal' && 'Manage legal documents'}
            </p>
          </div>
          <div className="ps-content-actions">
            <button className="btn-secondary" onClick={handleSaveAll} disabled={saving}>
              {saving ? <Loader size={14} className="spin" /> : <Save size={14} />}
              Save All
            </button>
            <button className="btn-primary" onClick={() => handleSave(activeSection)} disabled={saving}>
              {saving ? <Loader size={14} className="spin" /> : <Save size={14} />}
              Save Section
            </button>
          </div>
        </div>

        <div className="ps-form">
          {renderSection()}
        </div>
      </div>

      {toast && (
        <div className="onboard-toast" style={{ background: toast.type === 'error' ? '#ef4444' : '#16a34a' }}>
          <Check size={16} /> {toast.msg}
        </div>
      )}
    </div>
  )
}
