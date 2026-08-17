import { useState } from 'react'
import { useAuthStore } from '../../store/authStore'
import { ImportExcelModal } from '../../components/students/ImportExcelModal'

export default function BulkImport() {
  const { profile } = useAuthStore()
  const [done, setDone] = useState(false)

  if (done) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <h3>Import Complete</h3>
        <p style={{ color: '#64748b' }}>Students have been imported successfully.</p>
        <button className="btn-primary" onClick={() => setDone(false)} style={{ marginTop: 12 }}>
          Import More
        </button>
      </div>
    )
  }

  return (
    <ImportExcelModal
      schoolId={profile?.school_id}
      onComplete={() => setDone(true)}
      onClose={() => setDone(true)}
    />
  )
}
