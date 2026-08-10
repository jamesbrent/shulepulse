import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Search, ArrowRight } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'

export default function Transfers() {
  const { profile } = useAuthStore()
  const navigate = useNavigate()

  const [students, setStudents] = useState([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [transferType, setTransferType] = useState('internal')
  const [reason, setReason] = useState('')
  const [targetClass, setTargetClass] = useState('')
  const [saving, setSaving] = useState(false)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadStudents()
    loadHistory()
  }, [profile])

  const loadStudents = async () => {
    const { data } = await supabase
      .from('students')
      .select('id, admission_number, full_name, class, stream, status')
      .eq('school_id', profile.school_id)
      .eq('status', 'active')
      .order('full_name')
    setStudents(data || [])
    setLoading(false)
  }

  const loadHistory = async () => {
    const { data } = await supabase
      .from('transfer_history')
      .select('*, students(full_name, admission_number)')
      .eq('school_id', profile.school_id)
      .order('transfer_date', { ascending: false })
      .limit(30)
    setHistory(data || [])
  }

  const filtered = students.filter(s =>
    s.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    s.admission_number?.toLowerCase().includes(search.toLowerCase())
  )

  const handleTransfer = async () => {
    if (!selected || !reason) return
    setSaving(true)
    const now = new Date().toISOString()

    await supabase.from('transfer_history').insert({
      school_id: profile.school_id,
      student_id: selected.id,
      transfer_type: transferType,
      reason,
      from_class: selected.class,
      to_class: targetClass || null,
      transferred_by: profile?.id,
      transfer_date: now,
    })

    await supabase.from('students')
      .update({
        status: transferType === 'external' ? 'transferred' : 'active',
        class: targetClass || selected.class,
        updated_at: now,
        updated_by: profile?.id,
      })
      .eq('id', selected.id)

    setSaving(false)
    setSelected(null)
    setReason('')
    setTargetClass('')
    loadStudents()
    loadHistory()
  }

  return (
    <div className="students-page">
      <div className="sp-header">
        <div>
          <button className="btn-ghost" onClick={() => navigate(-1)}>
            <ArrowLeft size={15} /> Back
          </button>
          <h2 style={{ marginTop: 8 }}>Student Transfers</h2>
        </div>
      </div>

      <div className="form-card">
        <p className="form-section-label">New Transfer</p>
        <div className="form-grid">
          <div className="form-field full">
            <label>Search Student</label>
            <div className="search-wrap">
              <Search size={14} className="search-icon" />
              <input className="search-input" placeholder="Search by name or admission no..." value={search}
                onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="transfer-student-list">
              {filtered.map(s => (
                <div key={s.id} className={`transfer-student-item ${selected?.id === s.id ? 'active' : ''}`}
                  onClick={() => setSelected(s)}>
                  <span className="transfer-student-name">{s.full_name}</span>
                  <span className="adm-no">{s.admission_number}</span>
                  <span className="transfer-student-class">{s.class}{s.stream ? ` ${s.stream}` : ''}</span>
                </div>
              ))}
              {filtered.length === 0 && <p className="text-muted">No students found</p>}
            </div>
          </div>

          <div className="form-field">
            <label>Transfer Type</label>
            <select value={transferType} onChange={e => setTransferType(e.target.value)}>
              <option value="internal">Internal Transfer</option>
              <option value="external">External Transfer (leaving school)</option>
            </select>
          </div>

          <div className="form-field">
            <label>Target Class {transferType === 'external' ? '(optional)' : '*'}</label>
            <input placeholder="e.g. Grade 8" value={targetClass} onChange={e => setTargetClass(e.target.value)} />
          </div>

          <div className="form-field full">
            <label>Reason *</label>
            <textarea className="form-textarea" placeholder="Reason for transfer..." rows={3}
              value={reason} onChange={e => setReason(e.target.value)} />
          </div>
        </div>

        <div className="form-actions">
          <button className="btn-primary" disabled={!selected || !reason || saving} onClick={handleTransfer}>
            {saving ? 'Processing...' : 'Process Transfer'}
          </button>
        </div>
      </div>

      {history.length > 0 && (
        <div className="form-card">
          <p className="form-section-label">Transfer History</p>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Student</th>
                  <th>Type</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {history.map(h => (
                  <tr key={h.id}>
                    <td>{new Date(h.transfer_date).toLocaleDateString()}</td>
                    <td>{h.students?.full_name} <span className="adm-no">({h.students?.admission_number})</span></td>
                    <td><span className={`status-badge ${h.transfer_type === 'external' ? 'transferred' : 'active'}`}>{h.transfer_type}</span></td>
                    <td>{h.from_class || '—'}</td>
                    <td>{h.to_class || '—'}</td>
                    <td>{h.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
