import { Trash2, ArrowUp, Users, Download } from 'lucide-react'

export function BulkActions({
  selectedCount,
  onDelete,
  onPromote,
  onAssignStream,
  onExport,
}) {
  if (selectedCount === 0) return null

  return (
    <div className="bulk-actions-bar">
      <span className="bulk-count">{selectedCount} selected</span>
      <div className="bulk-actions-group">
        <button className="btn-secondary sm" onClick={onExport}>
          <Download size={13} /> Export
        </button>
        <button className="btn-secondary sm" onClick={onAssignStream}>
          <Users size={13} /> Assign Stream
        </button>
        <button className="btn-secondary sm" onClick={onPromote}>
          <ArrowUp size={13} /> Promote
        </button>
        <button className="btn-secondary sm danger" onClick={onDelete}>
          <Trash2 size={13} /> Delete
        </button>
      </div>
    </div>
  )
}
