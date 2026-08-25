import { useState, useEffect, useMemo } from 'react'
import {
  FileText, Search, X, Eye, Download, RefreshCw, Award,
  ScrollText, UserCheck, Mail, Shield, CheckCircle,
  Clock, Archive, Upload, MoreVertical, Printer, Send
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'
import { useSchool } from '../admin/useSchool'
import { useBrandingStore } from '../../features/branding/brandingStore'
import { esc } from '../../utils/escapeHtml'
import { sanitizeHtml } from '../../utils/sanitizeHtml'
import './DocumentsCertificates.css'

const DOCUMENT_TYPES = [
  { value: '',             label: 'Select document type', prefix: '' },
  { value: 'admission_letter',    label: 'Admission Letter',        prefix: 'SP-ADM', icon: <FileText size={14} /> },
  { value: 'transfer_letter',     label: 'Transfer Letter',         prefix: 'SP-TRF', icon: <ScrollText size={14} /> },
  { value: 'leaving_certificate',  label: 'Leaving Certificate',     prefix: 'SP-LVC', icon: <Award size={14} /> },
  { value: 'bonafide_letter',     label: 'Bonafide Letter',         prefix: 'SP-BON', icon: <UserCheck size={14} /> },
  { value: 'recommendation_letter', label: 'Recommendation Letter', prefix: 'SP-REC', icon: <Mail size={14} /> },
  { value: 'completion_certificate', label: 'Completion Certificate', prefix: 'SP-CMP', icon: <CheckCircle size={14} /> },
  { value: 'conduct_certificate',  label: 'Conduct Certificate',    prefix: 'SP-CC',  icon: <Shield size={14} /> },
  { value: 'fee_clearance',       label: 'Fee Clearance Letter',    prefix: 'SP-FCL', icon: <Archive size={14} /> },
]

const DOC_STATUS = {
  generated: { label: 'Generated',  class: 'dc-badge--generated' },
  pending:   { label: 'Pending',    class: 'dc-badge--pending' },
  signed:    { label: 'Signed',     class: 'dc-badge--signed' },
  rejected:  { label: 'Rejected',   class: 'dc-badge--rejected' },
}

const PAGE_SIZE = 15

function StatusBadge({ status }) {
  const cfg = DOC_STATUS[status]
  if (!cfg) return <span className="dc-badge dc-badge--empty">Not Generated</span>
  return <span className={`dc-badge ${cfg.class}`}>{cfg.label}</span>
}

function Avatar({ name, size = 'sm' }) {
  const initials = name?.split(' ').map(n => n[0]).join('').slice(0, 2) || '??'
  const colors = ['#2563EB', '#7C3AED', '#16A34A', '#CA8A04', '#DC2626', '#0891B2']
  let hash = 0; for (const c of (name || '')) hash = c.charCodeAt(0) + ((hash << 5) - hash)
  const bg = colors[Math.abs(hash) % colors.length]
  const sz = size === 'lg' ? 44 : 28
  const fs = size === 'lg' ? 15 : 10
  return <div className="dc-avatar" style={{ width: sz, height: sz, fontSize: fs, background: bg }}>{initials}</div>
}

function FloatingPanel({ student, onAction, onClose, initialPos }) {
  const [pos, setPos] = useState(initialPos || { x: window.innerWidth / 2 - 110, y: window.innerHeight / 2 - 140 })
  const [drag, setDrag] = useState(null)

  useEffect(() => {
    if (!drag) return
    const onMove = (e) => {
      setPos(p => ({ x: p.x + e.movementX, y: p.y + e.movementY }))
    }
    const onUp = () => setDrag(null)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
  }, [drag])

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      style={{
        position: 'fixed', left: pos.x, top: pos.y, zIndex: 1001,
        width: 260, maxHeight: '80vh',
        background: '#fff', borderRadius: 16,
        border: '1px solid #E5E7EB',
        boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
        display: 'flex', flexDirection: 'column',
        animation: 'dc-modal-in 0.15s ease-out',
      }}
    >
      <div
        onMouseDown={(e) => setDrag({ x: e.screenX, y: e.screenY })}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px 8px', cursor: 'grab', userSelect: 'none', flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>Actions — {student.full_name}</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: 4, display: 'flex' }}><X size={15} /></button>
      </div>
      <div style={{ overflowY: 'auto', padding: '4px 8px 12px', flex: 1 }}>
        <button className="dc-dd-item" onClick={() => { onAction(student, 'preview'); onClose() }}>
          <Eye size={13} /> Preview Document
        </button>
        <button className="dc-dd-item" onClick={() => { onAction(student, 'generate'); onClose() }}>
          <FileText size={13} /> Generate Document
        </button>
        <button className="dc-dd-item" onClick={() => { onAction(student, 'download'); onClose() }}>
          <Download size={13} /> Download PDF
        </button>
        <button className="dc-dd-item" onClick={() => { onAction(student, 'send'); onClose() }}>
          <Send size={13} /> Send to Parent
        </button>
        <div className="dc-dd-sep" />
        <button className="dc-dd-item" onClick={() => { onAction(student, 'sign'); onClose() }}>
          <CheckCircle size={13} /> Mark as Signed
        </button>
        <button className="dc-dd-item" onClick={() => { onAction(student, 'regenerate'); onClose() }}>
          <RefreshCw size={13} /> Regenerate
        </button>
        <div className="dc-dd-sep" />
        <button className="dc-dd-item dc-dd-item--danger" onClick={() => { onAction(student, 'archive'); onClose() }}>
          <Archive size={13} /> Archive
        </button>
      </div>
    </div>
  )
}

