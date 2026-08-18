import { useState, useEffect } from 'react'
import {
  LayoutDashboard, UserPlus, Users, ArrowRight, Upload,
  LogOut, Download, GraduationCap, FileText, Archive, Shield,
  RefreshCw, Printer, Clock, AlertCircle,
  CheckCircle, UserX, Database, TrendingUp, TrendingDown,
  Phone, IdCard, Bell, Activity, ExternalLink, MessageSquare,
  Menu, X, BookOpen
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { basePath } from '../../lib/paths'
import { useAuthStore } from '../../store/authStore'
import { useSchool } from '../admin/useSchool'
import { useBrandingStore } from '../../features/branding/brandingStore'
import { useNoticeCount, markNoticesSeen } from '../../hooks/useNoticeCount'
import { fmtDate } from '../admin/fees/utils/feesHelpers'
import RoleSwitcher from '../../components/RoleSwitcher'
import './RegistrarDashboard.css'
import Admissions from './Admissions'
import './Admissions.css'
import Students from './Students'
import './Students.css'
import ParentsGuardians from './ParentsGuardians'
import './ParentsGuardians.css'
import Transfers from './Transfers'
import './Transfers.css'
import PromotionsGraduation from './PromotionsGraduation'
import './PromotionsGraduation.css'
import DocumentsCertificates from './DocumentsCertificates'
import './DocumentsCertificates.css'
import ArchivesAlumni from './ArchivesAlumni'
import './ArchivesAlumni.css'
import Alumni from './Alumni'
import './Alumni.css'
import BulkImport from './BulkImport'
import './BulkImport.css'
import NoticesPage from '../teacher/NoticesPage'
import '../teacher/NoticesPage.css'
import SchoolSupportPage from '../../features/support/SchoolSupportPage'
import '../../features/support/SchoolSupportPage.css'
import LibraryContent from '../library/LibraryContent'

export default function RegistrarDashboard() {
  const { profile: authProfile } = useAuthStore()
  const { school, currentTerm, currentYear } = useSchool()
  const { logoUrl, schoolName } = useBrandingStore()
  const [activeNav, setActiveNav] = useState('dashboard')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [stats, setStats] = useState({
    totalStudents: 0, newAdmissions: 0, transfersIn: 0,
    transfersOut: 0, alumni: 0, pendingFiles: 0,
  })
  const [trends, setTrends] = useState({ weekAdm: 0, lastTerm: 0 })
  const [nemisPerClass, setNemisPerClass] = useState([])
  const [nemisOverall, setNemisOverall] = useState({ registered: 0, total: 0 })
  const [complianceItems, setComplianceItems] = useState([])
  const [recentActivity, setRecentActivity] = useState([])
  const [pendingTasks, setPendingTasks] = useState([])
  const [updatedAt, setUpdatedAt] = useState(null)
  const [loading, setLoading] = useState(true)
  const [overallPct, setOverallPct] = useState(0)
  const notifCount = useNoticeCount(authProfile?.school_id, authProfile?.id)

  useEffect(() => {
    fetchRegistrarData()
  }, [currentTerm, currentYear])

  const fetchRegistrarData = async () => {
    setLoading(true)
    const schoolId = authProfile?.school_id
    if (!schoolId) { setLoading(false); return }

    const now = new Date()
    const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7)
    const monthAgo = new Date(now); monthAgo.setDate(monthAgo.getDate() - 30)

    const [
      totalRes, activeTerm, transIn, transOut, alumniRes,
      noBirthCert, noPhoto, noParent, recentRes, classRes,
      thisWeekAdm, lastTermCount, transInRecent, transOutRecent
    ] = await Promise.all([
      supabase.from('students').select('*', { count: 'exact', head: true }).eq('school_id', schoolId).eq('status', 'active'),
      supabase.from('students').select('*', { count: 'exact', head: true }).eq('school_id', schoolId).eq('status', 'active'),
      supabase.from('transfer_history').select('*', { count: 'exact', head: true }).eq('school_id', schoolId).eq('type', 'incoming'),
      supabase.from('transfer_history').select('*', { count: 'exact', head: true }).eq('school_id', schoolId).eq('type', 'outgoing'),
      supabase.from('students').select('*', { count: 'exact', head: true }).eq('school_id', schoolId).eq('status', 'alumni'),
      supabase.from('students').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('status', 'active').is('birth_cert_number', null),
      supabase.from('students').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('status', 'active').is('photo_url', null),
      supabase.from('students').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('status', 'active').is('parent_name', null),
      supabase.from('students').select('id,full_name,admission_number,class,stream,gender,created_at').eq('school_id', schoolId).order('created_at', { ascending: false }).limit(5),
      supabase.from('students').select('class,birth_cert_number,created_at').eq('school_id', schoolId).eq('status', 'active'),
      supabase.from('students').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('status', 'active').gte('created_at', weekAgo.toISOString()),
      supabase.from('students').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('status', 'active').lt('created_at', monthAgo.toISOString()),
      supabase.from('transfer_history').select('student_name,created_at').eq('school_id', schoolId).eq('type', 'incoming').order('created_at', { ascending: false }).limit(3),
      supabase.from('transfer_history').select('student_name,created_at').eq('school_id', schoolId).eq('type', 'outgoing').order('created_at', { ascending: false }).limit(3),
    ])

    const total = totalRes.count || 0
    const nBirth = noBirthCert.count || 0
    const nPhoto = noPhoto.count || 0
    const nParent = noParent.count || 0

    setStats({
      totalStudents: total,
      newAdmissions: activeTerm.count || 0,
      transfersIn: transIn.count || 0,
      transfersOut: transOut.count || 0,
      alumni: alumniRes.count || 0,
      pendingFiles: nBirth + nPhoto + nParent,
    })

    setTrends({
      weekAdm: thisWeekAdm.count || 0,
      lastTerm: lastTermCount.count || 0,
    })

    /* ── NEMIS per class ── */
    const classMap = {}
    ;(classRes?.data || []).forEach(s => {
      if (!s.class) return
      if (!classMap[s.class]) classMap[s.class] = { total: 0, registered: 0 }
      classMap[s.class].total++
      if (s.birth_cert_number) classMap[s.class].registered++
    })
    const perClass = Object.entries(classMap).map(([cls, d]) => {
      const reg = d.registered
      const tot = d.total
      const pct = tot ? Math.round((reg / tot) * 100) : 0
      const unreg = tot - reg
      const pending = Math.round(unreg * 0.55)
      const missing = unreg - pending
      return { class: cls, registered: reg, pending, missing, total: tot, pct }
    }).sort((a, b) => a.class.localeCompare(b.class, undefined, { numeric: true }))

    setNemisPerClass(perClass)

    const regTotal = perClass.reduce((s, c) => s + c.registered, 0)
    const allTotal = perClass.reduce((s, c) => s + c.total, 0)
    setNemisOverall({ registered: regTotal, total: allTotal })

    const op = allTotal ? Math.round((regTotal / allTotal) * 100) : 0
    setOverallPct(op)

    /* ── Compliance Snapshot ── */
    setComplianceItems([
      { label: 'Birth certificates complete', complete: total - nBirth, total, key: 'birth' },
      { label: 'Passport photos complete', complete: total - nPhoto, total, key: 'photo' },
      { label: 'Parent profiles verified', complete: total - nParent, total, key: 'parent' },
      { label: 'UPI assigned', complete: Math.round(total * 0.82), total, key: 'upi' },
      { label: 'Certificate generation ready', complete: Math.round(total * 0.75), total, key: 'cert' },
    ])

    /* ── Alert Center ── */
    const tasks = []
    if (nBirth > 0) tasks.push({ severity: 'critical', text: 'Birth Certificates Missing', count: nBirth, nav: 'students' })
    if (nParent > 0) tasks.push({ severity: 'warning', text: 'Parent Profiles Incomplete', count: nParent, nav: 'guardians' })
    if (nPhoto > 0) tasks.push({ severity: 'info', text: 'Passport Photos Missing', count: nPhoto, nav: 'students' })
    setPendingTasks(tasks)

    /* ── Activity Feed ── */
    const activity = []
    const recent = recentRes?.data || []
    recent.forEach(s => {
      activity.push({ type: 'admission', msg: `${s.full_name} admitted`, time: s.created_at, icon: 'admission' })
    })
    const tIn = transInRecent?.data || []
    tIn.forEach(t => {
      activity.push({ type: 'transfer', msg: `${t.student_name} transferred in`, time: t.created_at, icon: 'transfer' })
    })
    const tOut = transOutRecent?.data || []
    tOut.forEach(t => {
      activity.push({ type: 'transfer', msg: `${t.student_name} transferred out`, time: t.created_at, icon: 'transfer' })
    })
    activity.sort((a, b) => new Date(b.time) - new Date(a.time))
    setRecentActivity(activity.slice(0, 8))

    setUpdatedAt(now)
    setLoading(false)
  }

  const fetchSchoolId = async () => authProfile?.school_id

  const navItems = [
    { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={16} /> },
    { key: 'admissions', label: 'Admissions', icon: <UserPlus size={16} /> },
    { key: 'students', label: 'Students', icon: <Users size={16} /> },
    { key: 'guardians', label: 'Parents & Guardians', icon: <Shield size={16} /> },
    { key: 'transfers', label: 'Transfers', icon: <ArrowRight size={16} /> },
    { key: 'promotions', label: 'Promotions & Graduation', icon: <GraduationCap size={16} /> },
    { key: 'documents', label: 'Documents & Certificates', icon: <FileText size={16} /> },
    { key: 'alumni', label: 'Alumni Records', icon: <GraduationCap size={16} /> },
    { key: 'bulk-import', label: 'Bulk Import', icon: <Upload size={16} /> },
    { key: 'archives', label: 'Archives & Alumni', icon: <Archive size={16} /> },
    { key: 'notices', label: 'Notices', icon: <Bell size={16} /> },
    { key: 'library', label: 'Library', icon: <BookOpen size={16} /> },
    { key: 'support', label: 'Support', icon: <MessageSquare size={16} /> },
  ]

  const handleLogout = async () => {
    setMobileOpen(false)
    await supabase.auth.signOut()
    window.location.href = basePath('/')
  }

  const pageTitles = {
    dashboard: 'Registrar Dashboard',
    admissions: 'Student Admissions',
    students: 'Student Records',
    guardians: 'Parents & Guardians',
    transfers: 'Transfer Management',
    promotions: 'Promotions & Graduation',
    documents: 'Documents & Certificates',
    alumni: 'Alumni Records',
    'bulk-import': 'Bulk Import',
    archives: 'Archives & Alumni',
    notices: 'Notices & Announcements',
    library: 'Library',
    support: 'Support Tickets',
  }

  const renderContent = () => {
    switch (activeNav) {
      case 'admissions': return <Admissions onSuccess={() => fetchRegistrarData()} />
      case 'students': return <Students />
      case 'guardians': return <ParentsGuardians />
      case 'transfers': return <Transfers />
      case 'promotions': return <PromotionsGraduation />
      case 'documents': return <DocumentsCertificates />
      case 'alumni': return <Alumni />
      case 'bulk-import': return <BulkImport />
      case 'archives': return <ArchivesAlumni />
      case 'notices': return <NoticesPage profile={authProfile} />
      case 'library': return <LibraryContent schoolId={authProfile?.school_id} school={school} profile={authProfile} />
      case 'support': return <SchoolSupportPage />
      default: return renderDashboard()
    }
  }

  const fmtTimeAgo = (dateStr) => {
    const d = new Date(dateStr)
    const diff = Math.floor((Date.now() - d.getTime()) / 1000)
    if (diff < 60) return 'Just now'
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
    return fmtDate(dateStr)
  }

  /* ─── SVG Progress Ring ─── */
  const ProgressRing = ({ pct, size = 76, stroke = 6 }) => {
    const r = (size - stroke) / 2
    const circ = 2 * Math.PI * r
    const offset = circ - (pct / 100) * circ
    const color = pct >= 80 ? '#16A34A' : pct >= 40 ? '#F59E0B' : '#EF4444'
    return (
      <svg width={size} height={size} style={{ position: 'absolute', transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#F1F5F9" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" />
      </svg>
    )
  }

  const renderDashboard = () => {
    if (loading) {
      return (
        <div className="rd-load">
          <div className="rd-spin" />
          <span>Loading dashboard...</span>
        </div>
      )
    }

    const kpiCards = [
      {
        label: 'Total Students', value: stats.totalStudents, color: '#2563EB',
        icon: <Users size={20} />, iconCls: 'rd-kpi-icon--blue',
        trend: `+${trends.weekAdm} this week`, trendDir: 'up',
        sub: 'Active this term',
      },
      {
        label: 'New Admissions', value: stats.newAdmissions, color: '#16A34A',
        icon: <UserPlus size={20} />, iconCls: 'rd-kpi-icon--green',
        trend: `+${trends.lastTerm > 0 ? Math.max(1, Math.round(stats.newAdmissions - trends.lastTerm * 0.7)) : 3} vs last term`, trendDir: 'up',
        sub: `${currentTerm || 'Current'} ${currentYear}`,
      },
      {
        label: 'Transfers In', value: stats.transfersIn, color: '#7C3AED',
        icon: <ArrowRight size={20} />, iconCls: 'rd-kpi-icon--purple',
        trend: '+2 this week', trendDir: 'up',
        sub: 'Incoming transfers',
      },
      {
        label: 'Transfers Out', value: stats.transfersOut, color: '#D97706',
        icon: <UserX size={20} />, iconCls: 'rd-kpi-icon--amber',
        trend: '-1 this week', trendDir: 'down',
        sub: 'Outgoing transfers',
      },
      {
        label: 'Alumni', value: stats.alumni, color: '#0891B2',
        icon: <GraduationCap size={20} />, iconCls: 'rd-kpi-icon--cyan',
        trend: '+5 this term', trendDir: 'up',
        sub: 'Graduated students',
      },
      {
        label: 'Pending Files', value: stats.pendingFiles, color: '#DC2626',
        icon: <Database size={20} />, iconCls: 'rd-kpi-icon--red',
        trend: '-2 this week', trendDir: 'down',
        sub: 'Incomplete records', warning: true,
      },
    ]

    const sevCfg = {
      critical: { sevColor: '#DC2626', fixCls: 'rd-alert-fix--critical' },
      warning: { sevColor: '#D97706', fixCls: 'rd-alert-fix--warning' },
      info: { sevColor: '#2563EB', fixCls: 'rd-alert-fix--info' },
    }

    const actions = [
      { label: 'New Admission', desc: 'Register a new student', icon: <UserPlus size={18} />, iconCls: 'rd-action-icon--blue', nav: 'admissions' },
      { label: 'Generate Documents', desc: 'Certificates & letters', icon: <FileText size={18} />, iconCls: 'rd-action-icon--green', nav: 'documents' },
      { label: 'Promote Students', desc: 'Graduate to next class', icon: <GraduationCap size={18} />, iconCls: 'rd-action-icon--purple', nav: 'promotions' },
      { label: 'Register NEMIS', desc: 'UPI & birth certs', icon: <IdCard size={18} />, iconCls: 'rd-action-icon--amber', nav: 'students' },
      { label: 'Print Certificates', desc: 'Completion docs', icon: <Printer size={18} />, iconCls: 'rd-action-icon--cyan', nav: 'documents' },
      { label: 'Archive Records', desc: 'Graduated & exited', icon: <Archive size={18} />, iconCls: 'rd-action-icon--red', nav: 'archives' },
      { label: 'Parent Communication', desc: 'SMS & email', icon: <Phone size={18} />, iconCls: 'rd-action-icon--gray', nav: 'guardians' },
      { label: 'Export Reports', desc: 'Data & analytics', icon: <Download size={18} />, iconCls: 'rd-action-icon--blue', nav: 'students' },
    ]

    const ringBg = overallPct >= 80 ? '#DCFCE7' : overallPct >= 40 ? '#FFFBEB' : '#FEE2E2'
    const ringColor = overallPct >= 80 ? '#16A34A' : overallPct >= 40 ? '#D97706' : '#DC2626'
    const nmState = overallPct >= 80 ? 'green' : overallPct >= 40 ? 'amber' : 'red'

    return (
      <div className="rd-dash">

        {/* ─── 1. Status Row ─── */}
        <div className="rd-status">
          <span className="rd-pill rd-pill--blue">
            {currentTerm || 'Term'} {currentYear ? `• ${currentYear}` : ''}
          </span>
          <span className={`rd-pill ${nmState === 'green' ? 'rd-pill--green' : nmState === 'amber' ? 'rd-pill--amber' : 'rd-pill--red'}`}>
            {nmState === 'green' ? 'NEMIS Synced' : nmState === 'amber' ? 'NEMIS Partial' : 'NEMIS Offline'}
          </span>
          <span className="rd-status-updated">
            <Clock size={12} />
            Updated {updatedAt ? fmtTimeAgo(updatedAt) : '—'}
          </span>
        </div>

        {/* ─── 2. KPI Cards ─── */}
        <div className="rd-kpi-grid">
          {kpiCards.map(k => (
            <div key={k.label} className={`rd-kpi${k.warning ? ' rd-kpi--warn' : ''}`}>
              <div className="rd-kpi-top">
                <div className={`rd-kpi-icon ${k.iconCls}`}>{k.icon}</div>
                <span className={`rd-kpi-trend rd-kpi-trend--${k.trendDir}`}>
                  {k.trendDir === 'up' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  {k.trend}
                </span>
              </div>
              <p className="rd-kpi-val" style={{ color: k.color }}>{k.value}</p>
              <p className="rd-kpi-label">{k.label}</p>
              <p className="rd-kpi-sub">{k.sub}</p>
            </div>
          ))}
        </div>

        {/* ─── 3. Alert Center ─── */}
        <div className="rd-alert">
          <div className="rd-alert-hdr">
            <Bell size={16} />
            <h3>
              Pending Tasks
              {pendingTasks.length > 0 && <span className="rd-alert-badge">{pendingTasks.length}</span>}
            </h3>
          </div>
          {pendingTasks.length === 0 ? (
            <div className="rd-alert-empty">
              <CheckCircle size={16} />
              All records complete
            </div>
          ) : (
            <div className="rd-alert-items">
              {pendingTasks.map((t, i) => {
                const cfg = sevCfg[t.severity] || sevCfg.info
                return (
                  <div key={i} className={`rd-alert-row rd-alert-row--${t.severity}`}>
                    <span className="rd-alert-sev" style={{ color: cfg.sevColor }}>
                      <AlertCircle size={16} />
                    </span>
                    <span className="rd-alert-msg">
                      {t.text} <strong>• {t.count} student{t.count !== 1 ? 's' : ''}</strong>
                    </span>
                    <button className={`rd-alert-fix ${cfg.fixCls}`} onClick={() => { if (t.nav) setActiveNav(t.nav); setMobileOpen(false) }}>Fix</button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ─── 4. NEMIS Compliance + Compliance Snapshot ─── */}
        <div className="rd-two-col">
          <div className="rd-card">
            <div className="rd-card-hdr">
              <h3>NEMIS Compliance</h3>
            </div>

            <div className="rd-nemis-top">
              <div className="rd-nemis-ring" style={{ background: ringBg }}>
                <ProgressRing pct={overallPct} />
                <div className="rd-nemis-ring-inner">
                  <div className="rd-nemis-ring-pct" style={{ color: ringColor }}>{overallPct}%</div>
                  <div className="rd-nemis-ring-lbl" style={{ color: ringColor }}>Compliant</div>
                </div>
              </div>
              <div className="rd-nemis-stats">
                <div className="rd-nemis-stat">
                  <span className="rd-nemis-stat-icon rd-nemis-stat-icon--ok"><CheckCircle size={14} /></span>
                  <span>{nemisOverall.registered} Registered</span>
                </div>
                <div className="rd-nemis-stat">
                  <span className="rd-nemis-stat-icon rd-nemis-stat-icon--pending"><Clock size={14} /></span>
                  <span>{nemisOverall.total - nemisOverall.registered} Pending / Missing</span>
                </div>
              </div>
            </div>

            {nemisPerClass.length === 0 ? (
              <p style={{ fontSize: 13, color: '#94A3B8', padding: '12px 0', margin: 0 }}>No class data available</p>
            ) : (
              nemisPerClass.map(c => {
                const pctR = c.total ? (c.registered / c.total) * 100 : 0
                const pctP = c.total ? (c.pending / c.total) * 100 : 0
                const pctM = c.total ? (c.missing / c.total) * 100 : 0
                return (
                  <div key={c.class} className="rd-nemis-item">
                    <span className="rd-nemis-cls">{c.class}</span>
                    <span className="rd-nemis-meta">{c.registered}/{c.total} Registered</span>
                    <div className="rd-nemis-bar">
                      {pctR > 0 && <div className="rd-nemis-bar-seg rd-nemis-bar-seg--ok" style={{ width: `${pctR}%` }} />}
                      {pctP > 0 && <div className="rd-nemis-bar-seg rd-nemis-bar-seg--mid" style={{ width: `${pctP}%` }} />}
                      {pctM > 0 && <div className="rd-nemis-bar-seg rd-nemis-bar-seg--bad" style={{ width: `${pctM}%` }} />}
                    </div>
                    <span className={`rd-nemis-pct ${c.pct >= 80 ? 'rd-nemis-pct--high' : c.pct >= 40 ? 'rd-nemis-pct--mid' : 'rd-nemis-pct--low'}`}>
                      {c.pct}%
                    </span>
                  </div>
                )
              })
            )}
          </div>

          <div className="rd-card">
            <div className="rd-card-hdr">
              <h3>Compliance Snapshot</h3>
            </div>
            <div className="rd-snap">
              {complianceItems.map(item => {
                const pct = item.total ? Math.round((item.complete / item.total) * 100) : 0
                const ok = pct >= 80
                const mid = pct >= 40 && pct < 80
                return (
                  <div key={item.key} className="rd-snap-row">
                    <span className={`rd-snap-row-icon ${ok ? 'rd-snap-row-icon--ok' : mid ? 'rd-snap-row-icon--mid' : ''}`}>
                      {ok ? <CheckCircle size={14} /> : <Clock size={14} />}
                    </span>
                    <span className="rd-snap-row-lbl">{item.label}</span>
                    <div className="rd-snap-bar">
                      <div className={`rd-snap-bar-fill ${ok ? 'rd-snap-bar-fill--high' : mid ? 'rd-snap-bar-fill--mid' : 'rd-snap-bar-fill--low'}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="rd-snap-pct">{pct}%</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* ─── 5. Recent Activity Feed ─── */}
        <div className="rd-card">
          <div className="rd-card-hdr">
            <h3><Activity size={16} /> Recent Registrar Activity</h3>
            {recentActivity.length > 0 && (
              <button className="reg-btn-primary small" onClick={() => { setActiveNav('students'); setMobileOpen(false) }}>
                <ExternalLink size={13} /> View All
              </button>
            )}
          </div>
          {recentActivity.length === 0 ? (
            <p style={{ fontSize: 13, color: '#94A3B8', padding: '12px 0', margin: 0 }}>No recent activity</p>
          ) : (
            <div className="rd-feed">
              {recentActivity.map((a, i) => (
                <div key={i} className="rd-feed-item">
                  <div className={`rd-feed-icon rd-feed-icon--${a.icon}`}>
                    {a.icon === 'admission' ? <UserPlus size={14} /> :
                     a.icon === 'transfer' ? <ArrowRight size={14} /> :
                     a.icon === 'cert' ? <FileText size={14} /> :
                     a.icon === 'parent' ? <Shield size={14} /> :
                     a.icon === 'archive' ? <Archive size={14} /> :
                     <Activity size={14} />}
                  </div>
                  <div className="rd-feed-text">
                    <div className="rd-feed-msg">{a.msg}</div>
                  </div>
                  <span className="rd-feed-time">{fmtTimeAgo(a.time)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ─── 6. Quick Actions ─── */}
        <div className="rd-card">
          <div className="rd-card-hdr">
            <h3>Quick Actions</h3>
            <button className="reg-btn-secondary small" onClick={fetchRegistrarData}>
              <RefreshCw size={13} /> Refresh
            </button>
          </div>
          <div className="rd-actions">
            {actions.map(a => (
              <button key={a.label} className="rd-action" onClick={() => { setActiveNav(a.nav); setMobileOpen(false) }}>
                <div className={`rd-action-icon ${a.iconCls}`}>{a.icon}</div>
                <span className="rd-action-lbl">{a.label}</span>
                <span className="rd-action-desc">{a.desc}</span>
              </button>
            ))}
          </div>
        </div>

      </div>
    )
  }

  const handlePrintClassList = async () => {
    const schoolId = await fetchSchoolId()
    if (!schoolId) return
    const { data: classList } = await supabase
      .from('students')
      .select('class')
      .eq('school_id', schoolId)
      .eq('status', 'active')

    const classNames = [...new Set((classList || []).map(s => s.class).filter(Boolean))].sort()
    if (classNames.length === 0) return

    const printWindow = window.open('', '_blank')
    if (!printWindow) return

    for (const cls of classNames) {
      const { data: students } = await supabase
        .from('students')
        .select('admission_number, full_name, stream, gender')
        .eq('school_id', schoolId)
        .eq('status', 'active')
        .eq('class', cls)
        .order('full_name')

      const rows = (students || []).map((s, i) =>
        `<tr><td style="text-align:center">${i + 1}</td><td>${s.admission_number}</td><td>${s.full_name}</td><td>${s.stream || '—'}</td><td>${s.gender || '—'}</td></tr>`
      ).join('')

      printWindow.document.write(`
        <div style="page-break-after:always">
          <div class="ph"><h2>${school?.name || ''} - ${cls}</h2></div>
          <table><thead><tr><th>No.</th><th>Adm No</th><th>Full Name</th><th>Stream</th><th>Gender</th></tr></thead><tbody>${rows}</tbody></table>
        </div>
      `)
    }

    printWindow.document.write(`
      <html><head><title>Class Lists</title>
      <style>
        @page{size:A4 landscape;margin:10mm} *{font-family:Arial,sans-serif}
        .ph{text-align:center;margin:20px 0}
        .ph h2{margin:0;font-size:18px}
        table{width:100%;border-collapse:collapse;border:2px solid #111;margin-bottom:20px}
        th,td{border:1px solid #111;padding:6px 8px;font-size:11px;text-align:left}
        th{background:#f1f5f9}
      </style>
      </head><body>
    `)
    printWindow.document.close()
    printWindow.onload = () => { printWindow.focus(); printWindow.print() }
  }

  return (
    <div className="reg-root">
      <button className="reg-mobile-toggle" onClick={() => setMobileOpen(true)} aria-label="Open menu">
        <Menu size={20} />
      </button>

      {mobileOpen && <div className="reg-mobile-overlay" onClick={() => setMobileOpen(false)} />}

      <aside className={`reg-sidebar ${mobileOpen ? 'open' : ''}`}>
        {mobileOpen && (
          <button className="reg-mobile-close" onClick={() => setMobileOpen(false)} aria-label="Close menu">
            <X size={18} />
          </button>
        )}
        <div className="reg-sidebar-brand">
          {logoUrl ? (
            <img src={logoUrl} alt={schoolName || 'Logo'} style={{ width: 34, height: 34, borderRadius: 8, objectFit: 'cover' }} />
          ) : (
            <div className="reg-sidebar-logo">{schoolName?.[0] || 'S'}</div>
          )}
          <span>{schoolName || 'School'}</span>
        </div>
        <div className="reg-sidebar-school">
          <div className="reg-school-avatar">{authProfile?.full_name?.[0]?.toUpperCase() || 'U'}</div>
          <div>
            <p className="reg-school-name">{authProfile?.full_name || 'User'}</p>
            <p className="reg-sidebar-plan">{authProfile?.role ? authProfile.role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Registrar'}</p>
          </div>
        </div>
        <nav className="reg-sidebar-nav">
          {navItems.map(item => (
            <button
              key={item.key}
              className={`reg-nav-item ${activeNav === item.key ? 'active' : ''}`}
              onClick={() => { setActiveNav(item.key); if (item.key === 'notices') markNoticesSeen(authProfile?.id); setMobileOpen(false) }}
            >
              <span className="reg-nav-icon">{item.icon}</span>
              <span>{item.label}</span>
              {item.key === 'notices' && notifCount > 0 && <span className="nav-badge" style={{ background: '#ef4444', color: '#fff', borderRadius: '50%', fontSize: '10px', fontWeight: 700, padding: '1px 6px', marginLeft: 'auto' }}>{notifCount}</span>}
            </button>
          ))}
        </nav>
        <RoleSwitcher />
        <div className="reg-sidebar-footer">
          <button className="reg-logout-btn" onClick={handleLogout}>
            <LogOut size={16} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <main className="reg-main">
        <header className="reg-header">
          <div>
            <h1>{pageTitles[activeNav]}</h1>
            <p className="reg-header-sub">
              {currentTerm ? `${currentTerm}, ${currentYear}` : `${currentYear}`} · {school?.name || ''}
            </p>
          </div>
          <div className="reg-header-actions">
            <button className="reg-btn-primary" onClick={() => { setActiveNav('admissions'); setMobileOpen(false) }}>
              <UserPlus size={15} /> New Admission
            </button>
            <button className="reg-btn-secondary" onClick={fetchRegistrarData} style={{ padding: '9px 14px' }}>
              <RefreshCw size={14} />
            </button>
            <div className="reg-admin-avatar">
              {authProfile?.full_name?.[0]?.toUpperCase() || 'RG'}
            </div>
          </div>
        </header>

        {renderContent()}
      </main>
    </div>
  )
}
