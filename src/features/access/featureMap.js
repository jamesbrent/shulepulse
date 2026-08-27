export const ADMIN_NAV_FEATURES = {
  students: ['students.records'],
  attendance: ['students.attendance'],
  alumni: ['students.alumni'],
  grades: ['academics.grades'],
  marks_entry: ['academics.marks_entry'],
  exam_setup: ['academics.exams'],
  marks_approval: ['academics.marks_approval'],
  dept_exams: ['academics.exams'],
  subject_perf: ['academics.performance'],
  teacher_review: ['academics.teacher_review'],
  cbc_competency: ['academics.cbc_analysis'],
  timetable: ['academics.timetable'],
  library: ['library.catalogue'],
  fees: ['finance.fees'],
  payments: ['finance.payments'],
  receipts: ['finance.receipts'],
  statements: ['finance.statements'],
  accounting: ['finance.accounting'],
  expenses: ['finance.expenses'],
  cash_bank: ['finance.cash_bank'],
  assets: ['finance.assets'],
  payroll: ['payroll.employees', 'payroll.runs'],
  ap: ['finance.ap'],
  finance_reports: ['finance.reports'],
  financial_statements: ['finance.financial_statements'],
  teachers: ['hr.staff_management'],
  staffroles: ['hr.staff_management'],
  non_teaching: ['hr.staff_management'],
  comments: ['hr.comments'],
  staff_directory: ['hr.staff_directory'],
  departments: ['hr.departments'],
  reports: ['platform.reports'],
  analytics: ['platform.reports'],
  branding: ['settings.branding'],
  support: ['platform.support'],
  settings_page: ['settings.general'],
}

export const FINANCE_NAV_FEATURES = {
  fees: ['finance.fees'],
  payments: ['finance.payments'],
  receipts: ['finance.receipts'],
  statements: ['finance.statements'],
  debtors: ['finance.debtors'],
  accounting: ['finance.accounting'],
  expenses: ['finance.expenses'],
  cash_bank: ['finance.cash_bank'],
  assets: ['finance.assets'],
  payroll: ['payroll.employees', 'payroll.runs'],
  ap: ['finance.ap'],
  finance_reports: ['finance.reports'],
  financial_statements: ['finance.financial_statements'],
  accounts_payable: ['finance.ap'],
  payroll_reports: ['payroll.employees'],
  comments: ['hr.comments'],
  reports: ['finance.reports'],
}

export const HOD_NAV_FEATURES = {
  exam_setup: ['academics.exams'],
  marks_approval: ['academics.marks_approval'],
  dept_exams: ['academics.exams'],
  subject_perf: ['academics.performance'],
  subject_performance: ['academics.performance'],
  dept_analytics: ['academics.performance'],
  analytics: ['academics.performance'],
  teacher_review: ['academics.teacher_review'],
  report_center: ['platform.reports'],
  library: ['library.catalogue'],
}

export const REGISTRAR_NAV_FEATURES = {
  admissions: ['students.admission'],
  students: ['students.records'],
  promotions: ['students.promotion'],
  transfers: ['students.transfers'],
  alumni: ['students.alumni'],
  archives: ['students.alumni'],
  bulk_import: ['students.import'],
  'bulk-import': ['students.import'],
  documents: ['students.documents'],
  parents: ['students.records'],
  guardians: ['students.records'],
  library: ['library.catalogue'],
}

export const RECEPTION_NAV_FEATURES = {
  admissions: ['students.admission'],
  'new-admission': ['students.admission'],
  visitors: ['reception.front_office'],
  appointments: ['reception.front_office'],
  calendar: ['reception.calendar'],
  communication: ['communication.messages'],
  requests: ['reception.front_office'],
  reports: ['reception.front_office'],
  students: ['students.records'],
  parents: ['students.records'],
}

export const TEACHER_NAV_FEATURES = {
  timetable: ['academics.timetable'],
  marks_entry: ['academics.marks_entry'],
  marks: ['academics.marks_entry'],
  my_classes: ['academics.marks_entry'],
  myclasses: ['academics.marks_entry'],
  attendance: ['students.attendance'],
  grades: ['academics.grades'],
  cbc_competency: ['academics.cbc_analysis'],
  cbc: ['academics.cbc_analysis'],
  comments: ['hr.comments'],
  library: ['library.catalogue'],
  notices: ['communication.notices'],
}

export const CLASS_TEACHER_NAV_FEATURES = {
  attendance: ['students.attendance'],
  performance: ['academics.performance'],
  comments: ['hr.comments'],
  parent_comm: ['communication.messages'],
  communication: ['communication.messages'],
  library: ['library.catalogue'],
  marks: ['academics.marks_entry'],
  timetable: ['academics.timetable'],
}

export const LIBRARY_NAV_FEATURES = {
  catalogue: ['library.catalogue'],
  borrow_return: ['library.circulation'],
  borrow: ['library.circulation'],
  members: ['library.catalogue'],
  reservations: ['library.circulation'],
  overdue: ['library.circulation'],
  fines: ['library.fines'],
  reports: ['library.reports'],
  management: ['library.catalogue'],
}

export const FREE_NAV_KEYS = ['dashboard', 'notices', 'support']

export function navItemAllowed(item, navFeatures, features) {
  const key = item?.key
  if (!key) return false
  if (FREE_NAV_KEYS.includes(key)) return true
  const required = navFeatures?.[key] || navFeatures?.[item?.page]
  if (!required) return false
  return required.some((f) => features.includes(f))
}

export function getNavItemsWithFeatureCheck(navItems, navFeatures, features) {
  return navItems
    .map((item) => {
      if (item.children) {
        const filteredChildren = item.children.filter((child) => {
          return navItemAllowed(child, navFeatures, features)
        })
        if (filteredChildren.length === 0) return null
        return { ...item, children: filteredChildren }
      }
      if (!navItemAllowed(item, navFeatures, features)) return null
      return item
    })
    .filter(Boolean)
}
