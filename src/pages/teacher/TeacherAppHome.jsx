import { useState } from 'react';
import AvatarUpload from '../../components/AvatarUpload';

/*
  TeacherAppHome
  ---------------------------------------------
  Mobile Teacher home — pasted design, kept verbatim.
  Pure presentational component. Pass in live data from Supabase.
  See the prop descriptions in the default export below.
*/

const Icon = {
  Bell: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
  Menu: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M3 6h18M3 12h18M3 18h18" />
    </svg>
  ),
  ChevronDown: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  ),
  ChevronRight: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  ),
  Users: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  ClipboardList: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 3h6a1 1 0 0 1 1 1v1H8V4a1 1 0 0 1 1-1Z" />
      <path d="M9 11h6M9 15h4" />
    </svg>
  ),
  FileText: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h6" />
    </svg>
  ),
  TrendUp: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M17 7h4v4" />
    </svg>
  ),
  Plus: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  Upload: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 3v12M7 8l5-5 5 5" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  ),
  Star: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14 2 9.27l6.91-1.01L12 2Z" />
    </svg>
  ),
  BarChart: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M3 3v18h18" />
      <path d="M7 16v-4M12 16V8M17 16v-7" />
    </svg>
  ),
  MessageCircle: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />
    </svg>
  ),
  Megaphone: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M3 11v3a1 1 0 0 0 1 1h2l3.5 5V5.5L6 10H4a1 1 0 0 0-1 1Z" />
      <path d="M14 8a3 3 0 0 1 0 8M18 5a7 7 0 0 1 0 14" />
    </svg>
  ),
  Home: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5 10v10h14V10" />
    </svg>
  ),
  Grid: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  ),
  Shield: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z" />
    </svg>
  ),
};

const STATUS_STYLES = {
  ongoing: 'bg-emerald-100 text-emerald-700',
  next: 'bg-blue-100 text-blue-700',
  upcoming: 'bg-slate-100 text-slate-600',
  done: 'bg-slate-100 text-slate-400',
};

const QUICK_ACTION_STYLES = {
  green: 'bg-emerald-50 text-emerald-600',
  blue: 'bg-blue-50 text-blue-600',
  violet: 'bg-violet-50 text-violet-600',
  amber: 'bg-amber-50 text-amber-600',
  cyan: 'bg-cyan-50 text-cyan-600',
};

function StatCard({ icon: Icn, iconBg, iconColor, value, label, sublabel }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-[32px] font-bold leading-none text-slate-900">{value}</p>
        <div className={`mb-0 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${iconBg}`}>
          <Icn className={`h-5 w-5 ${iconColor}`} />
        </div>
      </div>
      <p className="mt-6 text-[14px] font-medium" style={{ color: '#2D3748' }}>{label}</p>
      {sublabel && <p className="mt-1 text-[12px]" style={{ color: '#9AA0A6' }}>{sublabel}</p>}
    </div>
  )
}

function ScheduleRow({ index, period, isLast }) {
  const isOngoing = period.status === 'ongoing';
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
            isOngoing ? 'bg-emerald-500 text-white' : 'border border-slate-200 bg-white text-slate-500'
          }`}
        >
          {index}
        </div>
        {!isLast && <div className="w-px flex-1 bg-slate-200" />}
      </div>
      <div
        className={`mb-3 flex flex-1 items-center justify-between rounded-xl px-4 py-3 ${
          isOngoing ? 'bg-emerald-50' : 'bg-white border border-slate-100'
        }`}
      >
        <div className="flex gap-4">
          <div className="w-16 shrink-0">
            <p className="text-sm font-semibold text-slate-900">{period.startTime}</p>
            <p className="text-xs text-slate-400">{period.endTime}</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">{period.subject}</p>
            <p className="text-xs text-slate-500">
              {period.className} &middot; Room {period.room}
            </p>
          </div>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${STATUS_STYLES[period.status] || STATUS_STYLES.upcoming}`}>
          {period.status}
        </span>
      </div>
    </div>
  );
}

