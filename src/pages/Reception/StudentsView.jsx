import { useState, useEffect } from 'react'
import { Search, Users, X, Phone, MapPin, BookOpen, HeartPulse, User } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'

const STATUS_LABEL = {
  active: 'Active',
  inactive: 'Inactive',
  transferred: 'Transferred',
  alumni: 'Alumni',
}

const STATUS_CLS = {
  active: 'rcp-badge--green',
  inactive: 'rcp-badge--gray',
  transferred: 'rcp-badge--amber',
  alumni: 'rcp-badge--blue',
}

export default function StudentsView() {
  const { profile } = useAuthStore()
  const [students, setStudents] = useState([])
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterClass, setFilterClass] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [detail, setDetail] = useState(null)

  useEffect(() => {
    if (profile?.school_id) fetchStudents()
  }, [profile])

  const fetchStudents = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('students')
      .select('*')
      .eq('school_id', profile.school_id)
      .order('full_name')
      .limit(500)
    const list = data || []
    setStudents(list)
    setClasses([...new Set(list.map(s => s.class).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })))
    setLoading(false)
  }

  const filtered = students.filter(s => {
    const q = search.toLowerCase()
    const matchesSearch = !q || [s.full_name, s.admission_number, s.class, s.stream, s.guardian_name, s.guardian_phone, s.phone]
      .some(f => (f || '').toLowerCase().includes(q))
    const matchesClass = filterClass === 'all' || s.class === filterClass
    const matchesStatus = filterStatus === 'all' || s.status === filterStatus
    return matchesSearch && matchesClass && matchesStatus
  })

  if (loading) return <div className="rcp-load"><div className="rcp-spin" /><span>Loading students...</span></div>

  const infoItem = (label, value) => (
    <div className="rcp-detail-item">
      <label>{label}</label>
      <span>{value || '—'}</span>
    </div>
  )

  return (
    <div className="rcp-page">
      <div className="rcp-page-header">
        <div>
          <h2>Student Lookup</h2>
          <p>Search student records to answer front desk questions — read only, no grading or academic data</p>
        </div>
        <span className="rcp-badge rcp-badge--teal"><Users size={12} /> {students.length} records</span>
      </div>

      <div className="rcp-filters">
        <div className="rcp-search-wrap">
          <Search size={15} className="rcp-search-icon" />
          <input className="rcp-search-input" placeholder="Search name, adm no, class, guardian..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="rcp-filter-select" value={filterClass} onChange={e => setFilterClass(e.target.value)}>
          <option value="all">All Classes</option>
          {classes.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="rcp-filter-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="transferred">Transferred</option>
          <option value="alumni">Alumni</option>
        </select>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>{filtered.length} of {students.length}</span>
      </div>

      {filtered.length === 0 ? (
        <div className="rcp-empty">
          <Users size={40} color="#cbd5e1" />
          <p>No students found</p>
          <span>Try a different search term or filter</span>
        </div>
      ) : (
        <div className="rcp-table-wrap">
          <table className="rcp-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Adm No</th>
                <th>Class</th>
                <th>Stream</th>
                <th>Gender</th>
                <th>Guardian</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id}>
                  <td>
                    <div className="rcp-name-cell">
                      {s.photo_url ? (
                        <img src={s.photo_url} alt={s.full_name} style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
                      ) : (
                        <div className="rcp-avatar-sm">{s.full_name?.[0] || 'S'}</div>
                      )}
                      <div>
                        {s.full_name}
                        <small>{s.email || 'No email'}</small>
                      </div>
                    </div>
                  </td>
                  <td>{s.admission_number || '—'}</td>
                  <td>{s.class || '—'}</td>
                  <td>{s.stream || '—'}</td>
                  <td>{s.gender || '—'}</td>
                  <td>
                    {s.guardian_name || '—'}
                    {s.guardian_phone && <small style={{ display: 'block', color: '#94a3b8' }}>{s.guardian_phone}</small>}
                  </td>
                  <td><span className={`rcp-badge ${STATUS_CLS[s.status] || 'rcp-badge--gray'}`}>{STATUS_LABEL[s.status] || s.status}</span></td>
                  <td><button className="rcp-action-btn" onClick={() => setDetail(s)}>View</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detail && (
        <div className="rcp-modal-overlay" onClick={() => setDetail(null)}>
          <div className="rcp-modal" onClick={e => e.stopPropagation()}>
            <div className="rcp-modal-header">
              <h3>Student Record</h3>
              <button className="rcp-modal-close" onClick={() => setDetail(null)}><X size={15} /></button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
              {detail.photo_url ? (
                <img src={detail.photo_url} alt={detail.full_name} style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover' }} />
              ) : (
                <div className="rcp-avatar-sm" style={{ width: 56, height: 56, fontSize: 18 }}>{detail.full_name?.[0] || 'S'}</div>
              )}
              <div>
                <div style={{ fontSize: 17, fontWeight: 700, color: '#0f172a' }}>{detail.full_name}</div>
                <div style={{ fontSize: 13, color: '#64748b' }}>
                  {detail.admission_number || 'No adm no'} • {detail.class || 'No class'}{detail.stream ? ` ${detail.stream}` : ''}
                </div>
                <span className={`rcp-badge ${STATUS_CLS[detail.status] || 'rcp-badge--gray'}`} style={{ marginTop: 4 }}>
                  {STATUS_LABEL[detail.status] || detail.status}
                </span>
              </div>
            </div>
            <div className="rcp-detail-grid">
              {infoItem('Admission Number', detail.admission_number)}
              {infoItem('Date of Birth', detail.date_of_birth ? new Date(detail.date_of_birth + 'T00:00:00').toLocaleDateString('en-KE') : null)}
              {infoItem('Gender', detail.gender)}
              {infoItem('Nationality', detail.nationality)}
              {infoItem('Religion', detail.religion)}
              {infoItem('UPI Number', detail.upi_number)}
              {infoItem('Birth Certificate No', detail.birth_cert_number)}
              {infoItem('Day/Boarding', detail.day_boarding)}
              {infoItem('House', detail.house)}
              {infoItem('Club', detail.club)}
              {infoItem('Transport Route', detail.transport_route)}
              {infoItem('Previous School', detail.previous_school)}
            </div>

            <div className="rcp-form-section"><Phone size={11} /> Contact</div>
            <div className="rcp-detail-grid">
              {infoItem('Student Phone', detail.phone)}
              {infoItem('Student Email', detail.email)}
              {infoItem('Guardian', detail.guardian_name)}
              {infoItem('Guardian Phone', detail.guardian_phone)}
              {infoItem('Home Address', detail.home_address)}
              {infoItem('County', detail.county)}
              {infoItem('Sub-County', detail.sub_county)}
            </div>

            <div className="rcp-form-section"><HeartPulse size={11} /> Health & Support</div>
            <div className="rcp-detail-grid">
              {infoItem('Blood Group', detail.blood_group)}
              {infoItem('Allergies', detail.allergies)}
              {infoItem('Medical Conditions', detail.medical_conditions)}
              {infoItem('Special Needs', detail.special_needs)}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
