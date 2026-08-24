import { useState, useEffect } from 'react'
import { Upload, FileText, X, Download, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'

export function StudentDocuments({ studentId }) {
  const [docs, setDocs] = useState([])
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(true)
  const { profile } = useAuthStore()
  const schoolId = profile?.school_id

  useEffect(() => {
    if (studentId) fetchDocuments()
  }, [studentId])

  const fetchDocuments = async () => {
    const { data } = await supabase
      .from('student_documents')
      .select('*')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
    setDocs(data || [])
    setLoading(false)
  }

  const ALLOWED_TYPES = [
    'application/pdf',
    'image/png', 'image/jpeg', 'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
  ]
  const MAX_SIZE_MB = 10

  const handleUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!ALLOWED_TYPES.includes(file.type)) {
      alert(`File type "${file.type || file.name.split('.').pop()}" is not allowed. Accepted: PDF, Word, Excel, CSV, PNG, JPEG, WEBP.`)
      return
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      alert(`File is ${(file.size / 1024 / 1024).toFixed(1)} MB. Maximum allowed is ${MAX_SIZE_MB} MB.`)
      return
    }
    setUploading(true)
    const path = `${schoolId || 'default'}/students/${studentId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const { error: uploadErr } = await supabase.storage.from('documents').upload(path, file)
    if (uploadErr) { setUploading(false); return }
    const { data: urlData, error: urlErr } = await supabase.storage
      .from('documents')
      .createSignedUrl(path, 3600)
    await supabase.from('student_documents').insert({
      student_id: studentId,
      name: file.name,
      file_path: path,
      file_url: (!urlErr && urlData?.signedUrl) ? urlData.signedUrl : null,
      file_type: file.type,
      file_size: file.size,
    })
    setUploading(false)
    fetchDocuments()
  }

  const handleDownload = async (doc) => {
    const { data, error } = await supabase.storage
      .from('documents')
      .createSignedUrl(doc.file_path, 3600)
    if (error || !data?.signedUrl) {
      alert('Unable to open document. Please try again later.')
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  const handleDelete = async (doc) => {
    if (!confirm('Delete this document?')) return
    await supabase.storage.from('documents').remove([doc.file_path])
    await supabase.from('student_documents').delete().eq('id', doc.id)
    fetchDocuments()
  }

  if (loading) return <div className="loading-state">Loading documents...</div>

  return (
    <div className="student-documents">
      <div className="doc-upload-area">
        <label className="doc-upload-btn">
          <Upload size={14} /> {uploading ? 'Uploading...' : 'Upload Document'}
          <input type="file" onChange={handleUpload} hidden disabled={uploading}
            accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.csv" />
        </label>
      </div>
      {docs.length === 0 ? (
        <p className="empty-state-text">No documents uploaded yet.</p>
      ) : (
        <div className="doc-list">
          {docs.map(doc => (
            <div key={doc.id} className="doc-item">
              <FileText size={16} />
              <span className="doc-name">{doc.name}</span>
              <span className="doc-size">{(doc.file_size / 1024).toFixed(0)} KB</span>
              <a href="#" onClick={(e) => { e.preventDefault(); handleDownload(doc) }} className="doc-download">
                <Download size={14} />
              </a>
              <button className="doc-delete" onClick={() => handleDelete(doc)}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
