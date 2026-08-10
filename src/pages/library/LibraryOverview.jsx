import { useState, useEffect } from 'react'
import {
  BookOpen, CheckCircle2, Clock, AlertTriangle, BookMarked, Users
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { fmtDate } from '../../lib/library'

export default function LibraryOverview({ schoolId, onNavigate }) {
  const [stats, setStats] = useState({
    totalBooks: 0,
    available: 0,
    borrowed: 0,
    overdue: 0,
    reservations: 0,
    members: 0,
  })
  const [recentLoans, setRecentLoans] = useState([])
  const [topBooks, setTopBooks] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [schoolId])

  const fetchData = async () => {
    setLoading(true)
    const today = new Date().toISOString().slice(0, 10)
    const [booksRes, loansRes, overdueRes, resRes, membersRes, recentRes] = await Promise.all([
      supabase.from('library_books').select('id, total_copies, available_copies').eq('school_id', schoolId),
      supabase.from('library_loans').select('id').eq('school_id', schoolId).in('status', ['issued', 'overdue']),
      supabase.from('library_loans').select('id').eq('school_id', schoolId).or(`status.eq.overdue,and(status.eq.issued,due_date.lt.${today})`),
      supabase.from('library_reservations').select('id').eq('school_id', schoolId).eq('status', 'pending'),
      supabase.from('library_members').select('id').eq('school_id', schoolId).eq('status', 'active'),
      supabase.from('library_loans')
        .select('*, books:library_books(title, author), members:library_members(full_name, member_type)')
        .eq('school_id', schoolId)
        .order('created_at', { ascending: false })
        .limit(6),
    ])

    const totalBooks = (booksRes.data || []).reduce((s, b) => s + (b.total_copies || 0), 0)
    const available = (booksRes.data || []).reduce((s, b) => s + (b.available_copies || 0), 0)

    setStats({
      totalBooks,
      available,
      borrowed: (loansRes.data || []).length,
      overdue: (overdueRes.data || []).length,
      reservations: (resRes.data || []).length,
      members: (membersRes.data || []).length,
    })
    setRecentLoans(recentRes.data || [])

    const { data: loans } = await supabase
      .from('library_loans')
      .select('book_id, books:library_books(title)')
      .eq('school_id', schoolId)
      .eq('status', 'returned')
      .limit(300)
    const countMap = {}
    ;(loans || []).forEach(l => {
      const t = l.books?.title || 'Unknown'
      countMap[t] = (countMap[t] || 0) + 1
    })
    setTopBooks(Object.entries(countMap).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([title, count]) => ({ title, count })))
    setLoading(false)
  }

  const statItems = [
    { label: 'Total Books', value: stats.totalBooks, icon: <BookOpen size={20} />, color: '#2563eb', bg: '#dbeafe' },
    { label: 'Available', value: stats.available, icon: <CheckCircle2 size={20} />, color: '#16a34a', bg: '#dcfce7' },
    { label: 'Borrowed', value: stats.borrowed, icon: <BookMarked size={20} />, color: '#7c3aed', bg: '#f3e8ff' },
    { label: 'Overdue', value: stats.overdue, icon: <Clock size={20} />, color: '#ca8a04', bg: '#fef3c7' },
    { label: 'Reservations', value: stats.reservations, icon: <AlertTriangle size={20} />, color: '#dc2626', bg: '#fee2e2' },
    { label: 'Active Members', value: stats.members, icon: <Users size={20} />, color: '#0891b2', bg: '#cffafe' },
  ]

  if (loading) return <div className="lib-loading">Loading library data...</div>

  return (
    <div>
      <div className="lib-grid" style={{ marginBottom: 20 }}>
        {statItems.map(s => (
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

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, alignItems: 'start' }}>
        <div className="lib-card">
          <div className="lib-card-header">
            <div>
              <h2>Recent Activity</h2>
              <p>Latest borrowing activity in the library</p>
            </div>
            <button className="lib-btn" onClick={() => onNavigate('borrow')}>View all</button>
          </div>
          {recentLoans.length === 0 ? (
            <div className="lib-empty">
              <BookOpen size={36} color="#cbd5e1" />
              <p>No loans yet</p>
              <span>Issue books to see activity here</span>
            </div>
          ) : (
            <div className="lib-table-wrap">
              <table className="lib-table">
                <thead>
                  <tr><th>Book</th><th>Member</th><th>Due</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {recentLoans.map(l => (
                    <tr key={l.id}>
                      <td style={{ fontWeight: 600 }}>{l.books?.title || '—'}</td>
                      <td>{l.members?.full_name || '—'}</td>
                      <td>{fmtDate(l.due_date)}</td>
                      <td>
                        <span className="lib-badge" style={{ background: '#e0e7ff', color: '#3730a3' }}>
                          {l.status}
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
              <h2>Most Borrowed</h2>
              <p>All-time popular titles</p>
            </div>
          </div>
          {topBooks.length === 0 ? (
            <div className="lib-empty">
              <p>No data yet</p>
            </div>
          ) : (
            topBooks.map((b, i) => (
              <div key={b.title} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ width: 22, height: 22, borderRadius: 6, background: i < 3 ? '#2563eb' : '#e2e8f0', color: i < 3 ? '#fff' : '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>
                  {i + 1}
                </span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{b.title}</span>
                <span className="lib-badge" style={{ background: '#f1f5f9', color: '#475569' }}>{b.count}×</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
