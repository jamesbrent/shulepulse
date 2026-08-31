import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Edit, User, Users, DollarSign, Calendar, BookOpen, ClipboardList, Activity, FileText, Clock } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { getStudentById } from '../../services/students/studentService'
import { StudentAvatar } from '../../components/students/StudentAvatar'
import { StudentDocuments } from '../../components/students/StudentDocuments'
import { supabase } from '../../lib/supabase'
import { fmt, fmtDate, paidWaterfall } from '../admin/fees/utils/feesHelpers'
import { groupGradesBySubject, getCBEGrade } from '../../components/students/ReportCard'

const TABS = [
  { key: 'personal', label: 'Personal Info', icon: User },
  { key: 'parents', label: 'Parents', icon: Users },
  { key: 'fees', label: 'Fee Account', icon: DollarSign },
  { key: 'attendance', label: 'Attendance', icon: Calendar },
  { key: 'cbc', label: 'CBC Assessments', icon: BookOpen },
  { key: 'academics', label: 'Academic Records', icon: ClipboardList },
  { key: 'medical', label: 'Medical Records', icon: Activity },
  { key: 'discipline', label: 'Discipline', icon: FileText },
  { key: 'documents', label: 'Documents', icon: FileText },
  { key: 'activity', label: 'Activity Log', icon: Clock },
]

