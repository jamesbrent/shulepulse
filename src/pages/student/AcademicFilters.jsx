import { Calendar, GraduationCap } from 'lucide-react'

export default function AcademicFilters({ terms, classes, termKey, setTermKey, selectedClass, setSelectedClass }) {
  return (
    <div className="sp-toolbar">
      <div className="sp-toolbar-left">
        <Calendar size={15} color="#94a3b8" />
        <select
          className="sp-select"
          value={termKey}
          onChange={e => setTermKey(e.target.value)}
        >
          {terms.length === 0 && <option value="">Select Term</option>}
          {terms.map(t => (
            <option key={`${t.year}|${t.term}`} value={`${t.year}|${t.term}`}>
              {t.term} {t.year}
            </option>
          ))}
        </select>
      </div>
      <div className="sp-toolbar-right">
        <GraduationCap size={15} color="#94a3b8" />
        <select
          className="sp-select"
          value={selectedClass}
          onChange={e => setSelectedClass(e.target.value)}
        >
          {classes.length === 0 && <option value="">Select Class</option>}
          {classes.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
    </div>
  )
}
