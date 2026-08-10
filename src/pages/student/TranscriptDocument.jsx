import { useState, useEffect, useRef } from 'react'
import { Printer, X, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { groupGradesBySubject, getCBEGrade, gradeDisplay } from '../../components/students/ReportCard'

const SHULEPULSE_LOGO = import.meta.env.BASE_URL + 'favicon.svg'
const TERM_NUM = { 'Term 1': '1', 'Term 2': '2', 'Term 3': '3' }

const TR_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  .tr-sheet {
    --tr-accent: #2563eb;
    width: 210mm;
    min-height: 297mm;
    margin: 0 auto;
    background: #fff;
    color: #1e293b;
    padding: 12mm 13mm 9mm;
    font-family: 'Segoe UI', Arial, Helvetica, sans-serif;
    font-size: 11px;
    line-height: 1.5;
  }
  .tr-header { display: flex; align-items: center; gap: 16px; border-bottom: 3px solid var(--tr-accent); padding-bottom: 10px; }
  .tr-logo { width: 66px; height: 66px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; background: #fff; }
  .tr-logo img { max-width: 100%; max-height: 100%; object-fit: contain; }
  .tr-logo-fallback { font-size: 10px; font-weight: 800; color: #475569; text-align: center; }
  .tr-school-block { flex: 1; text-align: center; }
  .tr-school-name { font-size: 21px; font-weight: 800; color: #0f172a; letter-spacing: 0.3px; margin: 0; }
  .tr-school-contacts { font-size: 9.5px; color: #475569; margin-top: 4px; }
  .tr-school-contacts span { display: inline-block; }
  .tr-school-contacts .dot { margin: 0 5px; color: #cbd5e1; }
  .tr-title { font-size: 13px; font-weight: 800; letter-spacing: 3px; text-transform: uppercase; color: var(--tr-accent); text-align: center; margin-top: 10px; }
  .tr-subtitle { text-align: center; font-size: 10px; color: #64748b; letter-spacing: 0.5px; margin-top: 2px; }

  .tr-section-title { font-size: 11px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid var(--tr-accent); padding-bottom: 4px; margin: 16px 0 8px; }

  .tr-student-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 12px; }
  .tr-s-field { display: flex; align-items: center; font-size: 10.5px; }
  .tr-s-field .lbl { color: #64748b; width: 118px; flex-shrink: 0; text-transform: uppercase; font-size: 8.5px; letter-spacing: 0.5px; font-weight: 600; }
  .tr-s-field .val { font-weight: 700; color: #0f172a; }

  table.tr-perf { width: 100%; border-collapse: collapse; font-size: 10.5px; margin-top: 4px; }
  table.tr-perf th { background: var(--tr-accent); color: #fff; padding: 7px 8px; text-align: left; font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; border: 1px solid var(--tr-accent); }
  table.tr-perf th.c { text-align: center; }
  table.tr-perf td { border: 1px solid #e2e8f0; padding: 6px 8px; }
  table.tr-perf td.c { text-align: center; }
  table.tr-perf tbody tr:nth-child(even) td { background: #f8fafc; }
  .tr-grade-cell { display: inline-block; min-width: 34px; text-align: center; padding: 2px 8px; border-radius: 6px; font-weight: 800; font-size: 10px; background: #f1f5f9; color: #0f172a; border: 1px solid #cbd5e1; }

  .tr-verification { flex: 1; text-align: right; }
  .tr-verification .k { font-size: 8px; text-transform: uppercase; letter-spacing: 0.8px; color: #64748b; font-weight: 700; }
  .tr-verification .code { font-family: 'Courier New', monospace; font-size: 10px; font-weight: 700; color: var(--tr-accent); letter-spacing: 1px; margin-top: 3px; }
  .tr-issued { font-size: 9px; color: #475569; margin-top: 4px; }

  .tr-footer { text-align: center; font-size: 8.5px; color: #64748b; font-style: italic; border-top: 1px solid #e2e8f0; margin-top: 16px; padding-top: 7px; }

  @media print {
    @page { size: A4 portrait; margin: 0; }
    .tr-sheet { width: 210mm; min-height: 297mm; box-shadow: none; margin: 0; padding: 12mm 13mm 9mm; }
    body { margin: 0; padding: 0; }
  }
`

export default function TranscriptDocument({ student, school, term, year, className, grades, onClose }) {
  const sheetRef = useRef(null)
  const [subjectCodes, setSubjectCodes] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [student?.id, school?.id])

  const load = async () => {
    setLoading(true)
    const sid = school?.id
    const subjectsRes = sid
      ? await supabase.from('subjects').select('name, code').eq('school_id', sid)
      : Promise.resolve({ data: [] })

    const codeMap = {}
    ;(subjectsRes.data || []).forEach(s => { if (s.name) codeMap[s.name.toLowerCase().trim()] = s.code || '' })
    setSubjectCodes(codeMap)

    setLoading(false)
  }

  const grouped = groupGradesBySubject(grades)
  const accent = '#0f172a'

  const subjects = grouped.subjects.map((sub, i) => {
    const cbe = getCBEGrade(sub.average, className)
    return {
      no: i + 1,
      code: subjectCodes[sub.name.toLowerCase().trim()] || '—',
      name: sub.name,
      marks: Math.round(sub.average),
      grade: gradeDisplay(cbe),
      points: cbe.points ?? cbe.level ?? null,
      remark: sub.teacher || cbe.label || '—',
    }
  })

  const verificationNo = `SP-${student?.admission_number || 'STU'}-${year}-${TERM_NUM[term] || '0'}-${String(student?.id || '').replace(/-/g, '').slice(0, 4).toUpperCase()}`
  const issuedDate = new Date().toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' })

  const handlePrint = () => {
    if (!sheetRef.current) return
    const content = sheetRef.current.outerHTML
    const win = window.open('', '_blank')
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Academic Transcript — ${student?.full_name}</title><style>${TR_CSS}</style></head><body>${content}</body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 300)
  }

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'

  return (
    <div className="tr-overlay" onClick={onClose}>
      <div className="tr-modal" onClick={e => e.stopPropagation()}>
        <div className="tr-toolbar">
          <div className="tr-toolbar-left">
            <h3>Academic Transcript — {student?.full_name}</h3>
            <span className="sp-badge">{term} {year} · {className || '—'}</span>
          </div>
          <div className="tr-toolbar-right">
            <button className="sp-btn-primary" onClick={handlePrint}>
              <Printer size={15} /> Print / Download PDF
            </button>
            <button className="tr-close" onClick={onClose}><X size={18} /></button>
          </div>
        </div>
        <div className="tr-scroll">
          {loading ? (
            <div className="sp-loading-container">
              <Loader2 size={28} className="tr-spin" />
              <p>Preparing transcript...</p>
            </div>
          ) : (
            <>
              <style>{TR_CSS}</style>
              <div className="tr-sheet" ref={sheetRef} style={{ '--tr-accent': accent }}>
                <div className="tr-header">
                  <div className="tr-logo">
                    {school?.logo_url
                      ? <img src={school.logo_url} alt={school?.name || 'School logo'} />
                      : <img src={SHULEPULSE_LOGO} alt="ShulePulse" />}
                  </div>
                  <div className="tr-school-block">
                    <p className="tr-school-name">{school?.name || 'School Name'}</p>
                    <div className="tr-school-contacts">
                      {school?.address && <span>{school.address}</span>}
                      {school?.address && (school?.phone || school?.email || school?.website) && <span className="dot">•</span>}
                      {school?.phone && <span>Tel: {school.phone}</span>}
                      {school?.phone && (school?.email || school?.website) && <span className="dot">•</span>}
                      {school?.email && <span>{school.email}</span>}
                      {school?.email && school?.website && <span className="dot">•</span>}
                      {school?.website && <span>{school.website}</span>}
                    </div>
                  </div>
                </div>
                <p className="tr-title">Academic Transcript</p>
                <p className="tr-subtitle">Official Academic Record · {term} {year}</p>

                <div className="tr-section-title">Student Information</div>
                <div className="tr-student-grid">
                  <div className="tr-s-field"><span className="lbl">Student Name</span><span className="val">{student?.full_name || '—'}</span></div>
                  <div className="tr-s-field"><span className="lbl">Admission No.</span><span className="val">{student?.admission_number || '—'}</span></div>
                  <div className="tr-s-field"><span className="lbl">Date of Birth</span><span className="val">{fmtDate(student?.date_of_birth || student?.dob)}</span></div>
                  <div className="tr-s-field"><span className="lbl">Gender</span><span className="val">{student?.gender ? student.gender.charAt(0).toUpperCase() + student.gender.slice(1) : '—'}</span></div>
                  <div className="tr-s-field"><span className="lbl">Class / Form</span><span className="val">{className || student?.class || '—'}</span></div>
                  <div className="tr-s-field"><span className="lbl">Stream</span><span className="val">{student?.stream || '—'}</span></div>
                  <div className="tr-s-field"><span className="lbl">Academic Year</span><span className="val">{year}</span></div>
                  <div className="tr-s-field"><span className="lbl">Term</span><span className="val">{term}</span></div>
                  <div className="tr-s-field"><span className="lbl">Date of Admission</span><span className="val">{fmtDate(student?.date_admitted || student?.created_at)}</span></div>
                </div>

                <div className="tr-section-title">Academic Performance</div>
                {subjects.length === 0 ? (
                  <p style={{ textAlign: 'center', color: '#64748b', padding: '16px 0' }}>No results recorded for this period.</p>
                ) : (
                  <table className="tr-perf">
                    <thead>
                      <tr>
                        <th className="c" style={{ width: 30 }}>No.</th>
                        <th style={{ width: 70 }}>Subject Code</th>
                        <th>Subject</th>
                        <th className="c" style={{ width: 56 }}>Marks</th>
                        <th className="c" style={{ width: 56 }}>Grade</th>
                        <th className="c" style={{ width: 46 }}>Points</th>
                        <th>Remarks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {subjects.map(s => (
                        <tr key={s.no}>
                          <td className="c">{s.no}</td>
                          <td className="c">{s.code}</td>
                          <td><strong>{s.name}</strong></td>
                          <td className="c">{s.marks}</td>
                          <td className="c"><span className="tr-grade-cell">{s.grade}</span></td>
                          <td className="c">{s.points ?? '—'}</td>
                          <td>{s.remark}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                <div className="tr-verification">
                  <div className="k">Transcript Verification Number</div>
                  <div className="code">{verificationNo}</div>
                  <div className="tr-issued">Date Issued: {issuedDate}</div>
                </div>

                <div className="tr-footer">This transcript is an official academic record generated by ShulePulse.</div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
