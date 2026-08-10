import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Save, ArrowLeft } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { getStudentById, updateStudent } from '../../services/students/studentService'
import { StudentForm } from '../../components/students/StudentForm'
import { ParentForm } from '../../components/students/ParentForm'

export default function EditStudent() {
  const { id } = useParams()
  const { profile } = useAuthStore()
  const navigate = useNavigate()

  const [form, setForm] = useState(null)
  const [guardians, setGuardians] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [errors, setErrors] = useState({})

  useEffect(() => {
    if (id) loadStudent()
  }, [id])

  const loadStudent = async () => {
    try {
      const s = await getStudentById(id)
      setForm({
        full_name: s.full_name || '',
        admission_number: s.admission_number || '',
        class: s.class || '',
        stream: s.stream || '',
        date_of_birth: s.date_of_birth || '',
        gender: s.gender || '',
        religion: s.religion || '',
        nationality: s.nationality || '',
        previous_school: s.previous_school || '',
        blood_group: s.blood_group || '',
        allergies: s.allergies || '',
        medical_conditions: s.medical_conditions || '',
        special_needs: s.special_needs || '',
        day_boarding: s.day_boarding || '',
        status: s.status || 'active',
        date_admitted: s.date_admitted || '',
      })
      setGuardians([{
        parent_name: s.parent_name || '',
        relationship: '',
        phone: s.parent_phone || '',
        email: s.parent_email || '',
        national_id: '',
        occupation: '',
        physical_address: '',
      }])
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')

    try {
      await updateStudent(id, {
        full_name: form.full_name.trim(),
        class: form.class,
        stream: form.stream || null,
        date_of_birth: form.date_of_birth || null,
        gender: form.gender || null,
        religion: form.religion || null,
        nationality: form.nationality || null,
        previous_school: form.previous_school || null,
        blood_group: form.blood_group || null,
        allergies: form.allergies || null,
        medical_conditions: form.medical_conditions || null,
        special_needs: form.special_needs || null,
        day_boarding: form.day_boarding || null,
        status: form.status || 'active',
        date_admitted: form.date_admitted || null,
        parent_name: guardians[0]?.parent_name || null,
        parent_phone: guardians[0]?.phone || null,
        parent_email: guardians[0]?.email || null,
        updated_by: profile?.id,
        updated_at: new Date().toISOString(),
      })
      navigate(`/admin/students/${id}`)
    } catch (e) {
      setError(e.message)
    }
    setSaving(false)
  }

  if (loading) return <div className="students-page"><div className="loading-state">Loading student...</div></div>

  return (
    <div className="students-page">
      <div className="sp-header">
        <div>
          <button className="btn-ghost" onClick={() => navigate(-1)}>
            <ArrowLeft size={15} /> Back
          </button>
          <h2 style={{ marginTop: 8 }}>Edit Student</h2>
        </div>
      </div>

      <div className="form-card">
        <form onSubmit={handleSubmit}>
          {error && <div className="form-error">{error}</div>}
          <StudentForm form={form} onChange={setForm} errors={errors} />
          <ParentForm guardians={guardians} onChange={setGuardians} />
          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={() => navigate(-1)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              <Save size={15} /> {saving ? 'Saving...' : 'Update Student'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
