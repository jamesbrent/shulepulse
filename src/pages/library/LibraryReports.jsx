import { useState, useEffect } from 'react'
import { FileSpreadsheet, FileText, BookOpen, Users, ArrowLeftRight, AlertTriangle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { memberTypeLabel, fmtDate } from '../../lib/library'
import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { saveAs } from 'file-saver'

const REPORTS = [
  { id: 'catalogue', label: 'Book Catalogue', desc: 'All books with copies and availability', icon: <BookOpen size={18} /> },
  { id: 'members', label: 'Members List', desc: 'All library members and their status', icon: <Users size={18} /> },
  { id: 'loans', label: 'Loan History', desc: 'All borrowing activity', icon: <ArrowLeftRight size={18} /> },
  { id: 'overdue', label: 'Overdue Loans', desc: 'Books past their due date', icon: <AlertTriangle size={18} /> },
]

export default function LibraryReports({ schoolId }) {
  const [exporting, setExporting] = useState('')
  const [data, setData] = useState({})

  useEffect(() => {
    fetchAll()
  }, [schoolId])

  const fetchAll = async () => {
    const [books, members, loans] = await Promise.all([
      supabase.from('library_books')
        .select('title, author, isbn, subject, total_copies, available_copies, categories(name)')
        .eq('school_id', schoolId).order('title'),
      supabase.from('library_members')
        .select('*').eq('school_id', schoolId).order('full_name'),
      supabase.from('library_loans')
        .select('*, books(title), members(full_name, member_type)')
        .eq('school_id', schoolId).order('created_at', { ascending: false }).limit(500),
    ])
    setData({
      books: books.data || [],
      members: members.data || [],
      loans: loans.data || [],
    })
  }

  const catalogueRows = () => data.books.map(b => ({
    Title: b.title,
    Author: b.author || '',
    ISBN: b.isbn || '',
    Subject: b.subject || '',
    Category: b.categories?.name || '',
    Total: b.total_copies,
    Available: b.available_copies,
  }))

  const memberRows = () => data.members.map(m => ({
    Name: m.full_name,
    Code: m.member_code || '',
    Type: memberTypeLabel(m.member_type),
    Email: m.email || '',
    Status: m.status,
  }))

  const loanRows = () => data.loans.map(l => ({
    Book: l.books?.title || '',
    Member: l.members?.full_name || '',
    Type: memberTypeLabel(l.members?.member_type),
    Issued: fmtDate(l.issued_at || l.created_at),
    Due: fmtDate(l.due_date),
    Returned: l.returned_at ? fmtDate(l.returned_at) : '',
    Status: l.status,
  }))

  const overdueRows = () => {
    const today = new Date().toISOString().slice(0, 10)
    return data.loans
      .filter(l => l.status === 'overdue' || (l.status === 'issued' && l.due_date < today))
      .map(l => ({
        Book: l.books?.title || '',
        Member: l.members?.full_name || '',
        Due: fmtDate(l.due_date),
        Status: l.status,
      }))
  }

  const exportExcel = (rows, filename) => {
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Note: 'No data' }])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Report')
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    saveAs(new Blob([wbout], { type: 'application/octet-stream' }), `${filename}.xlsx`)
  }

  const exportPdf = (rows, title, filename) => {
    const doc = new jsPDF()
    doc.setFontSize(16)
    doc.text(title, 14, 18)
    doc.setFontSize(10)
    doc.text(`ShulePulse Library Report · ${new Date().toLocaleDateString()}`, 14, 25)
    if (rows.length) {
      const headers = Object.keys(rows[0]).map(k => k.toUpperCase())
      autoTable(doc, {
        startY: 30,
        head: [headers],
        body: rows.map(r => headers.map(h => r[h.toLowerCase()] ?? r[Object.keys(r).find(k => k.toUpperCase() === h)])),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [37, 99, 235] },
      })
    }
    doc.save(`${filename}.pdf`)
  }

  const runExport = async (id, format) => {
    setExporting(id)
    const defs = {
      catalogue: { rows: catalogueRows(), title: 'Book Catalogue', file: 'book-catalogue' },
      members: { rows: memberRows(), title: 'Library Members', file: 'library-members' },
      loans: { rows: loanRows(), title: 'Loan History', file: 'loan-history' },
      overdue: { rows: overdueRows(), title: 'Overdue Loans', file: 'overdue-loans' },
    }
    const d = defs[id]
    if (format === 'excel') exportExcel(d.rows, d.file)
    else exportPdf(d.rows, d.title, d.file)
    setExporting('')
  }

  return (
    <div>
      <div className="lib-card">
        <div className="lib-card-header">
          <div>
            <h2>Reports</h2>
            <p>Export library data to Excel or PDF</p>
          </div>
        </div>
        <div className="lib-report-grid">
          {REPORTS.map(r => (
            <div key={r.id} className="lib-report-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <span className="lib-avatar-sm" style={{ background: '#dbeafe', color: '#2563eb' }}>{r.icon}</span>
                <div>
                  <p style={{ fontWeight: 600, fontSize: 13, color: '#1e293b' }}>{r.label}</p>
                  <p style={{ fontSize: 12, color: '#94a3b8' }}>{r.desc}</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="lib-btn lib-btn-green" disabled={!!exporting} onClick={() => runExport(r.id, 'excel')}>
                  <FileSpreadsheet size={14} /> Excel
                </button>
                <button className="lib-btn lib-btn-red" disabled={!!exporting} onClick={() => runExport(r.id, 'pdf')}>
                  <FileText size={14} /> PDF
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
