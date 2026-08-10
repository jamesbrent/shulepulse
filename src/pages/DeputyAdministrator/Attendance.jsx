import { useState, useEffect } from 'react'
import {
  ClipboardList, Calendar, AlertTriangle, TrendingUp, Shield, FileSpreadsheet,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'
import '../../components/attendance/AttendanceShared.css'
import AttendanceFilters from '../../components/attendance/AttendanceFilters'
import AttendanceSummary from '../../components/attendance/AttendanceSummary'
import AttendanceTable from '../../components/attendance/AttendanceTable'
import AttendanceTrends from '../../components/attendance/AttendanceTrends'
import ExportPanel from '../../components/attendance/ExportPanel'
import StudentAnalytics from '../../components/attendance/StudentAnalytics'
import { useSchool } from '../admin/useSchool'
import { exportAttendanceCSV, exportAttendancePDF } from '../../services/attendance/exportAttendance'

export default function Attendance() {
  const { profile } = useAuthStore()
  const { currentTerm, currentYear } = useSchool()
  const [records, setRecords] = useState([])
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [search, setSearch] = useState('')
  const [filterClass, setFilterClass] = useState('all')
  const [filterStream, setFilterStream] = useState('')
  const [streams, setStreams] = useState([])
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0])
  const [attendance, setAttendance] = useState({})
  const [notes, setNotes] = useState({})
  const [classes, setClasses] = useState([])
  const [activeTab, setActiveTab] = useState('oversight')
  const [overrideMode, setOverrideMode] = useState(false)
  const [notifications, setNotifications] = useState([])

  useEffect(() => { fetchClasses() }, [])
  useEffect(() => {
    if (activeTab === 'oversight') {
      fetchRecords()
    } else {
      fetchStudents()
    }
  }, [filterDate, filterClass, activeTab])

  const fetchClasses = async () => {
    const { data } = await supabase
      .from('students')
      .select('class, stream')
      .eq('school_id', profile.school_id)
      .eq('status', 'active')
    const unique = [...new Set((data || []).map(s => s.class).filter(Boolean))].sort()
    setClasses(unique)
    const uniqueStreams = [...new Set((data || []).map(s => s.stream).filter(Boolean))].sort()
    setStreams(uniqueStreams)
  }

  const fetchRecords = async () => {
    setLoading(true)
    let query = supabase
      .from('attendance')
      .select('*, students(full_name, admission_number, class)')
      .eq('school_id', profile.school_id)
      .eq('date', filterDate)
      .order('created_at', { ascending: false })

    if (filterClass !== 'all') {
      query = query.eq('students.class', filterClass)
    }

    const { data } = await query
    const recs = (data || []).filter(r => r.students)
    setRecords(recs)

    const attMap = {}
    const notesMap = {}
    recs.forEach(r => {
      attMap[r.student_id] = r.status
      if (r.notes) notesMap[r.student_id] = r.notes
    })
    setAttendance(attMap)
    setNotes(notesMap)
    setLoading(false)
  }

  const fetchStudents = async () => {
    setLoading(true)
    let query = supabase
      .from('students')
      .select('id, full_name, admission_number, class')
      .eq('school_id', profile.school_id)
      .eq('status', 'active')
      .order('full_name')
    if (filterClass !== 'all') {
      query = query.eq('class', filterClass)
    }
    const { data } = await query
    setStudents(data || [])
    setLoading(false)
  }

  const loadExistingForOverride = async () => {
    const { data } = await supabase
      .from('attendance')
      .select('*')
      .eq('school_id', profile.school_id)
      .eq('date', filterDate)
    const attMap = {}
    const notesMap = {}
    if (data) {
      data.forEach(r => {
        attMap[r.student_id] = r.status
        if (r.notes) notesMap[r.student_id] = r.notes
      })
    }
    setAttendance(attMap)
    setNotes(notesMap)
  }

  const setStatus = (studentId, status) => {
    if (overrideMode) {
      setAttendance(prev => ({ ...prev, [studentId]: status }))
    }
  }

  const setNote = (studentId, value) => {
    if (overrideMode) {
      setNotes(prev => ({ ...prev, [studentId]: value }))
    }
  }

  const markAllPresent = () => {
    const allPresent = {}
    students.forEach(s => { allPresent[s.id] = 'present' })
    setAttendance(prev => ({ ...prev, ...allPresent }))
  }

  const markAllAbsent = () => {
    const allAbsent = {}
    students.forEach(s => { allAbsent[s.id] = 'absent' })
    setAttendance(prev => ({ ...prev, ...allAbsent }))
  }

  const resetAttendance = () => {
    const reset = {}
    students.forEach(s => { reset[s.id] = 'present' })
    setAttendance(prev => ({ ...prev, ...reset }))
  }

  const saveOverride = async () => {
    if (!overrideMode) return
    setSaving(true)
    setSaved(false)
    const email = profile?.email || (await supabase.auth.getUser()).data.user?.email

    const records = students.map(s => ({
      school_id: profile.school_id,
      student_id: s.id,
      date: filterDate,
      status: attendance[s.id] || 'present',
      notes: notes[s.id] || '',
      class_name: s.class,
      teacher_name: profile?.full_name || email,
      remarks: `Overridden by deputy admin (${profile?.full_name || email})`,
    }))

    const { error } = await supabase
      .from('attendance')
      .upsert(records, { onConflict: 'student_id,date' })

    if (error) {
      alert('Error saving override: ' + error.message)
    } else {
      setSaved(true)
      setNotifications([{ type: 'info', message: 'Attendance overridden successfully' }])
      setTimeout(() => setNotifications([]), 4000)
      setTimeout(() => setSaved(false), 3000)
    }
    setSaving(false)
  }

  const handleExportCSV = () => {
    const data = activeTab === 'oversight' || activeTab === 'override' ? records : records
    if (data.length === 0) { alert('No records to export.'); return }
    exportAttendanceCSV(data, `attendance_${filterDate}.csv`)
  }

  const handleExportPDF = () => {
    const data = activeTab === 'oversight' || activeTab === 'override' ? records : records
    if (data.length === 0) { alert('No records to export.'); return }
    exportAttendancePDF(data, {
      school: profile?.schools,
      title: 'Attendance Report',
      date: formattedDate,
    })
  }

  const toggleOverride = async () => {
    const next = !overrideMode
    setOverrideMode(next)
    if (next) {
      setActiveTab('override')
      await fetchStudents()
      await loadExistingForOverride()
    } else {
      setActiveTab('oversight')
    }
  }

  const formattedDate = new Date(filterDate + 'T00:00:00').toLocaleDateString('en-KE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  })

  const showOverrideUI = activeTab === 'override'

  return (
    <div className="attendance-page">
      <div className="att-tabs">
        <button
          className={`att-tab ${activeTab === 'oversight' ? 'active' : ''}`}
          onClick={() => { setActiveTab('oversight'); setOverrideMode(false) }}
        >
          <ClipboardList size={14} /> Oversight View
        </button>
        <button
          className={`att-tab ${activeTab === 'override' || overrideMode ? 'active' : ''}`}
          onClick={toggleOverride}
        >
          <Shield size={14} /> {overrideMode ? 'Override Active' : 'Override'}
        </button>
        <button
          className={`att-tab ${activeTab === 'reports' ? 'active' : ''}`}
          onClick={() => { setActiveTab('reports'); setOverrideMode(false) }}
        >
          <TrendingUp size={14} /> Reports
        </button>
        <button
          className={`att-tab ${activeTab === 'export' ? 'active' : ''}`}
          onClick={() => { setActiveTab('export'); setOverrideMode(false) }}
        >
          <FileSpreadsheet size={14} /> Export & Reports
        </button>
      </div>

      {showOverrideUI ? (
        <>
          <AttendanceSummary students={students} attendance={attendance} />

          <AttendanceFilters
            filterDate={filterDate}
            onDateChange={setFilterDate}
            filterClass={filterClass}
            onClassChange={setFilterClass}
            classes={classes}
            search={search}
            onSearchChange={setSearch}
            onMarkAllPresent={markAllPresent}
            onMarkAllAbsent={markAllAbsent}
            onResetAll={resetAttendance}
            onSave={saveOverride}
            onExportCSV={handleExportCSV}
            onExportPDF={handleExportPDF}
            saving={saving}
            saved={saved}
            canSave={students.length > 0}
            showBulkActions={students.length > 0}
            showSave={students.length > 0}
            showExport={true}
          />

          <div className="att-filter-row">
            <p className="att-date-label">
              <Calendar size={13} /> {formattedDate}
              {filterDate === new Date().toISOString().split('T')[0] && (
                <span className="today-badge">Today</span>
              )}
            </p>
            <span className="att-override-indicator">
              <Shield size={13} /> Override Mode
            </span>
          </div>

          {notifications.map((n, i) => (
            <div key={i} className={`att-notification ${n.type}`}>
              {n.type === 'info' && <AlertTriangle size={14} />}
              {n.message}
            </div>
          ))}

          <AttendanceTable
            students={students}
            attendance={attendance}
            onStatusChange={setStatus}
            notes={notes}
            onNotesChange={setNote}
            loading={loading}
            canEdit={true}
            showNotes={true}
            showAdm={true}
            showClass={true}
            noStudentMessage="No students found. Select a class first."
          />
        </>
      ) : activeTab === 'reports' ? (
        <>
          <AttendanceFilters
            filterDate={filterDate}
            onDateChange={setFilterDate}
            filterClass={filterClass}
            onClassChange={setFilterClass}
            classes={classes}
            search={search}
            onSearchChange={setSearch}
            showExport={true}
            onExportCSV={handleExportCSV}
            onExportPDF={handleExportPDF}
          />

          <div className="att-filter-row">
            <p className="att-date-label">
              <Calendar size={13} /> {formattedDate}
              {filterDate === new Date().toISOString().split('T')[0] && (
                <span className="today-badge">Today</span>
              )}
            </p>
          </div>

          <AttendanceTable
            records={records}
            loading={loading}
            canEdit={false}
            showAdm={true}
            showClass={true}
            showMarkedBy={true}
            showTime={true}
            showRemarks={true}
          />

          <AttendanceTrends schoolId={profile.school_id} filterClass={filterClass} />

          <StudentAnalytics schoolId={profile.school_id} filterClass={filterClass} />
        </>
      ) : activeTab !== 'export' ? (
        <>
          <AttendanceFilters
            filterDate={filterDate}
            onDateChange={setFilterDate}
            filterClass={filterClass}
            onClassChange={setFilterClass}
            classes={classes}
            search={search}
            onSearchChange={setSearch}
            showExport={true}
            onExportCSV={handleExportCSV}
            onExportPDF={handleExportPDF}
          />

          <div className="att-filter-row">
            <p className="att-date-label">
              <Calendar size={13} /> {formattedDate}
              {filterDate === new Date().toISOString().split('T')[0] && (
                <span className="today-badge">Today</span>
              )}
            </p>
          </div>

          <AttendanceTable
            records={records}
            loading={loading}
            canEdit={false}
            showAdm={true}
            showClass={true}
            showMarkedBy={true}
            showTime={true}
            showNotes={true}
          />

          {!loading && records.length > 0 && (
            <div className="att-summary-row">
              <span className="att-summary-item">
                <strong>{records.length}</strong> records for {formattedDate}
              </span>
              <span className="att-summary-item">
                <strong>{records.filter(r => r.status === 'present').length}</strong> present
              </span>
              <span className="att-summary-item">
                <strong>{records.filter(r => r.status === 'absent').length}</strong> absent
              </span>
              <span className="att-summary-item">
                <strong>{records.filter(r => r.status === 'late').length}</strong> late
              </span>
            </div>
          )}
        </>
      ) : null}

      {activeTab === 'export' && (
        <ExportPanel
          schoolId={profile.school_id}
          classes={classes}
          streams={streams}
          filterClass={filterClass}
          filterStream={filterStream}
          onClassChange={setFilterClass}
          onStreamChange={setFilterStream}
          school={profile?.schools}
          currentTerm={currentTerm}
          currentYear={currentYear}
        />
      )}
    </div>
  )
}
