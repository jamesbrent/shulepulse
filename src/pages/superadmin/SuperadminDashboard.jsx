import { useState, useEffect, useRef } from 'react'
import {
  LayoutDashboard, School, CreditCard, Users,
  TrendingUp, TrendingDown, Settings, LogOut, Plus,
  Building2, Download, CheckCircle,
  DollarSign, History, MessageSquare, Menu, X, ListTree,
  ChevronDown, ArrowRight, Scale
} from 'lucide-react'
import logoImg from '../../assets/logo.png'
import {
  BarChart, Bar, ComposedChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import { supabase } from '../../lib/supabase'
import AvatarUpload from '../../components/AvatarUpload'
import { basePath } from '../../lib/paths'
import './SuperadminDashboard.css'
import RoleSwitcher from '../../components/RoleSwitcher'
import SchoolsPage from './SchoolsPage'
import './SchoolsPage.css'
import BillingPage from './BillingPage'
import './BillingPage.css'
import UsersPage from './UsersPage'
import './UsersPage.css'
import AnalyticsPage from './AnalyticsPage'
import './AnalyticsPage.css'
import PlatformSettingsPage from './PlatformSettingsPage'
import './PlatformSettingsPage.css'
import AuditLogsPage from './AuditLogsPage'
import './AuditLogsPage.css'
import SupportPage from './SupportPage'
import './SupportPage.css'
import SchoolCategoriesPage from './SchoolCategoriesPage'
import './SchoolCategoriesPage.css'
import PlanManagementPage from './PlanManagementPage'
import './PlanManagementPage.css'
import LegalDocumentsPage from './LegalDocumentsPage'
import './LegalDocumentsPage.css'
import OnboardSchoolModal from '../../features/onboarding/OnboardSchoolModal'
import '../../features/onboarding/OnboardSchoolModal.css'
import { fetchDashboardStats } from '../../features/superadmin/dashboardService'
import { fetchRecentPayments } from '../../features/superadmin/paymentService'
import { formatCurrency, formatCompactCurrency } from '../../lib/format'
import { useAuthStore } from '../../store/authStore'

const PLAN_META = [
  { key: 'basic', label: 'Basic', color: '#334155' },
  { key: 'pro', label: 'Pro', color: 'var(--color-primary)' },
  { key: 'enterprise', label: 'Enterprise', color: 'var(--color-secondary)' },
]

export default function SuperadminDashboard() {
  const [activeNav, setActiveNav] = useState('dashboard')
  const [schools, setSchools] = useState([])
  const [stats, setStats] = useState(null)
  const [recentPayments, setRecentPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [showOnboard, setShowOnboard] = useState(false)
  const [toast, setToast] = useState(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [showSchoolPicker, setShowSchoolPicker] = useState(false)
  const [platformAge, setPlatformAge] = useState(0)
  const schoolPickerRef = useRef(null)
  const { selectSchool } = useAuthStore()

  useEffect(() => {
    let active = true

    Promise.all([
      fetchDashboardStats(),
      supabase.from('schools').select('*', { count: 'exact' }).order('created_at', { ascending: false }),
      fetchRecentPayments(8),
    ])
      .then(([statsData, schoolsData, paymentsData]) => {
        if (!active) return
        setStats(statsData)
        setSchools(schoolsData.data || [])
        setRecentPayments(paymentsData || [])
        const list = schoolsData.data || []
        setPlatformAge(list.length > 0 && list[list.length - 1].created_at
          ? Math.max(1, Math.ceil((Date.now() - new Date(list[list.length - 1].created_at).getTime()) / (30 * 24 * 60 * 60 * 1000)))
          : 0)
        setLoading(false)
      })
      .catch((err) => {
        console.error('[Dashboard] load error:', err)
        if (active) setLoading(false)
      })

    return () => { active = false }
  }, [])

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3500)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.assign(basePath('/'))
  }

  const goToSchool = async (school) => {
    await selectSchool(school)
    window.location.assign(basePath('/admin'))
  }

  useEffect(() => {
    if (!showSchoolPicker) return
    const handler = (e) => { if (schoolPickerRef.current && !schoolPickerRef.current.contains(e.target)) setShowSchoolPicker(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showSchoolPicker])

  const handleExport = () => {
    const headers = ['Name', 'County', 'Type', 'Plan', 'Status', 'Phone', 'Email', 'Address']
    const rows = schools.map((s) => [
      s.name, s.county, s.type, s.plan, s.status, s.phone, s.email, s.address,
    ])
    const csv = [headers.join(','), ...rows.map((r) => r.map((v) => `"${v || ''}"`).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `schools_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    showToast('Schools exported as CSV')
  }

  const navItems = [
    { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={16} /> },
    { key: 'schools', label: 'All Schools', icon: <School size={16} /> },
    { key: 'billing', label: 'Billing', icon: <CreditCard size={16} /> },
    { key: 'plans', label: 'Plan Management', icon: <ListTree size={16} /> },
    { key: 'users', label: 'Users', icon: <Users size={16} /> },
    { key: 'audit', label: 'Audit Logs', icon: <History size={16} /> },
    { key: 'support', label: 'Support', icon: <MessageSquare size={16} /> },
    { key: 'analytics', label: 'Payments', icon: <TrendingUp size={16} /> },
    { key: 'categories', label: 'Categories', icon: <ListTree size={16} /> },
    { key: 'settings', label: 'Platform Settings', icon: <Settings size={16} /> },
    { key: 'legal', label: 'Legal Documents', icon: <Scale size={16} /> },
  ]

  const pageTitles = {
    dashboard: 'Platform Overview',
    schools: 'All Schools',
    billing: 'Billing',
    plans: 'Plan Management',
    users: 'Users',
    audit: 'Audit Logs',
    support: 'Support',
    analytics: 'Payments',
    categories: 'School Categories',
    settings: 'Platform Settings',
    legal: 'Legal Documents',
  }

  const renderContent = () => {
    switch (activeNav) {
      case 'schools': return <SchoolsPage onOnboard={() => setShowOnboard(true)} />
      case 'billing': return <BillingPage />
      case 'plans': return <PlanManagementPage />
      case 'users': return <UsersPage />
      case 'audit': return <AuditLogsPage />
      case 'support': return <SupportPage />
      case 'analytics': return <AnalyticsPage />
      case 'categories': return <SchoolCategoriesPage />
      case 'settings': return <PlatformSettingsPage />
      case 'legal': return <LegalDocumentsPage />
      default: return renderDashboard()
    }
  }

  const renderDashboard = () => {
    if (loading) return <div className="loading-state">Loading platform data...</div>
    if (!stats) return <div className="loading-state">Failed to load data</div>

    let runningTotal = 0
    const schoolGrowthData = (stats.schoolGrowth || []).map((g) => {
      runningTotal += g.count
      return { month: g.month, new: g.count, total: runningTotal }
    })

    const revenueData = stats.monthlyRevenue || []
    const revenueTrend = stats.revenueTrend

    const maxPlanCount = Math.max(1, ...Object.values(stats.planCounts || {}))
    const recentOnboardings = schools.slice(0, 6)

    const relativeDay = (iso) => {
      if (!iso) return ''
      const d = new Date(iso)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate())
      const dayDiff = Math.round((today - start) / 86400000)
      if (dayDiff === 0) return 'Onboarded today'
      if (dayDiff === 1) return 'Onboarded yesterday'
      return `Onboarded ${d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}`
    }

    return (
      <div className="dash-content">

        <div className="dash-kpis">
          <div className="dash-kpi dash-kpi--primary">
            <span className="dash-kpi-label">Total Schools</span>
            <span className="dash-kpi-value">{stats.totalSchools.toLocaleString()}</span>
            <span className="dash-kpi-sub">{stats.activeSchools} active · {stats.trialSchools} trial</span>
            <div className="dash-plans">
              {PLAN_META.map((p) => {
                const count = stats.planCounts?.[p.key] || 0
                return (
                  <div key={p.key} className="dash-plan">
                    <span className="dash-plan-label">{p.label}</span>
                    <div className="dash-plan-track">
                      <div className="dash-plan-fill" style={{ width: `${(count / maxPlanCount) * 100}%`, background: p.color }} />
                    </div>
                    <span className="dash-plan-count">{count}</span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="dash-kpi">
            <span className="dash-kpi-label">Total Students</span>
            <span className="dash-kpi-value">{stats.totalStudents.toLocaleString()}</span>
            <span className="dash-kpi-sub">{stats.activeStudents.toLocaleString()} active</span>
          </div>

          <div className="dash-kpi">
            <span className="dash-kpi-label">Total Teachers</span>
            <span className="dash-kpi-value">{stats.totalTeachers.toLocaleString()}</span>
            <span className="dash-kpi-sub">
              {stats.totalSchools > 0 ? `${Math.round(stats.totalTeachers / stats.totalSchools)} per school` : 'Across the platform'}
            </span>
          </div>

          <div className="dash-kpi dash-kpi--revenue">
            <span className="dash-kpi-label">Monthly Recurring Revenue</span>
            <span className="dash-kpi-value">{formatCurrency(stats.mrr)}</span>
            <span className="dash-kpi-sub">
              {stats.totalSchools > 0 ? `Subscriptions · ${formatCurrency(stats.arpu)}/school avg` : 'No active subscriptions'}
            </span>
          </div>
        </div>

        <div className="dash-insights">
          <div className="dash-insight">
            <span className="dash-insight-label">Total Revenue</span>
            <span className="dash-insight-value">{formatCurrency(stats.totalRevenue)}</span>
            {revenueTrend && revenueTrend.pct !== null && revenueTrend.pct !== 0 ? (
              <span className={`dash-insight-sub ${revenueTrend.pct >= 0 ? 'up' : 'down'}`}>
                {revenueTrend.pct >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {Math.abs(revenueTrend.pct)}% vs previous month
              </span>
            ) : (
              <span className="dash-insight-sub">All-time fee payments</span>
            )}
          </div>
          <div className="dash-insight">
            <span className="dash-insight-label">Total Users</span>
            <span className="dash-insight-value">{stats.totalProfiles.toLocaleString()}</span>
            <span className="dash-insight-sub">Accounts on the platform</span>
          </div>
          <div className="dash-insight">
            <span className="dash-insight-label">Parents on Portal</span>
            <span className="dash-insight-value">{stats.totalParents.toLocaleString()}</span>
            <span className="dash-insight-sub">Registered parent accounts</span>
          </div>
          <div className="dash-insight">
            <span className="dash-insight-label">Platform Age</span>
            <span className="dash-insight-value">{platformAge} mos</span>
            <span className="dash-insight-sub">Since first school onboarded</span>
          </div>
        </div>

        <div className="dash-charts">
          <div className="super-card dash-card">
            <div className="card-header dash-card-header">
              <div>
                <h3>Revenue by Month</h3>
                <p className="dash-card-sub">Fee payments collected per month</p>
              </div>
              {revenueTrend && revenueTrend.pct !== null && (
                <span className={`dash-tag ${revenueTrend.pct >= 0 ? 'up' : 'down'}`}>
                  {revenueTrend.pct >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  {Math.abs(revenueTrend.pct)}% MoM
                </span>
              )}
            </div>
            {revenueData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={revenueData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                  <XAxis dataKey="month" fontSize={11} tickLine={false} axisLine={false} tickMargin={10} tick={{ fill: '#64748b' }} />
                  <YAxis fontSize={11} tickLine={false} axisLine={false} width={72} tickFormatter={formatCompactCurrency} tick={{ fill: '#64748b' }} />
                  <Tooltip
                    cursor={{ fill: '#f8fafc' }}
                    formatter={(value) => [formatCurrency(value), 'Revenue']}
                    labelStyle={{ fontWeight: 600, color: '#0f172a' }}
                    contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}
                  />
                  <Bar dataKey="amount" fill="var(--color-primary)" radius={[4, 4, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="empty-state">No payment records yet</p>}
          </div>

          <div className="super-card dash-card">
            <div className="card-header dash-card-header">
              <div>
                <h3>School Growth</h3>
                <p className="dash-card-sub">Schools onboarded over time</p>
              </div>
              {stats.newSchoolsThisMonth > 0 && (
                <span className="dash-tag up">+{stats.newSchoolsThisMonth} this month</span>
              )}
            </div>
            {schoolGrowthData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={schoolGrowthData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                  <XAxis dataKey="month" fontSize={11} tickLine={false} axisLine={false} tickMargin={10} tick={{ fill: '#64748b' }} />
                  <YAxis yAxisId="left" fontSize={11} tickLine={false} axisLine={false} width={28} allowDecimals={false} tick={{ fill: '#64748b' }} />
                  <YAxis yAxisId="right" orientation="right" fontSize={11} tickLine={false} axisLine={false} width={32} allowDecimals={false} tick={{ fill: '#64748b' }} />
                  <Tooltip
                    cursor={{ fill: '#f8fafc' }}
                    formatter={(value, name) => [Number(value).toLocaleString('en-KE'), name]}
                    labelStyle={{ fontWeight: 600, color: '#0f172a' }}
                    contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}
                  />
                  <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
                  <Bar yAxisId="left" dataKey="new" name="New schools" fill="#93c5fd" radius={[3, 3, 0, 0]} maxBarSize={22} />
                  <Line yAxisId="right" dataKey="total" name="Total schools" stroke="var(--color-secondary)" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : <p className="empty-state">No schools registered yet</p>}
          </div>
        </div>

        <div className="dash-activity">
          <div className="super-card dash-card">
            <div className="card-header dash-card-header">
              <div>
                <h3>Recent School Onboardings</h3>
                <p className="dash-card-sub">Latest schools to join the platform</p>
              </div>
            </div>
            {recentOnboardings.length > 0 ? (
              <div className="dash-list">
                {recentOnboardings.map((s) => (
                  <div key={s.id} className="dash-list-row">
                    <div className="dash-avatar" style={{ background: s.primary_color || 'var(--color-primary)' }}>
                      {s.name?.[0] || '?'}
                    </div>
                    <div className="dash-list-main">
                      <span className="dash-list-name">{s.name}</span>
                      <span className="dash-list-sub">{relativeDay(s.created_at)}{s.county ? ` · ${s.county}` : ''}</span>
                    </div>
                    <span className={`plan-badge ${s.plan}`}>{s.plan}</span>
                  </div>
                ))}
              </div>
            ) : <p className="empty-state">No schools registered yet</p>}
          </div>

          <div className="super-card dash-card">
            <div className="card-header dash-card-header">
              <div>
                <h3>Recent Payments</h3>
                <p className="dash-card-sub">Latest fee payments across schools</p>
              </div>
            </div>
            {recentPayments.length > 0 ? (
              <div className="dash-list">
                {recentPayments.map((p) => (
                  <div key={p.id} className="dash-list-row">
                    <div className="dash-avatar dash-avatar--pay"><DollarSign size={14} /></div>
                    <div className="dash-list-main">
                      <span className="dash-list-name">{p.student_name || 'Student payment'}</span>
                      <span className="dash-list-sub">
                        {p.school_name || '—'}
                        {p.payment_method ? ` · ${p.payment_method.replace(/_/g, ' ')}` : ''}
                        {p.transaction_date ? ` · ${new Date(p.transaction_date).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}` : ''}
                      </span>
                    </div>
                    <span className="dash-list-amount">{formatCurrency(p.amount)}</span>
                  </div>
                ))}
              </div>
            ) : <p className="empty-state">No payments recorded yet</p>}
          </div>
        </div>

      </div>
    )
  }

  return (
    <div className="super-root">
      <button className="super-mobile-toggle" onClick={() => setMobileOpen(true)} aria-label="Open menu">
        <Menu size={20} />
      </button>

      {mobileOpen && <div className="super-mobile-overlay" onClick={() => setMobileOpen(false)} />}

      <aside className={`super-sidebar ${mobileOpen ? 'open' : ''}`}>
        {mobileOpen && (
          <button className="super-mobile-close" onClick={() => setMobileOpen(false)} aria-label="Close menu">
            <X size={18} />
          </button>
        )}
        <div className="sidebar-brand">
          <div className="sidebar-logo"><img src={logoImg} alt="ShulePulse" /></div>
          <span>ShulePulse</span>
        </div>
        <div className="super-badge">
          <Building2 size={13} />
          Superadmin
        </div>
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <button key={item.key} className={`nav-item ${activeNav === item.key ? 'active' : ''}`} onClick={() => { setActiveNav(item.key); setMobileOpen(false) }}>
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <RoleSwitcher />
        <div className="sidebar-user-section">
          <AvatarUpload size={36} />
          <div className="sidebar-user-info">
            <p className="sidebar-user-name">{useAuthStore.getState().profile?.full_name || 'Admin'}</p>
            <p className="sidebar-user-role">Superadmin</p>
          </div>
        </div>
        <div className="sidebar-footer">
          <a href={basePath('/privacy-policy')} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#64748b', textDecoration: 'none', display: 'block', textAlign: 'center', marginBottom: 8 }}>Privacy Policy</a>
          <a href={basePath('/terms-of-service')} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#64748b', textDecoration: 'none', display: 'block', textAlign: 'center', marginBottom: 8 }}>Terms of Service</a>
          <button className="logout-btn" onClick={() => { setMobileOpen(false); handleLogout() }}>
            <LogOut size={16} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <main className="super-main">
        <header className="super-header">
          <div>
            <h1>{pageTitles[activeNav]}</h1>
            <p>{activeNav === 'dashboard' ? 'Monitor schools, users, revenue and platform activity.' : `ShulePulse · ${new Date().toLocaleDateString('en-KE', { month: 'long', year: 'numeric' })}`}</p>
          </div>
          <div className="header-actions">
            <div className="school-admin-picker" ref={schoolPickerRef}>
              <button className="btn-secondary" onClick={() => setShowSchoolPicker(!showSchoolPicker)}>
                <Building2 size={15} /> School Admin <ChevronDown size={14} />
              </button>
              {showSchoolPicker && (
                <div className="school-admin-dropdown">
                  {schools.map((s) => (
                    <button key={s.id} className="school-admin-option" onClick={() => goToSchool(s)}>
                      <span>{s.name}</span>
                      <ArrowRight size={14} />
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button className="btn-secondary" onClick={() => { setMobileOpen(false); handleExport() }}>
              <Download size={15} /> Export Data
            </button>
            <button className="btn-primary" onClick={() => { setMobileOpen(false); setShowOnboard(true) }}>
              <Plus size={15} /> Onboard School
            </button>
          </div>
        </header>

        {renderContent()}
      </main>

      {toast && (
        <div className="onboard-toast">
          <CheckCircle size={16} /> {toast}
        </div>
      )}

      {showOnboard && <OnboardSchoolModal onClose={() => setShowOnboard(false)} />}
    </div>
  )
}