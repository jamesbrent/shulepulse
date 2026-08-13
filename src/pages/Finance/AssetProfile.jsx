import {
  ArrowLeft, Wrench, Coins, TrendingDown, Trash2, Pencil,
  Paperclip, FileText, MapPin, User, History, Camera, Landmark
} from 'lucide-react'
import { fmt, fmtDate } from '../admin/fees/utils/feesHelpers'
import { assetStatus, DEPRECIATION_METHODS, calcNbv, monthlyDepreciation, DOCUMENT_TYPES, kraTaxClass } from './assetsUtils'
import { computeAssetSchedule, activeRule } from './taxUtils'

const statusBadge = (s) => {
  const meta = assetStatus(s)
  return <span className="as-status-badge" style={{ background: `${meta.color}1a`, color: meta.color }}>{meta.label}</span>
}

export default function AssetProfile({
  asset, school, categories, suppliers, staffMap,
  events, custody, locations, maintenance, documents,
  taxRules = [], taxSchedules = [], runLines = [],
  onBack, onAssign, onDispose, onMaintain, onDepreciate, onEdit, onUploadDoc, onViewDoc,
}) {
  const cat = categories.find((c) => c.id === asset.category_id)
  const supplier = suppliers.find((s) => s.id === asset.supplier_id)
  const docLabel = (t) => DOCUMENT_TYPES.find((d) => d.value === t)?.label || t
  const methodLabel = (m) => DEPRECIATION_METHODS.find((d) => d.value === m)?.label || m

  const assetEvents = events.filter((e) => e.asset_id === asset.id)
  const custodyHistory = custody.filter((c) => c.asset_id === asset.id)
  const locationHistory = locations.filter((l) => l.asset_id === asset.id)
  const maintRecords = maintenance.filter((m) => m.asset_id === asset.id)
  const docs = documents.filter((d) => d.asset_id === asset.id)
  const lastMaint = maintRecords[0]

  // ── Tax: live schedule for the current year of income + historical rows ──
  const yearOfIncome = new Date().getFullYear()
  const taxPreview = computeAssetSchedule({ asset, taxRules, taxSchedules, yearOfIncome })
  const taxHistory = (taxSchedules || [])
    .filter((s) => s.asset_id === asset.id)
    .sort((a, b) => b.year_of_income - a.year_of_income)
  const deprHistory = (runLines || [])
    .filter((l) => l.asset_id === asset.id)
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
  const wearRule = activeRule(taxRules, asset.tax_class, 'wear_tear', `${yearOfIncome}-12-31`)
  const invRule = activeRule(taxRules, asset.investment_class, 'investment', `${yearOfIncome}-12-31`)
  const taxTreatment = !asset.tax_class && !asset.investment_class
    ? 'None'
    : [wearRule && 'Wear & Tear', invRule && 'Investment Allowance'].filter(Boolean).join(' + ') || 'None'

  return (
    <div className="as-profile">
      {/* ── Header ── */}
      <div className="as-profile-head">
        <div className="as-profile-title">
          <button className="as-back-btn" onClick={onBack}><ArrowLeft size={16} /> Back to Register</button>
          <div className="as-profile-name-row">
            <h2>{asset.asset_id}</h2>
            {statusBadge(asset.status)}
          </div>
          <p className="as-profile-name">{asset.name}</p>
          <p className="as-profile-sub">{cat?.name || 'Uncategorised'} · {asset.asset_type || 'equipment'}</p>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div className="as-profile-nbv">
            <span>Financial Accounting</span>
            <strong>{fmt(calcNbv(asset))}</strong>
            <small>Net Book Value · Cost {fmt(asset.purchase_cost)} − Depn {fmt(asset.accumulated_depreciation)}</small>
          </div>
          <div className="as-profile-nbv as-tax-wdv">
            <span>Tax</span>
            <strong>{fmt(taxPreview.closing_wtd)}</strong>
            <small>Tax Written Down Value · {yearOfIncome} allowance {fmt(taxPreview.total_allowance)}</small>
          </div>
        </div>
      </div>

      <div className="as-actions">
        <button className="as-btn-primary" onClick={() => onAssign(asset)}><User size={14} /> Assign / Transfer</button>
        <button className="as-btn-outline" onClick={() => onMaintain(asset)}><Wrench size={14} /> Maintenance</button>
        <button className="as-btn-outline" onClick={() => onDepreciate(asset)}><TrendingDown size={14} /> Depreciate</button>
        <button className="as-btn-outline" onClick={() => onUploadDoc(asset)}><Paperclip size={14} /> Upload Doc</button>
        <button className="as-btn-outline" onClick={() => onEdit(asset)}><Pencil size={14} /> Edit</button>
        {asset.status !== 'disposed' && (
          <button className="as-btn-danger" onClick={() => onDispose(asset)}><Trash2 size={14} /> Dispose</button>
        )}
      </div>

      <div className="as-profile-grid">
        {/* ── Information ── */}
        <div className="as-card">
          <h3><FileText size={15} /> Asset Information</h3>
          <div className="as-info-grid">
            <div><span>Asset ID</span><strong className="as-mono">{asset.asset_id}</strong></div>
            <div><span>Serial No.</span><strong className="as-mono">{asset.serial_number || '—'}</strong></div>
            <div><span>Type</span><strong>{asset.asset_type || '—'}</strong></div>
            <div><span>Model</span><strong>{asset.model || '—'}</strong></div>
            <div><span>Manufacturer</span><strong>{asset.manufacturer || '—'}</strong></div>
            <div><span>Category</span><strong>{cat?.name || '—'}</strong></div>
          </div>
          {asset.description && <p className="as-desc">{asset.description}</p>}
          {asset.photo_path && (
            <button className="as-photo-btn" onClick={() => onViewDoc({ storage_path: asset.photo_path, file_name: 'photo', document_type: 'photo', title: 'Asset photo' })}>
              <Camera size={14} /> View photo
            </button>
          )}
        </div>

        {/* ── Ownership & Custody ── */}
        <div className="as-card">
          <h3><User size={15} /> Ownership & Custody</h3>
          <div className="as-info-grid">
            <div><span>Owner</span><strong>{school?.name || 'The School'}</strong></div>
            <div><span>Current Custodian</span><strong>{staffMap[asset.custodian_id] || 'Unassigned'}</strong></div>
            <div><span>Department</span><strong>{asset.department || '—'}</strong></div>
            <div><span>Assigned Date</span><strong>{fmtDate(asset.assigned_date)}</strong></div>
          </div>
          {custodyHistory.length > 0 && (
            <div className="as-table-wrap">
              <table className="as-table">
                <thead><tr><th>Custodian</th><th>From</th><th>To</th></tr></thead>
                <tbody>
                  {custodyHistory.map((c) => (
                    <tr key={c.id}>
                      <td>{c.profiles?.full_name || '—'}</td>
                      <td>{fmtDate(c.from_date)}</td>
                      <td>{c.to_date ? fmtDate(c.to_date) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Location ── */}
        <div className="as-card">
          <h3><MapPin size={15} /> Location</h3>
          <div className="as-info-grid">
            <div><span>Campus</span><strong>{asset.campus || '—'}</strong></div>
            <div><span>Building</span><strong>{asset.building || '—'}</strong></div>
            <div><span>Room</span><strong>{asset.room || '—'}</strong></div>
            <div><span>Specific Location</span><strong>{asset.specific_location || '—'}</strong></div>
          </div>
          {locationHistory.length > 0 && (
            <div className="as-table-wrap">
              <table className="as-table">
                <thead><tr><th>Location</th><th>From</th><th>To</th></tr></thead>
                <tbody>
                  {locationHistory.map((l) => (
                    <tr key={l.id}>
                      <td>{[l.building, l.department, l.room, l.specific_location].filter(Boolean).join(', ') || '—'}</td>
                      <td>{fmtDate(l.from_date)}</td>
                      <td>{l.to_date ? fmtDate(l.to_date) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Financial Accounting (posts to General Ledger) ── */}
        <div className="as-card">
          <h3><Coins size={15} /> Financial Accounting <span className="as-card-count">GL</span></h3>
          <div className="as-info-grid">
            <div><span>Purchase Date</span><strong>{fmtDate(asset.purchase_date)}</strong></div>
            <div><span>Supplier</span><strong>{supplier?.name || '—'}</strong></div>
            <div><span>Invoice Ref</span><strong className="as-mono">{asset.purchase_invoice_ref || '—'}</strong></div>
            <div><span>Purchase Cost</span><strong>{fmt(asset.purchase_cost)}</strong></div>
            <div><span>Method</span><strong>{methodLabel(asset.depreciation_method)}</strong></div>
            <div><span>Accounting Rate</span><strong>{asset.depreciation_method === 'reducing_balance' ? `${asset.depreciation_rate || 0}% p.a.` : '—'}</strong></div>
            <div><span>Useful Life</span><strong>{asset.useful_life_months} months</strong></div>
            <div><span>Residual Value</span><strong>{fmt(asset.residual_value)}</strong></div>
            <div><span>Depreciation (monthly)</span><strong>{fmt(monthlyDepreciation(asset))}</strong></div>
            <div><span>Accumulated Depreciation</span><strong>{fmt(asset.accumulated_depreciation)}</strong></div>
            <div><span>Net Book Value</span><strong className="as-green">{fmt(calcNbv(asset))}</strong></div>
          </div>
          {deprHistory.length > 0 ? (
            <div className="as-table-wrap as-scroll-sm">
              <table className="as-table">
                <thead><tr><th>Depreciation History</th><th className="num">Amount</th><th className="num">Accumulated</th></tr></thead>
                <tbody>
                  {deprHistory.slice(0, 8).map((l) => (
                    <tr key={l.id}>
                      <td>{l.period_label || fmtDate(l.created_at)}</td>
                      <td className="num">{fmt(l.depreciation_amount)}</td>
                      <td className="num">{fmt(l.accumulated_after)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="as-none">No depreciation posted yet.</p>
          )}
        </div>

        {/* ── Kenyan Tax Capital Allowances (tax computation, no GL) ── */}
        <div className="as-card as-card-tax">
          <h3><Landmark size={15} /> Kenyan Tax Capital Allowances <span className="as-card-count">no GL</span></h3>
          <div className="as-info-grid">
            <div><span>KRA Tax Class</span><strong>{asset.tax_class ? (wearRule?.description || kraTaxClass(asset.tax_class)?.label || asset.tax_class) : '—'}</strong></div>
            <div><span>Investment Allowance</span><strong>{asset.investment_class ? (invRule?.description || kraTaxClass(asset.investment_class)?.label || asset.investment_class) : '—'}</strong></div>
            <div><span>Tax Treatment</span><strong>{taxTreatment}</strong></div>
            <div><span>Tax Basis</span><strong>{fmt(taxPreview.tax_basis)}</strong></div>
            <div><span>Opening Tax WDV</span><strong>{fmt(taxPreview.opening_wtd)}</strong></div>
            <div><span>Wear &amp; Tear Rate</span><strong>{taxPreview.wear_tear_rate ? `${taxPreview.wear_tear_rate}% p.a.` : '—'}</strong></div>
            <div><span>Investment Rate</span><strong>{taxPreview.investment_rate ? `${taxPreview.investment_rate}% p.a.` : '—'}</strong></div>
            <div><span>Allowance (Current Year)</span><strong>{fmt(taxPreview.total_allowance)}</strong></div>
            <div><span>Tax Written Down Value</span><strong className="as-purple">{fmt(taxPreview.closing_wtd)}</strong></div>
          </div>
          {taxHistory.length > 0 ? (
            <div className="as-table-wrap as-scroll-sm">
              <table className="as-table">
                <thead><tr><th>Year</th><th className="num">Opening WDV</th><th className="num">W&amp;T</th><th className="num">Inv.</th><th className="num">Closing WDV</th></tr></thead>
                <tbody>
                  {taxHistory.slice(0, 8).map((s) => (
                    <tr key={s.id}>
                      <td className="as-fw600">{s.year_of_income}</td>
                      <td className="num">{fmt(s.opening_wtd)}</td>
                      <td className="num">{fmt(s.wear_tear_allowance)}</td>
                      <td className="num">{fmt(s.investment_allowance)}</td>
                      <td className="num as-fw600">{fmt(s.closing_wtd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="as-none">
              No tax allowances computed yet — run them in the Tax &amp; Capital Allowances tab (year {yearOfIncome}).
            </p>
          )}
        </div>

        {/* ── Maintenance ── */}
        <div className="as-card">
          <h3><Wrench size={15} /> Maintenance</h3>
          {lastMaint && (
            <div className="as-info-grid">
              <div><span>Last Service</span><strong>{fmtDate(lastMaint.maintenance_date)}</strong></div>
              <div><span>Next Service</span><strong>{fmtDate(lastMaint.next_service_date)}</strong></div>
              <div><span>Service Provider</span><strong>{lastMaint.service_provider || '—'}</strong></div>
              <div><span>Total Cost</span><strong>{fmt(maintRecords.reduce((s, m) => s + Number(m.cost || 0), 0))}</strong></div>
            </div>
          )}
          {maintRecords.length > 0 ? (
            <div className="as-table-wrap">
              <table className="as-table">
                <thead><tr><th>Date</th><th>Type</th><th>Provider</th><th>Cost</th><th>Status</th></tr></thead>
                <tbody>
                  {maintRecords.map((m) => (
                    <tr key={m.id}>
                      <td>{fmtDate(m.maintenance_date)}</td>
                      <td style={{ textTransform: 'capitalize' }}>{m.maintenance_type}</td>
                      <td>{m.service_provider || '—'}</td>
                      <td>{fmt(m.cost)}</td>
                      <td style={{ textTransform: 'capitalize' }}>{m.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="as-none">No maintenance records yet.</p>
          )}
        </div>

        {/* ── Documents ── */}
        <div className="as-card">
          <h3><Paperclip size={15} /> Documents <span className="as-card-count">{docs.length}</span></h3>
          {docs.length > 0 ? (
            <div className="as-doc-list">
              {docs.map((d) => (
                <div key={d.id} className="as-doc-item">
                  <div className="as-doc-icon"><FileText size={15} /></div>
                  <div className="as-doc-meta">
                    <strong>{d.title || docLabel(d.document_type)}</strong>
                    <small>{docLabel(d.document_type)} · {d.file_name || '—'}</small>
                  </div>
                  <button className="as-doc-view" onClick={() => onViewDoc(d)}>View</button>
                </div>
              ))}
            </div>
          ) : (
            <p className="as-none">No documents uploaded yet.</p>
          )}
        </div>
      </div>

      {/* ── Timeline ── */}
      <div className="as-card">
        <h3><History size={15} /> Asset History</h3>
        {assetEvents.length === 0 ? (
          <p className="as-none">No events recorded yet.</p>
        ) : (
          <div className="as-timeline">
            {assetEvents.map((e) => (
              <div key={e.id} className="as-timeline-item">
                <span className="as-timeline-dot" />
                <div className="as-timeline-body">
                  <div className="as-timeline-head">
                    <strong style={{ textTransform: 'capitalize' }}>{e.event_type.replace(/_/g, ' ')}</strong>
                    <span className="as-timeline-date">{fmtDate(e.occurred_at)}</span>
                  </div>
                  {e.description && <p>{e.description}</p>}
                  <small className="as-timeline-by">by {e.profiles?.full_name || '—'}</small>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
