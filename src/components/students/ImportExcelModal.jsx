import { useState } from 'react'
import { Upload, X, AlertCircle, CheckCircle, Loader } from 'lucide-react'
import { parseExcelFile, previewImport, executeImport } from '../../services/students/excelImportService'

export function ImportExcelModal({ schoolId, onClose, onComplete }) {
  const [step, setStep] = useState('upload')
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState([])
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const handleFile = async (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setError('')
    try {
      const rows = await parseExcelFile(f)
      const data = previewImport(rows)
      setPreview(data)
      setStep('preview')
    } catch (err) {
      setError(err.message)
    }
  }

  const handleImport = async () => {
    setImporting(true)
    setError('')
    try {
      const res = await executeImport(preview, schoolId)
      setResult(res)
      setStep('result')
    } catch (err) {
      setError(err.message)
    }
    setImporting(false)
  }

  const renderUpload = () => (
    <div className="import-upload-zone">
      <Upload size={32} color="#94a3b8" />
      <p>Upload Excel or CSV file</p>
      <span className="import-hint">.xlsx or .csv — Use Admission Number as unique key</span>
      <input
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={handleFile}
        style={{ display: 'none' }}
        id="import-file-input"
      />
      <label htmlFor="import-file-input" className="btn-primary" style={{ cursor: 'pointer', marginTop: 12 }}>
        Choose File
      </label>
      {file && <p className="import-filename">{file.name}</p>}
    </div>
  )

  const renderPreview = () => {
    const valid = preview.filter(p => p.valid).length
    const invalid = preview.filter(p => !p.valid).length
    return (
      <div className="import-preview">
        <div className="import-stats">
          <span className="import-stat-valid"><CheckCircle size={14} /> {valid} valid</span>
          {invalid > 0 && <span className="import-stat-invalid"><AlertCircle size={14} /> {invalid} with errors</span>}
        </div>
        <div className="import-table-wrap">
          <table className="data-table import-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Admission No</th>
                <th>Full Name</th>
                <th>Class</th>
                <th>Stream</th>
                <th>Gender</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {preview.slice(0, 50).map(p => (
                <tr key={p.rowIndex} className={!p.valid ? 'row-error' : ''}>
                  <td>{p.rowIndex + 1}</td>
                  <td>{p.admissionNumber}</td>
                  <td>{p.data.full_name}</td>
                  <td>{p.data.class}</td>
                  <td>{p.data.stream}</td>
                  <td className="capitalize">{p.data.gender}</td>
                  <td>
                    {p.valid ? (
                      <span className="status-badge active">{p.data.status || 'active'}</span>
                    ) : (
                      <span className="import-error-icon" title={p.errors.join(', ')}>
                        <AlertCircle size={13} color="#dc2626" />
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {preview.length > 50 && (
                <tr><td colSpan={7} className="import-more">+{preview.length - 50} more rows</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={() => setStep('upload')}>Back</button>
          <button className="btn-primary" onClick={handleImport} disabled={importing || valid === 0}>
            {importing ? <><Loader size={14} className="spin" /> Importing...</> : `Import ${valid} records`}
          </button>
        </div>
      </div>
    )
  }

  const renderResult = () => (
    <div className="import-result">
      <CheckCircle size={36} color="#16a34a" />
      <h3>Import Complete</h3>
      <div className="import-result-stats">
        <div className="import-result-item">
          <span className="import-result-num">{result.created}</span>
          <span className="import-result-label">Created</span>
        </div>
        <div className="import-result-item">
          <span className="import-result-num">{result.updated}</span>
          <span className="import-result-label">Updated</span>
        </div>
        <div className="import-result-item">
          <span className="import-result-num">{result.skipped}</span>
          <span className="import-result-label">Skipped</span>
        </div>
      </div>
      {result.errors.length > 0 && (
        <div className="import-errors">
          <p className="import-errors-title">Errors:</p>
          {result.errors.slice(0, 5).map((e, i) => <p key={i} className="import-error-line">{e}</p>)}
          {result.errors.length > 5 && <p>...and {result.errors.length - 5} more</p>}
        </div>
      )}
      <div className="modal-actions" style={{ border: 'none', marginTop: 16 }}>
        <button className="btn-primary" onClick={onComplete}>Done</button>
      </div>
    </div>
  )

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Import Students</h3>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          {error && <div className="form-error">{error}</div>}
          {step === 'upload' && renderUpload()}
          {step === 'preview' && renderPreview()}
          {step === 'result' && renderResult()}
        </div>
      </div>
    </div>
  )
}
