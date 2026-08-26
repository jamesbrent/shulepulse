import { useState, useEffect, useRef } from 'react'
import {
  FileText, Download, Upload, Shield, Scale, ExternalLink,
  CheckCircle, Loader, Trash2, Eye, ChevronDown, ChevronUp
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { LEGAL_DOCUMENTS } from '../../features/legal/legalDocuments'
import { downloadPdf } from '../../features/legal/generatePdf'
import { fetchPlatformSettings, updatePlatformSettings } from '../../features/superadmin/platformSettingsService'

const ICONS = [FileText, Shield, Scale]
const BUCKET = 'legal-documents'
const STORAGE_KEY_MAP = {
  'terms-of-service.pdf': 'terms_of_service',
  'privacy-policy.pdf': 'privacy_policy',
  'data-processing-agreement.pdf': 'data_retention_policy',
}

export default function LegalDocumentsPage() {
  const [activeDoc, setActiveDoc] = useState(null)
  const [urls, setUrls] = useState({})
  const [uploading, setUploading] = useState(null)
  const [loading, setLoading] = useState(true)
  const fileRefs = useRef({})

  useEffect(() => {
    loadUrls()
  }, [])

  async function loadUrls() {
    try {
      const settings = await fetchPlatformSettings()
      setUrls(settings.legal || {})
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  async function handleUpload(doc, file) {
    const key = STORAGE_KEY_MAP[doc.filename]
    if (!key || !file) return

    setUploading(doc.filename)
    try {
      const path = `reviewed/${doc.filename}`
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { upsert: true, contentType: file.type })

      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path)
      const publicUrl = urlData.publicUrl + '?t=' + Date.now()

      await updatePlatformSettings('legal', { [key]: publicUrl })
      setUrls((prev) => ({ ...prev, [key]: publicUrl }))
    } catch (err) {
      alert('Upload failed: ' + err.message)
    } finally {
      setUploading(null)
    }
  }

  async function handleRemove(doc) {
    const key = STORAGE_KEY_MAP[doc.filename]
    if (!key) return

    if (!confirm('Remove the uploaded version? The auto-generated PDF will still be available.')) return

    setUploading(doc.filename)
    try {
      const path = `reviewed/${doc.filename}`
      await supabase.storage.from(BUCKET).remove([path]).catch(() => {})
      await updatePlatformSettings('legal', { [key]: '' })
      setUrls((prev) => ({ ...prev, [key]: '' }))
    } catch (err) {
      alert('Failed: ' + err.message)
    } finally {
      setUploading(null)
    }
  }

  function triggerUpload(filename) {
    fileRefs.current[filename]?.click()
  }

  return (
    <div className="legal-docs-page">
      <div className="legal-docs-container">
        <div className="legal-docs-intro">
          <p>
            Download auto-generated versions or upload reviewed legal documents for school onboarding.
          </p>
        </div>

        {loading ? (
          <div className="legal-docs-loading">
            <Loader size={20} className="spin" /> Loading...
          </div>
        ) : (
          <div className="legal-docs-grid">
            {LEGAL_DOCUMENTS.map((doc, i) => {
              const Icon = ICONS[i] || FileText
              const key = STORAGE_KEY_MAP[doc.filename]
              const uploadedUrl = urls[key]
              const isUploading = uploading === doc.filename
              const isExpanded = activeDoc === doc.filename

              return (
                <div key={doc.filename} className={`legal-docs-card ${uploadedUrl ? 'has-upload' : ''}`}>
                  <div className="legal-docs-card-top">
                    <div className="legal-docs-card-icon">
                      <Icon size={22} />
                    </div>
                    <div className="legal-docs-card-info">
                      <h3>{doc.title}</h3>
                      <p className="legal-docs-card-meta">
                        {doc.sections.length} sections &middot; Updated {doc.lastUpdated}
                      </p>
                    </div>
                    {uploadedUrl && (
                      <span className="legal-docs-badge">
                        <CheckCircle size={12} /> Reviewed
                      </span>
                    )}
                  </div>

                  <div className="legal-docs-card-actions">
                    {uploadedUrl ? (
                      <a
                        href={uploadedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="legal-btn legal-btn-primary"
                      >
                        <ExternalLink size={14} /> View Reviewed
                      </a>
                    ) : (
                      <button
                        className="legal-btn legal-btn-primary"
                        onClick={() => downloadPdf(doc)}
                      >
                        <Download size={14} /> Download Draft
                      </button>
                    )}

                    <button
                      className="legal-btn legal-btn-upload"
                      onClick={() => triggerUpload(doc.filename)}
                      disabled={isUploading}
                    >
                      {isUploading ? (
                        <Loader size={14} className="spin" />
                      ) : (
                        <Upload size={14} />
                      )}
                      {uploadedUrl ? 'Replace' : 'Upload Reviewed'}
                    </button>

                    <input
                      ref={(el) => (fileRefs.current[doc.filename] = el)}
                      type="file"
                      accept=".pdf"
                      className="legal-docs-file-input"
                      onChange={(e) => handleUpload(doc, e.target.files?.[0])}
                    />

                    {uploadedUrl && (
                      <button
                        className="legal-btn legal-btn-danger"
                        onClick={() => handleRemove(doc)}
                        disabled={isUploading}
                      >
                        <Trash2 size={14} /> Remove
                      </button>
                    )}

                    <button
                      className="legal-btn legal-btn-ghost"
                      onClick={() => setActiveDoc(isExpanded ? null : doc.filename)}
                    >
                      <Eye size={14} />
                      {isExpanded ? 'Hide' : 'Preview'}
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="legal-docs-preview">
                      {doc.sections.map((section, si) => (
                        <div key={si} className="legal-docs-preview-section">
                          <h4>{section.heading}</h4>
                          {section.content && <p>{section.content}</p>}
                          {section.bullets && (
                            <ul>
                              {section.bullets.map((b, bi) => (
                                <li key={bi}>{b}</li>
                              ))}
                            </ul>
                          )}
                          {section.table && (
                            <div className="legal-docs-table-wrap">
                              <table>
                                <thead>
                                  <tr>
                                    {section.table.headers.map((h, hi) => (
                                      <th key={hi}>{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {section.table.rows.map((row, ri) => (
                                    <tr key={ri}>
                                      {row.map((cell, ci) => (
                                        <td key={ci}>{cell}</td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                          {section.footer && (
                            <p className="legal-docs-section-footer">{section.footer}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
