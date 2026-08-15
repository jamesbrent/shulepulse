import { useState, useEffect } from 'react'
import { CalendarDays, Plus, X, MapPin, Clock, Bell, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'

const EVENT_TYPES = [
  { value: 'general', label: 'General', cls: 'rcp-badge--gray' },
  { value: 'holiday', label: 'Holiday', cls: 'rcp-badge--red' },
  { value: 'exam', label: 'Exam', cls: 'rcp-badge--purple' },
  { value: 'sports', label: 'Sports', cls: 'rcp-badge--green' },
  { value: 'meeting', label: 'Meeting', cls: 'rcp-badge--blue' },
  { value: 'ceremony', label: 'Ceremony', cls: 'rcp-badge--amber' },
  { value: 'other', label: 'Other', cls: 'rcp-badge--gray' },
]

const AUDIENCES = ['all', 'teachers', 'parents', 'students', 'staff']

export default function CalendarView({ onChanged }) {
  const { profile } = useAuthStore()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    title: '', description: '', event_type: 'general', date: '',
    start_time: '', end_time: '', location: '', audience: 'all',
  })
  const [filterType, setFilterType] = useState('all')
  const [filterMonth, setFilterMonth] = useState('all')

  useEffect(() => {
    if (profile?.school_id) fetchEvents()
  }, [profile])

  const fetchEvents = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('school_events')
      .select('*')
      .eq('school_id', profile.school_id)
      .order('date', { ascending: true })
      .limit(300)
    setEvents(data || [])
    setLoading(false)
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!form.title.trim() || !form.date) return
    setCreating(true)
    setError('')
    const user = (await supabase.auth.getUser()).data.user
    const { error } = await supabase.from('school_events').insert({
      school_id: profile.school_id,
      title: form.title.trim(),
      description: form.description || null,
      event_type: form.event_type,
      date: form.date,
      start_time: form.start_time || null,
      end_time: form.end_time || null,
      location: form.location || null,
      audience: form.audience,
      created_by: user?.id,
    })
    setCreating(false)
    if (error) {
      setError(error.message)
      return
    }
    setForm({ title: '', description: '', event_type: 'general', date: '', start_time: '', end_time: '', location: '', audience: 'all' })
    setShowForm(false)
    fetchEvents()
    if (onChanged) onChanged()
  }

  const handleDelete = async (ev) => {
    if (!window.confirm(`Delete event "${ev.title}"?`)) return
    const { error } = await supabase.from('school_events').delete().eq('id', ev.id)
    if (!error) {
      fetchEvents()
      if (onChanged) onChanged()
    }
  }

  const today = new Date().toISOString().split('T')[0]
  const grouped = events.reduce((acc, ev) => {
    if (ev.date < today) return acc
    const month = ev.date.slice(0, 7)
    if (!acc[month]) acc[month] = []
    acc[month].push(ev)
    return acc
  }, {})
  const sortedMonths = Object.keys(grouped).sort()

  const filteredEvents = events.filter(ev => {
    const matchesType = filterType === 'all' || ev.event_type === filterType
    const matchesMonth = filterMonth === 'all' || ev.date.startsWith(filterMonth)
    return matchesType && matchesMonth
  })

  if (loading) return <div className="rcp-load"><div className="rcp-spin" /><span>Loading calendar...</span></div>

  const typeInfo = (t) => EVENT_TYPES.find(x => x.value === t) || EVENT_TYPES[0]

  return (
    <div className="rcp-page">
      <div className="rcp-page-toolbar">
        <p className="rcp-page-toolbar-desc">Upcoming school events, meetings and key dates for the front desk</p>
        <div className="rcp-page-toolbar-actions">
          <button className="rcp-btn-primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? <><X size={14} /> Cancel</> : <><Plus size={14} /> Add Event</>}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="rcp-card">
          <div className="rcp-card-hdr"><h3><CalendarDays size={16} /> Add School Event</h3></div>
          {error && <div className="rcp-form-error">{error}</div>}
          <form onSubmit={handleCreate}>
            <div className="rcp-form-grid">
              <div className="rcp-form-field full">
                <label>Event Title *</label>
                <input type="text" value={form.title} required
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Academic Day / Open Day" />
              </div>
              <div className="rcp-form-field">
                <label>Date *</label>
                <input type="date" value={form.date} required
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="rcp-form-field">
                <label>Type</label>
                <select value={form.event_type} onChange={e => setForm(f => ({ ...f, event_type: e.target.value }))}>
                  {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div className="rcp-form-field">
                <label>Start Time</label>
                <input type="time" value={form.start_time}
                  onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} />
              </div>
              <div className="rcp-form-field">
                <label>End Time</label>
                <input type="time" value={form.end_time}
                  onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} />
              </div>
              <div className="rcp-form-field">
                <label>Location</label>
                <input type="text" value={form.location}
                  onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                  placeholder="e.g. School hall, grounds" />
              </div>
              <div className="rcp-form-field">
                <label>Audience</label>
                <select value={form.audience} onChange={e => setForm(f => ({ ...f, audience: e.target.value }))}>
                  {AUDIENCES.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div className="rcp-form-field full">
                <label>Description</label>
                <textarea rows={2} value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Details about the event" />
              </div>
            </div>
            <div className="rcp-form-actions">
              <button type="button" className="rcp-btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" className="rcp-btn-primary" disabled={creating}>
                {creating ? 'Saving...' : 'Add Event'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="rcp-filters">
        <select className="rcp-filter-select" value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="all">All Types</option>
          {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select className="rcp-filter-select" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}>
          <option value="all">All Months</option>
          {sortedMonths.map(m => (
            <option key={m} value={m}>{new Date(m + '-01T00:00:00').toLocaleDateString('en-KE', { month: 'long', year: 'numeric' })}</option>
          ))}
        </select>
      </div>

      {filteredEvents.length === 0 ? (
        <div className="rcp-empty">
          <CalendarDays size={40} color="#cbd5e1" />
          <p>No events found</p>
          <span>Add school events to keep everyone informed</span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filteredEvents.map(ev => {
            const t = typeInfo(ev.event_type)
            return (
              <div key={ev.id} className="rcp-card" style={{ padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{
                  minWidth: 60, textAlign: 'center', background: '#f8fafc', border: '1px solid #e2e8f0',
                  borderRadius: 12, padding: '10px 8px',
                }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', lineHeight: 1 }}>
                    {new Date(ev.date + 'T00:00:00').getDate()}
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>
                    {new Date(ev.date + 'T00:00:00').toLocaleDateString('en-KE', { month: 'short' })}
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>{ev.title}</span>
                    <span className={`rcp-badge ${t.cls}`}>{t.label}</span>
                    {ev.audience && ev.audience !== 'all' && (
                      <span className="rcp-badge rcp-badge--gray">{ev.audience}</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 14, marginTop: 4, flexWrap: 'wrap' }}>
                    {ev.start_time && (
                      <span style={{ fontSize: 12, color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Clock size={12} /> {ev.start_time.slice(0, 5)}{ev.end_time ? ` – ${ev.end_time.slice(0, 5)}` : ''}
                      </span>
                    )}
                    {ev.location && (
                      <span style={{ fontSize: 12, color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <MapPin size={12} /> {ev.location}
                      </span>
                    )}
                  </div>
                  {ev.description && <p style={{ margin: '6px 0 0', fontSize: 12, color: '#64748b' }}>{ev.description}</p>}
                </div>
                <button className="rcp-action-btn rcp-action-btn--danger" onClick={() => handleDelete(ev)}>
                  <Trash2 size={13} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
