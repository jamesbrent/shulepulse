import { useState, useEffect, useRef } from 'react'
import {
  GraduationCap, Search, X, Eye, FileText, Download,
  ChevronRight, Calendar, AlertTriangle,
  CheckCircle, RefreshCw, ArrowLeft, Lock, Unlock, Edit2,
  UserCheck, AlertOctagon, Merge, Save, History,
  User, BookOpen, LogOut, Phone, AlertCircle, ScrollText, MoreVertical,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'
import { useSchool } from './useSchool'
import { fmtDate } from './fees/utils/feesHelpers'
import { buildGraduationTranscript } from '../../features/alumni/graduationTranscript'
import { useBrandingStore } from '../../features/branding/brandingStore'

const CERT_PREFIXES = {
  leaving: 'SP-LVC',
  completion: 'SP-CMP',
  transcript: 'SP-TRN',
  bonafide: 'SP-BNF',
}

function ContextMenu({ items, onClose }) {
  const ref = useRef(null)
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])
  return (
    <div className="alumni-context-menu" ref={ref}>
      {items.map((item, i) => (
        item.divider ? <div key={i} className="alumni-context-divider" /> :
        <button key={i} className={`alumni-context-item ${item.danger ? 'danger' : ''}`} onClick={() => { item.onClick(); onClose() }}>
          {item.icon} {item.label}
        </button>
      ))}
    </div>
  )
}

