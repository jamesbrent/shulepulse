import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { ImportExcelModal } from '../../components/students/ImportExcelModal'

export default function ImportStudents() {
  const { profile } = useAuthStore()
  const navigate = useNavigate()

  return (
    <div className="students-page">
      <div className="sp-header">
        <div>
          <button className="btn-ghost" onClick={() => navigate(-1)}>
            <ArrowLeft size={15} /> Back
          </button>
          <h2 style={{ marginTop: 8 }}>Import Students</h2>
        </div>
      </div>
      <ImportExcelModal
        schoolId={profile?.school_id}
        onClose={() => navigate(-1)}
        onComplete={() => navigate('/admin/students/list')}
      />
    </div>
  )
}