export default function StudentProfile() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuthStore()
  const [student, setStudent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('personal')
  const [profileTabLoading, setProfileTabLoading] = useState(false)
  const [profileFee, setProfileFee] = useState({ assessments: [], payments: [], totalCharged: 0, totalPaid: 0, credit: 0, balance: 0 })
  const [profileAttendance, setProfileAttendance] = useState({ records: [], present: 0, absent: 0, late: 0 })
  const [profileGrades, setProfileGrades] = useState([])
  const [activityLog, setActivityLog] = useState([])

  const getCurrentTerm = () => {
    const m = new Date().getMonth()
    if (m >= 0 && m <= 3) return 'Term 1'
    if (m >= 4 && m <= 7) return 'Term 2'
    return 'Term 3'
  }

  useEffect(() => {
    if (id) fetchStudent()
  }, [id])

  useEffect(() => {
    if (!student?.id) return
    if (activeTab === 'fees') fetchProfileFee()
    else if (activeTab === 'attendance') fetchProfileAttendance()
    else if (activeTab === 'cbc' || activeTab === 'academics') fetchProfileGrades()
    else if (activeTab === 'activity') fetchActivityLog()
  }, [activeTab, student?.id])

  const fetchStudent = async () => {
    try {
      const data = await getStudentById(id)
      setStudent(data)
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  const fetchProfileFee = async () => {
    setProfileTabLoading(true)
    const ct = getCurrentTerm()
    const cy = new Date().getFullYear()
    try {
      const [assessmentsRes, paymentsRes, ledgerRes, creditRes] = await Promise.all([
        supabase.from('fee_assessments').select('*').eq('student_id', student.id).eq('term', ct).eq('year', cy),
        supabase.from('fee_payments').select('*').eq('student_id', student.id).order('transaction_date', { ascending: false }),
        supabase.from('student_ledger').select('entry_type, amount').eq('student_id', student.id).eq('term', ct).eq('year', cy),
        profile?.school_id ? supabase.rpc('student_credit_balance', { p_school_id: profile.school_id, p_student_id: student.id }) : { data: 0 },
      ])
      const totalCharged = (assessmentsRes.data || []).reduce((s, a) => s + Number(a.amount_due), 0)
      // Applied-to-fees figure: charges/penalties increase; every other entry
      // (payment, waiver, scholarship, discount, credit application) reduces.
      const totalPaid = (ledgerRes.data || []).reduce((s, l) => {
        if (l.entry_type === 'charge' || l.entry_type === 'penalty') return s
        return s + Number(l.amount || 0)
      }, 0)
      setProfileFee({
        assessments: assessmentsRes.data || [],
        payments: paymentsRes.data || [],
        totalCharged,
        totalPaid,
        credit: Number(creditRes.data || 0),
        balance: Math.max(0, totalCharged - totalPaid),
      })
    } catch (e) { console.error(e) }
    setProfileTabLoading(false)
  }

  const fetchProfileAttendance = async () => {
    setProfileTabLoading(true)
    try {
      const { data } = await supabase.from('attendance').select('*').eq('student_id', student.id).order('date', { ascending: false }).limit(60)
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
      const { data } = await supabase.from('grades').select('*').eq('student_id', student.id).order('year', { ascending: false }).order('term', { ascending: false })
      setProfileGrades(data || [])
    } catch (e) { console.error(e) }
    setProfileTabLoading(false)
  }

  const fetchActivityLog = async () => {
    setProfileTabLoading(true)
    try {
      const [promotions, transfers] = await Promise.all([
        supabase.from('promotion_history').select('*').eq('student_id', student.id).order('promoted_at', { ascending: false }).limit(20),
        supabase.from('transfer_history').select('*').eq('student_id', student.id).order('transfer_date', { ascending: false }).limit(20),
      ])
      const events = []
      ;(promotions.data || []).forEach(p => {
        events.push({ type: 'promotion', date: p.promoted_at, description: `Promoted from ${p.from_class || '—'} to ${p.to_class || '—'}`, id: p.id })
      })
      ;(transfers.data || []).forEach(t => {
        events.push({ type: 'transfer', date: t.transfer_date, description: `Transferred ${t.direction || ''} — ${t.reason || ''}`, id: t.id })
      })
      if (student.created_at) {
        events.push({ type: 'created', date: student.created_at, description: 'Student record created', id: 'created' })
      }
      if (student.updated_at) {
        events.push({ type: 'updated', date: student.updated_at, description: 'Student record last updated', id: 'updated' })
      }
      events.sort((a, b) => new Date(b.date) - new Date(a.date))
      setActivityLog(events)
    } catch (e) { console.error(e) }
    setProfileTabLoading(false)
  }

  if (loading) return <div className="students-page"><div className="loading-state">Loading profile...</div></div>
  if (!student) return <div className="students-page"><div className="error-state">Student not found</div></div>

  const renderTab = () => {
    switch (activeTab) {
      case 'personal':
        return (
          <div className="profile-section">
            <div className="profile-info-grid">
              <div className="profile-info-item"><label>Admission No</label><span>{student.admission_number}</span></div>
              <div className="profile-info-item"><label>Full Name</label><span>{student.full_name}</span></div>
              <div className="profile-info-item"><label>Class</label><span>{student.class || '—'}</span></div>
              <div className="profile-info-item"><label>Stream</label><span>{student.stream || '—'}</span></div>
              <div className="profile-info-item"><label>Gender</label><span className="capitalize">{student.gender || '—'}</span></div>
              <div className="profile-info-item"><label>Date of Birth</label><span>{student.date_of_birth || '—'}</span></div>
              <div className="profile-info-item"><label>Religion</label><span>{student.religion || '—'}</span></div>
              <div className="profile-info-item"><label>Nationality</label><span>{student.nationality || '—'}</span></div>
              <div className="profile-info-item"><label>Day/Boarding</label><span className="capitalize">{student.day_boarding || '—'}</span></div>
              <div className="profile-info-item"><label>Status</label><span className={`status-badge ${student.status}`}>{student.status}</span></div>
              <div className="profile-info-item"><label>Date Admitted</label><span>{student.date_admitted || '—'}</span></div>
              <div className="profile-info-item"><label>Previous School</label><span>{student.previous_school || '—'}</span></div>
            </div>
          </div>
        )

      case 'parents':
        return (
          <div className="profile-section">
            <div className="profile-info-grid">
              <div className="profile-info-item"><label>Parent Name</label><span>{student.parent_name || '—'}</span></div>
              <div className="profile-info-item"><label>Phone</label><span>{student.parent_phone || '—'}</span></div>
              <div className="profile-info-item"><label>Email</label><span>{student.parent_email || '—'}</span></div>
            </div>
          </div>
        )

      case 'medical':
        return (
          <div className="profile-section">
            <div className="profile-info-grid">
              <div className="profile-info-item"><label>Blood Group</label><span>{student.blood_group || '—'}</span></div>
              <div className="profile-info-item"><label>Allergies</label><span>{student.allergies || '—'}</span></div>
              <div className="profile-info-item"><label>Medical Conditions</label><span>{student.medical_conditions || '—'}</span></div>
              <div className="profile-info-item"><label>Special Needs</label><span>{student.special_needs || '—'}</span></div>
            </div>
          </div>
        )

      case 'documents':
        return (
          <div className="profile-section">
            <StudentDocuments studentId={student.id} />
          </div>
        )

      case 'fees':
        if (profileTabLoading) return <div className="profile-section"><div className="loading-state">Loading fee data...</div></div>
        const fc = profileFee
        const feeStatus = fc.balance <= 0 ? 'cleared' : fc.totalPaid > 0 ? 'partial' : 'due'
        return (
          <div className="profile-section">
            <div className="summary-grid" style={{ marginBottom: 20 }}>
              <div className="summary-card">
                <div className="summary-card-body">
                  <p className="summary-card-value">{fmt(fc.totalCharged)}</p>
                  <p className="summary-card-label">Total Charged</p>
                </div>
              </div>
              <div className="summary-card">
                <div className="summary-card-body">
                  <p className="summary-card-value">{fmt(fc.totalPaid)}</p>
                  <p className="summary-card-label">Applied to Fees</p>
                </div>
              </div>
              {fc.credit > 0 && (
                <div className="summary-card">
                  <div className="summary-card-body">
                    <p className="summary-card-value" style={{ color: '#7c3aed' }}>{fmt(fc.credit)}</p>
                    <p className="summary-card-label">Student Credit</p>
                  </div>
                </div>
              )}
              <div className="summary-card">
                <div className="summary-card-body">
                  <p className="summary-card-value" style={{ color: feeStatus === 'cleared' ? '#16a34a' : '#dc2626' }}>{fmt(fc.balance)}</p>
                  <p className="summary-card-label">Balance</p>
                </div>
              </div>
              <div className="summary-card">
                <div className="summary-card-body">
                  <p className={`status-badge ${feeStatus}`} style={{ fontSize: 16, display: 'inline-block', marginTop: 8 }}>{feeStatus}</p>
                  <p className="summary-card-label">Status</p>
                </div>
              </div>
            </div>
            {fc.assessments.length > 0 && (
              <div className="form-card" style={{ padding: 16 }}>
                <p className="form-section-label" style={{ marginTop: 0 }}>Fee Assessments — {getCurrentTerm()} {new Date().getFullYear()}</p>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead><tr><th>Amount Due</th><th>Amount Paid</th><th>Status</th></tr></thead>
                    <tbody>
                      {fc.assessments.map((a, i) => (
                        <tr key={a.id}>
                          <td>{fmt(a.amount_due)}</td>
                          <td>{fmt(paidWaterfall(fc.assessments, fc.totalPaid)[i])}</td>
                          <td><span className={`status-badge ${a.status}`}>{a.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {fc.payments.length > 0 && (
              <div className="form-card" style={{ padding: 16 }}>
                <p className="form-section-label" style={{ marginTop: 0 }}>Payment History</p>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Reference</th></tr></thead>
                    <tbody>
                      {fc.payments.map(p => (
                        <tr key={p.id}>
                          <td>{fmtDate(p.transaction_date)}</td>
                          <td style={{ color: '#16a34a', fontWeight: 600 }}>{fmt(p.amount)}</td>
                          <td className="capitalize">{p.payment_type || p.payment_method || '—'}</td>
                          <td className="adm-no">{p.reference || p.mpesa_code || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {fc.assessments.length === 0 && fc.payments.length === 0 && (
              <div className="empty-state-text">No fee records for {getCurrentTerm()} {new Date().getFullYear()}.</div>
            )}
          </div>
        )

      case 'attendance':
        if (profileTabLoading) return <div className="profile-section"><div className="loading-state">Loading attendance...</div></div>
        const ac = profileAttendance
        const total = ac.present + ac.absent + ac.late
        const pct = total > 0 ? Math.round((ac.present / total) * 100) : 0
        return (
          <div className="profile-section">
            <div className="summary-grid" style={{ marginBottom: 20 }}>
              <div className="summary-card">
                <div className="summary-card-body">
                  <p className="summary-card-value" style={{ color: '#16a34a' }}>{ac.present}</p>
                  <p className="summary-card-label">Present</p>
                </div>
              </div>
              <div className="summary-card">
                <div className="summary-card-body">
                  <p className="summary-card-value" style={{ color: '#dc2626' }}>{ac.absent}</p>
                  <p className="summary-card-label">Absent</p>
                </div>
              </div>
              <div className="summary-card">
                <div className="summary-card-body">
                  <p className="summary-card-value" style={{ color: '#ca8a04' }}>{ac.late}</p>
                  <p className="summary-card-label">Late</p>
                </div>
              </div>
              <div className="summary-card">
                <div className="summary-card-body">
                  <p className="summary-card-value" style={{ color: pct >= 80 ? '#16a34a' : '#dc2626' }}>{pct}%</p>
                  <p className="summary-card-label">Attendance Rate</p>
                </div>
              </div>
            </div>
            {ac.records.length > 0 ? (
              <div className="form-card" style={{ padding: 16 }}>
                <p className="form-section-label" style={{ marginTop: 0 }}>Attendance Records (last 60 days)</p>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead><tr><th>Date</th><th>Status</th></tr></thead>
                    <tbody>
                      {ac.records.map(r => (
                        <tr key={r.id}>
                          <td>{r.date}</td>
                          <td><span className={`status-badge ${r.status}`}>{r.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="empty-state-text">No attendance records found.</div>
            )}
          </div>
        )

      case 'cbc':
        if (profileTabLoading) return <div className="profile-section"><div className="loading-state">Loading CBC data...</div></div>
        const cbcGrades = profileGrades.filter(g => g.cbe_band || g.performance_level)
        if (cbcGrades.length === 0) return <div className="profile-section"><div className="empty-state-text">No CBC assessments recorded yet.</div></div>
        const cbcByTerm = {}
        cbcGrades.forEach(g => {
          const key = `${g.term} ${g.year}`
          if (!cbcByTerm[key]) cbcByTerm[key] = []
          cbcByTerm[key].push(g)
        })
        return (
          <div className="profile-section">
            {Object.entries(cbcByTerm).map(([term, grades]) => (
              <div key={term} className="form-card" style={{ padding: 16 }}>
                <p className="form-section-label" style={{ marginTop: 0 }}>{term}</p>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead><tr><th>Subject</th><th>Score</th><th>Grade</th><th>CBE Band</th><th>Level</th></tr></thead>
                    <tbody>
                      {grades.map(g => (
                        <tr key={g.id}>
                          <td>{g.subject}</td>
                          <td>{g.total_score ?? '—'}</td>
                          <td>{g.grade || '—'}</td>
                          <td>{g.cbe_band || '—'}</td>
                          <td>{g.performance_level || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )

      case 'academics':
        if (profileTabLoading) return <div className="profile-section"><div className="loading-state">Loading academic records...</div></div>
        if (profileGrades.length === 0) return <div className="profile-section"><div className="empty-state-text">No academic records found.</div></div>
        const acByTerm = {}
        profileGrades.forEach(g => {
          const key = `${g.term} ${g.year}`
          if (!acByTerm[key]) acByTerm[key] = []
          acByTerm[key].push(g)
        })
        return (
          <div className="profile-section">
            {Object.entries(acByTerm).map(([term, grades]) => {
              const grp = groupGradesBySubject(grades)
              const maxMap = {}
              grp.examTypes.forEach(et => {
                const a = grp.subjects[0]?.assessments.find(x => x.name === et)
                if (a) maxMap[et] = a.maxMarksRaw
              })
              return (
                <div key={term} className="form-card" style={{ padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <p className="form-section-label" style={{ margin: 0 }}>{term}</p>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#2563eb' }}>Avg: {Math.round(grp.overallAverage)}%</span>
                  </div>
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead><tr><th>Subject</th>{grp.examTypes.map(et => <th key={et}>{et}{maxMap[et] != null ? ` (${maxMap[et]})` : ''}</th>)}<th>Total /100</th><th>Level</th></tr></thead>
                      <tbody>
                        {grp.subjects.map((sub, i) => {
                          const cbe = getCBEGrade(sub.average, student?.class || '')
                          return (
                            <tr key={sub.name}>
                              <td>{sub.name}</td>
                              {grp.examTypes.map(et => {
                                const a = sub.assessments.find(x => x.name === et)
                                return <td key={et}>{a ? `${Math.round(a.rawMarks)}/${a.maxMarksRaw}` : '—'}</td>
                              })}
                              <td style={{ fontWeight: 600 }}>{Math.round(sub.average)}</td>
                              <td><span className="status-badge" style={{ background: '#eff6ff', color: '#2563eb' }}>{cbe.band || '—'}{cbe.points != null ? ` · ${cbe.points}pts` : ''}</span></td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })}
          </div>
        )

      case 'discipline':
        return (
          <div className="profile-section">
            <div className="form-card" style={{ padding: 20, textAlign: 'center' }}>
              <FileText size={32} color="#94a3b8" style={{ marginBottom: 12 }} />
              <p style={{ color: '#64748b', fontSize: 14, lineHeight: 1.6, margin: 0 }}>
                Discipline records are managed by the school administration. Contact your class teacher for more information.
              </p>
            </div>
          </div>
        )

      case 'activity':
        if (profileTabLoading) return <div className="profile-section"><div className="loading-state">Loading activity log...</div></div>
        if (activityLog.length === 0) return <div className="profile-section"><div className="empty-state-text">No activity recorded yet.</div></div>
        return (
          <div className="profile-section">
            <div className="form-card" style={{ padding: 16 }}>
              <p className="form-section-label" style={{ marginTop: 0 }}>Activity Timeline</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {activityLog.map((event, i) => (
                  <div key={event.id || i} style={{
                    display: 'flex',
                    gap: 12,
                    padding: '12px 0',
                    borderBottom: i < activityLog.length - 1 ? '1px solid #f1f5f9' : 'none',
                  }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%', marginTop: 6, flexShrink: 0,
                      background: event.type === 'promotion' ? '#2563eb' : event.type === 'transfer' ? '#ca8a04' : '#94a3b8',
                    }} />
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0, fontSize: 14, color: '#1e293b' }}>{event.description}</p>
                      <p style={{ margin: '2px 0 0', fontSize: 12, color: '#94a3b8' }}>
                        {fmtDate(event.date)} {event.type === 'promotion' || event.type === 'transfer' ? `— ${new Date(event.date).toLocaleTimeString()}` : ''}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="students-page">
      <div className="sp-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button className="btn-ghost" onClick={() => navigate(-1)}>
            <ArrowLeft size={15} /> Back
          </button>
          <StudentAvatar name={student.full_name} photoUrl={student.photo_url} size={44} />
          <div>
            <h2 style={{ margin: 0 }}>{student.full_name}</h2>
            <p style={{ margin: '2px 0 0', color: '#64748b', fontSize: 13 }}>
              {student.admission_number} — {student.class}{student.stream ? ` ${student.stream}` : ''}
            </p>
          </div>
        </div>
        <button className="btn-primary" onClick={() => navigate(`/admin/students/${id}/edit`)}>
          <Edit size={15} /> Edit
        </button>
      </div>

      <div className="profile-tabs">
        {TABS.map(tab => (
          <button
            key={tab.key}
            className={`profile-tab ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            <tab.icon size={14} /> {tab.label}
          </button>
        ))}
      </div>

      <div className="profile-content">
        {renderTab()}
      </div>
    </div>
  )
}
