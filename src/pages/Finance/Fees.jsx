import { useState, useEffect, useRef } from 'react'
import {
  Search, RefreshCw, Plus, Upload, Download,
  Tag, CheckCircle, BookOpen, Clock,
  DollarSign, Layers, Edit3, Copy, Send, Archive, Inbox,
  X, Save, Trash2, Pencil, AlertOctagon
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'
import { useSchool } from '../admin/useSchool'
import { fmt, TERMS, YEARS } from '../admin/fees/utils/feesHelpers'
import { useFeeStructure } from '../admin/fees/hooks/useFeeStructure'
import './FeeStructures.css'

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

export default function FeesPage() {
  const { profile } = useAuthStore()
  const { currentTerm, currentYear } = useSchool()

  const [term, setTerm] = useState(currentTerm || '')
  const [year, setYear] = useState(String(currentYear || new Date().getFullYear()))
  const [filterClass, setFilterClass] = useState('')
  const [search, setSearch] = useState('')
  const [globalClasses, setGlobalClasses] = useState([])

  const {
    categories, structures, students, classes,
    loading, saving, error,
    setError,
    addCategory, updateCategory, deleteCategory,
    addStructure, deleteStructure,
    generateAssessments,
    downloadTemplate, importExcel,
    reload,
  } = useFeeStructure(profile?.school_id, term, year)

  const [showCatModal, setShowCatModal] = useState(false)
  const [showStrModal, setShowStrModal] = useState(false)
  const [showGenModal, setShowGenModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [showManageCatModal, setShowManageCatModal] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [genResult, setGenResult] = useState(null)
  const [importResult, setImportResult] = useState(null)
  const [editingCat, setEditingCat] = useState(null)
  const [toast, setToast] = useState(null)
  const fileRef = useRef(null)

  const [catForm, setCatForm] = useState(BLANK_CAT)
  const [strForm, setStrForm] = useState(BLANK_STR)

  useEffect(() => {
    if (currentTerm && !term) setTerm(currentTerm)
    if (currentYear && !year) setYear(String(currentYear))
  }, [currentTerm, currentYear])

  useEffect(() => {
    if (!profile?.school_id) return
    supabase
      .from('students')
      .select('class, stream')
      .eq('school_id', profile.school_id)
      .not('class', 'is', null)
      .then(({ data }) => {
        const cls = [...new Set((data || []).map((r) => r.class).filter(Boolean))].sort()
        setGlobalClasses(cls)
      })
  }, [profile?.school_id])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  const handleSaveCategory = async (e) => {
    e.preventDefault()
    const ok = editingCat
      ? await updateCategory(editingCat.id, catForm)
      : await addCategory(catForm)
    if (ok) {
      setShowCatModal(false)
      setEditingCat(null)
      setCatForm(BLANK_CAT)
      setToast({ type: 'success', msg: editingCat ? 'Category updated.' : 'Category created.' })
    }
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
    const ok = await deleteCategory(id)
    if (ok) setToast({ type: 'success', msg: `Category "${name}" deleted.` })
  }

  const handleAddStructure = async (e) => {
    e.preventDefault()
    const ok = await addStructure(strForm)
    if (ok) {
      setShowStrModal(false)
      setStrForm(BLANK_STR)
      setToast({ type: 'success', msg: 'Fee structure created.' })
    }
  }

  const handleGenerate = async () => {
    setGenerating(true)
    setGenResult(null)
    const result = await generateAssessments()
    setGenerating(false)
    setGenResult(result)
    if (result?.created > 0) {
      setToast({ type: 'success', msg: `${result.created} assessments generated.` })
    }
  }

  const handleImport = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const result = await importExcel(file)
    setImportResult(result)
    if (fileRef.current) fileRef.current.value = ''
    if (result?.inserted > 0) {
      setToast({ type: 'success', msg: `${result.inserted} structures imported.` })
    }
  }

  const handlePublishAll = async () => {
    const drafts = structures.filter((s) => s.status !== 'published')
    if (!drafts.length) {
      setToast({ type: 'info', msg: 'All structures are already published.' })
      return
    }
    const { error: pubErr } = await supabase
      .from('fee_structures')
      .update({ status: 'published' })
      .in('id', drafts.map((s) => s.id))
    if (pubErr) {
      setToast({ type: 'error', msg: pubErr.message })
    } else {
      setToast({ type: 'success', msg: `${drafts.length} structure(s) published.` })
      reload()
    }
  }

  const handlePublishSingle = async (id) => {
    const { error: pubErr } = await supabase
      .from('fee_structures')
      .update({ status: 'published' })
      .eq('id', id)
    if (pubErr) {
      setToast({ type: 'error', msg: pubErr.message })
    } else {
      setToast({ type: 'success', msg: 'Structure published.' })
      reload()
    }
  }

  const handleArchive = async (id) => {
    if (!confirm('Archive this fee structure?')) return
    const { error: archErr } = await supabase
      .from('fee_structures')
      .update({ status: 'archived' })
      .eq('id', id)
    if (archErr) {
      setToast({ type: 'error', msg: archErr.message })
    } else {
      setToast({ type: 'success', msg: 'Structure archived.' })
      reload()
    }
  }

  const handleDuplicate = async (s) => {
    const { id, created_at, ...rest } = s
    rest.status = 'draft'
    const { error: dupErr } = await supabase.from('fee_structures').insert(rest)
    if (dupErr) {
      setToast({ type: 'error', msg: dupErr.message })
    } else {
      setToast({ type: 'success', msg: 'Structure duplicated as draft.' })
      reload()
    }
  }

  const filteredStructures = structures.filter((s) => {
    const matchClass = !filterClass || s.class === filterClass || s.class === '__all__'
    const matchSearch = !search ||
      s.fee_categories?.name?.toLowerCase().includes(search.toLowerCase()) ||
      s.class?.toLowerCase().includes(search.toLowerCase()) ||
      (s.class === '__all__' && 'all classes'.includes(search.toLowerCase()))
    return matchClass && matchSearch
  })

  const publishedCount = structures.filter((s) => s.status === 'published').length
  const draftCount = structures.filter((s) => s.status === 'draft' || !s.status).length
  const uniqueClasses = [...new Set(structures.map((s) => s.class).filter(Boolean))].length
  const totalExpected = filteredStructures.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0)

  if (loading) return <div className="fs-loading">Loading fee structures…</div>

  return (
    <div className="fs-page">
      {/* ═══ Sticky Toolbar ═══ */}
      <div className="fs-toolbar">
        <div className="fs-toolbar-left">
          <label>Term</label>
          <select className="fs-filter-select" value={term} onChange={(e) => setTerm(e.target.value)}>
            <option value="">All Terms</option>
            {TERMS.map((t) => <option key={t}>{t}</option>)}
          </select>
          <label>Year</label>
          <select className="fs-filter-select" value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="">All Years</option>
            {YEARS.map((y) => <option key={y}>{y}</option>)}
          </select>
          <label>Class</label>
          <select className="fs-filter-select" value={filterClass} onChange={(e) => setFilterClass(e.target.value)}>
            <option value="">All Classes</option>
            {globalClasses.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className="fs-search-wrap">
            <Search size={13} className="fs-search-icon" />
            <input
              className="fs-search-input"
              placeholder="Search structures…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button className="fs-btn-icon" onClick={reload} title="Refresh">
            <RefreshCw size={15} />
          </button>
        </div>
        <div className="fs-toolbar-right">
          <button className="fs-btn-primary green" onClick={handlePublishAll} disabled={!draftCount}>
            <Send size={14} />
            Publish
          </button>
        </div>
      </div>

      {/* ═══ KPI Cards ═══ */}
      <div className="fs-kpi-row">
        <div className="fs-kpi-card blue">
          <div className="fs-kpi-icon-wrap"><Tag /></div>
          <div className="fs-kpi-body">
            <p className="fs-kpi-label">Fee Categories</p>
            <p className="fs-kpi-value">{categories.length}</p>
          </div>
        </div>
        <div className="fs-kpi-card green">
          <div className="fs-kpi-icon-wrap"><CheckCircle /></div>
          <div className="fs-kpi-body">
            <p className="fs-kpi-label">Published Structures</p>
            <p className="fs-kpi-value">{publishedCount}</p>
            {draftCount > 0 && <span className="fs-kpi-badge amber">{draftCount} draft</span>}
          </div>
        </div>
        <div className="fs-kpi-card purple">
          <div className="fs-kpi-icon-wrap"><BookOpen /></div>
          <div className="fs-kpi-body">
            <p className="fs-kpi-label">Classes Assigned</p>
            <p className="fs-kpi-value">{uniqueClasses}</p>
          </div>
        </div>
        <div className="fs-kpi-card amber">
          <div className="fs-kpi-icon-wrap"><DollarSign /></div>
          <div className="fs-kpi-body">
            <p className="fs-kpi-label">Total Expected</p>
            <p className="fs-kpi-value">{fmt(totalExpected)}</p>
          </div>
        </div>
      </div>

      {/* ═══ Two-Column Layout ═══ */}
      <div className="fs-two-col">
        {/* Left: Categories Panel */}
        <div className="fs-panel">
          <div className="fs-panel-head">
            <h3>
              <Layers size={15} style={{ color: '#7c3aed' }} />
              Fee Categories
              <span className="fs-badge-count purple">{categories.length}</span>
            </h3>
            <button className="fs-btn-primary" style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => { setShowCatModal(true); setError(''); setEditingCat(null); setCatForm(BLANK_CAT) }}>
              <Plus size={13} /> Add
            </button>
          </div>
          <div className="fs-panel-body">
            {categories.length === 0 ? (
              <p style={{ textAlign: 'center', padding: '24px 16px', color: '#94a3b8', fontSize: 13 }}>
                No categories configured yet.
              </p>
            ) : (
              <div className="fs-cat-list">
                {categories.map((c) => (
                  <div key={c.id} className="fs-cat-item">
                    <div className={`fs-cat-icon ${c.mandatory ? 'mandatory' : 'optional'}`}>
                      {c.mandatory ? <CheckCircle size={16} /> : <Tag size={16} />}
                    </div>
                    <div className="fs-cat-info">
                      <p className="fs-cat-name">{c.name}</p>
                      {c.code && <p className="fs-cat-code">{c.code}</p>}
                    </div>
                    <div style={{ display: 'flex', gap: 2 }}>
                      <button className="fs-btn-icon" title="Edit" onClick={() => openEditCategory(c)}>
                        <Pencil size={13} />
                      </button>
                      <button className="fs-btn-icon" title="Delete" onClick={() => handleDeleteCategory(c.id, c.name)}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="fs-panel-footer">
            <button className="fs-btn-secondary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setShowManageCatModal(true)}>
              <Layers size={14} />
              Manage Categories
            </button>
          </div>
        </div>

        {/* Right: Fee Structures Workspace */}
        <div className="fs-workspace">
          <div className="fs-ws-head">
            <h3>
              <DollarSign size={15} style={{ color: '#2563eb' }} />
              Fee Structures
              {term && year && <span style={{ fontWeight: 400, color: '#64748b', fontSize: 13 }}> — {term} {year}</span>}
              <span className="fs-badge-count">{filteredStructures.length}</span>
            </h3>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="fs-btn-primary blue" onClick={() => { setShowStrModal(true); setError(''); setStrForm(BLANK_STR) }} disabled={!categories.length} title={!categories.length ? 'Add a category first' : ''}>
                <Plus size={14} />
                Create Structure
              </button>
              <button className="fs-btn-secondary" onClick={() => { setShowImportModal(true); setImportResult(null) }} disabled={!categories.length || !term || !year} title={!categories.length ? 'Add a category first' : !term || !year ? 'Select term and year' : ''}>
                <Upload size={14} />
                Import
              </button>
            </div>
          </div>
          <div className="fs-ws-body">
            {filteredStructures.length === 0 ? (
              <div className="fs-empty-state">
                <div className="fs-empty-icon"><Inbox /></div>
                <p className="fs-empty-title">
                  {structures.length ? 'No matching structures' : 'No fee structures yet'}
                </p>
                <p className="fs-empty-desc">
                  {structures.length
                    ? 'Try adjusting your filters or search term.'
                    : `Create a fee structure for ${term || 'this term'} ${year} to get started.`}
                </p>
                {!structures.length && (
                  <div className="fs-empty-actions">
                    <button className="fs-btn-primary blue" onClick={() => { setShowStrModal(true); setError('') }}>
                      <Plus size={14} /> Create Structure
                    </button>
                    <button className="fs-btn-secondary" onClick={() => { setShowImportModal(true); setImportResult(null) }}>
                      <Upload size={14} /> Import Structure
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="fs-table-wrap">
                <table className="fs-table">
                  <thead>
                    <tr>
                      <th>Structure</th>
                      <th>Class</th>
                      <th>Term</th>
                      <th>Expected Amount</th>
                      <th>Categories</th>
                      <th>Status</th>
                      <th style={{ width: 140 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStructures.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <div className="fs-struct-name">{s.fee_categories?.name || '—'}</div>
                          {s.fee_categories?.code && (
                            <p className="fs-struct-sub">{s.fee_categories.code}</p>
                          )}
                        </td>
                        <td><span className="fs-class-tag">{s.class === '__all__' ? 'All Classes' : s.class}</span></td>
                        <td><span className="fs-term-tag">{s.term} {s.year}</span></td>
                        <td className="fs-amount">{fmt(s.amount)}</td>
                        <td>
                          <span className="fs-cat-count">
                            <Layers size={12} />
                            {s.fee_categories?.applies_to || 'all'}
                          </span>
                        </td>
                        <td>
                          <span className={`fs-status-badge ${s.status || 'draft'}`}>
                            {(s.status || 'draft').charAt(0).toUpperCase() + (s.status || 'draft').slice(1)}
                          </span>
                        </td>
                        <td>
                          <div className="fs-actions-cell">
                            {s.status !== 'published' && (
                              <button className="fs-action-btn publish" title="Publish" onClick={() => handlePublishSingle(s.id)}>
                                <Send size={15} />
                              </button>
                            )}
                            <button className="fs-action-btn copy" title="Duplicate" onClick={() => handleDuplicate(s)}>
                              <Copy size={15} />
                            </button>
                            <button className="fs-action-btn archive" title="Archive" onClick={() => handleArchive(s.id)}>
                              <Archive size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ Add / Edit Category Modal ═══ */}
      {showCatModal && (
        <div className="fs-modal-overlay" onClick={() => { setShowCatModal(false); setEditingCat(null); setCatForm(BLANK_CAT) }}>
          <div className="fs-modal" onClick={(e) => e.stopPropagation()}>
            <div className="fs-modal-header">
              <h3>{editingCat ? 'Edit Fee Category' : 'Add Fee Category'}</h3>
              <button className="fs-modal-close" onClick={() => { setShowCatModal(false); setEditingCat(null); setCatForm(BLANK_CAT) }}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSaveCategory} className="fs-modal-form">
              {error && <div className="fs-form-error">{error}</div>}
              <div className="fs-form-grid">
                <div className="fs-form-field full">
                  <label>Category Name *</label>
                  <input required placeholder="e.g. Tuition, Lunch, Boarding…" value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} />
                </div>
                <div className="fs-form-field">
                  <label>Code (optional)</label>
                  <input placeholder="e.g. TUIT01" value={catForm.code} onChange={(e) => setCatForm({ ...catForm, code: e.target.value })} />
                </div>
                <div className="fs-form-field">
                  <label>Display Order</label>
                  <input type="number" min="0" placeholder="0" value={catForm.display_order} onChange={(e) => setCatForm({ ...catForm, display_order: parseInt(e.target.value) || 0 })} />
                </div>
                <div className="fs-form-field full">
                  <label>Description</label>
                  <input placeholder="Optional note" value={catForm.description} onChange={(e) => setCatForm({ ...catForm, description: e.target.value })} />
                </div>
                <div className="fs-form-field">
                  <label>Applies To</label>
                  <select value={catForm.applies_to} onChange={(e) => setCatForm({ ...catForm, applies_to: e.target.value })}>
                    {APPLIES_TO.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </select>
                </div>
                <div className="fs-form-field" style={{ display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'flex-end' }}>
                  <label className="fs-checkbox-label"><input type="checkbox" checked={catForm.mandatory} onChange={(e) => setCatForm({ ...catForm, mandatory: e.target.checked })} /> Mandatory</label>
                  <label className="fs-checkbox-label"><input type="checkbox" checked={catForm.is_recurring} onChange={(e) => setCatForm({ ...catForm, is_recurring: e.target.checked })} /> Recurring</label>
                </div>
              </div>
              <div className="fs-modal-actions">
                <button type="button" className="fs-btn-secondary" onClick={() => { setShowCatModal(false); setEditingCat(null); setCatForm(BLANK_CAT) }}>Cancel</button>
                <button type="submit" className="fs-btn-primary" disabled={saving}>
                  <Save size={15} /> {saving ? 'Saving…' : editingCat ? 'Update Category' : 'Save Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══ Add Structure Modal ═══ */}
      {showStrModal && (
        <div className="fs-modal-overlay" onClick={() => setShowStrModal(false)}>
          <div className="fs-modal" onClick={(e) => e.stopPropagation()}>
            <div className="fs-modal-header">
              <h3>Add Fee Structure</h3>
              <button className="fs-modal-close" onClick={() => setShowStrModal(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleAddStructure} className="fs-modal-form">
              {error && <div className="fs-form-error">{error}</div>}
              <div className="fs-form-grid">
                <div className="fs-form-field full">
                  <label>Fee Category *</label>
                  <select required value={strForm.category_id} onChange={(e) => setStrForm({ ...strForm, category_id: e.target.value })}>
                    <option value="">Select category…</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="fs-form-field">
                  <label>Class *</label>
                  {classes.length ? (
                    <select required value={strForm.class} onChange={(e) => setStrForm({ ...strForm, class: e.target.value })}>
                      <option value="">Select class…</option>
                      <option value="__all__">All Classes</option>
                      {classes.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  ) : (
                    <input required placeholder="e.g. Form 1, Grade 4…" value={strForm.class} onChange={(e) => setStrForm({ ...strForm, class: e.target.value })} />
                  )}
                </div>
                <div className="fs-form-field">
                  <label>Amount (KES) *</label>
                  <input required type="number" min="0" placeholder="e.g. 45000" value={strForm.amount} onChange={(e) => setStrForm({ ...strForm, amount: e.target.value })} />
                </div>
                <div className="fs-form-field full">
                  <label className="fs-checkbox-label">
                    <input type="checkbox" checked={strForm.mandatory} onChange={(e) => setStrForm({ ...strForm, mandatory: e.target.checked })} />
                    Mandatory fee
                  </label>
                </div>
              </div>
              <div className="fs-modal-actions">
                <button type="button" className="fs-btn-secondary" onClick={() => setShowStrModal(false)}>Cancel</button>
                <button type="submit" className="fs-btn-primary" disabled={saving}>
                  <Save size={15} /> {saving ? 'Saving…' : 'Save Structure'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══ Generate Assessments Modal ═══ */}
      {showGenModal && (
        <div className="fs-modal-overlay" onClick={() => { setShowGenModal(false); setGenResult(null) }}>
          <div className="fs-modal" onClick={(e) => e.stopPropagation()}>
            <div className="fs-modal-header">
              <h3>Generate Fee Assessments</h3>
              <button className="fs-modal-close" onClick={() => { setShowGenModal(false); setGenResult(null) }}>
                <X size={18} />
              </button>
            </div>
            <div className="fs-modal-form">
              <p style={{ fontSize: 14, color: '#475569', lineHeight: 1.6, margin: '0 0 16px' }}>
                This will create fee assessment records for all{' '}
                <strong>{students.length} active students</strong> based on the fee structures
                defined for <strong>{term} {year}</strong>. Already-generated assessments are skipped.
              </p>
              {genResult && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 8, background: '#f0fdf4', color: '#16a34a', fontSize: 14, marginBottom: 16 }}>
                  <CheckCircle size={16} />
                  <span><strong>{genResult.created}</strong> assessments created, <strong>{genResult.skipped}</strong> already existed.</span>
                </div>
              )}
              {error && <div className="fs-form-error">{error}</div>}
              <div className="fs-modal-actions">
                <button className="fs-btn-secondary" onClick={() => { setShowGenModal(false); setGenResult(null) }}>Close</button>
                {!genResult && (
                  <button className="fs-btn-primary" onClick={handleGenerate} disabled={generating}>
                    <RefreshCw size={14} /> {generating ? 'Generating…' : 'Generate Now'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Import Modal ═══ */}
      {showImportModal && (
        <div className="fs-modal-overlay" onClick={() => setShowImportModal(false)}>
          <div className="fs-modal" onClick={(e) => e.stopPropagation()}>
            <div className="fs-modal-header">
              <h3>Import Fee Structures from Excel</h3>
              <button className="fs-modal-close" onClick={() => setShowImportModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="fs-modal-form">
              <ol style={{ margin: '0 0 16px', paddingLeft: 18, fontSize: 13, color: '#475569', lineHeight: 1.8 }}>
                <li>Add your <strong>Fee Categories</strong> first (import matches by name).</li>
                <li>Download the template, fill it in, then upload below.</li>
              </ol>
              <div className="fs-form-field full" style={{ marginBottom: 12 }}>
                <button className="fs-btn-secondary" onClick={downloadTemplate}>
                  <Download size={13} /> Download Template
                </button>
              </div>
              <div className="fs-form-field full">
                <label>Upload Excel File (.xlsx or .xls)</label>
                <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleImport} disabled={saving} />
              </div>
              {saving && <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 8 }}>Importing…</p>}
              {importResult && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 8, background: '#f0fdf4', color: '#16a34a', fontSize: 14, marginTop: 8 }}>
                  <CheckCircle size={16} />
                  <span><strong>{importResult.inserted}</strong> fee structures imported.</span>
                </div>
              )}
              {importResult?.errors?.length > 0 && (
                <div style={{ padding: '12px 16px', borderRadius: 8, background: '#fffbeb', color: '#92400e', fontSize: 13, marginTop: 8 }}>
                  <p style={{ fontWeight: 600, marginBottom: 4 }}>{importResult.errors.length} message(s):</p>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {importResult.errors.map((msg, i) => <li key={i}>{msg}</li>)}
                  </ul>
                </div>
              )}
              <div className="fs-modal-actions">
                <button className="fs-btn-secondary" onClick={() => setShowImportModal(false)}>
                  {importResult ? 'Done' : 'Cancel'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Manage Categories Modal ═══ */}
      {showManageCatModal && (
        <div className="fs-modal-overlay" onClick={() => setShowManageCatModal(false)}>
          <div className="fs-modal" style={{ maxWidth: 600 }} onClick={(e) => e.stopPropagation()}>
            <div className="fs-modal-header">
              <h3>Manage Fee Categories</h3>
              <button className="fs-modal-close" onClick={() => setShowManageCatModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="fs-modal-form">
              {categories.length === 0 ? (
                <p style={{ textAlign: 'center', padding: '24px', color: '#94a3b8', fontSize: 13, margin: 0 }}>
                  No categories yet. Click "Add Category" to create one.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {categories.map((c) => (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: c.mandatory ? '#eff6ff' : '#faf5ff', color: c.mandatory ? '#2563eb' : '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {c.mandatory ? <CheckCircle size={16} /> : <Tag size={16} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{c.name}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{c.code || 'No code'} · {c.mandatory ? 'Mandatory' : 'Optional'}</div>
                      </div>
                      <button className="fs-btn-icon" title="Edit" onClick={() => { setShowManageCatModal(false); openEditCategory(c) }}>
                        <Pencil size={14} />
                      </button>
                      <button className="fs-btn-icon" title="Delete" onClick={() => handleDeleteCategory(c.id, c.name)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="fs-modal-actions">
                <button className="fs-btn-secondary" onClick={() => setShowManageCatModal(false)}>Close</button>
                <button className="fs-btn-primary" onClick={() => { setShowManageCatModal(false); setShowCatModal(true); setEditingCat(null); setCatForm(BLANK_CAT); setError('') }}>
                  <Plus size={14} /> Add Category
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Toast ═══ */}
      {toast && (
        <div className={`fs-toast ${toast.type}`}>
          {toast.type === 'success' ? <CheckCircle size={15} /> : toast.type === 'error' ? <AlertOctagon size={15} /> : <Clock size={15} />}
          {toast.msg}
        </div>
      )}
    </div>
  )
}
