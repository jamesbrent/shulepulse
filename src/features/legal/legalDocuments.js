const COMPANY = 'BIMA Graphics'
const PRODUCT = 'ShulePulse'
const ADDRESS = 'BIMA Graphics, Thika, Kenya'
const EMAIL = 'bima.ic.graphics@gmail.com'
const PHONE = '0715 909 038'
const LAST_UPDATED = 'August 26, 2026'

export const TERMS_OF_SERVICE = {
  title: 'Terms of Service & Service Level Agreement',
  filename: 'terms-of-service.pdf',
  lastUpdated: LAST_UPDATED,
  sections: [
    {
      heading: 'Parties',
      content: `Provider: ${COMPANY} ("Provider", "we")\nCustomer: [School Name] ("Customer", "School")\nEffective Date: [date]`,
    },
    {
      heading: '1. The Service',
      content: `${COMPANY} provides ${PRODUCT}, a multi-tenant school management platform ("Service"), to the School on a subscription basis as described in the applicable order form or subscription plan. Use of the Service is also governed by the ${PRODUCT} Privacy Policy and Data Processing Agreement, which are incorporated into these Terms by reference.`,
    },
    {
      heading: '2. Subscription, Fees & Payment',
      bullets: [
        'Fees are as set out in the applicable subscription plan or order form, billed monthly in advance.',
        'Payment is due within 14 days of invoice date. Overdue accounts may be suspended after written notice, except where suspension would disrupt an active school term.',
        'Fees may be revised with at least 30 days\' written notice before the next billing cycle.',
        'All fees are exclusive of applicable taxes (e.g. VAT), which the School is responsible for unless stated otherwise.',
      ],
    },
    {
      heading: '3. Data Ownership',
      bullets: [
        'The School owns all data it inputs into the Service, including student records, academic data, financial records, and staff data ("School Data"). Nothing in these Terms transfers ownership of School Data to the Provider.',
        'The Provider\'s role with respect to School Data is that of a Data Processor, as set out in the Data Processing Agreement.',
        'The Provider will not use School Data for any purpose other than providing the Service, except as required by law or with the School\'s written consent.',
        'The School may export its data at any time during the subscription term via the Service\'s built-in export tools, or on request.',
      ],
    },
    {
      heading: '4. Data on Termination',
      bullets: [
        'Upon termination or expiry of the subscription, the School may request a full export of its School Data within 30 days of the termination date, in a commonly usable format (e.g. CSV, PDF).',
        'The Provider will retain School Data for 30 days after termination to allow for export, after which it will be permanently deleted from production systems, except where retention is required by law.',
        'The Provider will not hold School Data hostage pending payment disputes — export requests will be honoured regardless of outstanding invoices.',
      ],
    },
    {
      heading: '5. Uptime Commitment',
      content: 'The Provider targets the following uptime and response times. These are service commitments, not a guarantee of uninterrupted service — factors outside the Provider\'s reasonable control (e.g. internet outages, force majeure, third-party outages such as Supabase or M-Pesa) are excluded.',
      table: {
        headers: ['Metric', 'Commitment'],
        rows: [
          ['Platform Uptime', '99.5% monthly target'],
          ['Scheduled Maintenance', 'At least 24 hours advance notice, outside school hours where practicable'],
          ['Critical Issue', 'Acknowledged within 2 hours, target resolution within 8 hours'],
          ['High Priority', 'Acknowledged within 4 business hours, resolution within 2 business days'],
          ['Standard Support', 'Acknowledged within 1 business day'],
        ],
      },
    },
    {
      heading: '6. Service Credits',
      content: 'If monthly uptime falls below the commitment due to causes within the Provider\'s reasonable control, the School may request a service credit:',
      table: {
        headers: ['Monthly Uptime', 'Credit'],
        rows: [
          ['< 99.5%', '5% of monthly fee'],
          ['< 99.0%', '10% of monthly fee'],
          ['< 97.0%', '25% of monthly fee'],
        ],
      },
      footer: 'Credits must be requested in writing within 30 days of the affected month.',
    },
    {
      heading: '7. Support',
      content: `Support is provided via email and WhatsApp during 9am–5pm EAT, Mon–Fri. Response times are targets, calculated during business hours, and may vary during periods of high demand.`,
    },
    {
      heading: '8. Maintenance & Changes to the Service',
      bullets: [
        'The Provider may perform scheduled maintenance with advance notice as set out in Section 5.',
        'Material changes that reduce core functionality will be communicated in advance where practicable.',
        'Emergency maintenance to address a security vulnerability may be performed without advance notice.',
      ],
    },
    {
      heading: '9. Security',
      content: 'The Provider maintains the technical and organisational security measures described in the Data Processing Agreement, including row-level multi-tenant data isolation, role-based access control, and regular independent security audits.',
    },
    {
      heading: '10. Warranties & Disclaimers',
      content: 'The Provider warrants that it will provide the Service with reasonable skill and care. Except as expressly stated, the Service is provided "as is", and the Provider disclaims all other warranties to the extent permitted by Kenyan law.',
    },
    {
      heading: '11. Limitation of Liability',
      content: 'Except in respect of breach of confidentiality, data protection obligations, or liability that cannot be excluded by law, each party\'s total liability is limited to the fees paid by the School in the 12 months preceding the claim. Neither party is liable for indirect or consequential losses.',
    },
    {
      heading: '12. Term & Termination',
      bullets: [
        'These Terms remain in effect for the subscription term, renewing automatically unless either party gives 30 days\' written notice of non-renewal.',
        'Either party may terminate for material breach not remedied within 14 days of written notice.',
        'The Provider may suspend or terminate access for non-payment or material violation of these Terms.',
      ],
    },
    {
      heading: '13. Governing Law',
      content: 'These Terms are governed by the laws of Kenya. Any dispute arising will first be addressed through good-faith negotiation before formal legal action.',
    },
    {
      heading: '14. Changes to These Terms',
      content: 'The Provider may update these Terms from time to time, with at least 30 days\' notice of material changes affecting the School\'s rights or obligations.',
    },
  ],
}

