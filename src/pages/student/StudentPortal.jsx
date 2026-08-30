import { useState, useEffect, useRef } from 'react'
import {
  LayoutDashboard, BarChart2, DollarSign, ClipboardList,
  Calendar, Bell, LogOut, Download, Award, User, BookOpen,
  Clock, MessageSquare, Settings, Search, Mail,
  ChevronRight, CheckCircle, AlertCircle, BookMarked,
  Bus, HeartPulse, Medal, Library,
  Briefcase, Users, FileText,
  Home, Star, MapPin, Printer, Zap,
  FileCheck, ScrollText, Notebook,
  ArrowUpRight, ArrowDownRight, Activity, AlertTriangle,
  Menu, X, CreditCard, Shield, Lock
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { basePath } from '../../lib/paths'
import './StudentPortal.css'
import GradesPage from './GradesPage'
import FeeStatementPage from './FeeStatementPage'
import AttendancePage from './AttendancePage'
import TimetablePage from './TimetablePage'
import NoticesPage from './NoticesPage'
import ReportCardsPage from './ReportCardsPage'
import TranscriptsPage from './TranscriptsPage'
import { useBrandingStore } from '../../features/branding/brandingStore'
import RoleSwitcher from '../../components/RoleSwitcher'
import { groupGradesBySubject, getCBEGrade } from '../../components/students/ReportCard'

const NAV_GROUPS = [
  {
    label: 'Main',
    items: [
      { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
      { key: 'profile', label: 'My Profile', icon: <User size={18} /> },
    ]
  },
  {
    label: 'Academic',
    items: [
      { key: 'grades', label: 'My Grades', icon: <BarChart2 size={18} /> },
      { key: 'attendance', label: 'Attendance', icon: <ClipboardList size={18} /> },
      { key: 'timetable', label: 'Timetable', icon: <Calendar size={18} /> },
      { key: 'assignments', label: 'Assignments', icon: <Notebook size={18} /> },
      { key: 'exams', label: 'Exams Schedule', icon: <FileCheck size={18} /> },
      { key: 'teachers', label: 'My Teachers', icon: <Users size={18} /> },
      { key: 'transcripts', label: 'Transcripts', icon: <ScrollText size={18} /> },
      { key: 'report-cards', label: 'Report Cards', icon: <FileText size={18} /> },
    ]
  },
  {
    label: 'Finance',
    items: [
      { key: 'fees', label: 'Fee Statement', icon: <DollarSign size={18} /> },
    ]
  },
  {
    label: 'Communication',
    items: [
      { key: 'notices', label: 'Notices', icon: <Bell size={18} /> },
      { key: 'messages', label: 'Messages', icon: <MessageSquare size={18} /> },
      { key: 'events', label: 'Events', icon: <Calendar size={18} /> },
    ]
  },
  {
    label: 'Student Life',
    items: [
      { key: 'library', label: 'Library', icon: <Library size={18} /> },
      { key: 'hostel', label: 'Hostel', icon: <Home size={18} /> },
      { key: 'transport', label: 'Transport', icon: <Bus size={18} /> },
      { key: 'medical', label: 'Medical', icon: <HeartPulse size={18} /> },
      { key: 'clubs', label: 'Clubs & Societies', icon: <Star size={18} /> },
      { key: 'sports', label: 'Sports', icon: <Medal size={18} /> },
    ]
  },
  {
    label: 'Services',
    items: [
      { key: 'downloads', label: 'Downloads', icon: <Download size={18} /> },
      { key: 'internships', label: 'Internships', icon: <Briefcase size={18} /> },
      { key: 'discipline', label: 'Discipline', icon: <Shield size={18} /> },
    ]
  },
]

export default function StudentPortal() {
  const [activeNav, setActiveNav] = useState('dashboard')
  const [student, setStudent] = useState(null)
  const [grades, setGrades] = useState([])
  const [fees, setFees] = useState([])
  const [credit, setCredit] = useState(0)
  const [attendance, setAttendance] = useState({ present: 0, total: 0, rate: 0 })
  const [notices, setNotices] = useState([])
  const [school, setSchool] = useState(null)
  const [timetable, setTimetable] = useState([])
  const [assignments, setAssignments] = useState([])
  const [messages, setMessages] = useState([])
  const [events, setEvents] = useState([])
  const [libraryBooks, setLibraryBooks] = useState([])
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showNotifications, setShowNotifications] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [unreadNotices, setUnreadNotices] = useState(0)
  const [unreadMessages, setUnreadMessages] = useState(0)

  const [showMobileMenu, setShowMobileMenu] = useState(false)
  const [openGroups, setOpenGroups] = useState(() => new Set(NAV_GROUPS.map(g => g.label)))
  const { logoUrl, schoolName } = useBrandingStore()
  const notifRef = useRef(null)

  const toggleGroup = (label) => {
    setOpenGroups(prev => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }

  const handleNav = (key) => {
    const group = NAV_GROUPS.find(g => g.items.some(i => i.key === key))
    if (group) setOpenGroups(prev => new Set(prev).add(group.label))
    setActiveNav(key)
    setShowMobileMenu(false)
  }

  const fetchStudentData = async () => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*, schools(*)')
        .eq('id', user.id)
        .single()

      setProfile(profileData)
      if (profileData?.schools) setSchool(profileData.schools)

      const currentTerm = profileData?.schools?.current_term || 'Term 1'
      const currentYear = profileData?.schools?.current_year || new Date().getFullYear()

      const { data: studentData } = await supabase
        .from('students')
        .select('*')
        .eq('email', user.email)
        .maybeSingle()

      setStudent(studentData)

      if (studentData) {
        const [
          gradesRes, assessmentsRes, paymentsRes, attendancePresent,
          attendanceTotal, noticesRes, timetableRes, assignmentsRes,
          messagesRes, eventsRes, libraryRes, creditRes
        ] = await Promise.all([
          supabase.from('grades').select('*').eq('student_id', studentData.id).eq('term', currentTerm).eq('year', currentYear).in('status', ['approved', 'published']),
          supabase.from('fee_assessments').select('*').eq('student_id', studentData.id).eq('term', currentTerm).eq('year', currentYear),
          supabase.from('student_ledger').select('entry_type, amount').eq('student_id', studentData.id).eq('term', currentTerm).eq('year', currentYear),
          supabase.from('attendance').select('*', { count: 'exact', head: true }).eq('student_id', studentData.id).eq('status', 'present'),
          supabase.from('attendance').select('*', { count: 'exact', head: true }).eq('student_id', studentData.id),
          supabase.from('notices').select('*').eq('school_id', profileData.school_id).order('created_at', { ascending: false }).limit(10),
          supabase.from('timetable_slots').select('*, subjects(name, code)').eq('class_id', studentData.class_id).order('day_of_week').order('start_time'),
          supabase.from('assignments').select('*').eq('class_id', studentData.class_id).order('due_date', { ascending: true }),
          supabase.from('messages').select('*').eq('recipient_id', user.id).order('created_at', { ascending: false }).limit(5),
          supabase.from('events').select('*').eq('school_id', profileData.school_id).gte('date', new Date().toISOString().split('T')[0]).order('date', { ascending: true }).limit(10),
          supabase.from('library_books').select('*').eq('school_id', profileData.school_id).limit(5),
          profileData.school_id ? supabase.rpc('student_credit_balance', { p_school_id: profileData.school_id, p_student_id: studentData.id }) : { data: 0 },
        ])

        setGrades(gradesRes.data || [])

        const feesData = (assessmentsRes.data || []).map(a => ({
          ...a,
          amount_due: a.amount || 0,
          amount_paid: 0,
        }))
        const paidFromPayments = (paymentsRes.data || []).reduce((s, p) => {
          if (p.entry_type === 'charge' || p.entry_type === 'penalty') return s
          return s + (p.amount || 0)
        }, 0)
        if (feesData.length > 0) feesData[0].amount_paid = paidFromPayments
        setFees(feesData)
        setCredit(Number(creditRes.data || 0))

        setAttendance({
          present: attendancePresent.count || 0,
          total: attendanceTotal.count || 0,
          rate: attendanceTotal.count > 0 ? Math.round((attendancePresent.count / attendanceTotal.count) * 100) : 0,
        })

        setNotices(noticesRes.data || [])
        setUnreadNotices((noticesRes.data || []).filter(n => !n.read_by?.includes?.(user.id)).length)

        const dayMap = { 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6, 'Sunday': 7 }
        const sortedTT = (timetableRes.data || []).sort((a, b) => {
          const dayA = dayMap[a.day_of_week] || 0
          const dayB = dayMap[b.day_of_week] || 0
          if (dayA !== dayB) return dayA - dayB
          return (a.start_time || '').localeCompare(b.start_time || '')
        })
        setTimetable(sortedTT)
        setAssignments(assignmentsRes.data || [])
        setMessages(messagesRes.data || [])
        setUnreadMessages((messagesRes.data || []).filter(m => !m.read).length)
        setEvents(eventsRes.data || [])
        setLibraryBooks(libraryRes.data || [])
      }
    } catch (err) {
      console.error('Error fetching student data:', err)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchStudentData()
  }, [])

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setShowNotifications(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = basePath('/')
  }

  const getGradeColor = (g) => {
    if (!g) return '#94a3b8'
    if (g.startsWith('EE')) return '#16a34a'
    if (g.startsWith('ME')) return '#2563eb'
    if (g.startsWith('AE')) return '#ca8a04'
    if (g.startsWith('BE')) return '#f97316'
    if (g.startsWith('DE')) return '#dc2626'
    if (g.startsWith('A')) return '#16a34a'
    if (g.startsWith('B')) return '#2563eb'
    if (g.startsWith('C')) return '#ca8a04'
    return '#dc2626'
  }

  const getGradeBg = (g) => {
    if (!g) return '#f1f5f9'
    if (g.startsWith('EE')) return '#dcfce7'
    if (g.startsWith('ME')) return '#dbeafe'
    if (g.startsWith('AE')) return '#fef9c3'
    if (g.startsWith('BE')) return '#ffedd5'
    if (g.startsWith('DE')) return '#fef2f2'
    if (g.startsWith('A')) return '#dcfce7'
    if (g.startsWith('B')) return '#dbeafe'
    if (g.startsWith('C')) return '#fef9c3'
    return '#fef2f2'
  }

  const totalDue = fees.reduce((s, f) => s + (f.amount_due || 0), 0)
  const totalPaid = fees.reduce((s, f) => s + (f.amount_paid || 0), 0)
  const balance = Math.max(0, totalDue - totalPaid)
  const grouped = groupGradesBySubject(grades)
  const avgGrade = grouped.overallAverage
  const subScores = grouped.subjects.map(s => s.average)
  const highestGrade = subScores.length ? Math.round(Math.max(...subScores)) : 0
  const lowestGrade = subScores.length ? Math.round(Math.min(...subScores)) : 0

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long' })
  const todayTimetable = timetable.filter(t => t.day_of_week === today)

  const nextAssignment = assignments.find(a => new Date(a.due_date) >= new Date())
  const overdueAssignments = assignments.filter(a => new Date(a.due_date) < new Date() && a.status !== 'submitted')

  const nextEvent = events[0]

  const statCards = [
    {
      label: 'Average Grade',
      value: `${avgGrade}%`,
      sub: `${grades.length} subjects`,
      trend: avgGrade >= 70 ? 'up' : avgGrade >= 50 ? 'neutral' : 'down',
      color: avgGrade >= 70 ? '#16a34a' : avgGrade >= 50 ? '#ca8a04' : '#dc2626',
      icon: <Award size={22} />
    },
    {
      label: 'Attendance Rate',
      value: `${attendance.rate}%`,
      sub: `${attendance.present} of ${attendance.total} days`,
      trend: attendance.rate >= 80 ? 'up' : attendance.rate >= 60 ? 'neutral' : 'down',
      color: attendance.rate >= 80 ? '#16a34a' : attendance.rate >= 60 ? '#ca8a04' : '#dc2626',
      icon: <ClipboardList size={22} />
    },
    {
      label: 'Fee Balance',
      value: `KES ${balance.toLocaleString()}`,
      sub: balance === 0 ? 'Fully paid' : 'Outstanding',
      trend: balance === 0 ? 'up' : 'down',
      color: balance === 0 ? '#16a34a' : '#dc2626',
      icon: <DollarSign size={22} />
    },
    {
      label: 'Assignments',
      value: assignments.length,
      sub: `${overdueAssignments.length} overdue`,
      trend: overdueAssignments.length === 0 ? 'up' : 'down',
      color: overdueAssignments.length === 0 ? '#16a34a' : '#ca8a04',
      icon: <Notebook size={22} />
    },
    {
      label: 'Notices',
      value: notices.length,
      sub: `${unreadNotices} unread`,
      trend: unreadNotices === 0 ? 'up' : 'neutral',
      color: '#7c3aed',
      icon: <Bell size={22} />
    },
    {
      label: 'Messages',
      value: messages.length,
      sub: `${unreadMessages} unread`,
      trend: unreadMessages === 0 ? 'up' : 'neutral',
      color: '#0891b2',
      icon: <MessageSquare size={22} />
    },
    {
      label: 'Upcoming Events',
      value: events.length,
      sub: nextEvent ? nextEvent.title?.slice(0, 20) : 'None scheduled',
      color: '#e11d48',
      icon: <Calendar size={22} />
    },
    {
      label: 'Library Books',
      value: libraryBooks.length,
      sub: 'Available on campus',
      color: '#0f766e',
      icon: <BookMarked size={22} />
    },
  ]

  const quickActions = [
    { label: 'View Grades', icon: <BarChart2 size={22} />, color: '#2563eb', bg: '#eff6ff', nav: 'grades' },
    { label: 'Check Attendance', icon: <ClipboardList size={22} />, color: '#16a34a', bg: '#f0fdf4', nav: 'attendance' },
    { label: 'Fee Balance', icon: <DollarSign size={22} />, color: '#ca8a04', bg: '#fefce8', nav: 'fees' },
    { label: 'Timetable', icon: <Calendar size={22} />, color: '#7c3aed', bg: '#f5f3ff', nav: 'timetable' },
    { label: 'Library', icon: <Library size={22} />, color: '#0f766e', bg: '#f0fdfa', nav: 'library' },
    { label: 'Messages', icon: <MessageSquare size={22} />, color: '#0891b2', bg: '#ecfeff', nav: 'messages' },
    { label: 'Notices', icon: <Bell size={22} />, color: '#e11d48', bg: '#fff1f2', nav: 'notices' },
    { label: 'Calendar', icon: <Calendar size={22} />, color: '#d97706', bg: '#fffbeb', nav: 'calendar' },
  ]

  const selfServices = [
    { label: 'Request Transcript', icon: <ScrollText size={20} />, color: '#2563eb' },
    { label: 'Print Fee Statement', icon: <Printer size={20} />, color: '#16a34a' },
    { label: 'Update Profile', icon: <User size={20} />, color: '#7c3aed' },
    { label: 'Report Lost Item', icon: <AlertTriangle size={20} />, color: '#ca8a04' },
    { label: 'Book Appointment', icon: <Calendar size={20} />, color: '#0891b2' },
    { label: 'Leave Application', icon: <FileText size={20} />, color: '#e11d48' },
    { label: 'Complaint/Feedback', icon: <MessageSquare size={20} />, color: '#0f766e' },
    { label: 'Request ID Card', icon: <CreditCard size={20} />, color: '#d97706' },
    { label: 'Change Password', icon: <Lock size={20} />, color: '#dc2626' },
    { label: 'View Discipline', icon: <Shield size={20} />, color: '#4f46e5' },
    { label: 'Club Registration', icon: <Users size={20} />, color: '#db2777' },
    { label: 'Course Registration', icon: <BookOpen size={20} />, color: '#059669' },
  ]

  const navGroups = NAV_GROUPS

  const pageTitles = {
    dashboard: 'Student Dashboard',
    profile: 'My Profile',
    grades: 'My Grades',
    attendance: 'Attendance Record',
    timetable: 'Class Timetable',
    assignments: 'Assignments',
    exams: 'Exams Schedule',
    teachers: 'My Teachers',
    fees: 'Fee Statement',
    transcripts: 'Transcripts',
    'report-cards': 'Report Cards',
    notices: 'School Notices',
    messages: 'Messages',
    events: 'Upcoming Events',
    library: 'Library',
    hostel: 'Hostel Information',
    transport: 'Transport Services',
    medical: 'Medical Services',
    clubs: 'Clubs & Societies',
    sports: 'Sports',
    downloads: 'Downloads',
    internships: 'Internships',
    discipline: 'Discipline Record',
  }

  const todayDate = new Date().toLocaleDateString('en-KE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  })

  const currentTime = new Date().toLocaleTimeString('en-KE', {
    hour: '2-digit', minute: '2-digit'
  })

  const renderContent = () => {
    switch (activeNav) {
      case 'grades':
        return <GradesPage student={student} school={school} />
      case 'fees':
        return <FeeStatementPage student={student} />
      case 'attendance':
        return <AttendancePage student={student} />
      case 'timetable':
        return <TimetablePage student={student} />
      case 'notices':
        return <NoticesPage school={school} />
      case 'profile':
        return renderProfile()
      case 'assignments':
        return renderAssignments()
      case 'exams':
        return renderExams()
      case 'teachers':
        return renderTeachers()
      case 'transcripts':
        return <TranscriptsPage student={student} school={school} />
      case 'report-cards':
        return <ReportCardsPage student={student} school={school} />
      case 'messages':
        return renderMessages()
      case 'events':
        return renderEvents()
      case 'library':
        return renderLibrary()
      case 'hostel':
        return renderHostel()
      case 'transport':
        return renderTransport()
      case 'medical':
        return renderMedical()
      case 'clubs':
        return renderClubs()
      case 'sports':
        return renderSports()
      case 'downloads':
        return renderDownloads()
      case 'internships':
        return renderInternships()
      case 'discipline':
        return renderDiscipline()
      default:
        return renderDashboard()
    }
  }

  const renderProfile = () => {
    if (!student) return <div className="sp-empty-state">No profile data available</div>
    return (
      <div className="sp-profile-page">
        <div className="sp-card">
          <div className="sp-card-header">
            <h3><User size={18} /> Personal Information</h3>
          </div>
          <div className="sp-profile-grid">
            <div className="sp-profile-field">
              <label>Full Name</label>
              <span>{student.full_name || '—'}</span>
            </div>
            <div className="sp-profile-field">
              <label>Admission Number</label>
              <span className="sp-mono">{student.admission_number || '—'}</span>
            </div>
            <div className="sp-profile-field">
              <label>Class</label>
              <span>{student.class || '—'} {student.stream || ''}</span>
            </div>
            <div className="sp-profile-field">
              <label>Gender</label>
              <span className="sp-capitalize">{student.gender || '—'}</span>
            </div>
            <div className="sp-profile-field">
              <label>Date of Birth</label>
              <span>{student.dob ? new Date(student.dob).toLocaleDateString('en-KE') : '—'}</span>
            </div>
            <div className="sp-profile-field">
              <label>Email</label>
              <span>{profile?.email || student.email || '—'}</span>
            </div>
            <div className="sp-profile-field">
              <label>Phone</label>
              <span>{student.phone || student.parent_phone || '—'}</span>
            </div>
            <div className="sp-profile-field">
              <label>Parent/Guardian</label>
              <span>{student.parent_name || '—'}</span>
            </div>
            <div className="sp-profile-field">
              <label>Enrollment Date</label>
              <span>{student.created_at ? new Date(student.created_at).toLocaleDateString('en-KE') : '—'}</span>
            </div>
            <div className="sp-profile-field">
              <label>Status</label>
              <span className={`sp-status-badge ${student.status === 'active' ? 'active' : ''}`}>
                {student.status || '—'}
              </span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const renderAssignments = () => {
    if (loading) return <div className="sp-loading-spinner" />
    return (
      <div className="sp-page">
        <div className="sp-card">
          <div className="sp-card-header">
            <h3><Notebook size={18} /> Assignments</h3>
            <span className="sp-badge">{assignments.length} total</span>
          </div>
          {assignments.length === 0 ? (
            <div className="sp-empty-state">
              <CheckCircle size={40} color="#16a34a" />
              <p>No assignments yet</p>
            </div>
          ) : (
            <div className="sp-assignments-list">
              {assignments.map(a => {
                const overdue = new Date(a.due_date) < new Date() && a.status !== 'submitted'
                return (
                  <div key={a.id} className={`sp-assignment-card ${overdue ? 'overdue' : ''}`}>
                    <div className="sp-assignment-left">
                      <div className={`sp-assignment-icon ${overdue ? 'overdue' : ''}`}>
                        {overdue ? <AlertCircle size={20} /> : <Notebook size={20} />}
                      </div>
                      <div className="sp-assignment-info">
                        <p className="sp-assignment-title">{a.title || 'Untitled'}</p>
                        <p className="sp-assignment-subject">{a.subject || 'General'} · {a.type || 'Assignment'}</p>
                        {a.description && <p className="sp-assignment-desc">{a.description}</p>}
                      </div>
                    </div>
                    <div className="sp-assignment-right">
                      <div className={`sp-assignment-date ${overdue ? 'overdue' : ''}`}>
                        <Clock size={14} />
                        <span>Due: {a.due_date ? new Date(a.due_date).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' }) : '—'}</span>
                      </div>
                      {a.status === 'submitted' ? (
                        <span className="sp-status-badge" style={{ background: '#dcfce7', color: '#16a34a' }}>Submitted</span>
                      ) : overdue ? (
                        <span className="sp-status-badge" style={{ background: '#fef2f2', color: '#dc2626' }}>Overdue</span>
                      ) : (
                        <span className="sp-status-badge" style={{ background: '#fef9c3', color: '#ca8a04' }}>Pending</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    )
  }

  const renderExams = () => {
    return (
      <div className="sp-page">
        <div className="sp-card">
          <div className="sp-card-header">
            <h3><FileCheck size={18} /> Exams Schedule</h3>
          </div>
          <div className="sp-empty-state">
            <Calendar size={40} color="#94a3b8" />
            <p>Exam schedule will be published here</p>
          </div>
        </div>
      </div>
    )
  }

  const renderTeachers = () => {
    return (
      <div className="sp-page">
        <div className="sp-card">
          <div className="sp-card-header">
            <h3><Users size={18} /> My Teachers</h3>
          </div>
          <div className="sp-empty-state">
            <Users size={40} color="#94a3b8" />
            <p>Teacher information coming soon</p>
          </div>
        </div>
      </div>
    )
  }

  const renderMessages = () => {
    if (loading) return <div className="sp-loading-spinner" />
    return (
      <div className="sp-page">
        <div className="sp-card">
          <div className="sp-card-header">
            <span className="sp-badge">{messages.length} messages</span>
            {unreadMessages > 0 && <span className="sp-badge sp-badge-danger">{unreadMessages} unread</span>}
          </div>
          {messages.length === 0 ? (
            <div className="sp-empty-state">
              <MessageSquare size={40} color="#94a3b8" />
              <p>No messages yet</p>
            </div>
          ) : (
            <div className="sp-messages-list">
              {messages.map(m => (
                <div key={m.id} className={`sp-message-row ${!m.read ? 'unread' : ''}`}>
                  <div className="sp-message-avatar">
                    {m.sender_name?.[0] || '?'}
                  </div>
                  <div className="sp-message-content">
                    <div className="sp-message-header">
                      <span className="sp-message-sender">{m.sender_name || 'School Admin'}</span>
                      <span className="sp-message-time">
                        {m.created_at ? new Date(m.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' }) : ''}
                      </span>
                    </div>
                    <p className="sp-message-subject">{m.subject || '(No subject)'}</p>
                    <p className="sp-message-preview">{m.message?.slice(0, 100)}{m.message?.length > 100 ? '...' : ''}</p>
                  </div>
                  {!m.read && <div className="sp-unread-dot" />}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  const renderEvents = () => {
    if (loading) return <div className="sp-loading-spinner" />
    return (
      <div className="sp-page">
        <div className="sp-card">
          <div className="sp-card-header">
            <span className="sp-badge">{events.length} events</span>
          </div>
          {events.length === 0 ? (
            <div className="sp-empty-state">
              <Calendar size={40} color="#94a3b8" />
              <p>No upcoming events</p>
            </div>
          ) : (
            <div className="sp-events-list">
              {events.map(e => (
                <div key={e.id} className="sp-event-card">
                  <div className="sp-event-date-box">
                    <span className="sp-event-day">{new Date(e.date).getDate()}</span>
                    <span className="sp-event-month">{new Date(e.date).toLocaleDateString('en-KE', { month: 'short' })}</span>
                  </div>
                  <div className="sp-event-content">
                    <p className="sp-event-title">{e.title}</p>
                    <p className="sp-event-meta">
                      {e.location && <><MapPin size={12} /> {e.location} · </>}
                      {e.time || 'All day'}
                    </p>
                    {e.description && <p className="sp-event-desc">{e.description}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  const renderLibrary = () => {
    if (loading) return <div className="sp-loading-spinner" />
    return (
      <div className="sp-page">
        <MyLibrary
          schoolId={profile?.school_id}
          name={student?.full_name || profile?.full_name}
          email={profile?.email || student?.email}
          role="student"
          userId={profile?.id}
        />
      </div>
    )
  }

  const renderHostel = () => {
    return (
      <div className="sp-page">
        <div className="sp-card">
          <div className="sp-empty-state">
            <Home size={40} color="#94a3b8" />
            <p>{student?.day_boarding === 'boarding' ? 'Hostel details coming soon' : 'You are registered as a day scholar'}</p>
          </div>
        </div>
      </div>
    )
  }

  const renderTransport = () => {
    return (
      <div className="sp-page">
        <div className="sp-card">
          <div className="sp-empty-state">
            <Bus size={40} color="#94a3b8" />
            <p>Transport information will be available here</p>
          </div>
        </div>
      </div>
    )
  }

  const renderMedical = () => {
    return (
      <div className="sp-page">
        <div className="sp-card">
          <div className="sp-empty-state">
            <HeartPulse size={40} color="#94a3b8" />
            <p>Medical information coming soon</p>
          </div>
        </div>
      </div>
    )
  }

  const renderClubs = () => {
    return (
      <div className="sp-page">
        <div className="sp-card">
          <div className="sp-empty-state">
            <Star size={40} color="#94a3b8" />
            <p>Club information coming soon</p>
          </div>
        </div>
      </div>
    )
  }

  const renderSports = () => {
    return (
      <div className="sp-page">
        <div className="sp-card">
          <div className="sp-empty-state">
            <Medal size={40} color="#94a3b8" />
            <p>Sports information coming soon</p>
          </div>
        </div>
      </div>
    )
  }

  const renderDownloads = () => {
    const downloadItems = [
      { label: 'Fee Statement', icon: <DollarSign size={18} />, color: '#16a34a' },
      { label: 'Report Card', icon: <FileText size={18} />, color: '#2563eb' },
      { label: 'Timetable', icon: <Calendar size={18} />, color: '#7c3aed' },
      { label: 'Transcript', icon: <ScrollText size={18} />, color: '#ca8a04' },
      { label: 'School Calendar', icon: <Calendar size={18} />, color: '#0891b2' },
      { label: 'Parent Consent Form', icon: <FileText size={18} />, color: '#e11d48' },
    ]
    return (
      <div className="sp-page">
        <div className="sp-card">
          <div className="sp-downloads-grid">
            {downloadItems.map((item, i) => (
              <button key={i} className="sp-download-btn" style={{ '--btn-color': item.color }}>
                {item.icon}
                <span>{item.label}</span>
                <Download size={16} />
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const renderInternships = () => {
    return (
      <div className="sp-page">
        <div className="sp-card">
          <div className="sp-empty-state">
            <Briefcase size={40} color="#94a3b8" />
            <p>Internship opportunities coming soon</p>
          </div>
        </div>
      </div>
    )
  }

  const renderDiscipline = () => {
    return (
      <div className="sp-page">
        <div className="sp-card">
          <div className="sp-empty-state">
            <CheckCircle size={40} color="#16a34a" />
            <p>No discipline cases recorded</p>
          </div>
        </div>
      </div>
    )
  }

  const NotificationsPanel = () => (
    <div className="sp-notif-panel" ref={notifRef}>
      <div className="sp-notif-header">
        <h4>Notifications</h4>
        <button className="sp-notif-close" onClick={() => setShowNotifications(false)}>
          <X size={16} />
        </button>
      </div>
      <div className="sp-notif-list">
        {notices.length === 0 ? (
          <div className="sp-notif-empty">No notifications</div>
        ) : (
          notices.map(n => (
            <div key={n.id} className="sp-notif-item">
              <div className="sp-notif-icon">
                <Bell size={16} />
              </div>
              <div className="sp-notif-content">
                <p className="sp-notif-title">{n.title}</p>
                <p className="sp-notif-time">{new Date(n.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
              </div>
            </div>
          ))
        )}
      </div>
      <div className="sp-notif-footer">
        <button className="sp-notif-view-all" onClick={() => { setActiveNav('notices'); setShowNotifications(false) }}>
          View All Notices <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )

  const MathBarChart = ({ data, color = '#2563eb' }) => {
    if (!data || data.length === 0) return null
    const maxVal = Math.max(...data.map(d => d.value), 1)
    return (
      <div className="sp-chart-bars">
        {data.map((d, i) => (
          <div key={i} className="sp-chart-bar-col" title={`${d.label}: ${d.value}%`}>
            <div className="sp-chart-bar-track">
              <div
                className="sp-chart-bar-fill"
                style={{ height: `${(d.value / maxVal) * 100}%`, background: d.color || color }}
              />
            </div>
            <span className="sp-chart-bar-label">{d.label?.slice(0, 4)}</span>
          </div>
        ))}
      </div>
    )
  }

  const CircularProgress = ({ value, size = 80, strokeWidth = 6, color = '#2563eb' }) => {
    const radius = (size - strokeWidth) / 2
    const circumference = radius * 2 * Math.PI
    const offset = circumference - (value / 100) * circumference
    return (
      <svg width={size} height={size} className="sp-circular-progress">
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="#f1f5f9" strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
      </svg>
    )
  }

  const renderDashboard = () => {
    if (loading) return (
      <div className="sp-loading-container">
        <div className="sp-loading-spinner" />
        <p>Loading your dashboard...</p>
      </div>
    )

    const gradeData = grades.map(g => ({
      label: g.subject,
      value: Math.round(g.total_score || 0),
      color: g.grade?.startsWith('A') ? '#16a34a' : g.grade?.startsWith('B') ? '#2563eb' : g.grade?.startsWith('C') ? '#ca8a04' : '#dc2626'
    }))

    return (
      <div className="sp-dashboard">
        <div className="sp-quick-actions">
          {quickActions.map(action => (
            <button
              key={action.label}
              className="sp-quick-action-btn"
              style={{ '--action-bg': action.bg, '--action-color': action.color }}
              onClick={() => setActiveNav(action.nav)}
            >
              <div className="sp-quick-action-icon">{action.icon}</div>
              <span className="sp-quick-action-label">{action.label}</span>
            </button>
          ))}
        </div>

        <div className="sp-stats-grid">
          {statCards.map(s => (
            <div className="sp-stat-card" key={s.label}>
              <div className="sp-stat-icon-wrap" style={{ background: `${s.color}15`, color: s.color }}>
                {s.icon}
              </div>
              <div className="sp-stat-content">
                <p className="sp-stat-value" style={{ color: s.color }}>{s.value}</p>
                <p className="sp-stat-label">{s.label}</p>
                <p className="sp-stat-sub">{s.sub}</p>
              </div>
              <div className={`sp-stat-trend ${s.trend}`}>
                {s.trend === 'up' ? <ArrowUpRight size={14} /> : s.trend === 'down' ? <ArrowDownRight size={14} /> : <Activity size={14} />}
              </div>
            </div>
          ))}
        </div>

        <div className="sp-dashboard-grid">
          <div className="sp-card">
            <div className="sp-card-header">
              <h3><Calendar size={16} /> Today's Timetable</h3>
              <span className="sp-badge">{today}</span>
            </div>
            {todayTimetable.length === 0 ? (
              <div className="sp-empty-state-sm">
                <Calendar size={28} color="#94a3b8" />
                <p>No classes scheduled for today</p>
              </div>
            ) : (
              <div className="sp-timetable-list">
                {todayTimetable.map((slot, i) => (
                  <div key={slot.id || i} className="sp-timetable-row">
                    <div className="sp-timetable-time">
                      <Clock size={14} />
                      <span>{slot.start_time?.slice(0, 5)} - {slot.end_time?.slice(0, 5)}</span>
                    </div>
                    <div className="sp-timetable-info">
                      <p className="sp-timetable-subject">{slot.subjects?.name || slot.subject_name || 'Subject'}</p>
                      <p className="sp-timetable-room">{slot.room || slot.venue || ''}</p>
                    </div>
                    <div className="sp-timetable-badge">
                      <span className="sp-badge">{slot.subjects?.code || ''}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button className="sp-card-link" onClick={() => setActiveNav('timetable')}>
              View full timetable <ChevronRight size={14} />
            </button>
          </div>

          <div className="sp-card">
            <div className="sp-card-header">
              <h3><Notebook size={16} /> Upcoming Assignments</h3>
              {overdueAssignments.length > 0 && (
                <span className="sp-badge sp-badge-danger">{overdueAssignments.length} overdue</span>
              )}
            </div>
            {assignments.length === 0 ? (
              <div className="sp-empty-state-sm">
                <CheckCircle size={28} color="#16a34a" />
                <p>No assignments pending</p>
              </div>
            ) : (
              <div className="sp-assignments-mini">
                {assignments.filter(a => a.status !== 'submitted').slice(0, 4).map(a => {
                  const overdue = new Date(a.due_date) < new Date()
                  return (
                    <div key={a.id} className={`sp-assignment-mini ${overdue ? 'overdue' : ''}`}>
                      <div className={`sp-assignment-mini-icon ${overdue ? 'overdue' : ''}`}>
                        {overdue ? <AlertCircle size={14} /> : <Notebook size={14} />}
                      </div>
                      <div className="sp-assignment-mini-info">
                        <p className="sp-assignment-mini-title">{a.title || 'Untitled'}</p>
                        <p className="sp-assignment-mini-date">
                          Due {a.due_date ? new Date(a.due_date).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' }) : '—'}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            <button className="sp-card-link" onClick={() => setActiveNav('assignments')}>
              View all assignments <ChevronRight size={14} />
            </button>
          </div>

          <div className="sp-card sp-card-wide">
            <div className="sp-card-header">
              <h3><BarChart2 size={16} /> Academic Performance</h3>
              {grades.length > 0 && <span className="sp-badge">Avg: {avgGrade}%</span>}
            </div>
            {grades.length === 0 ? (
              <div className="sp-empty-state-sm">
                <BarChart2 size={28} color="#94a3b8" />
                <p>No grade data available</p>
              </div>
            ) : (
              <div className="sp-performance-chart">
                <MathBarChart data={gradeData} />
                <div className="sp-performance-stats">
                  <div className="sp-perf-stat">
                    <span className="sp-perf-stat-label">Highest</span>
                    <span className="sp-perf-stat-value" style={{ color: '#16a34a' }}>{highestGrade}%</span>
                  </div>
                  <div className="sp-perf-stat">
                    <span className="sp-perf-stat-label">Average</span>
                    <span className="sp-perf-stat-value" style={{ color: '#2563eb' }}>{avgGrade}%</span>
                  </div>
                  <div className="sp-perf-stat">
                    <span className="sp-perf-stat-label">Lowest</span>
                    <span className="sp-perf-stat-value" style={{ color: '#dc2626' }}>{lowestGrade}%</span>
                  </div>
                  <div className="sp-perf-stat">
                    <span className="sp-perf-stat-label">Subjects</span>
                    <span className="sp-perf-stat-value">{grades.length}</span>
                  </div>
                </div>
              </div>
            )}
            <button className="sp-card-link" onClick={() => setActiveNav('grades')}>
              View full grades <ChevronRight size={14} />
            </button>
          </div>

          <div className="sp-card">
            <div className="sp-card-header">
              <h3><ClipboardList size={16} /> Attendance</h3>
              <span className={`sp-badge ${attendance.rate >= 80 ? '' : 'sp-badge-danger'}`}>
                {attendance.rate}%
              </span>
            </div>
            <div className="sp-attendance-display">
              <CircularProgress value={attendance.rate} color={attendance.rate >= 80 ? '#16a34a' : attendance.rate >= 60 ? '#ca8a04' : '#dc2626'} />
              <div className="sp-attendance-stats">
                <div className="sp-att-stat">
                  <div className="sp-att-stat-dot" style={{ background: '#16a34a' }} />
                  <span>Present: {attendance.present}</span>
                </div>
                <div className="sp-att-stat">
                  <div className="sp-att-stat-dot" style={{ background: '#dc2626' }} />
                  <span>Absent: {attendance.total - attendance.present}</span>
                </div>
                <div className="sp-att-stat">
                  <div className="sp-att-stat-dot" style={{ background: '#e2e8f0' }} />
                  <span>Total: {attendance.total}</span>
                </div>
              </div>
            </div>
            <button className="sp-card-link" onClick={() => setActiveNav('attendance')}>
              View full attendance <ChevronRight size={14} />
            </button>
          </div>

          <div className="sp-card">
            <div className="sp-card-header">
              <h3><DollarSign size={16} /> Fee Status</h3>
              <span className={`sp-badge ${balance === 0 ? '' : 'sp-badge-danger'}`}>
                {balance === 0 ? 'Paid' : 'Balance'}
              </span>
            </div>
            <div className="sp-fee-display">
              <div className="sp-fee-progress">
                <div
                  className="sp-fee-progress-bar"
                  style={{ width: `${totalDue > 0 ? Math.min((totalPaid / totalDue) * 100, 100) : 0}%` }}
                />
              </div>
              <div className="sp-fee-details">
                <div className="sp-fee-row">
                  <span>Total Due</span>
                  <span>KES {totalDue.toLocaleString()}</span>
                </div>
                <div className="sp-fee-row">
                  <span>Applied to Fees</span>
                  <span className="sp-fee-paid">KES {totalPaid.toLocaleString()}</span>
                </div>
                {credit > 0 && (
                  <div className="sp-fee-row">
                    <span>Student Credit (Advance)</span>
                    <span style={{ color: '#7c3aed' }}>KES {credit.toLocaleString()}</span>
                  </div>
                )}
                <div className="sp-fee-row sp-fee-total">
                  <span>Balance</span>
                  <span style={{ color: balance === 0 ? '#16a34a' : '#dc2626' }}>
                    KES {balance.toLocaleString()}
                  </span>
                </div>
              </div>
              {balance === 0 && (
                <div className="sp-fee-cleared">
                  <CheckCircle size={14} /> Fees fully paid
                </div>
              )}
            </div>
            <button className="sp-card-link" onClick={() => setActiveNav('fees')}>
              View fee statement <ChevronRight size={14} />
            </button>
          </div>

          <div className="sp-card">
            <div className="sp-card-header">
              <h3><MessageSquare size={16} /> Messages</h3>
              {unreadMessages > 0 && <span className="sp-badge sp-badge-danger">{unreadMessages}</span>}
            </div>
            {messages.length === 0 ? (
              <div className="sp-empty-state-sm">
                <MessageSquare size={28} color="#94a3b8" />
                <p>No messages</p>
              </div>
            ) : (
              <div className="sp-messages-mini">
                {messages.slice(0, 3).map(m => (
                  <div key={m.id} className={`sp-message-mini ${!m.read ? 'unread' : ''}`}>
                    <div className="sp-message-mini-avatar">{m.sender_name?.[0] || '?'}</div>
                    <div className="sp-message-mini-content">
                      <p className="sp-message-mini-sender">{m.sender_name || 'School'}</p>
                      <p className="sp-message-mini-text">{m.subject || '(No subject)'}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button className="sp-card-link" onClick={() => setActiveNav('messages')}>
              View all messages <ChevronRight size={14} />
            </button>
          </div>

          <div className="sp-card">
            <div className="sp-card-header">
              <h3><Bell size={16} /> Announcements</h3>
              {unreadNotices > 0 && <span className="sp-badge sp-badge-danger">{unreadNotices} new</span>}
            </div>
            {notices.length === 0 ? (
              <div className="sp-empty-state-sm">
                <Bell size={28} color="#94a3b8" />
                <p>No announcements</p>
              </div>
            ) : (
              <div className="sp-notices-mini">
                {notices.slice(0, 3).map(n => (
                  <div key={n.id} className="sp-notice-mini">
                    <div className="sp-notice-mini-icon">
                      <Bell size={14} color="#7c3aed" />
                    </div>
                    <div className="sp-notice-mini-content">
                      <p className="sp-notice-mini-title">{n.title}</p>
                      <p className="sp-notice-mini-date">
                        {new Date(n.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button className="sp-card-link" onClick={() => setActiveNav('notices')}>
              View all notices <ChevronRight size={14} />
            </button>
          </div>

          <div className="sp-card">
            <div className="sp-card-header">
              <h3><Calendar size={16} /> Upcoming Events</h3>
              <span className="sp-badge">{events.length}</span>
            </div>
            {events.length === 0 ? (
              <div className="sp-empty-state-sm">
                <Calendar size={28} color="#94a3b8" />
                <p>No upcoming events</p>
              </div>
            ) : (
              <div className="sp-events-mini">
                {events.slice(0, 3).map(e => (
                  <div key={e.id} className="sp-event-mini">
                    <div className="sp-event-mini-date">
                      <span className="sp-event-mini-day">{new Date(e.date).getDate()}</span>
                      <span className="sp-event-mini-month">{new Date(e.date).toLocaleDateString('en-KE', { month: 'short' })}</span>
                    </div>
                    <div className="sp-event-mini-content">
                      <p className="sp-event-mini-title">{e.title}</p>
                      <p className="sp-event-mini-meta">{e.time || 'All day'}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button className="sp-card-link" onClick={() => setActiveNav('events')}>
              View all events <ChevronRight size={14} />
            </button>
          </div>

          <div className="sp-card">
            <div className="sp-card-header">
              <h3><Calendar size={16} /> Academic Calendar</h3>
            </div>
            <div className="sp-empty-state-sm">
              <Calendar size={28} color="#94a3b8" />
              <p>Academic calendar coming soon</p>
            </div>
          </div>
        </div>

        <div className="sp-section">
          <div className="sp-section-header">
            <h3><Zap size={18} /> Self-Service Center</h3>
          </div>
          <div className="sp-self-service-grid">
            {selfServices.map((service, i) => (
              <button key={i} className="sp-service-btn" style={{ '--srv-color': service.color }}>
                <div className="sp-service-icon" style={{ background: `${service.color}15`, color: service.color }}>
                  {service.icon}
                </div>
                <span className="sp-service-label">{service.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="sp-section">
          <div className="sp-section-header">
            <h3><BookOpen size={18} /> Quick Links</h3>
          </div>
          <div className="sp-quick-links">
            <button className="sp-quick-link" onClick={() => setActiveNav('downloads')}>
              <Download size={20} color="#2563eb" />
              <span>Downloads</span>
            </button>
            <button className="sp-quick-link" onClick={() => setActiveNav('library')}>
              <BookMarked size={20} color="#0f766e" />
              <span>Library</span>
            </button>
            <button className="sp-quick-link" onClick={() => setActiveNav('exams')}>
              <FileCheck size={20} color="#7c3aed" />
              <span>Exams Schedule</span>
            </button>
            <button className="sp-quick-link" onClick={() => setActiveNav('transcripts')}>
              <ScrollText size={20} color="#ca8a04" />
              <span>Transcripts</span>
            </button>
            <button className="sp-quick-link" onClick={() => setActiveNav('profile')}>
              <User size={20} color="#0891b2" />
              <span>My Profile</span>
            </button>
            <button className="sp-quick-link" onClick={() => setActiveNav('teachers')}>
              <Users size={20} color="#e11d48" />
              <span>My Teachers</span>
            </button>
          </div>
        </div>

        <div className="sp-section">
          <div className="sp-section-header">
            <h3><Award size={18} /> Performance Overview</h3>
            {grouped.totalSubjects > 0 && <span className="sp-badge">{grouped.totalSubjects} subjects</span>}
          </div>
          <div className="sp-performance-overview">
            {grades.length === 0 ? (
              <div className="sp-empty-state-sm">
                <BarChart2 size={28} color="#94a3b8" />
                <p>No performance data yet</p>
              </div>
            ) : (
              <div className="sp-perf-overview-grid">
                {grouped.subjects.map((sub, i) => {
                  const cbe = getCBEGrade(sub.average, student?.class || '')
                  const band = cbe.band || '—'
                  const gColor = getGradeColor(band)
                  const gBg = getGradeBg(band)
                  return (
                    <div key={sub.name} className="sp-perf-subject-card">
                      <div className="sp-perf-subject-header">
                        <p className="sp-perf-subject-name">{sub.name}</p>
                        <span className="sp-perf-subject-grade" style={{ background: gBg, color: gColor }}>
                          {band}{cbe.points != null ? ` · ${cbe.points}pts` : ''}
                        </span>
                      </div>
                      <div className="sp-perf-subject-bar">
                        <div className="sp-perf-subject-bar-track">
                          <div
                            className="sp-perf-subject-bar-fill"
                            style={{ width: `${Math.min(sub.average || 0, 100)}%`, background: gColor }}
                          />
                        </div>
                        <span className="sp-perf-subject-score" style={{ color: gColor }}>
                          {Math.round(sub.average || 0)}%
                        </span>
                      </div>
                      <div className="sp-perf-subject-details">
                        {grouped.examTypes.map(et => {
                          const a = sub.assessments.find(x => x.name === et)
                          return <span key={et}>{et}: {a ? `${Math.round(a.rawMarks)}/${a.maxMarksRaw}` : '—'}</span>
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            <button className="sp-card-link" onClick={() => setActiveNav('grades')}>
              View detailed grades <ChevronRight size={14} />
            </button>
          </div>
        </div>

        <div className="sp-section">
          <div className="sp-section-header">
            <h3><BookMarked size={18} /> Library</h3>
            {libraryBooks.length > 0 && <span className="sp-badge">{libraryBooks.length} books</span>}
          </div>
          <div className="sp-library-widget">
            {libraryBooks.length === 0 ? (
              <div className="sp-empty-state-sm">
                <BookMarked size={28} color="#94a3b8" />
                <p>Library catalog coming soon</p>
              </div>
            ) : (
              <div className="sp-library-mini-grid">
                {libraryBooks.slice(0, 4).map(b => (
                  <div key={b.id} className="sp-library-mini-card">
                    <div className="sp-library-mini-cover">
                      <BookMarked size={24} />
                    </div>
                    <p className="sp-library-mini-title">{b.title?.slice(0, 20)}</p>
                    <p className="sp-library-mini-author">{b.author?.slice(0, 15) || 'Unknown'}</p>
                    <span className={`sp-book-status ${b.available ? 'available' : 'borrowed'}`}>
                      {b.available ? 'Available' : 'Borrowed'}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <button className="sp-card-link" onClick={() => setActiveNav('library')}>
              Browse library <ChevronRight size={14} />
            </button>
          </div>
        </div>

        <div className="sp-section">
          <div className="sp-section-header">
            <h3><Download size={18} /> Downloads</h3>
          </div>
          <div className="sp-downloads-widget">
            <button className="sp-download-item" onClick={() => setActiveNav('downloads')}>
              <FileText size={18} color="#2563eb" />
              <span>Download Fee Statement</span>
              <Download size={14} color="#94a3b8" />
            </button>
            <button className="sp-download-item" onClick={() => setActiveNav('downloads')}>
              <FileText size={18} color="#16a34a" />
              <span>Download Report Card</span>
              <Download size={14} color="#94a3b8" />
            </button>
            <button className="sp-download-item" onClick={() => setActiveNav('downloads')}>
              <Calendar size={18} color="#7c3aed" />
              <span>Download Timetable</span>
              <Download size={14} color="#94a3b8" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="sp-root">
      <aside className={`sp-sidebar ${showMobileMenu ? 'mobile-open' : ''}`}>
        <div className="sp-sidebar-header">
          <div className="sp-sidebar-brand">
            {logoUrl ? (
              <img src={logoUrl} alt={schoolName || 'Logo'} className="sp-sidebar-logo-img" />
            ) : (
              <div className="sp-sidebar-logo-letter">{schoolName?.[0] || 'S'}</div>
            )}
            <span className="sp-sidebar-school-name">{schoolName || 'School'}</span>
          </div>
          <button className="sp-sidebar-close" onClick={() => setShowMobileMenu(false)}>
            <X size={20} />
          </button>
        </div>

        <div className="sp-sidebar-profile">
          <div className="sp-sidebar-avatar">
            {student?.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2) || 'ST'}
          </div>
          <div className="sp-sidebar-user">
            <p className="sp-sidebar-name">{student?.full_name || 'Student'}</p>
            <p className="sp-sidebar-info">{student?.class || ''} · {student?.admission_number || ''}</p>
          </div>
        </div>

        <nav className="sp-sidebar-nav">
          {navGroups.map((group, gi) => {
            const isOpen = openGroups.has(group.label)
            return (
              <div key={gi} className="sp-nav-group">
                <button
                  type="button"
                  className={`sp-nav-group-toggle ${isOpen ? 'open' : ''}`}
                  onClick={() => toggleGroup(group.label)}
                >
                  <span className="sp-nav-group-label">{group.label}</span>
                  <ChevronRight size={14} className="sp-nav-chevron" />
                </button>
                {isOpen && (
                  <div className="sp-nav-sub">
                    {group.items.map(item => (
                      <button
                        key={item.key}
                        className={`sp-nav-item ${activeNav === item.key ? 'active' : ''}`}
                        onClick={() => handleNav(item.key)}
                      >
                        <span className="sp-nav-item-icon">{item.icon}</span>
                        <span className="sp-nav-item-label">{item.label}</span>
                        {item.key === 'notices' && unreadNotices > 0 && (
                          <span className="sp-nav-badge">{unreadNotices}</span>
                        )}
                        {item.key === 'messages' && unreadMessages > 0 && (
                          <span className="sp-nav-badge">{unreadMessages}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        <div className="sp-sidebar-footer">
          <RoleSwitcher />
          <button className="sp-logout-btn" onClick={handleLogout}>
            <LogOut size={16} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <main className="sp-main">
        <header className="sp-topbar">
          <div className="sp-topbar-left">
            <button className="sp-mobile-menu-btn" onClick={() => setShowMobileMenu(true)}>
              <Menu size={20} />
            </button>
            <div className="sp-topbar-brand">
              {logoUrl ? (
                <img src={logoUrl} alt={schoolName || 'Logo'} className="sp-topbar-logo" />
              ) : (
                <div className="sp-topbar-logo-letter">{schoolName?.[0] || 'S'}</div>
              )}
              <div>
                <h1 className="sp-topbar-title">{pageTitles[activeNav]}</h1>
                <p className="sp-topbar-subtitle">{todayDate} · {currentTime}</p>
              </div>
            </div>
          </div>

          <div className="sp-topbar-right">
            {showSearch ? (
              <div className="sp-search-box">
                <Search size={16} color="#94a3b8" />
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  autoFocus
                  onBlur={() => { if (!searchQuery) setShowSearch(false) }}
                  onKeyDown={e => e.key === 'Escape' && setShowSearch(false)}
                />
              </div>
            ) : (
              <button className="sp-topbar-icon-btn" onClick={() => setShowSearch(true)} title="Search">
                <Search size={18} />
              </button>
            )}

            <div className="sp-topbar-notif-wrapper">
              <button className="sp-topbar-icon-btn" onClick={() => setShowNotifications(!showNotifications)} title="Notifications">
                <Bell size={18} />
                {unreadNotices > 0 && <span className="sp-topbar-badge">{unreadNotices}</span>}
              </button>
              {showNotifications && <NotificationsPanel />}
            </div>

            <button className="sp-topbar-icon-btn" onClick={() => setActiveNav('messages')} title="Messages">
              <Mail size={18} />
              {unreadMessages > 0 && <span className="sp-topbar-badge">{unreadMessages}</span>}
            </button>

            <button className="sp-topbar-icon-btn" onClick={() => setActiveNav('profile')} title="Settings">
              <Settings size={18} />
            </button>

            <div className="sp-topbar-divider" />

            <div className="sp-topbar-user">
              <div className="sp-topbar-avatar">
                {student?.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2) || 'ST'}
              </div>
              <span className="sp-topbar-username">{student?.full_name?.split(' ')[0] || 'Student'}</span>
            </div>

            <button className="sp-topbar-icon-btn sp-topbar-logout" onClick={handleLogout} title="Logout">
              <LogOut size={18} />
            </button>
          </div>
        </header>

        <div className="sp-content">
          {renderContent()}
        </div>
      </main>
    </div>
  )
}
