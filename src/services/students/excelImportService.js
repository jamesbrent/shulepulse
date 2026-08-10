import * as XLSX from 'xlsx'
import { supabase } from '../../lib/supabase'

export function parseExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result)
        const workbook = XLSX.read(data, { type: 'array' })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' })
        resolve(rows)
      } catch (err) {
        reject(new Error('Failed to parse file: ' + err.message))
      }
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsArrayBuffer(file)
  })
}

export const REQUIRED_FIELDS = ['full_name', 'class']
export const VALID_FIELDS = [
  'full_name', 'admission_number', 'class', 'stream', 'gender',
  'date_of_birth', 'religion', 'nationality', 'previous_school',
  'blood_group', 'allergies', 'medical_conditions', 'special_needs',
  'day_boarding', 'parent_name', 'parent_phone', 'parent_email',
  'status',
]

export function validateRow(row, index) {
  const errors = []
  for (const field of REQUIRED_FIELDS) {
    if (!row[field] || String(row[field]).trim() === '') {
      errors.push(`Row ${index + 2}: "${field}" is required`)
    }
  }
  return errors
}

const GENDER_MAP = { m: 'male', male: 'male', f: 'female', female: 'female' }
const STATUS_MAP = { active: 'active', inactive: 'inactive', alumni: 'alumni', transferred: 'transferred' }
const BOARDING_MAP = { day: 'day', day_scholar: 'day', boarding: 'boarding', boarder: 'boarding' }

function normalizeRow(row) {
  const n = {}
  for (const [key, val] of Object.entries(row)) {
    const k = key.trim().toLowerCase().replace(/\s+/g, '_')
    if (VALID_FIELDS.includes(k)) {
      n[k] = typeof val === 'string' ? val.trim() : val
    }
  }
  if (n.gender) n.gender = GENDER_MAP[n.gender.toLowerCase()] || n.gender
  if (n.status) n.status = STATUS_MAP[n.status.toLowerCase()] || 'active'
  if (n.day_boarding) n.day_boarding = BOARDING_MAP[n.day_boarding.toLowerCase()] || n.day_boarding
  return n
}

export function previewImport(rows) {
  return rows.map((row, i) => {
    const normalized = normalizeRow(row)
    const errors = validateRow(normalized, i)
    const admissionNumber = normalized.admission_number || `IMP-${Date.now()}-${i}`
    return {
      rowIndex: i,
      raw: row,
      data: normalized,
      admissionNumber,
      errors,
      valid: errors.length === 0,
    }
  })
}

export async function executeImport(previewData, schoolId) {
  const results = { created: 0, updated: 0, skipped: 0, errors: [] }

  for (const item of previewData) {
    if (!item.valid) {
      results.skipped++
      continue
    }

    const { data: existing } = await supabase
      .from('students')
      .select('id')
      .eq('school_id', schoolId)
      .eq('admission_number', item.admissionNumber)
      .maybeSingle()

    const payload = {
      school_id: schoolId,
      admission_number: item.admissionNumber,
      full_name: item.data.full_name,
      class: item.data.class,
      stream: item.data.stream || null,
      gender: item.data.gender || null,
      date_of_birth: item.data.date_of_birth || null,
      religion: item.data.religion || null,
      nationality: item.data.nationality || null,
      previous_school: item.data.previous_school || null,
      blood_group: item.data.blood_group || null,
      allergies: item.data.allergies || null,
      medical_conditions: item.data.medical_conditions || null,
      special_needs: item.data.special_needs || null,
      day_boarding: item.data.day_boarding || null,
      status: item.data.status || 'active',
      parent_name: item.data.parent_name || null,
      parent_phone: item.data.parent_phone || null,
      parent_email: item.data.parent_email || null,
    }

    if (existing) {
      const { error } = await supabase
        .from('students')
        .update(payload)
        .eq('id', existing.id)
      if (error) results.errors.push(`Adm ${item.admissionNumber}: ${error.message}`)
      else results.updated++
    } else {
      const { error } = await supabase
        .from('students')
        .insert(payload)
      if (error) results.errors.push(`Adm ${item.admissionNumber}: ${error.message}`)
      else results.created++
    }
  }

  return results
}
