import { useState, useCallback, useEffect } from 'react'
import { Download, CheckCircle } from 'lucide-react'
import { supabase } from '../../../../lib/supabase'
import { fmt, fmtDate, initials, downloadFile } from '../utils/feesHelpers'

export function DebtorsTab({ profile, term, year, search, filterClass, filterStream, refreshKey }) {
  const [debtors, setDebtors] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!term || !year) return
    setLoading(true)
    const { data: ledger } = await supabase
      .from('student_ledger')
      .select('student_id, entry_type, amount, students(full_name, class, stream, admission_number)')
      .eq('school_id', profile.school_id)
      .eq('term', term)
      .eq('year', year)

    const map = {}
    ;(ledger || []).forEach((e) => {
      const sid = e.student_id
      if (!map[sid]) {
        map[sid] = {
          student_id: sid,
          full_name: e.students?.full_name,
          class: e.students?.class,
          stream: e.students?.stream,
          admission_number: e.students?.admission_number,
          totalBilled: 0,
          totalPaid: 0,
        }
      }
      if (['charge', 'penalty'].includes(e.entry_type)) map[sid].totalBilled += Number(e.amount)
      else map[sid].totalPaid += Number(e.amount)
    })

    const list = Object.values(map)
      .map((d) => ({ ...d, balance: d.totalBilled - d.totalPaid }))
      .filter((d) => d.balance > 0)
      .sort((a, b) => b.balance - a.balance)

    setDebtors(list)
    setLoading(false)
  }, [profile.school_id, term, year])

  useEffect(() => { load() }, [load])

  const filtered = debtors.filter(
    (d) =>
      (!filterClass || d.class === filterClass) &&
      (!filterStream || d.stream === filterStream) &&
      (d.full_name?.toLowerCase().includes(search.toLowerCase()) ||
        d.admission_number?.toLowerCase().includes(search.toLowerCase()))
  )

  const exportCSV = () => {
    const rows = [
      ['Student Name', 'Admission No.', 'Class', 'Stream', 'Total Billed', 'Total Paid', 'Balance'],
      ...filtered.map((d) => [d.full_name, d.admission_number, d.class, d.stream || '', d.totalBilled, d.totalPaid, d.balance]),
    ]
    const csv = rows.map((r) => r.join(',')).join('\n')
    downloadFile(csv, `debtors_${term}_${year}.csv`, 'text/csv')
  }

  return (
    <div className="tab-content">
      <div className="section-card">
        <div className="section-card-head">
          <h3>
            Debtors List <span className="badge-count">{filtered.length}</span>
          </h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-secondary sm" onClick={exportCSV} disabled={!filtered.length}>
              <Download size={13} /> Export CSV
            </button>
          </div>
        </div>

        {loading ? (
          <p className="loading-state">Loading debtors…</p>
        ) : filtered.length === 0 ? (
          <div className="empty-fees">
            <CheckCircle size={40} color="#16a34a" />
            <p>
              No outstanding balances for {term} {year}.
            </p>
          </div>
        ) : (
          <div className="audit-table-wrap">
            <table className="fees-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Student</th>
                  <th>Adm No.</th>
                  <th>Class</th>
                  <th>Stream</th>
                  <th>Total Billed</th>
                  <th>Total Paid</th>
                  <th>Balance</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d, i) => (
                  <tr key={d.student_id}>
                    <td className="text-muted">{i + 1}</td>
                    <td>
                      <div className="student-name-cell">
                        <div className="student-avatar-sm">{initials(d.full_name)}</div>
                        <span className="sname">{d.full_name}</span>
                      </div>
                    </td>
                    <td className="monospace">{d.admission_number}</td>
                    <td>
                      <span className="class-tag">{d.class}</span>
                    </td>
                    <td><span className="class-tag">{d.stream || '—'}</span></td>
                    <td>{fmt(d.totalBilled)}</td>
                    <td className="text-green">{fmt(d.totalPaid)}</td>
                    <td className="text-red fw600">{fmt(d.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
