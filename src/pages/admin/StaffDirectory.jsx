import { useState, useMemo, useCallback } from 'react'
import {
  Search, Users, GraduationCap, Briefcase, Shield, UserCheck,
  UserX, Eye, X, Mail, Phone, AlertTriangle, RefreshCw,
  Download, UserPlus, ChevronRight, ChevronLeft, Check, Loader2,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'
import useStaffDirectory from '../../hooks/useStaffDirectory'
import './StaffDirectory.css'

const CATEGORIES = ['All', 'Teaching', 'Non-Teaching', 'Administration']
const STATUS_OPTIONS = ['All', 'Active', 'Disabled', 'No Account']

const STATUS_COLORS = {
  Active: { bg: '#dcfce7', fg: '#15803d' },
  Disabled: { bg: '#fee2e2', fg: '#991b1b' },
  'No Account': { bg: '#f1f5f9', fg: '#64748b' },
}

const CAT_ICONS = {
  Teaching: <GraduationCap size={14} />,
  'Non-Teaching': <Briefcase size={14} />,
  Administration: <Shield size={14} />,
}

const CAT_COLORS = {
  Teaching: { bg: '#dbeafe', fg: '#1d4ed8' },
  'Non-Teaching': { bg: '#fef3c7', fg: '#92400e' },
  Administration: { bg: '#ede9fe', fg: '#6d28d9' },
}

function initials(name) {
  return (name || '?').split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase()
}

function fmtDate(d) {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) } catch { return '—' }
}

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%&*'
  const arr = new Uint8Array(16)
  crypto.getRandomValues(arr)
  return Array.from(arr, b => chars[b % chars.length]).join('')
}

