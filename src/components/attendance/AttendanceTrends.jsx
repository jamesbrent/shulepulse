import { useState, useEffect } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { supabase } from '../../lib/supabase'
import { TrendingUp } from 'lucide-react'

export default function AttendanceTrends({ schoolId, filterClass }) {
  const [trendType, setTrendType] = useState('weekly')
  const [chartData, setChartData] = useState([])
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState({ avgRate: 0, bestDay: '', bestRate: 0, worstDay: '', worstRate: 0 })

  useEffect(() => {
    fetchTrendData()
  }, [trendType, filterClass, schoolId])

  const fetchTrendData = async () => {
    setLoading(true)
    const end = new Date()
    const start = new Date()
    if (trendType === 'weekly') {
      start.setDate(start.getDate() - 6)
    } else {
      start.setDate(start.getDate() - 29)
    }
    const startStr = start.toISOString().split('T')[0]
    const endStr = end.toISOString().split('T')[0]

    let query = supabase
      .from('attendance')
      .select('date, status')
      .eq('school_id', schoolId)
      .gte('date', startStr)
      .lte('date', endStr)
    if (filterClass && filterClass !== 'all') {
      query = query.eq('class_name', filterClass)
    }
    const { data } = await query

    if (!data || data.length === 0) {
      setChartData([])
      setSummary({ avgRate: 0, bestDay: '', bestRate: 0, worstDay: '', worstRate: 0 })
      setLoading(false)
      return
    }

    const byDate = {}
    data.forEach(r => {
      if (!byDate[r.date]) byDate[r.date] = { present: 0, absent: 0, late: 0, excused: 0, total: 0 }
      byDate[r.date][r.status] = (byDate[r.date][r.status] || 0) + 1
      byDate[r.date].total++
    })

    let days = Object.entries(byDate)
      .map(([date, d]) => ({
        date,
        present: d.present,
        absent: d.absent,
        late: d.late,
        excused: d.excused,
        total: d.total,
        rate: Math.round((d.present / d.total) * 100),
      }))
      .sort((a, b) => a.date.localeCompare(b.date))

    if (trendType === 'weekly') {
      days.forEach(d => {
        const dt = new Date(d.date + 'T00:00:00')
        d.label = dt.toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric' })
      })
    } else {
      const weeks = {}
      days.forEach(d => {
        const dt = new Date(d.date + 'T00:00:00')
        const day = dt.getDay()
        const diff = dt.getDate() - day + (day === 0 ? -6 : 1)
        const monday = new Date(dt)
        monday.setDate(diff)
        const wk = monday.toISOString().split('T')[0]
        if (!weeks[wk]) weeks[wk] = { present: 0, absent: 0, late: 0, excused: 0, total: 0 }
        weeks[wk].present += d.present
        weeks[wk].absent += d.absent
        weeks[wk].late += d.late
        weeks[wk].excused += d.excused
        weeks[wk].total += d.total
      })
      days = Object.entries(weeks)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([wk, w], i) => ({
          date: wk,
          label: `Week ${i + 1}`,
          present: w.present,
          absent: w.absent,
          late: w.late,
          excused: w.excused,
          total: w.total,
          rate: Math.round((w.present / w.total) * 100),
        }))
    }

    setChartData(days)

    const rates = days.filter(d => d.total > 0).map(d => d.rate)
    if (rates.length > 0) {
      const avgRate = Math.round(rates.reduce((a, b) => a + b, 0) / rates.length)
      const best = days.reduce((b, d) => d.rate > b.rate ? d : b, days[0])
      const worst = days.reduce((w, d) => d.rate < w.rate ? d : w, days[0])
      setSummary({ avgRate, bestDay: best.label, bestRate: best.rate, worstDay: worst.label, worstRate: worst.rate })
    }
    setLoading(false)
  }

  return (
    <div className="att-trend-card">
      <div className="att-trend-header">
        <h3 className="att-trend-title"><TrendingUp size={16} /> Attendance Trends</h3>
        <div className="att-trend-tabs">
          <button
            className={`att-trend-tab ${trendType === 'weekly' ? 'active' : ''}`}
            onClick={() => setTrendType('weekly')}
          >
            Weekly
          </button>
          <button
            className={`att-trend-tab ${trendType === 'monthly' ? 'active' : ''}`}
            onClick={() => setTrendType('monthly')}
          >
            Monthly
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading-state" style={{ padding: '40px' }}>Loading trends...</div>
      ) : chartData.length === 0 ? (
        <div className="empty-att" style={{ padding: '40px' }}>
          <TrendingUp size={32} />
          <p>No trend data available</p>
          <span>Attendance records will appear here once marked</span>
        </div>
      ) : (
        <>
          <div className="att-trend-summary">
            <div className="att-trend-stat">
              <span className="att-trend-stat-label">Avg Rate</span>
              <span className="att-trend-stat-value">{summary.avgRate}%</span>
            </div>
            <div className="att-trend-stat">
              <span className="att-trend-stat-label">Best Day</span>
              <span className="att-trend-stat-value">{summary.bestDay} ({summary.bestRate}%)</span>
            </div>
            <div className="att-trend-stat">
              <span className="att-trend-stat-label">Worst Day</span>
              <span className="att-trend-stat-value">{summary.worstDay} ({summary.worstRate}%)</span>
            </div>
          </div>

          <div className="att-chart-wrap">
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ fontWeight: 600, color: '#1e293b', marginBottom: 4 }}
                />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Bar dataKey="present" stackId="a" fill="#16a34a" name="Present" radius={[2, 2, 0, 0]} />
                <Bar dataKey="absent" stackId="a" fill="#dc2626" name="Absent" radius={[2, 2, 0, 0]} />
                <Bar dataKey="late" stackId="a" fill="#ca8a04" name="Late" radius={[2, 2, 0, 0]} />
                <Bar dataKey="excused" stackId="a" fill="#2563eb" name="Excused" radius={[2, 2, 0, 0]} />
                <Line type="monotone" dataKey="rate" stroke="#6366f1" name="Rate %" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  )
}
