import { useState, useEffect } from 'react'
import { FileText, Printer, Users, CalendarDays, ClipboardList, UserPlus, TrendingUp } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { esc } from '../../utils/escapeHtml'
import { useAuthStore } from '../../store/authStore'
import { useSchool } from '../admin/useSchool'

const CATEGORY_LABELS = {
  fees: 'Fees / Finance', academic: 'Academic', library: 'Library', discipline: 'Discipline',
  admission: 'Admission', medical: 'Medical / Sick Bay', administration: 'Administration', general: 'General',
}

export default function Reports() {
  const { profile } = useAuthStore()
  const { school } = useSchool()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('overview')

  useEffect(() => {
    if (profile?.school_id) fetchReportData()
  }, [profile])

  const fetchReportData = async () => {
    setLoading(true)
    const schoolId = profile.school_id
    const today = new Date().toISOString().split('T')[0]
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7)

    const [
      visitorsAll, visitorsWeek, visitorsToday, onSite,
      apptsAll, apptsUpcoming, requestsAll, requestsOpen,
      prospectsAll, studentsActive, eventsUpcoming
    ] = await Promise.all([
      supabase.from('visitors').select('*').eq('school_id', schoolId).limit(500),
      supabase.from('visitors').select('*').eq('school_id', schoolId).gte('created_at', weekAgo.toISOString()).limit(500),
      supabase.from('visitors').select('*').eq('school_id', schoolId).gte('created_at', today).limit(500),
      supabase.from('visitors').select('*', { count: 'exact', head: true }).eq('school_id', schoolId).eq('status', 'checked_in'),
      supabase.from('appointments').select('*').eq('school_id', schoolId).limit(500),
      supabase.from('appointments').select('*').eq('school_id', schoolId).gte('appointment_date', today).limit(500),
      supabase.from('front_office_requests').select('*').eq('school_id', schoolId).limit(500),
      supabase.from('front_office_requests').select('*', { count: 'exact', head: true }).eq('school_id', schoolId).in('status', ['received', 'routed']),
      supabase.from('prospective_students').select('*').eq('school_id', schoolId).limit(500),
      supabase.from('students').select('*', { count: 'exact', head: true }).eq('school_id', schoolId).eq('status', 'active'),
      supabase.from('school_events').select('*').eq('school_id', schoolId).gte('date', today).limit(500),
    ])

    const visitors = visitorsAll.data || []
    const requests = requestsAll.data || []
    const prospects = prospectsAll.data || []
    const appointments = apptsAll.data || []

    const purposeCounts = {}
    visitors.forEach(v => { purposeCounts[v.purpose || 'Other'] = (purposeCounts[v.purpose || 'Other'] || 0) + 1 })
    const topPurposes = Object.entries(purposeCounts).sort((a, b) => b[1] - a[1]).slice(0, 5)

    const requestByCategory = {}
    requests.forEach(r => { requestByCategory[r.category] = (requestByCategory[r.category] || 0) + 1 })
    const topCategories = Object.entries(requestByCategory).sort((a, b) => b[1] - a[1])

    const requestStatus = {}
    requests.forEach(r => { requestStatus[r.status] = (requestStatus[r.status] || 0) + 1 })

    const stageCounts = {}
    prospects.forEach(p => { stageCounts[p.status] = (stageCounts[p.status] || 0) + 1 })

    const apptStatus = {}
    appointments.forEach(a => { apptStatus[a.status] = (apptStatus[a.status] || 0) + 1 })

    setData({
      schoolId,
      today,
      kpis: {
        visitorsToday: (visitorsToday.data || []).length,
        visitorsWeek: (visitorsWeek.data || []).length,
        visitorsTotal: visitors.length,
        onSite: onSite.count || 0,
        appointmentsUpcoming: (apptsUpcoming.data || []).length,
        appointmentsTotal: appointments.length,
        openRequests: requestsOpen.count || 0,
        requestsTotal: requests.length,
        prospects: prospects.length,
        studentsActive: studentsActive.count || 0,
        eventsUpcoming: (eventsUpcoming.data || []).length,
      },
      topPurposes,
      topCategories,
      requestStatus,
      stageCounts,
      apptStatus,
    })
    setLoading(false)
  }

  const handlePrint = () => {
    if (!data) return
    const w = window.open('', '_blank')
    if (!w) return
    const rows = (rowsData) => rowsData.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')
    const reqRows = (data.topCategories || []).map(([k, v]) => `<tr><td>${esc(CATEGORY_LABELS[k] || k)}</td><td style="text-align:center">${v}</td></tr>`).join('')
    const purposeRows = (data.topPurposes || []).map(([k, v]) => `<tr><td>${esc(k)}</td><td style="text-align:center">${v}</td></tr>`).join('')

    w.document.write(`
      <html><head><title>Front Office Report</title>
      <style>
        @page{size:A4;margin:12mm} *{font-family:Arial,sans-serif;box-sizing:border-box}
        h1{font-size:20px;margin:0} .school{font-size:13px;color:#555;margin:4px 0 18px}
        h2{font-size:14px;margin:18px 0 8px;border-bottom:2px solid #0F172A;padding-bottom:4px}
        .kpis{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:6px}
        .kpi{flex:1;min-width:130px;border:1px solid #ddd;border-radius:8px;padding:12px}
        .kpi b{display:block;font-size:20px} .kpi span{font-size:11px;color:#555}
        table{width:100%;border-collapse:collapse;margin-top:6px}
        th,td{border:1px solid #bbb;padding:6px 8px;font-size:11px;text-align:left}
        th{background:#f1f5f9}
      </style></head><body>
      <h1>Front Office Report — ${esc(school?.name || '')}</h1>
      <div class="school">Generated ${new Date().toLocaleString('en-KE')} • ${data.kpis.studentsActive} active students</div>
      <div class="kpis">
        <div class="kpi"><b>${data.kpis.visitorsToday}</b><span>Visitors today</span></div>
        <div class="kpi"><b>${data.kpis.visitorsWeek}</b><span>Visitors this week</span></div>
        <div class="kpi"><b>${data.kpis.onSite}</b><span>On campus now</span></div>
        <div class="kpi"><b>${data.kpis.appointmentsUpcoming}</b><span>Upcoming appointments</span></div>
        <div class="kpi"><b>${data.kpis.openRequests}</b><span>Open requests</span></div>
        <div class="kpi"><b>${data.kpis.prospects}</b><span>Admission inquiries</span></div>
      </div>
      <h2>Top Visit Purposes</h2>
      <table><thead><tr><th>Purpose</th><th style="width:80px">Count</th></tr></thead><tbody>${purposeRows || '<tr><td colspan="2">No data</td></tr>'}</tbody></table>
      <h2>Requests by Category</h2>
      <table><thead><tr><th>Category</th><th style="width:80px">Count</th></tr></thead><tbody>${reqRows || '<tr><td colspan="2">No data</td></tr>'}</tbody></table>
      </body></html>
    `)
    w.document.close()
    w.onload = () => { w.focus(); w.print() }
  }

  if (loading) return <div className="rcp-load"><div className="rcp-spin" /><span>Preparing reports...</span></div>

  const kpiCards = [
    { label: 'Visitors Today', value: data.kpis.visitorsToday, icon: <Users size={20} />, cls: 'rcp-kpi-icon--teal', color: '#0F766E' },
    { label: 'Visitors This Week', value: data.kpis.visitorsWeek, icon: <Users size={20} />, cls: 'rcp-kpi-icon--blue', color: '#1D4ED8' },
    { label: 'On Campus Now', value: data.kpis.onSite, icon: <Users size={20} />, cls: 'rcp-kpi-icon--green', color: '#16A34A' },
    { label: 'Upcoming Appointments', value: data.kpis.appointmentsUpcoming, icon: <CalendarDays size={20} />, cls: 'rcp-kpi-icon--purple', color: '#6D28D9' },
    { label: 'Open Requests', value: data.kpis.openRequests, icon: <ClipboardList size={20} />, cls: 'rcp-kpi-icon--amber', color: '#B45309' },
    { label: 'Admission Inquiries', value: data.kpis.prospects, icon: <UserPlus size={20} />, cls: 'rcp-kpi-icon--cyan', color: '#0891B2' },
  ]

  return (
    <div className="rcp-page">
      <div className="rcp-page-toolbar">
        <p className="rcp-page-toolbar-desc">Summary of visitors, appointments, requests and the admissions pipeline</p>
        <div className="rcp-page-toolbar-actions">
          <button className="rcp-btn-secondary" onClick={fetchReportData}>Refresh</button>
          <button className="rcp-btn-primary" onClick={handlePrint}><Printer size={14} /> Print Report</button>
        </div>
      </div>

      <div className="rcp-tabs">
        {['overview', 'visitors', 'requests', 'admissions'].map(t => (
          <button key={t} className={`rcp-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div className="rcp-kpi-grid">
        {kpiCards.map(k => (
          <div key={k.label} className="rcp-kpi">
            <div className="rcp-kpi-top">
              <div className={`rcp-kpi-icon ${k.cls}`}>{k.icon}</div>
              <span className="rcp-kpi-trend rcp-kpi-trend--flat"><TrendingUp size={12} /> Live</span>
            </div>
            <p className="rcp-kpi-val" style={{ color: k.color }}>{k.value}</p>
            <p className="rcp-kpi-label">{k.label}</p>
            <p className="rcp-kpi-sub">{school?.name || ''}</p>
          </div>
        ))}
      </div>

      <div className="rcp-two-col">
        <div className="rcp-card">
          <div className="rcp-card-hdr"><h3><FileText size={16} /> Top Visit Purposes</h3></div>
          {data.topPurposes.length === 0 ? (
            <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>No visitor data yet</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.topPurposes.map(([p, c]) => {
                const max = data.topPurposes[0][1] || 1
                return (
                  <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 13, color: '#475569', minWidth: 140 }}>{p}</span>
                    <div style={{ flex: 1, height: 8, background: '#f1f5f9', borderRadius: 20, overflow: 'hidden' }}>
                      <div style={{ width: `${(c / max) * 100}%`, height: '100%', background: '#0d9488', borderRadius: 20 }} />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', minWidth: 28, textAlign: 'right' }}>{c}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="rcp-card">
          <div className="rcp-card-hdr"><h3><ClipboardList size={16} /> Requests by Category</h3></div>
          {data.topCategories.length === 0 ? (
            <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>No requests logged yet</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.topCategories.map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', border: '1px solid #f1f5f9', borderRadius: 10, padding: '8px 12px' }}>
                  <span style={{ fontSize: 13, color: '#475569' }}>{CATEGORY_LABELS[k] || k}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{v}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rcp-two-col">
        <div className="rcp-card">
          <div className="rcp-card-hdr"><h3><Users size={16} /> Visitor Status</h3></div>
          <div className="rcp-stat-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="rcp-stat"><span className="rcp-stat-val">{data.kpis.visitorsTotal}</span><span className="rcp-stat-lbl">All-time records</span></div>
            <div className="rcp-stat"><span className="rcp-stat-val" style={{ color: '#0F766E' }}>{data.kpis.onSite}</span><span className="rcp-stat-lbl">On campus</span></div>
          </div>
        </div>
        <div className="rcp-card">
          <div className="rcp-card-hdr"><h3><UserPlus size={16} /> Admissions Pipeline</h3></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[['enquiry', 'Enquiry'], ['applied', 'Applied'], ['documents_received', 'Documents Received'], ['admitted', 'Admitted']].map(([k, label]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', border: '1px solid #f1f5f9', borderRadius: 10, padding: '8px 12px' }}>
                <span style={{ fontSize: 13, color: '#475569' }}>{label}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{data.stageCounts[k] || 0}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
