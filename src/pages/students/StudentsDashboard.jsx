import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Users, Upload, ArrowUp, RefreshCw } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { fetchStudentStats } from '../../services/students/studentService'
import { StudentStatistics } from '../../components/students/StudentStatistics'

export default function StudentsDashboard() {
  const { profile } = useAuthStore()
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (profile?.school_id) loadStats()
  }, [profile])

  const loadStats = async () => {
    setLoading(true)
    try {
      const data = await fetchStudentStats(profile.school_id)
      setStats(data)
    } catch (e) {
      console.error('Failed to load stats', e)
    }
    setLoading(false)
  }

  return (
    <div className="students-page">
      <div className="sp-header">
        <div>
          <h2>Student Management</h2>
          <p>Overview of all students in your school</p>
        </div>
        <div className="sp-header-actions">
          <button className="btn-secondary" onClick={loadStats}>
            <RefreshCw size={14} /> Refresh
          </button>
          <button className="btn-primary" onClick={() => navigate('/admin/students/add')}>
            <Plus size={15} /> Add Student
          </button>
        </div>
      </div>

      <StudentStatistics stats={stats} loading={loading} />

      <div className="quick-action-grid">
        <div className="quick-action-card" onClick={() => navigate('/admin/students/import')}>
          <Upload size={24} color="#2563eb" />
          <p className="qa-title">Import Students</p>
          <p className="qa-desc">Upload Excel or CSV file</p>
        </div>
        <div className="quick-action-card" onClick={() => navigate('/admin/students/promotion')}>
          <ArrowUp size={24} color="#16a34a" />
          <p className="qa-title">Bulk Promotion</p>
          <p className="qa-desc">Promote students to next class</p>
        </div>
        <div className="quick-action-card" onClick={() => navigate('/admin/students/list')}>
          <Users size={24} color="#7c3aed" />
          <p className="qa-title">Student List</p>
          <p className="qa-desc">View and manage all students</p>
        </div>
      </div>
    </div>
  )
}
