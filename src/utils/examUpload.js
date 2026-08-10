import { supabase } from '../lib/supabase'

const BUCKET = 'exam-papers'
const UPLOAD_PREFIX = 'exam_uploads'
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
]

export function getFileType(file) {
  if (file.type === 'application/pdf') return 'pdf'
  if (file.type === 'application/msword') return 'doc'
  if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx'
  return null
}

export function validateExamFile(file) {
  if (!file) return { valid: false, error: 'No file selected' }
  if (file.size > MAX_FILE_SIZE) return { valid: false, error: 'File exceeds 10MB limit' }
  if (!ALLOWED_TYPES.includes(file.type)) return { valid: false, error: 'Only PDF and Word (.docx) files are accepted' }
  const fileType = getFileType(file)
  if (!fileType) return { valid: false, error: 'Unsupported file type' }
  return { valid: true, fileType }
}

export async function uploadExamFile(file, { schoolId, subject, examType, className, term, year, uploadedBy, uploadedByRole }) {
  const validation = validateExamFile(file)
  if (!validation.valid) throw new Error(validation.error)

  const ext = validation.fileType === 'pdf' ? 'pdf' : 'docx'
  const safeSubject = (subject || 'general').replace(/[^a-zA-Z0-9]/g, '_')
  const safeExam = (examType || 'endterm').replace(/[^a-zA-Z0-9]/g, '_')
  const safeClass = (className || 'all').replace(/[^a-zA-Z0-9]/g, '_')
  const filePath = `${schoolId}/${UPLOAD_PREFIX}/${safeExam}/${safeSubject}/${safeClass}/${year}_${term}_${Date.now()}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, file, { upsert: false, contentType: file.type })
  if (uploadError) throw uploadError

  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(filePath)

  const record = {
    school_id: schoolId,
    subject,
    exam_type: examType,
    class_name: className || null,
    term,
    year: Number(year),
    file_url: publicUrl,
    file_name: file.name,
    file_type: validation.fileType,
    file_size: file.size,
    storage_path: filePath,
    uploaded_by: uploadedBy,
    uploaded_by_role: uploadedByRole,
    status: 'pending',
  }

  const { data, error: dbError } = await supabase
    .from('exam_uploads')
    .insert(record)
    .select()
    .single()

  if (dbError) throw dbError
  return data
}

export async function deleteExamFile(uploadId) {
  const { data: record, error: fetchError } = await supabase
    .from('exam_uploads')
    .select('storage_path')
    .eq('id', uploadId)
    .single()

  if (fetchError) throw fetchError

  if (record?.storage_path) {
    await supabase.storage.from(BUCKET).remove([record.storage_path])
  }

  const { error } = await supabase
    .from('exam_uploads')
    .delete()
    .eq('id', uploadId)

  if (error) throw error
}

export async function fetchExamUploads(schoolId, filters = {}) {
  let query = supabase
    .from('exam_uploads')
    .select('*, profiles!uploaded_by(full_name)')
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false })

  if (filters.term) query = query.eq('term', filters.term)
  if (filters.year) query = query.eq('year', filters.year)
  if (filters.subject) query = query.eq('subject', filters.subject)
  if (filters.examType) query = query.eq('exam_type', filters.examType)
  if (filters.className) query = query.eq('class_name', filters.className)
  if (filters.status) query = query.eq('status', filters.status)
  if (filters.uploadedBy) query = query.eq('uploaded_by', filters.uploadedBy)
  if (filters.uploadedByRole) query = query.eq('uploaded_by_role', filters.uploadedByRole)

  const { data, error } = await query
  if (error) throw error
  return data || []
}

export async function fetchExamUploadForGroup(schoolId, { subject, examType, className, term, year, uploadedBy }) {
  let query = supabase
    .from('exam_uploads')
    .select('*, profiles!uploaded_by(full_name)')
    .eq('school_id', schoolId)
    .eq('subject', subject)
    .eq('exam_type', examType)
    .eq('term', term)
    .eq('year', year)
    .eq('class_name', className || null)

  if (uploadedBy) query = query.eq('uploaded_by', uploadedBy)

  const { data, error } = await query.maybeSingle()
  if (error) throw error
  return data
}

export async function getSignedUrl(storagePath) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 3600)
  if (error) throw error
  return data.signedUrl
}
