import { ChevronLeft, ChevronRight, Search, Save, RotateCcw, FileText, FileSpreadsheet } from 'lucide-react'

export default function AttendanceFilters({
  filterDate,
  onDateChange,
  filterClass,
  onClassChange,
  classes,
  showAllOption = true,
  search,
  onSearchChange,
  onMarkAllPresent,
  onMarkAllAbsent,
  onResetAll,
  onSave,
  onExport,
  onExportCSV,
  onExportPDF,
  saving,
  saved,
  canSave = false,
  showBulkActions = false,
  showExport = false,
  showSave = false,
}) {
  const changeDate = (days) => {
    const d = new Date(filterDate)
    d.setDate(d.getDate() + days)
    onDateChange(d.toISOString().split('T')[0])
  }

  return (
    <div className="att-toolbar">
      <div className="att-toolbar-left">
        <div className="date-nav">
          <button className="date-nav-btn" onClick={() => changeDate(-1)}>
            <ChevronLeft size={16} />
          </button>
          <input
            type="date"
            className="date-input"
            value={filterDate}
            onChange={(e) => onDateChange(e.target.value)}
          />
          <button className="date-nav-btn" onClick={() => changeDate(1)}>
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="search-wrap">
          <Search size={14} className="search-icon" />
          <input
            className="search-input"
            placeholder="Search student..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        <select
          className="filter-select"
          value={filterClass}
          onChange={(e) => onClassChange(e.target.value)}
        >
          {showAllOption && <option value="all">All Classes</option>}
          {classes.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <div className="att-toolbar-right">
        {showBulkActions && (
          <div className="att-bulk-actions">
            <button className="att-bulk-btn present" onClick={onMarkAllPresent}>
              Mark All Present
            </button>
            <button className="att-bulk-btn absent" onClick={onMarkAllAbsent}>
              Mark All Absent
            </button>
            <button className="att-bulk-btn reset" onClick={onResetAll}>
              <RotateCcw size={13} /> Reset
            </button>
          </div>
        )}

        {showSave && (
          <div className="att-save-wrap">
            <button
              className="att-save-btn"
              onClick={onSave}
              disabled={saving}
            >
              <Save size={15} />
              {saving ? 'Saving...' : 'Save Attendance'}
            </button>
            {saved && <span className="att-saved-badge">Saved!</span>}
          </div>
        )}

        {showExport && (
          <div className="att-export-group">
            <button className="att-export-btn csv" onClick={onExportCSV || onExport}>
              <FileSpreadsheet size={14} /> CSV
            </button>
            <button className="att-export-btn pdf" onClick={onExportPDF || onExport}>
              <FileText size={14} /> PDF
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
