import { useState, useEffect, useMemo } from 'react'
import {
  ArrowLeft, Search, BookOpen, BookMarked, CheckCircle2, RefreshCw,
  Clock, AlertTriangle, ShieldCheck, ShieldOff, History, BookPlus,
  Phone, Mail, UserRound, CreditCard, Download
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { memberTypeLabel, fetchRules, ruleForType, fmtDate, daysOverdue } from '../../lib/library'
import { exportMemberRecordPdf } from '../../utils/memberPdfExport'

const ACTIVE = ['issued', 'overdue']

export default function MemberProfile({ schoolId, memberId, onNavigate, onBack, school }) {
  const [members, setMembers] = useState([])
  const [studentsByEmail, setStudentsByEmail] = useState({})
  const [teachersByEmail, setTeachersByEmail] = useState({})
  const [rules, setRules] = useState([])
  const [activeMemberId, setActiveMemberId] = useState(memberId || null)
  const [loans, setLoans] = useState([])
  const [reservations, setReservations] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [historyLoading, setHistoryLoading] = useState(false)

  const fetchReference = async () => {
    const [membersRes, studentsRes, teachersRes, rulesRes] = await Promise.all([
      supabase.from('library_members').select('*').eq('school_id', schoolId).order('full_name'),
      supabase.from('students').select('*').eq('school_id', schoolId),
      supabase.from('teachers').select('*').eq('school_id', schoolId),
      fetchRules(schoolId),
    ])
    setMembers(membersRes.data || [])
    setRules(rulesRes)
    const sMap = {}
    ;(studentsRes.data || []).forEach(s => { if (s.email) sMap[s.email.toLowerCase()] = s })
    setStudentsByEmail(sMap)
    const tMap = {}
    ;(teachersRes.data || []).forEach(t => { if (t.email) tMap[t.email.toLowerCase()] = t })
    setTeachersByEmail(tMap)
  }

  const fetchLoans = async (memberId) => {
    setHistoryLoading(true)
    const [loansRes, resRes] = await Promise.all([
      supabase.from('library_loans')
        .select('*, books:library_books(title, author), copy:library_book_copies(copy_code)')
        .eq('member_id', memberId)
        .order('created_at', { ascending: false })
        .limit(500),
      supabase.from('library_reservations')
        .select('*, books:library_books(title, author)')
        .eq('member_id', memberId)
        .order('reserved_at', { ascending: false })
        .limit(50),
    ])
    setLoans(loansRes.data || [])
    setReservations(resRes.data || [])
    setHistoryLoading(false)
  }

  useEffect(() => {
    setLoading(true)
    Promise.all([fetchReference(), fetchLoans(activeMemberId)]).then(() => setLoading(false))
  }, [schoolId])

  useEffect(() => {
    if (activeMemberId) fetchLoans(activeMemberId)
  }, [activeMemberId])

  const activeMember = members.find(m => m.id === activeMemberId) || null
  const rule = ruleForType(rules, activeMember?.member_type)

  const student = activeMember ? studentsByEmail[activeMember.email?.toLowerCase()] : null
  const teacher = activeMember ? teachersByEmail[activeMember.email?.toLowerCase()] : null
  const photo = student?.photo_url || teacher?.photo_url || null

  const stats = useMemo(() => {
    const currently = loans.filter(l => ACTIVE.includes(l.status)).length
    const overdue = loans.filter(l => l.status === 'overdue' || daysOverdue(l) > 0).length
    const lostDamaged = loans.filter(l => ['lost', 'damaged'].includes(l.status)).length
    return [
      { label: 'Total Borrowed', value: loans.length, icon: <BookOpen size={20} />, color: '#2563eb', bg: '#dbeafe' },
      { label: 'Currently Borrowed', value: currently, icon: <BookMarked size={20} />, color: '#7c3aed', bg: '#f3e8ff' },
      { label: 'Returned', value: loans.filter(l => l.status === 'returned').length, icon: <CheckCircle2 size={20} />, color: '#16a34a', bg: '#dcfce7' },
      { label: 'Overdue', value: overdue, icon: <Clock size={20} />, color: '#ca8a04', bg: '#fef3c7' },
      { label: 'Reservations', value: reservations.filter(r => ['pending', 'available'].includes(r.status)).length, icon: <BookMarked size={20} />, color: '#0891b2', bg: '#cffafe' },
      { label: 'Lost / Damaged', value: lostDamaged, icon: <AlertTriangle size={20} />, color: '#dc2626', bg: '#fee2e2' },
    ]
  }, [loans, reservations])

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return []
    return members.filter(m => {
      if (m.full_name?.toLowerCase().includes(q)) return true
      if (m.member_code?.toLowerCase().includes(q)) return true
      if (m.email?.toLowerCase().includes(q)) return true
      const s = studentsByEmail[m.email?.toLowerCase()]
      if (s && [s.admission_number, s.kemis_number, s.nemis_number, s.upi_number]
        .some(v => v?.toLowerCase().includes(q))) return true
      const t = teachersByEmail[m.email?.toLowerCase()]
      const tno = t ? (t.staff_number || t.teacher_code || t.employee_number || '') : ''
      return !!(t && tno.toLowerCase().includes(q))
    })
  }, [search, members, studentsByEmail, teachersByEmail])

  const selectMember = (m) => {
    setActiveMemberId(m.id)
    setSearch('')
  }

  const openIssue = () => {
    onBack()
    onNavigate('borrow')
  }

  const toggleSuspend = async () => {
    if (!activeMember) return
    const next = activeMember.status === 'active' ? 'suspended' : 'active'
    await supabase.from('library_members').update({ status: next }).eq('id', activeMember.id)
    setMembers(prev => prev.map(x => x.id === activeMember.id ? { ...x, status: next } : x))
  }

  const returnBook = async (loan) => {
    const { data: book } = await supabase.from('library_books').select('available_copies').eq('id', loan.book_id).single()
    await supabase.from('library_loans').update({ status: 'returned', returned_at: new Date().toISOString() }).eq('id', loan.id)
    if (book) await supabase.from('library_books').update({ available_copies: book.available_copies + 1 }).eq('id', loan.book_id)
    if (loan.copy_id) await supabase.from('library_book_copies').update({ status: 'available' }).eq('id', loan.copy_id)

    const { data: firstRes } = await supabase.from('library_reservations')
      .select('id').eq('book_id', loan.book_id).eq('status', 'pending').order('reserved_at').limit(1)
    if (firstRes && firstRes.length) {
      await supabase.from('library_reservations').update({ status: 'available', notified_at: new Date().toISOString() }).eq('id', firstRes[0].id)
    }
    fetchLoans(activeMember.id)
  }

  const renewLoan = async (loan) => {
    const r = ruleForType(rules, activeMember?.member_type)
    const limit = r?.renewal_limit || 1
    if (loan.renewed_count >= limit) {
      alert('Renewal limit reached for this loan')
      return
    }
    const due = new Date(loan.due_date)
    due.setDate(due.getDate() + (r?.loan_days || 14))
    await supabase.from('library_loans')
      .update({ due_date: due.toISOString().slice(0, 10), renewed_count: loan.renewed_count + 1, status: 'issued' })
      .eq('id', loan.id)
    fetchLoans(activeMember.id)
  }

  const exportPdf = () => {
    exportMemberRecordPdf({ school, member: activeMember, student, teacher, loans })
  }

  const identifiers = []
  if (student) {
    if (student.admission_number) identifiers.push(['ADM No', student.admission_number])
    if (student.kemis_number) identifiers.push(['KEMIS No', student.kemis_number])
    if (student.nemis_number) identifiers.push(['NEMIS No', student.nemis_number])
    if (student.upi_number) identifiers.push(['UPI No', student.upi_number])
  }
  const staffNumber = teacher ? (teacher.staff_number || teacher.teacher_code || teacher.employee_number) : null
  const departments = teacher?.departments?.length ? teacher.departments.join(', ') : null

  const detailRows = []
  if (student) {
    detailRows.push(['Class / Form', student.class || '—'])
    detailRows.push(['Stream', student.stream || '—'])
    detailRows.push(['Admission Year', student.date_admitted ? new Date(student.date_admitted).getFullYear() : '—'])
  }
  if (teacher) {
    if (staffNumber) detailRows.push(['Staff No', staffNumber])
    if (departments) detailRows.push(['Department', departments])
    if (teacher.employment_type) detailRows.push(['Employment', teacher.employment_type])
    detailRows.push(['Position', teacher.teaching_level || teacher.qualification || '—'])
  }
  if (activeMember?.phone) detailRows.push(['Phone', activeMember.phone])
  else if (student?.phone) detailRows.push(['Phone', student.phone])
  else if (teacher?.phone) detailRows.push(['Phone', teacher.phone])
  detailRows.push(['Email', activeMember?.email || '—'])

  const currentLoans = loans.filter(l => ACTIVE.includes(l.status))
  const history = loans.filter(l => !ACTIVE.includes(l.status))
  const borrowLimit = activeMember?.books_allowed || rule?.books_allowed || 3

  if (loading) return <div className="lib-loading">Loading member profile...</div>

  return (
    <div>
      <div className="lib-toolbar member-search-toolbar">
        <button className="lib-btn print-hide" onClick={onBack}>
          <ArrowLeft size={15} /> Back
        </button>
        <div className="lib-search" style={{ flex: 1, maxWidth: 480 }}>
          <Search size={15} color="#94a3b8" />
          <input
            placeholder="Search by name, ADM No, KEMIS/NEMIS, staff no, or member ID..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button className="lib-btn print-hide" onClick={exportPdf}>
          <Download size={15} /> Export PDF
        </button>
      </div>

      {searchResults.length > 0 && (
        <div className="member-search-results">
          {searchResults.slice(0, 8).map(m => {
            const s = studentsByEmail[m.email?.toLowerCase()]
            const t = teachersByEmail[m.email?.toLowerCase()]
            const idLabel = s
              ? (s.admission_number || s.kemis_number || s.nemis_number || '')
              : t
                ? (t.staff_number || t.teacher_code || t.employee_number || '')
                : m.member_code || ''
            return (
              <button key={m.id} className="member-search-result" onClick={() => selectMember(m)}>
                <span className="lib-avatar-sm">{(m.full_name || '?')[0]}</span>
                <span style={{ flex: 1, textAlign: 'left' }}>
                  <span style={{ display: 'block', fontWeight: 600 }}>{m.full_name}</span>
                  <span style={{ fontSize: 11, color: '#64748b' }}>
                    {memberTypeLabel(m.member_type)}{idLabel ? ` · ${idLabel}` : ''}
                  </span>
                </span>
                <span className="lib-badge" style={{ background: m.status === 'active' ? '#dcfce7' : '#f1f5f9', color: m.status === 'active' ? '#16a34a' : '#64748b' }}>
                  {m.status}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {!activeMember ? (
        <div className="lib-empty">
          <UserRound size={36} color="#cbd5e1" />
          <p>No member selected</p>
          <span>Use the search above to find a library member</span>
        </div>
      ) : (
        <>
          <div className="lib-card member-header-card">
            <div className="member-header">
              {photo ? (
                <img src={photo} alt={activeMember.full_name} className="member-photo" />
              ) : (
                <div className="member-avatar">{(activeMember.full_name || '?')[0].toUpperCase()}</div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="member-name-row">
                  <h2>{activeMember.full_name}</h2>
                  <span className="lib-badge" style={{ background: '#dbeafe', color: '#2563eb' }}>
                    {memberTypeLabel(activeMember.member_type)}
                  </span>
                  <span className="lib-badge" style={{ background: activeMember.status === 'active' ? '#dcfce7' : '#fee2e2', color: activeMember.status === 'active' ? '#16a34a' : '#dc2626' }}>
                    <span className="lib-dot" style={{ background: activeMember.status === 'active' ? '#16a34a' : '#dc2626' }} />
                    {activeMember.status}
                  </span>
                </div>
                <div className="member-meta">
                  {identifiers.map(([k, v]) => (
                    <span key={k} className="member-id-tag"><strong>{k}:</strong> {v}</span>
                  ))}
                  {activeMember.member_code && (
                    <span className="member-id-tag"><strong>Member ID:</strong> {activeMember.member_code}</span>
                  )}
                </div>
                <div className="member-meta">
                  {(activeMember.email || student?.email || teacher?.email) && (
                    <span className="member-meta-item"><Mail size={13} /> {activeMember.email || student?.email || teacher?.email}</span>
                  )}
                  {(activeMember.phone || student?.phone || teacher?.phone) && (
                    <span className="member-meta-item"><Phone size={13} /> {activeMember.phone || student?.phone || teacher?.phone}</span>
                  )}
                  <span className="member-meta-item"><CreditCard size={13} /> Member since {fmtDate(activeMember.created_at)}</span>
                </div>
              </div>
              <div className="member-actions print-hide">
                <button className="lib-btn lib-btn-blue" onClick={openIssue}>
                  <BookPlus size={15} /> Issue Book
                </button>
                <button className="lib-btn" onClick={toggleSuspend}>
                  {activeMember.status === 'active' ? <ShieldOff size={15} /> : <ShieldCheck size={15} />}
                  {activeMember.status === 'active' ? 'Suspend' : 'Activate'}
                </button>
              </div>
            </div>
          </div>

          <div className="lib-grid" style={{ marginBottom: 20 }}>
            {stats.map(s => (
              <div key={s.label} className="lib-stat-card">
                <div className="lib-stat-icon">
                  <span style={{ width: 38, height: 38, borderRadius: 10, background: s.bg, color: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {s.icon}
                  </span>
                </div>
                <p className="lib-stat-label">{s.label}</p>
                <p className="lib-stat-value">{s.value}</p>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 16, alignItems: 'start', marginBottom: 16 }}>
            <div className="lib-card">
              <div className="lib-card-header">
                <div>
                  <h2>Basic Details</h2>
                  <p>Member and student / staff information</p>
                </div>
              </div>
              <div className="member-detail-list">
                {identifiers.map(([k, v]) => (
                  <div key={k} className="member-detail-row"><span>{k}</span><strong>{v}</strong></div>
                ))}
                {detailRows.map(([k, v]) => (
                  <div key={k} className="member-detail-row"><span>{k}</span><strong>{v}</strong></div>
                ))}
                {identifiers.length === 0 && !teacher && (
                  <div className="text-muted" style={{ fontSize: 12, color: '#94a3b8' }}>Guest member — no school record linked.</div>
                )}
              </div>
            </div>

            <div className="lib-card">
              <div className="lib-card-header">
                <div>
                  <h2>Library Account</h2>
                  <p>Membership and borrowing status</p>
                </div>
              </div>
              <div className="member-detail-list">
                <div className="member-detail-row"><span>Member ID</span><strong>{activeMember.member_code || '—'}</strong></div>
                <div className="member-detail-row"><span>Member Type</span><strong>{memberTypeLabel(activeMember.member_type)}</strong></div>
                <div className="member-detail-row"><span>Membership Date</span><strong>{fmtDate(activeMember.created_at)}</strong></div>
                <div className="member-detail-row"><span>Borrowing Limit</span><strong>{borrowLimit} books</strong></div>
                <div className="member-detail-row"><span>Current Borrowed</span><strong>{stats[1].value} / {borrowLimit}</strong></div>
                <div className="member-detail-row">
                  <span>Account Status</span>
                  <strong style={{ color: activeMember.status === 'active' ? '#16a34a' : '#dc2626' }}>
                    {activeMember.status.charAt(0).toUpperCase() + activeMember.status.slice(1)}
                  </strong>
                </div>
              </div>
            </div>
          </div>

          <div className="lib-card" style={{ marginBottom: 16 }}>
            <div className="lib-card-header">
              <div>
                <h2>Currently Borrowed ({currentLoans.length})</h2>
                <p>Books currently out on loan</p>
              </div>
            </div>
            {historyLoading ? (
              <div className="lib-loading">Loading...</div>
            ) : currentLoans.length === 0 ? (
              <div className="lib-empty">
                <BookMarked size={36} color="#cbd5e1" />
                <p>No books currently borrowed</p>
              </div>
            ) : (
              <div className="lib-table-wrap">
                <table className="lib-table">
                  <thead>
                    <tr>
                      <th>Book</th>
                      <th>Due Date</th>
                      <th>Overdue</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentLoans.map(l => {
                      const od = daysOverdue(l)
                      const overdue = l.status === 'overdue' || od > 0
                      return (
                        <tr key={l.id}>
                          <td style={{ fontWeight: 600 }}>
                            {l.books?.title || '—'}
                            {l.copy?.copy_code && (
                              <span style={{ display: 'block', fontFamily: 'monospace', fontSize: 11, color: '#64748b' }}>{l.copy.copy_code}</span>
                            )}
                          </td>
                          <td>{fmtDate(l.due_date)}</td>
                          <td>
                            {overdue ? (
                              <span className="lib-badge" style={{ background: '#fee2e2', color: '#dc2626' }}>
                                <AlertTriangle size={11} /> {od} days
                              </span>
                            ) : (
                              <span className="text-muted" style={{ color: '#94a3b8' }}>—</span>
                            )}
                          </td>
                          <td>
                            <span className="lib-badge" style={{ background: overdue ? '#fee2e2' : '#dbeafe', color: overdue ? '#dc2626' : '#2563eb' }}>
                              {l.status}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }} className="print-hide">
                              <button className="lib-btn lib-btn-green" onClick={() => returnBook(l)}>
                                <CheckCircle2 size={14} /> Return
                              </button>
                              <button className="lib-btn" onClick={() => renewLoan(l)}>
                                <RefreshCw size={14} /> Renew
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="lib-card" style={{ marginBottom: 16 }}>
            <div className="lib-card-header">
              <div>
                <h2>Borrowing History ({history.length})</h2>
                <p>Previously borrowed and closed loans</p>
              </div>
              <History size={16} color="#94a3b8" />
            </div>
            {historyLoading ? (
              <div className="lib-loading">Loading...</div>
            ) : history.length === 0 ? (
              <div className="lib-empty">
                <History size={36} color="#cbd5e1" />
                <p>No borrowing history yet</p>
              </div>
            ) : (
              <div className="lib-table-wrap">
                <table className="lib-table">
                  <thead>
                    <tr>
                      <th>Book</th>
                      <th>Borrowed</th>
                      <th>Due Date</th>
                      <th>Returned</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map(l => (
                      <tr key={l.id}>
                        <td style={{ fontWeight: 600 }}>
                          {l.books?.title || '—'}
                          {l.copy?.copy_code && (
                            <span style={{ display: 'block', fontFamily: 'monospace', fontSize: 11, color: '#64748b' }}>{l.copy.copy_code}</span>
                          )}
                        </td>
                        <td>{fmtDate(l.issued_at || l.created_at)}</td>
                        <td>{fmtDate(l.due_date)}</td>
                        <td>{l.returned_at ? fmtDate(l.returned_at) : '—'}</td>
                        <td>
                          <span className="lib-badge" style={{
                            background: l.status === 'returned' ? '#dcfce7' : l.status === 'lost' ? '#fee2e2' : '#fef3c7',
                            color: l.status === 'returned' ? '#16a34a' : l.status === 'lost' ? '#dc2626' : '#b45309',
                          }}>
                            {l.status === 'returned' ? 'Returned' : l.status.charAt(0).toUpperCase() + l.status.slice(1)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="lib-card">
            <div className="lib-card-header">
              <div>
                <h2>Reservations ({reservations.length})</h2>
                <p>Books this member has reserved</p>
              </div>
            </div>
            {historyLoading ? (
              <div className="lib-loading">Loading...</div>
            ) : reservations.length === 0 ? (
              <div className="lib-empty">
                <BookMarked size={36} color="#cbd5e1" />
                <p>No reservations</p>
              </div>
            ) : (
              <div className="lib-table-wrap">
                <table className="lib-table">
                  <thead>
                    <tr>
                      <th>Book</th>
                      <th>Reserved On</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reservations.map(r => (
                      <tr key={r.id}>
                        <td style={{ fontWeight: 600 }}>{r.books?.title || '—'}</td>
                        <td>{fmtDate(r.reserved_at)}</td>
                        <td>
                          <span className="lib-badge" style={{
                            background: r.status === 'pending' ? '#fef3c7' : r.status === 'available' ? '#dcfce7' : '#f1f5f9',
                            color: r.status === 'pending' ? '#ca8a04' : r.status === 'available' ? '#16a34a' : '#64748b',
                          }}>
                            {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
