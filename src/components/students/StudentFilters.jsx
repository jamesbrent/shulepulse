import { Search, X } from 'lucide-react'

export function StudentFilters({
  search, onSearchChange,
  filterClass, onClassChange,
  filterStream, onStreamChange,
  filterGender, onGenderChange,
  filterStatus, onStatusChange,
  filterBoarding, onBoardingChange,
  classes, streams,
  onClear,
}) {
  const hasFilters = search || filterClass || filterStream || filterGender || filterStatus || filterBoarding

  return (
    <div className="student-filters">
      <div className="search-wrap">
        <Search size={14} className="search-icon" />
        <input
          className="search-input"
          placeholder="Search name, admission no, or parent..."
          value={search}
          onChange={e => onSearchChange(e.target.value)}
        />
      </div>

      <div className="filter-select-group">
        <select className="filter-select" value={filterClass} onChange={e => onClassChange(e.target.value)}>
          <option value="">All Classes</option>
          {classes.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <select className="filter-select" value={filterStream} onChange={e => onStreamChange(e.target.value)}>
          <option value="">All Streams</option>
          {streams.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <select className="filter-select" value={filterGender} onChange={e => onGenderChange(e.target.value)}>
          <option value="">All Genders</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
        </select>

        <select className="filter-select" value={filterStatus} onChange={e => onStatusChange(e.target.value)}>
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="alumni">Alumni</option>
          <option value="transferred">Transferred</option>
        </select>

        <select className="filter-select" value={filterBoarding} onChange={e => onBoardingChange(e.target.value)}>
          <option value="">All</option>
          <option value="day">Day Scholar</option>
          <option value="boarding">Boarding</option>
        </select>
      </div>

      {hasFilters && (
        <button className="clear-filters-btn" onClick={onClear}>
          <X size={13} /> Clear
        </button>
      )}
    </div>
  )
}
