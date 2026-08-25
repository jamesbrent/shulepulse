import { useState, useEffect, useRef } from 'react'
import {
  ShieldAlert, Search, Filter, AlertTriangle,
  CheckCircle, Clock, Users, Eye, X, FileText,
  ChevronRight, Plus, Save, Download
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'
import { esc } from '../../utils/escapeHtml'

export default function Discipline() {
  const { profile } = useAuthStore()
  const [records, setRecords] = useState([])
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [selectedRecord, setSelectedRecord] = useState(null)
  const [showModal, setShowModal] = useState(false)

  // Add record state
  const [showAddModal, setShowAddModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [studentSearch, setStudentSearch] = useState('')
  const [form, setForm] = useState({
    student_id: '',
    offense: '',
    description: '',
    action_taken: '',
    date: new Date().toISOString().split('T')[0],
    status: 'pending',
  })
  const printRef = useRef(null)

  useEffect(() => {
    fetchRecords()
    fetchStudents()
  }, [profile?.school_id])

  const fetchStudents = async () => {
    const { data } = await supabase
      .from('students')
      .select('id, full_name, admission_number, class, stream')
      .eq('school_id', profile.school_id)
      .eq('status', 'active')
      .order('full_name')
    setStudents(data || [])
  }

  const fetchRecords = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('discipline_records')
      .select('*, students(full_name, admission_number, class, stream)')
      .eq('school_id', profile.school_id)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })

    setRecords(data || [])
    setLoading(false)
  }

  const statusMeta = {
    pending: { label: 'Pending', color: '#d97706', bg: '#fef9c3' },
    resolved: { label: 'Resolved', color: '#16a34a', bg: '#dcfce7' },
    escalated: { label: 'Escalated', color: '#dc2626', bg: '#fee2e2' },
  }

  const filtered = records.filter(r => {
    if (search) {
      const q = search.toLowerCase()
      const studentName = r.students?.full_name?.toLowerCase() || ''
      const offense = (r.offense || r.offence || '').toLowerCase()
      if (!studentName.includes(q) && !offense.includes(q)) return false
    }
    if (filterStatus !== 'all' && (r.status || 'pending') !== filterStatus) return false
    return true
  })

  const stats = {
    total: records.length,
    pending: records.filter(r => (r.status || 'pending') === 'pending').length,
    resolved: records.filter(r => r.status === 'resolved').length,
    escalated: records.filter(r => r.status === 'escalated').length,
  }

  const viewDetails = (record) => {
    setSelectedRecord(record)
    setShowModal(true)
  }

  const filteredStudents = students.filter(s => {
    const q = studentSearch.toLowerCase()
    return !q || s.full_name?.toLowerCase().includes(q) || s.admission_number?.toLowerCase().includes(q)
  })

  const openAddModal = () => {
    setForm({
      student_id: '',
      offense: '',
      description: '',
      action_taken: '',
      date: new Date().toISOString().split('T')[0],
      status: 'pending',
    })
    setStudentSearch('')
    setShowAddModal(true)
  }

  const saveRecord = async () => {
    if (!form.student_id || !form.offense) return
    setSaving(true)
    const { error } = await supabase
      .from('discipline_records')
      .insert({
        school_id: profile.school_id,
        student_id: form.student_id,
        offense: form.offense,
        description: form.description || null,
        action_taken: form.action_taken || null,
        date: form.date || null,
        status: form.status || 'pending',
        reported_by: profile?.full_name || profile?.email || 'Deputy Admin',
      })
    setSaving(false)
    if (!error) {
      setShowAddModal(false)
      fetchRecords()
    }
  }

  const handlePrintStudentRecord = () => {
    const content = printRef.current
    if (!content) return
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`
      <html>
        <head>
          <title>Discipline Record — ${esc(selectedRecord.students?.full_name || 'Student')}</title>
          <style>
            @page { size: A4; margin: 3mm; }
            * { box-sizing: border-box; font-family: Arial, sans-serif; }
            body { margin: 0; padding: 8mm; }
            h1 { text-align:center; font-size:22px; font-weight:900; text-transform:uppercase; margin-bottom:4px; }
            h2 { text-align:center; font-size:16px; font-weight:700; color:#555; margin-bottom:20px; }
            .student-info { margin-bottom:20px; }
            .student-info td { padding:4px 12px; font-size:13px; }
            .student-info td:first-child { font-weight:700; color:#555; }
            table { width:100%; border-collapse:collapse; }
            th, td { border:1.5px solid #111; padding:6px 8px; text-align:left; font-size:12px; }
            th { background:#f1f1f1; font-weight:700; }
            .footer { margin-top:30px; display:flex; justify-content:space-between; font-size:12px; }
          </style>
        </head>
        <body>${content.outerHTML}</body>
      </html>
    `)
    win.document.close()
    win.onload = () => { win.focus(); win.print(); win.close() }
  }

  if (loading) return <div className="da-loading-state">Loading discipline records...</div>

  return (
    <div>
      <div className="da-summary">
        {[
          { label: 'Total Cases', value: stats.total, icon: <ShieldAlert size={20} />, color: 'red' },
          { label: 'Pending', value: stats.pending, icon: <Clock size={20} />, color: 'amber' },
          { label: 'Resolved', value: stats.resolved, icon: <CheckCircle size={20} />, color: 'green' },
          { label: 'Escalated', value: stats.escalated, icon: <AlertTriangle size={20} />, color: 'red' },
        ].map(s => (
          <div key={s.label} className={`da-sum-card ${s.color}`}>
            {s.icon}
            <div>
              <p className="da-tsc-label">{s.label}</p>
              <p className="da-tsc-value">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="da-toolbar">
        <div className="da-toolbar-left">
          <div className="da-search-wrap">
            <Search size={14} className="da-search-icon" />
            <input className="da-search-input" placeholder="Search student or offense..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="da-filter-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="resolved">Resolved</option>
            <option value="escalated">Escalated</option>
          </select>
          <span style={{ fontSize: 13, color: '#64748b' }}>
            {filtered.length} case{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="da-toolbar-right">
          <button className="da-action-btn da-add-btn" onClick={openAddModal}>
            <Plus size={14} /> Add Record
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', border: '2px dashed #e2e8f0', borderRadius: 12 }}>
          <ShieldAlert size={40} color="#cbd5e1" />
          <p>No discipline records found</p>
          <button className="da-action-btn da-add-btn" onClick={openAddModal} style={{ marginTop: 12 }}>
            <Plus size={14} /> Add the first record
          </button>
        </div>
      ) : (
        <div className="da-table-wrap" style={{ marginTop: 16 }}>
          <table className="da-table-full">
            <thead>
              <tr>
                <th>Date</th>
                <th>Student</th>
                <th>Adm No.</th>
                <th>Class</th>
                <th>Offense</th>
                <th>Action Taken</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const status = statusMeta[r.status || 'pending'] || statusMeta.pending
                return (
                  <tr key={r.id}>
                    <td style={{ color: '#64748b', fontSize: 13 }}>{r.date || r.created_at?.split('T')[0] || '—'}</td>
                    <td>
                      <div className="da-student-name-cell">
                        <div className="da-student-avatar-sm" style={{ width: 28, height: 28, fontSize: 10 }}>
                          {r.students?.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2) || '?'}
                        </div>
                        {r.students?.full_name || '—'}
                      </div>
                    </td>
                    <td className="da-text-muted" style={{ fontFamily: 'monospace', fontSize: 12 }}>
                      {r.students?.admission_number || '—'}
                    </td>
                    <td>{r.students?.class || '—'}{r.students?.stream ? ` ${r.students.stream}` : ''}</td>
                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.offense || r.offence || '—'}
                    </td>
                    <td>{r.action_taken || r.action || '—'}</td>
                    <td>
                      <span style={{
                        display: 'inline-block',
                        padding: '3px 10px',
                        borderRadius: 99,
                        fontSize: 12,
                        fontWeight: 500,
                        background: status.bg,
                        color: status.color,
                      }}>
                        {status.label}
                      </span>
                    </td>
                    <td>
                      <button className="da-action-btn" onClick={() => viewDetails(r)}>
                        <Eye size={13} /> View
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── View Details Modal ── */}
      {showModal && selectedRecord && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Discipline Record</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <div className="modal-form">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <div className="da-student-avatar-sm" style={{ width: 40, height: 40, fontSize: 14 }}>
                  {selectedRecord.students?.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2) || '?'}
                </div>
                <div>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: 15 }}>{selectedRecord.students?.full_name || 'Unknown'}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 13, color: '#64748b' }}>
                    {selectedRecord.students?.admission_number || ''} — {selectedRecord.students?.class || ''}{selectedRecord.students?.stream ? ` ${selectedRecord.students.stream}` : ''}
                  </p>
                </div>
                <button className="da-action-btn" onClick={handlePrintStudentRecord} style={{ marginLeft: 'auto' }}>
                  <Download size={13} /> PDF
                </button>
              </div>

              <div ref={printRef}>
                <h1 style={{ textAlign: 'center', fontSize: 22, fontWeight: 900, textTransform: 'uppercase', marginBottom: 2, display: 'none' }}>Discipline Record</h1>
                <div className="profile-info-grid">
                  {[
                    { label: 'Date', value: selectedRecord.date || selectedRecord.created_at?.split('T')[0] || '—' },
                    { label: 'Student Name', value: selectedRecord.students?.full_name || '—' },
                    { label: 'Admission No.', value: selectedRecord.students?.admission_number || '—' },
                    { label: 'Class', value: selectedRecord.students?.class || '—' },
                    { label: 'Offense', value: selectedRecord.offense || selectedRecord.offence || '—' },
                    { label: 'Description', value: selectedRecord.description || selectedRecord.details || '—' },
                    { label: 'Action Taken', value: selectedRecord.action_taken || selectedRecord.action || '—' },
                    { label: 'Reported By', value: selectedRecord.reported_by || selectedRecord.teacher_name || '—' },
                    { label: 'Status', value: (statusMeta[selectedRecord.status || 'pending'] || statusMeta.pending).label },
                  ].map(item => (
                    <div key={item.label} className="profile-info-item" style={{ gridColumn: item.label === 'Description' ? '1 / -1' : undefined }}>
                      <p className="pii-label">{item.label}</p>
                      <p className="pii-value" style={{ textTransform: 'none' }}>{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Record Modal ── */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3><FileText size={16} /> Add Discipline Record</h3>
              <button className="modal-close" onClick={() => setShowAddModal(false)}><X size={18} /></button>
            </div>
            <div className="modal-form">
              {/* Student selector */}
              <div className="form-field">
                <label>Student <span className="field-required">*</span></label>
                <input
                  className="form-input"
                  placeholder="Search student..."
                  value={studentSearch}
                  onChange={e => setStudentSearch(e.target.value)}
                />
                <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8, marginTop: 4 }}>
                  {filteredStudents.length === 0 ? (
                    <p style={{ padding: 12, fontSize: 13, color: '#94a3b8', textAlign: 'center' }}>No students found</p>
                  ) : (
                    filteredStudents.map(s => (
                      <div
                        key={s.id}
                        onClick={() => { setForm({ ...form, student_id: s.id }); setStudentSearch(s.full_name) }}
                        style={{
                          padding: '8px 12px',
                          cursor: 'pointer',
                          fontSize: 13,
                          background: form.student_id === s.id ? '#eff6ff' : 'transparent',
                          borderBottom: '1px solid #f1f5f9',
                          display: 'flex',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span style={{ fontWeight: form.student_id === s.id ? 600 : 400 }}>{s.full_name}</span>
                        <span style={{ color: '#64748b', fontSize: 12 }}>{s.class}{s.stream ? ` ${s.stream}` : ''}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="form-field">
                <label>Date</label>
                <input className="form-input" type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
              </div>

              <div className="form-field">
                <label>Offense <span className="field-required">*</span></label>
                <input className="form-input" placeholder="e.g. Bullying, Tardiness" value={form.offense} onChange={e => setForm({ ...form, offense: e.target.value })} />
              </div>

              <div className="form-field">
                <label>Description</label>
                <textarea className="form-input" rows={3} placeholder="Additional details..." value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
              </div>

              <div className="form-field">
                <label>Action Taken</label>
                <input className="form-input" placeholder="e.g. Warning, Suspension" value={form.action_taken} onChange={e => setForm({ ...form, action_taken: e.target.value })} />
              </div>

              <div className="form-field">
                <label>Status</label>
                <select className="form-input" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                  <option value="pending">Pending</option>
                  <option value="resolved">Resolved</option>
                  <option value="escalated">Escalated</option>
                </select>
              </div>

              <div className="form-actions" style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="da-cancel-btn" onClick={() => setShowAddModal(false)}>Cancel</button>
                <button
                  className="da-save-btn"
                  onClick={saveRecord}
                  disabled={saving || !form.student_id || !form.offense}
                >
                  <Save size={14} /> {saving ? 'Saving…' : 'Save Record'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
