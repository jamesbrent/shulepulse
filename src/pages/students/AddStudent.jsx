import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Save, ArrowLeft } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { createStudent, generateAdmissionNumber } from '../../services/students/studentService'
import { StudentForm } from '../../components/students/StudentForm'
import { ParentForm } from '../../components/students/ParentForm'

export default function AddStudent() {
  const { profile } = useAuthStore()
  const navigate = useNavigate()

  const [form, setForm] = useState({
    full_name: '', admission_number: '', class: '', stream: '',
    date_of_birth: '', gender: '', religion: '', nationality: '',
    previous_school: '', blood_group: '', allergies: '',
    medical_conditions: '', special_needs: '',
    day_boarding: '', status: 'active', date_admitted: '',
  })
  const [guardians, setGuardians] = useState([{
    parent_name: '', relationship: '', phone: '', email: '',
    national_id: '', occupation: '', physical_address: '',
  }])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [errors, setErrors] = useState({})

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setErrors({})

    if (!form.full_name.trim()) {
      setErrors({ full_name: 'Full name is required' })
      setSaving(false)
      return
    }

    try {
      const admNo = form.admission_number || await generateAdmissionNumber(profile.school_id)

      const payload = {
        school_id: profile.school_id,
        admission_number: admNo,
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
        date_admitted: form.date_admitted || new Date().toISOString().split('T')[0],
        parent_name: guardians[0]?.parent_name || null,
        parent_phone: guardians[0]?.phone || null,
        parent_email: guardians[0]?.email || null,
      }

      await createStudent(payload)
      navigate('/admin/students/list')
    } catch (e) {
      setError(e.message)
    }
    setSaving(false)
  }

  return (
    <div className="students-page">
      <div className="sp-header">
        <div>
          <button className="btn-ghost" onClick={() => navigate(-1)}>
            <ArrowLeft size={15} /> Back
          </button>
          <h2 style={{ marginTop: 8 }}>Add New Student</h2>
        </div>
      </div>

      <div className="form-card">
        <form onSubmit={handleSubmit}>
          {error && <div className="form-error">{error}</div>}

          <StudentForm form={form} onChange={setForm} errors={errors} />
          <ParentForm guardians={guardians} onChange={setGuardians} />

          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={() => navigate(-1)}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              <Save size={15} /> {saving ? 'Saving...' : 'Add Student'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
