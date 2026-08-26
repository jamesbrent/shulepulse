import { useState, useEffect, useRef } from 'react'
import {
  LayoutDashboard, School, CreditCard, Users,
  TrendingUp, Settings, LogOut, Plus, Search,
  Eye, Edit, Ban, Trash2, Building2, Download, CheckCircle,
  GraduationCap, UserCheck, DollarSign, Calendar,
  Activity, ArrowUp, ArrowDown, History, MessageSquare, Menu, X, ListTree,
  ChevronDown, ArrowRight, Scale
} from 'lucide-react'
import logoImg from '../../assets/logo.png'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line
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
import SchoolDetailModal from '../../features/onboarding/SchoolDetailModal'
import EditSchoolModal from '../../features/onboarding/EditSchoolModal'
import { fetchDashboardStats, fetchActiveUserStats } from '../../features/superadmin/dashboardService'
import { deleteSchool, toggleSchoolStatus } from '../../features/superadmin/schoolService'
import { logAction } from '../../features/audit/auditService'
import { useAuthStore } from '../../store/authStore'

const PIE_COLORS = ['#16a34a', '#2563eb', '#ca8a04']

export default function SuperadminDashboard() {
  const [activeNav, setActiveNav] = useState('dashboard')
  const [schools, setSchools] = useState([])
  const [stats, setStats] = useState(null)
  const [userGrowth, setUserGrowth] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showOnboard, setShowOnboard] = useState(false)
  const [viewSchool, setViewSchool] = useState(null)
  const [editSchool, setEditSchool] = useState(null)
  const [toast, setToast] = useState(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [showSchoolPicker, setShowSchoolPicker] = useState(false)
  const schoolPickerRef = useRef(null)
  const { selectSchool } = useAuthStore()

  useEffect(() => {
    loadAll()
  }, [])

  const loadAll = async () => {
    setLoading(true)
    try {
      const [statsData, schoolsData, userData] = await Promise.all([
        fetchDashboardStats(),
        supabase.from('schools').select('*', { count: 'exact' }).order('created_at', { ascending: false }),
        fetchActiveUserStats(),
      ])
      setStats(statsData)
      setSchools(schoolsData.data || [])
      setUserGrowth(userData)
    } catch (err) {
      console.error('[Dashboard] load error:', err)
    }
    setLoading(false)
  }

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3500)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = basePath('/')
  }

  const goToSchool = async (school) => {
    await selectSchool(school)
    window.location.href = basePath('/admin')
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

  const handleDelete = async (school) => {
    if (!window.confirm(`Delete "${school.name}" permanently? This cannot be undone.`)) return
    try {
      await deleteSchool(school.id, school.name)
      showToast(`"${school.name}" deleted`)
      loadAll()
    } catch (err) {
      showToast(`Error: ${err.message}`)
    }
  }

  const handleSuspend = async (school) => {
    const newStatus = school.status === 'suspended' ? 'active' : 'suspended'
    try {
      await toggleSchoolStatus(school.id, school.name, newStatus)
      showToast(`"${school.name}" ${newStatus === 'suspended' ? 'suspended' : 'reactivated'}`)
      loadAll()
    } catch (err) {
      showToast(`Error: ${err.message}`)
    }
  }

  const filteredSchools = schools.filter(s =>
    s.name?.toLowerCase().includes(search.toLowerCase()) ||
    s.county?.toLowerCase().includes(search.toLowerCase())
  )

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

  const StatCard = ({ label, value, sub, icon, color, trend }) => (
    <div className="su-stat-card">
      <div className="stat-card-top">
        <div className="su-stat-icon" style={{ color }}>{icon}</div>
        {trend && (
          <span className={`stat-trend ${trend.direction}`}>
            {trend.direction === 'up' ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
            {trend.value}%
          </span>
        )}
      </div>
      <p className="su-stat-label">{label}</p>
      <p className="su-stat-value" style={{ color }}>{value}</p>
      <p className="su-stat-sub">{sub}</p>
    </div>
  )

  const renderDashboard = () => {
    if (loading) return <div className="loading-state">Loading platform data...</div>
    if (!stats) return <div className="loading-state">Failed to load data</div>

    return (
      <>
        <div className="super-stats">
          <StatCard label="Total Schools" value={stats.totalSchools} sub={`${stats.activeSchools} active · ${stats.trialSchools} trial`} color="#2563eb" icon={<School size={20} />} />
          <StatCard label="Total Students" value={stats.totalStudents.toLocaleString()} sub={`${stats.activeStudents.toLocaleString()} active`} color="#16a34a" icon={<GraduationCap size={20} />} />
          <StatCard label="Total Teachers" value={stats.totalTeachers.toLocaleString()} sub="Across all schools" color="#7c3aed" icon={<UserCheck size={20} />} />
          <StatCard label="Total Parents" value={stats.totalParents.toLocaleString()} sub="Registered on portal" color="#ca8a04" icon={<Users size={20} />} />
          <StatCard label="Est. MRR" value={`KES ${(stats.mrr / 1000).toFixed(0)}K`} sub="Monthly recurring" color="#2563eb" icon={<DollarSign size={20} />} />
          <StatCard label="Total Revenue" value={`KES ${(stats.totalRevenue / 1000).toFixed(0)}K`} sub="All-time payments" color="#16a34a" icon={<CreditCard size={20} />} />
          <StatCard label="Total Users" value={stats.totalProfiles.toLocaleString()} sub="All platform roles" color="#7c3aed" icon={<Activity size={20} />} />
          <StatCard label="Platform Age" value={schools.length > 0 ? `${Math.max(1, Math.ceil((Date.now() - new Date(schools[schools.length - 1]?.created_at).getTime()) / (30 * 24 * 60 * 60 * 1000)))} months` : '—'} sub="Since first school" color="#ca8a04" icon={<Calendar size={20} />} />
        </div>

        <div className="charts-grid">
          <div className="super-card chart-card">
            <div className="card-header"><h3><School size={16} /> School Growth</h3></div>
            {stats.schoolGrowth.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={stats.schoolGrowth}>
                  <defs>
                    <linearGradient id="schoolGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" fontSize={11} tickLine={false} />
                  <YAxis fontSize={11} tickLine={false} />
                  <Tooltip />
                  <Area type="monotone" dataKey="count" stroke="#2563eb" fill="url(#schoolGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : <p className="empty-state">No school registration data yet</p>}
          </div>

          <div className="super-card chart-card">
            <div className="card-header"><h3><CreditCard size={16} /> Revenue by Month</h3></div>
            {stats.monthlyRevenue.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={stats.monthlyRevenue}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" fontSize={11} tickLine={false} />
                  <YAxis fontSize={11} tickLine={false} />
                  <Tooltip formatter={(v) => `KES ${Number(v).toLocaleString()}`} />
                  <Bar dataKey="amount" fill="#16a34a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="empty-state">No payment data yet</p>}
          </div>

          <div className="super-card chart-card">
            <div className="card-header"><h3><Users size={16} /> Active User Growth</h3></div>
            {userGrowth.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={userGrowth}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" fontSize={11} tickLine={false} />
                  <YAxis fontSize={11} tickLine={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="users" stroke="#7c3aed" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : <p className="empty-state">No user data yet</p>}
          </div>

          <div className="super-card chart-card">
            <div className="card-header"><h3><Building2 size={16} /> Subscription Distribution</h3></div>
            {stats.totalSchools > 0 ? (
              <div className="pie-wrap">
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={stats.planCounts ? Object.entries(stats.planCounts).filter(([,v]) => v > 0).map(([k, v]) => ({ name: k, value: v })) : []} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                      {(stats.planCounts ? Object.entries(stats.planCounts).filter(([,v]) => v > 0) : []).map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pie-legend">
                  <span><span className="dot basic" /> Basic: {stats.planCounts.basic}</span>
                  <span><span className="dot pro" /> Pro: {stats.planCounts.pro}</span>
                  <span><span className="dot enterprise" /> Enterprise: {stats.planCounts.enterprise}</span>
                </div>
              </div>
            ) : <p className="empty-state">No subscription data yet</p>}
          </div>
        </div>

        <div className="super-card">
          <div className="card-header">
            <h3>All Schools</h3>
            <div className="header-actions">
              <div className="search-wrap">
                <Search size={14} className="search-icon" />
                <input className="search-input" placeholder="Search schools..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <button className="btn-primary small" onClick={() => setShowOnboard(true)}>
                <Plus size={13} /> Add School
              </button>
            </div>
          </div>

          {filteredSchools.length === 0 ? (
            <p className="empty-state">No schools found</p>
          ) : (
            <table className="schools-table">
              <thead>
                <tr>
                  <th>School Name</th>
                  <th>County</th>
                  <th>Type</th>
                  <th>Plan</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSchools.map((s) => (
                  <tr key={s.id}>
                    <td className="school-name-cell">
                      <div className="school-icon">{s.name?.[0]}</div>
                      {s.name}
                    </td>
                    <td>{s.county || '—'}</td>
                    <td>{s.type || '—'}</td>
                    <td><span className={`plan-badge ${s.plan}`}>{s.plan}</span></td>
                    <td><span className={`status-dot ${s.status}`}></span>{s.status}</td>
                    <td>
                      <div className="action-btns">
                        <button className="action-btn" onClick={() => setViewSchool(s)}><Eye size={13} /> View</button>
                        <button className="action-btn" onClick={() => setEditSchool(s)}><Edit size={13} /> Edit</button>
                        <button className={`action-btn ${s.status !== 'suspended' ? 'danger' : ''}`} onClick={() => handleSuspend(s)}>
                          <Ban size={13} /> {s.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                        </button>
                        <button className="action-btn danger" onClick={() => handleDelete(s)}><Trash2 size={13} /> Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="super-bottom-grid">
          <div className="super-card">
            <div className="card-header"><h3>Revenue by Plan</h3></div>
            <div className="revenue-bars">
              {[
                { plan: 'Enterprise', count: schools.filter((s) => s.plan === 'enterprise').length, color: '#ca8a04' },
                { plan: 'Pro', count: schools.filter((s) => s.plan === 'pro').length, color: '#2563eb' },
                { plan: 'Basic', count: schools.filter((s) => s.plan === 'basic').length, color: '#16a34a' },
              ].map((r) => (
                <div key={r.plan} className="revenue-bar-row">
                  <div className="revenue-bar-label">
                    <span>{r.plan}</span>
                    <span>{r.count} schools</span>
                  </div>
                  <div className="revenue-bar-track">
                    <div className="revenue-bar-fill" style={{
                      width: schools.length > 0 ? `${(r.count / schools.length) * 100}%` : '0%',
                      background: r.color,
                    }}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="super-card">
            <div className="card-header"><h3>Recent Schools</h3></div>
            {schools.slice(0, 5).length === 0 ? (
              <p className="empty-state">No schools yet</p>
            ) : (
              <div className="signups-list">
                {schools.slice(0, 5).map((s) => (
                  <div key={s.id} className="signup-row">
                    <div className="signup-icon">{s.name?.[0]}</div>
                    <div className="signup-info">
                      <p className="signup-name">{s.name}</p>
                      <p className="signup-county">{s.county || '—'} · {s.created_at ? new Date(s.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' }) : '—'}</p>
                    </div>
                    <span className={`plan-badge ${s.plan}`}>{s.plan}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </>
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
            <p>ShulePulse · {new Date().toLocaleDateString('en-KE', { month: 'long', year: 'numeric' })}</p>
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
      {viewSchool && <SchoolDetailModal school={viewSchool} onClose={() => setViewSchool(null)} />}
      {editSchool && (
        <EditSchoolModal
          school={editSchool}
          onClose={() => setEditSchool(null)}
          onSaved={() => {
            setEditSchool(null)
            showToast('School updated successfully')
            loadAll()
          }}
        />
      )}
    </div>
  )
}