export default function StaffDirectory() {
  const { staff, stats, loading, error, refetch } = useStaffDirectory()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [department, setDepartment] = useState('All')
  const [loginStatus, setLoginStatus] = useState('All')
  const [detail, setDetail] = useState(null)
  const [creatingAccount, setCreatingAccount] = useState(null)
  const [showPassword, setShowPassword] = useState(null)
  const [showAddStaff, setShowAddStaff] = useState(false)

  const departments = useMemo(() => {
    const set = new Set(staff.map((s) => s.department).filter(Boolean))
    return ['All', ...Array.from(set).sort()]
  }, [staff])

  const filtered = useMemo(() => {
    return staff.filter((s) => {
      if (category !== 'All' && s.staffCategory !== category) return false
      if (department !== 'All' && s.department !== department) return false
      if (loginStatus === 'Active' && !s.hasLoginAccount) return false
      if (loginStatus === 'Disabled' && s.accountStatus !== 'Disabled') return false
      if (loginStatus === 'No Account' && s.hasLoginAccount) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        const hay = [s.fullName, s.email, s.phone, s.employeeNumber, s.position, s.department].join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [staff, category, department, loginStatus, search])

  const exportCsv = useCallback(() => {
    const headers = ['Name', 'Email', 'Phone', 'Category', 'Position', 'Department', 'Employee No', 'Employment Type', 'Status', 'Login Account', 'Date of Hire']
    const rows = filtered.map((s) => [
      s.fullName, s.email, s.phone, s.staffCategory, s.position, s.department,
      s.employeeNumber, s.employmentType, s.employmentStatus,
      s.hasLoginAccount ? s.accountStatus : 'No Account', s.dateOfHire || '',
    ])
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${(c || '').toString().replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `staff-directory-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [filtered])

  const createLoginAccount = useCallback(async (rec) => {
    if (!rec.email) return
    setCreatingAccount(rec.sourceIds.teacherId || rec.sourceIds.nonTeachingStaffId)
    const password = generatePassword()
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: rec.email,
        password,
        options: { data: { full_name: rec.fullName, role: rec.sourceType === 'teacher' ? 'teacher' : 'teacher' } },
      })
      if (signUpError && !signUpError.message?.includes('already registered')) throw signUpError
      const userId = data?.user?.id
      if (userId) {
        await supabase.from('profiles').update({
          full_name: rec.fullName,
          role: 'teacher',
          roles: ['teacher'],
          school_id: rec.schoolId,
        }).eq('id', userId)
      }
      if (rec.sourceType === 'teacher' && rec.sourceIds.teacherId) {
        await supabase.from('teachers').update({ profile_id: userId }).eq('id', rec.sourceIds.teacherId)
      } else if (rec.sourceType === 'non_teaching' && rec.sourceIds.nonTeachingStaffId) {
        await supabase.from('non_teaching_staff').update({ profile_id: userId }).eq('id', rec.sourceIds.nonTeachingStaffId)
      }
      setShowPassword({ name: rec.fullName, email: rec.email, password })
      refetch()
    } catch (err) {
      setShowPassword({ name: rec.fullName, email: rec.email, password: null, error: err.message })
    }
    setCreatingAccount(null)
  }, [refetch])

  if (loading) {
    return (
      <div className="sd-root">
        <div className="sd-loading"><div className="sd-spinner" /><p>Loading staff directory...</p></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="sd-root">
        <div className="sd-error">
          <AlertTriangle size={28} />
          <h3>Failed to load staff</h3>
          <p>{error}</p>
          <button className="sd-btn-retry" onClick={refetch}><RefreshCw size={14} /> Retry</button>
      </div>
    </div>
  )
}

const DEPARTMENTS = ['Administration', 'Finance', 'Kitchen', 'Transport', 'Security', 'Maintenance', 'ICT', 'HR', 'Cleaning', 'Sciences', 'Humanities', 'Languages', 'Technical', 'Arts', 'Physical Education', 'Other']
const EMPLOYMENT_TYPES = ['permanent', 'contract', 'casual', 'intern']
const TEACHING_EMPLOYMENT_TYPES = ['TSC', 'Board']
const STATUS_OPTIONS_FORM = ['active', 'on_leave', 'suspended']

const BLANK_FORM = {
  full_name: '', email: '', phone: '', gender: '', date_of_birth: '',
  staffCategory: 'Teaching', job_title: '', department: '',
  employment_type: 'permanent', date_of_hire: '', qualification: '',
  status: 'active', salary: '', createLogin: true,
  subjects: '', assigned_classes: '', teaching_level: '', maximum_lessons_per_week: '30', maximum_lessons_per_day: '6',
}

function AddStaffModal({ onClose, onCreated }) {
  const { profile } = useAuthStore()
  const schoolId = profile?.school_id
  const [step, setStep] = useState(0)
  const [form, setForm] = useState({ ...BLANK_FORM })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const steps = ['Personal Details', 'Staff Category', form.staffCategory === 'Teaching' ? 'Teaching Details' : 'Position Details', 'Employment', 'Review']

  const validateStep = () => {
    if (step === 0) {
      if (!form.full_name.trim()) return 'Full name is required'
      if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return 'Invalid email format'
    }
    if (step === 1) {
      if (!form.staffCategory) return 'Select a staff category'
    }
    if (step === 2 && form.staffCategory === 'Non-Teaching') {
      if (!form.job_title.trim()) return 'Job title is required'
    }
    if (step === 3) {
      if (!form.date_of_hire) return 'Date of hire is required'
    }
    return null
  }

  const next = () => {
    const err = validateStep()
    if (err) { setError(err); return }
    setError('')
    setStep((s) => Math.min(s + 1, steps.length - 1))
  }

  const back = () => { setError(''); setStep((s) => Math.max(s - 1, 0)) }

  const handleSubmit = async () => {
    setSaving(true)
    setError('')
    try {
      let userId = null
      if (form.createLogin && form.email) {
        const tempPw = generatePassword()
        const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
          email: form.email.trim().toLowerCase(),
          password: tempPw,
          options: { data: { full_name: form.full_name.trim(), role: form.staffCategory === 'Teaching' ? 'teacher' : 'teacher' } },
        })
        if (signUpErr && !signUpErr.message?.includes('already registered')) throw signUpErr
        userId = signUpData?.user?.id
        if (userId) {
          await supabase.from('profiles').update({
            full_name: form.full_name.trim(),
            role: 'teacher',
            roles: ['teacher'],
            school_id: schoolId,
            ...(form.phone ? { phone: form.phone.trim() } : {}),
            ...(form.gender ? { gender: form.gender } : {}),
            ...(form.date_of_birth ? { date_of_birth: form.date_of_birth } : {}),
          }).eq('id', userId)
        }
      }

      if (form.staffCategory === 'Teaching') {
        const empType = TEACHING_EMPLOYMENT_TYPES.includes(form.employment_type) ? form.employment_type : 'Board'
        const { error: teachErr } = await supabase.from('teachers').insert({
          full_name: form.full_name.trim(),
          email: form.email ? form.email.trim().toLowerCase() : '',
          phone: form.phone || '',
          school_id: schoolId,
          profile_id: userId,
          gender: form.gender || '',
          date_of_birth: form.date_of_birth || null,
          date_of_hire: form.date_of_hire || null,
          qualification: form.qualification || '',
          employment_type: empType,
          status: form.status,
          salary: form.salary ? Number(form.salary) : 0,
          subjects: form.subjects ? form.subjects.split(',').map((s) => s.trim()).filter(Boolean) : [],
          departments: form.department ? [form.department] : [],
          assigned_classes: form.assigned_classes ? form.assigned_classes.split(',').map((s) => s.trim()).filter(Boolean) : [],
          teaching_level: form.teaching_level || '',
          maximum_lessons_per_week: Number(form.maximum_lessons_per_week) || 30,
          maximum_lessons_per_day: Number(form.maximum_lessons_per_day) || 6,
          active_status: form.status === 'active',
        })
        if (teachErr) throw teachErr
      } else {
        const empType = EMPLOYMENT_TYPES.includes(form.employment_type) ? form.employment_type : 'permanent'
        const { error: ntsErr } = await supabase.from('non_teaching_staff').insert({
          full_name: form.full_name.trim(),
          email: form.email ? form.email.trim().toLowerCase() : '',
          phone: form.phone || '',
          school_id: schoolId,
          profile_id: userId,
          job_title: form.job_title || '',
          department: form.department || '',
          gender: form.gender || '',
          date_of_birth: form.date_of_birth || null,
          date_of_hire: form.date_of_hire || null,
          qualification: form.qualification || '',
          employment_type: empType,
          status: form.status,
          salary: form.salary ? Number(form.salary) : 0,
        })
        if (ntsErr) throw ntsErr
      }

      setResult({ success: true, name: form.full_name.trim() })
    } catch (err) {
      setError(err.message)
    }
    setSaving(false)
  }

  if (result) {
    return (
      <div className="sd-overlay" onClick={onClose}>
        <div className="sd-modal sd-modal-sm" onClick={(e) => e.stopPropagation()}>
          <div className="sd-modal-head"><h3>Staff Added</h3><button className="sd-modal-close" onClick={onClose}><X size={16} /></button></div>
          <div className="sd-modal-body sd-success-body">
            <div className="sd-success-icon"><Check size={28} /></div>
            <h3>{result.name} has been added</h3>
            <p className="sd-hint">{form.staffCategory === 'Teaching' ? 'Teaching' : 'Non-teaching'} staff record created{form.createLogin && form.email ? ' with login account' : ''}.</p>
          </div>
          <div className="sd-modal-foot">
            <button className="sd-btn-primary" onClick={onCreated}>Done</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="sd-overlay" onClick={onClose}>
      <div className="sd-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sd-modal-head">
          <h3>Add New Staff</h3>
          <button className="sd-modal-close" onClick={onClose}><X size={16} /></button>
        </div>

        {/* Step Indicator */}
        <div className="sd-steps">
          {steps.map((s, i) => (
            <div key={i} className={`sd-step ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}>
              <div className="sd-step-num">{i < step ? <Check size={12} /> : i + 1}</div>
              <span className="sd-step-label">{s}</span>
            </div>
          ))}
        </div>

        <div className="sd-modal-body">
          {error && <div className="sd-form-error"><AlertTriangle size={14} /> {error}</div>}

          {/* Step 0: Personal Details */}
          {step === 0 && (
            <div className="sd-form-grid">
              <label className="sd-field sd-field-full">
                <span>Full Name *</span>
                <input value={form.full_name} onChange={(e) => set('full_name', e.target.value)} placeholder="e.g. John Kamau" />
              </label>
              <label className="sd-field">
                <span>Email</span>
                <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="john@school.com" />
              </label>
              <label className="sd-field">
                <span>Phone</span>
                <input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="0712 345 678" />
              </label>
              <label className="sd-field">
                <span>Gender</span>
                <select value={form.gender} onChange={(e) => set('gender', e.target.value)}>
                  <option value="">Select...</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </label>
              <label className="sd-field">
                <span>Date of Birth</span>
                <input type="date" value={form.date_of_birth} onChange={(e) => set('date_of_birth', e.target.value)} />
              </label>
            </div>
          )}

          {/* Step 1: Category */}
          {step === 1 && (
            <div className="sd-category-select">
              <button className={`sd-cat-option ${form.staffCategory === 'Teaching' ? 'selected' : ''}`} onClick={() => set('staffCategory', 'Teaching')}>
                <GraduationCap size={24} />
                <h4>Teaching Staff</h4>
                <p>Teachers, HODs, Class Teachers</p>
              </button>
              <button className={`sd-cat-option ${form.staffCategory === 'Non-Teaching' ? 'selected' : ''}`} onClick={() => set('staffCategory', 'Non-Teaching')}>
                <Briefcase size={24} />
                <h4>Non-Teaching Staff</h4>
                <p>Admin, Finance, Kitchen, Security, etc.</p>
              </button>
            </div>
          )}

          {/* Step 2: Teaching or Position Details */}
          {step === 2 && form.staffCategory === 'Teaching' && (
            <div className="sd-form-grid">
              <label className="sd-field sd-field-full">
                <span>Subjects</span>
                <input value={form.subjects} onChange={(e) => set('subjects', e.target.value)} placeholder="Comma-separated, e.g. Mathematics, Physics" />
              </label>
              <label className="sd-field">
                <span>Department</span>
                <select value={form.department} onChange={(e) => set('department', e.target.value)}>
                  <option value="">Select...</option>
                  {['Sciences', 'Humanities', 'Languages', 'Technical', 'Arts', 'Physical Education'].map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </label>
              <label className="sd-field">
                <span>Teaching Level</span>
                <select value={form.teaching_level} onChange={(e) => set('teaching_level', e.target.value)}>
                  <option value="">Select...</option>
                  <option value="primary">Primary</option>
                  <option value="junior">Junior Secondary</option>
                  <option value="senior">Senior Secondary</option>
                  <option value="combined">Combined</option>
                </select>
              </label>
              <label className="sd-field sd-field-full">
                <span>Assigned Classes</span>
                <input value={form.assigned_classes} onChange={(e) => set('assigned_classes', e.target.value)} placeholder="Comma-separated, e.g. Grade 7A, Grade 8B" />
              </label>
              <label className="sd-field">
                <span>Max Lessons / Week</span>
                <input type="number" min="1" value={form.maximum_lessons_per_week} onChange={(e) => set('maximum_lessons_per_week', e.target.value)} />
              </label>
              <label className="sd-field">
                <span>Max Lessons / Day</span>
                <input type="number" min="1" value={form.maximum_lessons_per_day} onChange={(e) => set('maximum_lessons_per_day', e.target.value)} />
              </label>
            </div>
          )}
          {step === 2 && form.staffCategory === 'Non-Teaching' && (
            <div className="sd-form-grid">
              <label className="sd-field sd-field-full">
                <span>Job Title *</span>
                <input value={form.job_title} onChange={(e) => set('job_title', e.target.value)} placeholder="e.g. Accountant, Cook, Driver" />
              </label>
              <label className="sd-field">
                <span>Department</span>
                <select value={form.department} onChange={(e) => set('department', e.target.value)}>
                  <option value="">Select...</option>
                  {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </label>
            </div>
          )}

          {/* Step 3: Employment */}
          {step === 3 && (
            <div className="sd-form-grid">
              <label className="sd-field">
                <span>Date of Hire *</span>
                <input type="date" value={form.date_of_hire} onChange={(e) => set('date_of_hire', e.target.value)} />
              </label>
              <label className="sd-field">
                <span>Employment Type</span>
                <select value={form.employment_type} onChange={(e) => set('employment_type', e.target.value)}>
                  {(form.staffCategory === 'Teaching' ? TEACHING_EMPLOYMENT_TYPES : EMPLOYMENT_TYPES).map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
              </label>
              <label className="sd-field">
                <span>Status</span>
                <select value={form.status} onChange={(e) => set('status', e.target.value)}>
                  {STATUS_OPTIONS_FORM.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</option>)}
                </select>
              </label>
              <label className="sd-field">
                <span>Salary (KSh)</span>
                <input type="number" min="0" value={form.salary} onChange={(e) => set('salary', e.target.value)} placeholder="0" />
              </label>
              <label className="sd-field sd-field-full">
                <span>Qualification</span>
                <input value={form.qualification} onChange={(e) => set('qualification', e.target.value)} placeholder="e.g. B.Ed, Diploma" />
              </label>
              <label className="sd-check sd-field-full">
                <input type="checkbox" checked={form.createLogin} onChange={(e) => set('createLogin', e.target.checked)} disabled={!form.email} />
                Create login account{!form.email ? ' (enter email on Step 1 to enable)' : ''}
              </label>
            </div>
          )}

          {/* Step 4: Review */}
          {step === 4 && (
            <div className="sd-review">
              <div className="sd-review-section">
                <h4>Personal</h4>
                <div className="sd-review-grid">
                  <span><strong>Name:</strong> {form.full_name}</span>
                  <span><strong>Email:</strong> {form.email || '—'}</span>
                  <span><strong>Phone:</strong> {form.phone || '—'}</span>
                  <span><strong>Gender:</strong> {form.gender || '—'}</span>
                </div>
              </div>
              <div className="sd-review-section">
                <h4>Staff Details</h4>
                <div className="sd-review-grid">
                  <span><strong>Category:</strong> {form.staffCategory}</span>
                  {form.staffCategory === 'Non-Teaching' && <span><strong>Job Title:</strong> {form.job_title}</span>}
                  <span><strong>Department:</strong> {form.department || '—'}</span>
                  {form.staffCategory === 'Teaching' && <span><strong>Subjects:</strong> {form.subjects || '—'}</span>}
                  {form.staffCategory === 'Teaching' && <span><strong>Level:</strong> {form.teaching_level || '—'}</span>}
                </div>
              </div>
              <div className="sd-review-section">
                <h4>Employment</h4>
                <div className="sd-review-grid">
                  <span><strong>Hire Date:</strong> {form.date_of_hire}</span>
                  <span><strong>Type:</strong> {form.employment_type}</span>
                  <span><strong>Status:</strong> {form.status}</span>
                  <span><strong>Salary:</strong> {form.salary ? `KSh ${Number(form.salary).toLocaleString()}` : '—'}</span>
                  <span><strong>Login Account:</strong> {form.createLogin && form.email ? 'Yes (will be created)' : 'No'}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="sd-modal-foot">
          {step > 0 && <button className="sd-btn-secondary" onClick={back}><ChevronLeft size={14} /> Back</button>}
          <div className="sd-modal-foot-right">
            <button className="sd-btn-secondary" onClick={onClose}>Cancel</button>
            {step < steps.length - 1 ? (
              <button className="sd-btn-primary" onClick={next}>Next <ChevronRight size={14} /></button>
            ) : (
              <button className="sd-btn-primary" disabled={saving} onClick={handleSubmit}>
                {saving ? <><Loader2 size={14} className="sd-spin" /> Creating...</> : <><Check size={14} /> Create Staff</>}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

  return (
    <div className="sd-root">
      <div className="sd-header">
        <div className="sd-header-text">
          <h2>Staff Directory</h2>
          <p>Manage and view all employees in your school</p>
        </div>
        <div className="sd-header-actions">
          <button className="sd-btn-export" onClick={exportCsv}><Download size={14} /> Export CSV</button>
          <button className="sd-btn-add-staff" onClick={() => setShowAddStaff(true)}><UserPlus size={14} /> Add Staff</button>
        </div>
      </div>

      <div className="sd-stats">
        <div className="sd-stat"><div className="sd-stat-icon" style={{ background: '#eff6ff', color: '#2563eb' }}><Users size={16} /></div><div><p className="sd-stat-val">{stats.total}</p><p className="sd-stat-lbl">Total Staff</p></div></div>
        <div className="sd-stat"><div className="sd-stat-icon" style={{ background: '#dbeafe', color: '#1d4ed8' }}><GraduationCap size={16} /></div><div><p className="sd-stat-val">{stats.teaching}</p><p className="sd-stat-lbl">Teaching</p></div></div>
        <div className="sd-stat"><div className="sd-stat-icon" style={{ background: '#fef3c7', color: '#92400e' }}><Briefcase size={16} /></div><div><p className="sd-stat-val">{stats.nonTeaching}</p><p className="sd-stat-lbl">Non-Teaching</p></div></div>
        <div className="sd-stat"><div className="sd-stat-icon" style={{ background: '#ede9fe', color: '#6d28d9' }}><Shield size={16} /></div><div><p className="sd-stat-val">{stats.admin}</p><p className="sd-stat-lbl">Administration</p></div></div>
        <div className="sd-stat"><div className="sd-stat-icon" style={{ background: '#dcfce7', color: '#15803d' }}><UserCheck size={16} /></div><div><p className="sd-stat-val">{stats.withLogin}</p><p className="sd-stat-lbl">With Login</p></div></div>
        <div className="sd-stat"><div className="sd-stat-icon" style={{ background: '#f1f5f9', color: '#64748b' }}><UserX size={16} /></div><div><p className="sd-stat-val">{stats.withoutLogin}</p><p className="sd-stat-lbl">No Login</p></div></div>
      </div>

      <div className="sd-toolbar">
        <div className="sd-search-wrap">
          <Search size={15} className="sd-search-icon" />
          <input className="sd-search" placeholder="Search by name, email, phone, employee number..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="sd-filter" value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c === 'All' ? 'All Categories' : c}</option>)}
        </select>
        <select className="sd-filter" value={department} onChange={(e) => setDepartment(e.target.value)}>
          {departments.map((d) => <option key={d} value={d}>{d === 'All' ? 'All Departments' : d}</option>)}
        </select>
        <select className="sd-filter" value={loginStatus} onChange={(e) => setLoginStatus(e.target.value)}>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s === 'All' ? 'All Login Status' : s}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="sd-empty">
          <Users size={40} />
          <h3>No staff members found</h3>
          <p>Staff records will appear here once teachers, administrators, or non-teaching employees have been added to the system.</p>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="sd-table-wrap sd-desktop-only">
            <table className="sd-table">
              <thead>
                <tr>
                  <th>Staff Member</th>
                  <th>Category</th>
                  <th>Position / Role</th>
                  <th>Department</th>
                  <th>Contact</th>
                  <th>Employment</th>
                  <th>Login</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <StaffRow key={`${s.sourceType}-${s.sourceIds.teacherId || s.sourceIds.nonTeachingStaffId || s.sourceIds.profileId}`} staff={s} onDetail={setDetail} onCreateAccount={createLoginAccount} creatingAccount={creatingAccount} />
                ))}
              </tbody>
            </table>
            <div className="sd-table-footer">
              <span className="sd-table-count">{filtered.length} staff member{filtered.length !== 1 ? 's' : ''}</span>
            </div>
          </div>

          {/* Mobile Cards */}
          <div className="sd-cards sd-mobile-only">
            {filtered.map((s) => (
              <StaffCard key={`card-${s.sourceType}-${s.sourceIds.teacherId || s.sourceIds.nonTeachingStaffId || s.sourceIds.profileId}`} staff={s} onDetail={setDetail} onCreateAccount={createLoginAccount} creatingAccount={creatingAccount} />
            ))}
            <div className="sd-cards-footer">{filtered.length} staff member{filtered.length !== 1 ? 's' : ''}</div>
          </div>
        </>
      )}

      {detail && <StaffDetailModal staff={detail} onClose={() => setDetail(null)} />}
      {showPassword && <PasswordModal data={showPassword} onClose={() => setShowPassword(null)} />}
      {showAddStaff && <AddStaffModal onClose={() => setShowAddStaff(false)} onCreated={() => { setShowAddStaff(false); refetch() }} />}
    </div>
  )
}

function StaffRow({ staff: s, onDetail, onCreateAccount, creatingAccount }) {
  const catColor = CAT_COLORS[s.staffCategory] || CAT_COLORS['Non-Teaching']
  const statColor = STATUS_COLORS[s.accountStatus] || STATUS_COLORS['No Account']
  return (
    <tr>
      <td>
        <div className="sd-name-cell">
          {s.photoUrl ? <img src={s.photoUrl} alt="" className="sd-avatar-img" /> : <div className="sd-avatar">{initials(s.fullName)}</div>}
          <div>
            <p className="sd-name">{s.fullName || 'Unnamed'}</p>
            {s.employeeNumber && <p className="sd-emp-no">{s.employeeNumber}</p>}
          </div>
        </div>
      </td>
      <td><span className="sd-badge" style={{ background: catColor.bg, color: catColor.fg }}>{CAT_ICONS[s.staffCategory]} {s.staffCategory}</span></td>
      <td>{s.position || '—'}</td>
      <td>{s.department || '—'}</td>
      <td>
        <div className="sd-contact">
          {s.phone && <span className="sd-contact-item"><Phone size={12} /> {s.phone}</span>}
          {s.email && <span className="sd-contact-item"><Mail size={12} /> {s.email}</span>}
          {!s.phone && !s.email && <span className="sd-contact-item sd-muted">—</span>}
        </div>
      </td>
      <td>
        <div className="sd-emp-info">
          {s.employmentType && <span className="sd-cap">{s.employmentType}</span>}
          {s.employmentStatus && <span className="sd-status-dot" style={{ color: s.employmentStatus === 'active' ? '#16a34a' : s.employmentStatus === 'on_leave' ? '#d97706' : '#dc2626' }}>{s.employmentStatus === 'active' ? 'Active' : s.employmentStatus === 'on_leave' ? 'On Leave' : s.employmentStatus === 'terminated' ? 'Terminated' : s.employmentStatus}</span>}
        </div>
      </td>
      <td><span className="sd-badge sd-badge-sm" style={{ background: statColor.bg, color: statColor.fg }}>{s.accountStatus}</span></td>
      <td className="sd-actions-cell">
        {!s.hasLoginAccount && s.email && (
          <button className="sd-btn-create" disabled={creatingAccount === (s.sourceIds.teacherId || s.sourceIds.nonTeachingStaffId)} onClick={() => onCreateAccount(s)} title="Create login account">
            <UserPlus size={13} />
          </button>
        )}
        <button className="sd-btn-eye" onClick={() => onDetail(s)} title="View details"><Eye size={15} /></button>
      </td>
    </tr>
  )
}

function StaffCard({ staff: s, onDetail, onCreateAccount, creatingAccount }) {
  const catColor = CAT_COLORS[s.staffCategory] || CAT_COLORS['Non-Teaching']
  const statColor = STATUS_COLORS[s.accountStatus] || STATUS_COLORS['No Account']
  return (
    <div className="sd-card">
      <div className="sd-card-top">
        {s.photoUrl ? <img src={s.photoUrl} alt="" className="sd-card-avatar-img" /> : <div className="sd-card-avatar">{initials(s.fullName)}</div>}
        <div className="sd-card-info">
          <p className="sd-card-name">{s.fullName || 'Unnamed'}</p>
          <p className="sd-card-pos">{s.position || '—'}{s.department ? ` · ${s.department}` : ''}</p>
        </div>
        <button className="sd-btn-eye" onClick={() => onDetail(s)}><Eye size={15} /></button>
      </div>
      <div className="sd-card-meta">
        <span className="sd-badge" style={{ background: catColor.bg, color: catColor.fg }}>{s.staffCategory}</span>
        <span className="sd-badge sd-badge-sm" style={{ background: statColor.bg, color: statColor.fg }}>{s.accountStatus}</span>
        {s.employeeNumber && <span className="sd-card-empno">{s.employeeNumber}</span>}
      </div>
      <div className="sd-card-contact">
        {s.phone && <span><Phone size={11} /> {s.phone}</span>}
        {s.email && <span><Mail size={11} /> {s.email}</span>}
      </div>
      {!s.hasLoginAccount && s.email && (
        <button className="sd-btn-create-full" disabled={creatingAccount === (s.sourceIds.teacherId || s.sourceIds.nonTeachingStaffId)} onClick={() => onCreateAccount(s)}>
          <UserPlus size={13} /> Create Login Account
        </button>
      )}
    </div>
  )
}

function StaffDetailModal({ staff: s, onClose }) {
  const catColor = CAT_COLORS[s.staffCategory] || CAT_COLORS['Non-Teaching']
  return (
    <div className="sd-overlay" onClick={onClose}>
      <div className="sd-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sd-modal-head">
          <h3>Staff Details</h3>
          <button className="sd-modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="sd-modal-body">
          <div className="sd-detail-header">
            {s.photoUrl ? <img src={s.photoUrl} alt="" className="sd-detail-avatar-img" /> : <div className="sd-detail-avatar">{initials(s.fullName)}</div>}
            <div>
              <h2 className="sd-detail-name">{s.fullName || 'Unnamed'}</h2>
              <div className="sd-detail-meta">
                <span className="sd-badge" style={{ background: catColor.bg, color: catColor.fg }}>{CAT_ICONS[s.staffCategory]} {s.staffCategory}</span>
                {s.position && <span className="sd-detail-position">{s.position}</span>}
                {s.employeeNumber && <span className="sd-detail-empno">{s.employeeNumber}</span>}
              </div>
            </div>
          </div>

          <Section title="Personal Information">
            <DetailGrid items={[
              { label: 'Full Name', value: s.fullName },
              { label: 'Email', value: s.email },
              { label: 'Phone', value: s.phone },
              { label: 'Gender', value: s.gender, capitalize: true },
              { label: 'Date of Birth', value: fmtDate(s.dateOfBirth) },
              { label: 'National ID', value: s.idNumber },
            ]} />
          </Section>

          <Section title="Employment Information">
            <DetailGrid items={[
              { label: 'Employee Number', value: s.employeeNumber },
              { label: 'Position', value: s.position },
              { label: 'Department', value: s.department },
              { label: 'Employment Type', value: s.employmentType, capitalize: true },
              { label: 'Status', value: s.employmentStatus, capitalize: true },
              { label: 'Date of Hire', value: fmtDate(s.dateOfHire) },
              { label: 'Qualification', value: s.qualification },
              ...(s.salary != null ? [{ label: 'Salary', value: `KSh ${Number(s.salary).toLocaleString()}` }] : []),
            ]} />
          </Section>

          {s.sourceType === 'teacher' && (s.subjects.length > 0 || s.assignedClasses.length > 0 || s.hodDepartment || s.teachingLevel) && (
            <Section title="Teaching Information">
              <DetailGrid items={[
                ...(s.subjects.length > 0 ? [{ label: 'Subjects', value: s.subjects.join(', '), full: true }] : []),
                ...(s.assignedClasses.length > 0 ? [{ label: 'Assigned Classes', value: s.assignedClasses.join(', '), full: true }] : []),
                ...(s.teachingLevel ? [{ label: 'Teaching Level', value: s.teachingLevel, capitalize: true }] : []),
                ...(s.hodDepartment ? [{ label: 'HOD Department', value: s.hodDepartment }] : []),
                ...(s.maximumLessonsPerWeek ? [{ label: 'Max Lessons / Week', value: s.maximumLessonsPerWeek }] : []),
                ...(s.maximumLessonsPerDay ? [{ label: 'Max Lessons / Day', value: s.maximumLessonsPerDay }] : []),
              ]} />
            </Section>
          )}

          <Section title="System Account">
            <DetailGrid items={[
              { label: 'Login Account', value: s.hasLoginAccount ? 'Yes' : 'No' },
              ...(s.hasLoginAccount ? [
                { label: 'Account Status', value: s.accountStatus },
                ...(s.raw?.profile?.role ? [{ label: 'Role', value: s.raw.profile.role.replace(/_/g, ' '), capitalize: true }] : []),
                ...(s.raw?.profile?.roles?.length > 0 ? [{ label: 'All Roles', value: s.raw.profile.roles.map((r) => r.replace(/_/g, ' ')).join(', '), full: true }] : []),
              ] : []),
            ]} />
          </Section>

          <Section title="Data Source" debug>
            <DetailGrid items={[
              { label: 'Source Type', value: s.sourceType },
              { label: 'Teacher ID', value: s.sourceIds.teacherId || '—', mono: true },
              { label: 'NTS ID', value: s.sourceIds.nonTeachingStaffId || '—', mono: true },
              { label: 'Profile ID', value: s.sourceIds.profileId || '—', mono: true },
            ]} />
          </Section>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children, debug }) {
  return (
    <div className={`sd-section${debug ? ' sd-section-debug' : ''}`}>
      <h4 className="sd-section-title">{title}</h4>
      {children}
    </div>
  )
}

function DetailGrid({ items }) {
  return (
    <div className="sd-detail-grid">
      {items.map((item, i) => (
        <div key={i} className={`sd-detail-item${item.full ? ' sd-detail-item-full' : ''}`}>
          <span className="sd-detail-lbl">{item.label}</span>
          <span className={`sd-detail-val${item.capitalize ? ' sd-cap' : ''}${item.mono ? ' sd-mono' : ''}`}>{item.value || '—'}</span>
        </div>
      ))}
    </div>
  )
}

function PasswordModal({ data, onClose }) {
  return (
    <div className="sd-overlay" onClick={onClose}>
      <div className="sd-modal sd-modal-sm" onClick={(e) => e.stopPropagation()}>
        <div className="sd-modal-head">
          <h3>{data.error ? 'Account Creation Failed' : 'Login Credentials'}</h3>
          <button className="sd-modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="sd-modal-body">
          {data.error ? (
            <div className="sd-password-error">
              <AlertTriangle size={20} />
              <p>{data.error}</p>
              {data.error.includes('already registered') && <p className="sd-hint">This email already has an account. The staff member can use their existing login.</p>}
            </div>
          ) : (
            <>
              <p className="sd-password-info">Login credentials for <strong>{data.name}</strong>:</p>
              <div className="sd-password-box">
                <div className="sd-password-row"><span className="sd-password-lbl">Email</span><span className="sd-password-val">{data.email}</span></div>
                <div className="sd-password-row"><span className="sd-password-lbl">Password</span><span className="sd-password-val sd-password-code">{data.password}</span></div>
              </div>
              <p className="sd-hint">Share these credentials securely with the staff member. They should change their password on first login.</p>
            </>
          )}
        </div>
        <div className="sd-modal-foot">
          <button className="sd-btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}
