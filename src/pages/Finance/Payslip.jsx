import { Fragment } from 'react'
import { X, Printer } from 'lucide-react'
import { fmt, fmtDate } from '../admin/fees/utils/feesHelpers'

// Printable payslip modal. Renders one payroll_line's breakdown in a
// clean A4-style sheet; @media print in Payroll.css isolates this sheet.
export default function Payslip({ line, run, school, schoolName, onClose }) {
  const b = line.breakdown || {}
  const oldAllowances = b.allowances || []
  const taxableAllowances = (b.taxable_allowances && b.taxable_allowances.length
    ? b.taxable_allowances
    : oldAllowances.filter((a) => a.taxable === true).map((a) => ({ name: a.name, amount: a.amount })))
  const nonTaxableAllowances = (b.non_taxable_allowances && b.non_taxable_allowances.length
    ? b.non_taxable_allowances
    : oldAllowances.filter((a) => a.taxable === false).map((a) => ({ name: a.name, amount: a.amount })))
  const thresholdAllowances = b.threshold_allowances || []
  const reimbursements = b.reimbursements || []
  const otherDeductions = b.other_deductions_items || []
  const helbItems = b.helb_items || []
  const employerItems = b.employer_items || []
  const gross = Number(line.gross_pay || 0)
  const totalDeductions =
    Number(line.paye || 0) + Number(line.shif || 0) + Number(line.nssf_employee || 0) +
    Number(line.housing_employee || 0) + Number(line.helb || 0) + Number(line.other_deductions || 0)
  const employerTotal =
    Number(line.nssf_employer || 0) + Number(line.housing_employer || 0) + Number(line.nita || 0) +
    employerItems.reduce((s, i) => s + Number(i.amount || 0), 0)

  const Row = ({ label, value, strong }) => (
    <tr>
      <td style={{ fontWeight: strong ? 700 : 400, color: strong ? '#111827' : '#374151' }}>{label}</td>
      <td style={{ textAlign: 'right', fontWeight: strong ? 700 : 400, color: strong ? '#111827' : '#374151' }}>{fmt(value)}</td>
    </tr>
  )

  return (
    <div className="prl-modal-overlay" onClick={onClose}>
      <div className="prl-modal" onClick={(e) => e.stopPropagation()}>
        <div className="prl-modal-head">
          <h3>Payslip</h3>
          <div>
            <button className="prl-btn-icon" onClick={() => window.print()} title="Print payslip"><Printer size={16} /></button>
            <button className="prl-btn-icon" onClick={onClose}><X size={16} /></button>
          </div>
        </div>

        <div className="payslip-sheet">
          <div className="ps-header">
            <div>
              <h2>{schoolName || 'ShulePulse'}</h2>
              <p>{school?.address || ''} {school?.phone || ''}</p>
            </div>
            <div className="ps-right">
              <h3>PAYSLIP</h3>
              <p>{run?.run_label || line.period_label || ''}</p>
              <p className="ps-mono">Line No: {line.employee_no || '—'}</p>
            </div>
          </div>

          <div className="ps-employee">
            <div className="ps-employee-col">
              <p><span>Employee</span><strong>{line.employee_name}</strong></p>
              <p><span>Staff No.</span><strong className="ps-mono">{line.employee_no || '—'}</strong></p>
              <p><span>Type</span><strong style={{ textTransform: 'capitalize' }}>{line.staff_type || '—'}</strong></p>
            </div>
            <div className="ps-employee-col">
              <p><span>Period</span><strong>{run?.run_label || '—'}</strong></p>
              <p><span>Bank</span><strong>{line.employee?.bank_name || '—'}</strong></p>
              <p><span>A/C No.</span><strong className="ps-mono">{line.employee?.bank_account || '—'}</strong></p>
            </div>
            <div className="ps-employee-col">
              <p><span>KRA PIN</span><strong className="ps-mono">{line.employee?.kra_pin || '—'}</strong></p>
              <p><span>SHIF No.</span><strong className="ps-mono">{line.employee?.shif_no || '—'}</strong></p>
              <p><span>NSSF No.</span><strong className="ps-mono">{line.employee?.nssf_no || '—'}</strong></p>
            </div>
          </div>

          <div className="ps-tables">
            <div>
              <h4>Earnings</h4>
              <table className="ps-table">
                <tbody>
                  <Row label="Basic Salary" value={line.basic_salary} />
                  {taxableAllowances.length > 0 && (
                    <>
                      <tr><td className="ps-group" colSpan={2}>Taxable Allowances</td></tr>
                      {taxableAllowances.map((a, i) => <Row key={`ta${i}`} label={a.name} value={a.amount} />)}
                    </>
                  )}
                  {nonTaxableAllowances.length > 0 && (
                    <>
                      <tr><td className="ps-group" colSpan={2}>Non-Taxable Allowances</td></tr>
                      {nonTaxableAllowances.map((a, i) => <Row key={`nt${i}`} label={a.name} value={a.amount} />)}
                    </>
                  )}
                  {thresholdAllowances.length > 0 && (
                    <>
                      <tr><td className="ps-group" colSpan={2}>Threshold-Based Allowances</td></tr>
                      {thresholdAllowances.map((a, i) => (
                        <Fragment key={`th${i}`}>
                          <Row label={a.name} value={a.amount} />
                          <Row label="  └ tax-free" value={a.tax_free_amount} />
                          <Row label="  └ taxable" value={a.taxable_amount} />
                        </Fragment>
                      ))}
                    </>
                  )}
                  {Number(b.overtime || 0) > 0 && <Row label="Overtime" value={b.overtime} />}
                  {Number(b.bonus || 0) > 0 && <Row label="Bonus" value={b.bonus} />}
                  <Row label="Gross Earnings" value={gross} strong />
                  <Row label="Taxable Pay" value={line.taxable_pay} strong />
                </tbody>
              </table>
              {reimbursements.length > 0 && (
                <div className="ps-reimbursement">
                  <h4>Reimbursements / Expense Claims (not salary earnings)</h4>
                  <table className="ps-table">
                    <tbody>
                      {reimbursements.map((a, i) => <Row key={`r${i}`} label={a.name} value={a.amount} />)}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div>
              <h4>Statutory & Other Deductions</h4>
              <table className="ps-table">
                <tbody>
                  <Row label="PAYE Tax" value={line.paye} />
                  <Row label="SHIF (2.75%)" value={line.shif} />
                  <Row label="NSSF (Employee)" value={line.nssf_employee} />
                  <Row label="Housing Levy (Employee)" value={line.housing_employee} />
                  {helbItems.map((h, i) => <Row key={`h${i}`} label={h.name} value={h.amount} />)}
                  {otherDeductions.map((d, i) => <Row key={`d${i}`} label={d.name} value={d.amount} />)}
                  <Row label="Total Deductions" value={totalDeductions} strong />
                </tbody>
              </table>
            </div>

            <div>
              <h4>Employer Contributions</h4>
              <table className="ps-table">
                <tbody>
                  <Row label="NSSF (Employer)" value={line.nssf_employer} />
                  <Row label="Housing Levy (Employer)" value={line.housing_employer} />
                  <Row label="NITA Levy" value={line.nita} />
                  {employerItems.map((e, i) => <Row key={`e${i}`} label={`${e.name} (Employer)`} value={e.amount} />)}
                  <Row label="Employer Total" value={employerTotal} strong />
                </tbody>
              </table>
            </div>
          </div>

          <div className="ps-net">
            <span>NET PAY</span>
            <strong>{fmt(line.net_pay)}</strong>
          </div>

          <div className="ps-foot">
            <p>Generated on {fmtDate(new Date().toISOString())} · ShulePulse Payroll</p>
            <div>
              <p>Prepared by</p>
              <div className="ps-sign-line" />
            </div>
            <div>
              <p>Received by</p>
              <div className="ps-sign-line" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
