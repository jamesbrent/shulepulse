// ─── Role Constants ──────────────────────────────────────────────────────────
// Single source of truth for all role definitions.
// Import from here instead of duplicating role arrays across components.

export const ROLES = {
  SUPERADMIN: 'superadmin',
  ADMIN: 'admin',
  DEPUTY_ADMINISTRATOR: 'deputy_administrator',
  BURSAR: 'bursar',
  REGISTRAR: 'registrar',
  RECEPTION: 'reception',
  HOD: 'hod',
  TEACHER: 'teacher',
  CLASS_TEACHER: 'class_teacher',
  LIBRARIAN: 'librarian',
  STUDENT: 'student',
  PARENT: 'parent',
}

export const ROLE_LIST = Object.values(ROLES)

// ─── Role Metadata ───────────────────────────────────────────────────────────
export const ROLE_META = {
  [ROLES.SUPERADMIN]:        { label: 'Super Admin',      route: '/superadmin',    color: '#0f172a', navLabel: 'Super Admin' },
  [ROLES.ADMIN]:             { label: 'Admin',            route: '/admin',         color: '#2563eb', navLabel: 'Admin' },
  [ROLES.DEPUTY_ADMINISTRATOR]: { label: 'Deputy Admin',  route: '/deputy-admin',  color: '#2563eb', navLabel: 'Deputy Admin' },
  [ROLES.BURSAR]:            { label: 'Finance',          route: '/bursar',        color: '#16a34a', navLabel: 'Finance' },
  [ROLES.REGISTRAR]:         { label: 'Registrar',        route: '/registrar',     color: '#ca8a04', navLabel: 'Registrar' },
  [ROLES.RECEPTION]:         { label: 'Reception',        route: '/reception',     color: '#0d9488', navLabel: 'Reception' },
  [ROLES.HOD]:               { label: 'HOD',              route: '/hod',           color: '#7c3aed', navLabel: 'Head of Dept' },
  [ROLES.TEACHER]:           { label: 'Teacher',          route: '/teacher',       color: '#64748b', navLabel: 'Teacher' },
  [ROLES.CLASS_TEACHER]:     { label: 'Class Teacher',    route: '/class-teacher', color: '#dc2626', navLabel: 'Class Teacher' },
  [ROLES.LIBRARIAN]:         { label: 'Librarian',        route: '/library',       color: '#16a34a', navLabel: 'Librarian' },
  [ROLES.STUDENT]:           { label: 'Student',          route: '/student',       color: '#d97706', navLabel: 'Student' },
  [ROLES.PARENT]:            { label: 'Parent',           route: '/parent',        color: '#0891b2', navLabel: 'Parent' },
}

// ─── Role Groups ─────────────────────────────────────────────────────────────
export const STAFF_ROLES = [
  ROLES.ADMIN, ROLES.DEPUTY_ADMINISTRATOR, ROLES.BURSAR,
  ROLES.REGISTRAR, ROLES.RECEPTION, ROLES.HOD,
  ROLES.TEACHER, ROLES.CLASS_TEACHER, ROLES.LIBRARIAN,
]

export const FINANCE_ROLES = [
  ROLES.ADMIN, ROLES.BURSAR, ROLES.DEPUTY_ADMINISTRATOR, ROLES.SUPERADMIN,
]

export const APPROVAL_ROLES = [
  ROLES.ADMIN, ROLES.DEPUTY_ADMINISTRATOR, ROLES.SUPERADMIN,
]

export const STAFF_SELECT_ROLES = [
  ROLES.ADMIN, ROLES.DEPUTY_ADMINISTRATOR, ROLES.BURSAR,
  ROLES.REGISTRAR, ROLES.RECEPTION, ROLES.HOD,
  ROLES.TEACHER, ROLES.CLASS_TEACHER, ROLES.LIBRARIAN,
  ROLES.SUPERADMIN,
]

export const NOTICE_CREATE_ROLES = [
  ROLES.ADMIN, ROLES.HOD, ROLES.DEPUTY_ADMINISTRATOR,
  ROLES.SUPERADMIN, ROLES.RECEPTION, ROLES.REGISTRAR, ROLES.BURSAR,
]

// ─── Route Protection ────────────────────────────────────────────────────────
export const ROLE_ROUTES = {
  [ROLES.SUPERADMIN]: '/superadmin',
  [ROLES.ADMIN]: '/admin',
  [ROLES.DEPUTY_ADMINISTRATOR]: '/deputy-admin',
  [ROLES.BURSAR]: '/admin',
  [ROLES.REGISTRAR]: '/admin',
  [ROLES.RECEPTION]: '/reception',
  [ROLES.HOD]: '/hod',
  [ROLES.TEACHER]: '/teacher',
  [ROLES.CLASS_TEACHER]: '/class-teacher',
  [ROLES.LIBRARIAN]: '/library',
  [ROLES.STUDENT]: '/student',
  [ROLES.PARENT]: '/parent',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
export function hasRole(profile, role) {
  return profile?.role === role || profile?.roles?.includes(role)
}

export function hasAnyRole(profile, roles) {
  return roles.some((r) => hasRole(profile, r))
}

export function isStaffRole(role) {
  return STAFF_ROLES.includes(role)
}

export function isFinanceRole(role) {
  return FINANCE_ROLES.includes(role)
}

export function formatRole(role) {
  return ROLE_META[role]?.label || (role || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export function getRoleColor(role) {
  return ROLE_META[role]?.color || '#64748b'
}
