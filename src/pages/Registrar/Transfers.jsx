import { useState, useEffect } from 'react'
import { ArrowRight, Save, X, Users, Search, RefreshCw, Download, FileText, CheckCircle, ArrowLeft } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'
import { useSchool } from '../admin/useSchool'
import { fmtDate } from '../admin/fees/utils/feesHelpers'

export default function Transfers() {
  const { profile } = useAuthStore()
  const { school } = useSchool()
  const [activeTab, setActiveTab] = useState('internal')
  const [transfers, setTransfers] = useState([])
  const [incoming, setIncoming] = useState([])
  const [outgoing, setOutgoing] = useState([])
  const [students, setStudents] = useState([])
  const [allClasses, setAllClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [showIncomingForm, setShowIncomingForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [form, setForm] = useState({
    student_id: '', from_class: '', from_stream: '', to_class: '', to_stream: '', reason: '',
  })

  const [incomingForm, setIncomingForm] = useState({
    full_name: '', admission_number: '', from_school: '', from_class: '',
    reason: '', documents_verified: false,
  })

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    const [transfersRes, studentsRes, incomingRes, outgoingRes, classesRes] = await Promise.all([
      supabase
        .from('transfer_history')
        .select('*, students:student_id(full_name, admission_number, class, stream)')
        .eq('school_id', profile.school_id)
        .order('created_at', { ascending: false }),
      supabase
        .from('students')
        .select('id, full_name, admission_number, class, stream')
        .eq('school_id', profile.school_id)
        .eq('status', 'active')
        .order('full_name'),
      supabase
        .from('transfer_history')
        .select('*')
        .eq('school_id', profile.school_id)
        .eq('type', 'incoming')
        .order('created_at', { ascending: false }),
      supabase
        .from('transfer_history')
        .select('*')
        .eq('school_id', profile.school_id)
        .eq('type', 'outgoing')
        .order('created_at', { ascending: false }),
      supabase
        .from('students')
        .select('class')
        .eq('school_id', profile.school_id)
        .not('class', 'is', null),
    ])
    setTransfers(transfersRes.data || [])
    setStudents(studentsRes.data || [])
    setIncoming(incomingRes.data || [])
    setOutgoing(outgoingRes.data || [])
    const uniqueClasses = [...new Set((classesRes.data || []).map(s => s.class))].sort()
    setAllClasses(uniqueClasses)
    setLoading(false)
  }

  const handleStudentSelect = (e) => {
    const id = e.target.value
    const student = students.find(s => s.id === id)
    setForm({
      ...form,
      student_id: id,
      from_class: student?.class || '',
      from_stream: student?.stream || '',
      to_class: '',
      to_stream: '',
      reason: '',
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')
    if (!form.student_id || !form.to_class) {
      setError('Please select a student and target class')
      setSaving(false)
      return
    }
    try {
      const payload = {
        school_id: profile.school_id,
        student_id: form.student_id,
        from_class: form.from_class,
        from_stream: form.from_stream || null,
        to_class: form.to_class,
        to_stream: form.to_stream || null,
        reason: form.reason || null,
        initiated_by: profile?.id,
        type: 'internal',
        status: 'completed',
      }
      const { error: transferError } = await supabase.from('transfer_history').insert(payload)
      if (transferError) throw transferError
      await supabase.from('students').update({
        class: form.to_class, stream: form.to_stream || null,
        status: 'active', updated_by: profile?.id, updated_at: new Date().toISOString(),
      }).eq('id', form.student_id)
      setSuccess(`Student transferred from ${form.from_class} to ${form.to_class} successfully`)
      setForm({ student_id: '', from_class: '', from_stream: '', to_class: '', to_stream: '', reason: '' })
      setShowForm(false)
      fetchData()
    } catch (err) {
      setError(err.message)
    }
    setSaving(false)
  }

  const handleIncomingSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')
    if (!incomingForm.full_name || !incomingForm.from_school) {
      setError('Student name and previous school are required')
      setSaving(false)
      return
    }
    try {
      const now = new Date().toISOString()
      const admNumber = incomingForm.admission_number || `TRF/${new Date().getFullYear()}/${String(incoming.length + 1).padStart(4, '0')}`
      const { data: newStudent, error: sError } = await supabase.from('students').insert({
        school_id: profile.school_id,
        admission_number: admNumber,
        full_name: incomingForm.full_name.trim(),
        class: incomingForm.from_class || '',
        status: 'active',
        previous_school: incomingForm.from_school,
        created_by: profile?.id,
        created_at: now,
        updated_at: now,
      }).select('id').single()
      if (sError) throw sError
      await supabase.from('transfer_history').insert({
        school_id: profile.school_id,
        student_id: newStudent.id,
        from_class: incomingForm.from_class,
        to_class: incomingForm.from_class,
        reason: incomingForm.reason || 'Incoming transfer',
        initiated_by: profile?.id,
        type: 'incoming',
        status: 'completed',
        from_school: incomingForm.from_school,
        documents_verified: incomingForm.documents_verified,
      })
      setSuccess(`Incoming transfer completed: ${incomingForm.full_name} (${admNumber})`)
      setIncomingForm({ full_name: '', admission_number: '', from_school: '', from_class: '', reason: '', documents_verified: false })
      setShowIncomingForm(false)
      fetchData()
    } catch (err) {
      setError(err.message)
    }
    setSaving(false)
  }

  const handleOutgoingTransfer = async (student) => {
    if (!window.confirm(`Mark ${student.full_name} as transferred?`)) return
    setSaving(true)
    try {
      const now = new Date().toISOString()
      await supabase.from('transfer_history').insert({
        school_id: profile.school_id,
        student_id: student.id,
        from_class: student.class,
        from_stream: student.stream,
        reason: 'Outgoing transfer',
        initiated_by: profile?.id,
        type: 'outgoing',
        status: 'completed',
      })
      await supabase.from('students').update({
        status: 'transferred', updated_by: profile?.id, updated_at: now,
      }).eq('id', student.id)
      setSuccess(`${student.full_name} marked as transferred`)
      fetchData()
    } catch (err) {
      setError(err.message)
    }
    setSaving(false)
  }

  // use allClasses fetched separately (includes classes with no active students)

  return (
    <div className="reg-transfers">
      <div className="reg-sp-header">
        <div>
          <p>{transfers.length} total · {incoming.length} incoming · {outgoing.length} outgoing</p>
        </div>
        <div className="reg-sp-header-actions">
          <button className="reg-btn-secondary" onClick={fetchData}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {error && <div className="reg-form-error">{error}</div>}
      {success && <div className="reg-form-success">{success}</div>}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[
          { key: 'internal', label: 'Internal Transfers', count: transfers.filter(t => t.type !== 'incoming' && t.type !== 'outgoing').length + transfers.filter(t => !t.type).length },
          { key: 'incoming', label: 'Incoming Transfers', count: incoming.length },
          { key: 'outgoing', label: 'Outgoing Transfers', count: outgoing.length },
        ].map(tab => (
          <button
            key={tab.key}
            className={`reg-filter-select ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
            style={{ cursor: 'pointer', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {tab.key === 'incoming' && <ArrowLeft size={14} />}
            {tab.key === 'outgoing' && <ArrowRight size={14} />}
            {tab.label} ({tab.count})
          </button>
        ))}
        {activeTab === 'internal' && (
          <button className="reg-btn-primary" onClick={() => setShowForm(true)}>
            <ArrowRight size={15} /> New Transfer
          </button>
        )}
        {activeTab === 'incoming' && (
          <button className="reg-btn-primary" onClick={() => setShowIncomingForm(true)}>
            <ArrowLeft size={15} /> Receive Transfer
          </button>
        )}
      </div>

      {activeTab === 'internal' && (
        <>
          {showForm && (
            <div className="reg-card" style={{ marginBottom: 24 }}>
              <div className="reg-card-header">
                <h3>Initiate Internal Transfer</h3>
                <button className="reg-btn-ghost" onClick={() => setShowForm(false)}><X size={16} /></button>
              </div>
              <form onSubmit={handleSubmit}>
                <div className="reg-form-grid">
                  <div className="reg-form-field full">
                    <label>Select Student *</label>
                    <select required value={form.student_id} onChange={handleStudentSelect}>
                      <option value="">Choose a student...</option>
                      {students.map(s => (
                        <option key={s.id} value={s.id}>{s.full_name} ({s.admission_number}) — {s.class}{s.stream ? ` ${s.stream}` : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div className="reg-form-field">
                    <label>From Class</label>
                    <input value={form.from_class} disabled />
                  </div>
                  <div className="reg-form-field">
                    <label>From Stream</label>
                    <input value={form.from_stream || '—'} disabled />
                  </div>
                  <div className="reg-form-field">
                    <label>To Class *</label>
                    <select required value={form.to_class} onChange={e => setForm({ ...form, to_class: e.target.value })}>
                      <option value="">Select class</option>
                      {allClasses.map(c => <option key={c} value={c} disabled={c === form.from_class}>{c}</option>)}
                    </select>
                  </div>
                  <div className="reg-form-field">
                    <label>To Stream</label>
                    <input placeholder="e.g. West" value={form.to_stream} onChange={e => setForm({ ...form, to_stream: e.target.value })} />
                  </div>
                  <div className="reg-form-field full">
                    <label>Reason for Transfer</label>
                    <textarea rows={3} placeholder="e.g. Academic, behavior, parent request..." value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} style={{ padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none', resize: 'vertical', fontFamily: 'inherit' }} />
                  </div>
                </div>
                <div className="reg-form-actions">
                  <button type="button" className="reg-btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                  <button type="submit" className="reg-btn-primary" disabled={saving}>
                    <Save size={15} /> {saving ? 'Processing...' : 'Complete Transfer'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {loading ? (
            <p className="reg-loading-state">Loading transfers...</p>
          ) : transfers.filter(t => t.type !== 'incoming' && t.type !== 'outgoing').length === 0 && transfers.filter(t => !t.type).length === 0 ? (
            <div className="reg-empty-state">
              <ArrowRight size={40} color="#cbd5e1" />
              <p>No internal transfers recorded</p>
            </div>
          ) : (
            <div className="reg-table-wrap">
              <table className="reg-data-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Adm No.</th>
                    <th>From</th>
                    <th>To</th>
                    <th>Reason</th>
                    <th>Date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {transfers.filter(t => !t.type || (t.type !== 'incoming' && t.type !== 'outgoing')).map(t => (
                    <tr key={t.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{t.students?.full_name || '—'}</td>
                      <td className="reg-mono">{t.students?.admission_number || '—'}</td>
                      <td>{t.from_class}{t.from_stream ? ` ${t.from_stream}` : ''}</td>
                      <td>{t.to_class}{t.to_stream ? ` ${t.to_stream}` : ''}</td>
                      <td style={{ color: '#64748b', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.reason || '—'}</td>
                      <td style={{ color: '#64748b' }}>{fmtDate(t.created_at)}</td>
                      <td><span className={`reg-status-badge ${t.status === 'completed' ? 'reg-active' : 'reg-inactive'}`}>{t.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {activeTab === 'incoming' && (
        <>
          {showIncomingForm && (
            <div className="reg-card" style={{ marginBottom: 24 }}>
              <div className="reg-card-header">
                <h3>Receive Incoming Transfer</h3>
                <button className="reg-btn-ghost" onClick={() => setShowIncomingForm(false)}><X size={16} /></button>
              </div>
              <form onSubmit={handleIncomingSubmit}>
                <div className="reg-form-grid">
                  <div className="reg-form-field full">
                    <label>Student Full Name *</label>
                    <input required placeholder="e.g. Brian Ochieng" value={incomingForm.full_name} onChange={e => setIncomingForm({ ...incomingForm, full_name: e.target.value })} />
                  </div>
                  <div className="reg-form-field">
                    <label>Admission Number</label>
                    <input placeholder="Auto-generated if blank" value={incomingForm.admission_number} onChange={e => setIncomingForm({ ...incomingForm, admission_number: e.target.value })} />
                  </div>
                  <div className="reg-form-field">
                    <label>Previous School *</label>
                    <input required placeholder="e.g. Nairobi Academy" value={incomingForm.from_school} onChange={e => setIncomingForm({ ...incomingForm, from_school: e.target.value })} />
                  </div>
                  <div className="reg-form-field">
                    <label>Assign Class</label>
                    <select value={incomingForm.from_class} onChange={e => setIncomingForm({ ...incomingForm, from_class: e.target.value })}>
                      <option value="">Select class</option>
                      {allClasses.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="reg-form-field full">
                    <label>Reason for Transfer</label>
                    <textarea rows={2} placeholder="Reason for incoming transfer..." value={incomingForm.reason} onChange={e => setIncomingForm({ ...incomingForm, reason: e.target.value })} style={{ padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none', resize: 'vertical', fontFamily: 'inherit' }} />
                  </div>
                  <div className="reg-form-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" id="docsVerified" checked={incomingForm.documents_verified} onChange={e => setIncomingForm({ ...incomingForm, documents_verified: e.target.checked })} />
                    <label htmlFor="docsVerified" style={{ margin: 0, cursor: 'pointer' }}>Documents verified</label>
                  </div>
                </div>
                <div className="reg-form-actions">
                  <button type="button" className="reg-btn-secondary" onClick={() => setShowIncomingForm(false)}>Cancel</button>
                  <button type="submit" className="reg-btn-primary" disabled={saving}>
                    <Save size={15} /> {saving ? 'Processing...' : 'Complete Admission'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {loading ? (
            <p className="reg-loading-state">Loading...</p>
          ) : incoming.length === 0 ? (
            <div className="reg-empty-state">
              <ArrowLeft size={40} color="#cbd5e1" />
              <p>No incoming transfers</p>
            </div>
          ) : (
            <div className="reg-table-wrap">
              <table className="reg-data-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Adm No.</th>
                    <th>From School</th>
                    <th>Class</th>
                    <th>Documents</th>
                    <th>Date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {incoming.map(t => (
                    <tr key={t.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{t.students?.full_name || '—'}</td>
                      <td className="reg-mono">{t.students?.admission_number || '—'}</td>
                      <td>{t.from_school || '—'}</td>
                      <td>{t.to_class || t.from_class || '—'}</td>
                      <td>{t.documents_verified ? <span className="reg-status-badge reg-active"><CheckCircle size={12} /> Verified</span> : <span className="reg-status-badge reg-inactive">Pending</span>}</td>
                      <td style={{ color: '#64748b' }}>{fmtDate(t.created_at)}</td>
                      <td><span className={`reg-status-badge ${t.status === 'completed' ? 'reg-active' : 'reg-inactive'}`}>{t.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {activeTab === 'outgoing' && (
        <>
          {loading ? (
            <p className="reg-loading-state">Loading...</p>
          ) : (
            <>
              <div className="reg-card" style={{ marginBottom: 16 }}>
                <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600 }}>Process Outgoing Transfer</h4>
                <p style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>Select an active student to process an outgoing transfer.</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select
                    style={{ flex: 1, padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none' }}
                    onChange={e => {
                      const s = students.find(st => st.id === e.target.value)
                      if (s) handleOutgoingTransfer(s)
                    }}
                    value=""
                  >
                    <option value="">Select student to transfer out...</option>
                    {students.map(s => (
                      <option key={s.id} value={s.id}>{s.full_name} ({s.admission_number}) — {s.class}</option>
                    ))}
                  </select>
                </div>
              </div>

              {outgoing.length === 0 ? (
                <div className="reg-empty-state">
                  <ArrowRight size={40} color="#cbd5e1" />
                  <p>No outgoing transfers recorded</p>
                </div>
              ) : (
                <div className="reg-table-wrap">
                  <table className="reg-data-table">
                    <thead>
                      <tr>
                        <th>Student</th>
                        <th>Adm No.</th>
                        <th>From Class</th>
                        <th>Reason</th>
                        <th>Date</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {outgoing.map(t => (
                        <tr key={t.id}>
                          <td style={{ whiteSpace: 'nowrap' }}>{t.students?.full_name || '—'}</td>
                          <td className="reg-mono">{t.students?.admission_number || '—'}</td>
                          <td>{t.from_class}{t.from_stream ? ` ${t.from_stream}` : ''}</td>
                          <td style={{ color: '#64748b', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.reason || '—'}</td>
                          <td style={{ color: '#64748b' }}>{fmtDate(t.created_at)}</td>
                          <td><span className={`reg-status-badge ${t.status === 'completed' ? 'reg-active' : 'reg-inactive'}`}>{t.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
