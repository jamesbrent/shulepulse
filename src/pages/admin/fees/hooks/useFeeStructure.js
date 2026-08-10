import { useState, useCallback, useEffect } from 'react'
import { supabase } from '../../../../lib/supabase'
import * as XLSX from 'xlsx'

export function useFeeStructure(schoolId, term, year) {
  const [categories, setCategories] = useState([])
  const [structures, setStructures] = useState([])
  const [students,   setStudents]   = useState([])
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState('')

  // Classes derived from active students
  const classes = [...new Set(students.map((s) => s.class).filter(Boolean))].sort()

  const load = useCallback(async () => {
    setLoading(true)
    const [catRes, strRes, stuRes] = await Promise.all([
      supabase
        .from('fee_categories')
        .select('*')
        .eq('school_id', schoolId)
        .order('name'),
      supabase
        .from('fee_structures')
        .select('*, fee_categories(name, applies_to)')
        .eq('school_id', schoolId)
        .eq('term', term || '')
        .eq('year', year || '')
        .order('class'),
      supabase
        .from('students')
        .select('id, full_name, class, admission_number, day_boarding, transport_route')
        .eq('school_id', schoolId)
        .eq('status', 'active'),
    ])
    setCategories(catRes.data || [])
    setStructures(strRes.data || [])
    setStudents(stuRes.data || [])
    setLoading(false)
  }, [schoolId, term, year])

  useEffect(() => { load() }, [load])

  // ── Add Category ──────────────────────────────────────────────────────────
  const addCategory = async (form) => {
    setSaving(true); setError('')
    const { error: err } = await supabase.from('fee_categories').insert({
      school_id:    schoolId,
      name:         form.name,
      description:  form.description || null,
      code:         form.code || null,
      mandatory:    form.mandatory,
      is_recurring: form.is_recurring ?? false,
      is_refundable: form.is_refundable ?? false,
      is_taxable:   form.is_taxable ?? false,
      applies_to:   form.applies_to || 'all',
      display_order: form.display_order ?? 0,
      is_active:    true,
    })
    setSaving(false)
    if (err) { setError(err.message); return false }
    load()
    return true
  }

  // ── Update Category ───────────────────────────────────────────────────────
  const updateCategory = async (id, form) => {
    setSaving(true); setError('')
    const { error: err } = await supabase.from('fee_categories').update({
      name:         form.name,
      description:  form.description || null,
      code:         form.code || null,
      mandatory:    form.mandatory,
      is_recurring: form.is_recurring ?? false,
      is_refundable: form.is_refundable ?? false,
      is_taxable:   form.is_taxable ?? false,
      applies_to:   form.applies_to || 'all',
      display_order: form.display_order ?? 0,
      is_active:    form.is_active ?? true,
    }).eq('id', id)
    setSaving(false)
    if (err) { setError(err.message); return false }
    load()
    return true
  }

  // ── Toggle Category Active ────────────────────────────────────────────────
  const toggleCategoryActive = async (id, current) => {
    await supabase.from('fee_categories').update({ is_active: !current }).eq('id', id)
    load()
  }

  // ── Delete Category ───────────────────────────────────────────────────────
  const deleteCategory = async (id) => {
    const { error } = await supabase.from('fee_categories').delete().eq('id', id)
    if (error) { setError(error.message); return false }
    load()
    return true
  }

  // ── Add Structure ─────────────────────────────────────────────────────────
  const addStructure = async (form) => {
    setSaving(true); setError('')
    const classVal = form.class === '__all__' ? '__all__' : form.class
    const { data: newFs, error: err } = await supabase.from('fee_structures').insert({
      school_id:   schoolId,
      category_id: form.category_id,
      class:       classVal,
      term,
      year:        parseInt(year),
      amount:      parseFloat(form.amount),
      mandatory:   form.mandatory,
    }).select().single()

    if (err) { setError(err.message); setSaving(false); return false }

    // Also insert into fee_structure_items
    await supabase.from('fee_structure_items').insert({
      fee_structure_id: newFs.id,
      fee_category_id:  form.category_id,
      amount:           parseFloat(form.amount),
    })

    setSaving(false)
    load()
    return true
  }

  // ── Delete Structure ──────────────────────────────────────────────────────
  const deleteStructure = async (id) => {
    const { error } = await supabase.from('fee_structures').delete().eq('id', id)
    if (error) { setError(error.message); return false }
    load()
    return true
  }

  const matchesAppliesTo = (st, student) => {
    const appliesTo = st.fee_categories?.applies_to
    if (!appliesTo || appliesTo === 'all') return true
    if (appliesTo === 'boarding') return student.day_boarding === 'boarding'
    if (appliesTo === 'day') return student.day_boarding === 'day'
    if (appliesTo === 'transport') return !!student.transport_route
    return true
  }

  // ── Generate Assessments ──────────────────────────────────────────────────
  const generateAssessments = async () => {
    let created = 0, skipped = 0

    for (const student of students) {
      const matching = structures.filter(
        (s) => s.class === student.class && matchesAppliesTo(s, student)
      )
      for (const st of matching) {
        const { data: existing } = await supabase
          .from('fee_assessments')
          .select('id')
          .eq('school_id', schoolId)
          .eq('student_id', student.id)
          .eq('fee_structure_id', st.id)
          .eq('term', term)
          .eq('year', year)
          .maybeSingle()

        if (existing) { skipped++; continue }

        const { error: aErr } = await supabase.from('fee_assessments').insert({
          school_id:        schoolId,
          student_id:       student.id,
          fee_structure_id: st.id,
          term,
          year:             parseInt(year),
          amount_due:       st.amount,
          status:           'pending',
        })

        if (!aErr) {
          await supabase.from('student_ledger').insert({
            school_id:   schoolId,
            student_id:  student.id,
            entry_type:  'charge',
            amount:      st.amount,
            term,
            year:        parseInt(year),
            description: `${st.fee_categories?.name || 'Fee'} — ${term} ${year}`,
          })
          created++
        }
      }
    }

    return { created, skipped }
  }

  // ── Download Excel Template (Option A) ───────────────────────────────────
  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Grade', 'Academic Year', 'Term', 'Fee Category', 'Amount'],
      ['Grade 1', 2026, 'Term 1', 'Tuition', 30000],
      ['Grade 1', 2026, 'Term 1', 'Transport', 5000],
      ['Grade 2', 2026, 'Term 1', 'Tuition', 32000],
    ])
    ws['!cols'] = [{ wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 20 }, { wch: 10 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Fee Structures')
    XLSX.writeFile(wb, 'fee_structure_template.xlsx')
  }

  // ── Import from Excel ────────────────────────────────────────────────────
  const importExcel = async (file) => {
    setSaving(true); setError('')

    const buf = await file.arrayBuffer()
    const wb  = XLSX.read(buf, { type: 'array' })
    const ws  = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })

    if (!rows.length) { setError('Excel file is empty.'); setSaving(false); return null }

    // Refresh categories from DB so we have the latest
    const { data: freshCats } = await supabase
      .from('fee_categories')
      .select('id, name, mandatory')
      .eq('school_id', schoolId)
    const allCats = freshCats || []

    const catMap = {}
    allCats.forEach((c) => {
      catMap[c.name.trim().toLowerCase()] = { id: c.id, mandatory: c.mandatory }
    })

    const inserted = []
    const errors   = []
    let needReload = false

    const ensureCategory = async (name) => {
      const key = name.trim().toLowerCase()
      if (catMap[key]) return catMap[key]
      const { data: newCat, error } = await supabase.from('fee_categories').insert({
        school_id: schoolId, name: name.trim(), mandatory: true,
        is_recurring: false, is_refundable: false, is_taxable: false,
        applies_to: 'all', display_order: 0, is_active: true,
      }).select('id, name, mandatory').single()
      if (error || !newCat) return null
      catMap[key] = { id: newCat.id, mandatory: newCat.mandatory }
      needReload = true
      return catMap[key]
    }

    for (let i = 0; i < rows.length; i++) {
      const r   = rows[i]
      const row = i + 2
      const grade    = (r['Grade'] || '').toString().trim()
      const acYear   = (r['Academic Year'] || '').toString().trim()
      const termRow  = (r['Term'] || '').toString().trim()
      const catName  = (r['Fee Category'] || '').toString().trim()
      const amount   = parseFloat(r['Amount'])

      if (!grade) { errors.push(`Row ${row}: Grade is required.`); continue }
      if (!acYear) { errors.push(`Row ${row}: Academic Year is required.`); continue }
      if (!termRow) { errors.push(`Row ${row}: Term is required.`); continue }
      if (!catName) { errors.push(`Row ${row}: Fee Category is required.`); continue }
      if (isNaN(amount) || amount <= 0) { errors.push(`Row ${row}: Amount must be a positive number.`); continue }

      const yearNum = parseInt(acYear)
      if (isNaN(yearNum)) { errors.push(`Row ${row}: Academic Year must be a number (e.g. 2026).`); continue }

      let cat = catMap[catName.toLowerCase()]
      if (!cat) {
        cat = await ensureCategory(catName)
        if (!cat) { errors.push(`Row ${row}: Failed to create category "${catName}".`); continue }
        errors.push(`Row ${row}: Category "${catName}" auto-created.`)
      }

      const dup = structures.some(
        (s) => s.class === grade && s.category_id === cat.id && s.term === termRow && s.year === yearNum
      )
      if (dup) { errors.push(`Row ${row}: "${catName}" for ${grade} — ${termRow} ${yearNum} already exists.`); continue }

      const { data: newFs, error: insErr } = await supabase.from('fee_structures').insert({
        school_id:   schoolId,
        category_id: cat.id,
        class:       grade,
        term:        termRow,
        year:        yearNum,
        amount,
        mandatory:   cat.mandatory,
      }).select().single()

      if (insErr) {
        errors.push(`Row ${row}: ${insErr.message}`)
      } else {
        await supabase.from('fee_structure_items').insert({
          fee_structure_id: newFs.id,
          fee_category_id:  cat.id,
          amount,
        })
        inserted.push({ class: grade, term: termRow, year: yearNum, category: catName, amount })
      }
    }

    setSaving(false)
    if (inserted.length > 0 || needReload) load()
    return { inserted: inserted.length, errors }
  }

  return {
    categories, structures, students, classes,
    loading, saving, error,
    setError,
    addCategory, updateCategory, toggleCategoryActive, deleteCategory,
    addStructure, deleteStructure,
    generateAssessments,
    downloadTemplate, importExcel,
    reload: load,
  }
}