export const PRIVACY_POLICY = {
  title: 'Privacy Policy',
  filename: 'privacy-policy.pdf',
  lastUpdated: LAST_UPDATED,
  sections: [
    {
      heading: '1. Introduction',
      content: `${PRODUCT} ("we", "us", "our") is a school management platform providing software services to schools in Kenya. This policy explains how we collect, use, store, and protect personal data in connection with the ${PRODUCT} platform, in accordance with the Kenya Data Protection Act, 2019 ("DPA").\n\nFor data belonging to students, guardians, and staff, the School using ${PRODUCT} is the Data Controller. ${PRODUCT} acts as the Data Processor, processing that data solely on the School's instructions.`,
    },
    {
      heading: '2. Data We Collect',
      table: {
        headers: ['Category', 'Examples', 'Legal Basis'],
        rows: [
          ['Student records', 'Full name, UPI, DOB, class, guardian details, photo', 'Contract / Legitimate interest'],
          ['Academic data', 'Grades, exam results, report cards', 'Contract / Legitimate interest'],
          ['Financial data', 'Fee structures, payment history, M-Pesa references', 'Contract'],
          ['Guardian/parent data', 'Name, phone number, relationship to student', 'Contract / Legitimate interest'],
          ['Staff data', 'Name, role, contact details, login credentials', 'Contract / Legitimate interest'],
          ['Usage data', 'Login timestamps, role switches, device metadata', 'Legitimate interest (security)'],
        ],
      },
    },
    {
      heading: '3. How We Use Data',
      bullets: [
        'To operate core school administration: admissions, attendance, grading, timetabling, fee collection, and reporting.',
        'To authenticate users and enforce role-based access control.',
        'To send notifications (e.g. fee reminders, results) via SMS or in-app messaging.',
        'To maintain security and audit logs.',
        'We do not sell personal data, and we do not use student or guardian data for advertising or marketing.',
      ],
    },
    {
      heading: '4. Sub-Processors',
      content: 'We rely on the following third-party services, each bound by its own data protection terms:',
      table: {
        headers: ['Sub-Processor', 'Purpose', 'Location'],
        rows: [
          ['Supabase', 'Database, authentication, file storage', 'Hosted outside Kenya'],
          ['M-Pesa (Safaricom)', 'Fee payment processing', 'Kenya'],
          ['Cloudflare', 'Website hosting, backups (R2)', 'Global CDN'],
          ["Africa's Talking", 'SMS notifications', 'Kenya'],
        ],
      },
    },
    {
      heading: '5. Cross-Border Data Transfer',
      content: 'Some personal data may be stored or processed outside Kenya through our infrastructure providers. Where this occurs, we rely on the sub-processor\'s compliance safeguards (standard contractual clauses or equivalent certifications) as the basis for transfer.',
    },
    {
      heading: '6. Data Retention',
      content: 'Personal data is retained for as long as a School\'s account remains active, and for a reasonable period thereafter as agreed in the Data Processing Agreement, or as required by applicable law (e.g. financial records). Upon termination, data is deleted or returned in accordance with the DPA.',
    },
    {
      heading: '7. Data Subject Rights',
      content: 'Under the DPA, individuals have the right to: access their personal data; request correction of inaccurate data; request deletion where legally permissible; object to certain processing; and lodge a complaint with the Office of the Data Protection Commissioner (ODPC).\n\nBecause Schools are the Data Controllers, requests regarding student, guardian, or staff data should be directed to the School in the first instance. We support Schools in fulfilling these requests through the platform\'s data export and deletion tools.',
    },
    {
      heading: '8. Security Measures',
      bullets: [
        'Row-level security enforced on all data tables, scoping access by school.',
        'Role-based access control across all user-facing routes.',
        'Encrypted credential storage and secure password generation.',
        'File storage buckets restricted by file type, size, and access policy.',
        'Regular security audits of the platform\'s codebase and infrastructure.',
      ],
    },
    {
      heading: '9. Data Breach Notification',
      content: 'In the event of a data breach affecting personal data, we will notify affected Schools without undue delay, and will support Schools in meeting their notification obligations to the ODPC and affected data subjects as required under the DPA.',
    },
    {
      heading: "10. Children's Data",
      content: `${PRODUCT} processes personal data belonging to minors (students) as a core function of school administration. This data is provided and controlled by the School (acting under its educational mandate), not collected directly from children by ${PRODUCT}. Schools are responsible for ensuring they have an appropriate basis for providing student data to the platform.`,
    },
    {
      heading: '11. Contact',
      content: `For questions about this policy or to exercise a data protection right, contact:\nEmail: ${EMAIL}\nWhatsApp: ${PHONE}\nAddress: ${ADDRESS}`,
    },
    {
      heading: '12. Changes to This Policy',
      content: 'We may update this policy from time to time. Material changes will be communicated to Schools in advance where practicable.',
    },
  ],
}

