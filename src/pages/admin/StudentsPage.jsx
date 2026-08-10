import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Users, Plus, Search, X, Save, ChevronRight, Edit, Trash2, Eye, ArrowUp,
  Upload, Download, Printer, CheckSquare, UserCheck, AlertCircle, Loader,
  Camera, User, DollarSign, Calendar, BookOpen, ClipboardList, Activity,
  FileText, Clock, Home, Bus, Shield, ArrowLeft, RefreshCw, GraduationCap,
  MoreHorizontal, ChevronDown, ChevronUp, ArrowUpDown, Key,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'
import { useSchool } from './useSchool'
import * as XLSX from 'xlsx'
import { ImportExcelModal } from '../../components/students/ImportExcelModal'
import { exportToPDF } from '../../services/students/exportService'
import { promoteStudentsAtomic, getGradeLevels } from '../../services/students/bulkPromotionService'
import { createStudentAuth, bulkCreateStudentAuth, resetAllStudentPasswords } from '../../services/students/studentService'
import { StudentDocuments } from '../../components/students/StudentDocuments'
import { ReportCard, fetchStudentComments } from '../../components/students/ReportCard'
import { fmt, fmtDate } from './fees/utils/feesHelpers'
import {
  generatePersonalPdf,
  generateParentsPdf,
  generateMedicalPdf,
  generateFeeAccountPdf,
  generateAttendancePdf,
  generateCbcPdf,
  generateAcademicsPdf,
} from './fees/utils/generateStudentProfilePdf'

const CLASS_GROUPS = [
  { label: 'Pre-Primary', options: ['PP1', 'PP2'] },
  { label: 'Lower Primary', options: ['Grade 1', 'Grade 2', 'Grade 3'] },
  { label: 'Upper Primary', options: ['Grade 4', 'Grade 5', 'Grade 6'] },
  { label: 'Junior School', options: ['Grade 7', 'Grade 8', 'Grade 9'] },
  { label: 'Senior School', options: ['Grade 10', 'Grade 11'] },
]

const EMPTY_FORM = {
  full_name: '', admission_number: '', class: '', stream: '',
  date_of_birth: '', gender: '', phone: '', email: '',
  photo_url: '', birth_cert_number: '', nationality: '', religion: '',
  home_address: '', county: '', sub_county: '', previous_school: '',
  blood_group: '', medical_conditions: '', allergies: '',
  special_needs: '', transport_route: '', day_boarding: '', house: '', club: '',
  upi_number: '', status: 'active',
}

const EMPTY_GUARDIAN = {
  name: '', relationship: '', phone: '', email: '', national_id: '',
  occupation: '', address: '', is_fee_payer: false, sms_notification: true,
  portal_access: false,
}

const PROFILE_TABS = [
  { key: 'personal', label: 'Personal Info', icon: User },
  { key: 'parents', label: 'Parents', icon: Users },
  { key: 'medical', label: 'Medical', icon: Activity },
  { key: 'fees', label: 'Fee Account', icon: DollarSign },
  { key: 'attendance', label: 'Attendance', icon: Calendar },
  { key: 'cbc', label: 'CBC', icon: BookOpen },
  { key: 'academics', label: 'Academics', icon: ClipboardList },
  { key: 'documents', label: 'Documents', icon: FileText },
  { key: 'history', label: 'Activity Log', icon: Clock },
]

const ROWS_PER_PAGE = 10

