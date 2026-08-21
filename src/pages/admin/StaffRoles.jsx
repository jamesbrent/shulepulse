import { useState, useEffect } from 'react'
import {
  Shield, Search, CheckCircle, XCircle, AlertTriangle,
  ChevronRight, UserCheck, GraduationCap, BookOpen, Users,
  UserPlus, Mail, Key, X, DollarSign, Library
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'

const DEPARTMENTS = ['Sciences', 'Humanities', 'Languages', 'Technical', 'Arts', 'Physical Education']

const ROLE_OPTIONS = [
  { value: 'teacher',          label: 'Teacher',                     icon: <BookOpen size={16} /> },
  { value: 'hod',              label: 'Head of Department (HOD)',     icon: <GraduationCap size={16} /> },
  { value: 'deputy_administrator', label: 'Deputy Administrator',    icon: <Shield size={16} /> },
  { value: 'bursar',           label: 'Finance',                    icon: <DollarSign size={16} /> },
  { value: 'registrar',        label: 'Registrar / Admissions',      icon: <UserCheck size={16} /> },
  { value: 'reception',        label: 'Reception / Secretary',        icon: <Shield size={16} /> },
  { value: 'class_teacher',    label: 'Class Teacher',               icon: <Users size={16} /> },
  { value: 'librarian',        label: 'Librarian',                   icon: <Library size={16} /> },
]

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let pw = ''
  for (let i = 0; i < 8; i++) pw += chars.charAt(Math.floor(Math.random() * chars.length))
  return pw + '!A1'
}

function generateTeacherCode() {
  const prefix = 'STF'
  const num = String(Math.floor(Math.random() * 9000) + 1000)
  return `${prefix}${num}`
}

const ROLE_BADGE = {
  hod:                  { label: 'HOD',                  color: '#7c3aed', bg: '#f3e8ff' },
  deputy_administrator: { label: 'Deputy Admin',         color: '#2563eb', bg: '#dbeafe' },
  bursar:               { label: 'Finance',             color: '#16a34a', bg: '#dcfce7' },
  registrar:            { label: 'Registrar',            color: '#ca8a04', bg: '#fef9c3' },
  reception:            { label: 'Reception',            color: '#0d9488', bg: '#ccfbf1' },
  class_teacher:        { label: 'Class Teacher',        color: '#dc2626', bg: '#fef2f2' },
  teacher:              { label: 'Teacher',               color: '#64748b', bg: '#f1f5f9' },
  admin:                { label: 'Admin',                 color: '#0f172a', bg: '#e2e8f0' },
  librarian:            { label: 'Librarian',             color: '#0e7490', bg: '#cffafe' },
}

