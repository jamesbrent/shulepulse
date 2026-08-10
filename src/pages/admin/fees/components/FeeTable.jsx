/**
 * FeeTable — thin wrapper that handles the empty/loading states so each
 * tab doesn't need to repeat the same boilerplate.
 *
 * Props:
 *   columns  – array of header labels, e.g. ['Student', 'Amount']
 *   loading  – boolean
 *   empty    – string shown when there are no rows (default: 'No records.')
 *   children – <tr> rows
 */
export function FeeTable({ columns = [], loading = false, empty = 'No records.', children }) {
  return (
    <table className="fees-table">
      <thead>
        <tr>
          {columns.map((col) => (
            <th key={col}>{col}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {loading ? (
          <tr>
            <td colSpan={columns.length} className="loading-state">
              Loading…
            </td>
          </tr>
        ) : !children || (Array.isArray(children) && children.length === 0) ? (
          <tr>
            <td colSpan={columns.length} className="empty-cell">
              {empty}
            </td>
          </tr>
        ) : (
          children
        )}
      </tbody>
    </table>
  )
}