const NAV_ITEMS = [
  { key: 'home', label: 'Home', icon: Icon.Home },
  { key: 'classes', label: 'My classes', icon: Icon.Users },
  { key: 'assignments', label: 'Assignments', icon: Icon.ClipboardList, badgeKey: 'pendingAssignments' },
  { key: 'students', label: 'Students', icon: Icon.Users },
  { key: 'more', label: 'More', icon: Icon.Grid },
];

export default function TeacherAppHome({
  teacher = { name: '', subjectRole: '', avatarUrl: null },
  school = { name: '', options: [] },
  stats = { myClasses: 0, todaysLessons: 0, pendingAssignments: 0, attendanceAverage: 0 },
  schedule = [],
  quickActions = [],
  announcements = [],
  unreadNotifications = 0,
  activeNav = 'home',
  onSelectNav = () => {},
  onSelectSchool = () => {},
  onQuickAction = () => {},
  onViewTimetable = () => {},
  onViewAllAnnouncements = () => {},
}) {
  const [schoolMenuOpen, setSchoolMenuOpen] = useState(false);
  const [faOpen, setFaOpen] = useState(false);

  const defaultQuickActions = [
    { key: 'take-attendance', label: 'Take attendance', icon: Icon.Users, color: 'green' },
    { key: 'create-assignment', label: 'Create assignment', icon: Icon.FileText, color: 'blue' },
    { key: 'upload-resources', label: 'Upload resources', icon: Icon.Upload, color: 'violet' },
    { key: 'enter-grades', label: 'Enter grades', icon: Icon.Star, color: 'amber' },
    { key: 'view-reports', label: 'View reports', icon: Icon.BarChart, color: 'cyan' },
    { key: 'send-message', label: 'Send message', icon: Icon.MessageCircle, color: 'green' },
  ];
  const actions = quickActions.length ? quickActions : defaultQuickActions;

  return (
    <div className="mx-auto min-h-screen max-w-md bg-slate-50 font-sans">
      <header className="flex items-center justify-between px-5 py-4">
        <button aria-label="Open menu" className="text-slate-700">
          <Icon.Menu className="h-6 w-6" />
        </button>
        <p className="text-lg font-bold text-slate-900">ShulePulse</p>
        <button aria-label="Notifications" className="relative text-slate-700">
          <Icon.Bell className="h-6 w-6" />
          {unreadNotifications > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-semibold text-white">
              {unreadNotifications}
            </span>
          )}
        </button>
      </header>

      <div className="mx-4 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-500 p-5 text-white">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-blue-100">Good morning,</p>
            <p className="text-xl font-bold leading-tight">{teacher.name}</p>
            <p className="mt-2 text-sm text-blue-100">Here's what's happening in your classes today.</p>
          </div>
          <AvatarUpload size={64} fallbackChar="T" className="shrink-0 rounded-full border-2 border-white/60 overflow-hidden" />
        </div>
        {teacher.subjectRole && (
          <span className="mt-3 inline-block rounded-full bg-emerald-500 px-3 py-1 text-xs font-semibold">{teacher.subjectRole}</span>
        )}

        <div className="relative mt-4">
          <button
            onClick={() => setSchoolMenuOpen((v) => !v)}
            className="flex w-full items-center justify-between rounded-xl bg-white/95 px-4 py-3 text-slate-800"
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              <Icon.Shield className="h-4 w-4 text-blue-500" />
              {school.name}
            </span>
            <Icon.ChevronDown className="h-4 w-4 text-slate-400" />
          </button>
          {schoolMenuOpen && school.options?.length > 0 && (
            <div className="absolute z-10 mt-1 w-full rounded-xl border border-slate-100 bg-white py-1 shadow-lg">
              {school.options.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => {
                    onSelectSchool(opt);
                    setSchoolMenuOpen(false);
                  }}
                  className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                >
                  {opt.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 px-4 pt-4">
        <StatCard icon={Icon.Users} iconBg="bg-blue-50" iconColor="text-blue-500" value={stats.myClasses} label="My classes" sublabel="Active" />
        <StatCard icon={Icon.ClipboardList} iconBg="bg-emerald-50" iconColor="text-emerald-500" value={stats.todaysLessons} label="Today's lessons" sublabel="Periods" />
        <StatCard icon={Icon.FileText} iconBg="bg-violet-50" iconColor="text-violet-500" value={stats.pendingAssignments} label="Pending assignments" />
        <StatCard icon={Icon.TrendUp} iconBg="bg-amber-50" iconColor="text-amber-500" value={`${stats.attendanceAverage}%`} label="Attendance" sublabel="Average" />
      </div>

      <div className="mx-4 mt-4 rounded-2xl border border-slate-100 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-base font-bold text-slate-900">Today's schedule</p>
          <button onClick={onViewTimetable} className="text-sm font-medium text-blue-600">
            View timetable
          </button>
        </div>
        {schedule.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">No lessons scheduled for today.</p>
        ) : (
          schedule.map((period, i) => (
            <ScheduleRow key={period.id ?? i} index={i + 1} period={period} isLast={i === schedule.length - 1} />
          ))
        )}
      </div>

      {/* Floating action button (replaces Quick actions card) */}
      {faOpen && (
        <div className="fixed z-30 bottom-32 right-4 w-56 rounded-2xl border border-slate-100 bg-white p-2 shadow-xl">
          {actions.map((action) => {
            const ActionIcon = action.icon;
            return (
              <button
                key={action.key}
                onClick={() => {
                  onQuickAction(action.key);
                  setFaOpen(false);
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-slate-50"
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${QUICK_ACTION_STYLES[action.color] || QUICK_ACTION_STYLES.blue}`}>
                  <ActionIcon className="h-4 w-4" />
                </span>
                <span className="text-sm font-medium text-slate-700">{action.label}</span>
              </button>
            );
          })}
        </div>
      )}

      <button
        aria-label="Quick actions"
        onClick={() => setFaOpen((v) => !v)}
        className="fixed z-40 bottom-24 right-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg transition-transform active:scale-95"
      >
        <Icon.Plus className={`h-6 w-6 transition-transform ${faOpen ? 'rotate-45' : ''}`} />
      </button>

      <div className="mx-4 my-4 rounded-2xl border border-slate-100 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-base font-bold text-slate-900">Announcements</p>
          <button onClick={onViewAllAnnouncements} className="text-sm font-medium text-blue-600">
            View all
          </button>
        </div>
        {announcements.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">No announcements yet.</p>
        ) : (
          announcements.map((a, i) => (
            <button key={a.id ?? i} className="flex w-full items-start gap-3 border-t border-slate-100 py-3 text-left first:border-t-0">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-500">
                <Icon.Megaphone className="h-4 w-4" />
              </span>
              <span className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900">{a.title}</p>
                <p className="line-clamp-2 text-xs text-slate-500">{a.body}</p>
                <p className="mt-1 text-xs text-slate-400">
                  By {a.author} &middot; {a.timeAgo}
                </p>
              </span>
              <Icon.ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-300" />
            </button>
          ))
        )}
      </div>

      <nav className="sticky bottom-0 flex justify-around border-t border-slate-100 bg-white px-2 py-2 pb-[env(safe-area-inset-bottom)]">
        {NAV_ITEMS.map((item) => {
          const ItemIcon = item.icon;
          const active = activeNav === item.key;
          const badge = item.badgeKey ? stats[item.badgeKey] : null;
          return (
            <button
              key={item.key}
              onClick={() => onSelectNav(item.key)}
              className={`relative flex flex-col items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium ${
                active ? 'text-blue-600' : 'text-slate-400'
              }`}
            >
              <span className={`relative flex h-9 w-14 items-center justify-center rounded-lg ${active ? 'bg-blue-50' : ''}`}>
                <ItemIcon className="h-5 w-5" />
                {badge > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-semibold text-white">
                    {badge}
                  </span>
                )}
              </span>
              {item.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
