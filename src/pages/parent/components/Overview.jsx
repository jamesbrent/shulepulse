import { useState, useEffect } from 'react'
import { BarChart2, DollarSign, ClipboardList, Bell, Award, BookOpen, CheckCircle } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { fmtDate } from '../../admin/fees/utils/feesHelpers'
import { groupGradesBySubject, getCBEGrade } from '../../../components/students/ReportCard'

export default function Overview({ activeChild, school }) {
  const [grades, setGrades] = useState([])
  const [attendance, setAttendance] = useState(null)
  const [feeBalance, setFeeBalance] = useState({ totalCharged: 0, totalPaid: 0, credit: 0, balance: 0, status: 'due' })
  const [recentNotices, setRecentNotices] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (activeChild && school) fetchOverview()
  }, [activeChild, school])

  const fetchOverview = async () => {
    setLoading(true)
    const currentTerm = school?.current_term || 'Term 1'
    const currentYear = school?.current_year || new Date().getFullYear()
    const schoolId = school?.id

    const [{ data: gradesData }, { data: noticesData }] = await Promise.all([
      schoolId ? supabase
        .from('grades')
        .select('*')
        .eq('student_id', activeChild.id)
        .eq('term', currentTerm)
        .eq('year', currentYear)
        .in('status', ['approved', 'published'])
        .order('created_at', { ascending: false }) : { data: [] },
      schoolId ? supabase
        .from('notices')
        .select('*')
        .eq('school_id', schoolId)
        .order('created_at', { ascending: false })
        .limit(3) : { data: [] },
    ])

    setGrades(gradesData || [])
    setRecentNotices(noticesData || [])

    const [assessmentsRes, ledgerRes, creditRes] = await Promise.all([
      supabase
        .from('fee_assessments')
        .select('amount_due')
        .eq('student_id', activeChild.id)
        .eq('term', currentTerm)
        .eq('year', currentYear),
      supabase
        .from('student_ledger')
        .select('entry_type, amount')
        .eq('student_id', activeChild.id)
        .eq('term', currentTerm)
        .eq('year', currentYear),
      schoolId ? supabase
        .rpc('student_credit_balance', { p_school_id: schoolId, p_student_id: activeChild.id }) : { data: 0 },
    ])

    const totalCharged = (assessmentsRes.data || []).reduce((s, a) => s + Number(a.amount_due), 0)
    // Applied-to-fees figure: charges/penalties increase; every other entry
    // (payment, waiver, scholarship, discount, credit application) reduces.
    const totalPaid = (ledgerRes.data || []).reduce((s, l) => {
      if (l.entry_type === 'charge' || l.entry_type === 'penalty') return s
      return s + Number(l.amount || 0)
    }, 0)
    const credit = Number(creditRes.data || 0)
    const balance = Math.max(0, totalCharged - totalPaid)
    setFeeBalance({ totalCharged, totalPaid, credit, balance, status: balance <= 0 ? 'cleared' : totalPaid > 0 ? 'partial' : 'due' })

    const { count: presentCount } = await supabase
      .from('attendance')
      .select('*', { count: 'exact', head: true })
      .eq('student_id', activeChild.id)
      .eq('status', 'present')

    const { count: totalCount } = await supabase
      .from('attendance')
      .select('*', { count: 'exact', head: true })
      .eq('student_id', activeChild.id)

    setAttendance({
      present: presentCount || 0,
      total: totalCount || 0,
      rate: totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0,
    })
    setLoading(false)
  }

  const grouped = groupGradesBySubject(grades)
  const avgScore = grouped.overallAverage

  const bestSubject = grouped.subjects.length > 0
    ? grouped.subjects.reduce((best, s) => s.average > (best?.average || 0) ? s : best, grouped.subjects[0])
    : null

  if (loading) return <div className="loading-state">Loading overview...</div>

  return (
    <div className="overview-container">
      <div className="parent-stats">
        <div className="p-stat-card">
          <div className="p-stat-icon" style={{ color: '#2563eb' }}><BarChart2 size={20} /></div>
          <p className="p-stat-label">Current Average</p>
          <p className="p-stat-value" style={{ color: '#2563eb' }}>{avgScore}%</p>
          <p className="p-stat-sub">{grouped.totalSubjects > 0 ? `${grouped.totalSubjects} subjects` : 'No grades yet'}</p>
        </div>
        <div className="p-stat-card">
          <div className="p-stat-icon" style={{ color: '#16a34a' }}><ClipboardList size={20} /></div>
          <p className="p-stat-label">Attendance Rate</p>
          <p className="p-stat-value" style={{ color: '#16a34a' }}>{attendance?.rate || 0}%</p>
          <p className="p-stat-sub">{attendance?.present || 0} of {attendance?.total || 0} days</p>
        </div>
        <div className="p-stat-card">
          <div className="p-stat-icon" style={{ color: feeBalance.balance <= 0 ? '#16a34a' : '#dc2626' }}><DollarSign size={20} /></div>
          <p className="p-stat-label">Fee Balance</p>
          <p className="p-stat-value" style={{ color: feeBalance.balance <= 0 ? '#16a34a' : '#dc2626' }}>
            KES {feeBalance.balance.toLocaleString()}
          </p>
          <p className="p-stat-sub">{feeBalance.balance <= 0 ? 'Fully paid' : `KES ${feeBalance.totalPaid.toLocaleString()} paid`}</p>
        </div>
        <div className="p-stat-card">
          <div className="p-stat-icon" style={{ color: '#7c3aed' }}><Bell size={20} /></div>
          <p className="p-stat-label">School Notices</p>
          <p className="p-stat-value" style={{ color: '#7c3aed' }}>{recentNotices.length}</p>
          <p className="p-stat-sub">Recent updates</p>
        </div>
      </div>

      <div className="parent-grid">
        <div className="parent-card">
          <div className="card-header">
            <h3><BookOpen size={16} /> Academic Performance — {activeChild?.full_name}</h3>
          </div>
          {grades.length === 0 ? (
            <p className="empty-state">No grades recorded yet for this term</p>
          ) : (
            <table className="parent-grades-table">
              <thead>
                <tr>
                  <th>Subject</th>
                  {grouped.examTypes.map(et => <th key={et}>{et}</th>)}
                  <th>Total /100</th>
                  <th>Level</th>
                </tr>
              </thead>
              <tbody>
                {grouped.subjects.map((sub, i) => {
                  const cbe = getCBEGrade(sub.average, activeChild?.class || '')
                  return (
                    <tr key={sub.name}>
                      <td>{sub.name}</td>
                      {grouped.examTypes.map(et => {
                        const a = sub.assessments.find(x => x.name === et)
                        return <td key={et}>{a ? `${Math.round(a.rawMarks)}/${a.maxMarksRaw}` : '—'}</td>
                      })}
                      <td><strong>{Math.round(sub.average)}</strong></td>
                      <td>
                        <span className="grade-badge">{cbe.band || '—'}{cbe.points != null ? ` · ${cbe.points}pts` : ''}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="parent-side">
          <div className="parent-card">
            <div className="card-header"><h3><DollarSign size={16} /> Fee Statement</h3></div>
            <div className="fee-items">
              <div className="fee-item">
                <span>Total Charged</span>
                <span>KES {feeBalance.totalCharged.toLocaleString()}</span>
              </div>
              <div className="fee-item">
                <span>Applied to Fees</span>
                <span style={{ color: '#16a34a' }}>KES {feeBalance.totalPaid.toLocaleString()}</span>
              </div>
              {feeBalance.credit > 0 && (
                <div className="fee-item">
                  <span>Student Credit (Advance)</span>
                  <span style={{ color: '#7c3aed' }}>KES {feeBalance.credit.toLocaleString()}</span>
                </div>
              )}
              <div className="fee-balance-row">
                <span>Balance</span>
                <span style={{ color: feeBalance.balance <= 0 ? '#16a34a' : '#dc2626', fontWeight: 700 }}>
                  KES {feeBalance.balance.toLocaleString()}
                </span>
              </div>
            </div>
            <button className="pay-btn">
              <DollarSign size={16} />
              Make Payment
            </button>
          </div>

          <div className="parent-card">
            <div className="card-header"><h3><Bell size={16} /> Recent Notices</h3></div>
            {recentNotices.length === 0 ? (
              <p className="empty-state">No notices yet</p>
            ) : (
              <div className="notices-list">
                {recentNotices.map(n => (
                  <div key={n.id} className="notice-row">
                    <p className="notice-title">{n.title}</p>
                    <p className="notice-date">{fmtDate(n.created_at)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
