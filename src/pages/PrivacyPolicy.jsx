import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { basePath } from "../lib/paths";
import "./PrivacyPolicy.css";

const CONFIG = {
  lastUpdated: "August 25, 2026",
  contactEmail: "bima.ic.graphics@gmail.com",
  address: "BIMA Graphics, Thika, Kenya",
};

const SECTIONS = [
  { id: "intro", label: "1. Introduction" },
  { id: "data-we-collect", label: "2. Data We Collect" },
  { id: "how-we-use-data", label: "3. How We Use Data" },
  { id: "sub-processors", label: "4. Sub-Processors" },
  { id: "cross-border", label: "5. Cross-Border Data Transfer" },
  { id: "retention", label: "6. Data Retention" },
  { id: "rights", label: "7. Data Subject Rights" },
  { id: "security", label: "8. Security Measures" },
  { id: "breach", label: "9. Data Breach Notification" },
  { id: "children", label: "10. Children's Data" },
  { id: "contact", label: "11. Contact" },
  { id: "changes", label: "12. Changes to This Policy" },
];

const DATA_TYPES = [
  {
    category: "Student records",
    examples: "Full name, UPI number, date of birth, class/stream, guardian details, admission records, photo (avatar)",
    basis: "Contract (school enrollment) / Legitimate interest (school administration)",
  },
  {
    category: "Academic data",
    examples: "Grades, exam results, report cards, exam papers",
    basis: "Contract / Legitimate interest",
  },
  {
    category: "Financial data",
    examples: "Fee structures, payment history, M-Pesa transaction references",
    basis: "Contract",
  },
  {
    category: "Guardian/parent data",
    examples: "Name, phone number, relationship to student",
    basis: "Contract / Legitimate interest",
  },
  {
    category: "Staff data",
    examples: "Name, role, contact details, login credentials, teacher photos",
    basis: "Contract (employment relationship with school) / Legitimate interest",
  },
  {
    category: "Usage data",
    examples: "Login timestamps, role switches, device/browser metadata",
    basis: "Legitimate interest (security, audit trail)",
  },
];

const SUB_PROCESSORS = [
  { name: "Supabase", purpose: "Database, authentication, file storage", notes: "Hosted infrastructure outside Kenya — governed by Supabase's own data processing terms" },
  { name: "M-Pesa (Safaricom / Daraja API)", purpose: "Fee payment processing", notes: "Kenya" },
  { name: "Africa's Talking", purpose: "SMS notifications", notes: "Kenya" },
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
    <h2 id={id} className="pp-section-heading">
      {children}
    </h2>
  );
}

