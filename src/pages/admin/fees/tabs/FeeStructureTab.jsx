import { useState, useRef }   from 'react'
import { Plus, RefreshCw, CheckCircle, Upload, Download, Pencil, Trash2 } from 'lucide-react'
import { useFeeStructure }    from '../hooks/useFeeStructure'
import { Modal, ModalActions } from '../components/Modal'
import { FeeTable }           from '../components/FeeTable'
import { fmt }                from '../utils/feesHelpers'

const APPLIES_TO = [
  { value: 'all', label: 'All Students' },
  { value: 'boarding', label: 'Boarding Only' },
  { value: 'day', label: 'Day Scholars Only' },
  { value: 'transport', label: 'Transport Users Only' },
]

const BLANK_CAT = {
  name: '', description: '', code: '', mandatory: true,
  is_recurring: false, is_refundable: false, is_taxable: false,
  applies_to: 'all', display_order: 0,
}
const BLANK_STR = { category_id: '', class: '', amount: '', mandatory: true }

export function FeeStructureTab({ profile, term, year }) {
  const schoolId = profile?.school_id
  if (!schoolId) {
    return <div className="tab-content"><p className="loading-state">Loading school context…</p></div>
  }

  const {
    categories, structures, students, classes,
    loading, saving, error,
    setError,
    addCategory, updateCategory, toggleCategoryActive, deleteCategory,
    addStructure, deleteStructure,
    generateAssessments,
    downloadTemplate, importExcel,
  } = useFeeStructure(schoolId, term, year)

  const [showCatModal, setShowCatModal] = useState(false)
  const [showStrModal, setShowStrModal] = useState(false)
  const [showGenModal, setShowGenModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [generating,   setGenerating]   = useState(false)
  const [genResult,    setGenResult]    = useState(null)
  const [importResult, setImportResult] = useState(null)
  const [editingCat,   setEditingCat]   = useState(null)
  const fileRef = useRef(null)

  const [catForm, setCatForm] = useState(BLANK_CAT)
  const [strForm, setStrForm] = useState(BLANK_STR)

  const handleSaveCategory = async (e) => {
    e.preventDefault()
    const ok = editingCat
      ? await updateCategory(editingCat.id, catForm)
      : await addCategory(catForm)
    if (ok) { setShowCatModal(false); setEditingCat(null); setCatForm(BLANK_CAT) }
  }

  const openEditCategory = (cat) => {
    setEditingCat(cat)
    setCatForm({
      name: cat.name, description: cat.description || '',
      code: cat.code || '', mandatory: cat.mandatory,
      is_recurring: cat.is_recurring ?? false,
      is_refundable: cat.is_refundable ?? false,
      is_taxable: cat.is_taxable ?? false,
      applies_to: cat.applies_to || 'all',
      display_order: cat.display_order ?? 0,
    })
    setError('')
    setShowCatModal(true)
  }

  const handleDeleteCategory = async (id, name) => {
    if (!confirm(`Delete category "${name}"? This cannot be undone if structures use it.`)) return
    await deleteCategory(id)
  }

  const handleAddStructure = async (e) => {
    e.preventDefault()
    const ok = await addStructure(strForm)
    if (ok) { setShowStrModal(false); setStrForm(BLANK_STR) }
  }

  const handleGenerate = async () => {
    setGenerating(true); setGenResult(null)
    const result = await generateAssessments()
    setGenerating(false); setGenResult(result)
  }

  const handleImport = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const result = await importExcel(file)
    setImportResult(result)
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleDownloadTemplate = () => {
    downloadTemplate()
  }

  const handleDeleteStructure = async (id) => {
    if (!confirm('Delete this fee structure item?')) return
    await deleteStructure(id)
  }

  return (
    <div className="tab-content">
      {/* ── Fee Categories ── */}
      <div className="section-card">
        <div className="section-card-head">
          <h3>Fee Categories <span className="badge-count">{categories.length}</span></h3>
          <button
            className="btn-primary sm"
            onClick={() => { setShowCatModal(true); setError('') }}
          >
            <Plus size={13} /> Add Category
          </button>
        </div>

        {loading ? (
          <p className="loading-state">Loading…</p>
        ) : (
          <div className="cat-chips">
            {categories.map((c) => (
              <div key={c.id} className={`cat-chip ${c.mandatory ? 'mandatory' : 'optional'} ${!c.is_active ? 'inactive' : ''}`}>
                <div className="cat-chip-head">
                  <span className="cat-chip-name">{c.name}</span>
                  <div className="cat-chip-actions">
                    <button className="btn-icon sm" onClick={() => openEditCategory(c)} title="Edit"><Pencil size={11} /></button>
                    <button className="btn-icon sm" onClick={() => handleDeleteCategory(c.id, c.name)} title="Delete"><Trash2 size={11} /></button>
                  </div>
                </div>
                <div className="cat-chip-tags">
                  {c.code && <span className="cat-chip-tag code">{c.code}</span>}
                  <span className="cat-chip-tag">{c.mandatory ? 'Mandatory' : 'Optional'}</span>
                  {c.applies_to !== 'all' && <span className="cat-chip-tag">{c.applies_to}</span>}
                  {c.is_recurring && <span className="cat-chip-tag recurring">Recurring</span>}
                  {!c.is_active && <span className="cat-chip-tag inactive-tag">Inactive</span>}
                </div>
              </div>
            ))}
            {!categories.length && (
              <p className="text-muted">No categories yet — add billing items for your school.</p>
            )}
          </div>
        )}
      </div>

      {/* ── Fee Structures ── */}
      <div className="section-card">
        <div className="section-card-head">
          <h3>
            Fee Structures
            {term && year && <span className="section-subtitle"> — {term} {year}</span>}
            <span className="badge-count">{structures.length}</span>
          </h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              className="btn-secondary sm"
              onClick={() => setShowGenModal(true)}
              disabled={!term || !year}
              title={!term || !year ? 'Select term and year first' : ''}
            >
              <RefreshCw size={13} /> Generate Assessments
            </button>
            <button
              className="btn-ghost sm"
              onClick={handleDownloadTemplate}
            >
              <Download size={13} /> Template
            </button>
            <button
              className="btn-secondary sm"
              onClick={() => { setShowImportModal(true); setImportResult(null) }}
              disabled={!categories.length || !term || !year}
              title={!categories.length ? 'Add a category first' : !term || !year ? 'Select term and year' : ''}
            >
              <Upload size={13} /> Import Excel
            </button>
            <button
              className="btn-primary sm"
              onClick={() => { setShowStrModal(true); setError('') }}
              disabled={!categories.length}
              title={!categories.length ? 'Add a category first' : ''}
            >
              <Plus size={13} /> Add Structure
            </button>
          </div>
        </div>

        <FeeTable
          columns={['Class', 'Fee Category', 'Amount', 'Type', '']}
          loading={loading}
          empty={`No structures for ${term || '—'} ${year || '—'}.`}
        >
          {structures.map((s) => (
            <tr key={s.id}>
              <td><span className="class-tag">{s.class === '__all__' ? 'All Classes' : s.class}</span></td>
              <td>{s.fee_categories?.name || '—'}</td>
              <td className="fw600">{fmt(s.amount)}</td>
              <td>
                <span className={`status-badge ${s.mandatory ? 'paid' : 'partial'}`}>
                  {s.mandatory ? 'Mandatory' : 'Optional'}
                </span>
              </td>
              <td>
                <button className="btn-icon sm" onClick={() => handleDeleteStructure(s.id)} title="Delete"><Trash2 size={11} /></button>
              </td>
            </tr>
          ))}
        </FeeTable>
      </div>

      {/* ── Add / Edit Category Modal ── */}
      {showCatModal && (
        <Modal title={editingCat ? 'Edit Fee Category' : 'Add Fee Category'} onClose={() => { setShowCatModal(false); setEditingCat(null); setCatForm(BLANK_CAT) }}>
          <form onSubmit={handleSaveCategory} className="modal-form">
            {error && <div className="form-error">{error}</div>}

            <div className="form-grid">
              <div className="form-field full">
                <label>Category Name *</label>
                <input required placeholder="e.g. Tuition, Lunch, Boarding…" value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} />
              </div>
              <div className="form-field">
                <label>Code (optional)</label>
                <input placeholder="e.g. TUIT01" value={catForm.code} onChange={(e) => setCatForm({ ...catForm, code: e.target.value })} />
              </div>
              <div className="form-field">
                <label>Display Order</label>
                <input type="number" min="0" placeholder="0" value={catForm.display_order} onChange={(e) => setCatForm({ ...catForm, display_order: parseInt(e.target.value) || 0 })} />
              </div>
              <div className="form-field full">
                <label>Description</label>
                <input placeholder="Optional note" value={catForm.description} onChange={(e) => setCatForm({ ...catForm, description: e.target.value })} />
              </div>
              <div className="form-field">
                <label>Applies To</label>
                <select value={catForm.applies_to} onChange={(e) => setCatForm({ ...catForm, applies_to: e.target.value })}>
                  {APPLIES_TO.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
              </div>
              <div className="form-field" style={{ display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'flex-end' }}>
                <label className="checkbox-label"><input type="checkbox" checked={catForm.mandatory} onChange={(e) => setCatForm({ ...catForm, mandatory: e.target.checked })} /> Mandatory</label>
                <label className="checkbox-label"><input type="checkbox" checked={catForm.is_recurring} onChange={(e) => setCatForm({ ...catForm, is_recurring: e.target.checked })} /> Recurring (every term)</label>
                <label className="checkbox-label"><input type="checkbox" checked={catForm.is_refundable} onChange={(e) => setCatForm({ ...catForm, is_refundable: e.target.checked })} /> Refundable</label>
                <label className="checkbox-label"><input type="checkbox" checked={catForm.is_taxable} onChange={(e) => setCatForm({ ...catForm, is_taxable: e.target.checked })} /> Taxable</label>
              </div>
            </div>

            <ModalActions
              onCancel={() => { setShowCatModal(false); setEditingCat(null); setCatForm(BLANK_CAT) }}
              saving={saving}
              label={editingCat ? 'Update Category' : 'Save Category'}
            />
          </form>
        </Modal>
      )}

      {/* ── Add Structure Modal ── */}
      {showStrModal && (
        <Modal title="Add Fee Structure" onClose={() => setShowStrModal(false)}>
          <form onSubmit={handleAddStructure} className="modal-form">
            {error && <div className="form-error">{error}</div>}
            <div className="form-grid">
              <div className="form-field full">
                <label>Fee Category *</label>
                <select
                  required
                  value={strForm.category_id}
                  onChange={(e) => setStrForm({ ...strForm, category_id: e.target.value })}
                >
                  <option value="">Select category…</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label>Class *</label>
                {classes.length ? (
                  <select
                    required
                    value={strForm.class}
                    onChange={(e) => setStrForm({ ...strForm, class: e.target.value })}
                  >
                    <option value="">Select class…</option>
                    <option value="__all__">All Classes</option>
                    {classes.map((c) => <option key={c}>{c}</option>)}
                  </select>
                ) : (
                  <input
                    required
                    placeholder="e.g. Form 1, Grade 4…"
                    value={strForm.class}
                    onChange={(e) => setStrForm({ ...strForm, class: e.target.value })}
                  />
                )}
              </div>
              <div className="form-field">
                <label>Amount (KES) *</label>
                <input
                  required
                  type="number"
                  min="0"
                  placeholder="e.g. 45000"
                  value={strForm.amount}
                  onChange={(e) => setStrForm({ ...strForm, amount: e.target.value })}
                />
              </div>
              <div className="form-field full">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={strForm.mandatory}
                    onChange={(e) => setStrForm({ ...strForm, mandatory: e.target.checked })}
                  />
                  Mandatory fee
                </label>
              </div>
            </div>
            <ModalActions onCancel={() => setShowStrModal(false)} saving={saving} label="Save Structure" />
          </form>
        </Modal>
      )}

      {/* ── Generate Assessments Modal ── */}
      {showGenModal && (
        <Modal
          title="Generate Fee Assessments"
          onClose={() => { setShowGenModal(false); setGenResult(null) }}
        >
          <div className="modal-form">
            <p className="gen-description">
              This will create fee assessment records for all{' '}
              <strong>{students.length} active students</strong> based on the fee structures
              defined for <strong>{term} {year}</strong>. Already-generated assessments are
              skipped automatically.
            </p>

            {genResult && (
              <div className={`gen-result ${genResult.created > 0 ? 'success' : 'info'}`}>
                <CheckCircle size={16} />
                <span>
                  <strong>{genResult.created}</strong> assessments created,{' '}
                  <strong>{genResult.skipped}</strong> already existed.
                </span>
              </div>
            )}

            {error && <div className="form-error">{error}</div>}

            <div className="modal-actions">
              <button
                className="btn-secondary"
                onClick={() => { setShowGenModal(false); setGenResult(null) }}
              >
                Close
              </button>
              {!genResult && (
                <button className="btn-primary" onClick={handleGenerate} disabled={generating}>
                  <RefreshCw size={14} /> {generating ? 'Generating…' : 'Generate Now'}
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* ── Import Excel Modal ── */}
      {showImportModal && (
        <Modal title="Import Fee Structures from Excel" onClose={() => setShowImportModal(false)}>
          <div className="modal-form">
            <ol className="import-steps">
              <li>First, add your <strong>Fee Categories</strong> above (the import matches category names).</li>
              <li>Download the template, fill it in, then upload below.</li>
            </ol>

            <div className="form-field full">
              <button className="btn-ghost sm" onClick={handleDownloadTemplate} style={{ marginBottom: 12 }}>
                <Download size={13} /> Download Template
              </button>
            </div>

            <div className="form-field full">
              <label>Upload Excel File (.xlsx or .xls)</label>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleImport}
                disabled={saving}
              />
            </div>

            {saving && <p className="loading-state">Importing…</p>}

            {importResult && (
              <div className={`gen-result ${importResult.inserted > 0 ? 'success' : 'warn'}`} style={{ marginTop: 8 }}>
                <CheckCircle size={16} />
                <span><strong>{importResult.inserted}</strong> fee structures imported.</span>
              </div>
            )}

            {importResult?.errors?.length > 0 && (
              <div className="gen-result warn" style={{ marginTop: 8 }}>
                <p style={{ fontWeight: 600, marginBottom: 4 }}>{importResult.errors.length} error(s):</p>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
                  {importResult.errors.map((msg, i) => (
                    <li key={i}>{msg}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowImportModal(false)}>
                {importResult ? 'Done' : 'Cancel'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}