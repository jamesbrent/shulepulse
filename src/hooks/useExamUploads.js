import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { fetchExamUploads, fetchExamUploadForGroup, uploadExamFile, deleteExamFile } from '../utils/examUpload'

async function getSchoolId() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles')
    .select('school_id')
    .eq('id', user.id)
    .single()
  return profile?.school_id
}

export function useExamUploads(filters = {}) {
  const [uploads, setUploads] = useState([])
  const [loading, setLoading] = useState(true)
  const [schoolId, setSchoolId] = useState(null)

  useEffect(() => {
    let cancelled = false
    const init = async () => {
      const sid = await getSchoolId()
      if (cancelled) return
      setSchoolId(sid)
      if (!sid) { setLoading(false); return }
      try {
        const data = await fetchExamUploads(sid, filters)
        if (!cancelled) setUploads(data)
      } catch (err) {
        console.error('Failed to fetch exam uploads:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    init()
    return () => { cancelled = true }
  }, [filters.term, filters.year, filters.subject, filters.examType, filters.className, filters.status])

  const upload = useCallback(async (file, { subject, examType, className, term, year, uploadedBy, uploadedByRole }) => {
    if (!schoolId) throw new Error('No school context')
    const result = await uploadExamFile(file, {
      schoolId, subject, examType, className, term, year, uploadedBy, uploadedByRole,
    })
    setUploads(prev => {
      const filtered = prev.filter(u =>
        !(u.subject === subject && u.exam_type === examType && u.class_name === (className || null) && u.term === term && u.year === year)
      )
      return [result, ...filtered]
    })
    return result
  }, [schoolId])

  const remove = useCallback(async (uploadId) => {
    await deleteExamFile(uploadId)
    setUploads(prev => prev.filter(u => u.id !== uploadId))
  }, [])

  const getForGroup = useCallback(({ subject, examType, className }) => {
    return uploads.find(u =>
      u.subject === subject &&
      u.exam_type === examType &&
      (u.class_name || null) === (className || null)
    ) || null
  }, [uploads])

  const refresh = useCallback(async () => {
    if (!schoolId) return
    setLoading(true)
    try {
      const data = await fetchExamUploads(schoolId, filters)
      setUploads(data)
    } finally {
      setLoading(false)
    }
  }, [schoolId, filters])

  return { uploads, loading, schoolId, upload, remove, getForGroup, refresh }
}

export function useExamUpload(schoolId, { subject, examType, className, term, year }) {
  const [upload, setUpload] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!schoolId || !subject || !examType || !term || !year) { setLoading(false); return }
    let cancelled = false
    const fetch = async () => {
      try {
        const data = await fetchExamUploadForGroup(schoolId, { subject, examType, className, term, year })
        if (!cancelled) setUpload(data)
      } catch (err) {
        console.error('Failed to fetch exam upload:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetch()
    return () => { cancelled = true }
  }, [schoolId, subject, examType, className, term, year])

  return { upload, loading }
}
