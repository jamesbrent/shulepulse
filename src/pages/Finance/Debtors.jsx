import { useState, useCallback, useEffect } from 'react'
import { Send, MessageCircle, Smartphone, CheckCircle, Search, Bell } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'
import { useSchool } from '../admin/useSchool'
import { fmt } from '../admin/fees/utils/feesHelpers'

export default function DebtorsPage() {
  const { profile } = useAuthStore()
  const { currentTerm, currentYear } = useSchool()
  const [debtors, setDebtors] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterClass, setFilterClass] = useState('')
  const [sendingAll, setSendingAll] = useState(false)
  const [toast, setToast] = useState(null)

  const load = useCallback(async () => {
    if (!currentTerm || !currentYear) return
    setLoading(true)
    const { data: ledger } = await supabase
      .from('student_ledger')
      .select('student_id, entry_type, amount, students(full_name, class, stream, admission_number, parent_name, parent_phone, parent_email)')
      .eq('school_id', profile.school_id)
      .eq('term', currentTerm)
      .eq('year', currentYear)

    const map = {}
    ;(ledger || []).forEach((e) => {
      const sid = e.student_id
      if (!map[sid]) {
        map[sid] = {
          student_id: sid,
          full_name: e.students?.full_name,
          class: e.students?.class,
          stream: e.students?.stream,
          admission_number: e.students?.admission_number,
          parent_name: e.students?.parent_name,
          parent_phone: e.students?.parent_phone,
          parent_email: e.students?.parent_email,
          totalBilled: 0,
          totalPaid: 0,
        }
      }
      if (['charge', 'penalty'].includes(e.entry_type)) map[sid].totalBilled += Number(e.amount)
      else map[sid].totalPaid += Number(e.amount)
    })

    const list = Object.values(map)
      .map((d) => ({ ...d, balance: d.totalBilled - d.totalPaid }))
      .filter((d) => d.balance > 0)
      .sort((a, b) => b.balance - a.balance)

    setDebtors(list)
    setLoading(false)
  }, [profile?.school_id, currentTerm, currentYear])

  useEffect(() => { load() }, [load])

  const filtered = debtors.filter(
    (d) =>
      (!filterClass || d.class === filterClass) &&
      (d.full_name?.toLowerCase().includes(search.toLowerCase()) ||
        d.admission_number?.toLowerCase().includes(search.toLowerCase()) ||
        d.parent_name?.toLowerCase().includes(search.toLowerCase()))
  )

  const classes = [...new Set(debtors.map((d) => d.class).filter(Boolean))].sort()

  const sendSMS = (d) => {
    const msg = `Dear ${d.parent_name || 'Parent'}, fees balance for ${d.full_name} (${d.class} ${d.stream || ''}) is ${fmt(d.balance)}. Please pay at the school finance office. Thank you.`
    window.open(`sms:${d.parent_phone}?body=${encodeURIComponent(msg)}`, '_blank')
  }

  const sendWhatsApp = (d) => {
    const msg = `Dear ${d.parent_name || 'Parent'}, fees balance for ${d.full_name} (${d.class} ${d.stream || ''}) is ${fmt(d.balance)}. Please pay at the school finance office. Thank you.`
    window.open(`https://wa.me/${String(d.parent_phone || '').replace(/[^0-9]/g, '')}?text=${encodeURIComponent(msg)}`, '_blank')
  }

  const sendAllReminders = async () => {
    setSendingAll(true)
    let sent = 0

    for (const d of filtered) {
      if (!d.parent_phone) continue
      const msg = `Dear ${d.parent_name || 'Parent'}, fees balance for ${d.full_name} (${d.class} ${d.stream || ''}) is ${fmt(d.balance)}. Please pay at the school finance office. Thank you.`
      
      await supabase.from('notices').insert({
        school_id: profile.school_id,
        title: `Fee Balance Reminder - ${d.full_name}`,
        body: msg,
        category: 'urgent',
        target_audience: 'parents',
        created_by: profile.id,
      })
      sent++
    }

    setSendingAll(false)
    setToast(`Sent ${sent} reminder(s) as notices to parents`)
    setTimeout(() => setToast(null), 4000)
  }

  return (
    <div style={{ padding: 20, maxWidth: 1200 }}>
      {toast && <div style={{ position: 'fixed', top: 20, right: 20, background: '#16a34a', color: '#fff', padding: '10px 18px', borderRadius: 8, fontWeight: 600, zIndex: 9999, boxShadow: '0 4px 12px rgba(0,0,0,.15)' }}>{toast}</div>}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>Debtors — {currentTerm} {currentYear}</h2>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13 }}>{filtered.length} student(s) with outstanding balances</p>
        </div>
        <button
          onClick={sendAllReminders}
          disabled={sendingAll || !filtered.length}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 18px', borderRadius: 8, border: 'none',
            background: sendingAll ? '#94a3b8' : '#dc2626', color: '#fff',
            fontWeight: 600, cursor: sendingAll ? 'not-allowed' : 'pointer',
          }}
        >
          <Bell size={16} />
          {sendingAll ? 'Sending...' : `Send Balance Reminders (${filtered.length})`}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 250px' }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            type="text"
            placeholder="Search student, adm no., or parent..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%', padding: '8px 10px 8px 32px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }}
          />
        </div>
        <select
          value={filterClass}
          onChange={(e) => setFilterClass(e.target.value)}
          style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }}
        >
          <option value="">All Classes</option>
          {classes.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {loading ? (
        <p style={{ color: '#64748b', padding: 40, textAlign: 'center' }}>Loading debtors...</p>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>
          <CheckCircle size={40} color="#16a34a" style={{ marginBottom: 12 }} />
          <p>No outstanding balances for {currentTerm} {currentYear}.</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                <th style={{ padding: '10px 8px', color: '#64748b' }}>#</th>
                <th style={{ padding: '10px 8px', color: '#64748b' }}>Student</th>
                <th style={{ padding: '10px 8px', color: '#64748b' }}>Class</th>
                <th style={{ padding: '10px 8px', color: '#64748b' }}>Parent</th>
                <th style={{ padding: '10px 8px', color: '#64748b' }}>Phone</th>
                <th style={{ padding: '10px 8px', color: '#64748b' }}>Billed</th>
                <th style={{ padding: '10px 8px', color: '#64748b' }}>Paid</th>
                <th style={{ padding: '10px 8px', color: '#64748b' }}>Balance</th>
                <th style={{ padding: '10px 8px', color: '#64748b' }}>Remind</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d, i) => (
                <tr key={d.student_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px 8px', color: '#94a3b8' }}>{i + 1}</td>
                  <td style={{ padding: '10px 8px', fontWeight: 500 }}>{d.full_name}</td>
                  <td style={{ padding: '10px 8px' }}>{d.class} {d.stream || ''}</td>
                  <td style={{ padding: '10px 8px', color: '#64748b' }}>{d.parent_name || '—'}</td>
                  <td style={{ padding: '10px 8px', fontFamily: 'monospace' }}>{d.parent_phone || '—'}</td>
                  <td style={{ padding: '10px 8px' }}>{fmt(d.totalBilled)}</td>
                  <td style={{ padding: '10px 8px', color: '#16a34a' }}>{fmt(d.totalPaid)}</td>
                  <td style={{ padding: '10px 8px', fontWeight: 700, color: '#dc2626' }}>{fmt(d.balance)}</td>
                  <td style={{ padding: '10px 8px' }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {d.parent_phone && (
                        <>
                          <button
                            onClick={() => sendSMS(d)}
                            title="Send SMS"
                            style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}
                          >
                            <Smartphone size={12} /> SMS
                          </button>
                          <button
                            onClick={() => sendWhatsApp(d)}
                            title="Send WhatsApp"
                            style={{ background: '#25d366', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}
                          >
                            <MessageCircle size={12} /> WA
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
