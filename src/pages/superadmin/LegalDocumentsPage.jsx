import { useState } from 'react'
import { FileText, Download, AlertTriangle, Shield, Scale } from 'lucide-react'
import { LEGAL_DOCUMENTS } from '../../features/legal/legalDocuments'
import { downloadPdf } from '../../features/legal/generatePdf'

const ICONS = [FileText, Shield, Scale]

export default function LegalDocumentsPage() {
  const [activeDoc, setActiveDoc] = useState(null)
  const [search, setSearch] = useState('')

  const filtered = LEGAL_DOCUMENTS.filter(
    (doc) =>
      doc.title.toLowerCase().includes(search.toLowerCase()) ||
      doc.sections.some((s) => s.heading.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div className="legal-docs-page">
      <div className="legal-docs-header">
        <h2>Legal Documents</h2>
        <p className="legal-docs-subtitle">
          AI-generated drafts for school onboarding — not reviewed by a lawyer.
        </p>
      </div>

      <div className="legal-docs-warning">
        <AlertTriangle size={18} />
        <div>
          <strong>AI-Generated DRAFT</strong>
          <p>
            These documents are generated for internal use and onboarding purposes only. They are
            <strong> not a substitute for professional legal advice</strong>. Have a qualified Kenyan
            lawyer review all documents before production use.
          </p>
        </div>
      </div>

      <input
        type="text"
        placeholder="Search documents..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="legal-docs-search"
      />

      <div className="legal-docs-grid">
        {filtered.map((doc, i) => {
          const Icon = ICONS[i] || FileText
          return (
            <div key={doc.filename} className="legal-docs-card">
              <div className="legal-docs-card-icon">
                <Icon size={24} />
              </div>
              <h3>{doc.title}</h3>
              <p className="legal-docs-card-meta">
                Last updated: {doc.lastUpdated}
              </p>
              <p className="legal-docs-card-meta">
                {doc.sections.length} sections
              </p>
              <div className="legal-docs-card-actions">
                <button
                  className="legal-btn legal-btn-primary"
                  onClick={() => downloadPdf(doc)}
                >
                  <Download size={14} /> Download PDF
                </button>
                <button
                  className="legal-btn legal-btn-secondary"
                  onClick={() => setActiveDoc(activeDoc?.filename === doc.filename ? null : doc)}
                >
                  {activeDoc?.filename === doc.filename ? 'Hide Preview' : 'Preview'}
                </button>
              </div>
              {activeDoc?.filename === doc.filename && (
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
                      {section.footer && <p className="legal-docs-section-footer">{section.footer}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="legal-docs-footer-note">
        <p>
          <strong>Note:</strong> These documents contain placeholder fields (e.g. [School Name],
          [date]) that are filled in at the time of school onboarding. The current versions are
          effective as of {LEGAL_DOCUMENTS[0].lastUpdated}.
        </p>
      </div>
    </div>
  )
}
