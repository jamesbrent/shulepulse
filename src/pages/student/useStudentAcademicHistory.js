import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const TERM_ORDER = { 'Term 1': 1, 'Term 2': 2, 'Term 3': 3 }

const termLabel = (term, year) => `${term || 'Term'} ${year || ''}`.trim()

export default function useStudentAcademicHistory({ student, school }) {
  const [terms, setTerms] = useState([])
  const [classes, setClasses] = useState([])
  const [selectedTerm, setSelectedTerm] = useState('')
  const [selectedYear, setSelectedYear] = useState('')
  const [selectedClass, setSelectedClass] = useState('')
  const [grades, setGrades] = useState([])
  const [cbc, setCbc] = useState([])
  const [loading, setLoading] = useState(true)
  const [optionsLoaded, setOptionsLoaded] = useState(false)

  const currentTerm = school?.current_term || 'Term 1'
  const currentYear = school?.current_year || new Date().getFullYear()

  useEffect(() => {
    if (!student?.id) {
      setLoading(false)
      return
    }
    let active = true
    const loadOptions = async () => {
      const { data: gradeRows } = await supabase
        .from('grades')
        .select('term, year, class_name')
        .eq('student_id', student.id)
        .in('status', ['approved', 'published'])

      const rows = gradeRows || []
      const termMap = {}
      rows.forEach(r => {
        if (!r.term) return
        termMap[`${r.year}|${r.term}`] = { term: r.term, year: r.year }
      })
      if (currentTerm) {
        termMap[`${currentYear}|${currentTerm}`] = { term: currentTerm, year: currentYear }
      }

      const termList = Object.values(termMap).sort((a, b) =>
        (Number(b.year) - Number(a.year)) || ((TERM_ORDER[a.term] || 0) - (TERM_ORDER[b.term] || 0))
      )

      const classSet = new Set()
      rows.forEach(r => { if (r.class_name) classSet.add(r.class_name) })
      if (student.class) classSet.add(student.class)
      const classList = [...classSet].sort((a, b) => a.localeCompare(b))

      if (!active) return
      setTerms(termList)
      setClasses(classList)
      setSelectedTerm(currentTerm)
      setSelectedYear(String(currentYear))
      setSelectedClass(student.class || classList[0] || '')
      setOptionsLoaded(true)
    }
    loadOptions()
    return () => { active = false }
  }, [student?.id, student?.class, currentTerm, currentYear])

  useEffect(() => {
    if (!student?.id || !optionsLoaded) return
    if (!selectedTerm || !selectedYear || !selectedClass) {
      setGrades([])
      setCbc([])
      setLoading(false)
      return
    }
    let active = true
    setLoading(true)
    Promise.all([
      supabase
        .from('grades')
        .select('*')
        .eq('student_id', student.id)
        .eq('term', selectedTerm)
        .eq('year', Number(selectedYear))
        .eq('class_name', selectedClass)
        .in('status', ['approved', 'published'])
        .order('subject'),
      supabase
        .from('cbc_assessments')
        .select('*')
        .eq('student_id', student.id)
        .eq('term', selectedTerm)
        .eq('year', Number(selectedYear))
        .eq('class_name', selectedClass)
        .order('subject'),
    ]).then(([g, c]) => {
      if (!active) return
      setGrades(g.data || [])
      setCbc(c.data || [])
      setLoading(false)
    }).catch(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [student?.id, optionsLoaded, selectedTerm, selectedYear, selectedClass])

  return {
    terms,
    classes,
    selectedTerm,
    setSelectedTerm,
    selectedYear,
    setSelectedYear,
    selectedClass,
    setSelectedClass,
    termKey: `${selectedYear}|${selectedTerm}`,
    setTermKey: (key) => {
      const [year, term] = key.split('|')
      setSelectedYear(year)
      setSelectedTerm(term)
    },
    grades,
    cbc,
    loading,
    currentTerm,
    currentYear,
    termLabel,
  }
}
