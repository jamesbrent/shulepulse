import { useState, useEffect, useMemo } from 'react'
import {
  LayoutDashboard, DollarSign, CreditCard, Receipt, FileText,
  BarChart3, LogOut, ChevronRight, Upload, UserPlus, Bell, MessageSquare, Menu, X,
  BookOpen, Columns3, Archive, Wallet, Banknote, Wrench, Scale,
  GraduationCap, ChevronDown, Construction, Building2, Landmark, ArrowLeftRight
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { basePath } from '../../lib/paths'
import { useAuthStore } from '../../store/authStore'
import AvatarUpload from '../../components/AvatarUpload'
import { useSchool } from '../admin/useSchool'
import { useBrandingStore } from '../../features/branding/brandingStore'
import { useNoticeCount, markNoticesSeen } from '../../hooks/useNoticeCount'
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
import AccountingPage from './Accounting'
import './Accounting.css'
import FinancialStatementsPage from './FinancialStatements'
import './FinancialStatements.css'
import AssetsPage from './Assets'
import './Assets.css'
import PayrollPage from './Payroll'
import './Payroll.css'
import PayrollReportsPage from './PayrollReports'
import './PayrollReports.css'
import AccountsPayablePage from './AccountsPayable'
import './AccountsPayable.css'
import ExpensesPage from './Expenses'
import './Expenses.css'
import CashBankPage from './CashBank'
import './CashBank.css'
import { computeAccountBalances, cashSummary } from './cashBankUtils'
import { ensureAccounts } from './accountsUtils'
import NoticesPage from '../teacher/NoticesPage'
import '../teacher/NoticesPage.css'
import DebtorsPage from './Debtors'
import CommentsPage from '../admin/Comments'
import '../admin/Comments.css'
import SchoolSupportPage from '../../features/support/SchoolSupportPage'
import '../../features/support/SchoolSupportPage.css'
import './FinanceDashboard.css'
import { useFeatureAccess } from '../../features/access/FeatureAccessContext'
import { FINANCE_NAV_FEATURES } from '../../features/access/featureMap'
import FeatureGate from '../../features/access/FeatureGate'

const DASHBOARD_ITEM = { key: 'dashboard', label: 'Dashboard', page: 'dashboard' }

// Sidebar structure — logical collapsible groups per finance team request.
// `page` is the view to render; `tab` deep-links into the page's own tabs.
// `page: 'coming-soon'` renders a placeholder for modules not yet built.
const NAV_SECTIONS = [
  {
    label: 'FINANCE',
    groups: [
      {
        key: 'student_finance', label: 'Student Finance', icon: <GraduationCap size={15} />,
        items: [
          { key: 'fees', label: 'Fees', icon: <DollarSign size={15} />, page: 'fees' },
          { key: 'payments', label: 'Payments', icon: <CreditCard size={15} />, page: 'payments' },
          { key: 'debtors', label: 'Debtors', icon: <Receipt size={15} />, page: 'debtors' },
          { key: 'receipts', label: 'Receipts', icon: <Receipt size={15} />, page: 'receipts' },
          { key: 'statements', label: 'Statements', icon: <FileText size={15} />, page: 'statements' },
        ],
      },
      {
        key: 'accounting', label: 'Accounting', icon: <Columns3 size={15} />,
        items: [
          { key: 'accounting:ledger', label: 'Transactions', icon: <BookOpen size={15} />, page: 'accounting', tab: 'ledger' },
          { key: 'accounting:accounts', label: 'Chart of Accounts', icon: <Columns3 size={15} />, page: 'accounting', tab: 'accounts' },
          { key: 'accounting:journal', label: 'Journals', icon: <BookOpen size={15} />, page: 'accounting', tab: 'journal' },
          { key: 'accounting:expenses', label: 'Expenses', icon: <Receipt size={15} />, page: 'expenses', tab: 'dashboard' },
          { key: 'accounting:bank', label: 'Bank Reconciliation', icon: <Scale size={15} />, page: 'cash_bank', tab: 'reconciliation' },
        ],
      },
      {
        key: 'treasury', label: 'Cash & Bank', icon: <Landmark size={15} />,
        items: [
          { key: 'treasury:dashboard', label: 'Cash & Bank Dashboard', icon: <Landmark size={15} />, page: 'cash_bank', tab: 'dashboard' },
          { key: 'treasury:transfers', label: 'Transfers', icon: <ArrowLeftRight size={15} />, page: 'cash_bank', tab: 'transfers' },
          { key: 'treasury:reconciliation', label: 'Reconciliation', icon: <Scale size={15} />, page: 'cash_bank', tab: 'reconciliation' },
        ],
      },
      {
        key: 'assets', label: null,
        items: [
          { key: 'assets', label: 'Assets', icon: <Archive size={15} />, page: 'assets' },
        ],
      },
      {
        key: 'payroll', label: null,
        items: [
          { key: 'payroll', label: 'Payroll', icon: <Wallet size={15} />, page: 'payroll' },
          { key: 'staff_comments', label: 'Staff Comments', icon: <MessageSquare size={15} />, page: 'comments' },
        ],
      },
      {
        key: 'accounts_payable', label: 'Accounts Payable', icon: <Receipt size={15} />,
        items: [
          { key: 'ap:dashboard', label: 'AP Dashboard', icon: <Columns3 size={15} />, page: 'accounts_payable', tab: 'dashboard' },
          { key: 'ap:suppliers', label: 'Suppliers / Payees', icon: <Building2 size={15} />, page: 'accounts_payable', tab: 'suppliers' },
          { key: 'ap:invoices', label: 'Invoices & Bills', icon: <Receipt size={15} />, page: 'accounts_payable', tab: 'invoices' },
          { key: 'ap:payments', label: 'Payments', icon: <Banknote size={15} />, page: 'accounts_payable', tab: 'payments' },
          { key: 'ap:vouchers', label: 'Vouchers', icon: <FileText size={15} />, page: 'accounts_payable', tab: 'vouchers' },
          { key: 'ap:settings', label: 'AP Settings', icon: <Wrench size={15} />, page: 'accounts_payable', tab: 'settings' },
        ],
      },
    ],
  },
  {
    label: 'REPORTING',
    groups: [
      {
        key: 'reports', label: 'Reports', icon: <BarChart3 size={15} />,
        items: [
          { key: 'reports:financial', label: 'Financial Statements', icon: <BarChart3 size={15} />, page: 'financial_statements' },
          { key: 'reports:fee', label: 'Fee Collection', icon: <DollarSign size={15} />, page: 'reports', tab: 'overview' },
          { key: 'reports:expense', label: 'Expense Reports', icon: <Receipt size={15} />, page: 'expenses', tab: 'reports' },
          { key: 'reports:payroll', label: 'Payroll Reports', icon: <Wallet size={15} />, page: 'payroll_reports' },
          { key: 'reports:asset', label: 'Asset Reports', icon: <Archive size={15} />, page: 'assets', tab: 'register' },
        ],
      },
    ],
  },
  {
    label: 'SYSTEM',
    groups: [
      {
        key: 'system', label: null,
        items: [
          { key: 'notices', label: 'Notices', icon: <Bell size={15} />, page: 'notices' },
          { key: 'support', label: 'Support', icon: <MessageSquare size={15} />, page: 'support' },
        ],
      },
    ],
  },
]

const DEFAULT_OPEN = null

const ComingSoon = ({ title }) => (
  <div className="b-coming-soon">
    <Construction size={42} />
    <h3>{title}</h3>
    <p>This module is under construction and will be available in an upcoming release.</p>
  </div>
)

export default function FinanceDashboard() {
  const { profile: authProfile } = useAuthStore()
  const { school, currentTerm, currentYear } = useSchool()
  const { logoUrl, schoolName } = useBrandingStore()
  const { features, isSuperadmin } = useFeatureAccess()
  const [activeItem, setActiveItem] = useState(DASHBOARD_ITEM)
  const [openGroup, setOpenGroup] = useState(DEFAULT_OPEN)
  const [openRecordPayment, setOpenRecordPayment] = useState(false)
  const [openExpenseId, setOpenExpenseId] = useState(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [stats, setStats] = useState({
    totalCollected: 0,
    outstanding: 0,
    totalAssessed: 0,
    totalTransactions: 0,
  })
  const [recentPayments, setRecentPayments] = useState([])
  const [cashStats, setCashStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const notifCount = useNoticeCount(authProfile?.school_id, authProfile?.id)

  const filteredNavSections = useMemo(() => {
    if (isSuperadmin) return NAV_SECTIONS
    return NAV_SECTIONS.map((section) => ({
      ...section,
      groups: section.groups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => {
            const required = FINANCE_NAV_FEATURES[item.key] || FINANCE_NAV_FEATURES[item.page]
            if (!required) return true
            return required.some((f) => features.includes(f))
          }),
        }))
        .filter((group) => group.items.length > 0),
    })).filter((section) => section.groups.length > 0)
  }, [features, isSuperadmin])

  useEffect(() => {
    if (isSuperadmin || activeItem.key === 'dashboard') return
    const page = activeItem.page || activeItem.key
    const required = FINANCE_NAV_FEATURES[page] || FINANCE_NAV_FEATURES[activeItem.key]
    if (required && !required.some((f) => features.includes(f))) {
      setActiveItem(DASHBOARD_ITEM)
    }
  }, [features, activeItem, isSuperadmin])

  useEffect(() => {
    if (activeItem?.page === 'dashboard') fetchBursarData()
  }, [activeItem?.page, currentTerm, currentYear])

  const fetchBursarData = async () => {
    setLoading(true)

    const { data: profile } = await supabase
      .from('profiles')
      .select('school_id')
      .eq('id', (await supabase.auth.getUser()).data.user.id)
      .single()

    const schoolId = profile?.school_id
    if (!schoolId) { setLoading(false); return }

    try {
      await ensureAccounts(supabase, schoolId, ['1010', '1020', '1030', '1040', '1110'])
    } catch { /* non-fatal — positions fall back to existing accounts */ }

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

    const [accRes, lineRes] = await Promise.all([
      supabase
        .from('chart_of_accounts')
        .select('*')
        .eq('school_id', schoolId)
        .eq('type', 'asset'),
      supabase
        .from('journal_entry_lines')
        .select('*, journal_entries!inner(status, entry_date)')
        .order('created_at', { ascending: true }),
    ])
    const cashAccounts = (accRes.data || []).filter((a) => (a.category || '').toLowerCase() === 'cash & bank')
    const postedLines = (lineRes.data || []).filter((l) => l.journal_entries?.status === 'posted')
    setCashStats(cashSummary(computeAccountBalances(cashAccounts, postedLines)))

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

  // Which sidebar group holds a given item (for auto-expanding on navigation).
  const groupOfItem = (key) => {
    for (const section of NAV_SECTIONS) {
      for (const group of section.groups) {
        if (group.items.some((i) => i.key === key)) return group
      }
    }
    return null
  }

  const go = (item) => {
    setActiveItem(item)
    setMobileOpen(false)
    if (item.key === 'notices') markNoticesSeen(authProfile?.id)
    const group = groupOfItem(item.key)
    if (group) setOpenGroup(group.key)
  }

  const toggleGroup = (key) => {
    setOpenGroup((prev) => (prev === key ? null : key))
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = basePath('/')
  }

  const renderContent = () => {
    const page = activeItem?.page || 'dashboard'
    switch (page) {
      case 'fees': return <FeesPage />
      case 'debtors': return <DebtorsPage />
      case 'payments': return <PaymentsPage showRecordPayment={openRecordPayment} onRecordPaymentClose={() => setOpenRecordPayment(false)} />
      case 'receipts': return <ReceiptsPage />
      case 'statements': return <StatementsPage />
      case 'accounting': return <AccountingPage initialTab={activeItem.tab} onOpenSource={(type, id) => { if (type === 'expense') { go(findItem('accounting:expenses') || { key: 'accounting:expenses', label: 'Expenses', page: 'expenses', tab: 'dashboard' }); setOpenExpenseId(id) } }} />
      case 'assets': return <AssetsPage initialTab={activeItem.tab} />
      case 'payroll': return <PayrollPage initialTab={activeItem.tab} />
      case 'payroll_reports': return <PayrollReportsPage />
      case 'accounts_payable': return <AccountsPayablePage initialTab={activeItem.tab} />
      case 'cash_bank': return <CashBankPage initialTab={activeItem.tab} />
      case 'expenses': return <ExpensesPage initialTab={activeItem.tab} openExpenseId={openExpenseId} onOpenExpenseDone={() => setOpenExpenseId(null)} />
      case 'reports': return <ReportsPage initialTab={activeItem.tab} />
      case 'financial_statements': return <FinancialStatementsPage />
      case 'notices': return <NoticesPage profile={authProfile} />
      case 'comments': return <CommentsPage />
      case 'support': return <SchoolSupportPage />
      case 'coming-soon': return <ComingSoon title={activeItem.label} />
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

        {cashStats && (
          <div className="b-admin-card" style={{ marginBottom: 16 }}>
            <div className="b-card-header">
              <h3>Cash &amp; Bank Positions</h3>
              <button className="b-view-all" onClick={() => go({ key: 'treasury:dashboard', label: 'Cash & Bank Dashboard', page: 'cash_bank', tab: 'dashboard' })}>
                Manage <ChevronRight size={14} />
              </button>
            </div>
            <div className="cb-stmt-kpi" style={{ gap: 12 }}>
              {[
                { label: 'Cash', value: fmt(cashStats.cash), color: '#16a34a' },
                { label: 'Bank', value: fmt(cashStats.bank), color: '#2563eb' },
                { label: 'Mobile Money', value: fmt(cashStats.mobile), color: '#7c3aed' },
                { label: 'Fixed Deposits', value: fmt(cashStats.fixed), color: '#d97706' },
                { label: 'Total Cash & Bank', value: fmt(cashStats.total), color: '#0f172a' },
                { label: 'Available Funds', value: fmt(cashStats.available), color: '#047857' },
              ].map((s) => (
                <div className="b-stat-card" key={s.label} style={{ flex: '1 1 150px' }}>
                  <p className="b-stat-label">{s.label}</p>
                  <p className="b-stat-value" style={{ color: s.color, fontSize: 18 }}>{s.value}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="b-admin-grid">
          <div className="b-admin-card">
            <div className="b-card-header">
              <h3>Recent Payments</h3>
              <button className="b-view-all" onClick={() => go({ key: 'payments', label: 'Payments', page: 'payments' })}>
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

  const findItem = (key) => {
    for (const section of NAV_SECTIONS) {
      for (const group of section.groups) {
        const found = group.items.find((i) => i.key === key)
        if (found) return found
      }
    }
    return null
  }

  return (
    <div className="b-root">
      <button className="b-mobile-toggle" onClick={() => setMobileOpen(true)} aria-label="Open menu">
        <Menu size={20} />
      </button>

      {mobileOpen && <div className="b-mobile-overlay" onClick={() => setMobileOpen(false)} />}

      <aside className={`b-sidebar ${mobileOpen ? 'open' : ''}`}>
        {mobileOpen && (
          <button className="b-mobile-close" onClick={() => setMobileOpen(false)} aria-label="Close menu">
            <X size={18} />
          </button>
        )}
        <div className="b-sidebar-brand">
          {logoUrl ? (
            <img src={logoUrl} alt={schoolName || 'Logo'} style={{ width: 34, height: 34, borderRadius: 8, objectFit: 'cover' }} />
          ) : (
            <div className="b-sidebar-logo">{schoolName?.[0] || 'S'}</div>
          )}
          <span>{schoolName || 'School'}</span>
        </div>
        <div className="b-sidebar-school">
          <AvatarUpload className="b-school-avatar" size={36} />
          <div>
            <p className="b-school-name">{authProfile?.full_name || 'User'}</p>
            <p className="b-school-plan">{authProfile?.role ? authProfile.role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Bursar'}</p>
          </div>
        </div>

        <nav className="b-sidebar-nav">
          <button
            className={`b-nav-item b-nav-top ${activeItem.key === 'dashboard' ? 'active' : ''}`}
            onClick={() => go(DASHBOARD_ITEM)}
          >
            <span className="b-nav-icon"><LayoutDashboard size={16} /></span>
            <span>Dashboard</span>
          </button>

          {filteredNavSections.map((section) => (
            <div className="b-nav-section" key={section.label}>
              <p className="b-nav-section-label">{section.label}</p>
              {section.groups.map((group) => {
                const open = openGroup === group.key
                const activeInGroup = group.items.some((i) => activeItem.key === i.key)
                return (
                  <div className="b-nav-group" key={group.key}>
                    {group.label ? (
                      <button
                        className={`b-nav-group-head ${activeInGroup ? 'active' : ''}`}
                        onClick={() => toggleGroup(group.key)}
                      >
                        <span className="b-nav-icon">{group.icon}</span>
                        <span className="b-nav-group-label">{group.label}</span>
                        <ChevronDown size={14} className={`b-nav-chevron ${open ? '' : 'collapsed'}`} />
                      </button>
                    ) : (
                      group.items.map((item) => (
                        <button
                          key={item.key}
                          className={`b-nav-item ${activeItem.key === item.key ? 'active' : ''}`}
                          onClick={() => go(item)}
                        >
                          <span className="b-nav-icon">{item.icon}</span>
                          <span>{item.label}</span>
                        </button>
                      ))
                    )}
                    {group.label && open && (
                      <div className="b-nav-children">
                        {group.items.map((item) => (
                          <button
                            key={item.key}
                            className={`b-nav-item ${activeItem.key === item.key ? 'active' : ''}`}
                            onClick={() => go(item)}
                          >
                            <span className="b-nav-icon">{item.icon}</span>
                            <span>{item.label}</span>
                            {item.key === 'notices' && notifCount > 0 && <span className="nav-badge" style={{ background: '#ef4444', color: '#fff', borderRadius: '50%', fontSize: '10px', fontWeight: 700, padding: '1px 6px', marginLeft: 'auto' }}>{notifCount}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
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
            <h1>{activeItem.key === 'dashboard' ? 'Finance Dashboard' : activeItem.label}</h1>
            <p>{currentTerm ? `${currentTerm}, ${currentYear}` : `${currentYear}`} · {school?.name || ''}</p>
          </div>
        </header>

        <FeatureGate feature={FINANCE_NAV_FEATURES[activeItem.page] || FINANCE_NAV_FEATURES[activeItem.key]?.[0]}>
          {renderContent()}
        </FeatureGate>
      </main>
    </div>
  )
}
