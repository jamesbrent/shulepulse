import { useState, useEffect } from 'react'
import {
  LayoutDashboard, DollarSign, CreditCard, Receipt, FileText,
  BarChart3, LogOut, ChevronRight, Upload, UserPlus, Bell, MessageSquare
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'
import { useSchool } from '../admin/useSchool'
import { useBrandingStore } from '../../features/branding/brandingStore'
import { fmt, fmtDate } from '../admin/fees/utils/feesHelpers'
import FeesPage from './Fees'
import './Fees.css'
import PaymentsPage from './Payments'
import './Payments.css'
import ReceiptsPage from './Receipts'
import RoleSwitcher from '../../components/RoleSwitcher'
import './Receipts.css'
import StatementsPage from './Statements'
import './Statements.css'
import ReportsPage from './Reports'
import './Reports.css'
import NoticesPage from '../teacher/NoticesPage'
import '../teacher/NoticesPage.css'
import SchoolSupportPage from '../../features/support/SchoolSupportPage'
import '../../features/support/SchoolSupportPage.css'
import './BursarDashboard.css'

export default function BursarDashboard() {
  const { profile: authProfile } = useAuthStore()
  const { school, currentTerm, currentYear } = useSchool()
  const { logoUrl, schoolName } = useBrandingStore()
  const [activeNav, setActiveNav] = useState('dashboard')
  const [openRecordPayment, setOpenRecordPayment] = useState(false)
  const [stats, setStats] = useState({
    totalCollected: 0,
    outstanding: 0,
    totalAssessed: 0,
    totalTransactions: 0,
  })
  const [recentPayments, setRecentPayments] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchBursarData()
  }, [currentTerm, currentYear])

  const fetchBursarData = async () => {
    setLoading(true)

    const { data: profile } = await supabase
      .from('profiles')
      .select('school_id')
      .eq('id', (await supabase.auth.getUser()).data.user.id)
      .single()

    const schoolId = profile?.school_id
    if (!schoolId) { setLoading(false); return }

    const [ledgerRes, recentRes] = await Promise.all([
      supabase
        .from('student_ledger')
        .select('entry_type, amount')
        .eq('school_id', schoolId)
        .eq('term', currentTerm)
        .eq('year', currentYear),
      supabase
        .from('fee_payments')
        .select('*, students(full_name, class, stream, admission_number)')
        .eq('school_id', schoolId)
        .order('created_at', { ascending: false })
        .limit(5),
    ])

    let totalDue = 0, totalPaid = 0, txnCount = 0
    ;(ledgerRes.data || []).forEach((e) => {
      if (['charge', 'penalty'].includes(e.entry_type)) totalDue += Number(e.amount)
      if (['payment', 'discount', 'waiver', 'scholarship'].includes(e.entry_type)) totalPaid += Number(e.amount)
      if (e.entry_type === 'payment') txnCount++
    })

    const enriched = await enrichWithStaffNames(recentRes.data || [])

    setStats({
      totalCollected: totalPaid,
      outstanding: totalDue - totalPaid,
      totalAssessed: totalDue,
      totalTransactions: txnCount,
    })
    setRecentPayments(enriched)
    setLoading(false)
  }

  async function enrichWithStaffNames(payments) {
    const staffIds = [...new Set(payments.map((p) => p.received_by).filter(Boolean))]
    if (!staffIds.length) return payments.map((p) => ({ ...p, staff_name: '—' }))
    const { data: staff } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', staffIds)
    const staffMap = Object.fromEntries((staff || []).map((s) => [s.id, s.full_name]))
    return payments.map((p) => ({ ...p, staff_name: staffMap[p.received_by] || '—' }))
  }

  const navItems = [
    { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
    { key: 'fees', label: 'Fees', icon: <DollarSign size={18} /> },
    { key: 'payments', label: 'Payments', icon: <CreditCard size={18} /> },
    { key: 'receipts', label: 'Receipts', icon: <Receipt size={18} /> },
    { key: 'statements', label: 'Statements', icon: <FileText size={18} /> },
    { key: 'reports', label: 'Reports', icon: <BarChart3 size={18} /> },
    { key: 'notices', label: 'Notices', icon: <Bell size={18} /> },
    { key: 'support', label: 'Support', icon: <MessageSquare size={18} /> },
  ]

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  const pageTitles = {
    dashboard: 'Bursar Dashboard',
    fees: 'Fee Structures',
    payments: 'Payments',
    receipts: 'Receipts',
    statements: 'Statements',
    reports: 'Reports',
    notices: 'Notices & Announcements',
    support: 'Support Tickets',
  }

  const renderContent = () => {
    switch (activeNav) {
      case 'fees': return <FeesPage />
      case 'payments': return <PaymentsPage showRecordPayment={openRecordPayment} onRecordPaymentClose={() => setOpenRecordPayment(false)} />
      case 'receipts': return <ReceiptsPage />
      case 'statements': return <StatementsPage />
      case 'reports': return <ReportsPage />
      case 'notices': return <NoticesPage profile={authProfile} />
      case 'support': return <SchoolSupportPage />
      default: return renderDashboard()
    }
  }

  const renderDashboard = () => {
    if (loading) return <div className="loading-state">Loading dashboard...</div>
    return (
      <>
        <div className="b-stats-grid">
          {[
            { label: 'Total Collected', value: fmt(stats.totalCollected), change: `${currentTerm || 'Current'} ${currentYear}`, color: '#16a34a', icon: <DollarSign size={20} /> },
            { label: 'Outstanding', value: fmt(stats.outstanding), change: 'Unpaid balance', color: '#dc2626', icon: <BarChart3 size={20} /> },
            { label: 'Total Assessed', value: fmt(stats.totalAssessed), change: `${currentTerm || 'Current'} ${currentYear}`, color: '#2563eb', icon: <FileText size={20} /> },
            { label: 'Transactions', value: stats.totalTransactions, change: 'This term', color: '#7c3aed', icon: <CreditCard size={20} /> },
          ].map((s) => (
            <div className="b-stat-card" key={s.label}>
              <div className="b-stat-icon" style={{ color: s.color }}>{s.icon}</div>
              <p className="b-stat-label">{s.label}</p>
              <p className="b-stat-value" style={{ color: s.color }}>{s.value}</p>
              <p className="b-stat-change">{s.change}</p>
            </div>
          ))}
        </div>

        <div className="b-admin-grid">
          <div className="b-admin-card">
            <div className="b-card-header">
              <h3>Recent Payments</h3>
              <button className="b-view-all" onClick={() => setActiveNav('payments')}>
                View all <ChevronRight size={14} />
              </button>
            </div>
            {recentPayments.length === 0 ? (
              <p className="empty-state">No payments yet this term</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="b-fee-table" style={{ minWidth: 900 }}>
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Adm No.</th>
                      <th>Class</th>
                      <th>Amount</th>
                      <th>Method</th>
                      <th>Reference</th>
                      <th>Paid On</th>
                      <th>Receipt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentPayments.map((f) => (
                      <tr key={f.id}>
                        <td style={{ whiteSpace: 'nowrap' }}>{f.students?.full_name || '—'}</td>
                        <td className="b-monospace">{f.students?.admission_number || '—'}</td>
                        <td>{f.students?.class || '—'}</td>
                        <td style={{ color: '#16a34a', fontWeight: 600 }}>{fmt(f.amount)}</td>
                        <td style={{ textTransform: 'capitalize' }}>{f.payment_type || f.payment_method || '—'}</td>
                        <td className="b-monospace">{f.reference || f.mpesa_code || '—'}</td>
                        <td style={{ color: '#64748b' }}>{fmtDate(f.transaction_date)}</td>
                        <td className="b-monospace">{f.receipt_number || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </>
    )
  }

  return (
    <div className="b-root">
      <aside className="b-sidebar">
        <div className="b-sidebar-brand">
          {logoUrl ? (
            <img src={logoUrl} alt={schoolName || 'Logo'} style={{ width: 34, height: 34, borderRadius: 8, objectFit: 'cover' }} />
          ) : (
            <div className="b-sidebar-logo">{schoolName?.[0] || 'S'}</div>
          )}
          <span>{schoolName || 'School'}</span>
        </div>
        <div className="b-sidebar-school">
          <div className="b-school-avatar">{school?.name?.[0] || 'S'}</div>
          <div>
            <p className="b-school-name">{school?.name || 'Loading...'}</p>
            <p className="b-school-plan">{school?.plan || 'Basic'} Plan</p>
          </div>
        </div>
        <nav className="b-sidebar-nav">
          {navItems.map((item) => (
            <button
              key={item.key}
              className={`b-nav-item ${activeNav === item.key ? 'active' : ''}`}
              onClick={() => setActiveNav(item.key)}
            >
              <span className="b-nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <RoleSwitcher />
        <div className="b-sidebar-footer">
          <button className="b-logout-btn" onClick={handleLogout}>
            <LogOut size={16} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <main className="b-main">
        <header className="b-header">
          <div>
            <h1>{pageTitles[activeNav]}</h1>
            <p>{currentTerm ? `${currentTerm}, ${currentYear}` : `${currentYear}`} · {school?.name || ''}</p>
          </div>
          <div className="b-header-actions">
            <button className="b-btn-secondary" onClick={() => setActiveNav('reports')}>
              <Upload size={15} /> Export Report
            </button>
            <button className="b-btn-primary" onClick={() => { setActiveNav('payments'); setOpenRecordPayment(true) }}>
              <UserPlus size={15} /> Record Payment
            </button>
            <div className="b-admin-avatar">
              {authProfile?.full_name?.[0]?.toUpperCase() || 'BU'}
            </div>
          </div>
        </header>

        {renderContent()}
      </main>
    </div>
  )
}