export const DATA_PROCESSING_AGREEMENT = {
  title: 'Data Processing Agreement',
  filename: 'data-processing-agreement.pdf',
  lastUpdated: LAST_UPDATED,
  sections: [
    {
      heading: '1. Definitions',
      content: `"Data Controller" means the School, which determines the purposes and means of processing personal data.\n\n"Data Processor" means ${COMPANY} (${PRODUCT}), which processes personal data on behalf of the Data Controller.\n\n"Personal Data" means any information relating to an identified or identifiable natural person, including students, parents/guardians, and staff.\n\n"Data Subject" means the individual to whom the Personal Data relates.\n\n"Sub-Processor" means a third party engaged by the Data Processor to assist in fulfilling its obligations under this Agreement.`,
    },
    {
      heading: '2. Scope & Purpose',
      content: `This Agreement governs the processing of Personal Data by ${PRODUCT} on behalf of the School in connection with the provision of the ${PRODUCT} school management platform. ${PRODUCT} will only process Personal Data on documented instructions from the School, unless required to do so by applicable law.`,
    },
    {
      heading: '3. Data Controller Obligations',
      content: 'The School (Data Controller) is responsible for:',
      bullets: [
        'Ensuring it has a lawful basis for providing Personal Data to the platform, including obtaining any required consents from data subjects (or their parents/guardians for minors).',
        'Ensuring the accuracy and completeness of data entered into the platform.',
        'Responding to data subject access requests and exercising its obligations under the Kenya DPA, 2019.',
        'Notifying data subjects about the processing of their data through the platform.',
        'Determining appropriate data retention periods in accordance with applicable law.',
      ],
    },
    {
      heading: '4. Data Processor Obligations',
      content: `${PRODUCT} (Data Processor) undertakes to:`,
      bullets: [
        'Process Personal Data only on documented instructions from the School.',
        'Ensure that persons authorised to process Personal Data have committed themselves to confidentiality.',
        'Implement appropriate technical and organisational security measures as described in Section 7.',
        'Not engage another Sub-Processor without prior written authorisation from the School.',
        'Assist the School in responding to data subject requests.',
        'Assist the School in ensuring compliance with security, breach notification, and data protection impact assessment obligations.',
        'Delete or return all Personal Data to the School upon termination of services, at the School\'s choice.',
        'Make available all information necessary to demonstrate compliance and allow for audits.',
      ],
    },
    {
      heading: '5. Sub-Processors',
      content: 'The School provides general written authorisation for the engagement of the following Sub-Processors:',
      table: {
        headers: ['Sub-Processor', 'Purpose', 'Location', 'Safeguards'],
        rows: [
          ['Supabase', 'Database, authentication, file storage', 'USA / Global', 'SOC 2 Type II, DPA available'],
          ['Cloudflare', 'CDN, hosting, backup storage (R2)', 'Global', 'SOC 2 Type II, DPA available'],
          ['M-Pesa (Safaricom)', 'Fee payment processing', 'Kenya', 'Kenya DPA compliant'],
          ["Africa's Talking", 'SMS notifications', 'Kenya', 'Kenya DPA compliant'],
        ],
      },
      footer: `${PRODUCT} will notify the School of any intended changes to Sub-Processors at least 30 days in advance. The School may object to a new Sub-Processor within 14 days of notification.`,
    },
    {
      heading: '6. Data Breach Notification',
      content: `In the event of a Personal Data breach, ${PRODUCT} will:`,

      bullets: [
        'Notify the School without undue delay, and no later than 48 hours after becoming aware of the breach.',
        'Provide the School with: (a) a description of the nature of the breach, (b) the categories and approximate number of data subjects affected, (c) the likely consequences, and (d) the measures taken or proposed to address the breach.',
        'Assist the School in notifying the Office of the Data Protection Commissioner (ODPC) and affected data subjects where required by the Kenya DPA, 2019.',
        'Continue to provide information about the breach as it becomes available.',
      ],
    },
    {
      heading: '7. Security Measures',
      content: `${PRODUCT} implements the following technical and organisational measures:`,
      bullets: [
        'Row-level security (RLS) on all database tables, enforcing school-level data isolation.',
        'Role-based access control (RBAC) with granular permissions per user role.',
        'Encrypted data in transit (TLS 1.3) and at rest (AES-256).',
        'Secure credential storage with bcrypt hashing and unique password generation.',
        'File storage restricted by type, size, and access policies per school.',
        'Regular security audits and vulnerability assessments.',
        'Automated backup systems with encrypted off-site storage (Cloudflare R2).',
        'Audit logging of all data access and modifications.',
      ],
    },
    {
      heading: '8. Data Transfers',
      content: 'Where Personal Data is transferred outside Kenya (e.g. through Supabase or Cloudflare infrastructure), ${PRODUCT} ensures that appropriate safeguards are in place, including standard contractual clauses or equivalent mechanisms, in compliance with the Kenya DPA\'s cross-border transfer requirements.',
    },
    {
      heading: '9. Liability & Indemnification',
      content: `Each party shall be liable for damage caused by processing that infringes the DPA. The Data Processor shall be liable only for damage caused by processing where it has not complied with obligations specifically directed to Processors, or where it has acted outside or contrary to the School's lawful instructions.\n\n${PRODUCT} shall indemnify the School against claims arising from ${PRODUCT}'s failure to comply with this Agreement.`,
    },
    {
      heading: '10. Term & Termination',
      content: 'This Agreement remains in effect for the duration of the processing of Personal Data by ${PRODUCT}. Upon termination of services, and at the School\'s choice, ${PRODUCT} shall delete or return all Personal Data within 30 days, and certify in writing that it has done so.',
    },
    {
      heading: '11. Governing Law',
      content: 'This Agreement is governed by the laws of Kenya, including the Data Protection Act, 2019. Any disputes shall be resolved through good-faith negotiation before formal legal proceedings.',
    },
  ],
}

export const LEGAL_DOCUMENTS = [TERMS_OF_SERVICE, PRIVACY_POLICY, DATA_PROCESSING_AGREEMENT]
