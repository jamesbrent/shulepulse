import { useState, useEffect } from 'react'
import {
  MessageSquare, Search, Calendar, User, Trash2,
  Filter, BookOpen, Users, RefreshCw
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'

export default function AdminComments() {
  const { profile } = useAuthStore()
  const [activeTab, setActiveTab] = useState('teacher')
  const [teacherComments, setTeacherComments] = useState([])
  const [classComments, setClassComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterClass, setFilterClass] = useState('')
  const [filterTerm, setFilterTerm] = useState('')
  const [filterYear, setFilterYear] = useState('')
  const [filterTeacher, setFilterTeacher] = useState('')
  const [classes, setClasses] = useState([])
  const [teachers, setTeachers] = useState([])
  const [schoolInfo, setSchoolInfo] = useState(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!profile?.school_id) return
    fetchAll()
  }, [profile])

  const fetchAll = async () => {
    setLoading(true)
    const schoolId = profile.school_id

    const [{ data: school }, { data: cls }, { data: tch }] = await Promise.all([
      supabase.from('schools').select('current_term, current_year').eq('id', schoolId).single(),
      supabase.from('classes').select('class_name').eq('school_id', schoolId).order('class_name'),
      supabase.from('teachers').select('id, full_name, class').eq('school_id', schoolId).order('full_name'),
    ])

    setSchoolInfo(school)
    setClasses(cls?.map(c => c.class_name) || [])
    setTeachers(tch || [])
    setFilterTerm(school?.current_term || 'Term 1')
    setFilterYear(String(school?.current_year || new Date().getFullYear()))

    await Promise.all([
      fetchTeacherComments(schoolId, school?.current_term, school?.current_year),
      fetchClassComments(schoolId, school?.current_term, school?.current_year),
    ])

    setLoading(false)
  }

  const fetchTeacherComments = async (schoolId, term, year) => {
    let query = supabase
      .from('teacher_comments')
      .select('*, students(full_name, class, admission_number), teachers(full_name)')
      .eq('school_id', schoolId)

    if (term) query = query.eq('term', term)
    if (year) query = query.eq('year', Number(year))

    const { data } = await query.order('created_at', { ascending: false })
    setTeacherComments(data || [])
  }

  const fetchClassComments = async (schoolId, term, year) => {
    let query = supabase
      .from('class_comments')
      .select('*')
      .eq('school_id', schoolId)

    if (term) query = query.eq('term', term)
    if (year) query = query.eq('year', Number(year))

    const { data } = await query.order('created_at', { ascending: false })
    setClassComments(data || [])
  }

  const applyFilters = async () => {
    setLoading(true)
    const schoolId = profile.school_id

    let tq = supabase
      .from('teacher_comments')
      .select('*, students(full_name, class, admission_number), teachers(full_name)')
      .eq('school_id', schoolId)

    let cq = supabase
      .from('class_comments')
      .select('*')
      .eq('school_id', schoolId)

    if (filterTerm) {
      tq = tq.eq('term', filterTerm)
      cq = cq.eq('term', filterTerm)
    }
    if (filterYear) {
      tq = tq.eq('year', Number(filterYear))
      cq = cq.eq('year', Number(filterYear))
    }
    if (filterClass) {
      const filteredTeacherIds = teachers.filter(t => t.class === filterClass).map(t => t.id)
      if (filteredTeacherIds.length > 0) {
        tq = tq.in('teacher_id', filteredTeacherIds)
      } else {
        tq = tq.eq('class_name', filterClass)
      }
      cq = cq.eq('class_name', filterClass)
    }
    if (filterTeacher) {
      tq = tq.eq('teacher_id', filterTeacher)
    }

    const [tRes, cRes] = await Promise.all([
      tq.order('created_at', { ascending: false }),
      cq.order('created_at', { ascending: false }),
    ])

    setTeacherComments(tRes.data || [])
    setClassComments(cRes.data || [])
    setLoading(false)
  }

  const deleteTeacherComment = async (id) => {
    if (!window.confirm('Delete this teacher comment?')) return
    const { error } = await supabase.from('teacher_comments').delete().eq('id', id)
    if (!error) {
      setTeacherComments(prev => prev.filter(c => c.id !== id))
    }
  }

  const deleteClassComment = async (id) => {
    if (!window.confirm('Delete this class comment?')) return
    const { error } = await supabase.from('class_comments').delete().eq('id', id)
    if (!error) {
      setClassComments(prev => prev.filter(c => c.id !== id))
    }
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleDateString('en-KE', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    })
  }

  const filteredTeacherComments = teacherComments.filter(c => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      c.students?.full_name?.toLowerCase().includes(q) ||
      c.students?.admission_number?.toLowerCase().includes(q) ||
      c.teachers?.full_name?.toLowerCase().includes(q) ||
      c.comment?.toLowerCase().includes(q)
    )
  })

  const filteredClassComments = classComments.filter(c => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      c.class_name?.toLowerCase().includes(q) ||
      c.teacher_name?.toLowerCase().includes(q) ||
      c.comment?.toLowerCase().includes(q) ||
      c.subject?.toLowerCase().includes(q)
    )
  })

  if (loading && teacherComments.length === 0 && classComments.length === 0) {
    return <p className="loading-state">Loading comments...</p>
  }

  return (
    <div className="admin-comments-page">
      <div className="att-toolbar">
        <div className="att-toolbar-left">
          <button
            className={`filter-select ${activeTab === 'teacher' ? 'active' : ''}`}
            onClick={() => setActiveTab('teacher')}
            style={{ width: 'auto', padding: '8px 16px', cursor: 'pointer' }}
          >
            <User size={14} /> Teacher Comments ({teacherComments.length})
          </button>
          <button
            className={`filter-select ${activeTab === 'class' ? 'active' : ''}`}
            onClick={() => setActiveTab('class')}
            style={{ width: 'auto', padding: '8px 16px', cursor: 'pointer' }}
          >
            <Users size={14} /> Class Comments ({classComments.length})
          </button>
        </div>
        <button className="btn-secondary" onClick={applyFilters}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div className="att-toolbar" style={{ marginTop: 0, borderTop: 'none' }}>
        <div className="att-toolbar-left">
          <select className="filter-select" value={filterClass} onChange={e => setFilterClass(e.target.value)}>
            <option value="">All Classes</option>
            {classes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {activeTab === 'teacher' && (
            <select className="filter-select" value={filterTeacher} onChange={e => setFilterTeacher(e.target.value)}>
              <option value="">All Teachers</option>
              {teachers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
            </select>
          )}
          <select className="filter-select" value={filterTerm} onChange={e => setFilterTerm(e.target.value)}>
            <option value="">All Terms</option>
            <option value="Term 1">Term 1</option>
            <option value="Term 2">Term 2</option>
            <option value="Term 3">Term 3</option>
          </select>
          <select className="filter-select" value={filterYear} onChange={e => setFilterYear(e.target.value)}>
            <option value="">All Years</option>
            {[schoolInfo?.current_year ?? new Date().getFullYear() + 1,
              schoolInfo?.current_year ?? new Date().getFullYear(),
              (schoolInfo?.current_year ?? new Date().getFullYear()) - 1].map(y => (
              <option key={y} value={String(y)}>{y}</option>
            ))}
          </select>
          <div className="search-wrap">
            <Search size={14} className="search-icon" />
            <input className="search-input" placeholder={`Search ${activeTab === 'teacher' ? 'student/teacher' : 'class/teacher'}...`} value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <button className="btn-primary" onClick={applyFilters}>
            <Filter size={14} /> Apply Filters
          </button>
        </div>
      </div>

      {activeTab === 'teacher' ? (
        <div className="admin-comments-table-wrap">
          {filteredTeacherComments.length === 0 ? (
            <div className="empty-att">
              <MessageSquare size={40} color="#cbd5e1" />
              <p>No teacher comments found</p>
              <span>Try adjusting your filters</span>
            </div>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Adm No.</th>
                  <th>Class</th>
                  <th>Teacher</th>
                  <th>Comment</th>
                  <th>Term/Year</th>
                  <th>Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredTeacherComments.map(c => (
                  <tr key={c.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{c.students?.full_name || '—'}</td>
                    <td className="monospace">{c.students?.admission_number || '—'}</td>
                    <td>{c.students?.class || c.class_name || '—'}</td>
                    <td>{c.teachers?.full_name || '—'}</td>
                    <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.comment}>
                      {c.comment?.substring(0, 100)}{c.comment?.length > 100 ? '...' : ''}
                    </td>
                    <td><span className="status-badge pending">{c.term} {c.year}</span></td>
                    <td style={{ color: '#64748b', fontSize: 13 }}>{formatDate(c.created_at)}</td>
                    <td>
                      <button className="btn-icon danger" onClick={() => deleteTeacherComment(c.id)} title="Delete">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div className="admin-comments-table-wrap">
          {filteredClassComments.length === 0 ? (
            <div className="empty-att">
              <MessageSquare size={40} color="#cbd5e1" />
              <p>No class comments found</p>
              <span>Try adjusting your filters</span>
            </div>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Class</th>
                  <th>Teacher</th>
                  <th>Subject</th>
                  <th>Comment</th>
                  <th>Term/Year</th>
                  <th>Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredClassComments.map(c => (
                  <tr key={c.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{c.class_name || '—'}</td>
                    <td>{c.teacher_name || '—'}</td>
                    <td><span className="status-badge paid">{c.subject || 'General'}</span></td>
                    <td style={{ maxWidth: 350, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.comment}>
                      {c.comment?.substring(0, 120)}{c.comment?.length > 120 ? '...' : ''}
                    </td>
                    <td><span className="status-badge pending">{c.term} {c.year}</span></td>
                    <td style={{ color: '#64748b', fontSize: 13 }}>{formatDate(c.created_at)}</td>
                    <td>
                      <button className="btn-icon danger" onClick={() => deleteClassComment(c.id)} title="Delete">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