function RowDropdown({ student, onAction }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      {open && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000 }} onClick={() => setOpen(false)} />
      )}
      <button
        className={`dc-dd-trigger ${open ? 'dc-dd-trigger--active' : ''}`}
        onClick={(e) => { e.stopPropagation(); setOpen(!open) }}
        aria-label="Actions"
      >
        <MoreVertical size={15} />
      </button>
      {open && (
        <FloatingPanel student={student} onAction={onAction} onClose={() => setOpen(false)} />
      )}
    </>
  )
}

export default function DocumentsCertificates() {
  const { profile } = useAuthStore()
  const { school, currentTerm, currentYear } = useSchool()
  const { logoUrl, schoolName } = useBrandingStore()
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedDocType, setSelectedDocType] = useState(DOCUMENT_TYPES[0].value)
  const [selectedStudent, setSelectedStudent] = useState(null)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [page, setPage] = useState(1)

  useEffect(() => {
    if (profile?.school_id) fetchStudents()
  }, [profile])

  useEffect(() => { setPage(1) }, [search])

  const fetchStudents = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('students')
      .select('id, full_name, admission_number, class, stream, gender, date_of_birth, parent_name, parent_phone, status, created_at')
      .eq('school_id', profile.school_id)
      .eq('status', 'active')
      .order('full_name')
    setStudents(data || [])
    setLoading(false)
  }

  const filtered = useMemo(() => {
    if (!search) return students
    const q = search.toLowerCase()
    return students.filter(s =>
      s.full_name?.toLowerCase().includes(q) || s.admission_number?.toLowerCase().includes(q)
    )
  }, [students, search])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = useMemo(() =>
    filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  , [filtered, page])

  useEffect(() => { setSelectedIds(new Set()) }, [page])

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === paginated.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(paginated.map(s => s.id)))
    }
  }

  const getStatus = () => null

  const genDocId = (prefix) => `${prefix}/${currentYear}/${String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0')}`

  const qrUrl = (docId) =>
    `https://api.qrserver.com/v1/create-qr-code/?size=70x70&bgcolor=ffffff&data=https://shulepulse.com/verify/${docId}`

  const buildDocument = (s, type) => {
    if (!type) return null
    const date = new Date().toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' })
    const cfg = DOCUMENT_TYPES.find(t => t.value === type)
    const docId = genDocId(cfg?.prefix || 'SP-XX')
    const schName = schoolName || school?.name || 'Our School'
    const schMotto = school?.motto || 'Excellence in Education'
    const schAddress = school?.address || 'P.O. Box 123, Nairobi'
    const schPhone = school?.phone || '+254 700 000 000'
    const schEmail = school?.email || 'info@school.ac.ke'
    const schRegId = school?.registration_number || 'MOE/NC/2024/001'
    const logoHtml = logoUrl
      ? `<img src="${esc(logoUrl)}" style="height:60px;width:auto;margin-bottom:6px" />`
      : `<div style="width:60px;height:60px;background:#1e3a5f;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 6px;color:#fff;font-size:24px;font-weight:700">${esc(schName[0])}</div>`

    const headerBlock = `
      <div style="text-align:center;margin-bottom:20px;border-bottom:2px solid #1e3a5f;padding-bottom:12px">
        ${logoHtml}
        <div style="font-size:16pt;font-weight:700;color:#1e3a5f">${esc(schName)}</div>
        <div style="font-size:9pt;color:#666;font-style:italic">"${esc(schMotto)}"</div>
        <div style="font-size:8pt;color:#888">${esc(schAddress)} | Tel: ${esc(schPhone)}</div>
        <div style="font-size:7pt;color:#999">Ministry Reg: ${esc(schRegId)}</div>
      </div>`

    const qr = `
      <div style="display:flex;justify-content:space-between;align-items:start;margin:16px 0">
        <div><div style="font-size:8pt;color:#888"><strong>Document ID:</strong> ${docId}</div>
        <div style="font-size:8pt;color:#888"><strong>Date Issued:</strong> ${date}</div></div>
        <div style="text-align:center"><img src="${qrUrl(docId)}" style="width:60px;height:60px" />
        <div style="font-size:6pt;color:#999">Scan to verify</div></div>
      </div>`

    const signature = `
      <div style="display:flex;justify-content:space-between;margin-top:28px">
        <div style="text-align:center;width:45%"><div style="width:120px;border-top:1px solid #333;margin:0 auto 4px"></div><div style="font-size:8pt;font-weight:600;color:#1e3a5f">Registrar</div></div>
        <div style="text-align:center;width:45%"><div style="width:120px;border-top:1px solid #333;margin:0 auto 4px"></div><div style="font-size:8pt;font-weight:600;color:#1e3a5f">Principal</div></div>
      </div>`

    const watermark = `<div style="position:absolute;top:45%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);font-size:48pt;font-weight:700;color:rgba(30,58,95,0.04);pointer-events:none;white-space:nowrap">OFFICIAL DOCUMENT</div>`

    const footer = `<div style="text-align:center;margin-top:20px;padding-top:8px;border-top:1px solid #ddd;font-size:7pt;color:#999">Generated by ShulePulse | Verify at https://shulepulse.com/verify/${docId}</div>`

    const tr = (l, v) => `<tr><td style="padding:4px 8px;border:1px solid #ccc;background:#f9f9f9;font-size:9pt;font-weight:600;width:35%">${esc(l)}</td><td style="padding:4px 8px;border:1px solid #ccc;font-size:9pt">${esc(v) || '—'}</td></tr>`

    const body = {
      admission_letter: `
        <div style="font-size:13pt;font-weight:700;text-align:center;color:#1e3a5f;margin:16px 0 8px">LETTER OF ADMISSION</div>
        <div style="font-size:9pt;text-align:right;color:#666">Date: ${date}</div><div style="font-size:9pt;color:#888;margin-bottom:12px">Ref: ${docId}</div>
        <div style="font-size:9pt;margin-bottom:8px">Dear ${esc(s.parent_name) || 'Parent/Guardian'},</div>
        <div style="font-size:10pt;font-weight:600;margin-bottom:8px">RE: ADMISSION OF ${esc(s.full_name).toUpperCase()} (ADM NO: ${esc(s.admission_number)})</div>
        <div style="font-size:9pt;line-height:1.7;text-align:justify">We are pleased to inform you that your child, <strong>${esc(s.full_name)}</strong>, has been offered admission to <strong>${esc(schName)}</strong> for the academic year ${currentYear}.</div>
        <table style="width:100%;border-collapse:collapse;margin:12px 0">${tr('Full Name', s.full_name)}${tr('Admission Number', s.admission_number)}${tr('Assigned Grade', s.class + (s.stream ? ' ' + s.stream : ''))}${tr('Academic Year', String(currentYear))}${tr('Term', currentTerm)}${tr('Gender', s.gender)}${tr('Date of Admission', date)}</table>
        <div style="font-size:9pt;margin-top:6px">Reporting Requirements: Birth certificate, previous report cards, 2 passport photos.</div>`,

      transfer_letter: `
        <div style="font-size:13pt;font-weight:700;text-align:center;color:#1e3a5f;margin:16px 0 8px">TRANSFER LETTER</div>
        <div style="font-size:9pt;text-align:right;color:#666">Date: ${date}</div><div style="font-size:9pt;color:#888;margin-bottom:12px">Ref: ${docId}</div>
        <div style="font-size:10pt;font-weight:600;margin-bottom:8px">RE: TRANSFER OF ${esc(s.full_name).toUpperCase()}</div>
        <div style="font-size:9pt;line-height:1.7;text-align:justify">This certifies that <strong>${esc(s.full_name)}</strong> (Admission No: ${esc(s.admission_number)}) was a bonafide student of ${esc(schName)} and is authorized to transfer.</div>
        <table style="width:100%;border-collapse:collapse;margin:12px 0">${tr('Full Name', s.full_name)}${tr('Admission Number', s.admission_number)}${tr('Last Class', s.class + (s.stream ? ' ' + s.stream : ''))}${tr('Gender', s.gender)}${tr('Status', 'Approved / Released')}${tr('Date', date)}</table>`,

      leaving_certificate: `
        <div style="font-size:13pt;font-weight:700;text-align:center;color:#1e3a5f;margin:16px 0 8px">SCHOOL LEAVING CERTIFICATE</div>
        <div style="font-size:9pt;text-align:right;color:#666">Date: ${date}</div><div style="font-size:9pt;color:#888;margin-bottom:12px">Ref: ${docId}</div>
        <div style="font-size:10pt;font-weight:600;margin-bottom:8px">RE: LEAVING CERTIFICATE — ${esc(s.full_name).toUpperCase()}</div>
        <table style="width:100%;border-collapse:collapse;margin:12px 0">${tr('Full Name', s.full_name)}${tr('Admission Number', s.admission_number)}${tr('Admitted', s.created_at ? new Date(s.created_at).toLocaleDateString('en-KE', { day:'numeric', month:'long', year:'numeric' }) : '—')}${tr('Date of Exit', date)}${tr('Last Class', s.class + (s.stream ? ' ' + s.stream : ''))}${tr('Gender', s.gender)}${tr('Status', 'Completed')}</table>`,

      bonafide_letter: `
        <div style="font-size:13pt;font-weight:700;text-align:center;color:#1e3a5f;margin:16px 0 8px">BONAFIDE STUDENT LETTER</div>
        <div style="font-size:9pt;text-align:right;color:#666">Date: ${date}</div><div style="font-size:9pt;color:#888;margin-bottom:12px">Ref: ${docId}</div>
        <div style="font-size:10pt;font-weight:600;margin-bottom:8px">RE: BONAFIDE STUDENT LETTER — ${esc(s.full_name)}</div>
        <table style="width:100%;border-collapse:collapse;margin:12px 0">${tr('Full Name', s.full_name)}${tr('Admission Number', s.admission_number)}${tr('Current Grade', s.class + (s.stream ? ' ' + s.stream : ''))}${tr('Status', 'Active')}${tr('Year', currentYear)}${tr('Issue Date', date)}</table>
        <div style="font-size:9pt;margin-top:6px">Valid for the current academic term only.</div>`,

      recommendation_letter: `
        <div style="font-size:13pt;font-weight:700;text-align:center;color:#1e3a5f;margin:16px 0 8px">RECOMMENDATION LETTER</div>
        <div style="font-size:9pt;text-align:right;color:#666">Date: ${date}</div><div style="font-size:9pt;color:#888;margin-bottom:12px">Ref: ${docId}</div>
        <div style="font-size:10pt;font-weight:600;margin-bottom:8px">RE: RECOMMENDATION FOR ${esc(s.full_name).toUpperCase()}</div>
        <div style="font-size:9pt;line-height:1.7;text-align:justify">I am pleased to recommend <strong>${esc(s.full_name)}</strong> (Admission No: ${esc(s.admission_number)}) of ${esc(schName)}.</div>
        <div style="font-size:9pt;line-height:1.7;text-align:justify">During their tenure at our institution, they have demonstrated exceptional academic performance and strong moral character. I recommend them without reservation.</div>`,

      completion_certificate: `
        <div style="font-size:13pt;font-weight:700;text-align:center;color:#1e3a5f;margin:16px 0 8px">COMPLETION CERTIFICATE</div>
        <div style="font-size:9pt;text-align:right;color:#666">Date: ${date}</div><div style="font-size:9pt;color:#888;margin-bottom:12px">Ref: ${docId}</div>
        <table style="width:100%;border-collapse:collapse;margin:12px 0">${tr('Full Name', s.full_name)}${tr('Admission Number', s.admission_number)}${tr('Class', s.class + (s.stream ? ' ' + s.stream : ''))}${tr('Year', currentYear)}${tr('Status', 'Completed')}</table>
        <div style="font-size:9pt;line-height:1.7;text-align:justify">This certifies that the above-named student has successfully completed the academic program.</div>`,

      conduct_certificate: `
        <div style="font-size:13pt;font-weight:700;text-align:center;color:#1e3a5f;margin:16px 0 8px">CONDUCT CERTIFICATE</div>
        <div style="font-size:9pt;text-align:right;color:#666">Date: ${date}</div><div style="font-size:9pt;color:#888;margin-bottom:12px">Ref: ${docId}</div>
        <table style="width:100%;border-collapse:collapse;margin:12px 0">${tr('Full Name', s.full_name)}${tr('Admission Number', s.admission_number)}${tr('Class', s.class + (s.stream ? ' ' + s.stream : ''))}${tr('Conduct', 'Satisfactory')}</table>
        <div style="font-size:9pt;line-height:1.7">Throughout their enrollment, the student's behavior and conduct have been satisfactory.</div>`,

      fee_clearance: `
        <div style="font-size:13pt;font-weight:700;text-align:center;color:#1e3a5f;margin:16px 0 8px">FEE CLEARANCE LETTER</div>
        <div style="font-size:9pt;text-align:right;color:#666">Date: ${date}</div><div style="font-size:9pt;color:#888;margin-bottom:12px">Ref: ${docId}</div>
        <table style="width:100%;border-collapse:collapse;margin:12px 0">${tr('Full Name', s.full_name)}${tr('Admission Number', s.admission_number)}${tr('Class', s.class + (s.stream ? ' ' + s.stream : ''))}${tr('Balance', 'Cleared')}</table>
        <div style="font-size:9pt;line-height:1.7;text-align:justify">This certifies that ${esc(s.full_name)} has cleared all financial obligations with ${esc(schName)} as of ${date}.</div>`,
    }[type]

    return {
      title: cfg?.label || 'Document',
      docId,
      html: `<div style="position:relative;width:210mm;padding:20mm 22mm;font-family:'Times New Roman',Times,serif;color:#111;margin:0 auto">${watermark}${headerBlock}${qr}${body}${signature}${footer}</div>`
    }
  }

  const handleAction = (s, action) => {
    if (action === 'preview' || action === 'generate') {
      if (!selectedDocType) { alert('Please select a document type first.'); return }
      setSelectedStudent(s)
    } else if (action === 'download') {
      if (!selectedDocType) { alert('Please select a document type first.'); return }
      const doc = buildDocument(s, selectedDocType)
      if (!doc) return
      const blob = new Blob([doc.html], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `${doc.title.replace(/\s+/g, '_')}_${s.admission_number}.html`; a.click()
      URL.revokeObjectURL(url)
    } else if (action === 'send') {
      alert(`Email to parent of ${s.full_name} — coming soon`)
    } else if (action === 'sign') {
      alert(`Marked as signed — tracking coming soon`)
    } else if (action === 'regenerate') {
      if (!selectedDocType) { alert('Please select a document type first.'); return }
      setSelectedStudent(s)
    } else if (action === 'archive') {
      alert(`Archived — coming soon`)
    }
  }

  const handleBulkAction = (action) => {
    const count = selectedIds.size
    if (action === 'generate') {
      const s = students.find(s => selectedIds.has(s.id))
      if (s && selectedDocType) setSelectedStudent(s)
    } else if (action === 'download') {
      const s = students.find(s => selectedIds.has(s.id))
      if (s && selectedDocType) {
        const doc = buildDocument(s, selectedDocType)
        if (doc) {
          const blob = new Blob([doc.html], { type: 'text/html' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url; a.download = `${doc.title.replace(/\s+/g, '_')}_${s.admission_number}.html`; a.click()
          URL.revokeObjectURL(url)
        }
      }
    } else if (action === 'email') {
      alert(`Email not yet configured.`)
    }
    setSelectedIds(new Set())
  }

  const handleGenerate = () => {
    if (!selectedDocType) { alert('Select a document type first.'); return }
    const s = filtered[0]
    if (s) setSelectedStudent(s)
  }

  const handlePrint = () => {
    if (!selectedStudent || !selectedDocType) return
    const doc = buildDocument(selectedStudent, selectedDocType)
    if (!doc) return
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`<html><head><title>${esc(doc.title)}</title><style>@page{size:A4;margin:0}*{margin:0;padding:0;box-sizing:border-box}body{background:#fff}</style></head><body>${doc.html}</body></html>`)
    w.document.close()
    w.onload = () => { w.focus(); w.print() }
  }

  const stats = useMemo(() => ({
    total: students.length,
    generated: 0,
    pending: 0,
    ready: 0,
  }), [students])

  return (
    <div className="dc-root">
      <div className="dc-header">
        <div>
          <p className="dc-desc">Term {currentTerm}, {currentYear} &middot; {schoolName || school?.name || 'School'}</p>
        </div>
        <div className="dc-header-right">
          <button className="dc-btn dc-btn--outline" onClick={fetchStudents}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      <div className="dc-kpi-grid">
        <div className="dc-kpi">
          <div className="dc-kpi-icon" style={{ background: '#EFF6FF', color: '#2563EB' }}><FileText size={20} /></div>
          <div className="dc-kpi-content"><p className="dc-kpi-value" style={{ color: '#2563EB' }}>{stats.total}</p><p className="dc-kpi-label">Total Students</p></div>
        </div>
        <div className="dc-kpi">
          <div className="dc-kpi-icon" style={{ background: '#F0FDF4', color: '#16A34A' }}><CheckCircle size={20} /></div>
          <div className="dc-kpi-content"><p className="dc-kpi-value" style={{ color: '#16A34A' }}>{stats.generated}</p><p className="dc-kpi-label">Documents Generated</p></div>
        </div>
        <div className="dc-kpi">
          <div className="dc-kpi-icon" style={{ background: '#FFF7ED', color: '#F97316' }}><Clock size={20} /></div>
          <div className="dc-kpi-content"><p className="dc-kpi-value" style={{ color: '#F97316' }}>{stats.pending}</p><p className="dc-kpi-label">Pending Signatures</p></div>
        </div>
        <div className="dc-kpi">
          <div className="dc-kpi-icon" style={{ background: '#F5F3FF', color: '#7C3AED' }}><Download size={20} /></div>
          <div className="dc-kpi-content"><p className="dc-kpi-value" style={{ color: '#7C3AED' }}>{stats.ready}</p><p className="dc-kpi-label">Ready for Download</p></div>
        </div>
      </div>

      <div className="dc-toolbar">
        <div className="dc-toolbar-left">
          <div className="dc-search">
            <Search size={14} className="dc-search-icon" />
            <input className="dc-search-input" placeholder="Search student..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="dc-toolbar-divider" />
          <select className="dc-select" value={selectedDocType} onChange={e => setSelectedDocType(e.target.value)}>
            {DOCUMENT_TYPES.map(t => (
              <option key={t.value} value={t.value} disabled={t.value === ''}>{t.label}</option>
            ))}
          </select>
          <button className="dc-btn dc-btn--primary" disabled={!selectedDocType} onClick={handleGenerate}>
            <Upload size={14} /> Generate
          </button>
          <button className="dc-btn dc-btn--outline" disabled={!selectedDocType || selectedIds.size === 0} onClick={() => handleBulkAction('generate')}>
            <FileText size={14} /> Bulk Generate
          </button>
          <button className="dc-btn dc-btn--outline" onClick={() => alert('Export CSV — coming soon')}>
            <Download size={14} /> Export
          </button>
        </div>
        <div className="dc-toolbar-right">
          <span className="dc-count">{filtered.length} students</span>
        </div>
      </div>

      {loading ? (
        <div className="dc-loading"><div className="dc-spinner" /> Loading students...</div>
      ) : filtered.length === 0 ? (
        <div className="dc-empty">
          <FileText size={40} color="#CBD5E1" />
          <p>No students found</p>
          {search && <span>Try a different search term</span>}
        </div>
      ) : (
        <div className="dc-table-wrap">
          {selectedIds.size > 0 && (
            <div className="dc-bulk">
              <span className="dc-bulk-count">{selectedIds.size} selected</span>
              <div className="dc-bulk-actions">
                <button className="dc-btn dc-btn--sm dc-btn--primary" onClick={() => handleBulkAction('generate')}>Generate Selected</button>
                <button className="dc-btn dc-btn--sm dc-btn--outline" onClick={() => handleBulkAction('download')}>Download ZIP</button>
                <button className="dc-btn dc-btn--sm dc-btn--outline" onClick={() => handleBulkAction('email')}>Email Selected</button>
                <button className="dc-btn dc-btn--sm dc-btn--ghost" onClick={() => setSelectedIds(new Set())}>Clear</button>
              </div>
            </div>
          )}
          <div className="dc-table-scroll">
            <table className="dc-table">
              <thead>
                <tr>
                  <th className="dc-th--checkbox">
                    <input type="checkbox" className="dc-checkbox" onChange={toggleSelectAll} checked={selectedIds.size === paginated.length && paginated.length > 0} />
                  </th>
                  <th className="dc-th--student">Student</th>
                  <th className="dc-th--class">Class</th>
                  <th className="dc-th--stream">Stream</th>
                  <th className="dc-th--parent">Parent</th>
                  <th className="dc-th--status">Document Status</th>
                  <th className="dc-th--actions"></th>
                </tr>
              </thead>
              <tbody>
                {paginated.map(s => (
                  <tr key={s.id}>
                    <td>
                      <input type="checkbox" className="dc-checkbox" checked={selectedIds.has(s.id)} onChange={() => toggleSelect(s.id)} />
                    </td>
                    <td>
                      <div className="dc-student">
                        <Avatar name={s.full_name} size="sm" />
                        <div className="dc-student-info">
                          <span className="dc-student-name">{s.full_name}</span>
                          <span className="dc-student-adm">{s.admission_number}</span>
                        </div>
                      </div>
                    </td>
                    <td>{s.class}</td>
                    <td>{s.stream || '—'}</td>
                    <td>
                      <div className="dc-parent">
                        <span className="dc-parent-name">{s.parent_name || '—'}</span>
                        {s.parent_phone && <span className="dc-parent-phone">{s.parent_phone}</span>}
                      </div>
                    </td>
                    <td><StatusBadge status={getStatus()} /></td>
                    <td><RowDropdown student={s} onAction={handleAction} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="dc-pagination">
              <span className="dc-page-info">
                Showing {((page - 1) * PAGE_SIZE) + 1}-{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <div className="dc-page-btns">
                <button className="dc-btn dc-btn--xs" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Prev</button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  let p
                  if (totalPages <= 7) p = i + 1
                  else if (page <= 4) p = i + 1
                  else if (page >= totalPages - 3) p = totalPages - 6 + i
                  else p = page - 3 + i
                  return <button key={p} className={`dc-btn dc-btn--xs ${p === page ? 'dc-btn--page-active' : ''}`} onClick={() => setPage(p)}>{p}</button>
                })}
                <button className="dc-btn dc-btn--xs" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
              </div>
            </div>
          )}
        </div>
      )}

      {selectedStudent && selectedDocType && (() => {
        const doc = buildDocument(selectedStudent, selectedDocType)
        if (!doc) return null
        return (
          <div className="dc-modal-overlay" onClick={() => setSelectedStudent(null)}>
            <div className="dc-modal dc-modal--wide" onClick={e => e.stopPropagation()}>
              <div className="dc-modal-head">
                <div>
                  <h3><Shield size={16} color="#2563EB" /> {doc.title}</h3>
                  <p style={{ fontSize: 13, color: '#64748B' }}>{selectedStudent.full_name} ({selectedStudent.admission_number}) — Document ID: {doc.docId}</p>
                </div>
                <button className="dc-modal-close" onClick={() => setSelectedStudent(null)}><X size={16} /></button>
              </div>
              <div className="dc-doc-preview">
                <div className="dc-doc-viewer" dangerouslySetInnerHTML={{ __html: sanitizeHtml(doc.html) }} />
              </div>
              <div className="dc-modal-foot">
                <button className="dc-btn dc-btn--outline" onClick={() => setSelectedStudent(null)}>Close</button>
                <button className="dc-btn dc-btn--primary" onClick={handlePrint}><Printer size={15} /> Print Document</button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