export default function StudentsPage() {
  const { profile } = useAuthStore()
  const { school } = useSchool()
  const fileInputRef = useRef(null)

  const downloadProfilePdf = async (generator, filename) => {
    try {
      const blob = await generator({
        school,
        student: selectedStudent,
        fee: profileFee,
        attendance: profileAttendance,
        grades: profileGrades,
        term: getCurrentTerm(),
        year: getCurrentYear(),
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${filename}_${selectedStudent?.admission_number || selectedStudent?.id}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('PDF generation failed:', e)
    }
  }

  // View state
  const [view, setView] = useState('list')
  const [showModal, setShowModal] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [editingStudent, setEditingStudent] = useState(null)
  const [selectedStudent, setSelectedStudent] = useState(null)

  // Data
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Selection & bulk
  const [selectedIds, setSelectedIds] = useState(new Set())

  // Filters
  const [search, setSearch] = useState('')
  const [filterClass, setFilterClass] = useState('')
  const [filterStream, setFilterStream] = useState('')
  const [filterGender, setFilterGender] = useState('')
  const [filterStatus, setFilterStatus] = useState('active')
  const [filterBoarding, setFilterBoarding] = useState('')

  // Sort
  const [sortKey, setSortKey] = useState('full_name')
  const [sortDir, setSortDir] = useState('asc')

  // Pagination
  const [page, setPage] = useState(1)

  // Student login creation
  const [creatingLogins, setCreatingLogins] = useState(false)
  const [loginResult, setLoginResult] = useState('')
  const [existingLogins, setExistingLogins] = useState(new Set())
  const [resettingPasswords, setResettingPasswords] = useState(false)

  // Actions dropdown
  const [openMenuId, setOpenMenuId] = useState(null)
  const menuRef = useRef(null)

  // Form
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [guardians, setGuardians] = useState([
    { ...EMPTY_GUARDIAN, relationship: 'father', portal_access: true },
    { ...EMPTY_GUARDIAN, relationship: 'mother', portal_access: true },
  ])

  // Profile tab
  const [profileTab, setProfileTab] = useState('personal')
  const [profileFee, setProfileFee] = useState({ assessments: [], payments: [], totalCharged: 0, totalPaid: 0, balance: 0 })
  const [profileAttendance, setProfileAttendance] = useState({ records: [], present: 0, absent: 0, late: 0 })
  const [profileGrades, setProfileGrades] = useState([])
  const [profileTabLoading, setProfileTabLoading] = useState(false)
  const [showTranscript, setShowTranscript] = useState(false)
  const [transcriptComment, setTranscriptComment] = useState('')
  const [promotingClass, setPromotingClass] = useState(false)

  const getCurrentTerm = () => {
    const m = new Date().getMonth()
    if (m >= 0 && m <= 3) return 'Term 1'
    if (m >= 4 && m <= 7) return 'Term 2'
    return 'Term 3'
  }
  const getCurrentYear = () => new Date().getFullYear()

  // Close actions menu on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpenMenuId(null)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    if (!selectedStudent || view !== 'profile') return
    if (profileTab === 'fees') fetchProfileFee()
    else if (profileTab === 'attendance') fetchProfileAttendance()
    else if (profileTab === 'cbc' || profileTab === 'academics') fetchProfileGrades()
  }, [profileTab, selectedStudent?.id, view])

  const fetchProfileFee = async () => {
    setProfileTabLoading(true)
    const ct = getCurrentTerm()
    const cy = getCurrentYear()
    try {
      const [assessmentsRes, paymentsRes] = await Promise.all([
        supabase.from('fee_assessments').select('*').eq('student_id', selectedStudent.id).eq('term', ct).eq('year', cy),
        supabase.from('fee_payments').select('*').eq('student_id', selectedStudent.id).order('transaction_date', { ascending: false }),
      ])
      const totalCharged = (assessmentsRes.data || []).reduce((s, a) => s + Number(a.amount_due), 0)
      const totalPaid = (paymentsRes.data || []).reduce((s, p) => s + Number(p.amount), 0)
      setProfileFee({ assessments: assessmentsRes.data || [], payments: paymentsRes.data || [], totalCharged, totalPaid, balance: totalCharged - totalPaid })
    } catch (e) { console.error(e) }
    setProfileTabLoading(false)
  }

  const fetchProfileAttendance = async () => {
    setProfileTabLoading(true)
    try {
      const { data } = await supabase.from('attendance').select('*').eq('student_id', selectedStudent.id).order('date', { ascending: false }).limit(60)
      const records = data || []
      setProfileAttendance({
        records,
        present: records.filter(r => r.status === 'present').length,
        absent: records.filter(r => r.status === 'absent').length,
        late: records.filter(r => r.status === 'late').length,
      })
    } catch (e) { console.error(e) }
    setProfileTabLoading(false)
  }

  const fetchProfileGrades = async () => {
    setProfileTabLoading(true)
    try {
      const { data } = await supabase.from('grades').select('*').eq('student_id', selectedStudent.id).order('year', { ascending: false }).order('term', { ascending: false })
      setProfileGrades(data || [])
    } catch (e) { console.error(e) }
    setProfileTabLoading(false)
  }

  useEffect(() => { fetchStudents() }, [profile?.school_id])

  const fetchStudents = async () => {
    setLoading(true)
    let query = supabase
      .from('students')
      .select('*')
      .eq('school_id', profile.school_id)

    if (filterStatus) query = query.eq('status', filterStatus)
    if (filterClass) query = query.eq('class', filterClass)
    if (filterStream) query = query.eq('stream', filterStream)
    if (filterGender) query = query.eq('gender', filterGender)
    if (filterBoarding) query = query.eq('day_boarding', filterBoarding)
    if (search) {
      const s = `%${search}%`
      query = query.or(`full_name.ilike.${s},admission_number.ilike.${s}`)
    }

    const { data } = await query.order('created_at', { ascending: false })
    setStudents(data || [])

    if (data && data.length > 0) {
      const emails = data.filter(s => s.email).map(s => s.email)
      if (emails.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('email')
          .in('email', emails)
          .eq('role', 'student')
        setExistingLogins(new Set((profiles || []).map(p => p.email)))
      }
    }
    setLoading(false)
  }

  const generateAdmNumber = () => {
    const year = new Date().getFullYear()
    const seq = String(students.length + 1).padStart(4, '0')
    return `ADM/${year}/${seq}`
  }

  const handleBulkCreateLogins = async () => {
    setCreatingLogins(true); setLoginResult('')
    try {
      const result = await bulkCreateStudentAuth(profile.school_id)
      setLoginResult(`Created ${result.created}. Reset ${result.reset}. ${result.skipped} failed.`)
      fetchStudents()
    } catch (err) { setLoginResult(err.message) }
    setCreatingLogins(false)
  }

  const handleCreateSingleLogin = async (student) => {
    if (!student.email) { setLoginResult(`${student.full_name}: no email address`); return }
    try {
      await createStudentAuth(student, profile.school_id)
      setExistingLogins(prev => new Set([...prev, student.email]))
      setLoginResult(`Login created for ${student.full_name} (password: Student@123)`)
    } catch (err) { setLoginResult(`${student.full_name}: ${err.message}`) }
  }

  const handleResetAllPasswords = async () => {
    if (!confirm('Reset ALL student passwords to Student@123?')) return
    setResettingPasswords(true); setLoginResult('')
    try {
      const result = await resetAllStudentPasswords()
      setLoginResult(`Reset ${result.reset} passwords. ${result.failed} failed. All student passwords are now: Student@123`)
    } catch (err) { setLoginResult(`Error: ${err.message}`) }
    setResettingPasswords(false)
  }

  const openAddModal = () => {
    setEditingStudent(null)
    setForm({ ...EMPTY_FORM, admission_number: generateAdmNumber() })
    setGuardians([
      { ...EMPTY_GUARDIAN, relationship: 'father', portal_access: true },
      { ...EMPTY_GUARDIAN, relationship: 'mother', portal_access: true },
    ])
    setError('')
    setShowModal(true)
  }

  const openEditModal = (student) => {
    setEditingStudent(student)
    setForm({
      full_name: student.full_name || '',
      admission_number: student.admission_number || '',
      class: student.class || '',
      stream: student.stream || '',
      date_of_birth: student.date_of_birth || '',
      gender: student.gender || '',
      phone: student.phone || '',
      email: student.email || '',
      photo_url: student.photo_url || '',
      birth_cert_number: student.birth_cert_number || '',
      nationality: student.nationality || '',
      religion: student.religion || '',
      home_address: student.home_address || '',
      county: student.county || '',
      sub_county: student.sub_county || '',
      previous_school: student.previous_school || '',
      blood_group: student.blood_group || '',
      medical_conditions: student.medical_conditions || '',
      allergies: student.allergies || '',
      special_needs: student.special_needs || '',
      transport_route: student.transport_route || '',
      day_boarding: student.day_boarding || '',
      house: student.house || '',
      club: student.club || '',
      upi_number: student.upi_number || '',
      status: student.status || 'active',
    })
    setGuardians(
      student.guardians?.length
        ? student.guardians
        : [{ name: student.parent_name || '', relationship: 'father', phone: student.parent_phone || '', email: student.parent_email || '', national_id: '', occupation: '', address: '', is_fee_payer: false, sms_notification: true, portal_access: true }]
    )
    setError('')
    setShowModal(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')

    if (!form.full_name.trim()) {
      setError('Full name is required')
      setSaving(false)
      return
    }

    const now = new Date().toISOString()
    const payload = {
      school_id: profile.school_id,
      admission_number: form.admission_number || generateAdmNumber(),
      full_name: form.full_name.trim(),
      class: form.class,
      stream: form.stream || null,
      date_of_birth: form.date_of_birth || null,
      gender: form.gender || null,
      phone: form.phone || null,
      email: form.email || null,
      photo_url: form.photo_url || null,
      birth_cert_number: form.birth_cert_number || null,
      nationality: form.nationality || null,
      religion: form.religion || null,
      home_address: form.home_address || null,
      county: form.county || null,
      sub_county: form.sub_county || null,
      previous_school: form.previous_school || null,
      blood_group: form.blood_group || null,
      medical_conditions: form.medical_conditions || null,
      allergies: form.allergies || null,
      special_needs: form.special_needs || null,
      transport_route: form.transport_route || null,
      day_boarding: form.day_boarding || null,
      house: form.house || null,
      club: form.club || null,
      upi_number: form.upi_number || null,
      status: form.status || 'active',
      parent_name: guardians[0]?.name || null,
      parent_phone: guardians[0]?.phone || null,
      parent_email: guardians[0]?.email || null,
      updated_by: profile?.id,
      updated_at: now,
      guardians: guardians,
    }

    if (!editingStudent) {
      payload.created_by = profile?.id
      payload.created_at = now
    }

    try {
      if (editingStudent) {
        await supabase.from('students').update(payload).eq('id', editingStudent.id)
      } else {
        const { data: newStudent } = await supabase.from('students').insert(payload).select().single()
        if (newStudent?.email) {
          try {
            await createStudentAuth(newStudent, profile.school_id)
          } catch (authErr) {
            console.warn('Auth account creation failed:', authErr.message)
          }
        }
      }
      setSaving(false)
      setShowModal(false)
      fetchStudents()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  const handleSoftDelete = async (id) => {
    const s = students.find(x => x.id === id)
    if (!confirm(`Remove ${s?.full_name || 'this student'}? They will be marked inactive.`)) return
    await supabase.from('students').update({ status: 'inactive', updated_by: profile?.id, updated_at: new Date().toISOString() }).eq('id', id)
    setOpenMenuId(null)
    fetchStudents()
  }

  const handleRestore = async (id) => {
    await supabase.from('students').update({ status: 'active', updated_by: profile?.id, updated_at: new Date().toISOString() }).eq('id', id)
    setOpenMenuId(null)
    fetchStudents()
  }

  const handleBulkDelete = async () => {
    if (!confirm(`Remove ${selectedIds.size} students?`)) return
    const now = new Date().toISOString()
    await supabase.from('students').update({ status: 'inactive', updated_by: profile?.id, updated_at: now }).in('id', [...selectedIds])
    setSelectedIds(new Set())
    fetchStudents()
  }

  const handleBulkPromote = async () => {
    const ids = [...selectedIds]
    if (!ids.length) return
    if (!confirm(`Promote ${ids.length} selected student${ids.length === 1 ? '' : 's'} to the next class?`)) return
    const NEXT_MAP = {
      'PP1': 'PP2', 'PP2': 'Grade 1', 'Grade 1': 'Grade 2', 'Grade 2': 'Grade 3',
      'Grade 3': 'Grade 4', 'Grade 4': 'Grade 5', 'Grade 5': 'Grade 6',
      'Grade 6': 'Grade 7', 'Grade 7': 'Grade 8', 'Grade 8': 'Grade 9',
      'Grade 9': 'Graduated', 'Grade 10': 'Grade 11', 'Grade 11': 'Graduated',
    }
    const now = new Date().toISOString()
    let promoted = 0; let skipped = 0
    try {
      const result = await promoteStudentsAtomic(profile.school_id, ids, profile.id)
      promoted = result?.promoted || 0
    } catch {
      for (const id of ids) {
        const s = students.find(x => x.id === id)
        if (!s) continue
        const next = NEXT_MAP[s.class]
        if (!next) { skipped++; continue }
        await supabase.from('students').update({
          class: next === 'Graduated' ? s.class : next,
          status: next === 'Graduated' ? 'alumni' : 'active',
          exit_reason: next === 'Graduated' ? 'Completed' : null,
          exit_date: next === 'Graduated' ? now.slice(0, 10) : null,
          updated_at: now, updated_by: profile?.id,
        }).eq('id', id)
        await supabase.from('audit_logs').insert({
          school_id: profile.school_id, action: next === 'Graduated' ? 'student_graduated' : 'student_promoted',
          details: { message: `${s.full_name}: ${s.class} → ${next === 'Graduated' ? 'Alumni' : next}`, entity_type: 'student', entity_id: id },
          performed_by: profile?.id,
        })
        promoted++
      }
    }
    const msg = skipped > 0
      ? `Promoted ${promoted}. ${skipped} skipped (no promotion target).`
      : `Successfully promoted ${promoted} student${promoted === 1 ? '' : 's'}.`
    alert(msg)
    setSelectedIds(new Set())
    fetchStudents()
  }

  const handleMarkAsAlumni = async (s) => {
    if (!window.confirm(`Mark ${s.full_name} (${s.admission_number}) as alumni?`)) return
    const now = new Date().toISOString()
    await supabase.from('students').update({
      status: 'alumni', exit_reason: 'Completed',
      exit_date: now.slice(0, 10), updated_at: now, updated_by: profile?.id,
    }).eq('id', s.id)
    await supabase.from('audit_logs').insert({
      school_id: profile.school_id, action: 'student_graduated_manual',
      details: { message: `Admin manually marked ${s.full_name} as alumni`, entity_type: 'student', entity_id: s.id },
      performed_by: profile?.id,
    })
    setOpenMenuId(null)
    fetchStudents()
  }

  const handleBulkMarkAsAlumni = async () => {
    const ids = [...selectedIds]
    if (!ids.length) return
    if (!confirm(`Mark ${ids.length} selected student${ids.length === 1 ? '' : 's'} as alumni?`)) return
    const now = new Date().toISOString()
    for (const id of ids) {
      await supabase.from('students').update({
        status: 'alumni', exit_reason: 'Completed',
        exit_date: now.slice(0, 10), updated_at: now, updated_by: profile?.id,
      }).eq('id', id)
      await supabase.from('audit_logs').insert({
        school_id: profile.school_id, action: 'student_graduated_manual',
        details: { message: 'Bulk marked as alumni', entity_type: 'student', entity_id: id }, performed_by: profile?.id,
      })
    }
    setSelectedIds(new Set())
    fetchStudents()
  }

  const handlePromoteClass = async () => {
    if (!filterClass) { alert('Select a class to promote.'); return }
    const targetStudents = filtered.filter(s => s.status === 'active')
    if (!targetStudents.length) { alert('No active students in this class.'); return }
    if (!confirm(`Promote all ${targetStudents.length} active students in ${filterClass} to the next class?`)) return
    const NEXT_MAP = {
      'PP1': 'PP2', 'PP2': 'Grade 1', 'Grade 1': 'Grade 2', 'Grade 2': 'Grade 3',
      'Grade 3': 'Grade 4', 'Grade 4': 'Grade 5', 'Grade 5': 'Grade 6',
      'Grade 6': 'Grade 7', 'Grade 7': 'Grade 8', 'Grade 8': 'Grade 9',
      'Grade 9': 'Graduated', 'Grade 10': 'Grade 11', 'Grade 11': 'Graduated',
    }
    const now = new Date().toISOString()
    setPromotingClass(true)
    let promoted = 0; let skipped = 0
    try {
      const ids = targetStudents.map(s => s.id)
      const result = await promoteStudentsAtomic(profile.school_id, ids, profile.id)
      promoted = result?.promoted || 0
    } catch {
      for (const s of targetStudents) {
        const next = NEXT_MAP[s.class]
        if (!next) { skipped++; continue }
        await supabase.from('students').update({
          class: next === 'Graduated' ? s.class : next,
          status: next === 'Graduated' ? 'alumni' : 'active',
          exit_reason: next === 'Graduated' ? 'Completed' : null,
          exit_date: next === 'Graduated' ? now.slice(0, 10) : null,
          updated_at: now, updated_by: profile?.id,
        }).eq('id', s.id)
        await supabase.from('audit_logs').insert({
          school_id: profile.school_id, action: next === 'Graduated' ? 'student_graduated' : 'student_promoted',
          details: { message: `${s.full_name}: ${s.class} → ${next === 'Graduated' ? 'Alumni' : next}`, entity_type: 'student', entity_id: s.id },
          performed_by: profile?.id,
        })
        promoted++
      }
    }
    const msg = skipped > 0
      ? `Promoted ${promoted}. ${skipped} skipped.`
      : `Promoted ${promoted} student${promoted === 1 ? '' : 's'} from ${filterClass}.`
    alert(msg)
    setPromotingClass(false)
    fetchStudents()
  }

  const handleExportExcel = async () => {
    const { data } = await supabase.from('students').select('*').eq('school_id', profile.school_id).order('full_name')
    if (!data?.length) return
    const rows = data.map(s => ({
      'Admission No': s.admission_number, 'Full Name': s.full_name, 'Class': s.class,
      'Stream': s.stream, 'Gender': s.gender, 'Status': s.status, 'Date of Birth': s.date_of_birth,
      'Parent Name': s.parent_name, 'Parent Phone': s.parent_phone,
      'Day/Boarding': s.day_boarding, 'UPI Number': s.upi_number,
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Students')
    XLSX.writeFile(wb, `students_${Date.now()}.xlsx`)
  }

  const handleExportPDF = async () => {
    let query = supabase.from('students').select('*').eq('school_id', profile.school_id).eq('status', 'active')
    if (filterClass) query = query.eq('class', filterClass)
    if (filterStream) query = query.eq('stream', filterStream)
    const { data } = await query.order('full_name')
    if (!data?.length) return
    const filters = {}
    if (filterClass) filters.class = filterClass
    if (filterStream) filters.stream = filterStream
    exportToPDF(data, { title: 'Student List', school, filters })
  }

  const handlePrint = () => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) return
    const rows = filtered.map((s, i) => `<tr><td style="text-align:center">${i + 1}</td><td>${s.admission_number}</td><td>${s.full_name}</td><td>${s.class}</td><td>${s.gender || '—'}</td><td>${s.status}</td></tr>`).join('')
    const schoolName = school?.name || ''
    printWindow.document.write(`
      <html><head><title>Student List</title>
      <style>
        @page{size:A4 landscape;margin:10mm} *{font-family:Arial,sans-serif}
        .ph{display:flex;align-items:center;justify-content:center;gap:14px;margin-bottom:10px}
        .ph img{max-height:48px;width:auto;display:block}
        .ph h2{margin:0;font-size:18px}
        .ps{text-align:center;font-size:12px;color:#555;margin-bottom:14px}
        table{width:100%;border-collapse:collapse;border:2px solid #111}
        th,td{border:1px solid #111;padding:6px 8px;font-size:11px;text-align:left}
        th{background:#f1f1f1}
      </style>
      </head><body>
      <div class="ph"><h2>${schoolName}</h2></div>
      <div class="ps">Student List</div>
      <table><thead><tr>
      <th>No.</th><th>Adm No</th><th>Full Name</th><th>Class</th><th>Gender</th><th>Status</th>
      </tr></thead><tbody>${rows}</tbody></table>
      <p style="text-align:center;font-size:10px;color:#999;margin-top:12px">Generated on ${new Date().toLocaleDateString()} | ${filtered.length} students</p>
      </body></html>
    `)
    printWindow.document.close()
    printWindow.onload = () => { printWindow.focus(); printWindow.print() }
  }

  const handleViewProfile = (student) => {
    setSelectedStudent(student)
    setProfileTab('personal')
    setView('profile')
    setOpenMenuId(null)
  }

  const selectAll = (checked) => {
    setSelectedIds(new Set(checked ? pagedData.map(s => s.id) : []))
  }

  const toggleSelect = (id) => {
    const next = new Set(selectedIds)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelectedIds(next)
  }

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
    setPage(1)
  }

  // Derived data
  const classes = [...new Set(students.map(s => s.class).filter(Boolean))].sort()
  const streams = [...new Set(students.map(s => s.stream).filter(Boolean))].sort()
  const filtered = students.filter(s => {
    if (filterClass && s.class !== filterClass) return false
    if (filterStream && s.stream !== filterStream) return false
    if (filterGender && s.gender !== filterGender) return false
    if (filterStatus && s.status !== filterStatus) return false
    if (filterBoarding && s.day_boarding !== filterBoarding) return false
    if (search) {
      const q = search.toLowerCase()
      if (!s.full_name?.toLowerCase().includes(q) && !s.admission_number?.toLowerCase().includes(q)) return false
    }
    return true
  })

  const sorted = [...filtered].sort((a, b) => {
    const av = (a[sortKey] || '').toString().toLowerCase()
    const bv = (b[sortKey] || '').toString().toLowerCase()
    if (av < bv) return sortDir === 'asc' ? -1 : 1
    if (av > bv) return sortDir === 'asc' ? 1 : -1
    return 0
  })

  const totalPages = Math.ceil(sorted.length / ROWS_PER_PAGE)
  const pagedData = sorted.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE)

  const hasFilters = search || filterClass || filterStream || filterGender || filterStatus !== 'active' || filterBoarding
  const clearFilters = () => {
    setSearch(''); setFilterClass(''); setFilterStream(''); setFilterGender('')
    setFilterStatus('active'); setFilterBoarding('')
    setPage(1)
  }

  const activeCount = students.filter(s => s.status === 'active').length
  const totalCount = students.length

  // ─── PROFILE VIEW ───
  if (view === 'profile' && selectedStudent) {
    const s = selectedStudent
    const renderProfileTab = () => {
      switch (profileTab) {
        case 'personal':
          return (
            <div className="sp-section">
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                <button className="sp-btn-ghost sm" onClick={() => downloadProfilePdf(generatePersonalPdf, 'personal_info')}>
                  <Printer size={14} /> Print PDF
                </button>
              </div>
              <div className="sp-info-grid">
                {[
                  ['Admission No', s.admission_number], ['Full Name', s.full_name],
                  ['Class', s.class], ['Stream', s.stream], ['Gender', s.gender],
                  ['Date of Birth', s.date_of_birth], ['Date Admitted', s.date_admitted],
                  ['Nationality', s.nationality], ['Religion', s.religion],
                  ['Home Address', s.home_address],
                  ['County/Sub-county', s.county ? `${s.county}${s.sub_county ? ` / ${s.sub_county}` : ''}` : null],
                  ['Phone', s.phone], ['Email', s.email], ['UPI Number', s.upi_number],
                  ['Birth Cert No', s.birth_cert_number], ['Previous School', s.previous_school],
                  ['Day/Boarding', s.day_boarding], ['Transport Route', s.transport_route],
                  ['House', s.house], ['Club', s.club], ['Status', s.status],
                ].filter(([, v]) => v).map(([label, value]) => (
                  <div key={label} className="sp-info-item">
                    <label>{label}</label>
                    <span>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        case 'parents':
          const guardianList = s.guardians || []
          return (
            <div className="sp-section">
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                <button className="sp-btn-ghost sm" onClick={() => downloadProfilePdf(generateParentsPdf, 'parents')}>
                  <Printer size={14} /> Print PDF
                </button>
              </div>
              {guardianList.length === 0 && !s.parent_name && <p className="sp-empty-text">No guardian information recorded.</p>}
              {guardianList.length > 0 && guardianList.map((g, i) => (
                <div key={i} className="sp-guardian-card">
                  <p className="sp-guardian-label">{g.relationship || `Guardian ${i + 1}`}</p>
                  <div className="sp-info-grid" style={{ marginTop: 8 }}>
                    <div className="sp-info-item"><label>Name</label><span>{g.name || '—'}</span></div>
                    <div className="sp-info-item"><label>Phone</label><span>{g.phone || '—'}</span></div>
                    <div className="sp-info-item"><label>Email</label><span>{g.email || '—'}</span></div>
                    <div className="sp-info-item"><label>ID Number</label><span>{g.national_id || '—'}</span></div>
                    <div className="sp-info-item"><label>Occupation</label><span>{g.occupation || '—'}</span></div>
                    <div className="sp-info-item"><label>Portal Access</label><span>{g.portal_access ? 'Yes' : 'No'}</span></div>
                  </div>
                </div>
              ))}
              {s.parent_name && (
                <div className="sp-guardian-card">
                  <p className="sp-guardian-label">Primary Contact</p>
                  <div className="sp-info-grid" style={{ marginTop: 8 }}>
                    <div className="sp-info-item"><label>Name</label><span>{s.parent_name}</span></div>
                    <div className="sp-info-item"><label>Phone</label><span>{s.parent_phone || '—'}</span></div>
                    <div className="sp-info-item"><label>Email</label><span>{s.parent_email || '—'}</span></div>
                  </div>
                </div>
              )}
            </div>
          )
        case 'medical':
          return (
            <div className="sp-section">
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                <button className="sp-btn-ghost sm" onClick={() => downloadProfilePdf(generateMedicalPdf, 'medical')}>
                  <Printer size={14} /> Print PDF
                </button>
              </div>
              <div className="sp-info-grid">
                <div className="sp-info-item"><label>Blood Group</label><span>{s.blood_group || '—'}</span></div>
                <div className="sp-info-item"><label>Allergies</label><span>{s.allergies || 'None'}</span></div>
                <div className="sp-info-item"><label>Medical Conditions</label><span>{s.medical_conditions || 'None'}</span></div>
                <div className="sp-info-item"><label>Special Needs</label><span>{s.special_needs || 'None'}</span></div>
              </div>
            </div>
          )
        case 'fees':
          if (profileTabLoading) return <div className="sp-loading">Loading fee data...</div>
          const fc = profileFee
          const feeStatus = fc.balance <= 0 ? 'cleared' : fc.totalPaid > 0 ? 'partial' : 'due'
          return (
            <div className="sp-section">
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                <button className="sp-btn-ghost sm" onClick={() => downloadProfilePdf(generateFeeAccountPdf, 'fee_account')}>
                  <Printer size={14} /> Print PDF
                </button>
              </div>
              <div className="sp-summary-grid">
                <div className="sp-summary-card"><p className="sp-summary-val">{fmt(fc.totalCharged)}</p><p className="sp-summary-label">Total Charged</p></div>
                <div className="sp-summary-card"><p className="sp-summary-val" style={{ color: '#16a34a' }}>{fmt(fc.totalPaid)}</p><p className="sp-summary-label">Total Paid</p></div>
                <div className="sp-summary-card"><p className="sp-summary-val" style={{ color: fc.balance <= 0 ? '#16a34a' : '#ef4444' }}>{fmt(fc.balance)}</p><p className="sp-summary-label">Balance</p></div>
                <div className="sp-summary-card"><p className={`sp-badge ${feeStatus}`}>{feeStatus}</p><p className="sp-summary-label">Status</p></div>
              </div>
              {fc.assessments.length > 0 && (
                <div className="sp-card" style={{ padding: 16 }}>
                  <p className="sp-card-title">Fee Assessments — {getCurrentTerm()} {getCurrentYear()}</p>
                  <div className="sp-table-wrap"><table className="sp-table"><thead><tr><th>Amount Due</th><th>Amount Paid</th><th>Status</th></tr></thead><tbody>
                    {fc.assessments.map(a => (<tr key={a.id}><td>{fmt(a.amount_due)}</td><td>{fmt(a.amount_paid || 0)}</td><td><span className={`sp-badge ${a.status}`}>{a.status}</span></td></tr>))}
                  </tbody></table></div>
                </div>
              )}
              {fc.payments.length > 0 && (
                <div className="sp-card" style={{ padding: 16 }}>
                  <p className="sp-card-title">Payment History</p>
                  <div className="sp-table-wrap"><table className="sp-table"><thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Reference</th></tr></thead><tbody>
                    {fc.payments.map(p => (<tr key={p.id}><td>{fmtDate(p.transaction_date)}</td><td style={{ color: '#16a34a', fontWeight: 600 }}>{fmt(p.amount)}</td><td style={{ textTransform: 'capitalize' }}>{p.payment_type || '—'}</td><td className="sp-mono">{p.reference || '—'}</td></tr>))}
                  </tbody></table></div>
                </div>
              )}
              {fc.assessments.length === 0 && fc.payments.length === 0 && <p className="sp-empty-text">No fee records for {getCurrentTerm()} {getCurrentYear()}.</p>}
            </div>
          )
        case 'attendance':
          if (profileTabLoading) return <div className="sp-loading">Loading attendance...</div>
          const ac = profileAttendance
          const total = ac.present + ac.absent + ac.late
          const pct = total > 0 ? Math.round((ac.present / total) * 100) : 0
          return (
            <div className="sp-section">
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                <button className="sp-btn-ghost sm" onClick={() => downloadProfilePdf(generateAttendancePdf, 'attendance')}>
                  <Printer size={14} /> Print PDF
                </button>
              </div>
              <div className="sp-summary-grid">
                <div className="sp-summary-card"><p className="sp-summary-val" style={{ color: '#16a34a' }}>{ac.present}</p><p className="sp-summary-label">Present</p></div>
                <div className="sp-summary-card"><p className="sp-summary-val" style={{ color: '#ef4444' }}>{ac.absent}</p><p className="sp-summary-label">Absent</p></div>
                <div className="sp-summary-card"><p className="sp-summary-val" style={{ color: '#f59e0b' }}>{ac.late}</p><p className="sp-summary-label">Late</p></div>
                <div className="sp-summary-card"><p className="sp-summary-val" style={{ color: pct >= 80 ? '#16a34a' : '#ef4444' }}>{pct}%</p><p className="sp-summary-label">Rate</p></div>
              </div>
              {ac.records.length > 0 ? (
                <div className="sp-card" style={{ padding: 16 }}>
                  <p className="sp-card-title">Attendance Records (last 60 days)</p>
                  <div className="sp-table-wrap"><table className="sp-table"><thead><tr><th>Date</th><th>Status</th></tr></thead><tbody>
                    {ac.records.map(r => (<tr key={r.id}><td>{r.date}</td><td><span className={`sp-badge ${r.status}`}>{r.status}</span></td></tr>))}
                  </tbody></table></div>
                </div>
              ) : <p className="sp-empty-text">No attendance records found.</p>}
            </div>
          )
        case 'cbc':
          if (profileTabLoading) return <div className="sp-loading">Loading CBC data...</div>
          const cbcGrades = profileGrades.filter(g => g.cbe_band || g.performance_level)
          if (cbcGrades.length === 0) return <div className="sp-section"><p className="sp-empty-text">No CBC assessments recorded yet.</p></div>
          const cbcByTerm = {}
          cbcGrades.forEach(g => { const k = `${g.term} ${g.year}`; if (!cbcByTerm[k]) cbcByTerm[k] = []; cbcByTerm[k].push(g) })
          return (
            <div className="sp-section">
              {Object.entries(cbcByTerm).map(([term, grades]) => (
                <div key={term} className="sp-card" style={{ padding: 16 }}>
                  <p className="sp-card-title">{term}</p>
                  <div className="sp-table-wrap"><table className="sp-table"><thead><tr><th>Subject</th><th>Score</th><th>Grade</th><th>CBE Band</th><th>Level</th></tr></thead><tbody>
                    {grades.map(g => (<tr key={g.id}><td>{g.subject}</td><td>{g.total_score ?? '—'}</td><td>{g.grade || '—'}</td><td>{g.cbe_band || '—'}</td><td>{g.performance_level || '—'}</td></tr>))}
                  </tbody></table></div>
                </div>
              ))}
            </div>
          )
        case 'academics':
          if (profileTabLoading) return <div className="sp-loading">Loading academic records...</div>
          if (profileGrades.length === 0) return <div className="sp-section"><p className="sp-empty-text">No academic records found.</p></div>
          const acByTerm = {}
          profileGrades.forEach(g => { const k = `${g.term} ${g.year}`; if (!acByTerm[k]) acByTerm[k] = []; acByTerm[k].push(g) })
          return (
            <div className="sp-section">
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                <button className="sp-btn-ghost sm" onClick={async () => {
                  setTranscriptComment('')
                  if (profile?.school_id && selectedStudent?.id) {
                    const comment = await fetchStudentComments(profile.school_id, selectedStudent.id, getCurrentTerm(), getCurrentYear())
                    setTranscriptComment(comment)
                  }
                  setShowTranscript(true)
                }}>
                  <Printer size={14} /> Print Transcript
                </button>
              </div>
              {Object.entries(acByTerm).map(([term, grades]) => {
                const total = grades.reduce((s, g) => s + Number(g.total_score || 0), 0)
                const avg = grades.length > 0 ? Math.round(total / grades.length) : 0
                return (
                  <div key={term} className="sp-card" style={{ padding: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <p className="sp-card-title" style={{ margin: 0 }}>{term}</p>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#2563eb' }}>Avg: {avg}%</span>
                    </div>
                    <div className="sp-table-wrap"><table className="sp-table"><thead><tr><th>Subject</th><th>CAT</th><th>Exam</th><th>Total</th><th>Grade</th></tr></thead><tbody>
                      {grades.map(g => (<tr key={g.id}><td>{g.subject}</td><td>{g.cat_score ?? '—'}</td><td>{g.exam_score ?? '—'}</td><td style={{ fontWeight: 600 }}>{g.total_score ?? '—'}</td><td><span className="sp-badge blue">{g.grade || '—'}</span></td></tr>))}
                    </tbody></table></div>
                  </div>
                )
              })}
            </div>
          )
        case 'documents':
          return <div className="sp-section"><StudentDocuments studentId={s.id} /></div>
        case 'history':
          return (
            <div className="sp-section">
              <div className="sp-info-grid">
                <div className="sp-info-item"><label>Created</label><span>{s.created_at ? new Date(s.created_at).toLocaleString() : '—'}</span></div>
                <div className="sp-info-item"><label>Last Updated</label><span>{s.updated_at ? new Date(s.updated_at).toLocaleString() : '—'}</span></div>
                <div className="sp-info-item"><label>Updated By</label><span>{s.updated_by || '—'}</span></div>
              </div>
            </div>
          )
        default: return null
      }
    }

    return (
      <>
        <div className="students-page">
          <div className="sp-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <button className="sp-btn-ghost" onClick={() => { setView('list'); setSelectedStudent(null) }}>
                <ArrowLeft size={15} /> Back
              </button>
              <div className="sp-avatar" style={{ width: 44, height: 44, fontSize: 16 }}>
                {s.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </div>
              <div>
                <h2 style={{ margin: 0 }}>{s.full_name}</h2>
                <p style={{ margin: '2px 0 0', color: '#64748b', fontSize: 13 }}>
                  {s.admission_number} — {s.class}{s.stream ? ` ${s.stream}` : ''}
                </p>
              </div>
            </div>
            <div className="sp-header-actions">
              <button className="sp-btn-outline" onClick={() => { openEditModal(s); setView('list') }}>
                <Edit size={15} /> Edit
              </button>
              <span className={`sp-badge ${s.status}`}>{s.status}</span>
            </div>
          </div>
          <div className="sp-tabs">
            {PROFILE_TABS.map(tab => (
              <button key={tab.key} className={`sp-tab ${profileTab === tab.key ? 'active' : ''}`} onClick={() => setProfileTab(tab.key)}>
                <tab.icon size={14} /> {tab.label}
              </button>
            ))}
          </div>
          <div className="sp-tab-content">{renderProfileTab()}</div>
        </div>
        {showTranscript && (
          <ReportCard student={selectedStudent} grades={profileGrades} school={school} term={getCurrentTerm()} year={getCurrentYear()} teacherComment={transcriptComment} onClose={() => setShowTranscript(false)} />
        )}
      </>
    )
  }

  // ─── LIST VIEW ───
  const SortTh = ({ label, sortField }) => (
    <th className="sp-th-sortable" onClick={() => handleSort(sortField)}>
      <span>{label}</span>
      {sortKey === sortField ? (
        sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
      ) : (
        <ArrowUpDown size={12} className="sp-sort-icon" />
      )}
    </th>
  )

  return (
    <div className="students-page">
      {/* Header */}
      <div className="sp-header">
        <div>
          <h2>Students</h2>
        </div>
        <div className="sp-header-actions">
          <button className="sp-btn-primary" onClick={openAddModal}>
            <Plus size={15} /> Add Student
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="sp-toolbar">
        <div className="sp-toolbar-left">
          <span className="sp-toolbar-title">Student Records</span>
          <span className="sp-count-badge green">{activeCount} active</span>
          <span className="sp-count-badge gray">{totalCount} total</span>
        </div>
        <div className="sp-toolbar-right">
          <button className="sp-btn-tool" onClick={handleBulkCreateLogins} disabled={creatingLogins} title="Create login accounts for all students">
            <Key size={14} /> <span className="sp-tool-label">{creatingLogins ? 'Creating...' : 'Create Logins'}</span>
          </button>
          <button className="sp-btn-tool" onClick={handleResetAllPasswords} disabled={resettingPasswords} title="Reset all student passwords to Student@123">
            <Key size={14} /> <span className="sp-tool-label">{resettingPasswords ? 'Resetting...' : 'Reset Passwords'}</span>
          </button>
          <button className="sp-btn-tool" onClick={handleExportExcel} title="Export Excel">
            <Download size={14} /> <span className="sp-tool-label">Excel</span>
          </button>
          <button className="sp-btn-tool" onClick={handleExportPDF} title="Export PDF">
            <FileText size={14} /> <span className="sp-tool-label">PDF</span>
          </button>
          <button className="sp-btn-tool" onClick={handlePrint} title="Print">
            <Printer size={14} /> <span className="sp-tool-label">Print</span>
          </button>
          <button className="sp-btn-tool" onClick={() => setShowImport(true)} title="Import">
            <Upload size={14} /> <span className="sp-tool-label">Import</span>
          </button>
          {filterClass && (
            <button className="sp-btn-tool accent" onClick={handlePromoteClass} disabled={promotingClass}>
              <ArrowUp size={14} /> <span className="sp-tool-label">{promotingClass ? 'Promoting...' : `Promote ${filterClass}`}</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="sp-filter-bar">
        <div className="sp-search-wrap">
          <Search size={14} className="sp-search-icon" />
          <input className="sp-search-input" placeholder="Search name or admission no..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
          {search && <button className="sp-search-clear" onClick={() => { setSearch(''); setPage(1) }}><X size={12} /></button>}
        </div>
        <select className="sp-filter-select" value={filterClass} onChange={e => { setFilterClass(e.target.value); setPage(1) }}>
          <option value="">All Classes</option>
          {classes.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="sp-filter-select" value={filterStream} onChange={e => { setFilterStream(e.target.value); setPage(1) }}>
          <option value="">All Streams</option>
          {streams.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="sp-filter-select" value={filterGender} onChange={e => { setFilterGender(e.target.value); setPage(1) }}>
          <option value="">All Genders</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
        </select>
        <select className="sp-filter-select" value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1) }}>
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="alumni">Alumni</option>
          <option value="transferred">Transferred</option>
        </select>
        <select className="sp-filter-select" value={filterBoarding} onChange={e => { setFilterBoarding(e.target.value); setPage(1) }}>
          <option value="">All</option>
          <option value="day">Day Scholar</option>
          <option value="boarding">Boarding</option>
        </select>
        {hasFilters && (
          <button className="sp-clear-btn" onClick={clearFilters}>
            <X size={12} /> Clear
          </button>
        )}
      </div>

      {loginResult && (
        <div className="sp-alert sp-alert--info" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 8, background: '#EFF6FF', color: '#1E40AF', marginBottom: 12 }}>
          <Key size={14} /> {loginResult}
          <button onClick={() => setLoginResult('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 16 }}>×</button>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="sp-skeleton-table">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="sp-skeleton-row">
              <div className="sp-skeleton-cell check" />
              <div className="sp-skeleton-cell avatar" />
              <div className="sp-skeleton-cell wide" />
              <div className="sp-skeleton-cell med" />
              <div className="sp-skeleton-cell short" />
              <div className="sp-skeleton-cell badge" />
              <div className="sp-skeleton-cell med" />
              <div className="sp-skeleton-cell dots" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="sp-empty">
          <Users size={40} color="#cbd5e1" />
          <p>{hasFilters ? 'No students match your filters.' : 'No students yet.'}</p>
          {!hasFilters && (
            <button className="sp-btn-primary" onClick={openAddModal}>
              <Plus size={14} /> Add First Student
            </button>
          )}
        </div>
      ) : (
        <>
        <div className="sp-card sp-table-card">
          <div className="sp-table-wrap">
            <table className="sp-table">
              <thead>
                <tr>
                  <th className="sp-th-check">
                    <input type="checkbox" checked={selectedIds.size === pagedData.length && pagedData.length > 0} onChange={e => selectAll(e.target.checked)} />
                  </th>
                  <SortTh label="Student" sortField="full_name" />
                  <SortTh label="Class" sortField="class" />
                  <SortTh label="Gender" sortField="gender" />
                  <SortTh label="Status" sortField="status" />
                  <th>Parent</th>
                  <th className="sp-th-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagedData.map(s => (
                  <tr key={s.id} className={selectedIds.has(s.id) ? 'sp-row-selected' : ''}>
                    <td className="sp-td-check">
                      <input type="checkbox" checked={selectedIds.has(s.id)} onChange={() => toggleSelect(s.id)} />
                    </td>
                    <td>
                      <button className="sp-student-cell" onClick={() => handleViewProfile(s)}>
                        <div className="sp-avatar">{s.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}</div>
                        <div className="sp-student-info">
                          <span className="sp-student-name">{s.full_name}</span>
                          <span className="sp-student-adm">{s.admission_number}</span>
                        </div>
                      </button>
                    </td>
                    <td>{s.class || '—'}{s.stream ? ` ${s.stream}` : ''}</td>
                    <td style={{ textTransform: 'capitalize' }}>{s.gender || '—'}</td>
                    <td><span className={`sp-badge ${s.status}`}>{s.status}</span></td>
                    <td className="sp-td-parent">{s.parent_name || '—'}</td>
                    <td className="sp-td-actions">
                      <div className="sp-actions-wrap" ref={openMenuId === s.id ? menuRef : undefined}>
                        <button className="sp-more-btn" onClick={() => setOpenMenuId(openMenuId === s.id ? null : s.id)}>
                          <MoreHorizontal size={16} />
                        </button>
                        {openMenuId === s.id && (
                          <div className="sp-dropdown">
                            <button onClick={() => handleViewProfile(s)}><Eye size={14} /> View Profile</button>
                            <button onClick={() => openEditModal(s)}><Edit size={14} /> Edit Student</button>
                            {s.email && !existingLogins.has(s.email) && (
                              <button onClick={() => handleCreateSingleLogin(s)}><Key size={14} /> Create Login</button>
                            )}
                            {s.email && existingLogins.has(s.email) && (
                              <span style={{ padding: '6px 12px', fontSize: 12, color: '#16A34A', display: 'flex', alignItems: 'center', gap: 6 }}><Key size={14} /> Has Login</span>
                            )}
                            {s.status === 'active' && <button onClick={() => { handleMarkAsAlumni(s) }}><GraduationCap size={14} /> Graduate</button>}
                            {s.status === 'active' ? (
                              <button className="sp-dd-danger" onClick={() => handleSoftDelete(s.id)}><Trash2 size={14} /> Archive</button>
                            ) : (
                              <button onClick={() => handleRestore(s.id)}><UserCheck size={14} /> Restore</button>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="sp-pagination">
              <span className="sp-page-info">
                Showing {(page - 1) * ROWS_PER_PAGE + 1}–{Math.min(page * ROWS_PER_PAGE, sorted.length)} of {sorted.length}
              </span>
              <div className="sp-page-btns">
                <button className="sp-page-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronRight size={14} style={{ transform: 'rotate(180deg)' }} /></button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  let pnum
                  if (totalPages <= 7) pnum = i + 1
                  else if (page <= 4) pnum = i + 1
                  else if (page >= totalPages - 3) pnum = totalPages - 6 + i
                  else pnum = page - 3 + i
                  return (
                    <button key={pnum} className={`sp-page-btn ${page === pnum ? 'active' : ''}`} onClick={() => setPage(pnum)}>{pnum}</button>
                  )
                })}
                <button className="sp-page-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight size={14} /></button>
              </div>
            </div>
          )}
        </div>

        {/* Mobile Cards (shown < 769px via CSS) */}
        <div className="sp-mobile-cards">
          {pagedData.map(s => (
            <div key={s.id} className="sp-m-card">
              <div className="sp-m-card-top">
                <div className="sp-avatar">{s.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}</div>
                <div className="sp-m-card-info">
                  <div className="sp-m-card-name">{s.full_name}</div>
                  <div className="sp-m-card-adm">{s.admission_number}</div>
                </div>
                <div className="sp-actions-wrap" ref={openMenuId === `m-${s.id}` ? menuRef : undefined}>
                  <button className="sp-more-btn" onClick={() => setOpenMenuId(openMenuId === `m-${s.id}` ? null : `m-${s.id}`)}>
                    <MoreHorizontal size={16} />
                  </button>
                  {openMenuId === `m-${s.id}` && (
                    <div className="sp-dropdown">
                      <button onClick={() => handleViewProfile(s)}><Eye size={14} /> View Profile</button>
                      <button onClick={() => openEditModal(s)}><Edit size={14} /> Edit Student</button>
                      {s.status === 'active' && <button onClick={() => handleMarkAsAlumni(s)}><GraduationCap size={14} /> Graduate</button>}
                      {s.status === 'active' ? (
                        <button className="sp-dd-danger" onClick={() => handleSoftDelete(s.id)}><Trash2 size={14} /> Archive</button>
                      ) : (
                        <button onClick={() => handleRestore(s.id)}><UserCheck size={14} /> Restore</button>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="sp-m-card-meta">
                <span>{s.class}{s.stream ? ` ${s.stream}` : ''}</span>
                <span style={{ textTransform: 'capitalize' }}>{s.gender || '—'}</span>
                <span>{s.parent_name || '—'}</span>
              </div>
              <div className="sp-m-card-bottom">
                <span className={`sp-badge ${s.status}`}>{s.status}</span>
              </div>
            </div>
          ))}
        </div>
        </>
      )}

      {/* Sticky Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="sp-bulk-bar">
          <div className="sp-bulk-bar-inner">
            <div className="sp-bulk-left">
              <CheckSquare size={16} />
              <span className="sp-bulk-count">{selectedIds.size} selected</span>
            </div>
            <div className="sp-bulk-actions">
              <button className="sp-bulk-btn" onClick={handleBulkPromote}><ArrowUp size={14} /> Promote</button>
              <button className="sp-bulk-btn"><Printer size={14} /> Print IDs</button>
              <button className="sp-bulk-btn"><Download size={14} /> Export</button>
              <button className="sp-bulk-btn danger" onClick={handleBulkDelete}><Trash2 size={14} /> Archive</button>
              <button className="sp-bulk-btn ghost" onClick={() => setSelectedIds(new Set())}><X size={14} /> Clear</button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImport && (
        <ImportExcelModal
          schoolId={profile?.school_id}
          onClose={() => setShowImport(false)}
          onComplete={() => { setShowImport(false); fetchStudents() }}
        />
      )}

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="sp-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="sp-modal sp-modal-lg" onClick={e => e.stopPropagation()}>
            <div className="sp-modal-head">
              <h3>{editingStudent ? 'Edit Student' : 'Add New Student'}</h3>
              <button className="sp-modal-close" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} className="sp-modal-form">
              {error && <div className="sp-form-error">{error}</div>}

              <p className="sp-form-label">Personal Details</p>
              <div className="sp-form-grid">
                <div className="sp-field full"><label>Full Name *</label><input required placeholder="e.g. Jane Wanjiku" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} /></div>
                <div className="sp-field"><label>Admission Number</label><input placeholder="Auto" value={form.admission_number} onChange={e => setForm({ ...form, admission_number: e.target.value })} /></div>
                <div className="sp-field"><label>Photo URL</label><input placeholder="https://..." value={form.photo_url} onChange={e => setForm({ ...form, photo_url: e.target.value })} /></div>
                <div className="sp-field"><label>Birth Cert No</label><input placeholder="BC123456" value={form.birth_cert_number} onChange={e => setForm({ ...form, birth_cert_number: e.target.value })} /></div>
                <div className="sp-field"><label>Date of Birth</label><input type="date" value={form.date_of_birth} onChange={e => setForm({ ...form, date_of_birth: e.target.value })} /></div>
                <div className="sp-field"><label>Gender</label><select value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value })}><option value="">Select</option><option value="male">Male</option><option value="female">Female</option></select></div>
                <div className="sp-field"><label>Nationality</label><input placeholder="Kenyan" value={form.nationality} onChange={e => setForm({ ...form, nationality: e.target.value })} /></div>
                <div className="sp-field"><label>Religion</label><input placeholder="Christian" value={form.religion} onChange={e => setForm({ ...form, religion: e.target.value })} /></div>
                <div className="sp-field full"><label>Home Address</label><input placeholder="123 Nairobi" value={form.home_address} onChange={e => setForm({ ...form, home_address: e.target.value })} /></div>
                <div className="sp-field"><label>County</label><input placeholder="Nairobi" value={form.county} onChange={e => setForm({ ...form, county: e.target.value })} /></div>
                <div className="sp-field"><label>Sub-county</label><input placeholder="Westlands" value={form.sub_county} onChange={e => setForm({ ...form, sub_county: e.target.value })} /></div>
                <div className="sp-field"><label>Student Email</label><input type="email" placeholder="student@email.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
                <div className="sp-field"><label>Student Phone</label><input placeholder="0712345678" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
                <div className="sp-field"><label>UPI Number</label><input placeholder="Learner UPI" value={form.upi_number} onChange={e => setForm({ ...form, upi_number: e.target.value })} /></div>
                <div className="sp-field"><label>Previous School</label><input placeholder="Previous school" value={form.previous_school} onChange={e => setForm({ ...form, previous_school: e.target.value })} /></div>
              </div>

              <p className="sp-form-label">Academic Information</p>
              <div className="sp-form-grid">
                <div className="sp-field"><label>Class *</label><select required value={form.class} onChange={e => setForm({ ...form, class: e.target.value })}><option value="">Select class</option>{CLASS_GROUPS.map(g => (<optgroup key={g.label} label={g.label}>{g.options.map(o => <option key={o} value={o}>{o}</option>)}</optgroup>))}</select></div>
                <div className="sp-field"><label>Stream</label><input placeholder="e.g. East" value={form.stream} onChange={e => setForm({ ...form, stream: e.target.value })} /></div>
                <div className="sp-field"><label>Status</label><select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}><option value="active">Active</option><option value="inactive">Inactive</option><option value="alumni">Alumni</option><option value="transferred">Transferred</option></select></div>
              </div>

              <p className="sp-form-label">Medical Information</p>
              <div className="sp-form-grid">
                <div className="sp-field"><label>Blood Group</label><select value={form.blood_group} onChange={e => setForm({ ...form, blood_group: e.target.value })}><option value="">Select</option><option>A+</option><option>A-</option><option>B+</option><option>B-</option><option>AB+</option><option>AB-</option><option>O+</option><option>O-</option></select></div>
                <div className="sp-field"><label>Allergies</label><input placeholder="Peanuts, Dust" value={form.allergies} onChange={e => setForm({ ...form, allergies: e.target.value })} /></div>
                <div className="sp-field"><label>Medical Conditions</label><input placeholder="Asthma" value={form.medical_conditions} onChange={e => setForm({ ...form, medical_conditions: e.target.value })} /></div>
                <div className="sp-field"><label>Special Needs</label><input placeholder="Visual impairment" value={form.special_needs} onChange={e => setForm({ ...form, special_needs: e.target.value })} /></div>
              </div>

              <p className="sp-form-label">Transport & Housing</p>
              <div className="sp-form-grid">
                <div className="sp-field"><label>Day / Boarding</label><select value={form.day_boarding} onChange={e => setForm({ ...form, day_boarding: e.target.value })}><option value="">Select</option><option value="day">Day Scholar</option><option value="boarding">Boarding</option></select></div>
                <div className="sp-field"><label>Transport Route</label><input placeholder="Route A - Kasarani" value={form.transport_route} onChange={e => setForm({ ...form, transport_route: e.target.value })} /></div>
                <div className="sp-field"><label>House</label><input placeholder="House of Champions" value={form.house} onChange={e => setForm({ ...form, house: e.target.value })} /></div>
                <div className="sp-field"><label>Club/Society</label><input placeholder="Music Club" value={form.club} onChange={e => setForm({ ...form, club: e.target.value })} /></div>
              </div>

              <p className="sp-form-label">Parent / Guardian Information</p>
              {guardians.map((g, i) => (
                <div key={i} className="sp-guardian-card" style={{ marginTop: i > 0 ? 12 : 0 }}>
                  <div className="sp-guardian-card-head">
                    <span className="sp-guardian-label">{g.relationship ? g.relationship.charAt(0).toUpperCase() + g.relationship.slice(1) : `Guardian ${i + 1}`}</span>
                    {guardians.length > 1 && (
                      <button type="button" className="sp-guardian-remove" onClick={() => setGuardians(guardians.filter((_, idx) => idx !== i))}><X size={14} /></button>
                    )}
                  </div>
                  <div className="sp-form-grid">
                    <div className="sp-field full"><label>Full Name</label><input placeholder="John Kamau" value={g.name} onChange={e => { const next = [...guardians]; next[i] = { ...next[i], name: e.target.value }; setGuardians(next) }} /></div>
                    <div className="sp-field"><label>Relationship</label><select value={g.relationship} onChange={e => { const next = [...guardians]; next[i] = { ...next[i], relationship: e.target.value }; setGuardians(next) }}><option value="father">Father</option><option value="mother">Mother</option><option value="guardian">Guardian</option><option value="other">Other</option></select></div>
                    <div className="sp-field"><label>Phone</label><input placeholder="0712345678" value={g.phone} onChange={e => { const next = [...guardians]; next[i] = { ...next[i], phone: e.target.value }; setGuardians(next) }} /></div>
                    <div className="sp-field"><label>Email</label><input type="email" placeholder="parent@email.com" value={g.email} onChange={e => { const next = [...guardians]; next[i] = { ...next[i], email: e.target.value }; setGuardians(next) }} /></div>
                    <div className="sp-field"><label>National ID</label><input placeholder="ID Number" value={g.national_id} onChange={e => { const next = [...guardians]; next[i] = { ...next[i], national_id: e.target.value }; setGuardians(next) }} /></div>
                    <div className="sp-field"><label>Occupation</label><input placeholder="Teacher" value={g.occupation} onChange={e => { const next = [...guardians]; next[i] = { ...next[i], occupation: e.target.value }; setGuardians(next) }} /></div>
                  </div>
                  <div style={{ marginTop: 10, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                    <label className="sp-checkbox"><input type="checkbox" checked={g.is_fee_payer} onChange={e => { const next = [...guardians]; next[i] = { ...next[i], is_fee_payer: e.target.checked }; setGuardians(next) }} /> Fee Payer</label>
                    <label className="sp-checkbox"><input type="checkbox" checked={g.sms_notification} onChange={e => { const next = [...guardians]; next[i] = { ...next[i], sms_notification: e.target.checked }; setGuardians(next) }} /> SMS Notifications</label>
                    <label className="sp-checkbox"><input type="checkbox" checked={g.portal_access} onChange={e => { const next = [...guardians]; next[i] = { ...next[i], portal_access: e.target.checked }; setGuardians(next) }} /> Portal Access</label>
                  </div>
                </div>
              ))}
              <button type="button" className="sp-btn-ghost sm" onClick={() => setGuardians([...guardians, { ...EMPTY_GUARDIAN, relationship: 'guardian' }])} style={{ marginTop: 8 }}>
                <Plus size={14} /> Add Guardian
              </button>

              <div className="sp-form-actions">
                <button type="button" className="sp-btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="sp-btn-primary" disabled={saving}>
                  <Save size={15} /> {saving ? 'Saving...' : editingStudent ? 'Update Student' : 'Add Student'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
