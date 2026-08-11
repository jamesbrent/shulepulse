import { useState, useEffect } from 'react'
import { Search, BookOpen, Send, X, User } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { fmtDate } from '../../lib/library'
import './LibrarianDashboard.css'

const STATUS_STYLE = {
  pending:   { background: '#dbeafe', color: '#2563eb' },
  available: { background: '#dcfce7', color: '#16a34a' },
  fulfilled: { background: '#f1f5f9', color: '#475569' },
  cancelled: { background: '#fee2e2', color: '#dc2626' },
}

export default function ClassTeacherLibrary({ schoolId, classes = [] }) {
  const [students, setStudents] = useState([])
  const [books, setBooks] = useState([])
  const [requests, setRequests] = useState([])
  const [memberByStudentId, setMemberByStudentId] = useState({})
  const [studentId, setStudentId] = useState('')
  const [bookId, setBookId] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchAll()
  }, [schoolId, classes.join(',')])

  const memberForStudent = (member, student) => {
    if (student.email && member.email && member.email.toLowerCase() === student.email.toLowerCase()) return true
    if (student.admission_number && member.member_code === `STD/${student.admission_number}`) return true
    return false
  }

  const fetchAll = async () => {
    if (!schoolId || !classes.length) { setLoading(false); return }
    setLoading(true)
    const [studentRes, booksRes, membersRes, resRes] = await Promise.all([
      supabase.from('students')
        .select('id, school_id, admission_number, full_name, email, class, stream, photo_url')
        .eq('school_id', schoolId)
        .in('class', classes)
        .eq('status', 'active')
        .order('full_name'),
      supabase.from('library_books').select('*').eq('school_id', schoolId).order('title'),
      supabase.from('library_members').select('*').eq('school_id', schoolId),
      supabase.from('library_reservations')
        .select('*, books:library_books(title, author), members:library_members(full_name, member_type, member_code)')
        .eq('school_id', schoolId)
        .order('reserved_at', { ascending: false })
        .limit(200),
    ])
    const studs = studentRes.data || []
    const members = membersRes.data || []
    const map = {}
    studs.forEach(s => {
      const m = members.find(mem => memberForStudent(mem, s))
      if (m) map[s.id] = m.id
    })
    const memberIds = new Set(Object.values(map))
    setStudents(studs)
    setBooks(booksRes.data || [])
    setMemberByStudentId(map)
    setRequests((resRes.data || []).filter(r => memberIds.has(r.member_id)))
    setLoading(false)
  }

  const filteredRequests = requests.filter(r => {
    const q = search.toLowerCase()
    return !q
      || r.books?.title?.toLowerCase().includes(q)
      || r.members?.full_name?.toLowerCase().includes(q)
  })

  const submitRequest = async () => {
    setError('')
    if (!studentId || !bookId) {
      setError('Select a student and a book to request')
      return
    }
    setSaving(true)
    const student = students.find(s => s.id === studentId)
    let memberId = memberByStudentId[studentId]

    if (!memberId) {
      const code = student.admission_number ? `STD/${student.admission_number}` : null
      let existing = null
      if (student.email) {
        const { data } = await supabase.from('library_members')
          .select('id').eq('school_id', schoolId).eq('email', student.email).maybeSingle()
        existing = data
      }
      if (!existing && code) {
        const { data } = await supabase.from('library_members')
          .select('id').eq('school_id', schoolId).eq('member_code', code).maybeSingle()
        existing = data
      }
      if (existing) {
        memberId = existing.id
      } else {
        const { data: created, error: err } = await supabase.from('library_members').insert({
          school_id: schoolId,
          member_type: 'student',
          full_name: student.full_name,
          email: student.email,
          member_code: code,
          status: 'active',
        }).select().single()
        if (err) { setError(err.message); setSaving(false); return }
        memberId = created.id
        setMemberByStudentId(prev => ({ ...prev, [studentId]: memberId }))
      }
    }

    const dup = requests.find(r => r.book_id === bookId && r.member_id === memberId && ['pending', 'available'].includes(r.status))
    if (dup) {
      setError('This student already has a pending request for this book')
      setSaving(false)
      return
    }

    const { data, error: insErr } = await supabase.from('library_reservations').insert({
      school_id: schoolId,
      book_id: bookId,
      member_id: memberId,
      status: 'pending',
      reserved_at: new Date().toISOString(),
    }).select('*, books:library_books(title, author), members:library_members(full_name, member_type, member_code)').single()
    if (insErr) { setError(insErr.message); setSaving(false); return }
    setRequests(prev => [data, ...prev])
    setStudentId('')
    setBookId('')
    setSaving(false)
  }

  const cancelRequest = async (r) => {
    await supabase.from('library_reservations')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
      .eq('id', r.id)
    setRequests(prev => prev.map(x => x.id === r.id ? { ...x, status: 'cancelled', cancelled_at: new Date().toISOString() } : x))
  }

  if (loading) return <div className="lib-loading">Loading class library...</div>

  return (
    <div>
      <div className="lib-card" style={{ marginBottom: 16 }}>
        <div className="lib-card-header">
          <div>
            <h2>Borrow Request for Class Students</h2>
            <p>The library approves and issues the book after your request</p>
          </div>
          <BookOpen size={16} color="#94a3b8" />
        </div>

        <div className="lib-toolbar" style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: 12 }}>
          <select className="lib-select" value={studentId} onChange={e => { setStudentId(e.target.value); setError('') }}>
            <option value="">Select student...</option>
            {students.map(s => (
              <option key={s.id} value={s.id}>{s.full_name} — {s.class}{s.stream ? ` ${s.stream}` : ''} (ADM {s.admission_number || '—'})</option>
            ))}
          </select>
          <select className="lib-select" value={bookId} onChange={e => { setBookId(e.target.value); setError('') }}>
            <option value="">Select book...</option>
            {books.map(b => (
              <option key={b.id} value={b.id}>{b.title}{b.available_copies > 0 ? ' (available)' : ' (borrowed)'}</option>
            ))}
          </select>
          <button className="lib-btn lib-btn-blue" onClick={submitRequest} disabled={saving || !students.length}>
            <Send size={15} /> {saving ? 'Requesting...' : 'Request Loan'}
          </button>
        </div>

        {error && (
          <div style={{ padding: '8px 14px', borderRadius: 8, background: '#fee2e2', color: '#991b1b', fontSize: 12, fontWeight: 500, marginTop: 12 }}>
            {error}
          </div>
        )}
      </div>

      <div className="lib-card">
        <div className="lib-card-header">
          <div>
            <h2>Borrow Requests ({filteredRequests.length})</h2>
            <p>Pending requests are approved by the library</p>
          </div>
        </div>

        <div className="lib-search" style={{ maxWidth: 320, marginBottom: 12 }}>
          <Search size={15} color="#94a3b8" />
          <input placeholder="Search by book or student..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {filteredRequests.length === 0 ? (
          <div className="lib-empty">
            <BookOpen size={36} color="#cbd5e1" />
            <p>No borrow requests</p>
            <span>Request a book for a class student above</span>
          </div>
        ) : (
          <div className="lib-table-wrap">
            <table className="lib-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Book</th>
                  <th>Requested On</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.map(r => (
                  <tr key={r.id}>
                    <td>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 26, height: 26, borderRadius: '50%', background: '#dbeafe', color: '#2563eb', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                          <User size={13} />
                        </span>
                        <span>
                          <span style={{ display: 'block', fontWeight: 600 }}>{r.members?.full_name || '—'}</span>
                          <span style={{ fontSize: 11, color: '#94a3b8' }}>{r.members?.member_code || ''}</span>
                        </span>
                      </span>
                    </td>
                    <td>
                      <span style={{ display: 'block', fontWeight: 600 }}>{r.books?.title || '—'}</span>
                      <span className="text-muted" style={{ fontSize: 11, color: '#94a3b8' }}>{r.books?.author || ''}</span>
                    </td>
                    <td>{fmtDate(r.reserved_at)}</td>
                    <td>
                      <span className="lib-badge" style={STATUS_STYLE[r.status] || STATUS_STYLE.pending}>
                        {r.status === 'pending' ? 'Awaiting Approval' : r.status}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        {['pending', 'available'].includes(r.status) && (
                          <button className="lib-btn" onClick={() => cancelRequest(r)}>
                            <X size={14} /> Withdraw
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