export default function StaffRoles() {
  const { profile: authProfile } = useAuthStore()
  const [teachers, setTeachers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedTeacher, setSelectedTeacher] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [promoting, setPromoting] = useState(false)
  const [newRole, setNewRole] = useState('')
  const [hodDepartment, setHodDepartment] = useState('')
  const [toast, setToast] = useState(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [addForm, setAddForm] = useState({
    full_name: '', email: '', teacher_code: '', role: '', hod_department: '', assigned_classes: [],
  })
  const [adding, setAdding] = useState(false)
  const [generatedPassword, setGeneratedPassword] = useState('')
  const [addStep, setAddStep] = useState('form') // 'form' | 'done'
  const [classTeacherClasses, setClassTeacherClasses] = useState([])
  const [schoolClasses, setSchoolClasses] = useState([])

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  useEffect(() => {
    loadTeachers()
  }, [])

  async function loadTeachers() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase
      .from('profiles')
      .select('school_id')
      .eq('id', user.id)
      .single()
    if (!profile?.school_id) { setLoading(false); return }

    const [teachersRes, profilesRes, classesRes] = await Promise.all([
      supabase
        .from('teachers')
        .select('*')
        .eq('school_id', profile.school_id)
        .order('full_name'),
      supabase
        .from('profiles')
        .select('id, email, full_name, role, roles')
        .eq('school_id', profile.school_id),
      supabase
        .from('students')
        .select('class')
        .eq('school_id', profile.school_id),
    ])

    const uniqueClasses = [...new Set((classesRes.data || []).map(s => s.class).filter(Boolean))].sort()

    const profileByEmail = {}
    ;(profilesRes.data || []).forEach(p => {
      if (p.email) profileByEmail[p.email.toLowerCase()] = p
    })

    const merged = (teachersRes.data || []).map(t => ({
      ...t,
      profiles: profileByEmail[(t.email || '').toLowerCase()] || null,
    }))

    setTeachers(merged)
    setSchoolClasses(uniqueClasses)
    setLoading(false)
  }

  function openPromote(teacher) {
    setSelectedTeacher(teacher)
    setNewRole('')
    setHodDepartment('')
    setClassTeacherClasses(teacher.assigned_classes?.length ? teacher.assigned_classes : (teacher.class ? [teacher.class] : []))
    setShowModal(true)
  }

  async function handlePromote() {
    if (!selectedTeacher || !newRole) return
    setPromoting(true)
    try {
      const profileId = selectedTeacher.profiles?.id
      if (!profileId) throw new Error('No profile linked to this teacher')

      const currentRoles = selectedTeacher.profiles?.roles || [selectedTeacher.profiles?.role || 'teacher']
      let updatedRoles = currentRoles.includes(newRole) ? currentRoles : [...currentRoles, newRole]
      if (!updatedRoles.includes('teacher')) updatedRoles = ['teacher', ...updatedRoles]

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ role: newRole, roles: updatedRoles })
        .eq('id', profileId)
      if (updateError) throw updateError

      if (newRole === 'hod' && hodDepartment) {
        await supabase
          .from('teachers')
          .update({ hod_department: hodDepartment })
          .eq('id', selectedTeacher.id)
      }

      if (newRole === 'class_teacher' && classTeacherClasses.length > 0) {
        await supabase
          .from('teachers')
          .update({ class: classTeacherClasses[0], assigned_classes: classTeacherClasses })
          .eq('id', selectedTeacher.id)
      }

      const action = newRole === 'hod'
        ? `${selectedTeacher.full_name} promoted to HOD (${hodDepartment})`
        : newRole === 'class_teacher'
          ? `${selectedTeacher.full_name} assigned as Class Teacher (${classTeacherClasses.join(', ')})`
          : `${selectedTeacher.full_name} now also has ${ROLE_OPTIONS.find(r => r.value === newRole)?.label || newRole}`
      showToast(action)

      setShowModal(false)
      setSelectedTeacher(null)
      loadTeachers()
    } catch (err) {
      showToast(err.message, 'error')
    }
    setPromoting(false)
  }

  async function handleAddStaff() {
    if (!addForm.full_name.trim() || !addForm.email.trim() || !addForm.role) return
    if (addForm.role === 'class_teacher' && addForm.assigned_classes.length === 0) return
    setAdding(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase
        .from('profiles')
        .select('school_id')
        .eq('id', user.id)
        .single()
      const schoolId = profile?.school_id
      if (!schoolId) throw new Error('No school linked to your account')

      const email = addForm.email.trim().toLowerCase()
      const teacherCode = addForm.teacher_code.trim() || generateTeacherCode()

      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password: generatedPassword,
        options: { data: { full_name: addForm.full_name.trim(), role: addForm.role } },
      })
      if (signUpError && !signUpError.message?.includes('already registered')) throw signUpError

      const newUserId = signUpData?.user?.id

      if (newUserId) {
        const { error: updateError } = await supabase
          .from('profiles')
          .update({
            full_name: addForm.full_name.trim(),
            role: addForm.role,
            roles: addForm.role === 'teacher' ? ['teacher'] : ['teacher', addForm.role],
            school_id: schoolId,
          })
          .eq('id', newUserId)
        if (updateError) throw updateError
      }

      const { error: teacherError } = await supabase
        .from('teachers')
        .insert({
          full_name: addForm.full_name.trim(),
          email,
          teacher_code: teacherCode,
          school_id: schoolId,
          profile_id: newUserId || null,
          departments: addForm.role === 'hod' ? [addForm.hod_department] : [],
          ...(addForm.role === 'hod' && addForm.hod_department ? { hod_department: addForm.hod_department } : {}),
          ...(addForm.role === 'class_teacher' && addForm.assigned_classes.length > 0 ? { class: addForm.assigned_classes[0], assigned_classes: addForm.assigned_classes } : {}),
        })
        .select()
        .single()
      if (teacherError && !teacherError.message?.includes('duplicate')) throw teacherError

      setAddStep('done')
      showToast(`${addForm.full_name.trim()} added as ${ROLE_OPTIONS.find(r => r.value === addForm.role)?.label || addForm.role}`)
      loadTeachers()
    } catch (err) {
      showToast(err.message, 'error')
    }
    setAdding(false)
  }

  async function handleRevert(teacher) {
    const currentRoles = teacher.profiles?.roles || [teacher.profiles?.role || 'teacher']
    const staffRole = currentRoles.find(r => r !== 'teacher')
    if (!staffRole) return showToast('No staff role to remove', 'error')

    if (!window.confirm(`Remove ${teacher.full_name}'s "${ROLE_OPTIONS.find(r => r.value === staffRole)?.label || staffRole}" role?`)) return
    try {
      const profileId = teacher.profiles?.id
      if (!profileId) throw new Error('No profile linked')

      const updatedRoles = currentRoles.filter(r => r !== staffRole)
      if (updatedRoles.length === 0) updatedRoles.push('teacher')

      const newPrimary = teacher.profiles?.role === staffRole ? updatedRoles[0] : teacher.profiles?.role

      await supabase.from('profiles').update({ role: newPrimary, roles: updatedRoles }).eq('id', profileId)
      await supabase.from('teachers').update({ hod_department: null }).eq('id', teacher.id)

      showToast(`${teacher.full_name} removed from ${ROLE_OPTIONS.find(r => r.value === staffRole)?.label || staffRole}`)
      loadTeachers()
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  const filtered = teachers.filter(t => {
    if (!search) return true
    const q = search.toLowerCase()
    return t.full_name?.toLowerCase().includes(q)
      || t.teacher_code?.toLowerCase().includes(q)
      || t.email?.toLowerCase().includes(q)
  })

  if (loading) return <div className="loading-state">Loading staff...</div>

  return (
    <div className="sr-root">
      <div className="sr-toolbar">
        <div className="sr-search">
          <Search size={16} />
          <input
            placeholder="Search by name, code, or email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button className="sr-btn sr-btn-primary" onClick={() => {
          setAddForm({ full_name: '', email: '', teacher_code: generateTeacherCode(), role: '', hod_department: '', assigned_classes: [] })
          setGeneratedPassword(generatePassword())
          setAddStep('form')
          setShowAddModal(true)
        }}>
          <UserPlus size={15} />
          Add Staff
        </button>
        <p className="sr-count">{filtered.length} staff members</p>
      </div>

      <div className="sr-summary">
        {ROLE_OPTIONS.map(role => {
          const count = teachers.filter(t => (t.profiles?.roles || [t.profiles?.role]).includes(role.value)).length
          const meta = ROLE_BADGE[role.value]
          return (
            <div key={role.value} className="sr-summary-card" style={{ borderLeft: `3px solid ${meta.color}` }}>
              <p className="sr-summary-count" style={{ color: meta.color }}>{count}</p>
              <p className="sr-summary-label">{role.label}</p>
            </div>
          )
        })}
      </div>

      <div className="sr-table-wrap">
        <table className="sr-table">
          <thead>
            <tr>
              <th>Staff Name</th>
              <th>Code</th>
              <th>Email</th>
              <th>Departments</th>
              <th>Current Role</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="sr-empty">No staff found</td></tr>
            ) : filtered.map(t => {
              const userRoles = t.profiles?.roles || [t.profiles?.role || 'teacher']
              const hasStaffRole = userRoles.some(r => ROLE_OPTIONS.some(o => o.value === r))
              return (
                <tr key={t.id}>
                  <td className="sr-name-cell">
                    <div className="sr-avatar-sm">{t.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}</div>
                    <span>{t.full_name}</span>
                  </td>
                  <td className="monospace">{t.teacher_code || '—'}</td>
                  <td>{t.email || t.profiles?.email || '—'}</td>
                  <td>{(t.departments || []).slice(0, 2).join(', ')}{(t.departments || []).length > 2 ? '...' : '' || '—'}</td>
                  <td>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {userRoles.map(r => {
                        const meta = ROLE_BADGE[r]
                        if (!meta) return null
                        return (
                          <span key={r} className="sr-role-badge" style={{ background: meta.bg, color: meta.color }}>
                            {meta.label}
                          </span>
                        )
                      })}
                    </div>
                    {t.hod_department && <span className="sr-dept-tag">{t.hod_department}</span>}
                    {userRoles.includes('class_teacher') && (t.assigned_classes?.length > 0 || t.class) && (
                      <span className="sr-dept-tag" style={{ background: '#fef2f2', color: '#dc2626' }}>
                        Class{(t.assigned_classes?.length || 0) > 1 ? 'es' : ''}: {(t.assigned_classes?.length > 0 ? t.assigned_classes : [t.class]).join(', ')}
                      </span>
                    )}
                  </td>
                  <td>
                    <div className="sr-actions">
                      {hasStaffRole ? (
                        <button className="sr-btn sr-btn-ghost" onClick={() => handleRevert(t)}>
                          Remove Role
                        </button>
                      ) : null}
                      <button className="sr-btn sr-btn-primary" onClick={() => openPromote(t)}>
                        {hasStaffRole ? 'Add Role' : 'Promote'}
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {showModal && selectedTeacher && (
        <div className="sr-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="sr-modal" onClick={e => e.stopPropagation()}>
            <div className="sr-modal-header">
              <h3>Manage Staff Roles</h3>
              <button className="sr-modal-close" onClick={() => setShowModal(false)}>&times;</button>
            </div>
            <div className="sr-modal-body">
              <div className="sr-modal-teacher">
                <div className="sr-avatar-lg">
                  {selectedTeacher.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </div>
                <div>
                  <p className="sr-modal-name">{selectedTeacher.full_name}</p>
                  <p className="sr-modal-current">
                    Current roles:{' '}
                    {(selectedTeacher.profiles?.roles || [selectedTeacher.profiles?.role || 'teacher']).map(r => ROLE_BADGE[r]?.label || r).join(', ')}
                  </p>
                </div>
              </div>

              <div className="sr-modal-field">
                <label>{selectedTeacher.profiles?.roles?.length > 1 ? 'Add Another Role' : 'Assign Role'}</label>
                <div className="sr-role-grid">
                  {ROLE_OPTIONS.map(role => (
                    <button
                      key={role.value}
                      className={`sr-role-option ${newRole === role.value ? 'selected' : ''}`}
                      onClick={() => { setNewRole(role.value); setHodDepartment(''); setClassTeacherClasses([]) }}
                    >
                      {role.icon}
                      <span>{role.label}</span>
                      {newRole === role.value && <CheckCircle size={16} className="sr-checked" />}
                    </button>
                  ))}
                </div>
              </div>

              {newRole === 'hod' && (
                <div className="sr-modal-field">
                  <label>Select Department</label>
                  <div className="sr-dept-grid">
                    {DEPARTMENTS.map(d => (
                      <button
                        key={d}
                        className={`sr-dept-option ${hodDepartment === d ? 'selected' : ''}`}
                        onClick={() => setHodDepartment(d)}
                      >
                        {d}
                        {hodDepartment === d && <CheckCircle size={14} className="sr-checked" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {newRole === 'class_teacher' && (
                <div className="sr-modal-field">
                  <label>Assign to Class(es)</label>
                  <div className="sr-dept-grid">
                    {schoolClasses.map(c => (
                      <button
                        key={c}
                        className={`sr-dept-option ${classTeacherClasses.includes(c) ? 'selected' : ''}`}
                        onClick={() => setClassTeacherClasses(prev =>
                          prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]
                        )}
                      >
                        {c}
                        {classTeacherClasses.includes(c) && <CheckCircle size={14} className="sr-checked" />}
                      </button>
                    ))}
                  </div>
                  {classTeacherClasses.length > 0 && (
                    <p style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>
                      Selected: {classTeacherClasses.join(', ')}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="sr-modal-footer">
              <button className="sr-btn sr-btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button
                className="sr-btn sr-btn-primary"
                onClick={handlePromote}
                disabled={promoting || !newRole || (newRole === 'hod' && !hodDepartment) || (newRole === 'class_teacher' && classTeacherClasses.length === 0)}
              >
                {promoting ? 'Promoting...' : 'Confirm Promotion'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddModal && (
        <div className="sr-modal-overlay" onClick={() => { if (addStep === 'done') setShowAddModal(false) }}>
          <div className="sr-modal" onClick={e => e.stopPropagation()} style={{ width: 520 }}>
            <div className="sr-modal-header">
              <h3>{addStep === 'done' ? 'Staff Added' : 'Add New Staff'}</h3>
              <button className="sr-modal-close" onClick={() => setShowAddModal(false)}>&times;</button>
            </div>

            {addStep === 'form' ? (
              <>
                <div className="sr-modal-body">
                  <div className="sr-modal-field">
                    <label>Full Name</label>
                    <input
                      className="sr-input"
                      placeholder="e.g. Jane Mwangi"
                      value={addForm.full_name}
                      onChange={e => setAddForm({ ...addForm, full_name: e.target.value })}
                    />
                  </div>

                  <div className="sr-modal-field">
                    <label>Email Address</label>
                    <input
                      className="sr-input"
                      type="email"
                      placeholder="e.g. jane@school.ac.ke"
                      value={addForm.email}
                      onChange={e => setAddForm({ ...addForm, email: e.target.value })}
                    />
                  </div>

                  <div className="sr-modal-field">
                    <label>Teacher Code <span className="text-muted">(auto-generated if blank)</span></label>
                    <input
                      className="sr-input"
                      placeholder="e.g. STF1001"
                      value={addForm.teacher_code}
                      onChange={e => setAddForm({ ...addForm, teacher_code: e.target.value })}
                    />
                  </div>

                  <div className="sr-modal-field">
                    <label>Role</label>
                    <div className="sr-role-grid">
                      {ROLE_OPTIONS.map(role => (
                        <button
                          key={role.value}
                          className={`sr-role-option ${addForm.role === role.value ? 'selected' : ''}`}
                          onClick={() => setAddForm({ ...addForm, role: role.value, hod_department: '', assigned_classes: [] })}
                        >
                          {role.icon}
                          <span>{role.label}</span>
                          {addForm.role === role.value && <CheckCircle size={16} className="sr-checked" />}
                        </button>
                      ))}
                    </div>
                  </div>

                  {addForm.role === 'hod' && (
                    <div className="sr-modal-field">
                      <label>Department</label>
                      <div className="sr-dept-grid">
                        {DEPARTMENTS.map(d => (
                          <button
                            key={d}
                            className={`sr-dept-option ${addForm.hod_department === d ? 'selected' : ''}`}
                            onClick={() => setAddForm({ ...addForm, hod_department: d })}
                          >
                            {d}
                            {addForm.hod_department === d && <CheckCircle size={14} className="sr-checked" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {addForm.role === 'class_teacher' && (
                    <div className="sr-modal-field">
                      <label>Assign to Class(es)</label>
                      <div className="sr-dept-grid">
                        {schoolClasses.map(c => (
                          <button
                            key={c}
                            className={`sr-dept-option ${addForm.assigned_classes.includes(c) ? 'selected' : ''}`}
                            onClick={() => setAddForm(prev => ({
                              ...prev,
                              assigned_classes: prev.assigned_classes.includes(c)
                                ? prev.assigned_classes.filter(x => x !== c)
                                : [...prev.assigned_classes, c]
                            }))}
                          >
                            {c}
                            {addForm.assigned_classes.includes(c) && <CheckCircle size={14} className="sr-checked" />}
                          </button>
                        ))}
                      </div>
                      {addForm.assigned_classes.length > 0 && (
                        <p style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>
                          Selected: {addForm.assigned_classes.join(', ')}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="sr-modal-field" style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 14px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <Key size={14} /> Temporary Password
                    </label>
                    <code style={{ fontSize: 15, color: '#2563eb', fontWeight: 600, userSelect: 'all' }}>
                      {generatedPassword}
                    </code>
                    <p className="text-muted" style={{ fontSize: 11, margin: '4px 0 0' }}>
                      Share this password with the staff member. They can change it after login.
                    </p>
                  </div>
                </div>

                <div className="sr-modal-footer">
                  <button className="sr-btn sr-btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
                  <button
                    className="sr-btn sr-btn-primary"
                    onClick={handleAddStaff}
                    disabled={adding || !addForm.full_name.trim() || !addForm.email.trim() || !addForm.role || (addForm.role === 'hod' && !addForm.hod_department) || (addForm.role === 'class_teacher' && addForm.assigned_classes.length === 0)}
                  >
                    {adding ? 'Adding...' : 'Add Staff'}
                  </button>
                </div>
              </>
            ) : (
              <div className="sr-modal-body" style={{ textAlign: 'center', padding: '32px 24px' }}>
                <CheckCircle size={48} color="#16a34a" style={{ marginBottom: 12 }} />
                <h3 style={{ margin: '0 0 4px' }}>{addForm.full_name}</h3>
                <p style={{ color: '#64748b', margin: '0 0 6px' }}>
                  {ROLE_OPTIONS.find(r => r.value === addForm.role)?.label || addForm.role}
                </p>
                <p style={{ color: '#94a3b8', fontSize: 13 }}>
                  Email: {addForm.email.toLowerCase()}<br />
                  Password: <code style={{ color: '#2563eb', fontWeight: 600, userSelect: 'all' }}>{generatedPassword}</code>
                </p>
                <button className="sr-btn sr-btn-primary" onClick={() => setShowAddModal(false)} style={{ marginTop: 16 }}>
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div className="onboard-toast" style={{ background: toast.type === 'error' ? '#ef4444' : '#16a34a' }}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
