import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Upload, Download } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { fetchStudents, fetchClasses, fetchStreams, bulkSoftDelete } from '../../services/students/studentService'
import { exportToExcel, exportToCSV } from '../../services/students/exportService'
import { StudentTable } from '../../components/students/StudentTable'
import { StudentFilters } from '../../components/students/StudentFilters'
import { BulkActions } from '../../components/students/BulkActions'

export default function StudentList() {
  const { profile } = useAuthStore()
  const navigate = useNavigate()

  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState([])
  const [classes, setClasses] = useState([])
  const [streams, setStreams] = useState([])

  const [search, setSearch] = useState('')
  const [filterClass, setFilterClass] = useState('')
  const [filterStream, setFilterStream] = useState('')
  const [filterGender, setFilterGender] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterBoarding, setFilterBoarding] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [res, cls, str] = await Promise.all([
        fetchStudents(profile.school_id, {
          search, class: filterClass, stream: filterStream,
          gender: filterGender, status: filterStatus,
          day_boarding: filterBoarding,
        }),
        fetchClasses(profile.school_id),
        fetchStreams(profile.school_id),
      ])
      setStudents(res.data)
      setClasses(cls)
      setStreams(str)
    } catch (e) {
      console.error('Failed to load students', e)
    }
    setLoading(false)
  }, [profile, search, filterClass, filterStream, filterGender, filterStatus, filterBoarding])

  useEffect(() => { loadData() }, [loadData])

  const handleSelect = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const handleSelectAll = (checked) => {
    setSelectedIds(checked ? students.map(s => s.id) : [])
  }

  const handleDelete = async (student) => {
    if (!confirm(`Remove ${student.full_name}? This will mark them as inactive.`)) return
    await bulkSoftDelete([student.id], profile?.id)
    loadData()
  }

  const handleBulkDelete = async () => {
    if (!confirm(`Remove ${selectedIds.length} students?`)) return
    await bulkSoftDelete(selectedIds, profile?.id)
    setSelectedIds([])
    loadData()
  }

  const clearFilters = () => {
    setSearch('')
    setFilterClass('')
    setFilterStream('')
    setFilterGender('')
    setFilterStatus('')
    setFilterBoarding('')
  }

  const currentFilters = { class: filterClass, stream: filterStream, gender: filterGender, status: filterStatus }

  return (
    <div className="students-page">
      <div className="sp-header">
        <div>
          <h2>Student List</h2>
          <p>{students.length} students</p>
        </div>
        <div className="sp-header-actions">
          <button className="btn-secondary" onClick={() => exportToExcel(profile.school_id, currentFilters)}>
            <Download size={14} /> Export
          </button>
          <button className="btn-secondary" onClick={() => navigate('/admin/students/import')}>
            <Upload size={14} /> Import
          </button>
          <button className="btn-primary" onClick={() => navigate('/admin/students/add')}>
            <Plus size={15} /> Add Student
          </button>
        </div>
      </div>

      <StudentFilters
        search={search} onSearchChange={setSearch}
        filterClass={filterClass} onClassChange={setFilterClass}
        filterStream={filterStream} onStreamChange={setFilterStream}
        filterGender={filterGender} onGenderChange={setFilterGender}
        filterStatus={filterStatus} onStatusChange={setFilterStatus}
        filterBoarding={filterBoarding} onBoardingChange={setFilterBoarding}
        classes={classes} streams={streams}
        onClear={clearFilters}
      />

      <BulkActions
        selectedCount={selectedIds.length}
        onDelete={handleBulkDelete}
        onExport={() => {
          const selected = students.filter(s => selectedIds.includes(s.id))
          exportToCSV(selected.length ? selected : students)
        }}
        onPromote={() => navigate('/admin/students/promotion', { state: { selectedIds } })}
        onAssignStream={() => navigate('/admin/students/bulk/stream', { state: { selectedIds } })}
      />

      <StudentTable
        students={students}
        selectedIds={selectedIds}
        onSelect={handleSelect}
        onSelectAll={handleSelectAll}
        onView={(s) => navigate(`/admin/students/${s.id}`)}
        onEdit={(s) => navigate(`/admin/students/${s.id}/edit`)}
        onDelete={handleDelete}
        loading={loading}
      />
    </div>
  )
}