export default function AdminAlumni() {
  const { profile } = useAuthStore()
  const { school, currentTerm, currentYear } = useSchool()
  const { logoUrl, schoolName } = useBrandingStore()
  const [alumni, setAlumni] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterYear, setFilterYear] = useState('')
  const [filterClass, setFilterClass] = useState('')
  const [filterExit, setFilterExit] = useState('')
  const [filterGender, setFilterGender] = useState('')
  const [filterDataStatus, setFilterDataStatus] = useState('')
  const [filterCertStatus, setFilterCertStatus] = useState('')
  const [selectedStudent, setSelectedStudent] = useState(null)
  const [view, setView] = useState('list')
  const [stats, setStats] = useState({ total: 0, thisYear: 0, issues: 0 })
  const [auditLogs, setAuditLogs] = useState([])
  const [showAudit, setShowAudit] = useState(false)
  const [certModal, setCertModal] = useState(false)
  const [mergeModal, setMergeModal] = useState(false)
  const [mergeTarget, setMergeTarget] = useState(null)
  const [mergeSource, setMergeSource] = useState('')
  const [alerts, setAlerts] = useState([])
  const [openMenuId, setOpenMenuId] = useState(null)

  const [editForm, setEditForm] = useState({
    full_name: '', admission_number: '', gender: '', date_of_birth: '',
    class: '', stream: '', entry_year: '', exit_year: '', conduct: '',
    exit_reason: '', exit_date: '', approved_by: '', phone: '', email: '', current_location: '',
    upi_number: '', nemis_number: '', nationality: '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (profile?.school_id) { fetchAlumni(); fetchAuditLogs() }
  }, [profile])

  const fetchAlumni = async () => {
    setLoading(true)
    const schoolId = profile.school_id
    const { data } = await supabase
      .from('students')
      .select('*')
      .eq('school_id', schoolId)
      .in('status', ['alumni', 'completed', 'graduated'])
      .order('full_name')

    setAlumni(data || [])
    const total = data?.length || 0
    const thisYear = data?.filter(s => { const y = s.updated_at ? new Date(s.updated_at).getFullYear() : null; return y === Number(currentYear) }).length || 0
    const issues = data?.filter(s => !s.exit_date || !s.exit_reason || !s.approved_by).length || 0
    setStats({ total, thisYear, issues })

    const computedAlerts = []
    data?.forEach(s => {
      if (!s.exit_date) computedAlerts.push({ type: 'missing_exit_date', student: s.full_name, id: s.id })
      if (!s.certificate_generated) computedAlerts.push({ type: 'missing_cert', student: s.full_name, id: s.id })
      if (!s.approved_by) computedAlerts.push({ type: 'unapproved', student: s.full_name, id: s.id })
      if (!s.entry_year && !s.created_at) computedAlerts.push({ type: 'incomplete_history', student: s.full_name, id: s.id })
    })
    const nameCounts = {}
    data?.forEach(s => { const k = s.full_name?.toLowerCase().trim(); if (k) nameCounts[k] = (nameCounts[k] || 0) + 1 })
    data?.forEach(s => { const k = s.full_name?.toLowerCase().trim(); if (nameCounts[k] > 1) computedAlerts.push({ type: 'duplicate', student: s.full_name, id: s.id }) })
    setAlerts(computedAlerts)
    setLoading(false)
  }

  const fetchAuditLogs = async () => {
    const schoolId = profile.school_id
    const { data } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('school_id', schoolId)
      .in('action', ['alumni_record_corrected', 'student_reactivated', 'record_locked', 'certificate_generated', 'alumni_merged', 'alumni_identity_updated', 'alumni_academic_updated', 'alumni_exit_updated', 'student_graduated', 'student_graduated_manual'])
      .order('created_at', { ascending: false })
      .limit(50)
    setAuditLogs(data || [])
  }

  const years = [...new Set(alumni.map(s => s.updated_at ? new Date(s.updated_at).getFullYear() : null).filter(Boolean))].sort((a, b) => b - a)
  const classes = [...new Set(alumni.map(s => s.class).filter(Boolean))].sort()

  const filtered = alumni.filter(s => {
    if (search) { const q = search.toLowerCase(); if (!s.full_name?.toLowerCase().includes(q) && !s.admission_number?.toLowerCase().includes(q)) return false }
    if (filterYear) { const y = s.updated_at ? new Date(s.updated_at).getFullYear() : null; if (y !== Number(filterYear)) return false }
    if (filterClass && s.class !== filterClass) return false
    if (filterExit && s.exit_reason !== filterExit) return false
    if (filterGender && s.gender !== filterGender) return false
    if (filterDataStatus === 'clean' && (s.exit_date && s.exit_reason && s.approved_by)) return false
    if (filterDataStatus === 'flagged' && s.record_locked) return false
    if (filterDataStatus === 'edited') return false
    if (filterCertStatus === 'generated' && !s.certificate_generated) return false
    if (filterCertStatus === 'missing' && s.certificate_generated) return false
    return true
  })

  const genDocId = (prefix) => `${prefix}/${currentYear}/${String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0')}`

  const handleGenerateCertificate = async (s, type = 'leaving') => {
    if (s.record_locked && s.certificate_generated) { alert('Record is locked.'); return }
    const label = { leaving: 'School Leaving Certificate', completion: 'Completion Certificate', transcript: 'Academic Transcript', bonafide: 'Bonafide Letter' }[type]
    if (!window.confirm(`Generate ${label} for ${s.full_name}?`)) return
    const prefix = CERT_PREFIXES[type]; const docId = genDocId(prefix)
    const existingCerts = s.certificates_generated || []
    existingCerts.push({ type, docId, date: new Date().toISOString() })
    await supabase.from('students').update({
      certificate_generated: true, certificate_id: existingCerts.length === 1 ? docId : s.certificate_id,
      certificates_generated: existingCerts, updated_at: new Date().toISOString(), updated_by: profile?.id,
    }).eq('id', s.id)
    await supabase.from('audit_logs').insert({
      school_id: profile.school_id, action: 'certificate_generated',
      details: { message: `${label} generated: ${docId}`, entity_type: 'student', entity_id: s.id }, performed_by: profile?.id,
    })
    await fetchAlumni(); await fetchAuditLogs()
    setCertModal(false); alert(`${label} generated: ${docId}`)
  }

  const handleViewTranscript = async (s) => {
    try {
      const doc = await buildGraduationTranscript(s, school, logoUrl, profile?.id)
      const printWindow = window.open('', '_blank')
      if (!printWindow) return
      const styles = `
        @page { size: A4; margin: 18mm 20mm; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      `
      printWindow.document.write(`
        <html><head><title>Graduation Transcript — ${s.full_name}</title><style>${styles}</style></head><body>${doc.html}</body></html>
      `)
      printWindow.document.close()
      printWindow.onload = () => { printWindow.focus(); printWindow.print() }
    } catch (e) {
      alert('Failed to generate transcript: ' + e.message)
    }
  }

  const handleReactivate = async (s) => {
    if (s.record_locked) { alert('Record is locked.'); return }
    if (!window.confirm(`Reactivate ${s.full_name} to active students? Error correction only.`)) return
    await supabase.from('students').update({ status: 'active', updated_at: new Date().toISOString(), updated_by: profile?.id }).eq('id', s.id)
    await supabase.from('audit_logs').insert({
      school_id: profile.school_id, action: 'student_reactivated',
      details: { message: `Student ${s.full_name} (${s.admission_number}) reactivated from alumni to active`, entity_type: 'student', entity_id: s.id },
      performed_by: profile?.id,
    })
    fetchAlumni(); fetchAuditLogs()
  }

  const handleLockRecord = async (s) => {
    if (s.record_locked) { alert('Already locked.'); return }
    if (!window.confirm(`Lock record for ${s.full_name}? Prevents further edits.`)) return
    await supabase.from('students').update({ record_locked: true, updated_at: new Date().toISOString(), updated_by: profile?.id }).eq('id', s.id)
    await supabase.from('audit_logs').insert({
      school_id: profile.school_id, action: 'record_locked',
      details: { message: `Record locked for ${s.full_name} (${s.admission_number})`, entity_type: 'student', entity_id: s.id },
      performed_by: profile?.id,
    })
    fetchAlumni(); fetchAuditLogs()
  }

  const handleMerge = async () => {
    const source = alumni.find(s => s.full_name?.toLowerCase().trim() === mergeSource.toLowerCase().trim() && s.id !== mergeTarget.id)
    if (!source) { alert('No matching duplicate found.'); return }
    if (!window.confirm(`Merge ${source.full_name} (${source.admission_number}) into ${mergeTarget.full_name} (${mergeTarget.admission_number})? Source will be deleted.`)) return
    await supabase.from('audit_logs').insert({
      school_id: profile.school_id, action: 'alumni_merged',
      details: { message: `Merged ${source.full_name} (${source.admission_number}) into ${mergeTarget.full_name} (${mergeTarget.admission_number})`, entity_type: 'student', entity_id: mergeTarget.id },
      performed_by: profile?.id,
    })
    await supabase.from('students').delete().eq('id', source.id)
    setMergeModal(false); setMergeTarget(null); setMergeSource('')
    fetchAlumni(); fetchAuditLogs(); alert('Duplicate merged and source deleted.')
  }

  const openEditPanel = (s) => {
    if (s.record_locked) { alert('Record is locked. Unlock first to edit.'); return }
    setEditForm({
      full_name: s.full_name || '', admission_number: s.admission_number || '',
      gender: s.gender || '', date_of_birth: s.date_of_birth ? s.date_of_birth.slice(0, 10) : '',
      class: s.class || '', stream: s.stream || '', entry_year: s.entry_year || (s.created_at ? new Date(s.created_at).getFullYear() : ''),
      exit_year: s.updated_at ? new Date(s.updated_at).getFullYear() : '', conduct: s.conduct || 'Satisfactory',
      exit_reason: s.exit_reason || 'Completed', exit_date: s.exit_date ? s.exit_date.slice(0, 10) : (s.updated_at ? s.updated_at.slice(0, 10) : ''),
      approved_by: s.approved_by || '', phone: s.phone || '', email: s.email || '',
      current_location: s.current_location || '', upi_number: s.upi_number || '',
      nemis_number: s.nemisis_number || '', nationality: s.nationality || '',
      notes: '',
    })
    setSelectedStudent(s)
    setView('edit')
  }

  const handleSaveEdit = async () => {
    if (!editForm.notes.trim()) { alert('A reason for this edit is required.'); return }
    const s = selectedStudent
    const changed = {}
    const changedFields = []
    const track = (field, label, oldVal, newVal) => {
      if (String(oldVal || '') !== String(newVal || '')) {
        changed[field] = newVal
        changedFields.push(`${label}: "${oldVal || '—'}" → "${newVal || '—'}"`)
      }
    }
    track('full_name', 'Full Name', s.full_name, editForm.full_name)
    track('admission_number', 'Admission Number', s.admission_number, editForm.admission_number)
    track('gender', 'Gender', s.gender, editForm.gender)
    track('date_of_birth', 'Date of Birth', s.date_of_birth ? s.date_of_birth.slice(0, 10) : '', editForm.date_of_birth)
    track('class', 'Final Class', s.class, editForm.class)
    track('stream', 'Stream', s.stream, editForm.stream)
    track('entry_year', 'Entry Year', s.entry_year || (s.created_at ? new Date(s.created_at).getFullYear() : ''), editForm.entry_year)
    track('exit_reason', 'Exit Reason', s.exit_reason, editForm.exit_reason)
    track('exit_date', 'Exit Date', s.exit_date ? s.exit_date.slice(0, 10) : '', editForm.exit_date)
    track('conduct', 'Conduct', s.conduct || 'Satisfactory', editForm.conduct)
    track('approved_by', 'Approved By', s.approved_by, editForm.approved_by)
    track('phone', 'Phone', s.phone, editForm.phone)
    track('email', 'Email', s.email, editForm.email)
    track('current_location', 'Current Location', s.current_location, editForm.current_location)
    track('upi_number', 'UPI Number', s.upi_number, editForm.upi_number)
    track('nemisis_number', 'NEMIS Number', s.nemisis_number, editForm.nemis_number)
    track('nationality', 'Nationality', s.nationality, editForm.nationality)

    if (editForm.exit_year && Number(editForm.exit_year) !== (s.updated_at ? new Date(s.updated_at).getFullYear() : null)) {
      const warn = window.confirm(`WARNING: Changing graduation year from ${s.updated_at ? new Date(s.updated_at).getFullYear() : '?'} to ${editForm.exit_year}. This is a major change. Continue?`)
      if (!warn) return
      changedFields.push(`Graduation Year: "${s.updated_at ? new Date(s.updated_at).getFullYear() : '—'}" → "${editForm.exit_year}"`)
    }

    if (changedFields.length === 0) { alert('No changes detected.'); return }
    setSaving(true)

    changed.updated_at = new Date().toISOString()
    changed.updated_by = profile?.id

    const { error } = await supabase.from('students').update(changed).eq('id', s.id)
    if (error) { alert('Save failed: ' + error.message); setSaving(false); return }

    await supabase.from('audit_logs').insert({
      school_id: profile.school_id, action: 'alumni_record_corrected',
      details: { message: `Admin edited ${s.full_name} (${s.admission_number}): ${changedFields.join('; ')}. Reason: ${editForm.notes}`, entity_type: 'student', entity_id: s.id },
      performed_by: profile?.id,
    })

    setSaving(false)
    setView('list'); setSelectedStudent(null)
    await fetchAlumni(); await fetchAuditLogs()
    alert('Record updated. Audit trail saved.')
  }

  const exportFormat = (format) => {
    const esc = v => `"${(v || '').replace(/"/g, '""')}"`
    let rows
    switch (format) {
      case 'register':
        rows = [['#', 'Full Name', 'Adm No', 'Class', 'Gender', 'Exit Year', 'Exit Reason', 'Certificate ID', 'Status'].join(','),
          ...filtered.map((s, i) => [i + 1, esc(s.full_name), esc(s.admission_number), esc(s.class), esc(s.gender), s.updated_at ? new Date(s.updated_at).getFullYear() : '', esc(s.exit_reason || 'Completed'), esc(s.certificate_id || ''), s.record_locked ? 'Locked' : 'Active'].join(','))].join('\n')
        break
      case 'graduation':
        rows = [['Year', 'Class', 'Count'].join(','), ...years.flatMap(y => classes.map(c => { const count = filtered.filter(s => (s.updated_at ? new Date(s.updated_at).getFullYear() : null) === y && s.class === c).length; return count ? [y, esc(c), count].join(',') : null }).filter(Boolean))].join('\n')
        break
      case 'certificates':
        rows = [['#', 'Full Name', 'Adm No', 'Certificate ID', 'Type', 'Date'].join(','), ...filtered.filter(s => s.certificate_generated).map((s, i) => [i + 1, esc(s.full_name), esc(s.admission_number), esc(s.certificate_id || ''), 'Leaving Certificate', s.updated_at ? new Date(s.updated_at).toLocaleDateString() : ''].join(','))].join('\n')
        break
      case 'completion':
        rows = [['Class', 'Total Students', 'Completed', 'Transfer', 'Withdrawn', 'Expelled', 'Completion Rate'].join(','), ...classes.map(c => { const total = filtered.filter(s => s.class === c).length; if (!total) return null; const completed = filtered.filter(s => s.class === c && (!s.exit_reason || s.exit_reason === 'Completed')).length; const transferred = filtered.filter(s => s.class === c && s.exit_reason === 'Transferred').length; const withdrawn = filtered.filter(s => s.class === c && s.exit_reason === 'Withdrawn').length; const expelled = filtered.filter(s => s.class === c && s.exit_reason === 'Expelled').length; const rate = total ? ((completed / total) * 100).toFixed(1) : 0; return [esc(c), total, completed, transferred, withdrawn, expelled, `${rate}%`].join(',') }).filter(Boolean)].join('\n')
        break
      default: rows = ''
    }
    const filename = { register: `alumni_register_${currentYear}`, graduation: `graduation_list_${currentYear}`, certificates: `certificate_register_${currentYear}`, completion: `completion_report_${currentYear}` }[format]
    const blob = new Blob([rows], { type: 'text/csv' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${filename}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  const MiniPie = ({ data = [], size = 48 }) => {
    const total = data.reduce((s, d) => s + d.value, 0) || 1
    let cumulative = 0
    const slices = data.filter(d => d.value > 0).map((d, i) => {
      const pct = (d.value / total) * 100; const start = cumulative; cumulative += pct
      return { ...d, pct, start, color: d.color || ['#2563eb', '#16a34a', '#f59e0b', '#ef4444'][i % 4] }
    })
    if (!slices.length) return <div style={{ width: size, height: size, borderRadius: '50%', background: '#f1f5f9' }} />
    return <div style={{ width: size, height: size, borderRadius: '50%', background: `conic-gradient(${slices.map(s => `${s.color} ${s.start}% ${s.start + s.pct}%`).join(', ')})`, flexShrink: 0 }} />
  }

  const getRowActions = (s) => {
    const items = [
      { icon: <Eye size={13} />, label: 'View Profile', onClick: () => { setSelectedStudent(s); setView('detail') } },
      { icon: <FileText size={13} />, label: 'Generate Certificate', onClick: () => { setSelectedStudent(s); setCertModal(true) } },
      { icon: <ScrollText size={13} />, label: 'View Transcript', onClick: () => handleViewTranscript(s) },
      { icon: <Download size={13} />, label: 'Download PDF', onClick: () => handleViewTranscript(s) },
      { divider: true },
    ]
    if (!s.record_locked) {
      items.push({ icon: <Edit2 size={13} />, label: 'Edit Record', onClick: () => openEditPanel(s) })
      items.push({ icon: <Merge size={13} />, label: 'Merge Duplicates', onClick: () => { setMergeTarget(s); setMergeModal(true) } })
      items.push({ divider: true })
      items.push({ icon: <Lock size={13} />, label: 'Lock Record', onClick: () => handleLockRecord(s) })
    }
    if (!s.record_locked) {
      items.push({ icon: <RefreshCw size={13} />, label: 'Archive / Delete', onClick: () => handleReactivate(s), danger: true })
    }
    return items
  }

  if (view === 'edit' && selectedStudent) {
    const s = selectedStudent
    return (
      <div className="alumni-page">
        <div className="alumni-header">
          <div className="alumni-header-left">
            <button className="alumni-btn-ghost" onClick={() => { setView('detail'); setSelectedStudent(s) }}>
              <ChevronRight size={15} style={{ transform: 'rotate(180deg)' }} /> Back
            </button>
            <div className="alumni-avatar">{s.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}</div>
            <div>
              <h2>Edit — {s.full_name}</h2>
              <p>{s.admission_number} — {s.class}{s.stream ? ` ${s.stream}` : ''}</p>
            </div>
          </div>
          <span className="alumni-edit-notice"><AlertCircle size={13} /> All changes are logged</span>
        </div>

        <div className="alumni-card">
          <h4><User size={14} /> Identity</h4>
          <div className="alumni-form-grid">
            <div className="alumni-form-group"><label>Full Name</label><input className="alumni-input" type="text" value={editForm.full_name} onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))} /></div>
            <div className="alumni-form-group"><label>Admission Number</label><input className="alumni-input" type="text" value={editForm.admission_number} onChange={e => setEditForm(f => ({ ...f, admission_number: e.target.value }))} /></div>
            <div className="alumni-form-group"><label>Gender</label><select className="alumni-input" value={editForm.gender} onChange={e => setEditForm(f => ({ ...f, gender: e.target.value }))}><option value="">Select</option><option value="male">Male</option><option value="female">Female</option></select></div>
            <div className="alumni-form-group"><label>Date of Birth</label><input className="alumni-input" type="date" value={editForm.date_of_birth} onChange={e => setEditForm(f => ({ ...f, date_of_birth: e.target.value }))} /></div>
            <div className="alumni-form-group"><label>Nationality</label><input className="alumni-input" type="text" value={editForm.nationality} onChange={e => setEditForm(f => ({ ...f, nationality: e.target.value }))} /></div>
            <div className="alumni-form-group"><label>UPI Number</label><input className="alumni-input" type="text" value={editForm.upi_number} onChange={e => setEditForm(f => ({ ...f, upi_number: e.target.value }))} /></div>
            <div className="alumni-form-group"><label>NEMIS Number</label><input className="alumni-input" type="text" value={editForm.nemis_number} onChange={e => setEditForm(f => ({ ...f, nemis_number: e.target.value }))} /></div>
          </div>
        </div>

        <div className="alumni-card">
          <h4><BookOpen size={14} /> Academic Completion</h4>
          <div className="alumni-form-grid">
            <div className="alumni-form-group"><label>Entry Year</label><input className="alumni-input" type="number" value={editForm.entry_year} onChange={e => setEditForm(f => ({ ...f, entry_year: e.target.value }))} /></div>
            <div className="alumni-form-group"><label>Graduation Year</label><input className="alumni-input" type="number" value={editForm.exit_year} onChange={e => setEditForm(f => ({ ...f, exit_year: e.target.value }))} style={{ borderColor: editForm.exit_year !== String(s.updated_at ? new Date(s.updated_at).getFullYear() : '') ? '#ef4444' : undefined }} /><span style={{ fontSize: 10, color: '#ef4444' }}>Changing this is a major edit</span></div>
            <div className="alumni-form-group"><label>Final Class</label><input className="alumni-input" type="text" value={editForm.class} onChange={e => setEditForm(f => ({ ...f, class: e.target.value }))} /></div>
            <div className="alumni-form-group"><label>Stream</label><input className="alumni-input" type="text" value={editForm.stream} onChange={e => setEditForm(f => ({ ...f, stream: e.target.value }))} /></div>
            <div className="alumni-form-group"><label>Conduct Summary</label><input className="alumni-input" type="text" value={editForm.conduct} onChange={e => setEditForm(f => ({ ...f, conduct: e.target.value }))} /></div>
          </div>
        </div>

        <div className="alumni-card">
          <h4><LogOut size={14} /> Exit Details</h4>
          <div className="alumni-form-grid">
            <div className="alumni-form-group"><label>Exit Type</label><select className="alumni-input" value={editForm.exit_reason} onChange={e => setEditForm(f => ({ ...f, exit_reason: e.target.value }))}><option value="Completed">Completed</option><option value="Transferred">Transferred</option><option value="Withdrawn">Withdrawn</option><option value="Expelled">Expelled</option></select></div>
            <div className="alumni-form-group"><label>Exit Date</label><input className="alumni-input" type="date" value={editForm.exit_date} onChange={e => setEditForm(f => ({ ...f, exit_date: e.target.value }))} /></div>
            <div className="alumni-form-group"><label>Approved By</label><input className="alumni-input" type="text" value={editForm.approved_by} onChange={e => setEditForm(f => ({ ...f, approved_by: e.target.value }))} /></div>
          </div>
        </div>

        <div className="alumni-card">
          <h4><Phone size={14} /> Contact / Alumni Info</h4>
          <div className="alumni-form-grid">
            <div className="alumni-form-group"><label>Phone Number</label><input className="alumni-input" type="text" value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} /></div>
            <div className="alumni-form-group"><label>Email Address</label><input className="alumni-input" type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} /></div>
            <div className="alumni-form-group alumni-form-full"><label>Current Location</label><input className="alumni-input" type="text" value={editForm.current_location} onChange={e => setEditForm(f => ({ ...f, current_location: e.target.value }))} placeholder="City, County, or address" /></div>
          </div>
        </div>

        <div className="alumni-card alumni-card-danger">
          <h4><AlertTriangle size={14} /> Reason for Changes (Required)</h4>
          <div className="alumni-form-group">
            <textarea className="alumni-input" rows={3} value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} placeholder="Explain why these changes are being made. This is recorded in the audit trail." />
          </div>
        </div>

        <div className="alumni-form-actions">
          <button className="alumni-btn-secondary" onClick={() => { setView('detail'); setSelectedStudent(s) }}><ArrowLeft size={15} /> Cancel</button>
          <button className="alumni-btn-primary" onClick={handleSaveEdit} disabled={saving || !editForm.notes.trim()}>
            <Save size={15} /> {saving ? 'Saving...' : 'Save All Changes'}
          </button>
        </div>
      </div>
    )
  }

  if (view === 'detail' && selectedStudent) {
    const s = selectedStudent
    const exitYear = s.updated_at ? new Date(s.updated_at).getFullYear() : '—'
    const entryYear = s.created_at ? new Date(s.created_at).getFullYear() : '—'

    return (
      <div className="alumni-page">
        <div className="alumni-header">
          <div className="alumni-header-left">
            <button className="alumni-btn-ghost" onClick={() => { setView('list'); setSelectedStudent(null) }}>
              <ChevronRight size={15} style={{ transform: 'rotate(180deg)' }} /> Back
            </button>
            <div className="alumni-avatar">{s.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}</div>
            <div>
              <h2>{s.full_name}</h2>
              <p>{s.admission_number} — {s.class}{s.stream ? ` ${s.stream}` : ''}</p>
            </div>
          </div>
          <div className="alumni-header-right">
            {s.record_locked ? <Lock size={14} color="#94a3b8" /> : <Unlock size={14} color="#f59e0b" />}
          </div>
        </div>

        <div className="alumni-card">
          <h4>Identity</h4>
          <div className="alumni-info-grid">
            {[['Full Name', s.full_name], ['Admission Number', s.admission_number],
              ['Date of Birth', s.date_of_birth || '—'], ['Gender', s.gender || '—'],
              ['Nationality', s.nationality || '—'], ['UPI Number', s.upi_number || '—'],
              ['NEMIS Number', s.nemisis_number || '—'],
            ].filter(([, v]) => v).map(([l, v]) => (
              <div key={l} className="alumni-info-item"><label>{l}</label><span>{v}</span></div>
            ))}
          </div>
        </div>

        <div className="alumni-card">
          <h4>Academic Completion</h4>
          <div className="alumni-info-grid">
            {[['Entry Year', entryYear], ['Exit Year', exitYear],
              ['Final Class', `${s.class}${s.stream ? ` ${s.stream}` : ''}`],
              ['Conduct Summary', s.conduct || 'Satisfactory'],
            ].filter(([, v]) => v).map(([l, v]) => (
              <div key={l} className="alumni-info-item"><label>{l}</label><span>{v}</span></div>
            ))}
          </div>
        </div>

        <div className="alumni-card">
          <h4>Exit Details</h4>
          <div className="alumni-info-grid">
            {[['Exit Reason', s.exit_reason || 'Completed'],
              ['Date of Exit', s.exit_date ? fmtDate(s.exit_date) : fmtDate(s.updated_at)],
              ['Approved By', s.approved_by || 'Not recorded'],
              ['Certificate ID', s.certificate_id || 'Not generated'],
            ].filter(([, v]) => v).map(([l, v]) => (
              <div key={l} className="alumni-info-item"><label>{l}</label><span>{v}</span></div>
            ))}
          </div>
        </div>

        {s.phone || s.email || s.current_location ? (
          <div className="alumni-card">
            <h4>Contact</h4>
            <div className="alumni-info-grid">
              {[['Phone', s.phone], ['Email', s.email], ['Current Location', s.current_location]].filter(([, v]) => v).map(([l, v]) => (
                <div key={l} className="alumni-info-item"><label>{l}</label><span>{v}</span></div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="alumni-card">
          <h4>Documents & Certificates</h4>
          <div className="alumni-cert-list">
            {(['leaving', 'completion', 'transcript', 'bonafide']).map(type => {
              const label = { leaving: 'School Leaving Certificate', completion: 'Completion Certificate', transcript: 'Academic Transcript', bonafide: 'Bonafide Letter' }[type]
              return <button key={type} className="alumni-btn-secondary alumni-btn-sm" onClick={() => handleGenerateCertificate(s, type)}><FileText size={13} /> {label}</button>
            })}
            {s.certificate_id && <span className="alumni-cert-id"><CheckCircle size={13} /> {s.certificate_id}</span>}
          </div>
        </div>

        <div className="alumni-form-actions">
          <button className="alumni-btn-secondary" onClick={() => { setView('list'); setSelectedStudent(null) }}><ArrowLeft size={15} /> Back to Alumni</button>
          {!s.record_locked && <button className="alumni-btn-primary" onClick={() => openEditPanel(s)}><Edit2 size={15} /> Edit Record</button>}
          {!s.record_locked && <button className="alumni-btn-secondary" onClick={() => { setMergeTarget(s); setMergeModal(true) }}><Merge size={15} /> Merge</button>}
          {!s.record_locked && <button className="alumni-btn-secondary" onClick={() => handleReactivate(s)}><RefreshCw size={15} /> Restore</button>}
          {!s.record_locked && <button className="alumni-btn-secondary" onClick={() => handleLockRecord(s)}><Lock size={15} /> Lock</button>}
        </div>
      </div>
    )
  }

  return (
    <div className="alumni-page">
      {/* ── Header ── */}
      <div className="alumni-header">
        <div className="alumni-header-left">
          <div>
            <h2>Alumni & Archives</h2>
            <p>{stats.total} total &middot; {stats.thisYear} graduated {currentYear} &middot; {stats.issues} issues</p>
          </div>
        </div>
        <div className="alumni-header-right">
          <button className="alumni-btn-secondary" onClick={() => exportFormat('register')}><Download size={14} /> Export Report</button>
          <button className="alumni-btn-primary" onClick={() => { setSelectedStudent(null); setView('list') }}><GraduationCap size={14} /> Register Graduate</button>
        </div>
      </div>

      {/* ── Secondary Toolbar ── */}
      <div className="alumni-toolbar">
        <div className="alumni-toolbar-left">
          <button className="alumni-btn-ghost" onClick={() => { fetchAlumni(); fetchAuditLogs() }}><RefreshCw size={13} /> Refresh</button>
          <button className="alumni-btn-ghost" onClick={() => setShowAudit(!showAudit)}>
            <History size={13} /> {showAudit ? 'Hide Audit' : 'Audit Log'}
          </button>
        </div>
        <div className="alumni-toolbar-right">
          <button className="alumni-btn-ghost alumni-btn-sm" onClick={() => exportFormat('register')}><Download size={12} /> Register</button>
          <button className="alumni-btn-ghost alumni-btn-sm" onClick={() => exportFormat('graduation')}><Download size={12} /> Graduation</button>
          <button className="alumni-btn-ghost alumni-btn-sm" onClick={() => exportFormat('certificates')}><Download size={12} /> Certs</button>
          <button className="alumni-btn-ghost alumni-btn-sm" onClick={() => exportFormat('completion')}><Download size={12} /> Completion</button>
        </div>
      </div>

      {/* ── KPI Cards (3) ── */}
      <div className="alumni-kpi-row">
        <div className="alumni-kpi-card">
          <div className="alumni-kpi-icon blue"><GraduationCap size={18} /></div>
          <div className="alumni-kpi-body">
            <p className="alumni-kpi-label">Total Alumni</p>
            <p className="alumni-kpi-value blue">{stats.total}</p>
          </div>
        </div>
        <div className="alumni-kpi-card">
          <div className="alumni-kpi-icon green"><Calendar size={18} /></div>
          <div className="alumni-kpi-body">
            <p className="alumni-kpi-label">Graduates {currentYear}</p>
            <p className="alumni-kpi-value green">{stats.thisYear}</p>
          </div>
        </div>
        <div className="alumni-kpi-card">
          <div className="alumni-kpi-icon red"><AlertOctagon size={18} /></div>
          <div className="alumni-kpi-body">
            <p className="alumni-kpi-label">Data Issues</p>
            <p className="alumni-kpi-value red">{stats.issues}</p>
          </div>
        </div>
      </div>

      {/* ── Data Integrity Alerts (compact banner) ── */}
      {alerts.length > 0 && (
        <div className="alumni-alert-banner">
          <div className="alumni-alert-left">
            <AlertTriangle size={14} />
            <span className="alumni-alert-title">Data Integrity</span>
            <span className="alumni-alert-count">{alerts.length}</span>
          </div>
          <div className="alumni-alert-chips">
            {[...new Set(alerts.map(a => a.type))].map(type => {
              const count = alerts.filter(a => a.type === type).length
              const label = { missing_exit_date: 'Missing exit date', missing_cert: 'Missing cert', duplicate: 'Duplicates', unapproved: 'Unapproved', incomplete_history: 'Incomplete history' }[type] || type
              return <span key={type} className="alumni-alert-chip">{label}: {count}</span>
            })}
          </div>
        </div>
      )}

      {/* ── Audit Log ── */}
      {showAudit && (
        <div className="alumni-card">
          <h4><History size={14} /> Recent Audit Logs</h4>
          {auditLogs.length === 0 ? (
            <p className="alumni-empty-text">No audit records yet.</p>
          ) : (
            <div className="alumni-audit-list">
              {auditLogs.map((log, i) => (
                <div key={log.id || i} className="alumni-audit-row">
                  <span className="alumni-audit-date">{log.created_at ? new Date(log.created_at).toLocaleDateString() : ''}</span>
                  <span className="alumni-audit-action">{log.action?.replace(/_/g, ' ')}</span>
                  <span className="alumni-audit-detail">{log.details}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Unified Filter Toolbar ── */}
      <div className="alumni-filter-bar">
        <div className="alumni-search-wrap">
          <Search size={14} className="alumni-search-icon" />
          <input className="alumni-search-input" placeholder="Search name or admission number..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="alumni-filters">
          <select className="alumni-filter-select" value={filterYear} onChange={e => setFilterYear(e.target.value)}><option value="">All Years</option>{years.map(y => <option key={y} value={String(y)}>{y}</option>)}</select>
          <select className="alumni-filter-select" value={filterClass} onChange={e => setFilterClass(e.target.value)}><option value="">All Classes</option>{classes.map(c => <option key={c} value={c}>{c}</option>)}</select>
          <select className="alumni-filter-select" value={filterExit} onChange={e => setFilterExit(e.target.value)}><option value="">All Exit Types</option><option value="Completed">Completed</option><option value="Transferred">Transferred</option><option value="Withdrawn">Withdrawn</option><option value="Expelled">Expelled</option></select>
          <select className="alumni-filter-select" value={filterGender} onChange={e => setFilterGender(e.target.value)}><option value="">All Genders</option><option value="male">Male</option><option value="female">Female</option></select>
          <select className="alumni-filter-select" value={filterDataStatus} onChange={e => setFilterDataStatus(e.target.value)}><option value="">All Data Status</option><option value="clean">Clean</option><option value="flagged">Flagged</option></select>
          <select className="alumni-filter-select" value={filterCertStatus} onChange={e => setFilterCertStatus(e.target.value)}><option value="">All Certificates</option><option value="generated">Generated</option><option value="missing">Missing</option></select>
        </div>
      </div>

      {/* ── Analytics (3 compact cards) ── */}
      <div className="alumni-analytics-row">
        <div className="alumni-card alumni-analytics-card">
          <h4>Graduation Trend</h4>
          <div className="alumni-trend-bars">
            {years.slice(0, 5).map(year => {
              const count = alumni.filter(s => (s.updated_at ? new Date(s.updated_at).getFullYear() : null) === year).length
              const max = Math.max(...years.slice(0, 5).map(y => alumni.filter(s => (s.updated_at ? new Date(s.updated_at).getFullYear() : null) === y).length), 1)
              return (
                <div key={year} className="alumni-trend-row">
                  <span className="alumni-trend-label">{year}</span>
                  <div className="alumni-trend-track"><div className="alumni-trend-fill" style={{ width: `${(count / max) * 100}%` }} /></div>
                  <span className="alumni-trend-value">{count}</span>
                </div>
              )
            })}
          </div>
        </div>
        <div className="alumni-card alumni-analytics-card">
          <h4>Gender Distribution</h4>
          <div className="alumni-mini-pie-row">
            <MiniPie data={[{ label: 'Male', value: alumni.filter(s => s.gender === 'male').length, color: '#2563eb' }, { label: 'Female', value: alumni.filter(s => s.gender === 'female').length, color: '#16a34a' }]} size={56} />
            <div className="alumni-mini-legend">
              <div><span className="alumni-dot blue" />Male: {alumni.filter(s => s.gender === 'male').length}</div>
              <div><span className="alumni-dot green" />Female: {alumni.filter(s => s.gender === 'female').length}</div>
            </div>
          </div>
        </div>
        <div className="alumni-card alumni-analytics-card">
          <h4>Data Quality</h4>
          <div className="alumni-mini-pie-row">
            <MiniPie data={[{ label: 'Clean', value: alumni.filter(s => s.exit_date && s.exit_reason && s.approved_by && s.certificate_generated).length, color: '#16a34a' }, { label: 'Issues', value: alumni.filter(s => !s.exit_date || !s.exit_reason || !s.approved_by).length, color: '#ef4444' }]} size={56} />
            <div className="alumni-mini-legend">
              <div><span className="alumni-dot green" />Clean: {alumni.filter(s => s.exit_date && s.exit_reason && s.approved_by && s.certificate_generated).length}</div>
              <div><span className="alumni-dot red" />Issues: {alumni.filter(s => !s.exit_date || !s.exit_reason || !s.approved_by).length}</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Table ── */}
      {loading ? (
        <p className="alumni-loading">Loading alumni records...</p>
      ) : filtered.length === 0 ? (
        <div className="alumni-empty"><GraduationCap size={40} color="#cbd5e1" /><p>No alumni records found</p></div>
      ) : (
        <div className="alumni-table-wrap">
          <table className="alumni-table">
            <thead>
              <tr>
                <th>Full Name</th>
                <th>Adm No.</th>
                <th>Final Class</th>
                <th>Graduation Year</th>
                <th>Exit Reason</th>
                <th>Data Status</th>
                <th>Certificate</th>
                <th style={{ width: 48 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => {
                const hasIssues = !s.exit_date || !s.exit_reason || !s.approved_by
                return (
                  <tr key={s.id}>
                    <td className="alumni-td-name">{s.full_name}</td>
                    <td className="alumni-td-mono">{s.admission_number}</td>
                    <td>{s.class}{s.stream ? ` ${s.stream}` : ''}</td>
                    <td>{s.updated_at ? new Date(s.updated_at).getFullYear() : '—'}</td>
                    <td className="alumni-capitalize">{s.exit_reason || 'Completed'}</td>
                    <td>
                      <span className={`alumni-badge ${hasIssues ? 'red' : s.record_locked ? 'blue' : 'green'}`}>
                        {hasIssues ? 'Issues' : s.record_locked ? 'Locked' : 'Clean'}
                      </span>
                    </td>
                    <td>
                      {s.certificate_generated ? <span className="alumni-badge green"><CheckCircle size={11} /> Generated</span> : <span className="alumni-badge red">Missing</span>}
                    </td>
                    <td>
                      <div className="alumni-actions-cell">
                        <button className="alumni-menu-btn" onClick={() => setOpenMenuId(openMenuId === s.id ? null : s.id)}>
                          <MoreVertical size={14} />
                        </button>
                        {openMenuId === s.id && (
                          <ContextMenu items={getRowActions(s)} onClose={() => setOpenMenuId(null)} />
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Cert Modal ── */}
      {certModal && selectedStudent && (
        <div className="alumni-modal-overlay" onClick={() => setCertModal(false)}>
          <div className="alumni-modal" onClick={e => e.stopPropagation()}>
            <div className="alumni-modal-header">
              <h3>Generate Certificate — {selectedStudent.full_name}</h3>
              <button className="alumni-btn-ghost" onClick={() => setCertModal(false)}><X size={16} /></button>
            </div>
            <div className="alumni-modal-body">
              <p className="alumni-modal-desc">Each generation is logged with a unique document ID.</p>
              {['leaving', 'completion', 'transcript', 'bonafide'].map(type => {
                const label = { leaving: 'School Leaving Certificate', completion: 'Completion Certificate', transcript: 'Academic Transcript', bonafide: 'Bonafide Letter' }[type]
                const prefix = CERT_PREFIXES[type]
                return (
                  <button key={type} className="alumni-modal-cert-btn" onClick={() => handleGenerateCertificate(selectedStudent, type)}>
                    <FileText size={14} />
                    <div className="alumni-modal-cert-info"><div className="alumni-modal-cert-label">{label}</div><div className="alumni-modal-cert-id">{prefix}/{currentYear}/XXXX</div></div>
                    <CheckCircle size={14} color="#16a34a" />
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Merge Modal ── */}
      {mergeModal && mergeTarget && (
        <div className="alumni-modal-overlay" onClick={() => { setMergeModal(false); setMergeTarget(null); setMergeSource('') }}>
          <div className="alumni-modal" onClick={e => e.stopPropagation()}>
            <div className="alumni-modal-header">
              <h3>Merge Duplicate — {mergeTarget.full_name}</h3>
              <button className="alumni-btn-ghost" onClick={() => { setMergeModal(false); setMergeTarget(null); setMergeSource('') }}><X size={16} /></button>
            </div>
            <div className="alumni-modal-body">
              <p className="alumni-modal-desc">Find a duplicate record by name and merge it into this record. The source record will be deleted.</p>
              <div className="alumni-form-group"><label>Duplicate full name to merge</label><input className="alumni-input" type="text" placeholder="Type full name of duplicate..." value={mergeSource} onChange={e => setMergeSource(e.target.value)} /></div>
              {mergeSource && (() => {
                const dups = alumni.filter(s => s.full_name?.toLowerCase().trim() === mergeSource.toLowerCase().trim() && s.id !== mergeTarget.id)
                if (dups.length === 0) return <p style={{ fontSize: 12, color: '#f59e0b', marginTop: 4 }}>No matching duplicate found for &quot;{mergeSource}&quot;</p>
                return dups.map(d => <div key={d.id} className="alumni-merge-match"><UserCheck size={14} color="#f59e0b" /><span>{d.full_name} — {d.admission_number} ({d.class})</span></div>)
              })()}
              <div className="alumni-form-actions" style={{ marginTop: 12 }}>
                <button className="alumni-btn-secondary" onClick={() => { setMergeModal(false); setMergeTarget(null); setMergeSource('') }}>Cancel</button>
                <button className="alumni-btn-primary" onClick={handleMerge} disabled={!mergeSource.trim()}>Merge & Delete Source</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
