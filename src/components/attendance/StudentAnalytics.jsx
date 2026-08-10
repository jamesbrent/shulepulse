import { useState, useEffect, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { supabase } from '../../lib/supabase'
import { Search, TrendingUp, User, X } from 'lucide-react'

const STATUS_COLORS = { present: '#16a34a', absent: '#dc2626', late: '#ca8a04', excused: '#2563eb' }

export default function StudentAnalytics({ schoolId, filterClass }) {
  const [query, setQuery] = useState('')
  const [students, setStudents] = useState([])
  const [selected, setSelected] = useState(null)
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const loadStudents = async (search) => {
    let q = supabase
      .from('students')
      .select('id, full_name, admission_number, class, stream')
      .eq('school_id', schoolId)
      .eq('status', 'active')
    if (filterClass && filterClass !== 'all') q = q.eq('class', filterClass)
    if (search) q = q.or(`full_name.ilike.%${search}%,admission_number.ilike.%${search}%`)
    const { data } = await q.limit(20)
    setStudents(data || [])
  }

  useEffect(() => {
    if (!dropdownOpen && !query) return
    const timer = setTimeout(() => loadStudents(query), query ? 200 : 0)
    return () => clearTimeout(timer)
  }, [query, dropdownOpen, schoolId, filterClass])

  useEffect(() => {
    if (!selected) return
    const fetchRecords = async () => {
      setLoading(true)
      const { data } = await supabase
        .from('attendance')
        .select('date, status')
        .eq('school_id', schoolId)
        .eq('student_id', selected.id)
        .order('date', { ascending: false })
        .limit(60)
      setRecords(data || [])
      setLoading(false)
    }
    fetchRecords()
  }, [selected, schoolId])

  const stats = useMemo(() => {
    if (records.length === 0) return null
    const total = records.length
    const present = records.filter(r => r.status === 'present').length
    const absent = records.filter(r => r.status === 'absent').length
    const late = records.filter(r => r.status === 'late').length
    const excused = records.filter(r => r.status === 'excused').length
    return { total, present, absent, late, excused, rate: Math.round((present / total) * 100) }
  }, [records])

  const chartData = useMemo(() => {
    if (!stats) return []
    return [
      { name: 'Present', value: stats.present, color: STATUS_COLORS.present },
      { name: 'Absent', value: stats.absent, color: STATUS_COLORS.absent },
      { name: 'Late', value: stats.late, color: STATUS_COLORS.late },
      { name: 'Excused', value: stats.excused, color: STATUS_COLORS.excused },
    ].filter(d => d.value > 0)
  }, [stats])

  return (
    <div className="att-trend-card">
      <div className="att-trend-header">
        <h3 className="att-trend-title"><User size={16} /> Student Analytics</h3>
      </div>

      <div style={{ padding: '16px 20px', position: 'relative' }}>
        <div className="att-ep-student-search">
          <Search size={13} className="att-ep-search-icon" />
          <input
            className="att-ep-input"
            placeholder="Search student name or adm no..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => { setDropdownOpen(true); if (!selected) loadStudents('') }}
            onBlur={() => setTimeout(() => setDropdownOpen(false), 200)}
          />
          {selected && (
            <button className="att-ep-clear-student" onClick={() => { setSelected(null); setQuery(''); setRecords([]) }}>
              <X size={13} />
            </button>
          )}
        </div>

        {dropdownOpen && !selected && (
          <div className="att-ep-student-dropdown" style={{ position: 'absolute', left: 20, right: 20, top: '100%' }}>
            {students.length === 0 && (
              <div className="att-ep-student-option" style={{ color: '#94a3b8', cursor: 'default' }}>Type to search students...</div>
            )}
            {students.map(s => (
              <button key={s.id} className="att-ep-student-option" onClick={() => { setSelected(s); setQuery(`${s.full_name} (${s.admission_number})`); setStudents([]); setDropdownOpen(false) }}>
                {s.full_name}{' \u2014 '}<span className="text-muted">{s.admission_number}{' \u00B7 '}{s.class}{s.stream ? ` ${s.stream}` : ''}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <div style={{ padding: '0 20px 16px' }}>
          <div className="att-trend-summary" style={{ margin: '0 -20px', padding: '12px 20px', borderTop: '1px solid #f1f5f9' }}>
            <div className="att-trend-stat">
              <span className="att-trend-stat-label">Total Days</span>
              <span className="att-trend-stat-value">{stats?.total || 0}</span>
            </div>
            <div className="att-trend-stat">
              <span className="att-trend-stat-label">Present</span>
              <span className="att-trend-stat-value" style={{ color: '#16a34a' }}>{stats?.present || 0}</span>
            </div>
            <div className="att-trend-stat">
              <span className="att-trend-stat-label">Absent</span>
              <span className="att-trend-stat-value" style={{ color: '#dc2626' }}>{stats?.absent || 0}</span>
            </div>
            <div className="att-trend-stat">
              <span className="att-trend-stat-label">Late</span>
              <span className="att-trend-stat-value" style={{ color: '#ca8a04' }}>{stats?.late || 0}</span>
            </div>
            <div className="att-trend-stat">
              <span className="att-trend-stat-label">Excused</span>
              <span className="att-trend-stat-value" style={{ color: '#2563eb' }}>{stats?.excused || 0}</span>
            </div>
            <div className="att-trend-stat">
              <span className="att-trend-stat-label">Rate</span>
              <span className="att-trend-stat-value">{stats?.rate || 0}%</span>
            </div>
          </div>

          {loading ? (
            <div className="loading-state" style={{ padding: '30px' }}>Loading...</div>
          ) : chartData.length > 0 ? (
            <div className="att-chart-wrap" style={{ padding: '8px 0 0' }}>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }}
                  />
                  <Bar dataKey="value" name="Days" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="empty-att" style={{ padding: '30px' }}>
              <TrendingUp size={28} />
              <p>No attendance records found</p>
              <span>Records will appear once attendance is marked</span>
            </div>
          )}
        </div>
      )}

      {!selected && (
        <div className="empty-att" style={{ padding: '30px', border: 'none' }}>
          <User size={28} />
          <p>Search for a student to view analytics</p>
          <span>View attendance breakdown, trends, and stats per student</span>
        </div>
      )}
    </div>
  )
}
