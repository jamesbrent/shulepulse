import { useState, useEffect, useCallback } from 'react'
import { Search, Download, FileText, CheckCircle, AlertCircle, Printer } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'
import { useSchool } from '../admin/useSchool'
import { fmt, fmtDate, fmtDateTime, initials, downloadFile, TERMS, YEARS } from '../admin/fees/utils/feesHelpers'
import { generateReceiptPdf } from '../admin/fees/utils/generateReceiptPdf'
import { generateFeeStatementPdf } from '../admin/fees/utils/generateFeeStatementPdf'

export default function StatementsPage() {
  const { profile } = useAuthStore()
  const { school, currentTerm, currentYear } = useSchool()
  const [students, setStudents] = useState([])
  const [ledgerMap, setLedgerMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [term, setTerm] = useState(currentTerm || '')
  const [year, setYear] = useState(String(currentYear || new Date().getFullYear()))
  const [search, setSearch] = useState('')
  const [selectedStudent, setSelectedStudent] = useState(null)
  const [studentLedger, setStudentLedger] = useState([])
  const [studentAssessments, setStudentAssessments] = useState([])
  const [toast, setToast] = useState(null)
  const [generatingPdf, setGeneratingPdf] = useState(false)

  const load = useCallback(async () => {
    if (!profile?.school_id) return
    setLoading(true)

    const [stuRes, ledgerRes] = await Promise.all([
      supabase
        .from('students')
        .select('id, full_name, class, stream, admission_number')
        .eq('school_id', profile.school_id)
        .eq('status', 'active')
        .order('full_name'),
      supabase
        .from('student_ledger')
        .select('id, student_id, entry_type, amount, description, reference_id, created_at')
        .eq('school_id', profile.school_id)
        .eq('term', term)
        .eq('year', parseInt(year)),
    ])

    let ledgerData = ledgerRes.data || []

    // Enrich ledger entries with actual dates from source tables
    const paymentRefIds = ledgerData
      .filter((e) => e.entry_type === 'payment' && e.reference_id)
      .map((e) => e.reference_id)
    const chargeRefIds = ledgerData
      .filter((e) => e.entry_type === 'charge' && e.reference_id)
      .map((e) => e.reference_id)

    const [payDatesRes, chargeDatesRes] = await Promise.all([
      paymentRefIds.length > 0
        ? supabase.from('fee_payments').select('id, transaction_date').in('id', paymentRefIds)
        : { data: [] },
      chargeRefIds.length > 0
        ? supabase.from('fee_assessments').select('id, created_at').in('id', chargeRefIds)
        : { data: [] },
    ])

    const payDateMap = Object.fromEntries((payDatesRes.data || []).map((p) => [p.id, p.transaction_date]))
    const chargeDateMap = Object.fromEntries((chargeDatesRes.data || []).map((a) => [a.id, a.created_at]))

    ledgerData = ledgerData.map((e) => {
      if (e.entry_type === 'payment' && e.reference_id && payDateMap[e.reference_id]) {
        return { ...e, transaction_date: payDateMap[e.reference_id] }
      }
      if (e.entry_type === 'charge' && e.reference_id && chargeDateMap[e.reference_id]) {
        return { ...e, transaction_date: chargeDateMap[e.reference_id] }
      }
      return e
    })

    const map = {}
    ledgerData.forEach((e) => {
      if (!map[e.student_id]) map[e.student_id] = []
      map[e.student_id].push(e)
    })

    setStudents(stuRes.data || [])
    setLedgerMap(map)
    setLoading(false)
  }, [profile?.school_id, term, year])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!selectedStudent) { setStudentLedger([]); setStudentAssessments([]); return }
    const entries = ledgerMap[selectedStudent.id] || []
    const sorted = [...entries].sort((a, b) => new Date(a.transaction_date || a.created_at) - new Date(b.transaction_date || b.created_at))
    setStudentLedger(sorted)

    // Fetch assessments for this student (needed for statement PDF)
    const fetchAssessments = async () => {
      const { data } = await supabase
        .from('fee_assessments')
        .select('*, fee_structures(*, fee_categories(name))')
        .eq('school_id', profile?.school_id)
        .eq('student_id', selectedStudent.id)
        .eq('term', term)
        .eq('year', parseInt(year))
      setStudentAssessments(data || [])
    }
    fetchAssessments()
  }, [selectedStudent, ledgerMap, profile?.school_id, term, year])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  const getBalance = (entries) => {
    let bal = 0
    ;(entries || []).forEach((e) => {
      if (['charge', 'penalty'].includes(e.entry_type)) bal += Number(e.amount)
      else bal -= Number(e.amount)
    })
    return bal
  }

  const filtered = students.filter((s) =>
    s.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    s.admission_number?.toLowerCase().includes(search.toLowerCase())
  )

  const exportStudentStatementCSV = () => {
    if (!selectedStudent) return
    const entries = studentLedger
    let runningBalance = 0
    const rows = [
      ['Date', 'Description', 'Type', 'Debit (KES)', 'Credit (KES)', 'Balance (KES)'],
      ...entries.map((e) => {
        const amt = Number(e.amount) || 0
        const isDebit = ['charge', 'penalty'].includes(e.entry_type)
        if (isDebit) runningBalance += amt
        else runningBalance -= amt
        return [
          fmtDate(e.transaction_date || e.created_at), e.description || '', e.entry_type,
          isDebit ? amt.toFixed(2) : '0.00',
          !isDebit ? amt.toFixed(2) : '0.00',
          runningBalance.toFixed(2),
        ]
      }),
    ]
    downloadFile(
      rows.map((r) => r.join(',')).join('\n'),
      `statement_${selectedStudent.admission_number}_${term}_${year}.csv`,
      'text/csv'
    )
  }

  const handleExportPdf = async (entry) => {
    if (!entry.reference_id) {
      setToast({ type: 'error', msg: 'This entry has no linked payment record.' })
      return
    }
    try {
      const { data: payment, error } = await supabase
        .from('fee_payments')
        .select('*')
        .eq('id', entry.reference_id)
        .single()
      if (error || !payment) {
        setToast({ type: 'error', msg: 'Payment record not found.' })
        return
      }
      const student = students.find((s) => s.id === entry.student_id) || selectedStudent
      const blob = await generateReceiptPdf({
        school,
        payment,
        student,
        term: payment.term || term,
        year: payment.year || year,
      })
      const name = `receipt_${student?.admission_number || 'student'}_${payment.transaction_date || entry.created_at}.pdf`
      downloadFile(blob, name, 'application/pdf')
      setToast({ type: 'success', msg: 'Receipt PDF downloaded.' })
    } catch (err) {
      console.error('Receipt PDF error:', err)
      setToast({ type: 'error', msg: `Failed to generate receipt: ${err?.message || 'Unknown error'}` })
    }
  }

  const handleDownloadStatement = async () => {
    if (!selectedStudent) return
    setGeneratingPdf(true)
    try {
      const { data: schoolData } = await supabase
        .from('schools')
        .select('*')
        .eq('id', profile.school_id)
        .single()
      const { data: credit } = await supabase.rpc('student_credit_balance', {
        p_school_id: profile.school_id,
        p_student_id: selectedStudent.id,
      })
      const blob = await generateFeeStatementPdf({
        school: schoolData || {},
        student: selectedStudent,
        ledger: studentLedger,
        assessments: studentAssessments,
        term,
        year,
        credit: Number(credit) || 0,
      })
      const filename = `fee_statement_${selectedStudent.admission_number || selectedStudent.id}_${term}_${year}.pdf`
      downloadFile(blob, filename, 'application/pdf')
      setToast({ type: 'success', msg: 'Statement PDF downloaded.' })
    } catch (err) {
      console.error('Statement PDF error:', err)
      setToast({ type: 'error', msg: `Failed to generate statement: ${err?.message || 'Unknown error'}` })
    } finally {
      setGeneratingPdf(false)
    }
  }

  if (loading) return <div className="loading-state">Loading statements...</div>

  return (
    <div className="b-tab-content">
      <div className="b-filter-bar">
        <label style={{ fontSize: 13, color: '#64748b' }}>Term</label>
        <select className="b-filter-select" value={term} onChange={(e) => { setTerm(e.target.value); setSelectedStudent(null) }}>
          <option value="">All Terms</option>
          {TERMS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <label style={{ fontSize: 13, color: '#64748b' }}>Year</label>
        <select className="b-filter-select" value={year} onChange={(e) => { setYear(e.target.value); setSelectedStudent(null) }}>
          <option value="">All Years</option>
          {YEARS.map((y) => <option key={y} value={String(y)}>{y}</option>)}
        </select>
        <div className="b-search-wrap" style={{ width: 200 }}>
          <Search size={13} className="b-search-icon" />
          <input
            className="b-search-input"
            placeholder="Search student…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20, alignItems: 'start' }}>
        <div className="b-section-card" style={{ padding: 12 }}>
          <h4 style={{ fontSize: 13, fontWeight: 600, margin: '0 0 8px', color: '#64748b' }}>Students</h4>
          <div style={{ maxHeight: 500, overflowY: 'auto' }}>
            {filtered.map((s) => {
              const bal = getBalance(ledgerMap[s.id])
              return (
                <div
                  key={s.id}
                  onClick={() => setSelectedStudent(s)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 10px', borderRadius: 6, cursor: 'pointer',
                    background: selectedStudent?.id === s.id ? '#f3e8ff' : 'transparent',
                    border: selectedStudent?.id === s.id ? '1px solid #d8b4fe' : '1px solid transparent',
                    marginBottom: 2,
                  }}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%', background: '#7c3aed',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontWeight: 700, fontSize: 11, flexShrink: 0,
                  }}>
                    {initials(s.full_name)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {s.full_name}
                    </p>
                    <p style={{ margin: 0, fontSize: 11, color: '#64748b' }}>
                      {s.class} · {s.admission_number}
                    </p>
                  </div>
                  <span style={{
                    fontSize: 12, fontWeight: 600,
                    color: bal > 0 ? '#dc2626' : '#16a34a',
                    whiteSpace: 'nowrap',
                  }}>
                    {fmt(bal)}
                  </span>
                </div>
              )
            })}
            {filtered.length === 0 && (
              <p className="b-text-muted" style={{ padding: 16, textAlign: 'center' }}>No students match.</p>
            )}
          </div>
        </div>

        <div className="b-section-card">
          {!selectedStudent ? (
            <div className="b-empty">
              <FileText size={40} style={{ color: '#cbd5e1', marginBottom: 8 }} />
              <p>Select a student from the list to view their fee statement.</p>
            </div>
          ) : (
            <>
              <div className="b-section-card-head">
                <div>
                  <h3 style={{ marginBottom: 4 }}>{selectedStudent.full_name}</h3>
                  <p className="b-text-muted" style={{ fontSize: 13, margin: 0 }}>
                    {selectedStudent.class}{selectedStudent.stream ? ` — ${selectedStudent.stream}` : ''} · {selectedStudent.admission_number}
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>Balance</p>
                    <p style={{
                      fontSize: 20, fontWeight: 700, margin: 0,
                      color: getBalance(studentLedger) > 0 ? '#dc2626' : '#16a34a',
                    }}>
                      {fmt(getBalance(studentLedger))}
                    </p>
                  </div>
                  <button className="b-btn-secondary" onClick={exportStudentStatementCSV}>
                    <Download size={14} /> CSV
                  </button>
                  <button className="b-btn-secondary" onClick={handleDownloadStatement} disabled={generatingPdf}>
                    <FileText size={14} /> {generatingPdf ? '…' : 'Statement PDF'}
                  </button>
                </div>
              </div>

              {getBalance(studentLedger) <= 0 && studentLedger.length > 0 && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 14px', background: '#dcfce7', borderRadius: 8,
                  color: '#16a34a', fontSize: 13, marginBottom: 16,
                }}>
                  <CheckCircle size={16} />
                  Account is fully settled for {term} {year}.
                </div>
              )}

              {getBalance(studentLedger) > 0 && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 14px', background: '#fee2e2', borderRadius: 8,
                  color: '#dc2626', fontSize: 13, marginBottom: 16,
                }}>
                  <AlertCircle size={16} />
                  Outstanding balance of {fmt(getBalance(studentLedger))}.
                </div>
              )}

              {studentLedger.length === 0 ? (
                <p className="b-empty">No ledger entries for {term} {year}.</p>
              ) : (
                <div className="b-table-wrap">
                  <table className="b-data-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Description</th>
                        <th>Type</th>
                        <th>Amount</th>
                        <th style={{ width: 60 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {studentLedger.map((e) => {
                        const isDebit = ['charge', 'penalty'].includes(e.entry_type)
                        const isPayment = e.entry_type === 'payment'
                        return (
                          <tr key={e.id}>
                            <td className="b-text-muted">{fmtDate(e.transaction_date || e.created_at)}</td>
                            <td>{e.description || '—'}</td>
                            <td>
                              <span className={`b-badge ${isDebit ? 'b-badge-warning' : 'b-badge-success'}`}>
                                {e.entry_type}
                              </span>
                            </td>
                            <td className={isDebit ? 'b-text-red b-fw600' : 'b-text-green b-fw600'}>
                              {isDebit ? '+' : '−'}{fmt(e.amount)}
                            </td>
                            <td>
                              {isPayment && e.reference_id && (
                                <button
                                  className="b-btn-ghost"
                                  title="Download receipt PDF"
                                  onClick={() => handleExportPdf(e)}
                                  style={{ padding: '4px 8px', fontSize: 12 }}
                                >
                                  <Printer size={14} />
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24,
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '12px 20px', borderRadius: 12,
          fontSize: 13, fontWeight: 500, zIndex: 9999,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          background: toast.type === 'success' ? '#0f172a' : '#dc2626',
          color: toast.type === 'success' ? '#4ade80' : '#fff',
          animation: 'stmtSlideUp 0.3s ease',
        }}>
          {toast.type === 'success' ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
          {toast.msg}
        </div>
      )}
      <style>{`@keyframes stmtSlideUp { from { transform: translateY(12px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
    </div>
  )
}
