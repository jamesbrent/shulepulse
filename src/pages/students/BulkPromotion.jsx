import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, CheckCircle, Loader } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { getGradeLevels, getPromotableClasses, previewPromotion, executePromotion, getPromotionHistory } from '../../services/students/bulkPromotionService'
import { fetchClasses } from '../../services/students/studentService'

export default function BulkPromotion() {
  const { profile } = useAuthStore()
  const navigate = useNavigate()

  const [classes, setClasses] = useState([])
  const [gradeLevels, setGradeLevels] = useState([])
  const [fromClass, setFromClass] = useState('')
  const [preview, setPreview] = useState([])
  const [nextClass, setNextClass] = useState('')
  const [selectedIds, setSelectedIds] = useState([])
  const [loading, setLoading] = useState(false)
  const [promoting, setPromoting] = useState(false)
  const [result, setResult] = useState(null)
  const [history, setHistory] = useState([])

  useEffect(() => {
    fetchClasses(profile.school_id).then(setClasses)
    getGradeLevels(profile.school_id).then(setGradeLevels)
    loadHistory()
  }, [profile])

  const loadHistory = async () => {
    try {
      const h = await getPromotionHistory(profile.school_id, 20)
      setHistory(h)
    } catch (e) { console.error(e) }
  }

  const handlePreview = async () => {
    if (!fromClass) return
    setLoading(true)
    try {
      const { students, nextClass: nc } = await previewPromotion(profile.school_id, fromClass)
      setPreview(students)
      setNextClass(nc)
      setSelectedIds(students.map(s => s.id))
      setResult(null)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const handlePromote = async () => {
    if (!fromClass || selectedIds.length === 0) return
    setPromoting(true)
    try {
      const res = await executePromotion(profile.school_id, fromClass, selectedIds, profile?.id)
      setResult(res)
      setPreview([])
      loadHistory()
    } catch (e) { console.error(e) }
    setPromoting(false)
  }

  return (
    <div className="students-page">
      <div className="sp-header">
        <div>
          <button className="btn-ghost" onClick={() => navigate(-1)}>
            <ArrowLeft size={15} /> Back
          </button>
          <h2 style={{ marginTop: 8 }}>Bulk Promotion</h2>
        </div>
      </div>

      <div className="promotion-form-card">
        <div className="promotion-select-row">
          <label>Promote from:</label>
          <select value={fromClass} onChange={e => setFromClass(e.target.value)}>
            <option value="">Select class</option>
            {getPromotableClasses(gradeLevels).filter(c => classes.includes(c)).map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <ArrowRight size={16} color="#94a3b8" />
          <span className="promotion-target">{nextClass || '...'}</span>
          <button className="btn-primary" onClick={handlePreview} disabled={!fromClass || loading}>
            {loading ? 'Loading...' : 'Preview'}
          </button>
        </div>
      </div>

      {result && (
        <div className="promotion-result-card">
          <CheckCircle size={20} color="#16a34a" />
          <span><strong>{result.promoted.length}</strong> students promoted to <strong>{result.nextClass}</strong></span>
        </div>
      )}

      {preview.length > 0 && (
        <div className="form-card">
          <div className="promotion-preview-header">
            <p><strong>{preview.length}</strong> students will be promoted from <strong>{fromClass}</strong> to <strong>{nextClass}</strong></p>
            <button className="btn-primary" onClick={handlePromote} disabled={promoting || selectedIds.length === 0}>
              {promoting ? <><Loader size={14} className="spin" /> Promoting...</> : `Promote ${selectedIds.length} students`}
            </button>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="th-check">
                    <input type="checkbox" checked={selectedIds.length === preview.length} onChange={() => {
                      setSelectedIds(selectedIds.length === preview.length ? [] : preview.map(s => s.id))
                    }} />
                  </th>
                  <th>Adm No</th>
                  <th>Full Name</th>
                  <th>Current Class</th>
                  <th>New Class</th>
                  <th>Stream</th>
                </tr>
              </thead>
              <tbody>
                {preview.map(s => (
                  <tr key={s.id}>
                    <td className="td-check">
                      <input type="checkbox" checked={selectedIds.includes(s.id)} onChange={() => {
                        setSelectedIds(prev => prev.includes(s.id) ? prev.filter(x => x !== s.id) : [...prev, s.id])
                      }} />
                    </td>
                    <td className="adm-no">{s.admission_number}</td>
                    <td>{s.full_name}</td>
                    <td>{s.class}</td>
                    <td><span className="promotion-next">{nextClass}</span></td>
                    <td>{s.stream || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div className="form-card">
          <p className="form-section-label">Promotion History</p>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Student</th>
                  <th>From</th>
                  <th>To</th>
                </tr>
              </thead>
              <tbody>
                {history.map(h => (
                  <tr key={h.id}>
                    <td>{new Date(h.promoted_at).toLocaleDateString()}</td>
                    <td>{h.students?.full_name} <span className="adm-no">({h.students?.admission_number})</span></td>
                    <td>{h.from_class}</td>
                    <td><span className="promotion-next">{h.to_class}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
