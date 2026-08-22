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
}

export const HOD_NAV_FEATURES = {
  exam_setup: ['academics.exams'],
  marks_approval: ['academics.marks_approval'],
  dept_exams: ['academics.exams'],
  subject_perf: ['academics.performance'],
  dept_analytics: ['academics.performance'],
  teacher_review: ['academics.teacher_review'],
  report_center: ['platform.reports'],
}

export const REGISTRAR_NAV_FEATURES = {
  admissions: ['students.admission'],
  students: ['students.records'],
  promotions: ['students.promotion'],
  transfers: ['students.transfers'],
  alumni: ['students.alumni'],
  bulk_import: ['students.import'],
  documents: ['students.documents'],
  parents: ['students.records'],
}

export const RECEPTION_NAV_FEATURES = {
  admissions: ['students.admission'],
  visitors: ['reception.front_office'],
  appointments: ['reception.front_office'],
  calendar: ['reception.calendar'],
  communication: ['communication.messages'],
  requests: ['reception.front_office'],
  students: ['students.records'],
  parents: ['students.records'],
}

export const TEACHER_NAV_FEATURES = {
  timetable: ['academics.timetable'],
  marks_entry: ['academics.marks_entry'],
  attendance: ['students.attendance'],
  my_classes: ['academics.marks_entry'],
  grades: ['academics.grades'],
  cbc_competency: ['academics.cbc_analysis'],
  comments: ['hr.comments'],
  notices: ['communication.notices'],
}

export const CLASS_TEACHER_NAV_FEATURES = {
  attendance: ['students.attendance'],
  performance: ['academics.performance'],
  comments: ['hr.comments'],
  parent_comm: ['communication.messages'],
}

export const LIBRARY_NAV_FEATURES = {
  catalogue: ['library.catalogue'],
  borrow_return: ['library.circulation'],
  members: ['library.catalogue'],
  reservations: ['library.circulation'],
  overdue: ['library.circulation'],
  fines: ['library.fines'],
  reports: ['library.reports'],
  management: ['library.catalogue'],
}

export function getNavItemsWithFeatureCheck(navItems, navFeatures, features) {
  return navItems
    .map((item) => {
      if (item.children) {
        const filteredChildren = item.children.filter((child) => {
          const requiredFeatures = navFeatures[child.key]
          if (!requiredFeatures) return true
          return requiredFeatures.some((f) => features.includes(f))
        })
        if (filteredChildren.length === 0) return null
        return { ...item, children: filteredChildren }
      }
      const requiredFeatures = navFeatures[item.key]
      if (!requiredFeatures) return true
      return requiredFeatures.some((f) => features.includes(f))
    })
    .filter(Boolean)
}
