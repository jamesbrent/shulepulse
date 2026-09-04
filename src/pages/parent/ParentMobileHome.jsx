import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import TeacherAppHome from '../teacher/TeacherAppHome'
import { groupGradesBySubject } from '../../components/students/ReportCard'

function timeAgo(isoDate) {
  const seconds = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000)
  if (!isFinite(seconds) || seconds < 0) return 'just now'
  const units = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ]
  for (const [name, secs] of units) {
    const v = Math.floor(seconds / secs)
    if (v >= 1) return `${v} ${name}${v > 1 ? 's' : ''} ago`
  }
  return 'just now'
}

export default function ParentMobileHome({ activeChild, school, children, profile, onNavigate }) {
  const [stats, setStats] = useState({ myClasses: 0, todaysLessons: 0, pendingAssignments: 0, attendanceAverage: 0 })
  const [announcements, setAnnouncements] = useState([])

  useEffect(() => {
    if (activeChild && school) fetchHome()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChild, school])

  const fetchHome = async () => {
    const currentTerm = school?.current_term || 'Term 1'
    const currentYear = school?.current_year || new Date().getFullYear()
    const schoolId = school?.id

    const [{ data: gradesData }, { data: noticesData }] = await Promise.all([
      schoolId
        ? supabase
            .from('grades')
            .select('*')
            .eq('student_id', activeChild.id)
            .eq('term', currentTerm)
            .eq('year', currentYear)
            .in('status', ['approved', 'published'])
            .order('created_at', { ascending: false })
        : { data: [] },
      schoolId
        ? supabase
            .from('notices')
            .select('*, profiles(full_name)')
            .eq('school_id', schoolId)
            .order('created_at', { ascending: false })
            .limit(20)
        : { data: [] },
    ])

    const childIds = new Set((children || []).map(c => c.id))
    const visibleNotices = (noticesData || [])
      .filter(n => !n.student_id || childIds.has(n.student_id))
      .slice(0, 3)

    setAnnouncements(
      (visibleNotices).map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        author: n.profiles?.full_name || 'School',
        timeAgo: timeAgo(n.created_at),
      }))
    )

    const [assessmentsRes, ledgerRes, creditRes] = await Promise.all([
      supabase
        .from('fee_assessments')
        .select('amount_due')
        .eq('student_id', activeChild.id)
        .eq('term', currentTerm)
        .eq('year', currentYear),
      supabase
        .from('student_ledger')
        .select('entry_type, amount')
        .eq('student_id', activeChild.id)
        .eq('term', currentTerm)
        .eq('year', currentYear),
      schoolId
        ? supabase.rpc('student_credit_balance', { p_school_id: schoolId, p_student_id: activeChild.id })
        : { data: 0 },
    ])

    const totalCharged = (assessmentsRes.data || []).reduce((s, a) => s + Number(a.amount_due), 0)
    const totalPaid = (ledgerRes.data || []).reduce((s, l) => {
      if (l.entry_type === 'charge' || l.entry_type === 'penalty') return s
      return s + Number(l.amount || 0)
    }, 0)
    const credit = Number(creditRes.data || 0)
    const balance = Math.max(0, totalCharged - totalPaid)

    const [{ count: presentCount }, { count: totalCount }] = await Promise.all([
      supabase
        .from('attendance')
        .select('*', { count: 'exact', head: true })
        .eq('student_id', activeChild.id)
        .eq('status', 'present'),
      supabase
        .from('attendance')
        .select('*', { count: 'exact', head: true })
        .eq('student_id', activeChild.id),
    ])

    const avgScore = groupGradesBySubject(gradesData || []).overallAverage || 0

    setStats({
      myClasses: children?.length || 0,
      todaysLessons: `${Math.round(avgScore)}%`,
      pendingAssignments: `KES ${balance.toLocaleString()}`,
      attendanceAverage: totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0,
    })
  }

  const childClass = [activeChild?.full_name, [activeChild?.class, activeChild?.stream].filter(Boolean).join(' ').trim()].filter(Boolean).join(' · ')

  return (
    <TeacherAppHome
      hideHeader
      hideNav
      hideScheduleCard
      hideFAB
      teacher={{
        name: profile?.full_name || 'Parent',
        subjectRole: '',
        avatarUrl: profile?.avatar_url || null,
      }}
      school={{ name: school?.name || '', options: [] }}
      heroText="Here's an at-a-glance view of school life."
      heroBadge={childClass || undefined}
      greeting="Welcome back,"
      stats={stats}
      statMeta={{
        myClasses: { label: 'My Children', sublabel: 'Linked' },
        todaysLessons: { label: 'Average', sublabel: 'Grade' },
        pendingAssignments: { label: 'Fee Balance', sublabel: null },
        attendanceAverage: { label: 'Attendance', sublabel: 'Rate' },
      }}
      announcements={announcements}
      onSelectNav={onNavigate}
      onViewAllAnnouncements={() => onNavigate('notices')}
    />
  )
}
