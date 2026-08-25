import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { basePath } from "../lib/paths";
import "./TermsOfService.css";

const CONFIG = {
  providerName: "ShulePulse",
  companyName: "BIMA Graphics",
  lastUpdated: "August 25, 2026",
  address: "BIMA Graphics, Thika, Kenya",
  paymentTerms: "monthly",
  paymentDueDays: 14,
  noticeDays: 30,
  dataRetentionDays: 30,
  uptimeTarget: "99.5%",
  maintenanceNoticeHours: 24,
  criticalAckHours: 2,
  criticalResolveHours: 8,
  highAckHours: 4,
  highResolveDays: 2,
  standardAckDays: 1,
  creditWindowDays: 30,
  supportChannels: "email and WhatsApp",
  supportHours: "9am–5pm EAT, Mon–Fri",
  liabilityCapMonths: 12,
  terminationNoticeDays: 30,
  breachCureDays: 14,
  termsNoticeDays: 30,
};

const SECTIONS = [
  { id: "service", label: "1. The Service" },
  { id: "fees", label: "2. Subscription, Fees & Payment" },
  { id: "data-ownership", label: "3. Data Ownership" },
  { id: "data-termination", label: "4. Data on Termination" },
  { id: "uptime", label: "5. Uptime Commitment" },
  { id: "credits", label: "6. Service Credits" },
  { id: "support", label: "7. Support" },
  { id: "maintenance", label: "8. Maintenance & Changes" },
  { id: "security", label: "9. Security" },
  { id: "warranties", label: "10. Warranties & Disclaimers" },
  { id: "liability", label: "11. Limitation of Liability" },
  { id: "term-termination", label: "12. Term & Termination" },
  { id: "governing-law", label: "13. Governing Law" },
  { id: "changes", label: "14. Changes to These Terms" },
];

const SLA_TABLE = [
  { metric: "Platform Uptime", commitment: CONFIG.uptimeTarget + " monthly uptime target (excluding scheduled maintenance)", notes: "Service credit per Section 6" },
  { metric: "Scheduled Maintenance", commitment: "Advance notice of at least " + CONFIG.maintenanceNoticeHours + " hours, performed outside school hours where practicable", notes: "N/A" },
  { metric: "Critical Issue (platform down / data inaccessible)", commitment: "Acknowledged within " + CONFIG.criticalAckHours + " hours, target resolution within " + CONFIG.criticalResolveHours + " hours", notes: CONFIG.supportHours },
  { metric: "High Priority (major feature broken, no workaround)", commitment: "Acknowledged within " + CONFIG.highAckHours + " business hours, target resolution within " + CONFIG.highResolveDays + " business days", notes: CONFIG.supportHours },
  { metric: "Standard Support (general questions, minor bugs)", commitment: "Acknowledged within " + CONFIG.standardAckDays + " business day", notes: CONFIG.supportHours },
];

const CREDIT_TABLE = [
  { uptime: "< 99.5%", credit: "5% of monthly fee" },
  { uptime: "< 99.0%", credit: "10% of monthly fee" },
  { uptime: "< 97.0%", credit: "25% of monthly fee" },
];

function useActiveSection(ids) {
  const [active, setActive] = useState(ids[0]);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActive(entry.target.id);
        });
      },
      { rootMargin: "-15% 0px -70% 0px" }
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [ids]);
  return active;
}

function SectionHeading({ id, children }) {
  return (
    <h2 id={id} className="tos-section-heading">
      {children}
    </h2>
  );
}

