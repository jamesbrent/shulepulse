import { useState, useEffect } from 'react'
import { Search, RefreshCw, BarChart3, Sliders, CreditCard, AlertCircle, FileText, Download, Plus } from 'lucide-react'
import { useAuthStore } from '../../../store/authStore'
import { useSchool } from '../useSchool'
import { supabase } from '../../../lib/supabase'
import { TERMS, YEARS } from './utils/feesHelpers'
import { DashboardTab } from './tabs/DashboardTab'
import { FeeStructureTab } from './tabs/FeeStructureTab'
import { PaymentsTab } from './tabs/PaymentsTab'
import { DebtorsTab } from './tabs/DebtorsTab'
import { ReportsTab } from './tabs/ReportsTab'

const NAV_TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { id: 'structure', label: 'Fee Structure', icon: Sliders },
  { id: 'payments', label: 'Receive Payment', icon: CreditCard },
  { id: 'debtors', label: 'Debtors', icon: AlertCircle },
  { id: 'reports', label: 'Reports', icon: FileText },
]

export default function FeesPage() {
  const { profile } = useAuthStore()
  const { currentTerm, currentYear: schoolYear } = useSchool()

  const [activeTab, setActiveTab] = useState('dashboard')
  const [term, setTerm] = useState('')
  const [year, setYear] = useState('')
  const [search, setSearch] = useState('')
  const [filterClass, setFilterClass] = useState('')
  const [filterStream, setFilterStream] = useState('')
  const [globalClasses, setGlobalClasses] = useState([])
  const [globalStreams, setGlobalStreams] = useState([])
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (currentTerm && !term) setTerm(currentTerm)
    if (schoolYear && !year) setYear(String(schoolYear))
  }, [currentTerm, schoolYear])

  useEffect(() => {
    if (!profile?.school_id) return
    supabase
      .from('students')
      .select('class, stream')
      .eq('school_id', profile.school_id)
      .not('class', 'is', null)
      .then(({ data }) => {
        const cls = [...new Set((data || []).map((r) => r.class).filter(Boolean))].sort()
        const str = [...new Set((data || []).map((r) => r.stream).filter(Boolean))].sort()
        setGlobalClasses(cls)
        setGlobalStreams(str)
      })
  }, [profile?.school_id])

  const handleRefresh = () => setRefreshKey((k) => k + 1)

  const filterProps = { search, setSearch, filterClass, setFilterClass, filterStream, setFilterStream, refreshKey, onRefresh: handleRefresh }
  const commonProps = { profile, term, year, setTerm, setYear, ...filterProps }

  return (
    <div className="fees-page">
      {/* Sticky Finance Toolbar */}
      <div className="fees-toolbar">
        <div className="fees-toolbar-left">
          <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Term</label>
          <select className="filter-select" value={term} onChange={(e) => setTerm(e.target.value)}>
            <option value="">— Select —</option>
            {TERMS.map((t) => <option key={t}>{t}</option>)}
          </select>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Year</label>
          <select className="filter-select" value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="">— Select —</option>
            {YEARS.map((y) => <option key={y}>{y}</option>)}
          </select>
          <div className="search-wrap" style={{ width: 200 }}>
            <Search size={13} className="search-icon" />
            <input
              className="search-input"
              placeholder="Search student or adm no…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: '100%', fontSize: 13 }}
            />
          </div>
          <select className="filter-select" value={filterClass} onChange={(e) => setFilterClass(e.target.value)}>
            <option value="">All Classes</option>
            {globalClasses.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="filter-select" value={filterStream} onChange={(e) => setFilterStream(e.target.value)}>
            <option value="">All Streams</option>
            {globalStreams.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <RefreshCw size={14} className="refresh-ico" onClick={handleRefresh} style={{ cursor: 'pointer', flexShrink: 0 }} />
        </div>
        <div className="fees-toolbar-right">
          <button className="btn-primary green" onClick={() => setActiveTab('payments')}>
            <Plus size={15} />
            Receive Payment
          </button>
          <button className="btn-secondary" onClick={() => setActiveTab('reports')}>
            <Download size={15} />
            Export
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="fees-tab-nav">
        {NAV_TABS.map((t) => (
          <button
            key={t.id}
            className={`fees-tab-btn ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            <t.icon size={15} />
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'dashboard' && <DashboardTab {...commonProps} />}
      {activeTab === 'structure' && <FeeStructureTab {...commonProps} />}
      {activeTab === 'payments' && <PaymentsTab {...commonProps} />}
      {activeTab === 'debtors' && <DebtorsTab {...commonProps} />}
      {activeTab === 'reports' && <ReportsTab {...commonProps} />}
    </div>
  )
}
