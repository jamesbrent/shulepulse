import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  GraduationCap, Search, X, Eye, FileText, Download,
  ChevronRight, Calendar, Shield, CheckCircle, RefreshCw,
  ArrowLeft, Lock, Unlock, Edit2, UserCheck, Archive,
  AlertOctagon, Copy, Merge, ScrollText, MoreVertical, AlertTriangle,
  Printer, GripHorizontal, LogOut, Clock, Award, User, BadgeCheck
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'
import { useSchool } from '../admin/useSchool'
import { fmtDate } from '../admin/fees/utils/feesHelpers'
import { buildGraduationTranscript } from '../../features/alumni/graduationTranscript'
import { useBrandingStore } from '../../features/branding/brandingStore'
import './Alumni.css'

const CERT_PREFIXES = {
  leaving: 'SP-LVC', completion: 'SP-CMP', transcript: 'SP-TRN', bonafide: 'SP-BNF',
}

const ROWS_PER_PAGE = 12

/* ─── Floating Action Panel ─── */
function FloatingActionPanel({ student, onClose, items }) {
  const [pos, setPos] = useState(() => ({ x: Math.max(16, window.innerWidth - 380), y: Math.max(80, window.innerHeight / 2 - 180) }))
  const drag = useRef({ active: false, offset: { x: 0, y: 0 } })

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  const handleMouseDown = (e) => {
    drag.current.active = true
    drag.current.offset = { x: e.clientX - pos.x, y: e.clientY - pos.y }
    document.body.style.cursor = 'grabbing'
    document.body.style.userSelect = 'none'
  }

  useEffect(() => {
    const handleMove = (e) => {
      if (!drag.current.active) return
      setPos(p => ({ x: e.clientX - drag.current.offset.x, y: e.clientY - drag.current.offset.y }))
    }
    const handleUp = () => {
      if (!drag.current.active) return
      drag.current.active = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
    return () => { document.removeEventListener('mousemove', handleMove); document.removeEventListener('mouseup', handleUp) }
  }, [])

  return createPortal(
    <div className="al-overlay" onClick={onClose}>
      <div
        className="al-float-panel"
        style={{ left: pos.x, top: pos.y }}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Actions for ${student.full_name}`}
      >
        <div className="al-float-header" onMouseDown={handleMouseDown}>
          <div className="al-float-header-info">
            <GripHorizontal size={14} className="al-float-grip" />
            <div>
              <span className="al-float-name">{student.full_name}</span>
              <span className="al-float-class">{student.class}{student.stream ? ` - ${student.stream}` : ''}</span>
            </div>
          </div>
          <button className="al-float-close" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="al-float-body">
          {items.map((item, i) => item.sep ? (
            <div key={`sep-${i}`} className="al-float-sep" />
          ) : item.hidden ? null : (
            <button
              key={i}
              className={`al-float-item ${item.danger ? 'al-float-item--danger' : ''}`}
              onClick={() => { item.onClick(); onClose() }}
              disabled={item.disabled}
            >
              {item.icon} {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body
  )
}

export default function Alumni() {
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
  const [selectedStudent, setSelectedStudent] = useState(null)
  const [view, setView] = useState('list')
  const [stats, setStats] = useState({ total: 0, thisYear: 0, archived: 0, verified: 0 })
  const [fixModal, setFixModal] = useState(false)
  const [fixForm, setFixForm] = useState({ exit_reason: '', exit_date: '', conduct: '', approved_by: '', notes: '' })
  const [certModal, setCertModal] = useState(false)
  const [certType, setCertType] = useState('leaving')
  const [previewDoc, setPreviewDoc] = useState(null)
  const [mergeModal, setMergeModal] = useState(false)
  const [mergeTarget, setMergeTarget] = useState(null)
  const [mergeSource, setMergeSource] = useState('')
  const [alertBanner, setAlertBanner] = useState(null)
  const [page, setPage] = useState(1)
  const printRef = useRef(null)
  const [actionPanel, setActionPanel] = useState(null)
  const [auditLogs, setAuditLogs] = useState([])

  useEffect(() => {
    if (profile?.school_id) fetchAlumni()
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
    const thisYear = data?.filter(s => {
      const year = s.updated_at ? new Date(s.updated_at).getFullYear() : null
      return year === Number(currentYear)
    }).length || 0
    const archived = data?.filter(s => s.status === 'alumni').length || 0
    const verified = data?.filter(s => s.certificate_generated).length || 0
    setStats({ total, thisYear, archived, verified })

    const issues = []
    data?.forEach(s => {
      if (!s.exit_date) issues.push({ type: 'missing_exit_date', student: s.full_name, id: s.id })
      if (!s.certificate_generated) issues.push({ type: 'missing_cert', student: s.full_name, id: s.id })
      if (!s.approved_by) issues.push({ type: 'unapproved', student: s.full_name, id: s.id })
    })
    const nameCounts = {}
    data?.forEach(s => { const key = s.full_name?.toLowerCase().trim(); if (key) nameCounts[key] = (nameCounts[key] || 0) + 1 })
    data?.forEach(s => { if (nameCounts[s.full_name?.toLowerCase().trim()] > 1) issues.push({ type: 'duplicate', student: s.full_name, id: s.id }) })

    if (issues.length > 0) {
      const types = [...new Set(issues.map(i => i.type))]
      const summary = types.map(t => ({
        missing_exit_date: 'missing exit dates', missing_cert: 'missing certificates',
        duplicate: 'duplicate records', unapproved: 'unapproved records',
      }[t] || t)).join(', ')
      setAlertBanner({ count: issues.length, summary })
    } else {
      setAlertBanner(null)
    }
    setLoading(false)
  }

  const years = [...new Set(alumni.map(s => s.updated_at ? new Date(s.updated_at).getFullYear() : null).filter(Boolean))].sort((a, b) => b - a)
  const classes = [...new Set(alumni.map(s => s.class).filter(Boolean))].sort()

  const filtered = alumni.filter(s => {
    if (search) {
      const q = search.toLowerCase()
      if (!s.full_name?.toLowerCase().includes(q) && !s.admission_number?.toLowerCase().includes(q)) return false
    }
    if (filterYear) { const y = s.updated_at ? new Date(s.updated_at).getFullYear() : null; if (y !== Number(filterYear)) return false }
    if (filterClass && s.class !== filterClass) return false
    if (filterExit && s.exit_reason !== filterExit) return false
    if (filterGender && s.gender !== filterGender) return false
    return true
  })

  const totalPages = Math.ceil(filtered.length / ROWS_PER_PAGE)
  const paginated = filtered.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE)

  const fetchAuditLogs = useCallback(async (studentId) => {
    if (!studentId) return
    const { data } = await supabase
      .from('audit_logs')
      .select('action, details, performed_by, created_at')
      .eq('details->>entity_id', String(studentId))
      .order('created_at', { ascending: false })
      .limit(10)
    setAuditLogs(data || [])
  }, [])

  useEffect(() => { setPage(1) }, [search, filterYear, filterClass, filterExit, filterGender])

  useEffect(() => {
    if (view === 'detail' && selectedStudent) fetchAuditLogs(selectedStudent.id)
  }, [view, selectedStudent, fetchAuditLogs])

  const genDocId = (prefix) => `${prefix}/${currentYear}/${String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0')}`

  const handleExportPDF = (s) => {
    const prefix = CERT_PREFIXES.leaving
    const docId = genDocId(prefix)
    const date = new Date().toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' })
    const schName = schoolName || school?.name || 'Our School'
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Alumni Record — ${s.full_name}</title><style>@page{size:A4;margin:18mm 20mm}body{font-family:'Times New Roman',serif;color:#111;line-height:1.6}table{width:100%;border-collapse:collapse;margin:12px 0}td{padding:6px 8px;border:1px solid #ccc;font-size:10pt}td:first-child{background:#f9f9f9;font-weight:600;width:35%}h2{text-align:center;color:#1e3a5f;margin-bottom:4px}.meta{text-align:center;color:#666;font-size:9pt;margin-bottom:20px;border-bottom:2px solid #1e3a5f;padding-bottom:10px}.sig{display:flex;justify-content:space-between;margin-top:32px}.sig div{text-align:center;width:45%}.sig .line{width:120px;border-top:1px solid #333;margin:0 auto 4px}.sig .label{font-size:8pt;font-weight:600;color:#1e3a5f}@media print{*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important}body{margin:0}}</style></head><body><div class="meta"><h2>${schName}</h2><div>Document ID: ${docId} | Date: ${date}</div></div><h2>ALUMNI RECORD</h2><table><tr><td>Full Name</td><td>${s.full_name}</td></tr><tr><td>Admission Number</td><td>${s.admission_number || '—'}</td></tr><tr><td>Final Class</td><td>${s.class}${s.stream ? ' ' + s.stream : ''}</td></tr><tr><td>Gender</td><td>${s.gender || '—'}</td></tr><tr><td>Exit Reason</td><td>${s.exit_reason || 'Completed'}</td></tr><tr><td>Exit Date</td><td>${s.exit_date ? fmtDate(s.exit_date) : '—'}</td></tr><tr><td>Certificate Status</td><td>${s.certificate_generated ? 'Generated (' + (s.certificate_id || docId) + ')' : 'Not generated'}</td></tr></table><div class="sig"><div><div class="line"></div><div class="label">Registrar</div></div><div><div class="line"></div><div class="label">Principal</div></div></div></body></html>`
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `Alumni_${s.admission_number || s.full_name.replace(/\s+/g, '_')}.html`; a.click()
    URL.revokeObjectURL(url)
  }

  const buildAlumniDocument = (s, type) => {
    const label = { leaving: 'School Leaving Certificate', completion: 'Completion Certificate', transcript: 'Academic Transcript', bonafide: 'Bonafide Letter' }[type] || 'Document'
    const prefix = CERT_PREFIXES[type]
    const docId = genDocId(prefix)
    const date = new Date().toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' })
    const schName = schoolName || school?.name || 'Our School'
    const schMotto = school?.motto || 'Excellence in Education'
    const schAddress = school?.address || 'P.O. Box 123, Nairobi'
    const schPhone = school?.phone || '+254 700 000 000'
    const logoHtml = logoUrl
      ? `<img src="${logoUrl}" style="height:60px;width:auto;margin-bottom:6px" />`
      : `<div style="width:60px;height:60px;background:#1e3a5f;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 6px;color:#fff;font-size:24px;font-weight:700">${schName[0]}</div>`

    const headerBlock = `<div style="text-align:center;margin-bottom:20px;border-bottom:2px solid #1e3a5f;padding-bottom:12px">${logoHtml}<div style="font-size:16pt;font-weight:700;color:#1e3a5f">${schName}</div><div style="font-size:9pt;color:#666;font-style:italic;">"${schMotto}"</div><div style="font-size:8pt;color:#888">${schAddress} | Tel: ${schPhone}</div></div>`
    const qrBlock = `<div style="display:flex;justify-content:space-between;align-items:start;margin:16px 0"><div><div style="font-size:8pt;color:#888"><strong>Doc ID:</strong> ${docId}</div><div style="font-size:8pt;color:#888"><strong>Date:</strong> ${date}</div></div><div style="text-align:center"><img src="https://api.qrserver.com/v1/create-qr-code/?size=60x60&data=https://shulepulse.com/verify/${docId}" style="width:60px;height:60px"/><div style="font-size:6pt;color:#999">Scan to verify</div></div></div>`
    const signatureBlock = `<div style="display:flex;justify-content:space-between;margin-top:28px"><div style="text-align:center;width:45%"><div style="width:120px;border-top:1px solid #333;margin:0 auto 4px"></div><div style="font-size:8pt;font-weight:600;color:#1e3a5f">Registrar</div></div><div style="text-align:center;width:45%"><div style="width:120px;border-top:1px solid #333;margin:0 auto 4px"></div><div style="font-size:8pt;font-weight:600;color:#1e3a5f">Principal</div></div></div>`
    const watermark = `<div style="position:absolute;top:45%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);font-size:48pt;font-weight:700;color:rgba(30,58,95,0.04);pointer-events:none;white-space:nowrap">OFFICIAL DOCUMENT</div>`
    const tr = (l, v) => `<tr><td style="padding:4px 8px;border:1px solid #ccc;background:#f9f9f9;font-size:9pt;font-weight:600;width:35%">${l}</td><td style="padding:4px 8px;border:1px solid #ccc;font-size:9pt">${v || '—'}</td></tr>`
    const entryYear = s.created_at ? new Date(s.created_at).getFullYear() : '—'

    const body = {
      leaving: `<div style="font-size:13pt;font-weight:700;text-align:center;color:#1e3a5f;margin:16px 0 8px">SCHOOL LEAVING CERTIFICATE</div>
        <div style="font-size:9pt;text-align:right">Date: ${date}</div><div style="font-size:9pt;color:#888;margin-bottom:12px">Ref: ${docId}</div>
        <div style="font-size:9pt;margin-bottom:8px">This is to certify that <strong>${s.full_name}</strong> (Adm No: ${s.admission_number}) was a bonafide student of ${schName}.</div>
        <table style="width:100%;border-collapse:collapse;margin:12px 0">${tr('Full Name', s.full_name)}${tr('Admission Number', s.admission_number)}${tr('Date of Birth', s.date_of_birth || '—')}${tr('Gender', s.gender || '—')}${tr('Last Class', s.class + (s.stream ? ' ' + s.stream : ''))}${tr('Exit Date', s.exit_date ? new Date(s.exit_date).toLocaleDateString('en-KE', {day:'numeric', month:'long', year:'numeric'}) : date)}${tr('Exit Reason', s.exit_reason || 'Completed')}${tr('Conduct', s.conduct || 'Satisfactory')}</table>
        <div style="font-size:9pt;margin-top:6px;text-align:justify">Throughout their enrollment at ${schName}, ${s.full_name} conducted well and fulfilled all academic requirements.</div>`,

      completion: `<div style="font-size:13pt;font-weight:700;text-align:center;color:#1e3a5f;margin:16px 0 8px">COMPLETION CERTIFICATE</div>
        <div style="font-size:9pt;text-align:right">Date: ${date}</div><div style="font-size:9pt;color:#888;margin-bottom:12px">Ref: ${docId}</div>
        <table style="width:100%;border-collapse:collapse;margin:12px 0">${tr('Full Name', s.full_name)}${tr('Admission Number', s.admission_number)}${tr('Date of Birth', s.date_of_birth || '—')}${tr('Gender', s.gender || '—')}${tr('Class', s.class + (s.stream ? ' ' + s.stream : ''))}${tr('Graduation Year', String(currentYear))}${tr('Status', 'Completed')}</table>
        <div style="font-size:9pt;margin-top:6px;text-align:justify">This certifies that ${s.full_name} has successfully completed the academic program at ${schName}.</div>`,

      transcript: `<div style="font-size:13pt;font-weight:700;text-align:center;color:#1e3a5f;margin:16px 0 8px">ACADEMIC TRANSCRIPT</div>
        <div style="font-size:9pt;text-align:right">Date: ${date}</div><div style="font-size:9pt;color:#888;margin-bottom:12px">Ref: ${docId}</div>
        <table style="width:100%;border-collapse:collapse;margin:12px 0">${tr('Full Name', s.full_name)}${tr('Admission Number', s.admission_number)}${tr('Date of Birth', s.date_of_birth || '—')}${tr('Gender', s.gender || '—')}${tr('Entry Year', entryYear)}${tr('Exit Year', s.updated_at ? new Date(s.updated_at).getFullYear() : currentYear)}${tr('Final Class', s.class + (s.stream ? ' ' + s.stream : ''))}${tr('Conduct', s.conduct || 'Satisfactory')}</table>
        <div style="font-size:9pt;margin-top:6px;text-align:justify">This academic transcript is issued by ${schName} as a record of student's academic history.</div>`,

      bonafide: `<div style="font-size:13pt;font-weight:700;text-align:center;color:#1e3a5f;margin:16px 0 8px">BONAFIDE STUDENT LETTER</div>
        <div style="font-size:9pt;text-align:right">Date: ${date}</div><div style="font-size:9pt;color:#888;margin-bottom:12px">Ref: ${docId}</div>
        <div style="font-size:9pt;margin-bottom:8px">To Whom It May Concern,</div>
        <div style="font-size:10pt;font-weight:600;margin-bottom:8px">RE: BONAFIDE STUDENT LETTER — ${s.full_name.toUpperCase()}</div>
        <table style="width:100%;border-collapse:collapse;margin:12px 0">${tr('Full Name', s.full_name)}${tr('Admission Number', s.admission_number)}${tr('Date of Birth', s.date_of_birth || '—')}${tr('Gender', s.gender || '—')}${tr('Final Class', s.class + (s.stream ? ' ' + s.stream : ''))}${tr('Year', currentYear)}${tr('Date Issued', date)}</table>
        <div style="font-size:9pt;margin-top:6px;text-align:justify">This certifies that ${s.full_name} was a bonafide student of ${schName}. This letter is issued for official purposes.</div>`,
    }[type]

    const html = `<div style="position:relative;background:#fff;width:210mm;padding:20mm 22mm;font-family:'Times New Roman',Times,serif;color:#111;line-height:1.5;margin:0 auto">${watermark}${headerBlock}${qrBlock}${body}${signatureBlock}</div>`
    return { title: label, docId, html }
  }

  const handleViewTranscript = async (s) => {
    try {
      const doc = await buildGraduationTranscript(s, school, logoUrl, profile?.id)
      const w = window.open('', '_blank')
      if (!w) return
      w.document.write(`<html><head><title>Transcript — ${s.full_name}</title><style>@page{size:A4;margin:18mm 20mm}*{margin:0;padding:0;box-sizing:border-box}body{background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}</style></head><body>${doc.html}</body></html>`)
      w.document.close()
      w.onload = () => { w.focus(); w.print() }
    } catch (e) { alert('Failed to generate transcript: ' + e.message) }
  }

  const handleReactivate = async (s) => {
    if (s.record_locked) { alert('Record is locked.'); return }
    if (!window.confirm(`Reactivate ${s.full_name} to active students?`)) return
    await supabase.from('students').update({ status: 'active', updated_at: new Date().toISOString(), updated_by: profile?.id }).eq('id', s.id)
    await supabase.from('audit_logs').insert({
      school_id: profile.school_id, action: 'student_reactivated',
      details: { message: `Student ${s.full_name} (${s.admission_number}) reactivated`, entity_type: 'student', entity_id: s.id },
      performed_by: profile?.id,
    })
    fetchAlumni()
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
    fetchAlumni()
  }

  const handleMerge = async () => {
    const source = alumni.find(s => s.full_name?.toLowerCase().trim() === mergeSource.toLowerCase().trim() && s.id !== mergeTarget.id)
    if (!source) { alert('No matching duplicate found.'); return }
    if (!window.confirm(`Merge ${source.full_name} (${source.admission_number}) into ${mergeTarget.full_name}? Source will be deleted.`)) return
    await supabase.from('audit_logs').insert({
      school_id: profile.school_id, action: 'alumni_merged',
      details: { message: `Merged ${source.full_name} into ${mergeTarget.full_name}`, entity_type: 'student', entity_id: mergeTarget.id },
      performed_by: profile?.id,
    })
    await supabase.from('students').delete().eq('id', source.id)
    setMergeModal(false); setMergeTarget(null); setMergeSource('')
    fetchAlumni(); alert('Duplicate merged and source deleted.')
  }

  const openFixModal = (s) => {
    if (s.record_locked) { alert('Record is locked.'); return }
    setFixForm({
      exit_reason: s.exit_reason || 'Completed',
      exit_date: s.exit_date ? s.exit_date.slice(0, 10) : (s.updated_at ? s.updated_at.slice(0, 10) : ''),
      conduct: s.conduct || 'Satisfactory', approved_by: s.approved_by || '', notes: '',
    })
    setSelectedStudent(s); setFixModal(true)
  }

  const handleFixSubmit = async () => {
    if (!window.confirm(`Save corrections for ${selectedStudent.full_name}?`)) return
    const changed = {
      ...(fixForm.exit_reason !== selectedStudent.exit_reason && { exit_reason: fixForm.exit_reason }),
      ...(fixForm.exit_date !== (selectedStudent.exit_date ? selectedStudent.exit_date.slice(0, 10) : '') && { exit_date: fixForm.exit_date || null }),
      ...(fixForm.conduct !== (selectedStudent.conduct || 'Satisfactory') && { conduct: fixForm.conduct }),
      ...(fixForm.approved_by !== (selectedStudent.approved_by || '') && { approved_by: fixForm.approved_by }),
      updated_at: new Date().toISOString(), updated_by: profile?.id,
    }
    if (Object.keys(changed).length <= 2) { alert('No changes detected.'); return }
    await supabase.from('students').update(changed).eq('id', selectedStudent.id)
    await supabase.from('audit_logs').insert({
      school_id: profile.school_id, action: 'alumni_record_corrected',
      details: { message: `Corrections for ${selectedStudent.full_name}`, entity_type: 'student', entity_id: selectedStudent.id },
      performed_by: profile?.id,
    })
    setFixModal(false); setSelectedStudent(null); fetchAlumni(); alert('Corrections saved with audit trail.')
  }

  const exportCSV = () => {
    const esc = v => `"${(v || '').replace(/"/g, '""')}"`
    const header = '#,Full Name,Adm No,Class,Gender,Grad Year,Exit Reason,Certificate ID,Status'
    const rows = filtered.map((s, i) => [i + 1, esc(s.full_name), esc(s.admission_number), esc(`${s.class}${s.stream ? ' ' + s.stream : ''}`), esc(s.gender), s.updated_at ? new Date(s.updated_at).getFullYear() : '', esc(s.exit_reason || 'Completed'), esc(s.certificate_id || ''), s.record_locked ? 'Locked' : 'Active'].join(','))
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `alumni_register_${currentYear}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const PieChart = ({ data = [], size = 100 }) => {
    const total = data.reduce((s, d) => s + d.value, 0) || 1
    let cumulative = 0
    const slices = data.filter(d => d.value > 0).map((d, i) => {
      const pct = (d.value / total) * 100
      const start = cumulative; cumulative += pct
      return { ...d, pct, start, color: d.color || ['#2563EB', '#16A34A', '#CA8A04', '#DC2626', '#7C3AED', '#0891B2'][i % 6] }
    })
    if (!slices.length) return <div style={{ width: size, height: size, borderRadius: '50%', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#94A3B8' }}>No data</div>
    const conic = slices.map(s => `${s.color} ${s.start}% ${s.start + s.pct}%`).join(', ')
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: size, height: size, borderRadius: '50%', background: `conic-gradient(${conic})`, flexShrink: 0 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11 }}>
          {slices.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0 }} />
              <span style={{ color: '#64748B' }}>{s.label}</span>
              <span style={{ fontWeight: 600, color: '#0F172A' }}>{s.value}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const avatarBg = (name) => {
    const colors = ['#2563EB', '#7C3AED', '#16A34A', '#CA8A04', '#DC2626', '#0891B2']
    let hash = 0; for (const c of (name || '')) hash = c.charCodeAt(0) + ((hash << 5) - hash)
    return colors[Math.abs(hash) % colors.length]
  }

  const exitColor = (reason) => {
    const m = { Completed: '#16A34A', Transferred: '#CA8A04', Withdrawn: '#EF4444', Expelled: '#DC2626' }
    return m[reason] || '#64748B'
  }

  // ---- Detail view content (rendered conditionally inside the single return below) ----
  const renderDetailView = () => {
    const s = selectedStudent
    const exitYear = s.updated_at ? new Date(s.updated_at).getFullYear() : '—'
    const entryYear = s.created_at ? new Date(s.created_at).getFullYear() : '—'
    const hasCert = s.certificate_generated && s.certificate_id

    const certItems = ['leaving', 'completion', 'transcript', 'bonafide']

    const infoField = (label, value, icon) => (
      <div className="al-info-row">
        <div className="al-info-icon">{icon}</div>
        <div className="al-info-text">
          <span className="al-info-label">{label}</span>
          <span className="al-info-value">{value || 'Not recorded'}</span>
        </div>
      </div>
    )

    return (
      <>
        <div className="al-dossier-header">
          <div className="al-dossier-avatar" style={{ background: avatarBg(s.full_name) }}>
            {s.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div className="al-dossier-summary">
            <h2 className="al-dossier-name">{s.full_name}</h2>
            <p className="al-dossier-meta">
              <span className="al-dossier-adm">{s.admission_number}</span>
              <span className="al-dossier-divider">|</span>
              <span className="al-dossier-class"><GraduationCap size={13} /> {s.class}{s.stream ? ` ${s.stream}` : ''}</span>
            </p>
            <div className="al-dossier-badges">
              <span className="al-badge al-badge--success"><CheckCircle size={12} /> Graduated</span>
              <span className="al-badge al-badge--info"><Calendar size={12} /> {s.exit_date ? fmtDate(s.exit_date) : 'N/A'}</span>
              <span className={`al-badge ${s.record_locked ? 'al-badge--danger' : 'al-badge--warning'}`}>
                {s.record_locked ? <Lock size={12} /> : <Unlock size={12} />}
                {s.record_locked ? ' Locked' : ' Active'}
              </span>
              {hasCert && <span className="al-badge al-badge--success"><BadgeCheck size={12} /> Cert Issued</span>}
            </div>
          </div>
          <div className="al-dossier-actions">
            <button className="al-btn al-btn--xs al-btn--outline" onClick={() => { handleExportPDF(s) }} title="Print Profile"><Printer size={13} /></button>
            <button className="al-btn al-btn--xs al-btn--outline" onClick={() => { setCertType('leaving'); setCertModal(true) }} title="Generate Certificate"><FileText size={13} /></button>
            {!s.record_locked && (
              <button className="al-btn al-btn--xs al-btn--outline al-btn--danger-outline" onClick={() => handleLockRecord(s)} title="Lock Record"><Lock size={13} /></button>
            )}
          </div>
        </div>

        <div className="al-dossier-grid">
          <div className="al-dossier-col al-dossier-col--main">
            {/* Identity */}
            <div className="al-dossier-card">
              <div className="al-dossier-card-head">
                <User size={15} /> <span>Identity</span>
              </div>
              <div className="al-dossier-card-body">
                {infoField('Full Name', s.full_name, <User size={14} />)}
                {infoField('Admission Number', s.admission_number, <FileText size={14} />)}
                {infoField('Date of Birth', s.date_of_birth, <Calendar size={14} />)}
                {infoField('Gender', s.gender, <UserCheck size={14} />)}
                {infoField('Nationality', s.nationality, <Shield size={14} />)}
                {infoField('UPI Number', s.upi_number, <BadgeCheck size={14} />)}
              </div>
            </div>

            {/* Academic Completion */}
            <div className="al-dossier-card">
              <div className="al-dossier-card-head">
                <GraduationCap size={15} /> <span>Academic Completion</span>
              </div>
              <div className="al-dossier-card-body">
                <div className="al-progress-wrap">
                  <div className="al-progress-bar">
                    <div className="al-progress-fill" style={{ width: '100%' }} />
                  </div>
                  <span className="al-progress-label">Program Completed</span>
                </div>
                {infoField('Entry Year', String(entryYear), <Calendar size={14} />)}
                {infoField('Exit Year', String(exitYear), <Calendar size={14} />)}
                {infoField('Final Class', `${s.class}${s.stream ? ` ${s.stream}` : ''}`, <GraduationCap size={14} />)}
                {infoField('Conduct Summary', s.conduct || 'Satisfactory', <Shield size={14} />)}
              </div>
            </div>

            {/* Exit Details */}
            <div className="al-dossier-card">
              <div className="al-dossier-card-head">
                <LogOut size={15} /> <span>Exit Details</span>
              </div>
              <div className="al-dossier-card-body">
                {infoField('Exit Reason', s.exit_reason || 'Completed', <LogOut size={14} />)}
                {infoField('Date of Exit', s.exit_date ? fmtDate(s.exit_date) : fmtDate(s.updated_at), <Calendar size={14} />)}
                {infoField('Approved By', s.approved_by || 'Not recorded', <UserCheck size={14} />)}
                <div className="al-info-row">
                  <div className="al-info-icon"><BadgeCheck size={14} /></div>
                  <div className="al-info-text">
                    <span className="al-info-label">Certificate ID</span>
                    {hasCert ? (
                      <span className="al-cert-badge"><CheckCircle size={12} /> {s.certificate_id}</span>
                    ) : (
                      <span className="al-cert-badge al-cert-badge--pending"><AlertTriangle size={12} /> Not generated</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="al-dossier-col al-dossier-col--side">
            {/* Documents & Certificates */}
            <div className="al-dossier-card">
              <div className="al-dossier-card-head">
                <FileText size={15} /> <span>Documents & Certificates</span>
              </div>
              <div className="al-dossier-card-body al-dossier-docs">
                {certItems.map(type => {
                  const label = { leaving: 'School Leaving Certificate', completion: 'Completion Certificate', transcript: 'Academic Transcript', bonafide: 'Bonafide Letter' }[type]
                  return (
                    <button key={type} className="al-dossier-doc-btn" onClick={() => setPreviewDoc({ student: s, type, doc: buildAlumniDocument(s, type) })}>
                      <FileText size={15} />
                      <span>{label}</span>
                      <ChevronRight size={14} />
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Audit Trail */}
            <div className="al-dossier-card">
              <div className="al-dossier-card-head">
                <Clock size={15} /> <span>Audit Trail</span>
              </div>
              <div className="al-dossier-card-body">
                {auditLogs.length === 0 ? (
                  <p className="al-dossier-empty">No audit records found.</p>
                ) : (
                  <div className="al-audit-list">
                    {auditLogs.map((log, i) => (
                      <div key={i} className="al-audit-item">
                        <div className="al-audit-dot" />
                        <div className="al-audit-content">
                          <span className="al-audit-action">
                            {log.action === 'student_promoted' && 'Promoted'}
                            {log.action === 'student_demoted' && 'Demoted'}
                            {log.action === 'student_graduated' && 'Graduated'}
                            {log.action === 'student_graduated_manual' && 'Marked Alumni'}
                            {log.action === 'student_reactivated' && 'Reactivated'}
                            {log.action === 'record_locked' && 'Record Locked'}
                            {log.action === 'certificate_generated' && 'Certificate Generated'}
                            {log.action === 'data_corrected' && 'Data Corrected'}
                            {log.action === 'student_merged' && 'Merged'}
                            {!['student_promoted', 'student_demoted', 'student_graduated', 'student_graduated_manual', 'student_reactivated', 'record_locked', 'certificate_generated', 'data_corrected', 'student_merged'].includes(log.action) && log.action}
                          </span>
                          <span className="al-audit-date">{log.created_at ? fmtDate(log.created_at) : '—'}</span>
                        </div>
                        <span className="al-audit-by">{log.performed_by ? `by ${log.performed_by}` : 'System'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="al-dossier-command-bar">
          <button className="al-btn al-btn--ghost" onClick={() => { setView('list'); setSelectedStudent(null) }}>
            <ArrowLeft size={15} /> Back to Alumni
          </button>
          <div className="al-dossier-command-right">
            {!s.record_locked && (
              <>
                <button className="al-btn al-btn--outline al-btn--sm" onClick={() => openFixModal(s)}>
                  <Edit2 size={14} /> Fix Data
                </button>
                <button className="al-btn al-btn--outline al-btn--sm" onClick={() => { setMergeTarget(s); setMergeModal(true) }}>
                  <Merge size={14} /> Merge Duplicates
                </button>
                <button className="al-btn al-btn--outline al-btn--sm" onClick={() => handleReactivate(s)}>
                  <RefreshCw size={14} /> Restore
                </button>
                <button className="al-btn al-btn--outline al-btn--sm al-btn--danger-outline" onClick={() => handleLockRecord(s)}>
                  <Lock size={14} /> Lock Record
                </button>
              </>
            )}
          </div>
        </div>
      </>
    )
  }

  // ---- List view content (rendered conditionally inside the single return below) ----
  const renderListView = () => (
    <>
      <div className="al-header">
        <div>
          <p className="al-header-sub">{stats.total} total graduates · {stats.thisYear} this year</p>
        </div>
        <div className="al-header-right">
          <button className="al-btn al-btn--outline" onClick={fetchAlumni}>
            <RefreshCw size={14} /> Refresh
          </button>
          <button className="al-btn al-btn--outline" onClick={exportCSV}>
            <Download size={14} /> Register
          </button>
          <button className="al-btn al-btn--outline" onClick={exportCSV}>
            <GraduationCap size={14} /> Graduation
          </button>
          <button className="al-btn al-btn--outline" onClick={() => {
            const certs = alumni.filter(s => s.certificate_generated)
            if (certs.length === 0) { alert('No certificates generated yet.'); return }
            const rows = ['Full Name,Adm No,Certificate ID']
            certs.forEach(s => rows.push(`"${s.full_name}","${s.admission_number}","${s.certificate_id || ''}"`))
            const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a'); a.href = url; a.download = `certificates_${currentYear}.csv`; a.click()
            URL.revokeObjectURL(url)
          }}>
            <FileText size={14} /> Export Certs
          </button>
        </div>
      </div>

      <div className="al-kpi-grid">
        {[
          { label: 'Total Graduates', value: stats.total, color: '#2563EB', bg: '#EFF6FF', icon: <GraduationCap size={20} /> },
          { label: `Graduates ${currentYear}`, value: stats.thisYear, color: '#16A34A', bg: '#F0FDF4', icon: <Calendar size={20} /> },
          { label: 'Archived Alumni', value: stats.archived, color: '#7C3AED', bg: '#EDE9FE', icon: <Archive size={20} /> },
          { label: 'Certificates Issued', value: stats.verified, color: '#0891B2', bg: '#ECFEFF', icon: <CheckCircle size={20} /> },
        ].map(stat => (
          <div className="al-kpi" key={stat.label}>
            <div className="al-kpi-icon" style={{ background: stat.bg, color: stat.color }}>{stat.icon}</div>
            <div className="al-kpi-content">
              <p className="al-kpi-value" style={{ color: stat.color }}>{stat.value}</p>
              <p className="al-kpi-label">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {alertBanner && (
        <div className="al-alert-banner">
          <div className="al-alert-banner-left">
            <AlertTriangle size={15} />
            <span><strong>{alertBanner.count} issues</strong> need attention — {alertBanner.summary}</span>
          </div>
          <button className="al-alert-banner-close" onClick={() => setAlertBanner(null)} aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      )}

      <div className="al-chart-row">
        <div className="al-card al-chart-card">
          <h4>Graduation Trend</h4>
          <div className="al-chart-bars">
            {years.slice(0, 6).map(year => {
              const count = alumni.filter(s => (s.updated_at ? new Date(s.updated_at).getFullYear() : null) === year).length
              const max = Math.max(...years.slice(0, 6).map(y => alumni.filter(s => (s.updated_at ? new Date(s.updated_at).getFullYear() : null) === y).length), 1)
              return (
                <div key={year} className="al-bar-row">
                  <span className="al-bar-label">{year}</span>
                  <div className="al-bar-track">
                    <div className="al-bar-fill" style={{ width: `${(count / max) * 100}%` }} />
                  </div>
                  <span className="al-bar-value">{count}</span>
                </div>
              )
            })}
          </div>
        </div>
        <div className="al-card al-chart-card">
          <h4>Completion by Class</h4>
          <div className="al-chart-bars">
            {classes.slice(0, 6).map(c => {
              const total = alumni.filter(s => s.class === c).length
              const completed = alumni.filter(s => s.class === c && (!s.exit_reason || s.exit_reason === 'Completed')).length
              const rate = total ? ((completed / total) * 100).toFixed(0) : 0
              if (!total) return null
              return (
                <div key={c} className="al-bar-row">
                  <span className="al-bar-label">{c}</span>
                  <div className="al-bar-track">
                    <div className="al-bar-fill" style={{
                      width: `${rate}%`,
                      background: Number(rate) >= 80 ? '#16A34A' : Number(rate) >= 50 ? '#CA8A04' : '#EF4444'
                    }} />
                  </div>
                  <span className="al-bar-value">{rate}%</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="al-toolbar">
        <div className="al-toolbar-left">
          <div className="al-search-wrap">
            <Search size={14} className="al-search-icon" />
            <input className="al-search-input" placeholder="Search name or admission no..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="al-select" value={filterYear} onChange={e => setFilterYear(e.target.value)}>
            <option value="">All Years</option>
            {years.map(y => <option key={y} value={String(y)}>{y}</option>)}
          </select>
          <select className="al-select" value={filterClass} onChange={e => setFilterClass(e.target.value)}>
            <option value="">All Classes</option>
            {classes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="al-select" value={filterExit} onChange={e => setFilterExit(e.target.value)}>
            <option value="">All Exits</option>
            <option value="Completed">Completed</option>
            <option value="Transferred">Transferred</option>
            <option value="Withdrawn">Withdrawn</option>
            <option value="Expelled">Expelled</option>
          </select>
          <select className="al-select" value={filterGender} onChange={e => setFilterGender(e.target.value)}>
            <option value="">All Genders</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </div>
        <div className="al-toolbar-right">
          <span className="al-toolbar-count">{filtered.length} records</span>
        </div>
      </div>

      {loading ? (
        <div className="al-loading"><div className="al-spinner" /> Loading alumni records...</div>
      ) : filtered.length === 0 ? (
        <div className="al-empty">
          <GraduationCap size={40} color="#CBD5E1" />
          <p>No alumni records found</p>
        </div>
      ) : (
        <>
          <div className="al-table-wrap">
            <div className="al-table-scroll">
              <table className="al-table">
                <thead>
                  <tr>
                    <th className="al-th--student">Alumni</th>
                    <th className="al-th--class">Final Class</th>
                    <th className="al-th--year">Graduation Year</th>
                    <th className="al-th--exit">Exit Reason</th>
                    <th className="al-th--status">Status</th>
                    <th className="al-th--cert">Certificate</th>
                    <th className="al-th--actions"></th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(s => (
                    <tr key={s.id}>
                      <td>
                        <div className="al-student-cell">
                          <div className="al-avatar al-avatar--sm" style={{ background: avatarBg(s.full_name) }}>
                            {s.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                          </div>
                          <div className="al-student-info">
                            <span className="al-student-name">{s.full_name}</span>
                            <span className="al-student-adm">{s.admission_number}</span>
                          </div>
                        </div>
                      </td>
                      <td>{s.class}{s.stream ? ` ${s.stream}` : ''}</td>
                      <td>{s.updated_at ? new Date(s.updated_at).getFullYear() : '—'}</td>
                      <td>
                        <span className="al-exit-badge" style={{ color: exitColor(s.exit_reason || 'Completed') }}>
                          {s.exit_reason || 'Completed'}
                        </span>
                      </td>
                      <td>
                        <span className={`al-status-badge ${s.record_locked ? 'al-status-badge--locked' : 'al-status-badge--active'}`}>
                          {s.record_locked ? 'Locked' : 'Active'}
                        </span>
                      </td>
                      <td>
                        {s.certificate_generated ? (
                          <span className="al-cert-badge"><CheckCircle size={11} /> Generated</span>
                        ) : (
                          <span className="al-cert-badge al-cert-badge--none">None</span>
                        )}
                      </td>
                      <td>
                        <button
                          className="al-dd-trigger"
                          onClick={() => setActionPanel(s)}
                          aria-label="Actions"
                        >
                          <MoreVertical size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {totalPages > 1 && (
            <div className="al-pagination">
              <span className="al-page-info">
                Showing {((page - 1) * ROWS_PER_PAGE) + 1}–{Math.min(page * ROWS_PER_PAGE, filtered.length)} of {filtered.length}
              </span>
              <div className="al-page-btns">
                <button className="al-btn al-btn--xs" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Prev</button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  let p
                  if (totalPages <= 7) p = i + 1
                  else if (page <= 4) p = i + 1
                  else if (page >= totalPages - 3) p = totalPages - 6 + i
                  else p = page - 3 + i
                  return (
                    <button key={p} className={`al-btn al-btn--xs ${p === page ? 'al-btn--page-active' : ''}`} onClick={() => setPage(p)}>{p}</button>
                  )
                })}
                <button className="al-btn al-btn--xs" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
              </div>
            </div>
          )}
        </>
      )}
    </>
  )

  return (
    <div className="al-root">
      {view === 'detail' && selectedStudent ? renderDetailView() : renderListView()}

      {/* ---- Modals: always rendered, regardless of active view ---- */}

      {certModal && selectedStudent && (
        <div className="al-modal-overlay" onClick={() => setCertModal(false)}>
          <div className="al-modal" onClick={e => e.stopPropagation()}>
            <div className="al-modal-head">
              <h3>Generate Certificate — {selectedStudent.full_name}</h3>
              <button className="al-modal-close" onClick={() => setCertModal(false)}><X size={16} /></button>
            </div>
            <div className="al-modal-body">
              <p style={{ marginBottom: 12 }}>Select a document type to preview and download.</p>
              {['leaving', 'completion', 'transcript', 'bonafide'].map(type => (
                <button key={type} className="al-btn al-btn--outline al-btn--full" style={{ marginBottom: 8, justifyContent: 'flex-start' }} onClick={() => {
                  setPreviewDoc({ student: selectedStudent, type, doc: buildAlumniDocument(selectedStudent, type) })
                  setCertModal(false)
                }}>
                  <FileText size={14} />
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>{{
                      leaving: 'School Leaving Certificate', completion: 'Completion Certificate',
                      transcript: 'Academic Transcript', bonafide: 'Bonafide Letter'
                    }[type]}</div>
                    <div style={{ fontSize: 11, color: '#64748B' }}>{CERT_PREFIXES[type]}/{currentYear}/XXXX</div>
                  </div>
                  <CheckCircle size={14} color="#16A34A" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {previewDoc && (() => {
        const handlePrint = () => {
          const printContent = printRef.current?.innerHTML
          if (!printContent) return
          const w = window.open('', '_blank')
          if (!w) return
          const styles = [
            '@page { size: A4; margin: 18mm 20mm; }',
            '* { margin: 0; padding: 0; box-sizing: border-box; }',
            'body { background: #fff; font-family: \'Times New Roman\', Times, serif; color: #111; line-height: 1.5; -webkit-print-color-adjust: exact; print-color-adjust: exact; }',
            'img { max-width: 100%; }',
          ].join(' ')
          w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + previewDoc.doc.title + ' - ' + previewDoc.student.full_name + '</title><style>' + styles + '</style></head><body>' + printContent + '</body></html>')
          w.document.close()
          w.onload = () => { w.focus(); w.print() }
        }
        return (
          <div className="al-modal-overlay" onClick={() => setPreviewDoc(null)}>
            <div className="al-doc-preview-modal" onClick={e => e.stopPropagation()}>
              <div className="al-doc-preview-header">
                <div>
                  <h3><Shield size={16} color="#2563EB" /> {previewDoc.doc.title}</h3>
                  <p>{previewDoc.student.full_name} ({previewDoc.student.admission_number}) &mdash; {previewDoc.student.class}{previewDoc.student.stream ? ' ' + previewDoc.student.stream : ''} &mdash; Doc ID: {previewDoc.doc.docId}</p>
                </div>
                <button className="al-modal-close" onClick={() => setPreviewDoc(null)}><X size={18} /></button>
              </div>
              <div className="al-doc-preview-body" ref={printRef}>
                <div dangerouslySetInnerHTML={{ __html: previewDoc.doc.html }} />
              </div>
              <div className="al-doc-preview-footer">
                <button className="al-btn al-btn--outline" onClick={() => setPreviewDoc(null)}><X size={15} /> Close</button>
                <button className="al-btn al-btn--outline" onClick={() => {
                  const blob = new Blob([previewDoc.doc.html], { type: 'text/html' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url; a.download = previewDoc.doc.title.replace(/\s+/g, '_') + '_' + previewDoc.student.admission_number + '.html'; a.click()
                  URL.revokeObjectURL(url)
                }}>
                  <Download size={15} /> Download PDF
                </button>
                <button className="al-btn al-btn--primary" onClick={handlePrint}><Printer size={15} /> Print</button>
              </div>
            </div>
          </div>
        )
      })()}

      {mergeModal && mergeTarget && (
        <div className="al-modal-overlay" onClick={() => { setMergeModal(false); setMergeTarget(null); setMergeSource('') }}>
          <div className="al-modal" onClick={e => e.stopPropagation()}>
            <div className="al-modal-head">
              <h3>Merge Duplicate — {mergeTarget.full_name}</h3>
              <button className="al-modal-close" onClick={() => { setMergeModal(false); setMergeTarget(null); setMergeSource('') }}><X size={16} /></button>
            </div>
            <div className="al-modal-body">
              <p style={{ marginBottom: 12 }}>Find a duplicate record by name and merge it into this record.</p>
              <div className="al-form-group">
                <label>Duplicate full name to merge</label>
                <input className="al-input" type="text" placeholder="Type full name of duplicate..." value={mergeSource} onChange={e => setMergeSource(e.target.value)} />
              </div>
              {mergeSource && (() => {
                const dups = alumni.filter(s => s.full_name?.toLowerCase().trim() === mergeSource.toLowerCase().trim() && s.id !== mergeTarget.id)
                if (dups.length === 0) return <p style={{ fontSize: 12, color: '#CA8A04', marginTop: 4 }}>No matching duplicate found for "{mergeSource}"</p>
                return dups.map(d => (
                  <div key={d.id} className="al-merge-match">
                    <UserCheck size={14} color="#CA8A04" />
                    <span>{d.full_name} — {d.admission_number} ({d.class})</span>
                  </div>
                ))
              })()}
              <div className="al-modal-foot">
                <button className="al-btn al-btn--outline" onClick={() => { setMergeModal(false); setMergeTarget(null); setMergeSource('') }}>Cancel</button>
                <button className="al-btn al-btn--primary" onClick={handleMerge} disabled={!mergeSource.trim()}>Merge & Delete Source</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {fixModal && selectedStudent && (
        <div className="al-modal-overlay" onClick={() => setFixModal(false)}>
          <div className="al-modal" onClick={e => e.stopPropagation()}>
            <div className="al-modal-head">
              <h3>Fix Data — {selectedStudent.full_name}</h3>
              <button className="al-modal-close" onClick={() => setFixModal(false)}><X size={16} /></button>
            </div>
            <div className="al-modal-body">
              <p style={{ marginBottom: 12 }}>Controlled edit for corrections only. All changes are logged.</p>
              <div className="al-form-grid">
                <div className="al-form-group">
                  <label>Exit Reason</label>
                  <select className="al-input" value={fixForm.exit_reason} onChange={e => setFixForm(f => ({ ...f, exit_reason: e.target.value }))}>
                    <option value="Completed">Completed</option>
                    <option value="Transferred">Transferred</option>
                    <option value="Withdrawn">Withdrawn</option>
                    <option value="Expelled">Expelled</option>
                  </select>
                </div>
                <div className="al-form-group">
                  <label>Date of Exit</label>
                  <input className="al-input" type="date" value={fixForm.exit_date} onChange={e => setFixForm(f => ({ ...f, exit_date: e.target.value }))} />
                </div>
                <div className="al-form-group">
                  <label>Conduct Summary</label>
                  <input className="al-input" type="text" value={fixForm.conduct} onChange={e => setFixForm(f => ({ ...f, conduct: e.target.value }))} />
                </div>
                <div className="al-form-group">
                  <label>Approved By</label>
                  <input className="al-input" type="text" value={fixForm.approved_by} onChange={e => setFixForm(f => ({ ...f, approved_by: e.target.value }))} />
                </div>
                <div className="al-form-group al-form-group--full">
                  <label>Correction Notes (required)</label>
                  <textarea className="al-input" rows={3} value={fixForm.notes} onChange={e => setFixForm(f => ({ ...f, notes: e.target.value }))} placeholder="Explain why this correction is needed..." />
                </div>
              </div>
              <div className="al-modal-foot">
                <button className="al-btn al-btn--outline" onClick={() => setFixModal(false)}>Cancel</button>
                <button className="al-btn al-btn--primary" onClick={handleFixSubmit} disabled={!fixForm.notes.trim()}>Save Correction</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {actionPanel && (
        <FloatingActionPanel
          student={actionPanel}
          onClose={() => setActionPanel(null)}
          items={[
            { icon: <Eye size={15} />, label: 'View Profile', onClick: () => { setSelectedStudent(actionPanel); setView('detail') } },
            { icon: <FileText size={15} />, label: 'Generate Certificate', onClick: () => { setSelectedStudent(actionPanel); setCertType('leaving'); setCertModal(true) } },
            { icon: <Eye size={15} />, label: 'Preview Document', onClick: () => { setSelectedStudent(actionPanel); setView('detail') } },
            { icon: <Download size={15} />, label: 'Download PDF', onClick: () => { handleExportPDF(actionPanel) } },
            { sep: true },
            { icon: <ScrollText size={15} />, label: 'View Transcript', onClick: () => { handleViewTranscript(actionPanel) } },
            { sep: true },
            { icon: <Edit2 size={15} />, label: 'Fix Data', onClick: () => { openFixModal(actionPanel) }, hidden: actionPanel.record_locked },
            { icon: <Merge size={15} />, label: 'Merge Duplicates', onClick: () => { setMergeTarget(actionPanel); setMergeModal(true) }, hidden: actionPanel.record_locked },
            { icon: <RefreshCw size={15} />, label: 'Restore to Active', onClick: () => { handleReactivate(actionPanel) }, hidden: actionPanel.record_locked },
            { sep: true, hidden: actionPanel.record_locked },
            { icon: <Lock size={15} />, label: 'Lock Record', onClick: () => { handleLockRecord(actionPanel) }, danger: true, hidden: actionPanel.record_locked },
          ]}
        />
      )}
    </div>
  )
}