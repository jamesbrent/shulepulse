import { useState, useRef } from 'react'
import { Upload, Download, FileSpreadsheet, AlertCircle, CheckCircle, X, Loader, Save } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'
import { useSchool } from '../admin/useSchool'

export default function BulkImport() {
  const { profile } = useAuthStore()
  const { school, currentTerm, currentYear } = useSchool()
  const fileInputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState([])
  const [importing, setImporting] = useState(false)
  const [imported, setImported] = useState(0)
  const [errors, setErrors] = useState([])
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleFileChange = async (e) => {
    const selected = e.target.files?.[0]
    if (!selected) return
    setFile(selected)
    setErrors([])
    setError('')
    setSuccess('')
    setImported(0)

    try {
      const reader = new FileReader()
      reader.onload = (evt) => {
        const text = evt.target.result
        const lines = text.split('\n').filter(l => l.trim())
        if (lines.length < 2) {
          setError('CSV must have a header row and at least one data row')
          return
        }
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
        const rows = lines.slice(1).map(line => {
          const vals = line.split(',').map(v => v.trim())
          const obj = {}
          headers.forEach((h, i) => { obj[h] = vals[i] || '' })
          return obj
        })
        setPreview(rows.slice(0, 10))
      }
      reader.readAsText(selected)
    } catch (e) {
      setError('Failed to read file: ' + e.message)
    }
  }

  const downloadTemplate = () => {
    const headers = ['full_name', 'class', 'stream', 'gender', 'date_of_birth', 'parent_name', 'parent_phone', 'parent_email', 'nationality', 'religion', 'home_address', 'county', 'day_boarding', 'previous_school']
    const csv = headers.join(',') + '\n' + 'Jane Wanjiku Kamau,Grade 4,East,female,2016-03-15,John Kamau,0712345678,john@email.com,Kenyan,Christian,123 Nairobi,Nairobi,day,Sunrise Academy'
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'student_import_template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = async () => {
    if (!file) { setError('Please select a file first'); return }
    if (preview.length === 0) { setError('No data to import'); return }

    setImporting(true)
    setError('')
    setSuccess('')
    setImported(0)
    setErrors([])

    const reader = new FileReader()
    reader.onload = async (evt) => {
      const text = evt.target.result
      const lines = text.split('\n').filter(l => l.trim())
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
      const rows = lines.slice(1).map(line => {
        const vals = line.split(',').map(v => v.trim())
        const obj = {}
        headers.forEach((h, i) => { obj[h] = vals[i] || '' })
        return obj
      })

      let count = 0
      const errs = []

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        if (!row.full_name) {
          errs.push(`Row ${i + 2}: Missing full_name`)
          continue
        }

        try {
          const year = new Date().getFullYear()
          const seq = String(i + 1).padStart(4, '0')
          const admNumber = `ADM/${year}/${seq}`

          const dayBoarding = ['day', 'boarding'].includes(row.day_boarding) ? row.day_boarding : null
          const payload = {
            school_id: profile.school_id,
            admission_number: admNumber,
            full_name: row.full_name,
            class: row.class || '',
            stream: row.stream || null,
            gender: row.gender || null,
            date_of_birth: row.date_of_birth || null,
            parent_name: row.parent_name || null,
            parent_phone: row.parent_phone || null,
            parent_email: row.parent_email || null,
            nationality: row.nationality || null,
            religion: row.religion || null,
            home_address: row.home_address || null,
            county: row.county || null,
            previous_school: row.previous_school || null,
            status: 'active',
            created_by: profile?.id,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }
          if (dayBoarding) payload.day_boarding = dayBoarding

          const { error: insertError } = await supabase.from('students').insert(payload)
          if (insertError) throw insertError
          count++
        } catch (e) {
          errs.push(`Row ${i + 2}: ${e.message}`)
        }
      }

      setImported(count)
      setErrors(errs)
      if (errs.length === 0) {
        setSuccess(`Successfully imported ${count} student${count === 1 ? '' : 's'}!`)
      } else {
        setSuccess(`Imported ${count} student${count === 1 ? '' : 's'} with ${errs.length} error${errs.length === 1 ? '' : 's'}.`)
      }
      setImporting(false)
    }

    reader.onerror = () => {
      setError('Failed to read file')
      setImporting(false)
    }

    reader.readAsText(file)
  }

  const resetFile = () => {
    setFile(null)
    setPreview([])
    setErrors([])
    setError('')
    setSuccess('')
    setImported(0)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="reg-bulk-import">
      <div className="reg-sp-header">
        <div>
          <p>Import multiple students from a CSV file</p>
        </div>
        <div className="reg-sp-header-actions">
          <button className="reg-btn-secondary" onClick={downloadTemplate}>
            <Download size={14} /> Download Template
          </button>
        </div>
      </div>

      {error && <div className="reg-form-error">{error}</div>}
      {success && <div className="reg-form-success">{success}</div>}

      <div className="reg-card" style={{ marginBottom: 24 }}>
        <div className="reg-import-dropzone" onClick={() => fileInputRef.current?.click()}>
          <Upload size={40} color="#94a3b8" />
          <p style={{ fontSize: 15, color: '#374151', margin: '12px 0 4px', fontWeight: 500 }}>
            {file ? file.name : 'Click to upload CSV file'}
          </p>
          <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>
            {file ? `${(file.size / 1024).toFixed(1)} KB` : 'Supports .csv files'}
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
        </div>
      </div>

      {preview.length > 0 && (
        <div className="reg-card" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Preview ({preview.length} rows)</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="reg-btn-secondary small" onClick={resetFile}>
                <X size={14} /> Clear
              </button>
              <button className="reg-btn-primary" onClick={handleImport} disabled={importing || preview.length === 0}>
                {importing ? <Loader size={15} className="reg-spin" /> : <Save size={15} />}
                {importing ? 'Importing...' : `Import ${preview.length} Student${preview.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
          <div className="reg-table-wrap">
            <table className="reg-data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Full Name</th>
                  <th>Class</th>
                  <th>Stream</th>
                  <th>Gender</th>
                  <th>Parent</th>
                  <th>Parent Phone</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((row, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td>{row.full_name}</td>
                    <td>{row.class || '—'}</td>
                    <td>{row.stream || '—'}</td>
                    <td className="reg-capitalize">{row.gender || '—'}</td>
                    <td>{row.parent_name || '—'}</td>
                    <td>{row.parent_phone || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {imported > 0 && (
        <div className="reg-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <CheckCircle size={24} color="#16a34a" />
            <div>
              <p style={{ fontSize: 15, fontWeight: 600, margin: 0, color: '#16a34a' }}>
                {imported} student{imported === 1 ? '' : 's'} imported successfully
              </p>
              <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>
                {currentTerm ? `${currentTerm} ${currentYear}` : currentYear}
              </p>
            </div>
          </div>
          {errors.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#dc2626', margin: '0 0 8px' }}>
                <AlertCircle size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                {errors.length} error{errors.length === 1 ? '' : 's'}
              </p>
              <ul style={{ fontSize: 12, color: '#64748b', margin: 0, paddingLeft: 20 }}>
                {errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