export default function PrivacyPolicy() {
  const activeId = useActiveSection(SECTIONS.map((s) => s.id));
  const navigate = useNavigate();

  return (
    <div className="pp-page">
      <div className="pp-container">
        {/* Sticky table of contents */}
        <nav aria-label="Table of contents" className="pp-toc">
          <div className="pp-toc-inner">
            <p className="pp-toc-label">On this page</p>
            <ul className="pp-toc-list">
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className={`pp-toc-link ${activeId === s.id ? "pp-toc-link--active" : ""}`}
                  >
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        {/* Main content */}
        <main className="pp-main">
          <header className="pp-header">
            <h1 className="pp-title">Privacy Policy</h1>
            <p className="pp-subtitle">
              Last updated {CONFIG.lastUpdated} · Operated by {CONFIG.address}
            </p>
            <button className="pp-back-btn" onClick={() => navigate(basePath("/"))}>
              &larr; Back to Login
            </button>
          </header>

          <div className="pp-content">
            <SectionHeading id="intro">1. Introduction</SectionHeading>
            <p>
              ShulePulse (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;) is a school
              management platform, providing software services to
              schools (&ldquo;Schools&rdquo;, &ldquo;Customers&rdquo;) in Kenya. This policy
              explains how we collect, use, store, and protect personal data in connection
              with the ShulePulse platform, in accordance with the Kenya Data Protection Act,
              2019 (&ldquo;DPA&rdquo;).
            </p>
            <p>
              For data belonging to students, guardians, and staff, the School using ShulePulse
              is the Data Controller. ShulePulse acts as the Data Processor, processing that
              data solely on the School&rsquo;s instructions as set out in our Data Processing
              Agreement with each School.
            </p>

            <SectionHeading id="data-we-collect">2. Data We Collect</SectionHeading>
            <div className="pp-table-wrap">
              <table className="pp-table">
                <thead className="pp-table-head">
                  <tr>
                    <th>Category</th>
                    <th>Examples</th>
                    <th>Legal Basis</th>
                  </tr>
                </thead>
                <tbody>
                  {DATA_TYPES.map((row, i) => (
                    <tr key={row.category} className={i % 2 === 0 ? "pp-row-even" : "pp-row-odd"}>
                      <td className="pp-cell-category">{row.category}</td>
                      <td>{row.examples}</td>
                      <td>{row.basis}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <SectionHeading id="how-we-use-data">3. How We Use Data</SectionHeading>
            <ul className="pp-list">
              <li>To operate core school administration functions: admissions, attendance, grading, timetabling, fee collection, and reporting.</li>
              <li>To authenticate users and enforce role-based access control within a School&rsquo;s account.</li>
              <li>To send notifications (e.g. fee reminders, results) via SMS or in-app messaging.</li>
              <li>To maintain security and audit logs.</li>
              <li>We do not sell personal data, and we do not use student or guardian data for advertising or marketing purposes.</li>
            </ul>

            <SectionHeading id="sub-processors">4. Sub-Processors</SectionHeading>
            <p>
              We rely on the following third-party services to operate the platform. Each is
              bound by its own data protection terms; we select sub-processors that provide
              adequate safeguards for personal data.
            </p>
            <div className="pp-table-wrap">
              <table className="pp-table">
                <thead className="pp-table-head">
                  <tr>
                    <th>Sub-Processor</th>
                    <th>Purpose</th>
                    <th>Location / Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {SUB_PROCESSORS.map((row, i) => (
                    <tr key={row.name} className={i % 2 === 0 ? "pp-row-even" : "pp-row-odd"}>
                      <td className="pp-cell-category">{row.name}</td>
                      <td>{row.purpose}</td>
                      <td>{row.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <SectionHeading id="cross-border">5. Cross-Border Data Transfer</SectionHeading>
            <p>
              Some personal data may be stored or processed outside Kenya through our
              infrastructure providers (see Section 4). Where this occurs, we rely on the
              sub-processor&rsquo;s own compliance safeguards (such as standard contractual
              clauses or equivalent certifications) as the basis for transfer, consistent with
              the DPA&rsquo;s cross-border transfer requirements.
            </p>

            <SectionHeading id="retention">6. Data Retention</SectionHeading>
            <p>
              Personal data is retained for as long as a School&rsquo;s account remains active,
              and for a reasonable period thereafter as agreed in the Data Processing Agreement
              with that School, or as required by applicable law (e.g. financial records). Upon
              a School&rsquo;s request to terminate services, data is deleted or returned in
              accordance with the DPA terms agreed with that School.
            </p>

            <SectionHeading id="rights">7. Data Subject Rights</SectionHeading>
            <p>
              Under the DPA, individuals have the right to: access their personal data; request
              correction of inaccurate data; request deletion where legally permissible; object
              to certain processing; and lodge a complaint with the Office of the Data
              Protection Commissioner (ODPC).
            </p>
            <p>
              Because Schools are the Data Controllers, requests regarding a student&rsquo;s,
              guardian&rsquo;s, or staff member&rsquo;s data should generally be directed to the
              relevant School in the first instance. We support Schools in fulfilling these
              requests through the platform&rsquo;s data export and deletion tools.
            </p>

            <SectionHeading id="security">8. Security Measures</SectionHeading>
            <ul className="pp-list">
              <li>Row-level security enforced on all data tables, scoping access by school.</li>
              <li>Role-based access control across all user-facing routes.</li>
              <li>Encrypted credential storage and secure password generation.</li>
              <li>File storage buckets restricted by file type, size, and access policy.</li>
              <li>Regular security audits of the platform&rsquo;s codebase and infrastructure.</li>
            </ul>

            <SectionHeading id="breach">9. Data Breach Notification</SectionHeading>
            <p>
              In the event of a data breach affecting personal data, we will notify affected
              Schools without undue delay, and will support Schools in meeting their own
              notification obligations to the ODPC and affected data subjects as required under
              the DPA.
            </p>

            <SectionHeading id="children">10. Children&rsquo;s Data</SectionHeading>
            <p>
              ShulePulse processes personal data belonging to minors (students) as a core
              function of school administration. This data is provided and controlled by the
              School (acting under its educational mandate), not collected directly from
              children by ShulePulse. Schools are responsible for ensuring they have an
              appropriate basis for providing student data to the platform.
            </p>

            <SectionHeading id="contact">11. Contact</SectionHeading>
            <p>For questions about this policy or to exercise a data protection right, contact:</p>
            <div className="pp-contact-card">
              <p><strong>Email:</strong> <a href="mailto:bima.ic.graphics@gmail.com" className="pp-contact-link">bima.ic.graphics@gmail.com</a></p>
              <p><strong>Phone / WhatsApp:</strong> <a href="https://wa.me/254715909038" className="pp-contact-link" target="_blank" rel="noopener noreferrer">0715 909 038</a></p>
              <p><strong>Address:</strong> BIMA Graphics, Thika, Kenya</p>
            </div>

            <SectionHeading id="changes">12. Changes to This Policy</SectionHeading>
            <p>
              We may update this policy from time to time. Material changes will be
              communicated to Schools in advance where practicable.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
