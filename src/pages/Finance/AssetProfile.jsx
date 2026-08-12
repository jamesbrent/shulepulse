import {
  ArrowLeft, Wrench, Coins, TrendingDown, Trash2, Pencil,
  Paperclip, FileText, MapPin, User, History, Camera
} from 'lucide-react'
import { fmt, fmtDate } from '../admin/fees/utils/feesHelpers'
import { assetStatus, DEPRECIATION_METHODS, calcNbv, DOCUMENT_TYPES, kraTaxClass } from './assetsUtils'

const statusBadge = (s) => {
  const meta = assetStatus(s)
  return <span className="as-status-badge" style={{ background: `${meta.color}1a`, color: meta.color }}>{meta.label}</span>
}

export default function AssetProfile({
  asset, school, categories, suppliers, staffMap,
  events, custody, locations, maintenance, documents,
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
        <div className="as-profile-nbv">
          <span>Net Book Value</span>
          <strong>{fmt(calcNbv(asset))}</strong>
          <small>Cost {fmt(asset.purchase_cost)} − Depn {fmt(asset.accumulated_depreciation)}</small>
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

        {/* ── Financial ── */}
        <div className="as-card">
          <h3><Coins size={15} /> Financial</h3>
          <div className="as-info-grid">
            <div><span>Purchase Date</span><strong>{fmtDate(asset.purchase_date)}</strong></div>
            <div><span>Supplier</span><strong>{supplier?.name || '—'}</strong></div>
            <div><span>Invoice Ref</span><strong className="as-mono">{asset.purchase_invoice_ref || '—'}</strong></div>
            <div><span>Purchase Cost</span><strong>{fmt(asset.purchase_cost)}</strong></div>
            <div><span>Residual Value</span><strong>{fmt(asset.residual_value)}</strong></div>
            <div><span>Useful Life</span><strong>{asset.useful_life_months} months</strong></div>
            <div><span>Tax Class</span><strong>{kraTaxClass(asset.tax_class)?.label || 'Custom policy'}</strong></div>
            <div><span>Method</span><strong>{methodLabel(asset.depreciation_method)}</strong></div>
            <div><span>Rate</span><strong>{asset.depreciation_method === 'reducing_balance' ? `${asset.depreciation_rate}% p.a.${asset.first_year_allowance ? ` (+${asset.first_year_allowance}% 1st yr)` : ''}` : '—'}</strong></div>
            <div><span>Accumulated Depreciation</span><strong>{fmt(asset.accumulated_depreciation)}</strong></div>
            <div><span>Net Book Value</span><strong className="as-green">{fmt(calcNbv(asset))}</strong></div>
          </div>
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
