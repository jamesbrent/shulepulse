import { useState, useEffect } from 'react'
import {
  MessageSquare, Save, CheckCircle, Search, Users, Calendar
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import './Comments.css'

const TERM_ORDER = ['Term 1', 'Term 2', 'Term 3']

export default function Comments({ profile }) {
  const [students, setStudents] = useState([])
  const [teacherClasses, setTeacherClasses] = useState([])
  const [existingComments, setExistingComments] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const [selectedClass, setSelectedClass] = useState('')
  const [selectedStudent, setSelectedStudent] = useState('')
  const [comment, setComment] = useState('')
  const [term, setTerm] = useState('')
  const [year, setYear] = useState('')
  const [terms, setTerms] = useState(TERM_ORDER)
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear())
  const [search, setSearch] = useState('')
  const [charCount, setCharCount] = useState(0)

  useEffect(() => {
    if (!profile?.school_id) return
    fetchData()
  }, [profile])

  useEffect(() => {
    if (selectedStudent && selectedClass) {
      setComment(existingComments[selectedStudent] || '')
    }
  }, [selectedStudent])

  useEffect(() => {
    setCharCount(comment.length)
  }, [comment])

  const fetchData = async () => {
    setLoading(true)
    const schoolId = profile.school_id

    const [{ data: teacherRec }, { data: school }] = await Promise.all([
      supabase.from('teachers').select('id').eq('email', profile.email).eq('school_id', schoolId).maybeSingle(),
      supabase.from('schools').select('current_term, current_year').eq('id', schoolId).single(),
    ])

    if (!teacherRec) { setLoading(false); return }

    const schoolTerm = school?.current_term || 'Term 1'
    const schoolYear = school?.current_year || new Date().getFullYear()
    const termIdx = TERM_ORDER.indexOf(schoolTerm)
    const derivedTerms = termIdx >= 0 ? TERM_ORDER : ['Term 1', 'Term 2', 'Term 3']

    setTerms(derivedTerms)
    setCurrentYear(schoolYear)
    setTerm(derivedTerms[Math.max(0, termIdx)])
    setYear(String(schoolYear))

    const { data: slots } = await supabase
      .from('timetable_slots')
      .select('class_id, classes(class_name)')
      .eq('teacher_id', teacherRec.id)
      .eq('school_id', schoolId)

    const uniqueClasses = [...new Set((slots || []).map(s => s.classes?.class_name?.trim()).filter(Boolean))].sort()
    setTeacherClasses(uniqueClasses)

    if (uniqueClasses.length > 0 && !selectedClass) setSelectedClass(uniqueClasses[0])

    if (uniqueClasses.length > 0) {
      const { data: studentsData } = await supabase
        .from('students')
        .select('id, full_name, class, admission_number')
        .eq('school_id', schoolId)
        .eq('status', 'active')
        .in('class', uniqueClasses)
        .order('full_name')

      setStudents(studentsData || [])
    } else {
      setStudents([])
    }

    const { data: existing } = await supabase
      .from('teacher_comments')
      .select('student_id, comment')
      .eq('school_id', schoolId)
      .eq('teacher_id', teacherRec.id)
      .eq('term', term)
      .eq('year', Number(year))

    const commentMap = {}
    ;(existing || []).forEach(c => { commentMap[c.student_id] = c.comment })
    setExistingComments(commentMap)

    setLoading(false)
  }

  const fetchExistingComments = async () => {
    const { data: teacherRec } = await supabase
      .from('teachers')
      .select('id')
      .eq('email', profile.email)
      .eq('school_id', profile.school_id)
      .maybeSingle()
    if (!teacherRec) return

    const { data: existing } = await supabase
      .from('teacher_comments')
      .select('student_id, comment')
      .eq('school_id', profile.school_id)
      .eq('teacher_id', teacherRec.id)
      .eq('term', term)
      .eq('year', Number(year))

    const commentMap = {}
    ;(existing || []).forEach(c => { commentMap[c.student_id] = c.comment })
    setExistingComments(commentMap)

    if (selectedStudent) {
      setComment(commentMap[selectedStudent] || '')
    }
  }

  const filteredStudents = students.filter(s => {
    const matchClass = !selectedClass || s.class === selectedClass
    const matchSearch = !search ||
      s.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      s.admission_number?.toLowerCase().includes(search.toLowerCase())
    return matchClass && matchSearch
  })

  const handleSave = async () => {
    if (!selectedStudent || !comment.trim()) return
    setSaving(true)

    const { data: teacherRec } = await supabase
      .from('teachers')
      .select('id')
      .eq('email', profile.email)
      .eq('school_id', profile.school_id)
      .maybeSingle()
    if (!teacherRec) { setSaving(false); alert('Teacher record not found. Contact admin.'); return }

    const { error } = await supabase
      .from('teacher_comments')
      .upsert({
        school_id: profile.school_id,
        student_id: selectedStudent,
        teacher_id: teacherRec.id,
        class_name: selectedClass,
        comment: comment.trim(),
        term,
        year: Number(year),
      }, { onConflict: 'student_id,term,year' })

    setSaving(false)
    if (error) {
      alert('Error saving comment: ' + error.message)
      return
    }
    setSaved(true)
    setExistingComments(prev => ({ ...prev, [selectedStudent]: comment.trim() }))
    setTimeout(() => setSaved(false), 3000)
  }

  const handleStudentSelect = (studentId) => {
    setSelectedStudent(studentId)
    setComment(existingComments[studentId] || '')
  }

  const selectedStudentData = students.find(s => s.id === selectedStudent)

  if (loading) return (
    <div className="cmt-page">
      <div className="cmt-empty" style={{ minHeight: '60vh' }}>
        <div className="cmt-empty-icon"><MessageSquare size={24} color="#94A3B8" /></div>
        <h4>Loading comments...</h4>
      </div>
    </div>
  )

  if (teacherClasses.length === 0) {
    return (
      <div className="cmt-page">
        <div className="cmt-empty" style={{ minHeight: '60vh' }}>
          <div className="cmt-empty-icon"><MessageSquare size={24} color="#94A3B8" /></div>
          <h4>No classes assigned</h4>
          <p>You need to be assigned classes in the timetable first</p>
        </div>
      </div>
    )
  }

  return (
    <div className="cmt-page">

      {/* ── Filter Toolbar ── */}
      <div className="cmt-toolbar">
        <div className="cmt-filters">
          <select className="cmt-select" value={selectedClass} onChange={e => { setSelectedClass(e.target.value); setSelectedStudent(''); setComment('') }}>
            {teacherClasses.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="cmt-select" value={term} onChange={e => { setTerm(e.target.value); fetchExistingComments() }}>
            {terms.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className="cmt-select" value={year} onChange={e => setYear(e.target.value)}>
            {[currentYear - 1, currentYear, currentYear + 1].map(y => <option key={y} value={String(y)}>{y}</option>)}
          </select>
          <div className="cmt-search">
            <Search size={14} className="cmt-search-icon" />
            <input className="cmt-search-input" placeholder="Search student..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <button
          className={`cmt-save-btn ${saved ? 'cmt-save-btn--saved' : ''}`}
          onClick={handleSave}
          disabled={saving || !selectedStudent || !comment.trim()}
        >
          {saved ? <><CheckCircle size={15} /> Saved</> : <><Save size={15} /> {saving ? 'Saving...' : 'Save Comment'}</>}
        </button>
      </div>

      {/* ── Two-Panel Layout ── */}
      <div className="cmt-layout">

        {/* Student List */}
        <div className="cmt-students">
          <div className="cmt-students-hdr">
            <p className="cmt-students-title">
              <Users size={13} /> Students
            </p>
            <span className="cmt-students-count">{filteredStudents.length}</span>
          </div>
          <div className="cmt-students-list">
            {filteredStudents.length === 0 ? (
              <div className="cmt-empty" style={{ minHeight: 200 }}>
                <div className="cmt-empty-icon"><Users size={20} color="#94A3B8" /></div>
                <h4>No students found</h4>
                <p>Try adjusting the class, term, or search filter</p>
              </div>
            ) : (
              filteredStudents.map(s => {
                const initials = s.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2) || '??'
                return (
                  <button
                    key={s.id}
                    className={`cmt-student ${selectedStudent === s.id ? 'cmt-student--active' : ''}`}
                    onClick={() => handleStudentSelect(s.id)}
                  >
                    <div className="cmt-avatar">{initials}</div>
                    <div className="cmt-student-info">
                      <p className="cmt-student-name">{s.full_name}</p>
                      <p className="cmt-student-adm">{s.admission_number || '—'}</p>
                    </div>
                    {existingComments[s.id] && (
                      <span className="cmt-has-comment" title="Has comment">
                        <MessageSquare size={12} />
                      </span>
                    )}
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* Comment Editor */}
        <div className="cmt-editor">
          {!selectedStudent ? (
            <div className="cmt-empty">
              <div className="cmt-empty-icon"><MessageSquare size={24} color="#94A3B8" /></div>
              <h4>Select a student to add a comment</h4>
              <p>Choose a student from the list on the left</p>
            </div>
          ) : (
            <>
              <div className="cmt-editor-hdr">
                <div className="cmt-editor-student">
                  <div className="cmt-editor-avatar">
                    {selectedStudentData?.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2) || '??'}
                  </div>
                  <div>
                    <p className="cmt-editor-name">{selectedStudentData?.full_name}</p>
                    <p className="cmt-editor-meta">{selectedStudentData?.admission_number} · {selectedStudentData?.class}</p>
                  </div>
                </div>
                <div className="cmt-term-badge">
                  <Calendar size={12} /> {term} {year}
                </div>
              </div>

              <div className="cmt-editor-body">
                <textarea
                  className="cmt-textarea"
                  placeholder="Write your comment about this student's performance, behaviour, and areas for improvement..."
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  rows={10}
                  maxLength={2000}
                />
                <div className="cmt-textarea-footer">
                  <span className="cmt-char-count">{charCount}/2000</span>
                </div>
              </div>

              <div className="cmt-editor-footer">
                <button className="cmt-save-btn" onClick={handleSave} disabled={saving || !comment.trim()}>
                  {saved ? <><CheckCircle size={15} /> Saved</> : <><Save size={15} /> {saving ? 'Saving...' : 'Save Comment'}</>}
                </button>
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  )
}
