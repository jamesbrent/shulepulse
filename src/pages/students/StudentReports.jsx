import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Download, FileText } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'
import { exportToPDF } from '../../services/students/exportService'
import { fetchClasses, fetchStreams } from '../../services/students/studentService'

const REPORTS = [
  { key: 'class_list', label: 'Class List', icon: FileText },
  { key: 'gender', label: 'Gender Report', icon: FileText },
  { key: 'admissions', label: 'Admission Report', icon: FileText },
  { key: 'register', label: 'Student Register', icon: FileText },
  { key: 'medical', label: 'Medical Report', icon: FileText },
  { key: 'contacts', label: 'Parent Contact List', icon: FileText },
]

export default function StudentReports() {
  const { profile } = useAuthStore()
  const navigate = useNavigate()

  const [selectedReport, setSelectedReport] = useState('')
  const [classes, setClasses] = useState([])
  const [streams, setStreams] = useState([])
  const [filterClass, setFilterClass] = useState('')
  const [filterStream, setFilterStream] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (profile?.school_id) {
      fetchClasses(profile.school_id).then(setClasses)
      fetchStreams(profile.school_id).then(setStreams)
    }
  }, [profile])

  const generateReport = async () => {
    setLoading(true)
    let query = supabase
      .from('students')
      .select('*')
      .eq('school_id', profile.school_id)

    if (selectedReport === 'class_list' && filterClass) {
      query = query.eq('class', filterClass)
    }
    if (selectedReport === 'gender') {
      query = query.order('gender')
    }
    if (filterStream) query = query.eq('stream', filterStream)

    const { data } = await query.order('full_name')
    const students = data || []
    setLoading(false)

    if (students.length === 0) return

    const titles = {
      class_list: `Class List${filterClass ? ` — ${filterClass}` : ''}`,
      gender: 'Gender Distribution Report',
      admissions: 'Admission Report',
      register: 'Student Register',
      medical: 'Medical Report',
      contacts: 'Parent Contact List',
    }

    let filtered = students
    if (selectedReport === 'medical') {
      filtered = students.filter(s => s.blood_group || s.allergies || s.medical_conditions || s.special_needs)
    }
    if (selectedReport === 'contacts') {
      filtered = students.filter(s => s.parent_name || s.parent_phone)
    }

    exportToPDF(filtered, { title: titles[selectedReport] || 'Student Report' })
  }

  return (
    <div className="students-page">
      <div className="sp-header">
        <div>
          <button className="btn-ghost" onClick={() => navigate(-1)}>
            <ArrowLeft size={15} /> Back
          </button>
          <h2 style={{ marginTop: 8 }}>Student Reports</h2>
        </div>
      </div>

      <div className="form-card">
        <p className="form-section-label">Select Report</p>
        <div className="report-type-grid">
          {REPORTS.map(r => (
            <button
              key={r.key}
              className={`report-type-btn ${selectedReport === r.key ? 'active' : ''}`}
              onClick={() => setSelectedReport(r.key)}
            >
              <r.icon size={20} />
              <span>{r.label}</span>
            </button>
          ))}
        </div>

        {selectedReport === 'class_list' && (
          <div className="form-grid" style={{ marginTop: 16 }}>
            <div className="form-field">
              <label>Class</label>
              <select value={filterClass} onChange={e => setFilterClass(e.target.value)}>
                <option value="">All Classes</option>
                {classes.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label>Stream</label>
              <select value={filterStream} onChange={e => setFilterStream(e.target.value)}>
                <option value="">All Streams</option>
                {streams.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        )}

        {selectedReport && (
          <div className="form-actions">
            <button className="btn-primary" onClick={generateReport} disabled={loading}>
              <Download size={15} /> {loading ? 'Generating...' : 'Generate PDF'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
