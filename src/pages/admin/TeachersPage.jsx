import { useState, useEffect, useRef } from 'react'
import {
  GraduationCap, Plus, Search, X, Save, Edit, Trash2,
  Phone, Mail, BookOpen, Users, Upload, Download,
  AlertTriangle, CheckCircle, Clock, UserX, Filter,
  ChevronRight, BarChart2, Calendar, Shield, Eye,
  RotateCcw, Briefcase
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'
import { createTeacher } from '../../services/teachers/teacherService'
import { weightedScoreMean } from '../../services/grading'

// SUBJECTS and DEPARTMENTS are now fetched dynamically from Supabase
const DEPARTMENTS = ['Sciences','Humanities','Languages','Technical','Arts','Physical Education']
const EMPLOYMENT_TYPES = ['Full-time','Part-time','Contract']
const TEACHING_LEVELS = [
  'Pre-Primary',
  'Lower Primary',
  'Upper Primary',
  'Junior School',
  'Senior School',
]
const LEVEL_META = {
  'Pre-Primary':   { badge: 'PP',  desc: 'PP1 & PP2 — class teacher' },
  'Lower Primary': { badge: 'LP',  desc: 'Grade 1–3 — class teacher' },
  'Upper Primary': { badge: 'UP',  desc: 'Grade 4–6 — class teacher' },
  'Junior School': { badge: 'JSS', desc: 'Grade 7–9 — subject teacher' },
  'Senior School': { badge: 'SS',  desc: 'Grade 10–11 — subject teacher' },
}
const STATUSES = ['active','on_leave','suspended']
const CURRENT_YEAR = new Date().getFullYear()

const STATUS_META = {
  active:     { label: 'Active',    color: 'green' },
  on_leave:   { label: 'On Leave',  color: 'amber' },
  suspended:  { label: 'Suspended', color: 'red'   },
}

const EMPTY_FORM = {
  full_name: '', email: '', phone: '', id_number: '',
  employee_number: '', teacher_code: '', subjects: [], departments: [],
  classes_assigned: [], employment_type: 'Full-time',
  salary: '', date_of_hire: '', gender: '',
  date_of_birth: '', qualification: '', status: 'active',
  photo_url: null,
  teaching_level: '',
  // Timetable-specific fields
  maximum_lessons_per_week: 30,
  maximum_lessons_per_day: 6,
}

export default function TeachersPage() {
  const { profile } = useAuthStore()
  const fileInputRef = useRef()
  const csvInputRef = useRef()

  // ── Data ──────────────────────────────────────────────────
  const [teachers, setTeachers]     = useState([])
  const [classes, setClasses]       = useState([])   // { id, class_name }[]
  const [subjectsList, setSubjectsList] = useState([]) // { id, name }[]
  const [loading, setLoading]       = useState(true)

  // ── Filters ───────────────────────────────────────────────
  const [search, setSearch]                 = useState('')
  const [filterSubject, setFilterSubject]   = useState('all')
  const [filterDept, setFilterDept]         = useState('all')
  const [filterStatus, setFilterStatus]     = useState('all')
  const [filterEmpType, setFilterEmpType]   = useState('all')
  const [filterClass, setFilterClass]       = useState('all')

  // ── Modals ────────────────────────────────────────────────
  const [showAddModal, setShowAddModal]         = useState(false)
  const [notice, setNotice]                     = useState('')
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [selectedTeacher, setSelectedTeacher]   = useState(null)
  const [profileTab, setProfileTab]             = useState('profile')
  const [editTarget, setEditTarget]             = useState(null)
  const [saving, setSaving]                     = useState(false)
  const [photoUploading, setPhotoUploading]     = useState(false)
  const [error, setError]                       = useState('')
  const [teacherPerf, setTeacherPerf]           = useState({ loading: true, grades: [] })
  const [form, setForm]                         = useState(EMPTY_FORM)

  useEffect(() => { fetchTeachers(); fetchClasses(); fetchSubjects() }, [])

  useEffect(() => {
    if (!selectedTeacher?.id) { setTeacherPerf({ loading: false, grades: [] }); return }
    setTeacherPerf({ loading: true, grades: [] })
    const name = selectedTeacher.full_name || selectedTeacher.name
    if (!name) { setTeacherPerf({ loading: false, grades: [] }); return }
    supabase.from('grades').select('*').eq('teacher_name', name)
      .then(({ data, error }) => {
        if (error) console.error('fetchPerf:', error)
        setTeacherPerf({ loading: false, grades: data || [] })
      })
  }, [selectedTeacher?.id])

  // ── Fetch ─────────────────────────────────────────────────
  // teachers table is the single source of truth.
  // subjects & classes_assigned are derived live from teacher_subject_assignments
  // and timetable_slots — never stored as stale arrays.
  const fetchTeachers = async () => {
    setLoading(true)

    const [
      { data, error: fetchErr },
      { data: assignments },
      { data: slots },
    ] = await Promise.all([
      supabase.from('teachers').select('*').eq('school_id', profile.school_id).order('full_name'),
      supabase.from('teacher_subject_assignments')
        .select('teacher_id, subject_id, subjects(name)')
        .eq('school_id', profile.school_id),
      supabase.from('timetable_slots')
        .select('teacher_id, class_id, classes(class_name)')
        .eq('school_id', profile.school_id),
    ])

    if (fetchErr) console.error('fetchTeachers:', fetchErr)

    const normalised = (data || []).map(t => {
      // Derive subjects from teacher_subject_assignments
      const teacherSubjects = (assignments || [])
        .filter(a => a.teacher_id === t.id)
        .map(a => a.subjects?.name)
        .filter(Boolean)

      // Derive classes from timetable_slots (distinct class names)
      const teacherClasses = [...new Set(
        (slots || [])
          .filter(s => s.teacher_id === t.id)
          .map(s => s.classes?.class_name)
          .filter(Boolean)
      )]

      return {
        ...t,
        teacher_code:    t.staff_number    || t.teacher_code || '',
        employee_number: t.employee_number || t.staff_number || '',
        status: t.active_status === false ? 'suspended' : (t.status || 'active'),
        tt_teacher_id: t.id,
        subjects:         teacherSubjects,
        classes_assigned: teacherClasses,
        departments:      t.departments || [],
        maximum_lessons_per_week: t.maximum_lessons_per_week ?? 30,
        maximum_lessons_per_day:  t.maximum_lessons_per_day  ?? 6,
      }
    })

    setTeachers(normalised)
    setLoading(false)
  }

  const fetchClasses = async () => {
    const { data } = await supabase
      .from('classes')
      .select('id, class_name')
      .eq('school_id', profile.school_id)
      .order('class_name')
    setClasses(data || [])
  }

  const fetchSubjects = async () => {
    const { data } = await supabase
      .from('subjects')
      .select('id, name')
      .eq('school_id', profile.school_id)
      .order('name')
    setSubjectsList(data || [])
  }

  // ── Helpers ───────────────────────────────────────────────
  const genEmployeeNo = () => `TCH/${CURRENT_YEAR}/${String(Object.keys(teachers).length + 1).padStart(3, '0')}`

  const genTeacherCode = () => {
    const existing = teachers.map(t => t.staff_number || t.teacher_code).filter(Boolean)
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    for (let i = 0; i < letters.length; i++) {
      for (let j = 0; j < letters.length; j++) {
        const code = letters[i] + letters[j]
        if (!existing.includes(code)) return code
      }
    }
    return ''
  }

  const toggleArr = (arr, val) =>
    arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val]

  const overloadWarning = (t) => (t.classes_assigned || []).length > 6

  // ── Photo Upload ──────────────────────────────────────────
  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { setError('Photo must be under 2MB.'); return }
    setPhotoUploading(true)
    const ext = file.name.split('.').pop()
    const path = `teacher-photos/${profile.school_id}/${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage
      .from('school-assets').upload(path, file, { upsert: true })
    if (upErr) { setError(upErr.message); setPhotoUploading(false); return }
    const { data: urlData, error: urlErr } = await supabase.storage
      .from('school-assets').getPublicUrl(path)
    if (urlErr || !urlData?.publicUrl) {
      setError('Photo uploaded but its link could not be generated. Please retry.')
      setPhotoUploading(false)
      return
    }
    setForm(f => ({ ...f, photo_url: urlData.publicUrl }))
    setPhotoUploading(false)
  }

  // ── Submit ─────────────────────────────────────────────────
  // ── Submit ─────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true); setError(''); setNotice('')

    const teacherCode = form.teacher_code.trim().toUpperCase() || null
    const employeeNo  = form.employee_number || genEmployeeNo()

    // ── Single source of truth: teachers table only ─────────
    const payload = {
      school_id:    profile.school_id,
      full_name:    form.full_name,
      staff_number: teacherCode,
      employee_number: employeeNo,
      email:        form.email        || null,
      phone:        form.phone        || null,
      id_number:    form.id_number    || null,
      gender:       form.gender       || null,
      date_of_birth:   form.date_of_birth   || null,
      date_of_hire:    form.date_of_hire    || null,
      qualification:   form.qualification   || null,
      employment_type: form.employment_type,
      salary:       form.salary ? parseFloat(form.salary) : null,
      status:       form.status,
      photo_url:    form.photo_url    || null,
      subjects:         form.subjects,
      departments:      form.departments,
      classes_assigned: form.classes_assigned,
      maximum_lessons_per_week: Number(form.maximum_lessons_per_week) || 30,
      maximum_lessons_per_day:  Number(form.maximum_lessons_per_day)  || 6,
      active_status: form.status === 'active',
      teaching_level: form.teaching_level || null,
    }

    let err
    let createdPassword = null
    if (editTarget) {
      const { error: e } = await supabase
        .from('teachers')
        .update(payload)
        .eq('id', editTarget.id)
      err = e
    } else {
      try {
        const result = await createTeacher({ schoolId: profile.school_id, payload })
        createdPassword = result.password || null
      } catch (e2) { err = e2 }
    }

    if (err) {
      setError(err.message)
      setSaving(false)
      return
    }

    setSaving(false)
    if (createdPassword) {
      setNotice(`Teacher added with login — Email: ${payload.email}  |  Password: ${createdPassword}`)
    } else {
      setShowAddModal(false)
      setForm(EMPTY_FORM)
    }
    fetchTeachers()
  }

  // ── Delete ─────────────────────────────────────────────────
  // Removes from both tables.
  const handleDelete = async (teacher) => {
    if (!confirm('Remove this teacher? This will also remove them from the timetable module.')) return

    await supabase.from('teachers').delete().eq('id', teacher.id)

    fetchTeachers()
  }

  // ── Status Toggle ──────────────────────────────────────────
  // Syncs status to both tables.
  const cycleStatus = async (t) => {
    const next = t.status === 'active' ? 'on_leave' : t.status === 'on_leave' ? 'suspended' : 'active'
    const isActive = next === 'active'
    await supabase.from('teachers')
      .update({ status: next, active_status: isActive })
      .eq('id', t.id)

    fetchTeachers()
  }

  // ── Open Modals ───────────────────────────────────────────
  const openAdd = () => {
    setEditTarget(null)
    setForm({ ...EMPTY_FORM, teacher_code: genTeacherCode() })
    setError(''); setNotice(''); setShowAddModal(true)
  }

  const openEdit = (t) => {
    setEditTarget(t)
    setForm({
      full_name: t.full_name || '', email: t.email || '', phone: t.phone || '',
      id_number: t.id_number || '', employee_number: t.employee_number || '',
      teacher_code: t.teacher_code || '',
      subjects: t.subjects || [], departments: t.departments || [],
      classes_assigned: t.classes_assigned || [],
      employment_type: t.employment_type || 'Full-time',
      salary: t.salary || '', date_of_hire: t.date_of_hire || '',
      gender: t.gender || '', date_of_birth: t.date_of_birth || '',
      qualification: t.qualification || '', status: t.status || 'active',
      photo_url: t.photo_url || null,
      teaching_level: t.teaching_level || '',
      // Timetable fields — pre-fill from merged data
      maximum_lessons_per_week: t.maximum_lessons_per_week ?? 30,
      maximum_lessons_per_day:  t.maximum_lessons_per_day  ?? 6,
    })
    setError(''); setNotice(''); setShowAddModal(true)
  }

  const openProfile = (t) => {
    setSelectedTeacher(t); setProfileTab('profile'); setShowProfileModal(true)
  }

  // ── CSV Export ────────────────────────────────────────────
  const exportCSV = () => {
    const rows = [
      ['Name','Employee No','Email','Phone','Subjects','Departments','Classes','Terms','Status','Hire Date','Max Lessons/Wk','Max Lessons/Day'],
      ...teachers.map(t => [
        t.full_name, t.employee_number, t.email, t.phone,
        (t.subjects||[]).join(';'), (t.departments||[]).join(';'),
        (t.classes_assigned||[]).join(';'), t.employment_type, t.status, t.date_of_hire,
        t.maximum_lessons_per_week, t.maximum_lessons_per_day,
      ])
    ]
    const csv = rows.map(r => r.map(v => `"${v||''}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
    a.download = 'teachers.csv'; a.click()
  }

  // ── Filter & Derived ──────────────────────────────────────
  const allSubjects = [...new Set(teachers.flatMap(t => t.subjects || []))].sort()
  const allDepts    = [...new Set(teachers.flatMap(t => t.departments || []))].sort()

  const filtered = teachers.filter(t => {
    const s = search.toLowerCase()
    const matchSearch  = !s || t.full_name?.toLowerCase().includes(s) || t.employee_number?.toLowerCase().includes(s) || t.email?.toLowerCase().includes(s) || t.teacher_code?.toLowerCase().includes(s)
    const matchSubject = filterSubject === 'all' || (t.subjects||[]).includes(filterSubject)
    const matchDept    = filterDept    === 'all' || (t.departments||[]).includes(filterDept)
    const matchStatus  = filterStatus  === 'all' || t.status === filterStatus
    const matchType    = filterEmpType === 'all' || t.employment_type === filterEmpType
    const matchClass   = filterClass   === 'all' || (t.classes_assigned||[]).includes(filterClass)
    return matchSearch && matchSubject && matchDept && matchStatus && matchType && matchClass
  })

  const stats = {
    total:    teachers.length,
    active:   teachers.filter(t => t.status === 'active').length,
    onLeave:  teachers.filter(t => t.status === 'on_leave').length,
    overload: teachers.filter(t => overloadWarning(t)).length,
  }

  // ── Avatar ────────────────────────────────────────────────
  const Avatar = ({ t, size = 36 }) => t?.photo_url
    ? <img src={t.photo_url} alt={t.full_name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
    : <div className="teacher-avatar-sm" style={{ width: size, height: size, fontSize: size * 0.3 }}>
        {t?.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
      </div>

  return (
    <div className="teachers-page">

      {/* ── Summary ── */}
      <div className="tp-summary">
        {[
          { label: 'Total Staff',   value: stats.total,   icon: <GraduationCap size={20}/>, color: 'purple' },
          { label: 'Active',        value: stats.active,  icon: <CheckCircle size={20}/>,   color: 'green'  },
          { label: 'On Leave',      value: stats.onLeave, icon: <Clock size={20}/>,         color: 'amber'  },
          { label: 'Overloaded',    value: stats.overload,icon: <AlertTriangle size={20}/>, color: 'red'    },
        ].map(s => (
          <div key={s.label} className={`tp-sum-card ${s.color}`}>
            {s.icon}
            <div>
              <p className="tsc-label">{s.label}</p>
              <p className="tsc-value">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Toolbar ── */}
      <div className="tp-toolbar">
        <div className="tp-toolbar-left">
          <div className="search-wrap">
            <Search size={14} className="search-icon"/>
            <input className="search-input" placeholder="Search name or staff no..." value={search} onChange={e=>setSearch(e.target.value)}/>
          </div>
          <select className="filter-select" value={filterSubject} onChange={e=>setFilterSubject(e.target.value)}>
            <option value="all">All Subjects</option>
            {allSubjects.map(s=><option key={s} value={s}>{s}</option>)}
          </select>
          <select className="filter-select" value={filterDept} onChange={e=>setFilterDept(e.target.value)}>
            <option value="all">All Depts</option>
            {DEPARTMENTS.map(d=><option key={d} value={d}>{d}</option>)}
          </select>
          <select className="filter-select" value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}>
            <option value="all">All Status</option>
            {STATUSES.map(s=><option key={s} value={s}>{STATUS_META[s].label}</option>)}
          </select>
          <select className="filter-select" value={filterEmpType} onChange={e=>setFilterEmpType(e.target.value)}>
            <option value="all">All Terms</option>
            {EMPLOYMENT_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
          </select>
          <select className="filter-select" value={filterClass} onChange={e=>setFilterClass(e.target.value)}>
            <option value="all">All Classes</option>
            {classes.map(c=><option key={c.id} value={c.class_name}>{c.class_name}</option>)}
          </select>
        </div>
        <div className="tp-toolbar-right">
          <button className="btn-secondary" onClick={exportCSV}><Download size={14}/> Export</button>
          <button className="btn-primary" onClick={openAdd}><Plus size={15}/> Add Teacher</button>
        </div>
      </div>

      {/* ── Table ── */}
      {loading ? (
        <p className="loading-state">Loading teachers...</p>
      ) : filtered.length === 0 ? (
        <div className="empty-teachers">
          <GraduationCap size={40} color="#cbd5e1"/>
          <p>No teachers found</p>
          <button className="btn-primary" onClick={openAdd}><Plus size={14}/> Add First Teacher</button>
        </div>
      ) : (
        <div className="tp-table-wrap">
          <table className="tp-table">
            <thead>
              <tr>
                <th>Teacher</th>
                <th>Code</th>
                <th>Staff No.</th>
                <th>Contact</th>
                <th>Subjects</th>
                <th>Dept</th>
                <th>Classes</th>
                <th>Terms of Employment</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => (
                <tr key={t.id} className={overloadWarning(t) ? 'row-overload' : ''}>
                  <td>
                    <div className="teacher-name-cell">
                      <Avatar t={t}/>
                      <div>
                        <p className="tname">{t.full_name}</p>
                        <div style={{display:'flex',gap:4,alignItems:'center',flexWrap:'wrap'}}>
                          <p className="tgender capitalize">{t.gender || '—'}</p>
                          {t.teaching_level && (
                            <span className="adm-tag" style={{fontSize:10,padding:'1px 5px',background:'#ede9fe',color:'#6d28d9'}}>
                              {LEVEL_META[t.teaching_level]?.badge || t.teaching_level}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    {t.teacher_code
                      ? <span className="teacher-code-badge">{t.teacher_code}</span>
                      : <span className="text-muted">—</span>}
                  </td>
                  <td className="adm-no">{t.employee_number || '—'}</td>
                  <td>
                    <div className="teacher-contact">
                      {t.email && <span className="contact-row"><Mail size={12}/> {t.email}</span>}
                      {t.phone && <span className="contact-row"><Phone size={12}/> {t.phone}</span>}
                      {!t.email && !t.phone && <span className="text-muted">—</span>}
                    </div>
                  </td>
                  <td>
                    <div className="subjects-cell">
                      {(t.subjects||[]).slice(0,2).map(s=><span key={s} className="subject-tag">{s}</span>)}
                      {(t.subjects||[]).length > 2 && <span className="subject-tag more">+{(t.subjects||[]).length-2}</span>}
                      {!(t.subjects||[]).length && <span className="text-muted">—</span>}
                    </div>
                  </td>
                  <td>
                    <div className="subjects-cell">
                      {(t.departments||[]).slice(0,1).map(d=><span key={d} className="dept-tag">{d}</span>)}
                      {(t.departments||[]).length > 1 && <span className="dept-tag more">+{(t.departments||[]).length-1}</span>}
                      {!(t.departments||[]).length && <span className="text-muted">—</span>}
                    </div>
                  </td>
                  <td>
                    <div className="load-cell">
                      <span className={`load-count ${overloadWarning(t) ? 'overload' : ''}`}>
                        {(t.classes_assigned||[]).length} classes
                      </span>
                      {overloadWarning(t) && <AlertTriangle size={12} className="overload-icon"/>}
                    </div>
                  </td>
                  <td><span className="emp-type-badge">{t.employment_type || '—'}</span></td>
                  <td>
                    <button className={`status-badge-btn ${t.status || 'active'}`} onClick={() => cycleStatus(t)} title="Click to change status">
                      {STATUS_META[t.status || 'active']?.label}
                    </button>
                  </td>
                  <td>
                    <div className="action-btns">
                      <button className="action-btn" title="View Profile" onClick={() => openProfile(t)}><Eye size={14} /></button>
                      <button className="action-btn" title="Edit Teacher" onClick={() => openEdit(t)}><Edit size={14} /></button>
                      <button className="action-btn danger" title="Remove Teacher" onClick={() => handleDelete(t)}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Analytics Strip ── */}
      {!loading && teachers.length > 0 && (
        <div className="tp-analytics">
          <div className="tp-analytics-card">
            <p className="tac-label">Dept Breakdown</p>
            <div className="dept-bars">
              {DEPARTMENTS.filter(d => teachers.some(t => (t.departments||[]).includes(d))).map(d => {
                const count = teachers.filter(t => (t.departments||[]).includes(d)).length
                const pct = Math.round((count / teachers.length) * 100)
                return (
                  <div key={d} className="dept-bar-row">
                    <span className="dept-bar-label">{d}</span>
                    <div className="dept-bar-track">
                      <div className="dept-bar-fill" style={{ width: `${pct}%` }}/>
                    </div>
                    <span className="dept-bar-count">{count}</span>
                  </div>
                )
              })}
            </div>
          </div>
          <div className="tp-analytics-card">
            <p className="tac-label">Terms of Employment</p>
            <div className="emp-type-list">
              {EMPLOYMENT_TYPES.map(et => {
                const count = teachers.filter(t => t.employment_type === et).length
                return (
                  <div key={et} className="emp-type-row">
                    <span className="emp-type-name">{et}</span>
                    <span className="emp-type-count">{count}</span>
                  </div>
                )
              })}
            </div>
          </div>
          <div className="tp-analytics-card">
            <p className="tac-label">Subject Coverage</p>
            <div className="subj-coverage">
              {subjectsList.slice(0,10).map(s => {
                const covered = teachers.some(t => (t.subjects||[]).includes(s.name))
                return (
                  <span key={s.id} className={`subj-cover-tag ${covered ? 'covered' : 'missing'}`}>{s.name}</span>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          ADD / EDIT MODAL
      ══════════════════════════════════════════════ */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => { setShowAddModal(false); setNotice('') }}>
          <div className="modal modal-xl" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editTarget ? 'Edit Teacher' : 'Add New Teacher'}</h3>
              <button className="modal-close" onClick={() => { setShowAddModal(false); setNotice('') }}><X size={18}/></button>
            </div>
            <form onSubmit={handleSubmit} className="modal-form">
              {error && <div className="form-error">{error}</div>}
              {notice && <div style={{ background:'#f0fdf4', color:'#16a34a', border:'1px solid #bbf7d0', borderRadius:8, padding:'10px 12px', fontSize:13, marginBottom:12 }}>{notice}</div>}

              {/* Photo */}
              <div className="photo-upload-row">
                <div className="photo-preview">
                  {form.photo_url
                    ? <img src={form.photo_url} alt="preview" className="photo-preview-img"/>
                    : <div className="photo-placeholder"><GraduationCap size={28} color="#94a3b8"/></div>
                  }
                </div>
                <div>
                  <button type="button" className="btn-secondary sm" onClick={() => fileInputRef.current?.click()} disabled={photoUploading}>
                    <Upload size={13}/> {photoUploading ? 'Uploading...' : 'Upload Photo'}
                  </button>
                  <p className="photo-hint">JPG, PNG · max 2MB</p>
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" style={{display:'none'}} onChange={handlePhotoUpload}/>
              </div>

              {/* ── Personal Details ── */}
              <p className="form-section-label">Personal Details</p>
              <div className="form-grid form-grid-3">
                <div className="form-field full">
                  <label>Full Name *</label>
                  <input required placeholder="e.g. Jane Wanjiku" value={form.full_name} onChange={e=>setForm({...form,full_name:e.target.value})}/>
                </div>
                <div className="form-field">
                  <label>Gender</label>
                  <select value={form.gender} onChange={e=>setForm({...form,gender:e.target.value})}>
                    <option value="">Select</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>
                <div className="form-field">
                  <label>Date of Birth</label>
                  <input type="date" value={form.date_of_birth} onChange={e=>setForm({...form,date_of_birth:e.target.value})}/>
                </div>
                <div className="form-field">
                  <label>National ID No.</label>
                  <input placeholder="e.g. 12345678" value={form.id_number} onChange={e=>setForm({...form,id_number:e.target.value})}/>
                </div>
                <div className="form-field">
                  <label>Qualification</label>
                  <input placeholder="e.g. B.Ed, PGDE" value={form.qualification} onChange={e=>setForm({...form,qualification:e.target.value})}/>
                </div>
                <div className="form-field">
                  <label>Employee No.</label>
                  <input placeholder="Auto-generated if blank" value={form.employee_number} onChange={e=>setForm({...form,employee_number:e.target.value})}/>
                </div>
                <div className="form-field">
                  <label>Teacher Code <span className="field-hint">Used on timetable (e.g. AA, BK)</span></label>
                  <input
                    placeholder="e.g. AA"
                    maxLength={4}
                    value={form.teacher_code}
                    onChange={e=>setForm({...form,teacher_code:e.target.value.toUpperCase()})}
                    style={{fontWeight:700, letterSpacing:'0.1em'}}
                  />
                </div>
              </div>

              {/* ── Contact ── */}
              <p className="form-section-label">Contact</p>
              <div className="form-grid">
                <div className="form-field">
                  <label>Email</label>
                  <input type="email" placeholder="teacher@school.ac.ke" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/>
                </div>
                <div className="form-field">
                  <label>Phone</label>
                  <input placeholder="e.g. 0712345678" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/>
                </div>
              </div>

              {/* ── Employment ── */}
              <p className="form-section-label">Employment</p>
              <div className="form-grid form-grid-3">
                <div className="form-field">
                  <label>Teaching Level <span className="field-hint">CBC level this teacher is assigned to</span></label>
                  <select value={form.teaching_level} onChange={e=>setForm({...form,teaching_level:e.target.value})}>
                    <option value="">Select level...</option>
                    {TEACHING_LEVELS.map(l=>(
                      <option key={l} value={l}>{l} — {LEVEL_META[l].desc}</option>
                    ))}
                  </select>
                </div>
                <div className="form-field">
                  <label>Terms of Employment</label>
                  <select value={form.employment_type} onChange={e=>setForm({...form,employment_type:e.target.value})}>
                    {EMPLOYMENT_TYPES.map(t=><option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className="form-field">
                  <label>Date of Hire</label>
                  <input type="date" value={form.date_of_hire} onChange={e=>setForm({...form,date_of_hire:e.target.value})}/>
                </div>
                <div className="form-field">
                  <label>Salary (KES)</label>
                  <input type="number" min="0" placeholder="e.g. 45000" value={form.salary} onChange={e=>setForm({...form,salary:e.target.value})}/>
                </div>
                <div className="form-field">
                  <label>Status</label>
                  <select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>
                    {STATUSES.map(s=><option key={s} value={s}>{STATUS_META[s].label}</option>)}
                  </select>
                </div>
              </div>

              {/* ── Timetable Limits ── */}
              <p className="form-section-label">Timetable Limits</p>
              <div className="form-grid">
                <div className="form-field">
                  <label>Max Lessons / Day <span className="field-hint">Used by timetable generator</span></label>
                  <input
                    type="number" min="1" max="9"
                    value={form.maximum_lessons_per_day}
                    onChange={e=>setForm({...form, maximum_lessons_per_day: e.target.value})}
                  />
                </div>
                <div className="form-field">
                  <label>Max Lessons / Week <span className="field-hint">Used by timetable generator</span></label>
                  <input
                    type="number" min="1" max="45"
                    value={form.maximum_lessons_per_week}
                    onChange={e=>setForm({...form, maximum_lessons_per_week: e.target.value})}
                  />
                </div>
              </div>

              {/* ── Departments ── */}
              <p className="form-section-label">Departments</p>
              <div className="picker-grid">
                {DEPARTMENTS.map(d => (
                  <button key={d} type="button" className={`pick-btn ${form.departments.includes(d)?'selected':''}`} onClick={()=>setForm(f=>({...f,departments:toggleArr(f.departments,d)}))}>
                    {d}
                  </button>
                ))}
              </div>

              {/* ── Subjects ── */}
              <p className="form-section-label">Subjects Taught</p>
              <div className="picker-grid">
                {subjectsList.map(s => (
                  <button key={s.id} type="button" className={`pick-btn ${form.subjects.includes(s.name)?'selected':''}`} onClick={()=>setForm(f=>({...f,subjects:toggleArr(f.subjects,s.name)}))}>
                    {s.name}
                  </button>
                ))}
              </div>

              {/* ── Classes ── */}
              <p className="form-section-label">
                Classes Assigned
                {form.classes_assigned.length > 6 && (
                  <span className="overload-warning"><AlertTriangle size={12}/> Overload detected ({form.classes_assigned.length} classes)</span>
                )}
              </p>
              <div className="picker-grid">
                {classes.map(c => (
                  <button key={c.id} type="button" className={`pick-btn ${form.classes_assigned.includes(c.class_name)?'selected':''}`} onClick={()=>setForm(f=>({...f,classes_assigned:toggleArr(f.classes_assigned,c.class_name)}))}>
                    {c.class_name}
                  </button>
                ))}
                {classes.length === 0 && <p className="text-muted" style={{fontSize:13}}>No classes yet — add them in the Timetable tab first.</p>}
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  <Save size={15}/> {saving ? 'Saving...' : editTarget ? 'Update Teacher' : 'Add Teacher'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          PROFILE VIEW MODAL
      ══════════════════════════════════════════════ */}
      {showProfileModal && selectedTeacher && (
        <div className="modal-overlay" onClick={() => setShowProfileModal(false)}>
          <div className="modal modal-xl" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="profile-modal-title">
                <Avatar t={selectedTeacher} size={40}/>
                <div>
                  <h3>{selectedTeacher.full_name}</h3>
                  <span className="adm-no">{selectedTeacher.employee_number}</span>
                </div>
              </div>
              <button className="modal-close" onClick={() => setShowProfileModal(false)}><X size={18}/></button>
            </div>

            {/* Profile Tabs */}
            <div className="profile-tabs">
              {[
                { key: 'profile',     label: 'Profile',        icon: <Users size={14}/> },
                { key: 'teaching',    label: 'Teaching Load',  icon: <BookOpen size={14}/> },
                { key: 'classes',     label: 'Classes',        icon: <GraduationCap size={14}/> },
                { key: 'timetable',   label: 'Timetable',      icon: <Calendar size={14}/> },
                { key: 'performance', label: 'Performance',    icon: <BarChart2 size={14}/> },
              ].map(tab => (
                <button key={tab.key} className={`profile-tab ${profileTab === tab.key ? 'active' : ''}`} onClick={() => setProfileTab(tab.key)}>
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>

            <div className="profile-body">

              {/* ── Profile Tab ── */}
              {profileTab === 'profile' && (
                <div className="profile-tab-content">
                  <div className="profile-info-grid">
                    {[
                      { label: 'Full Name',        value: selectedTeacher.full_name },
                      { label: 'Email',            value: selectedTeacher.email || '—' },
                      { label: 'Phone',            value: selectedTeacher.phone || '—' },
                      { label: 'National ID',      value: selectedTeacher.id_number || '—' },
                      { label: 'Gender',           value: selectedTeacher.gender || '—' },
                      { label: 'Date of Birth',    value: selectedTeacher.date_of_birth || '—' },
                      { label: 'Qualification',    value: selectedTeacher.qualification || '—' },
                      { label: 'Employee No.',     value: selectedTeacher.employee_number || '—' },
                      { label: 'Teacher Code',     value: selectedTeacher.teacher_code || '—' },
                      { label: 'Teaching Level',   value: selectedTeacher.teaching_level || '—' },
                      { label: 'Terms of Employment', value: selectedTeacher.employment_type || '—' },
                      { label: 'Date of Hire',     value: selectedTeacher.date_of_hire || '—' },
                      { label: 'Salary (KES)',     value: selectedTeacher.salary ? `KES ${Number(selectedTeacher.salary).toLocaleString()}` : '—' },
                      { label: 'Status',           value: STATUS_META[selectedTeacher.status || 'active']?.label },
                    ].map(item => (
                      <div key={item.label} className="profile-info-item">
                        <p className="pii-label">{item.label}</p>
                        <p className="pii-value capitalize">{item.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Teaching Load Tab ── */}
              {profileTab === 'teaching' && (
                <div className="profile-tab-content">
                  {overloadWarning(selectedTeacher) && (
                    <div className="overload-alert">
                      <AlertTriangle size={15}/> This teacher has {(selectedTeacher.classes_assigned||[]).length} classes assigned — workload may be too high.
                    </div>
                  )}
                  <div className="load-stat-row">
                    <div className="load-stat-card">
                      <p className="lsc-val">{(selectedTeacher.subjects||[]).length}</p>
                      <p className="lsc-lbl">Subjects</p>
                    </div>
                    <div className="load-stat-card">
                      <p className="lsc-val">{(selectedTeacher.classes_assigned||[]).length}</p>
                      <p className="lsc-lbl">Classes</p>
                    </div>
                    <div className="load-stat-card">
                      <p className="lsc-val">{(selectedTeacher.departments||[]).length}</p>
                      <p className="lsc-lbl">Departments</p>
                    </div>
                    <div className="load-stat-card">
                      <p className="lsc-val">{(selectedTeacher.subjects||[]).length * (selectedTeacher.classes_assigned||[]).length || '—'}</p>
                      <p className="lsc-lbl">Lessons/wk (est.)</p>
                    </div>
                  </div>
                  <p className="form-section-label" style={{marginTop:16}}>Subjects Taught</p>
                  <div className="subjects-cell" style={{flexWrap:'wrap',gap:6}}>
                    {(selectedTeacher.subjects||[]).map(s=><span key={s} className="subject-tag">{s}</span>)}
                    {!(selectedTeacher.subjects||[]).length && <span className="text-muted">None assigned</span>}
                  </div>
                  <p className="form-section-label" style={{marginTop:16}}>Departments</p>
                  <div className="subjects-cell" style={{flexWrap:'wrap',gap:6}}>
                    {(selectedTeacher.departments||[]).map(d=><span key={d} className="dept-tag">{d}</span>)}
                    {!(selectedTeacher.departments||[]).length && <span className="text-muted">None assigned</span>}
                  </div>
                </div>
              )}

              {/* ── Classes Tab ── */}
              {profileTab === 'classes' && (
                <div className="profile-tab-content">
                  <p className="form-section-label">Assigned Classes ({(selectedTeacher.classes_assigned||[]).length})</p>
                  {(selectedTeacher.classes_assigned||[]).length === 0
                    ? <p className="text-muted">No classes assigned yet.</p>
                    : (
                      <div className="classes-grid">
                        {(selectedTeacher.classes_assigned||[]).map(c => (
                          <div key={c} className="class-card">
                            <GraduationCap size={16} color="#7c3aed"/>
                            <span>{c}</span>
                          </div>
                        ))}
                      </div>
                    )
                  }
                </div>
              )}

              {/* ── Timetable Tab ── */}
              {profileTab === 'timetable' && (
                <div className="profile-tab-content">
                  <div className="load-stat-row">
                    <div className="load-stat-card">
                      <p className="lsc-val">{selectedTeacher.maximum_lessons_per_day ?? 6}</p>
                      <p className="lsc-lbl">Max / Day</p>
                    </div>
                    <div className="load-stat-card">
                      <p className="lsc-val">{selectedTeacher.maximum_lessons_per_week ?? 30}</p>
                      <p className="lsc-lbl">Max / Week</p>
                    </div>
                    <div className="load-stat-card">
                      <p className="lsc-val">{selectedTeacher.tt_teacher_id ? '✓' : '—'}</p>
                      <p className="lsc-lbl">Synced to Timetable</p>
                    </div>
                    <div className="load-stat-card">
                      <p className="lsc-val">{selectedTeacher.active_status ? 'Yes' : 'No'}</p>
                      <p className="lsc-lbl">Available for Scheduling</p>
                    </div>
                  </div>
                  {!selectedTeacher.tt_teacher_id && (
                    <div className="overload-alert" style={{marginTop:12}}>
                      <AlertTriangle size={15}/>
                      This teacher is not yet linked to the timetable module. Edit and save to sync.
                    </div>
                  )}
                </div>
              )}

              {/* ── Performance Tab ── */}
              {profileTab === 'performance' && (
                <div className="profile-tab-content">
                  {teacherPerf.loading ? (
                    <p className="loading-state">Loading performance data...</p>
                  ) : teacherPerf.grades.length === 0 ? (
                    <div className="perf-placeholder">
                      <BarChart2 size={36} color="#cbd5e1"/>
                      <p>No performance data yet</p>
                      <span>Grade outcomes will appear here once grades are recorded for this teacher.</span>
                    </div>
                  ) : (() => {
                    const subjects = [...new Set(teacherPerf.grades.map(g => g.subject))]
                    const totalStudents = [...new Set(teacherPerf.grades.map(g => g.student_id).filter(Boolean))].length || teacherPerf.grades.length
                    const avgScoreAll = teacherPerf.grades.length > 0 ? Math.round(weightedScoreMean(teacherPerf.grades)) : 0
                    const grouped = {}
                    teacherPerf.grades.forEach(g => {
                      const key = `${g.subject}|${g.term || ''}|${g.year || ''}`
                      if (!grouped[key]) grouped[key] = { subject: g.subject, term: g.term || '—', year: g.year || '—', scores: [], ids: new Set() }
                      grouped[key].scores.push(g)
                      if (g.student_id) grouped[key].ids.add(g.student_id)
                    })
                    const tableRows = Object.values(grouped).map(g => ({
                      ...g,
                      numStudents: g.ids.size || g.scores.length,
                      avgScore: Math.round(weightedScoreMean(g.scores))
                    }))
                    return (
                      <>
                        <div className="load-stat-row">
                          <div className="load-stat-card">
                            <p className="lsc-val">{subjects.length}</p>
                            <p className="lsc-lbl">Subjects Taught</p>
                          </div>
                          <div className="load-stat-card">
                            <p className="lsc-val">{totalStudents}</p>
                            <p className="lsc-lbl">Students Graded</p>
                          </div>
                          <div className="load-stat-card">
                            <p className="lsc-val">{avgScoreAll}%</p>
                            <p className="lsc-lbl">Average Score</p>
                          </div>
                        </div>
                        <p className="form-section-label" style={{marginTop:16}}>Grade Breakdown</p>
                        <div className="tp-table-wrap" style={{marginTop:8}}>
                          <table className="tp-table">
                            <thead>
                              <tr>
                                <th>Subject</th>
                                <th>Term</th>
                                <th>Year</th>
                                <th>Students</th>
                                <th>Avg Score</th>
                              </tr>
                            </thead>
                            <tbody>
                              {tableRows.map((r, i) => (
                                <tr key={i}>
                                  <td>{r.subject}</td>
                                  <td>{r.term}</td>
                                  <td>{r.year}</td>
                                  <td>{r.numStudents}</td>
                                  <td>{r.avgScore}%</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )
                  })()}
                </div>
              )}
            </div>

            <div className="modal-actions" style={{padding:'0 24px 20px'}}>
              <button className="btn-secondary" onClick={() => setShowProfileModal(false)}>Close</button>
              <button className="btn-primary" onClick={() => { setShowProfileModal(false); openEdit(selectedTeacher) }}>
                <Edit size={14}/> Edit Profile
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}