export default function TermsOfService() {
  const activeId = useActiveSection(SECTIONS.map((s) => s.id));
  const navigate = useNavigate();

  return (
    <div className="tos-page">
      <div className="tos-container">
        {/* Sticky table of contents */}
        <nav aria-label="Table of contents" className="tos-toc">
          <div className="tos-toc-inner">
            <p className="tos-toc-label">On this page</p>
            <ul className="tos-toc-list">
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className={`tos-toc-link ${activeId === s.id ? "tos-toc-link--active" : ""}`}
                  >
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        {/* Main content */}
        <main className="tos-main">
          <header className="tos-header">
            <h1 className="tos-title">Terms of Service &amp; Service Level Agreement</h1>
            <p className="tos-subtitle">
              Last updated {CONFIG.lastUpdated} · Operated by {CONFIG.address}
            </p>
            <button className="tos-back-btn" onClick={() => navigate(basePath("/"))}>
              &larr; Back to Login
            </button>
          </header>

          <div className="tos-content">
            <p className="tos-parties">
              <strong>Provider:</strong> {CONFIG.companyName} (&ldquo;Provider&rdquo;, &ldquo;we&rdquo;)<br />
              <strong>Customer:</strong> [School Name] (&ldquo;Customer&rdquo;, &ldquo;School&rdquo;)<br />
              <strong>Effective Date:</strong> [date]
            </p>

            <SectionHeading id="service">1. The Service</SectionHeading>
            <p>
              {CONFIG.companyName} provides {CONFIG.providerName}, a multi-tenant school management
              platform (&lsquo;Service&rsquo;), to the School on a subscription basis as described
              in the applicable order form or subscription plan. Use of the Service is also governed
              by the {CONFIG.providerName} Privacy Policy and Data Processing Agreement, which are
              incorporated into these Terms by reference.
            </p>

            <SectionHeading id="fees">2. Subscription, Fees &amp; Payment</SectionHeading>
            <ul className="tos-list">
              <li>Fees are as set out in the applicable subscription plan or order form, billed {CONFIG.paymentTerms} in advance.</li>
              <li>Payment is due within {CONFIG.paymentDueDays} days of invoice date. Overdue accounts may be suspended after written notice, except where suspension would disrupt an active school term — the Provider will act in good faith to avoid disrupting students mid-term.</li>
              <li>Fees may be revised with at least {CONFIG.noticeDays} days&rsquo; written notice before the next billing cycle.</li>
              <li>All fees are exclusive of applicable taxes (e.g. VAT), which the School is responsible for unless stated otherwise.</li>
            </ul>

            <SectionHeading id="data-ownership">3. Data Ownership</SectionHeading>
            <ul className="tos-list">
              <li>The School owns all data it inputs into the Service, including student records, academic data, financial records, and staff data (&lsquo;School Data&rsquo;). Nothing in these Terms transfers ownership of School Data to the Provider.</li>
              <li>The Provider&rsquo;s role with respect to School Data is that of a Data Processor, as set out in the Data Processing Agreement between the parties.</li>
              <li>The Provider will not use School Data for any purpose other than providing the Service, except as required by law or with the School&rsquo;s written consent.</li>
              <li>The School may export its data at any time during the subscription term via the Service&rsquo;s built-in export tools, or on request.</li>
            </ul>

            <SectionHeading id="data-termination">4. Data on Termination</SectionHeading>
            <ul className="tos-list">
              <li>Upon termination or expiry of the subscription, the School may request a full export of its School Data within {CONFIG.dataRetentionDays} days of the termination date, in a commonly usable format (e.g. CSV, PDF).</li>
              <li>The Provider will retain School Data for {CONFIG.dataRetentionDays} days after termination to allow for export, after which it will be permanently deleted from production systems, except where retention is required by law (e.g. financial records) or agreed otherwise in writing.</li>
              <li>The Provider will not hold School Data hostage pending payment disputes — export requests will be honoured regardless of outstanding invoices, though access to the live Service may remain suspended.</li>
            </ul>

            <SectionHeading id="uptime">5. Uptime Commitment</SectionHeading>
            <p>
              The Provider targets the uptime and response times below. These are service commitments,
              not a guarantee of uninterrupted service — factors outside the Provider&rsquo;s
              reasonable control (e.g. internet service provider outages, force majeure, third-party
              service outages such as Supabase or M-Pesa) are excluded.
            </p>
            <div className="tos-table-wrap">
              <table className="tos-table">
                <thead className="tos-table-head">
                  <tr>
                    <th>Metric</th>
                    <th>Commitment</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {SLA_TABLE.map((row, i) => (
                    <tr key={row.metric} className={i % 2 === 0 ? "tos-row-even" : "tos-row-odd"}>
                      <td className="tos-cell-category">{row.metric}</td>
                      <td>{row.commitment}</td>
                      <td>{row.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <SectionHeading id="credits">6. Service Credits</SectionHeading>
            <p>
              If monthly uptime falls below the commitment in Section 5 due to causes within the
              Provider&rsquo;s reasonable control, the School may request a service credit against
              the following month&rsquo;s invoice:
            </p>
            <div className="tos-table-wrap">
              <table className="tos-table tos-table--narrow">
                <thead className="tos-table-head">
                  <tr>
                    <th>Monthly Uptime</th>
                    <th>Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {CREDIT_TABLE.map((row, i) => (
                    <tr key={row.uptime} className={i % 2 === 0 ? "tos-row-even" : "tos-row-odd"}>
                      <td className="tos-cell-category">{row.uptime}</td>
                      <td>{row.credit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              Service credits are the School&rsquo;s sole and exclusive remedy for failure to meet
              the uptime commitment. Credits must be requested in writing within {CONFIG.creditWindowDays} days
              of the affected month.
            </p>

            <SectionHeading id="support">7. Support</SectionHeading>
            <p>
              Support is provided via {CONFIG.supportChannels} during {CONFIG.supportHours}.
              Response times are targets, calculated during business hours, and may vary during
              periods of unusually high demand (e.g. term start, exam season) — the Provider will
              communicate proactively if targets are at risk.
            </p>

            <SectionHeading id="maintenance">8. Maintenance &amp; Changes to the Service</SectionHeading>
            <ul className="tos-list">
              <li>The Provider may perform scheduled maintenance with advance notice as set out in Section 5.</li>
              <li>The Provider may update, improve, or modify the Service over time. Material changes that reduce core functionality the School relies on will be communicated in advance where practicable.</li>
              <li>Emergency maintenance to address a security vulnerability may be performed without advance notice; the Provider will notify the School as soon as reasonably possible.</li>
            </ul>

            <SectionHeading id="security">9. Security</SectionHeading>
            <p>
              The Provider maintains the technical and organisational security measures described in
              the Data Processing Agreement, including row-level multi-tenant data isolation,
              role-based access control, and regular independent security audits. The Provider will
              notify the School of any data breach as set out in the Data Processing Agreement.
            </p>

            <SectionHeading id="warranties">10. Warranties &amp; Disclaimers</SectionHeading>
            <p>
              The Provider warrants that it will provide the Service with reasonable skill and care.
              Except as expressly stated in these Terms, the Service is provided &lsquo;as is&rsquo;,
              and the Provider disclaims all other warranties to the extent permitted by Kenyan law.
            </p>

            <SectionHeading id="liability">11. Limitation of Liability</SectionHeading>
            <p>
              Except in respect of a party&rsquo;s breach of confidentiality, data protection
              obligations, or liability that cannot be excluded by law, each party&rsquo;s total
              liability under these Terms is limited to the fees paid by the School in the {CONFIG.liabilityCapMonths}
              months preceding the claim. Neither party is liable for indirect or consequential losses.
            </p>

            <SectionHeading id="term-termination">12. Term &amp; Termination</SectionHeading>
            <ul className="tos-list">
              <li>These Terms remain in effect for the subscription term stated in the order form, renewing automatically unless either party gives {CONFIG.terminationNoticeDays} days&rsquo; written notice of non-renewal.</li>
              <li>Either party may terminate for material breach not remedied within {CONFIG.breachCureDays} days of written notice.</li>
              <li>The Provider may suspend or terminate access for non-payment as set out in Section 2, or for a School&rsquo;s material violation of these Terms (e.g. attempting to breach platform security or another School&rsquo;s data).</li>
            </ul>

            <SectionHeading id="governing-law">13. Governing Law</SectionHeading>
            <p>
              These Terms are governed by the laws of Kenya. Any dispute arising under these Terms
              will first be addressed through good-faith negotiation between the parties before either
              party pursues formal legal action.
            </p>

            <SectionHeading id="changes">14. Changes to These Terms</SectionHeading>
            <p>
              The Provider may update these Terms from time to time, with at least {CONFIG.termsNoticeDays}
              days&rsquo; notice of material changes affecting the School&rsquo;s rights or obligations.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
