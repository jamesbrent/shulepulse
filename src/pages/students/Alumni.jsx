import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, UserCheck } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'

export default function Alumni() {
  const { profile } = useAuthStore()
  const navigate = useNavigate()

  const [alumni, setAlumni] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadAlumni()
  }, [profile])

  const loadAlumni = async () => {
    const { data } = await supabase
      .from('students')
      .select('id, admission_number, full_name, class, stream, gender, date_of_birth, updated_at')
      .eq('school_id', profile.school_id)
      .eq('status', 'alumni')
      .order('full_name')
    setAlumni(data || [])
    setLoading(false)
  }

  const handleRestore = async (student) => {
    if (!confirm(`Restore ${student.full_name} to active students?`)) return
    await supabase.from('students')
      .update({ status: 'active', updated_at: new Date().toISOString(), updated_by: profile?.id })
      .eq('id', student.id)
    loadAlumni()
  }

  return (
    <div className="students-page">
      <div className="sp-header">
        <div>
          <button className="btn-ghost" onClick={() => navigate(-1)}>
            <ArrowLeft size={15} /> Back
          </button>
          <h2 style={{ marginTop: 8 }}>Alumni</h2>
          <p>{alumni.length} former students</p>
        </div>
      </div>

      {loading ? (
        <div className="loading-state">Loading alumni...</div>
      ) : alumni.length === 0 ? (
        <div className="empty-state-table"><p>No alumni records.</p></div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Adm No</th>
                <th>Full Name</th>
                <th>Class</th>
                <th>Stream</th>
                <th>Gender</th>
                <th>Graduated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {alumni.map(s => (
                <tr key={s.id}>
                  <td className="adm-no">{s.admission_number}</td>
                  <td>{s.full_name}</td>
                  <td>{s.class || '—'}</td>
                  <td>{s.stream || '—'}</td>
                  <td className="capitalize">{s.gender || '—'}</td>
                  <td>{s.updated_at ? new Date(s.updated_at).toLocaleDateString() : '—'}</td>
                  <td>
                    <button className="action-btn" onClick={() => handleRestore(s)} title="Restore to active">
                      <UserCheck size={13} /> Restore
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
