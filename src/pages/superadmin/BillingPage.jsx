import { useState, useEffect } from 'react'
import {
  CreditCard, School, DollarSign, Users, Calendar,
  ArrowUp, ArrowDown, Edit3, Loader, TrendingUp
} from 'lucide-react'
import { fetchSubscriptionStats, fetchUpcomingRenewals } from '../../features/superadmin/subscriptionService'
import { fetchAllPlans } from '../../features/access/featureAccessService'
import PlanChangeModal from '../../features/subscription/PlanChangeModal'
import './BillingPage.css'

export default function BillingPage() {
  const [data, setData] = useState(null)
  const [renewals, setRenewals] = useState([])
  const [plansMeta, setPlansMeta] = useState({})
  const [loading, setLoading] = useState(true)
  const [changePlanSchool, setChangePlanSchool] = useState(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [stats, upcoming, plansData] = await Promise.all([
        fetchSubscriptionStats(),
        fetchUpcomingRenewals(60),
        fetchAllPlans(),
      ])
      setData(stats)
      setRenewals(upcoming)
      const meta = {}
      plansData.forEach((p) => {
        meta[p.key] = { label: p.label, color: p.color, bg: p.bg, monthly_price: p.monthly_price }
      })
      setPlansMeta(meta)
    } catch (err) {
      console.error('[Billing] load error:', err)
    }
    setLoading(false)
  }

  if (loading) return <div className="loading-state">Loading subscription data...</div>
  if (!data) return <div className="loading-state">Failed to load data</div>

  const totalSchools = data.schools.length
  const planEntries = Object.entries(data.planGroups)
  const getPrice = (planKey) => plansMeta[planKey]?.monthly_price || 0

  return (
    <div className="billing-page">
      <div className="billing-stats">
        <div className="su-stat-card">
          <div className="stat-card-top">
            <div className="su-stat-icon" style={{ color: '#2563eb' }}><DollarSign size={20} /></div>
          </div>
          <p className="su-stat-label">Monthly Recurring Revenue</p>
          <p className="su-stat-value" style={{ color: '#2563eb' }}>KES {data.totalMrr.toLocaleString()}</p>
          <p className="su-stat-sub">Across {totalSchools} schools</p>
        </div>
        <div className="su-stat-card">
          <div className="stat-card-top">
            <div className="su-stat-icon" style={{ color: '#16a34a' }}><School size={20} /></div>
          </div>
          <p className="su-stat-label">Schools by Plan</p>
          <p className="su-stat-value" style={{ color: '#16a34a' }}>
            {planEntries.map(([key, list]) => `${plansMeta[key]?.label || key}: ${list.length}`).join(' · ')}
          </p>
          <p className="su-stat-sub">{totalSchools} total schools</p>
        </div>
        <div className="su-stat-card">
          <div className="stat-card-top">
            <div className="su-stat-icon" style={{ color: '#7c3aed' }}><Users size={20} /></div>
          </div>
          <p className="su-stat-label">Avg Revenue per School</p>
          <p className="su-stat-value" style={{ color: '#7c3aed' }}>KES {totalSchools > 0 ? Math.round(data.totalMrr / totalSchools).toLocaleString() : '0'}</p>
          <p className="su-stat-sub">Monthly average</p>
        </div>
        <div className="su-stat-card">
          <div className="stat-card-top">
            <div className="su-stat-icon" style={{ color: '#ca8a04' }}><Calendar size={20} /></div>
          </div>
          <p className="su-stat-label">Upcoming Renewals</p>
          <p className="su-stat-value" style={{ color: '#ca8a04' }}>{renewals.length}</p>
          <p className="su-stat-sub">Within 60 days</p>
        </div>
      </div>

      {renewals.length > 0 && (
        <div className="super-card">
          <div className="card-header"><h3><Calendar size={16} /> Upcoming Renewals (Next 60 Days)</h3></div>
          <table className="schools-table">
            <thead>
              <tr>
                <th>School</th>
                <th>Plan</th>
                <th>Renewal Date</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {renewals.map((s) => (
                <tr key={s.id}>
                  <td className="school-name-cell">
                    <div className="school-icon">{s.name?.[0]}</div>
                    {s.name}
                  </td>
                  <td><span className={`plan-badge ${s.plan}`}>{s.plan}</span></td>
                  <td>{s.subscription_end ? new Date(s.subscription_end).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td>
                  <td>KES {getPrice(s.plan).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="super-card">
        <div className="card-header">
          <h3><CreditCard size={16} /> All Schools by Plan</h3>
        </div>
        {planEntries.map(([planKey, schools]) => (
          <div key={planKey} style={{ marginBottom: 24 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
              padding: '8px 12px', borderRadius: 8, background: plansMeta[planKey]?.bg || '#f1f5f9',
            }}>
              <span style={{ fontWeight: 600, fontSize: 14, color: plansMeta[planKey]?.color || '#64748b', textTransform: 'capitalize' }}>
                {plansMeta[planKey]?.label || planKey}
              </span>
              <span style={{ fontSize: 12, color: '#64748b' }}>
                ({schools.length} schools · KES {getPrice(planKey).toLocaleString()}/mo each)
              </span>
            </div>
            {schools.length === 0 ? (
              <p className="empty-state" style={{ padding: 12 }}>No schools on this plan</p>
            ) : (
              <table className="schools-table">
                <thead>
                  <tr>
                    <th>School Name</th>
                    <th>Status</th>
                    <th>Started</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {schools.map((s) => (
                    <tr key={s.id}>
                      <td className="school-name-cell">
                        <div className="school-icon">{s.name?.[0]}</div>
                        {s.name}
                      </td>
                      <td><span className={`status-dot ${s.status}`}></span>{s.status}</td>
                      <td style={{ fontSize: 12, color: '#64748b' }}>
                        {s.subscription_start
                          ? new Date(s.subscription_start).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })
                          : s.created_at
                            ? new Date(s.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })
                            : '—'}
                      </td>
                      <td>
                        <button className="action-btn" onClick={() => setChangePlanSchool(s)}>
                          <Edit3 size={13} /> Change Plan
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
      </div>

      {changePlanSchool && (
        <PlanChangeModal
          school={changePlanSchool}
          onClose={() => setChangePlanSchool(null)}
          onChanged={() => loadData()}
        />
      )}
    </div>
  )
}
