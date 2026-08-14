import { useState, useEffect } from 'react'
import { CalendarDays, Plus, X, Search, Check, XCircle, Clock } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'

const STATUS_STYLE = {
  scheduled: 'rcp-badge--blue',
  confirmed: 'rcp-badge--teal',
  completed: 'rcp-badge--green',
  cancelled: 'rcp-badge--red',
  no_show: 'rcp-badge--amber',
}

const STATUS_LABEL = {
  scheduled: 'Scheduled',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No Show',
}

const DEPARTMENTS = ['Front Office', 'Academic Office', 'Finance / Bursar', 'Administration', 'Library', 'Medical / Sick Bay', 'Other']

export default function Appointments({ onChanged }) {
  const { profile } = useAuthStore()
  const [appointments, setAppointments] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    visitor_name: '', phone: '', organization: '', person_to_see: '',
    department: '', appointment_date: '', appointment_time: '', purpose: '', notes: '',
  })
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterDate, setFilterDate] = useState('')

  useEffect(() => {
    if (profile?.school_id) fetchAppointments()
  }, [profile])

  const fetchAppointments = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('appointments')
      .select('*')
      .eq('school_id', profile.school_id)
      .order('appointment_date', { ascending: false })
      .order('appointment_time', { ascending: true })
      .limit(200)
    setAppointments(data || [])
    setLoading(false)
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!form.visitor_name.trim() || !form.person_to_see.trim()) return
    setCreating(true)
    setError('')
    const user = (await supabase.auth.getUser()).data.user
    const { error } = await supabase.from('appointments').insert({
      school_id: profile.school_id,
      visitor_name: form.visitor_name.trim(),
      phone: form.phone || null,
      organization: form.organization || null,
      person_to_see: form.person_to_see.trim(),
      department: form.department || null,
      appointment_date: form.appointment_date || null,
      appointment_time: form.appointment_time || null,
      purpose: form.purpose || null,
      notes: form.notes || null,
      status: 'scheduled',
      created_by: user?.id,
    })
    setCreating(false)
    if (error) {
      setError(error.message)
      return
    }
    setForm({ visitor_name: '', phone: '', organization: '', person_to_see: '', department: '', appointment_date: '', appointment_time: '', purpose: '', notes: '' })
    setShowForm(false)
    fetchAppointments()
    if (onChanged) onChanged()
  }

  const setStatus = async (id, status) => {
    const { error } = await supabase.from('appointments').update({ status }).eq('id', id)
    if (!error) {
      fetchAppointments()
      if (onChanged) onChanged()
    }
  }

  const handleDelete = async (a) => {
    if (!window.confirm(`Delete appointment for ${a.visitor_name}?`)) return
    const { error } = await supabase.from('appointments').delete().eq('id', a.id)
    if (!error) {
      fetchAppointments()
      if (onChanged) onChanged()
    }
  }

  const filtered = appointments.filter(a => {
    const q = search.toLowerCase()
    const matchesSearch = !q || [a.visitor_name, a.organization, a.person_to_see, a.department, a.purpose]
      .some(f => (f || '').toLowerCase().includes(q))
    const matchesStatus = filterStatus === 'all' || a.status === filterStatus
    const matchesDate = !filterDate || a.appointment_date === filterDate
    return matchesSearch && matchesStatus && matchesDate
  })

  const today = new Date().toISOString().split('T')[0]
  const upcoming = appointments.filter(a => a.appointment_date >= today && !['cancelled', 'no_show'].includes(a.status)).length

  if (loading) return <div className="rcp-load"><div className="rcp-spin" /><span>Loading appointments...</span></div>

  return (
    <div className="rcp-page">
      <div className="rcp-page-header">
        <div>
          <h2>Appointments</h2>
          <p>Schedule and track meetings between visitors and staff or office heads</p>
        </div>
        <div className="rcp-page-header-actions">
          <span className="rcp-badge rcp-badge--teal"><CalendarDays size={12} /> {upcoming} upcoming</span>
          <button className="rcp-btn-primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? <><X size={14} /> Cancel</> : <><Plus size={14} /> New Appointment</>}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="rcp-card">
          <div className="rcp-card-hdr"><h3><CalendarDays size={16} /> Schedule Appointment</h3></div>
          {error && <div className="rcp-form-error">{error}</div>}
          <form onSubmit={handleCreate}>
            <div className="rcp-form-grid">
              <div className="rcp-form-field">
                <label>Visitor Name *</label>
                <input type="text" value={form.visitor_name} required
                  onChange={e => setForm(f => ({ ...f, visitor_name: e.target.value }))}
                  placeholder="e.g. Mary Wanjiku" />
              </div>
              <div className="rcp-form-field">
                <label>Phone</label>
                <input type="tel" value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="07XX XXX XXX" />
              </div>
              <div className="rcp-form-field">
                <label>Organization</label>
                <input type="text" value={form.organization}
                  onChange={e => setForm(f => ({ ...f, organization: e.target.value }))}
                  placeholder="Company / institution" />
              </div>
              <div className="rcp-form-field">
                <label>Person to See *</label>
                <input type="text" value={form.person_to_see} required
                  onChange={e => setForm(f => ({ ...f, person_to_see: e.target.value }))}
                  placeholder="Name of staff member" />
              </div>
              <div className="rcp-form-field">
                <label>Department</label>
                <select value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}>
                  <option value="">Select department...</option>
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="rcp-form-field">
                <label>Date</label>
                <input type="date" value={form.appointment_date}
                  onChange={e => setForm(f => ({ ...f, appointment_date: e.target.value }))} />
              </div>
              <div className="rcp-form-field">
                <label>Time</label>
                <input type="time" value={form.appointment_time}
                  onChange={e => setForm(f => ({ ...f, appointment_time: e.target.value }))} />
              </div>
              <div className="rcp-form-field">
                <label>Purpose</label>
                <input type="text" value={form.purpose}
                  onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))}
                  placeholder="Reason for the meeting" />
              </div>
              <div className="rcp-form-field full">
                <label>Notes</label>
                <textarea rows={2} value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Any extra details" />
              </div>
            </div>
            <div className="rcp-form-actions">
              <button type="button" className="rcp-btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" className="rcp-btn-primary" disabled={creating}>
                {creating ? 'Scheduling...' : 'Schedule'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="rcp-filters">
        <div className="rcp-search-wrap">
          <Search size={15} className="rcp-search-icon" />
          <input className="rcp-search-input" placeholder="Search visitor, staff, purpose..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="rcp-filter-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">All Statuses</option>
          <option value="scheduled">Scheduled</option>
          <option value="confirmed">Confirmed</option>
          <option value="completed">Completed</option>
          <option value="no_show">No Show</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <input type="date" className="rcp-filter-select" value={filterDate} onChange={e => setFilterDate(e.target.value)} />
        <span style={{ fontSize: 12, color: '#94a3b8' }}>{filtered.length} appointment{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {filtered.length === 0 ? (
        <div className="rcp-empty">
          <CalendarDays size={40} color="#cbd5e1" />
          <p>No appointments found</p>
          <span>Schedule a meeting to get started</span>
        </div>
      ) : (
        <div className="rcp-table-wrap">
          <table className="rcp-table">
            <thead>
              <tr>
                <th>Visitor</th>
                <th>Person to See</th>
                <th>Date</th>
                <th>Time</th>
                <th>Purpose</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(a => (
                <tr key={a.id}>
                  <td>
                    <div className="rcp-name-cell">
                      <div className="rcp-avatar-sm">{a.visitor_name?.[0] || 'A'}</div>
                      <div>
                        {a.visitor_name}
                        <small>{a.phone || a.organization || 'No contact'}</small>
                      </div>
                    </div>
                  </td>
                  <td>{a.person_to_see}{a.department ? <small style={{ display: 'block', color: '#94a3b8' }}>{a.department}</small> : null}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{a.appointment_date ? new Date(a.appointment_date + 'T00:00:00').toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td>
                  <td>{a.appointment_time ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Clock size={12} /> {a.appointment_time.slice(0, 5)}</span> : '—'}</td>
                  <td>{a.purpose || '—'}</td>
                  <td><span className={`rcp-badge ${STATUS_STYLE[a.status] || 'rcp-badge--gray'}`}>{STATUS_LABEL[a.status] || a.status}</span></td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {['scheduled', 'confirmed'].includes(a.status) && (
                        <button className="rcp-action-btn" onClick={() => setStatus(a.id, 'completed')}><Check size={13} /> Complete</button>
                      )}
                      {['scheduled', 'confirmed'].includes(a.status) && (
                        <button className="rcp-action-btn" onClick={() => setStatus(a.id, 'cancelled')}><XCircle size={13} /> Cancel</button>
                      )}
                      {['scheduled', 'confirmed'].includes(a.status) && (
                        <button className="rcp-action-btn" onClick={() => setStatus(a.id, a.status === 'scheduled' ? 'confirmed' : 'scheduled')}>
                          {a.status === 'scheduled' ? 'Confirm' : 'Unconfirm'}
                        </button>
                      )}
                      <button className="rcp-action-btn rcp-action-btn--danger" onClick={() => handleDelete(a)}><X size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
