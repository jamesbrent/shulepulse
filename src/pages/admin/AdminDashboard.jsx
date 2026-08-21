import FeesPage from './fees/FeesPage'
import './FeesPage.css'
import { useState, useEffect, useCallback } from 'react'
import {
  LayoutDashboard, Users, DollarSign, ClipboardList,
  BarChart2, BarChart3, GraduationCap, Palette, Settings, LogOut,
  Upload, UserPlus, UserCheck, ChevronRight, Calendar, MessageSquare, Shield, Archive,
  FileCheck, TrendingUp, FileText, Award, BookOpen, Star,
  ChevronDown, Menu, X, UserCircle, Receipt, CreditCard,
  FileBarChart, GraduationCap as GraduationIcon, Repeat,
  Bell, AlertTriangle, CheckCircle2, Clock, Search,
  ChevronLeft, Activity, ArrowUpRight, ArrowDownRight,
  Plus, Banknote, FileOutput, ClipboardCheck, Users2,
  Printer, Send, Download, Wallet, Landmark, PencilLine, Briefcase,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { supabase } from '../../lib/supabase'
import { basePath } from '../../lib/paths'
import { useAuthStore } from '../../store/authStore'
import { useSchool } from './useSchool'
import { fmt, fmtDate } from './fees/utils/feesHelpers'
import './AdminDashboard.css'
import StudentsPage from './StudentsPage'
import './StudentsPage.css'
import AttendancePage from './AttendancePage'
import './AttendancePage.css'
import GradesPage from './GradesPage'
import './GradesPage.css'
import MarksEntry from '../teacher/MarksEntry'
import '../teacher/MarksEntry.css'
import TeachersPage from './TeachersPage'
import './TeachersPage.css'
import BrandingPage from '../../features/branding/BrandingSettingsPage'
import '../../features/branding/BrandingSettingsPage.css'
import SettingsPage from './SettingsPage'
import { useBrandingStore } from '../../features/branding/brandingStore'
import './SettingsPage.css'
import TimetablePage from './TimetablePage'
import './TimetablePage.css'
import StaffRoles from './StaffRoles'
import './StaffRoles.css'
import NonTeachingStaff from './NonTeachingStaff'
import './NonTeachingStaff.css'
import CommentsPage from './Comments'
import './Comments.css'
import AdminAlumni from './Alumni'
import SchoolSupportPage from '../../features/support/SchoolSupportPage'
import '../../features/support/SchoolSupportPage.css'
import RoleSwitcher from '../../components/RoleSwitcher'
import LibraryContent from '../library/LibraryContent'
import { useNoticeCount, markNoticesSeen } from '../../hooks/useNoticeCount'

import ExamSetup from '../HOD/ExamSetup'
import MarksApproval from '../HOD/MarksApproval'
import DeptAnalytics from '../HOD/DeptAnalytics'
import ReportCenter from '../HOD/ReportCenter'
import SubjectPerformance from '../HOD/SubjectPerformance'
import TeacherReview from '../HOD/TeacherReview'
import DeptExams from '../HOD/DeptExams'
import '../../pages/HOD/HODDashboard.css'

import AdminNotifications from './AdminNotifications'
import './AdminNotifications.css'

import CBCCompetency from '../teacher/CBCCompetency'
import '../../pages/teacher/CBCCompetency.css'

import StaffDirectory from './StaffDirectory'
import './StaffDirectory.css'

import PayrollPage from '../Finance/Payroll'
import '../Finance/Payroll.css'

import AccountsPayablePage from '../Finance/AccountsPayable'
import '../Finance/AccountsPayable.css'

import FinancePaymentsPage from '../Finance/Payments'
import '../Finance/Payments.css'
import ReceiptsPage from '../Finance/Receipts'
import '../Finance/Receipts.css'
import StatementsPage from '../Finance/Statements'
import '../Finance/Statements.css'
import AccountingPage from '../Finance/Accounting'
import '../Finance/Accounting.css'
import ExpensesPage from '../Finance/Expenses'
import '../Finance/Expenses.css'
import CashBankPage from '../Finance/CashBank'
import '../Finance/CashBank.css'
import AssetsPage from '../Finance/Assets'
import '../Finance/Assets.css'
import FinanceReportsPage from '../Finance/Reports'
import '../Finance/Reports.css'
import FinancialStatementsPage from '../Finance/FinancialStatements'
import '../Finance/FinancialStatements.css'

const STORAGE_KEY = 'admin_sidebar_expanded'

const NAV_GROUPS = [
  {
    id: 'students',
    label: 'Students',
    icon: <Users size={16} />,
    items: [
      { key: 'students', label: 'Student Records', icon: <Users size={14} /> },
      { key: 'attendance', label: 'Attendance', icon: <ClipboardList size={14} /> },
      { key: 'alumni', label: 'Alumni & Archives', icon: <Archive size={14} /> },
    ],
  },
  {
    id: 'academics',
    label: 'Academics',
    icon: <BookOpen size={16} />,
    items: [
      { key: 'grades', label: 'Grades', icon: <BarChart2 size={14} /> },
      { key: 'marks_entry', label: 'Marks Entry', icon: <PencilLine size={14} /> },
      { key: 'exam_setup', label: 'Exam Setup', icon: <Settings size={14} /> },
      { key: 'marks_approval', label: 'Marks Approval', icon: <FileCheck size={14} /> },
      { key: 'dept_exams', label: 'Exam Reviews', icon: <ClipboardList size={14} /> },
      { key: 'subject_perf', label: 'Subject Performance', icon: <TrendingUp size={14} /> },
      { key: 'teacher_review', label: 'Teacher Review', icon: <Star size={14} /> },
      { key: 'cbc_competency', label: 'Overall Performance Analysis', icon: <Award size={14} /> },
      { key: 'timetable', label: 'Timetable', icon: <Calendar size={14} /> },
      { key: 'library', label: 'Library', icon: <BookOpen size={14} /> },
    ],
  },
  {
    id: 'finance',
    label: 'Finance',
    icon: <DollarSign size={16} />,
    items: [
      { key: 'fees', label: 'Fees', icon: <DollarSign size={14} /> },
      { key: 'payments', label: 'Payments', icon: <CreditCard size={14} /> },
      { key: 'receipts', label: 'Receipts', icon: <Receipt size={14} /> },
      { key: 'statements', label: 'Statements', icon: <FileText size={14} /> },
      { key: 'accounting', label: 'Accounting', icon: <BookOpen size={14} /> },
      { key: 'expenses', label: 'Expenses', icon: <Receipt size={14} /> },
      { key: 'cash_bank', label: 'Cash & Bank', icon: <Landmark size={14} /> },
      { key: 'assets', label: 'Assets', icon: <Archive size={14} /> },
      { key: 'payroll', label: 'Payroll', icon: <Wallet size={14} /> },
      { key: 'ap', label: 'Accounts Payable', icon: <Receipt size={14} /> },
      { key: 'finance_reports', label: 'Finance Reports', icon: <BarChart2 size={14} /> },
      { key: 'financial_statements', label: 'Financial Statements', icon: <BarChart3 size={14} /> },
    ],
  },
  {
    id: 'staff',
    label: 'Staff',
    icon: <GraduationCap size={16} />,
    items: [
      { key: 'teachers', label: 'Teachers', icon: <GraduationCap size={14} /> },
      { key: 'staffroles', label: 'Staff Roles', icon: <Shield size={14} /> },
      { key: 'non_teaching', label: 'Non-Teaching Staff', icon: <Briefcase size={14} /> },
      { key: 'comments', label: 'Comments', icon: <MessageSquare size={14} /> },
    ],
  },
  {
    id: 'hr',
    label: 'HR Management',
    icon: <Users2 size={16} />,
    items: [
      { key: 'staff_directory', label: 'Staff Directory', icon: <Users size={14} /> },
    ],
  },
  {
    id: 'reports',
    label: 'Reports',
    icon: <FileText size={16} />,
    items: [
      { key: 'reports', label: 'Reports & Results', icon: <FileText size={14} /> },
      { key: 'analytics', label: 'Performance Analytics', icon: <BarChart2 size={14} /> },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: <Settings size={16} />,
    items: [
      { key: 'branding', label: 'Branding', icon: <Palette size={14} /> },
      { key: 'support', label: 'Support', icon: <MessageSquare size={14} /> },
      { key: 'settings_page', label: 'General Settings', icon: <Settings size={14} /> },
    ],
  },
]

const pageTitles = {
  dashboard: 'Admin Dashboard',
  students: 'Student Records',
  fees: 'Fee Management',
  ap: 'Accounts Payable',
  attendance: 'Attendance',
  grades: 'Grades',
  marks_entry: 'Marks Entry',
  teachers: 'Teachers',
  alumni: 'Alumni & Archives',
  staffroles: 'Staff Roles',
  non_teaching: 'Non-Teaching Staff',
  comments: 'Comments',
  timetable: 'Timetable',
  branding: 'Branding',
  support: 'Support',
  settings_page: 'General Settings',
  exam_setup: 'Exam Setup',
  marks_approval: 'Marks Approval',
  dept_exams: 'Exam Reviews',
  subject_perf: 'Subject Performance',
  analytics: 'Performance Analytics',
  reports: 'Reports & Results',
  teacher_review: 'Teacher Review',
  cbc_competency: 'Overall Performance Analysis',
  payments: 'Payments',
  receipts: 'Receipts',
  statements: 'Statements',
  accounting: 'Accounting',
  expenses: 'Expenses',
  cash_bank: 'Cash & Bank',
  assets: 'Assets',
  finance_reports: 'Finance Reports',
  financial_statements: 'Financial Statements',
  notifications: 'Notices',
  staff_directory: 'Staff Directory',
}

const QUICK_ACTIONS = [
  { key: 'students', label: 'New Admission', icon: <UserPlus size={18} />, color: '#2563eb' },
  { key: 'fees', label: 'Record Payment', icon: <Banknote size={18} />, color: '#16a34a' },
  { key: 'reports', label: 'Generate Report', icon: <FileOutput size={18} />, color: '#7c3aed' },
  { key: 'attendance', label: 'Take Attendance', icon: <ClipboardCheck size={18} />, color: '#f59e0b' },
  { key: 'students', label: 'Promote Students', icon: <Users2 size={18} />, color: '#0ea5e9' },
  { key: 'reports', label: 'Print Certificates', icon: <Printer size={18} />, color: '#ec4899' },
  { key: 'comments', label: 'Send Parent Notice', icon: <Send size={18} />, color: '#8b5cf6' },
  { key: 'fees', label: 'Export Data', icon: <Download size={18} />, color: '#64748b' },
]

const ROWS_PER_PAGE = 5

export default function AdminDashboard() {
  const { profile: authProfile } = useAuthStore()
  const { school, currentTerm, currentYear } = useSchool()
  const { logoUrl, schoolName } = useBrandingStore()
  const [activeNav, setActiveNav] = useState('dashboard')
  const [studentAddPending, setStudentAddPending] = useState(false)
  const goAddStudent = () => { setStudentAddPending(true); handleNav('students') }
  const [expandedGroup, setExpandedGroup] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) || null } catch { return null }
  })
  const [mobileOpen, setMobileOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [stats, setStats] = useState({
    totalStudents: 0,
    totalCollected: 0,
    staffMembers: 0,
    attendanceToday: 0,
  })
  const [alerts, setAlerts] = useState([])
  const [recentFees, setRecentFees] = useState([])
  const [trendData, setTrendData] = useState([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [pendingAp, setPendingAp] = useState(0)
  const notifCount = useNoticeCount(authProfile?.school_id, authProfile?.id)

  useEffect(() => {
    fetchDashboardData()
  }, [currentTerm, currentYear])

  const fetchDashboardData = async () => {
    setLoading(true)

    const { data: profile } = await supabase
      .from('profiles')
      .select('school_id')
      .eq('id', (await supabase.auth.getUser()).data.user.id)
      .single()

    const schoolId = profile?.school_id
    if (!schoolId) { setLoading(false); return }

    const [studentRes, feeRes, staffRes, attendanceRes, recentRes, pendingExamRes, pendingMarksRes, trendRes, apInvRes, apPayRes, apCfgRes] = await Promise.all([
      supabase
        .from('students')
        .select('*', { count: 'exact', head: true })
        .eq('school_id', schoolId)
        .eq('status', 'active'),
      supabase
        .from('fee_payments')
        .select('amount')
        .eq('school_id', schoolId)
        .eq('term', currentTerm)
        .eq('year', currentYear),
      supabase
        .from('teachers')
        .select('*', { count: 'exact', head: true })
        .eq('school_id', schoolId),
      supabase
        .from('attendance')
        .select('*', { count: 'exact', head: true })
        .eq('school_id', schoolId)
        .eq('date', new Date().toISOString().split('T')[0])
        .eq('status', 'present'),
      supabase
        .from('fee_payments')
        .select('*, students(full_name, class, stream, admission_number)')
        .eq('school_id', schoolId)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('question_papers')
        .select('*', { count: 'exact', head: true })
        .eq('school_id', schoolId)
        .eq('status', 'pending'),
      supabase
        .from('grades')
        .select('*', { count: 'exact', head: true })
        .eq('school_id', schoolId)
        .eq('status', 'draft'),
      supabase
        .from('fee_payments')
        .select('transaction_date, amount')
        .eq('school_id', schoolId)
        .eq('term', currentTerm)
        .eq('year', currentYear)
        .order('transaction_date', { ascending: true }),
      supabase
        .from('ap_invoices')
        .select('id', { count: 'exact', head: true })
        .eq('school_id', schoolId)
        .in('status', ['submitted', 'reviewed']),
      supabase
        .from('ap_payments')
        .select('id', { count: 'exact', head: true })
        .eq('school_id', schoolId)
        .in('status', ['submitted', 'reviewed']),
      supabase
        .from('ap_tax_config')
        .select('id', { count: 'exact', head: true })
        .eq('school_id', schoolId)
        .eq('status', 'pending'),
    ])

    const totalCollected = (feeRes.data || []).reduce((s, p) => s + Number(p.amount), 0)

    const totalStudents = studentRes.count || 0
    const attendanceToday = attendanceRes.count || 0

    setStats({
      totalStudents,
      totalCollected,
      staffMembers: staffRes.count || 0,
      attendanceToday,
    })

    const generatedAlerts = []
    if ((pendingExamRes.count || 0) > 0) {
      generatedAlerts.push({
        id: 'exams',
        severity: 'warning',
        label: 'Exam Papers Pending',
        detail: `${pendingExamRes.count} exam file(s) awaiting review`,
        action: 'marks_approval',
      })
    }
    if ((pendingMarksRes.count || 0) > 0) {
      generatedAlerts.push({
        id: 'marks',
        severity: 'info',
        label: 'Draft Grades',
        detail: `${pendingMarksRes.count} grade entries not yet submitted`,
        action: 'grades',
      })
    }
    if (totalStudents > 0 && attendanceToday > 0) {
      const rate = Math.round((attendanceToday / totalStudents) * 100)
      if (rate < 80) {
        generatedAlerts.push({
          id: 'attendance',
          severity: 'danger',
          label: 'Low Attendance',
          detail: `Today's attendance is ${rate}% — below 80% threshold`,
          action: 'attendance',
        })
      }
    }
    setAlerts(generatedAlerts)

    setPendingAp((apInvRes.count || 0) + (apPayRes.count || 0) + (apCfgRes.count || 0))

    const enriched = await enrichWithStaffNames(recentRes.data || [])
    setRecentFees(enriched)

    const trendRows = trendRes.data || []
    const weekMap = {}
    trendRows.forEach(r => {
      const d = new Date(r.transaction_date)
      const start = new Date(d)
      start.setDate(d.getDate() - d.getDay())
      const key = start.toISOString().slice(0, 10)
      if (!weekMap[key]) weekMap[key] = 0
      weekMap[key] += Number(r.amount)
    })
    const sorted = Object.entries(weekMap).sort((a, b) => a[0].localeCompare(b[0]))
    const chartFormatted = sorted.map(([weekStart, total]) => {
      const d = new Date(weekStart)
      const end = new Date(d)
      end.setDate(d.getDate() + 6)
      const fmtShort = (dt) => `${dt.toLocaleString('en', { month: 'short' })} ${dt.getDate()}`
      return { week: `${fmtShort(d)}–${fmtShort(end)}`, amount: total }
    })
    setTrendData(chartFormatted)

    setLastUpdated(new Date())
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

  const handleNav = useCallback((key) => {
    setActiveNav(key)
    setMobileOpen(false)
    setPage(1)
    if (key === 'notifications') markNoticesSeen(authProfile?.id)
    const group = NAV_GROUPS.find(g => g.items.some(i => i.key === key))
    if (group) {
      setExpandedGroup(group.id)
      try { localStorage.setItem(STORAGE_KEY, group.id) } catch {}
    }
  }, [])

  const toggleGroup = useCallback((groupId) => {
    setExpandedGroup(prev => {
      const next = prev === groupId ? null : groupId
      try { localStorage.setItem(STORAGE_KEY, next || '') } catch {}
      return next
    })
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = basePath('/')
  }

  const renderContent = () => {
    switch (activeNav) {
      case 'students':       return <StudentsPage initialAdd={studentAddPending} onAddHandled={() => setStudentAddPending(false)} />
      case 'fees':           return <FeesPage />
      case 'payments':       return <FinancePaymentsPage />
      case 'receipts':       return <ReceiptsPage />
      case 'statements':     return <StatementsPage />
      case 'accounting':     return <AccountingPage />
      case 'expenses':       return <ExpensesPage />
      case 'cash_bank':      return <CashBankPage />
      case 'assets':         return <AssetsPage />
      case 'payroll':        return <PayrollPage />
      case 'ap':             return <AccountsPayablePage />
      case 'finance_reports': return <FinanceReportsPage />
      case 'financial_statements': return <FinancialStatementsPage />
      case 'attendance':     return <AttendancePage />
      case 'grades':         return <GradesPage />
      case 'marks_entry':    return <MarksEntry profile={authProfile} />
      case 'teachers':       return <TeachersPage />
      case 'alumni':         return <AdminAlumni />
      case 'comments':       return <CommentsPage />
      case 'staffroles':     return <StaffRoles />
      case 'non_teaching':   return <NonTeachingStaff />
      case 'timetable':      return <TimetablePage />
      case 'branding':       return <BrandingPage />
      case 'support':        return <SchoolSupportPage />
      case 'settings_page':  return <SettingsPage />
      case 'exam_setup':     return <ExamSetup />
      case 'marks_approval': return <MarksApproval />
      case 'dept_exams':     return <DeptExams />
      case 'subject_perf':   return <SubjectPerformance />
      case 'analytics':      return <DeptAnalytics />
      case 'reports':        return <ReportCenter />
      case 'teacher_review': return <TeacherReview />
      case 'cbc_competency': return <CBCCompetency mode="admin" />
      case 'staff_directory': return <StaffDirectory />
      case 'library':        return <LibraryContent schoolId={authProfile?.school_id} school={school} profile={authProfile} />
      case 'notifications': return <AdminNotifications />
      default:               return renderDashboard()
    }
  }

  const totalPages = Math.ceil(recentFees.length / ROWS_PER_PAGE)
  const pagedFees = recentFees.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE)

  const renderDashboard = () => {
    if (loading) return <div className="loading-state">Loading dashboard...</div>

    const now = lastUpdated
    const timeStr = now ? now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—'
    const dateStr = now ? now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '—'
    const attendanceRate = stats.totalStudents > 0 ? Math.round((stats.attendanceToday / stats.totalStudents) * 100) : 0

    return (
      <>
        {/* ── Compact Header ── */}
        <div className="adm-dash-header">
          <div className="adm-dash-left">
            <h1 className="adm-dash-title">{pageTitles[activeNav] || 'Dashboard'}</h1>
            <div className="adm-dash-meta">
              {currentTerm && <span className="adm-term-badge">{currentTerm} &bull; {currentYear}</span>}
              <span className="adm-dash-school">{school?.name || ''}</span>
              <span className="adm-dash-sep">&middot;</span>
              <span className="adm-dash-time">
                <Clock size={12} />
                Updated {timeStr}
              </span>
            </div>
          </div>
          <div className="adm-dash-actions">
            <div className="admin-avatar">
              {authProfile?.full_name?.[0]?.toUpperCase() || 'AD'}
            </div>
          </div>
        </div>

        {/* ── KPI Row ── */}
        <div className="adm-kpi-row">
          <div className="adm-kpi-card">
            <div className="adm-kpi-icon blue"><Users size={18} /></div>
            <div className="adm-kpi-body">
              <p className="adm-kpi-label">Total Students</p>
              <p className="adm-kpi-value">{stats.totalStudents.toLocaleString()}</p>
              <p className="adm-kpi-sub"><ArrowUpRight size={12} /> Active enrollment</p>
            </div>
          </div>
          <div className="adm-kpi-card">
            <div className="adm-kpi-icon green"><DollarSign size={18} /></div>
            <div className="adm-kpi-body">
              <p className="adm-kpi-label">Fees Collected</p>
              <p className="adm-kpi-value">{fmt(stats.totalCollected)}</p>
              <p className="adm-kpi-sub">{currentTerm || 'Current'} {currentYear}</p>
            </div>
          </div>
          <div className="adm-kpi-card">
            <div className="adm-kpi-icon blue"><UserCheck size={18} /></div>
            <div className="adm-kpi-body">
              <p className="adm-kpi-label">Staff Members</p>
              <p className="adm-kpi-value">{stats.staffMembers.toLocaleString()}</p>
              <p className="adm-kpi-sub">All roles</p>
            </div>
          </div>
          <div className="adm-kpi-card">
            <div className="adm-kpi-icon amber"><ClipboardList size={18} /></div>
            <div className="adm-kpi-body">
              <p className="adm-kpi-label">Present Today</p>
              <p className="adm-kpi-value">{stats.attendanceToday.toLocaleString()}</p>
              <p className="adm-kpi-sub">{attendanceRate}% attendance rate</p>
            </div>
          </div>
        </div>

        {/* ── Analytics Row ── */}
        <div className="adm-analytics-row">
          {/* Left column: Chart + Table */}
          <div className="adm-dash-left-col">
            <div className="adm-card adm-chart-card">
              <div className="adm-card-header">
                <h3>Collection Trend</h3>
                <span className="adm-card-badge">This Term</span>
              </div>
              {trendData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={trendData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="week" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis fontSize={10} tickLine={false} axisLine={false} />
                    <Tooltip formatter={(v) => fmt(v)} />
                    <Bar dataKey="amount" fill="#2563eb" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="adm-chart-empty">
                  <Activity size={28} />
                  <p>No collection data yet this term</p>
                </div>
              )}
            </div>

            <div className="adm-card adm-table-card">
              <div className="adm-card-header">
                <h3>Recent Fee Payments</h3>
                <button className="adm-btn-text" onClick={() => handleNav('fees')}>
                  View all <ChevronRight size={14} />
                </button>
              </div>
              {recentFees.length === 0 ? (
                <p className="adm-empty">No payments yet this term</p>
              ) : (
                <>
                  <div className="adm-table-wrap">
                    <table className="adm-table">
                      <colgroup>
                        <col />
                        <col />
                        <col />
                        <col />
                        <col />
                        <col />
                      </colgroup>
                      <thead>
                        <tr>
                          <th>Student</th>
                          <th>Class</th>
                          <th style={{ textAlign: 'right' }}>Amount</th>
                          <th>Method</th>
                          <th>Date</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedFees.map((f) => {
                          const st = f.cheque_status
                            ? { pending: { label: 'Pending', cls: 'pending' }, cleared: { label: 'Cleared', cls: 'paid' }, bounced: { label: 'Bounced', cls: 'bounced' } }[f.cheque_status]
                            : null
                          return (
                            <tr key={f.id}>
                              <td className="adm-td-name">{f.students?.full_name || '—'}</td>
                              <td>{f.students?.class || '—'}{f.students?.stream ? ` ${f.students.stream}` : ''}</td>
                              <td className="adm-td-amount">{fmt(f.amount)}</td>
                              <td className="adm-td-method">{f.payment_type || f.payment_method || '—'}</td>
                              <td className="adm-td-date">{fmtDate(f.transaction_date)}</td>
                              <td>
                                {st ? (
                                  <span className={`adm-badge ${st.cls}`}>{st.label}</span>
                                ) : (
                                  <span className="adm-badge paid">Completed</span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  {totalPages > 1 && (
                    <div className="adm-pagination">
                      <span className="adm-page-info">
                        Showing {(page - 1) * ROWS_PER_PAGE + 1}–{Math.min(page * ROWS_PER_PAGE, recentFees.length)} of {recentFees.length}
                      </span>
                      <div className="adm-page-btns">
                        <button className="adm-page-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                          <ChevronLeft size={14} />
                        </button>
                        {Array.from({ length: totalPages }, (_, i) => (
                          <button
                            key={i + 1}
                            className={`adm-page-btn ${page === i + 1 ? 'active' : ''}`}
                            onClick={() => setPage(i + 1)}
                          >
                            {i + 1}
                          </button>
                        ))}
                        <button className="adm-page-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Right column: Alerts + Quick Actions */}
          <div className="adm-card adm-alerts-card">
            <div className="adm-card-header">
              <h3>Operational Alerts</h3>
              {alerts.length > 0 && <span className="adm-alert-count">{alerts.length}</span>}
            </div>
            {alerts.length === 0 ? (
              <div className="adm-alerts-empty">
                <CheckCircle2 size={28} />
                <p>All systems operational</p>
              </div>
            ) : (
              <div className="adm-alerts-list">
                {alerts.map(a => (
                  <button
                    key={a.id}
                    className={`adm-alert-item severity-${a.severity}`}
                    onClick={() => handleNav(a.action)}
                  >
                    <div className="adm-alert-icon">
                      {a.severity === 'danger' ? <AlertTriangle size={16} /> :
                       a.severity === 'warning' ? <Clock size={16} /> :
                       <Bell size={16} />}
                    </div>
                    <div className="adm-alert-body">
                      <p className="adm-alert-label">{a.label}</p>
                      <p className="adm-alert-detail">{a.detail}</p>
                    </div>
                    <ChevronRight size={14} className="adm-alert-arrow" />
                  </button>
                ))}
              </div>
            )}
            <div className="adm-card-divider" />
            <div className="adm-card-header">
              <h3>Quick Actions</h3>
            </div>
            <div className="adm-quick-grid">
              {QUICK_ACTIONS.map((a, i) => (
                <button key={i} className="adm-quick-tile" onClick={() => handleNav(a.key)}>
                  <div className="adm-quick-icon" style={{ color: a.color, background: `${a.color}12` }}>
                    {a.icon}
                  </div>
                  <span className="adm-quick-label">{a.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </>
    )
  }

  const isGroupActive = (group) => group.items.some(i => i.key === activeNav)

  const sidebarContent = (
    <>
      <div className="adm-sidebar-brand">
        {logoUrl ? (
          <img src={logoUrl} alt={schoolName || 'Logo'} className="adm-brand-logo" />
        ) : (
          <div className="adm-brand-icon">{schoolName?.[0] || 'S'}</div>
        )}
        <span className="adm-brand-text">{schoolName || 'School'}</span>
      </div>

      <div className="adm-workspace">
        <div className="adm-ws-avatar">{authProfile?.full_name?.[0]?.toUpperCase() || 'U'}</div>
        <div className="adm-ws-info">
          <p className="adm-ws-name">{authProfile?.full_name || 'User'}</p>
          <p className="adm-ws-plan">{authProfile?.role ? authProfile.role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Admin'}</p>
        </div>
      </div>

      <nav className="adm-nav">
        <button
          className={`adm-nav-top ${activeNav === 'dashboard' ? 'active' : ''}`}
          onClick={() => handleNav('dashboard')}
        >
          <LayoutDashboard size={16} />
          <span>Dashboard</span>
        </button>

        {NAV_GROUPS.map(group => {
          const isOpen = expandedGroup === group.id
          const hasActive = isGroupActive(group)
          return (
            <div key={group.id}>
              <div className={`adm-group ${isOpen ? 'open' : ''} ${hasActive && !isOpen ? 'has-active' : ''}`}>
                <button className="adm-group-header" onClick={() => toggleGroup(group.id)}>
                  <span className="adm-group-icon">{group.icon}</span>
                  <span className="adm-group-label">{group.label}</span>
                  <ChevronDown size={14} className="adm-group-chevron" />
                </button>
                <div className="adm-group-body">
                  <div className="adm-group-items">
                    {group.items.map(item => (
                      <button
                        key={item.key}
                        className={`adm-group-item ${activeNav === item.key ? 'active' : ''}`}
                        onClick={() => handleNav(item.key)}
                      >
                        <span className="adm-item-icon">{item.icon}</span>
                        <span>{item.label}</span>
                        {item.key === 'ap' && pendingAp > 0 && <span className="adm-item-badge">{pendingAp}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {group.id === 'staff' && (
                <button
                  className={`adm-nav-top ${activeNav === 'notifications' ? 'active' : ''}`}
                  onClick={() => handleNav('notifications')}
                >
                  <Bell size={16} />
                  <span>Notices</span>
                  {notifCount > 0 && <span className="adm-item-badge">{notifCount}</span>}
                </button>
              )}
            </div>
          )
        })}
      </nav>

      <div className="adm-sidebar-bottom">
        <div className="adm-divider" />
        <RoleSwitcher />
        <button className="adm-logout" onClick={handleLogout}>
          <LogOut size={16} />
          <span>Logout</span>
        </button>
      </div>
    </>
  )

  return (
    <div className="admin-root">
      <button className="adm-mobile-toggle" onClick={() => setMobileOpen(true)}>
        <Menu size={20} />
      </button>

      {mobileOpen && <div className="adm-mobile-overlay" onClick={() => setMobileOpen(false)} />}

      <aside className={`admin-sidebar adm-sidebar ${mobileOpen ? 'open' : ''}`}>
        {mobileOpen && (
          <button className="adm-mobile-close" onClick={() => setMobileOpen(false)}>
            <X size={18} />
          </button>
        )}
        {sidebarContent}
      </aside>

      <main className="admin-main">
        {activeNav !== 'dashboard' && activeNav !== 'alumni' && (
          <header className="admin-header">
            <div>
              <h1>{pageTitles[activeNav] || 'Dashboard'}</h1>
              <p>{currentTerm ? `${currentTerm}, ${currentYear}` : `${currentYear}`} · {school?.name || ''}</p>
            </div>
            <div className="header-actions">
              <button className="btn-secondary">
                <Upload size={15} /> Export Report
              </button>
              <button className="btn-primary" onClick={goAddStudent}>
                <UserPlus size={15} /> Add Student
              </button>
              <div className="admin-avatar">
                {authProfile?.full_name?.[0]?.toUpperCase() || 'AD'}
              </div>
            </div>
          </header>
        )}

        {renderContent()}
      </main>
    </div>
  )
}
