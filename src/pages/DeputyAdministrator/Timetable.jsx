import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Calendar, Plus, Trash2, Save, CheckCircle,
  BookOpen, Clock, Users, Edit2, X, Grid, List,
  Download, AlertTriangle, RefreshCw, User,
  ChevronDown, ChevronRight, ChevronLeft, Zap, Eye, Settings,
  BarChart2, GraduationCap, Layers, Filter
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'
import '../admin/TimetablePage.css'
import '../teacher/TimetablePage.css'

// ── Constants ────────────────────────────────────────────────
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
const DAY_SHORT = { Monday: 'MON', Tuesday: 'TUE', Wednesday: 'WED', Thursday: 'THUR', Friday: 'FRI' }

// ── CBC Level Classification ──────────────────────────────────
// Maps a class name/level string → CBC band
const getCBCBand = (classNameOrLevel = '') => {
  const v = classNameOrLevel.toUpperCase()
  if (v.includes('PP1') || v.includes('PP 1') || v.includes('PRE-PRIMARY 1') || v.includes('PREPRIMARY 1')) return 'PP'
  if (v.includes('PP2') || v.includes('PP 2') || v.includes('PRE-PRIMARY 2') || v.includes('PREPRIMARY 2')) return 'PP'
  if (v.includes('GRADE 1') || v.includes('GR1') || v.includes('G1') ||
      v.includes('GRADE 2') || v.includes('GR2') || v.includes('G2') ||
      v.includes('GRADE 3') || v.includes('GR3') || v.includes('G3')) return 'LOWER_PRIMARY'
  if (v.includes('GRADE 4') || v.includes('GR4') || v.includes('G4') ||
      v.includes('GRADE 5') || v.includes('GR5') || v.includes('G5') ||
      v.includes('GRADE 6') || v.includes('GR6') || v.includes('G6')) return 'UPPER_PRIMARY'
  if (v.includes('GRADE 7') || v.includes('GR7') || v.includes('G7') ||
      v.includes('GRADE 8') || v.includes('GR8') || v.includes('G8') ||
      v.includes('GRADE 9') || v.includes('GR9') || v.includes('G9') ||
      v.includes('JUNIOR')) return 'JUNIOR'
  if (v.includes('GRADE 10') || v.includes('GR10') || v.includes('G10') ||
      v.includes('GRADE 11') || v.includes('GR11') || v.includes('G11') ||
      v.includes('SENIOR')) return 'SENIOR'
  return null
}

// Lesson duration in minutes per band
const BAND_LESSON_DURATION = {
  PP:            30,
  LOWER_PRIMARY: 35,
  UPPER_PRIMARY: 35,
  JUNIOR:        40,
  SENIOR:        40,
}

// ── TIME SLOTS per CBC band ───────────────────────────────────
// PP  : 5 lessons/day × 30 min
// Lower/Upper Primary : up to 7 lessons/day × 35 min (actual count driven by weekly reqs)
// Junior/Senior       : 8 lessons/day × 40 min

const TIME_SLOTS_BY_BAND = {
  // ── Pre-Primary (PP1 & PP2) ── 5 lessons × 30 min ──────────
  PP: [
    { key: 'p1',  label: '8:00–8:30',   start: '08:00', end: '08:30', type: 'lesson', period: 1 },
    { key: 'p2',  label: '8:30–9:00',   start: '08:30', end: '09:00', type: 'lesson', period: 2 },
    { key: 'sb',  label: '9:00–9:20',   start: '09:00', end: '09:20', type: 'break',  breakLabel: 'SHORT BREAK' },
    { key: 'p3',  label: '9:20–9:50',   start: '09:20', end: '09:50', type: 'lesson', period: 3 },
    { key: 'lb',  label: '9:50–10:20',  start: '09:50', end: '10:20', type: 'break',  breakLabel: 'LONG BREAK' },
    { key: 'p4',  label: '10:20–10:50', start: '10:20', end: '10:50', type: 'lesson', period: 4 },
    { key: 'lun', label: '10:50–12:00', start: '10:50', end: '12:00', type: 'break',  breakLabel: 'LUNCH BREAK' },
    { key: 'p5',  label: '12:00–12:30', start: '12:00', end: '12:30', type: 'lesson', period: 5 },
  ],

  // ── Lower Primary (Grade 1-3) & Upper Primary (Grade 4-6) ── up to 7 lessons × 35 min ──
  PRIMARY: [
    { key: 'p1',  label: '8:00–8:35',   start: '08:00', end: '08:35', type: 'lesson', period: 1 },
    { key: 'p2',  label: '8:35–9:10',   start: '08:35', end: '09:10', type: 'lesson', period: 2 },
    { key: 'sb',  label: '9:10–9:30',   start: '09:10', end: '09:30', type: 'break',  breakLabel: 'SHORT BREAK' },
    { key: 'p3',  label: '9:30–10:05',  start: '09:30', end: '10:05', type: 'lesson', period: 3 },
    { key: 'p4',  label: '10:05–10:40', start: '10:05', end: '10:40', type: 'lesson', period: 4 },
    { key: 'lb',  label: '10:40–11:10', start: '10:40', end: '11:10', type: 'break',  breakLabel: 'LONG BREAK' },
    { key: 'p5',  label: '11:10–11:45', start: '11:10', end: '11:45', type: 'lesson', period: 5 },
    { key: 'p6',  label: '11:45–12:20', start: '11:45', end: '12:20', type: 'lesson', period: 6 },
    { key: 'lun', label: '12:20–1:20',  start: '12:20', end: '13:20', type: 'break',  breakLabel: 'LUNCH BREAK' },
    { key: 'p7',  label: '1:20–1:55',   start: '13:20', end: '13:55', type: 'lesson', period: 7 },
  ],

  // ── Junior School (Grade 7-9) & Senior School (Grade 10-11) ── 8 lessons × 40 min ──
  SECONDARY: [
    { key: 'p1',  label: '8:00–8:40',   start: '08:00', end: '08:40', type: 'lesson', period: 1 },
    { key: 'p2',  label: '8:40–9:20',   start: '08:40', end: '09:20', type: 'lesson', period: 2 },
    { key: 'sb',  label: '9:20–9:30',   start: '09:20', end: '09:30', type: 'break',  breakLabel: 'SHORT BREAK' },
    { key: 'p3',  label: '9:30–10:10',  start: '09:30', end: '10:10', type: 'lesson', period: 3 },
    { key: 'p4',  label: '10:10–10:50', start: '10:10', end: '10:50', type: 'lesson', period: 4 },
    { key: 'lb',  label: '10:50–11:20', start: '10:50', end: '11:20', type: 'break',  breakLabel: 'LONG BREAK' },
    { key: 'p5',  label: '11:20–12:00', start: '11:20', end: '12:00', type: 'lesson', period: 5 },
    { key: 'p6',  label: '12:00–12:40', start: '12:00', end: '12:40', type: 'lesson', period: 6 },
    { key: 'lun', label: '12:40–2:00',  start: '12:40', end: '14:00', type: 'break',  breakLabel: 'LUNCH BREAK' },
    { key: 'p7',  label: '2:00–2:40',   start: '14:00', end: '14:40', type: 'lesson', period: 7 },
    { key: 'p8',  label: '2:40–3:20',   start: '14:40', end: '15:20', type: 'lesson', period: 8 },
  ],
}

// Default fallback (used by the generic grid when no class is selected)
const TIME_SLOTS = TIME_SLOTS_BY_BAND.SECONDARY
const LESSON_SLOTS = TIME_SLOTS.filter(s => s.type === 'lesson')

// Helper: get band-appropriate time slots for a given class/level string
const getTimeSlotsForBand = (classNameOrLevel) => {
  const band = getCBCBand(classNameOrLevel || '')
  if (band === 'PP') return TIME_SLOTS_BY_BAND.PP
  if (band === 'LOWER_PRIMARY' || band === 'UPPER_PRIMARY') return TIME_SLOTS_BY_BAND.PRIMARY
  if (band === 'JUNIOR' || band === 'SENIOR') return TIME_SLOTS_BY_BAND.SECONDARY
  return TIME_SLOTS_BY_BAND.SECONDARY // default
}

const SUBJECT_COLOURS = [
  '#dbeafe', '#fce7f3', '#dcfce7', '#fef9c3', '#ede9fe',
  '#ffedd5', '#e0f2fe', '#f0fdf4', '#fdf2f8', '#fef3c7',
]
const subjectColour = (() => {
  const cache = {}
  let idx = 0
  return (subjectName) => {
    if (!subjectName) return '#f1f5f9'
    if (!cache[subjectName]) cache[subjectName] = SUBJECT_COLOURS[idx++ % SUBJECT_COLOURS.length]
    return cache[subjectName]
  }
})()

const LEVEL_GROUPS = [
  { label: 'All Levels', value: '' },
  { label: 'PP1', value: 'PP1' },
  { label: 'PP2', value: 'PP2' },
  { label: 'Grade 1', value: 'Grade 1' },
  { label: 'Grade 2', value: 'Grade 2' },
  { label: 'Grade 3', value: 'Grade 3' },
  { label: 'Grade 4', value: 'Grade 4' },
  { label: 'Grade 5', value: 'Grade 5' },
  { label: 'Grade 6', value: 'Grade 6' },
  { label: 'Grade 7', value: 'Grade 7' },
  { label: 'Grade 8', value: 'Grade 8' },
  { label: 'Grade 9', value: 'Grade 9' },
  { label: 'Grade 10', value: 'Grade 10' },
  { label: 'Grade 11', value: 'Grade 11' },
  { label: 'Grade 12', value: 'Grade 12' },
]

// ── CBC Weekly Lesson Requirements ───────────────────────────
// Sources:
//  PP1/PP2        : 25 lessons/wk × 30 min  (5/day)
//  Lower Primary  : 31 lessons/wk × 35 min
//  Upper Primary  : 35 lessons/wk × 35 min  (7/day + 1 Pastoral/wk)
//  Junior School  : 40 lessons/wk × 40 min  (8/day)
//  Senior School  : 40 lessons/wk × 40 min  (8/day)

const CBC_REQUIREMENTS = {
  // ── Pre-Primary ─────────────────────────────────────────
  // 25 lessons/wk  |  5 lessons/day  |  30 min/lesson
  'PP1': {
    'Language Activities':     5,
    'Mathematical Activities': 5,
    'Creative Activities':     6,
    'Environmental Activities':5,
    'Religious Activities':    3,
    // Total: 24 instructional + 1 Pastoral = 25
    'Pastoral Programme':      1,
  },
  'PP2': {
    'Language Activities':     5,
    'Mathematical Activities': 5,
    'Creative Activities':     6,
    'Environmental Activities':5,
    'Religious Activities':    3,
    'Pastoral Programme':      1,
  },

  // ── Lower Primary ───────────────────────────────────────
  // 31 lessons/wk  |  35 min/lesson
  'Grade 1': {
    'English':              5,
    'Kiswahili/KSL':        4,
    'Mathematics':          5,
    'Creative Activities':  7,
    'Environmental Activities': 4,
    'Religious Education':  3,
    'Indigenous Language':  2,
    'Pastoral Programme':   1,
    // Total: 31
  },
  'Grade 2': {
    'English':              5,
    'Kiswahili/KSL':        4,
    'Mathematics':          5,
    'Creative Activities':  7,
    'Environmental Activities': 4,
    'Religious Education':  3,
    'Indigenous Language':  2,
    'Pastoral Programme':   1,
  },
  'Grade 3': {
    'English':              5,
    'Kiswahili/KSL':        4,
    'Mathematics':          5,
    'Creative Activities':  7,
    'Environmental Activities': 4,
    'Religious Education':  3,
    'Indigenous Language':  2,
    'Pastoral Programme':   1,
  },

  // ── Upper Primary ───────────────────────────────────────
  // 35 lessons/wk  |  7/day + 1 weekly Pastoral  |  35 min/lesson
  // 7 rationalised learning areas distributed across the week
  'Grade 4': {
    'English':              5,
    'Kiswahili':            5,
    'Mathematics':          5,
    'Creative Activities':  6,
    'Environmental Activities': 4,
    'Religious Education':  3,
    'Social Studies':       3,
    'Science & Technology': 3,
    'Pastoral Programme':   1,
    // Total: 35
  },
  'Grade 5': {
    'English':              5,
    'Kiswahili':            5,
    'Mathematics':          5,
    'Creative Activities':  6,
    'Environmental Activities': 4,
    'Religious Education':  3,
    'Social Studies':       3,
    'Science & Technology': 3,
    'Pastoral Programme':   1,
  },
  'Grade 6': {
    'English':              5,
    'Kiswahili':            5,
    'Mathematics':          5,
    'Creative Activities':  6,
    'Environmental Activities': 4,
    'Religious Education':  3,
    'Social Studies':       3,
    'Science & Technology': 3,
    'Pastoral Programme':   1,
  },

  // ── Junior School ───────────────────────────────────────
  // 40 lessons/wk  |  8/day  |  40 min/lesson
  'Grade 7': {
    'English':              5,
    'Kiswahili':            4,
    'Mathematics':          5,
    'Integrated Science':   5,
    'Creative Arts & Sports':5,
    'Social Studies':       4,
    'Agriculture & Nutrition': 4,
    'Pre-Technical Studies':4,
    'Religious Education':  3,
    'Pastoral Programme':   1,
    // Total: 40
  },
  'Grade 8': {
    'English':              5,
    'Kiswahili':            4,
    'Mathematics':          5,
    'Integrated Science':   5,
    'Creative Arts & Sports':5,
    'Social Studies':       4,
    'Agriculture & Nutrition': 4,
    'Pre-Technical Studies':4,
    'Religious Education':  3,
    'Pastoral Programme':   1,
  },
  'Grade 9': {
    'English':              5,
    'Kiswahili':            4,
    'Mathematics':          5,
    'Integrated Science':   5,
    'Creative Arts & Sports':5,
    'Social Studies':       4,
    'Agriculture & Nutrition': 4,
    'Pre-Technical Studies':4,
    'Religious Education':  3,
    'Pastoral Programme':   1,
  },

  // ── Senior School ───────────────────────────────────────
  // 40 lessons/wk  |  8/day  |  40 min/lesson
  // Core + pathway (Arts & Sports / Social Sciences / STEM) + electives + support
  'Grade 10': {
    // Core subjects
    'English':              4,
    'Kiswahili':            4,
    'Mathematics':          4,
    // Pathway subjects (3 pathway subjects, school/student selects track)
    'Pathway Subject 1':    4,
    'Pathway Subject 2':    4,
    'Pathway Subject 3':    4,
    // Elective
    'Elective':             4,
    // Compulsory support
    'Physical Education':   3,
    'ICT':                  2,
    'Community Service Learning': 3,
    'Pastoral Programme':   1,
    // Guidance & Personal Study (advisory — not scheduled as a formal lesson block)
    // Total: 37 + 3 = 40
    'Guidance & Counselling': 3,
  },
  'Grade 11': {
    'English':              4,
    'Kiswahili':            4,
    'Mathematics':          4,
    'Pathway Subject 1':    4,
    'Pathway Subject 2':    4,
    'Pathway Subject 3':    4,
    'Elective':             4,
    'Physical Education':   3,
    'ICT':                  2,
    'Community Service Learning': 3,
    'Pastoral Programme':   1,
    'Guidance & Counselling': 3,
  },

  // ── Legacy / alias keys (for CBC quick-fill detection) ───
  'Junior': {
    'English':              5,
    'Kiswahili':            4,
    'Mathematics':          5,
    'Integrated Science':   5,
    'Creative Arts & Sports':5,
    'Social Studies':       4,
    'Agriculture & Nutrition': 4,
    'Pre-Technical Studies':4,
    'Religious Education':  3,
    'Pastoral Programme':   1,
  },
  'Senior': {
    'English':              4,
    'Kiswahili':            4,
    'Mathematics':          4,
    'Pathway Subject 1':    4,
    'Pathway Subject 2':    4,
    'Pathway Subject 3':    4,
    'Elective':             4,
    'Physical Education':   3,
    'ICT':                  2,
    'Community Service Learning': 3,
    'Pastoral Programme':   1,
    'Guidance & Counselling': 3,
  },
}

// Subjects that should not be consecutive (KICD soft rule)
const COGNITIVE_GROUPS = {
  language: [
    'English', 'Kiswahili', 'Kiswahili/KSL', 'Language Activities', 'Indigenous Language',
  ],
  math: [
    'Mathematics', 'Mathematical Activities', 'Integrated Science', 'Science & Technology',
    'Biology', 'Chemistry', 'Physics',
  ],
  creative: [
    'Creative Arts', 'Creative Arts & Sports', 'Creative Activities',
    'Art', 'Music', 'Drama', 'Physical Education',
  ],
  practical: [
    'Agriculture', 'Agriculture & Nutrition', 'Pre-Technical Studies',
    'Home Science', 'ICT',
  ],
  humanities: [
    'Social Studies', 'Religious Education', 'Religious Activities',
    'Environmental Activities', 'Community Service Learning',
  ],
}

// Core subjects — MUST be scheduled in morning periods only (periods 1–4)
// KICD/CBC guideline: high-cognitive subjects when learners are most alert
const CORE_SUBJECTS = [
  'Mathematics', 'Mathematical Activities',
  'English', 'Language Activities',
  'Kiswahili', 'Kiswahili/KSL',
  'Integrated Science', 'Science & Technology', 'Science',
  'Biology', 'Chemistry', 'Physics',
]

// Morning = periods 1–4 (before long break & lunch). Afternoon = periods 5+
const MORNING_PERIODS = [1, 2, 3, 4]
const AFTERNOON_PERIODS = [5, 6, 7, 8, 9]

// Pastoral/support subjects — can only be scheduled once per week (period 7+ preferred)
const PASTORAL_SUBJECTS = [
  'Pastoral Programme', 'Guidance & Counselling', 'Guidance & Personal Study',
  'Community Service Learning',
]
const isPastoralSubject = (name) =>
  PASTORAL_SUBJECTS.some(p => name?.toLowerCase().includes(p.toLowerCase()))

const isCoreSubject = (subjectName) =>
  CORE_SUBJECTS.some(s => subjectName?.toLowerCase().includes(s.toLowerCase()))

// ── CSP Timetable Engine ─────────────────────────────────────
function buildTimetable(classes, teachers, subjects, subjectAssignments, classRequirements, teacherAssignments) {
  const slots = []
  const conflicts = []
  const teacherDayCount = {}   // teacherId -> day -> count
  const teacherWeekCount = {}  // teacherId -> count
  const classSlotMap = {}      // classId_day_period -> true (occupied)
  const teacherSlotMap = {}    // teacherId_day_period -> true (occupied)

  const getKey = (classId, day, period) => `${classId}_${day}_${period}`
  const getTKey = (teacherId, day, period) => `${teacherId}_${day}_${period}`

  // Helper: check if a subject should be placed before a break (soft rule)
  const isCreativeOrPractical = (subjectName) => {
    return COGNITIVE_GROUPS.creative.some(s => subjectName?.toLowerCase().includes(s.toLowerCase())) ||
      COGNITIVE_GROUPS.practical.some(s => subjectName?.toLowerCase().includes(s.toLowerCase()))
  }

  // Helper: get cognitive group of a subject
  const getCogGroup = (subjectName) => {
    for (const [group, names] of Object.entries(COGNITIVE_GROUPS)) {
      if (names.some(n => subjectName?.toLowerCase().includes(n.toLowerCase()))) return group
    }
    return 'other'
  }

  // For each class, schedule required lessons
  for (const cls of classes) {
    const reqs = classRequirements.filter(r => r.class_id === cls.id)

    // Determine this class's CBC band and available lesson slots
    const classBandStr = cls.level || cls.class_name || ''
    const classLessonSlots = getTimeSlotsForBand(classBandStr).filter(s => s.type === 'lesson')
    const classMorningPeriods = [1, 2, 3, 4]
    const classAfternoonPeriods = classLessonSlots
      .map(s => s.period)
      .filter(p => !classMorningPeriods.includes(p))

    // Flatten: list all lesson instances needed
    const lessonQueue = []
    for (const req of reqs) {
      const subj = subjects.find(s => s.id === req.subject_id)
      if (!subj) continue
      // Find eligible teachers for this subject in this class's school
      const eligibleTeachers = teacherAssignments
        .filter(ta => ta.subject_id === req.subject_id)
        .map(ta => teachers.find(t => t.id === ta.teacher_id))
        .filter(Boolean)
        .filter(t => t.school_id === cls.school_id && t.active_status !== false)

      for (let i = 0; i < (req.lessons_per_week || 0); i++) {
        lessonQueue.push({ subject: subj, eligibleTeachers, req })
      }
    }

    // Shuffle to distribute across week evenly
    lessonQueue.sort(() => Math.random() - 0.5)

    // Track placed subjects per day for this class (soft constraint)
    const classSubjectDayMap = {} // subjectId_day -> count

    // Score a slot (lower = better)
    const scoreSlot = (day, period, subject) => {
      let score = 0
      const subjDayKey = `${subject.id}_${day}`

      // Penalise repeating same subject on same day
      if (classSubjectDayMap[subjDayKey]) score += 10 * classSubjectDayMap[subjDayKey]

      // Pastoral/support subjects: prefer last period of day (highest period in classLessonSlots)
      if (isPastoralSubject(subject.name)) {
        const maxPeriod = Math.max(...classLessonSlots.map(s => s.period))
        score += (maxPeriod - period) * 5  // lower score = closer to end
        return score
      }

      // Core subjects: strongly prefer earlier morning periods
      if (isCoreSubject(subject.name)) {
        if (classMorningPeriods.includes(period)) {
          score -= (5 - period) * 3  // p1 best
        } else {
          score += 999  // blocked — hard constraint also blocks this
        }
      }

      // Prefer creative/practical before break periods
      if (isCreativeOrPractical(subject.name) && [2, 4, 6].includes(period)) score -= 5

      // Spread across week — prefer days with fewer lessons for this class
      const classLoading = slots.filter(s => s.class_id === cls.id && s.day === day).length
      score += classLoading * 2

      // Penalise heavy subject clustering
      const prevSlotSubj = slots.find(s =>
        s.class_id === cls.id && s.day === day && s.period === period - 1
      )
      if (prevSlotSubj) {
        const prevGroup = getCogGroup(prevSlotSubj.subject_name)
        const currGroup = getCogGroup(subject.name)
        if (prevGroup === currGroup && currGroup !== 'other') score += 8

        // Language pair not back to back
        const langPair = ['english', 'kiswahili', 'kiswahili/ksl', 'language activities']
        if (
          langPair.some(l => prevSlotSubj.subject_name?.toLowerCase().includes(l)) &&
          langPair.some(l => subject.name?.toLowerCase().includes(l))
        ) score += 20
      }

      return score
    }

    // Try to place each lesson
    for (const lesson of lessonQueue) {
      let placed = false
      // Build all candidate slots
      const candidates = []
      for (const day of DAYS) {
        for (const ts of classLessonSlots) {
          const cKey = getKey(cls.id, day, ts.period)
          if (classSlotMap[cKey]) continue // class occupied

          // Check double-lesson rule for non-practicals
          const isDouble = lesson.subject.category === 'practical'
          if (!isDouble) {
            const prevSubj = slots.find(s => s.class_id === cls.id && s.day === day && s.period === ts.period - 1)
            if (prevSubj && prevSubj.subject_id === lesson.subject.id) continue
            const nextSubj = slots.find(s => s.class_id === cls.id && s.day === day && s.period === ts.period + 1)
            if (nextSubj && nextSubj.subject_id === lesson.subject.id) continue
          }

          // Hard constraint: core subjects → morning periods only
          if (isCoreSubject(lesson.subject.name) && !classMorningPeriods.includes(ts.period)) continue

          candidates.push({ day, ts, score: scoreSlot(day, ts.period, lesson.subject) })
        }
      }

      // Sort by score
      candidates.sort((a, b) => a.score - b.score)

      // Try each candidate, find available teacher
      for (const cand of candidates) {
        if (placed) break
        const { day, ts } = cand

        // Find an available teacher for this slot
        let assignedTeacher = null
        for (const teacher of lesson.eligibleTeachers) {
          const tKey = getTKey(teacher.id, day, ts.period)
          if (teacherSlotMap[tKey]) continue // teacher occupied
          const dayKey = `${teacher.id}_${day}`
          const dailyCount = teacherDayCount[dayKey] || 0
          if (teacher.maximum_lessons_per_day && dailyCount >= teacher.maximum_lessons_per_day) continue
          const weeklyCount = teacherWeekCount[teacher.id] || 0
          if (teacher.maximum_lessons_per_week && weeklyCount >= teacher.maximum_lessons_per_week) continue
          assignedTeacher = teacher
          break
        }

        if (!assignedTeacher && lesson.eligibleTeachers.length > 0) continue

        // Place the lesson
        const cKey = getKey(cls.id, day, ts.period)
        classSlotMap[cKey] = true

        if (assignedTeacher) {
          const tKey = getTKey(assignedTeacher.id, day, ts.period)
          teacherSlotMap[tKey] = true
          teacherDayCount[`${assignedTeacher.id}_${day}`] = (teacherDayCount[`${assignedTeacher.id}_${day}`] || 0) + 1
          teacherWeekCount[assignedTeacher.id] = (teacherWeekCount[assignedTeacher.id] || 0) + 1
        }

        const subjDayKey = `${lesson.subject.id}_${day}`
        classSubjectDayMap[subjDayKey] = (classSubjectDayMap[subjDayKey] || 0) + 1

        slots.push({
          class_id: cls.id,
          class_name: cls.class_name,
          teacher_id: assignedTeacher?.id || null,
          teacher_name: assignedTeacher?.full_name || null,
          teacher_code: assignedTeacher?.staff_number || null,
          subject_id: lesson.subject.id,
          subject_name: lesson.subject.name,
          subject_code: lesson.subject.code,
          day,
          period: ts.period,
          start_time: ts.start,
          end_time: ts.end,
          _key: cKey,
        })
        placed = true
      }

      if (!placed) {
        conflicts.push({
          type: 'missing_lesson',
          message: `Could not schedule ${lesson.subject.name} for ${cls.class_name} — no valid slot found`,
          class_name: cls.class_name,
          subject_name: lesson.subject.name,
        })
      }
    }
  }

  // Detect remaining conflicts
  const teacherSlotGroups = {}
  for (const slot of slots) {
    if (!slot.teacher_id) continue
    const key = `${slot.teacher_id}_${slot.day}_${slot.period}`
    if (!teacherSlotGroups[key]) teacherSlotGroups[key] = []
    teacherSlotGroups[key].push(slot)
  }
  for (const [key, group] of Object.entries(teacherSlotGroups)) {
    if (group.length > 1) {
      conflicts.push({
        type: 'teacher_conflict',
        message: `Teacher ${group[0].teacher_name} double-booked on ${group[0].day} period ${group[0].period}`,
        severity: 'error',
      })
    }
  }

  return { slots, conflicts }
}

// ── Conflict Validator ────────────────────────────────────────
function validateSlots(slots, teachers, classRequirements, subjects) {
  const errors = []

  // Teacher double booking
  const tMap = {}
  for (const s of slots) {
    if (!s.teacher_id) continue
    const k = `${s.teacher_id}_${s.day}_${s.period}`
    if (tMap[k]) {
      errors.push({ type: 'teacher_conflict', severity: 'error', message: `Teacher double-booked: ${s.teacher_name} on ${s.day} period ${s.period}` })
    }
    tMap[k] = true
  }

  // Class double booking
  const cMap = {}
  for (const s of slots) {
    const k = `${s.class_id}_${s.day}_${s.period}`
    if (cMap[k]) {
      errors.push({ type: 'class_conflict', severity: 'error', message: `Class ${s.class_name} has two subjects on ${s.day} period ${s.period}` })
    }
    cMap[k] = true
  }

  // Teacher weekly overload
  const tWeek = {}
  for (const s of slots) {
    if (!s.teacher_id) continue
    tWeek[s.teacher_id] = (tWeek[s.teacher_id] || 0) + 1
  }
  for (const t of teachers) {
    if (t.maximum_lessons_per_week && (tWeek[t.id] || 0) > t.maximum_lessons_per_week) {
      errors.push({ type: 'overload', severity: 'warning', message: `${t.full_name} exceeds max weekly lessons (${tWeek[t.id]}/${t.maximum_lessons_per_week})` })
    }
  }

  // English/Kiswahili consecutive check
  const langNames = ['english', 'kiswahili', 'kiswahili/ksl', 'language activities', 'indigenous language']
  for (const day of DAYS) {
    const daySlots = slots.filter(s => s.day === day).sort((a, b) => a.period - b.period)
    for (let i = 0; i < daySlots.length - 1; i++) {
      const a = daySlots[i], b = daySlots[i + 1]
      if (a.class_id !== b.class_id) continue
      if (a.period + 1 !== b.period) continue
      const aLang = langNames.some(l => a.subject_name?.toLowerCase().includes(l))
      const bLang = langNames.some(l => b.subject_name?.toLowerCase().includes(l))
      if (aLang && bLang) {
        errors.push({ type: 'sequence', severity: 'warning', message: `${a.class_name}: Language subjects back-to-back on ${day} (periods ${a.period} & ${b.period})` })
      }
    }
  }

  // Core subjects must be in morning periods — flag any that slipped to afternoon (via manual edit)
  for (const slot of slots) {
    if (isCoreSubject(slot.subject_name) && AFTERNOON_PERIODS.includes(slot.period)) {
      errors.push({
        type: 'morning_violation',
        severity: 'warning',
        message: `${slot.class_name}: "${slot.subject_name}" is a core subject scheduled in the afternoon (${slot.day} period ${slot.period}) — should be morning only`,
      })
    }
  }

  return errors
}

// ── Main Component ───────────────────────────────────────────
export default function AdminTimetablePage() {
  const { profile } = useAuthStore()

  // Tab state
  const [activeTab, setActiveTab] = useState('dashboard')

  // Core data
  const [subjects, setSubjects] = useState([])
  const [teachers, setTeachers] = useState([])
  const [classes, setClasses] = useState([])
  const [subjectAssignments, setSubjectAssignments] = useState([])   // teacher_subject
  const [classRequirements, setClassRequirements] = useState([])     // class_subject_requirements
  const [timetableSlots, setTimetableSlots] = useState([])

  // UI state
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [conflicts, setConflicts] = useState([])

  // Grid / viewer state
  const [viewMode, setViewMode] = useState('class')  // 'class' | 'teacher'
  const [selectedClass, setSelectedClass] = useState('')
  const [selectedTeacher, setSelectedTeacher] = useState('')
  const [gridTerm, setGridTerm] = useState('Term 1')
  const [gridYear, setGridYear] = useState('2025')
  const [schoolName, setSchoolName] = useState('')

  // Drag-drop editor state
  const [dragSlot, setDragSlot] = useState(null)
  const [editMode, setEditMode] = useState(false)

  // Subject form
  const [subjectForm, setSubjectForm] = useState({ name: '', code: '', category: 'core', lessons_per_week: '' })
  const [savingSubject, setSavingSubject] = useState(false)

  // Teacher form
  const [teacherForm, setTeacherForm] = useState({
    full_name: '', staff_number: '', email: '', phone: '',
    maximum_lessons_per_week: 30, maximum_lessons_per_day: 6,
    active_status: true
  })
  const [savingTeacher, setSavingTeacher] = useState(false)
  const [editTeacher, setEditTeacher] = useState(null)
  const [showTeacherModal, setShowTeacherModal] = useState(false)
  const [teacherSubjectMap, setTeacherSubjectMap] = useState({})

  // Class form
  const [classForm, setClassForm] = useState({ class_name: '', level: '', stream: '', academic_year: '2025' })
  const [savingClass, setSavingClass] = useState(false)
  const [editClass, setEditClass] = useState(null)
  const [showClassModal, setShowClassModal] = useState(false)

  // Slot form (manual edit)
  const [showSlotForm, setShowSlotForm] = useState(false)
  const [editSlot, setEditSlot] = useState(null)
  const [slotForm, setSlotForm] = useState({ day: 'Monday', subject_id: '', class_id: '', teacher_id: '', start_time: '', end_time: '' })

  // Global timetable state
  const [globalFilterLevel, setGlobalFilterLevel] = useState('')
  const [globalFilterClass, setGlobalFilterClass] = useState('')
  const [globalFilterTeacher, setGlobalFilterTeacher] = useState('')
  const [globalSelectedDay, setGlobalSelectedDay] = useState('Monday')
  const [globalIsMobile, setGlobalIsMobile] = useState(window.innerWidth < 768)

  const printRef = useRef(null)
  const globalPrintRef = useRef(null)

  useEffect(() => {
    const onResize = () => setGlobalIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const showSuccess = (msg) => { setSuccess(msg); setTimeout(() => setSuccess(''), 3000) }

  // ── Fetch All Data ─────────────────────────────────────────
  useEffect(() => { if (profile?.school_id) fetchAll() }, [profile])

  const fetchAll = async () => {
    if (!profile?.school_id) return
    setLoading(true)
    const sid = profile.school_id
    const [
      { data: subjData },
      { data: teachData },
      { data: clsData },
      { data: taData },
      { data: crData },
      { data: ttData },
      { data: schoolData },
    ] = await Promise.all([
      supabase.from('subjects').select('*').eq('school_id', sid).order('name'),
      supabase.from('teachers').select('*').eq('school_id', sid).order('full_name'),
      supabase.from('classes').select('*').eq('school_id', sid).order('class_name'),
      supabase.from('teacher_subject_assignments').select('*').eq('school_id', sid),
      supabase.from('class_subject_requirements').select('*').eq('school_id', sid),
      supabase.from('timetable_slots').select('*, teachers(full_name, staff_number), subjects(name, code), classes(class_name)').eq('school_id', sid),
      supabase.from('schools').select('name').eq('id', sid).single(),
    ])
    setSubjects(subjData || [])
    setTeachers(teachData || [])
    setClasses(clsData || [])
    setSubjectAssignments(taData || [])
    setClassRequirements(crData || [])
    setTimetableSlots((ttData || []).map(s => ({
      ...s,
      teacher_name: s.teachers?.full_name,
      teacher_code: s.teachers?.staff_number,
      subject_name: s.subjects?.name,
      subject_code: s.subjects?.code,
      class_name: s.classes?.class_name,
    })))
    if (schoolData?.name) setSchoolName(schoolData.name)

    // Build teacher->subjects map
    const tMap = {}
    for (const ta of (taData || [])) {
      if (!tMap[ta.teacher_id]) tMap[ta.teacher_id] = []
      tMap[ta.teacher_id].push(ta.subject_id)
    }
    setTeacherSubjectMap(tMap)

    if (clsData?.length && !selectedClass) setSelectedClass(clsData[0]?.id)
    if (teachData?.length && !selectedTeacher) setSelectedTeacher(teachData[0]?.id)

    setLoading(false)
  }

  // ── CSP Generate ───────────────────────────────────────────
  const handleGenerate = async () => {
    setGenerating(true)
    setError('')
    setConflicts([])
    await new Promise(r => setTimeout(r, 50)) // allow UI to update

    try {
      const { slots, conflicts: cspConflicts } = buildTimetable(
        classes, teachers, subjects, subjectAssignments, classRequirements, subjectAssignments
      )

      // Validate
      const validationErrors = validateSlots(slots, teachers, classRequirements, subjects)
      const allConflicts = [...cspConflicts, ...validationErrors]
      setConflicts(allConflicts)

      const hardErrors = allConflicts.filter(c => c.severity === 'error' || c.type === 'teacher_conflict' || c.type === 'class_conflict')

      if (hardErrors.length > 0) {
        setTimetableSlots(slots)
        setError(`Generated with ${hardErrors.length} conflict(s). Review before saving.`)
        setGenerating(false)
        return
      }

      setTimetableSlots(slots)
      showSuccess(`Timetable generated! ${slots.length} lessons scheduled.`)
    } catch (e) {
      setError('Generation failed: ' + e.message)
    }
    setGenerating(false)
  }

  // ── Save Generated Timetable to Supabase ──────────────────
  const handleSave = async () => {
    const hardErrors = conflicts.filter(c => c.severity === 'error' || c.type === 'teacher_conflict' || c.type === 'class_conflict')
    if (hardErrors.length > 0) {
      setError('Cannot save: resolve all hard conflicts first.')
      return
    }
    setSaving(true)
    // Delete existing slots for this school
    await supabase.from('timetable_slots').delete().eq('school_id', profile.school_id)
    // Insert new
    const inserts = timetableSlots.map(s => ({
      school_id: profile.school_id,
      class_id: s.class_id,
      teacher_id: s.teacher_id || null,
      subject_id: s.subject_id,
      day: s.day,
      period: s.period,
      start_time: s.start_time,
      end_time: s.end_time,
    }))
    const { error: err } = await supabase.from('timetable_slots').insert(inserts)
    setSaving(false)
    if (err) { setError(err.message); return }
    showSuccess('Timetable saved to database!')
    fetchAll()
  }

  // ── Subject CRUD ───────────────────────────────────────────
  const addSubject = async () => {
    if (!subjectForm.name.trim()) return
    setSavingSubject(true)
    const { error: err } = await supabase.from('subjects').insert({
      school_id: profile.school_id,
      name: subjectForm.name.trim(),
      code: subjectForm.code.toUpperCase() || null,
      category: subjectForm.category,
    })
    setSavingSubject(false)
    if (err) { setError(err.message); return }
    setSubjectForm({ name: '', code: '', category: 'core', lessons_per_week: '' })
    showSuccess('Subject added!')
    fetchAll()
  }

  const deleteSubject = async (id) => {
    if (!confirm('Delete subject? Timetable slots using it will be affected.')) return
    await supabase.from('subjects').delete().eq('id', id)
    fetchAll()
  }

  // ── Teacher CRUD ───────────────────────────────────────────
  const openNewTeacher = () => {
    setEditTeacher(null)
    setTeacherForm({ full_name: '', staff_number: '', email: '', phone: '', maximum_lessons_per_week: 30, maximum_lessons_per_day: 6, active_status: true })
    setShowTeacherModal(true)
  }

  const openEditTeacher = (t) => {
    setEditTeacher(t)
    setTeacherForm({ ...t })
    setShowTeacherModal(true)
  }

  const saveTeacher = async () => {
    if (!teacherForm.full_name.trim()) return
    setSavingTeacher(true)
    const payload = { ...teacherForm, school_id: profile.school_id }
    if (editTeacher) {
      await supabase.from('teachers').update(payload).eq('id', editTeacher.id)
    } else {
      await supabase.from('teachers').insert(payload)
    }
    setSavingTeacher(false)
    setShowTeacherModal(false)
    showSuccess(editTeacher ? 'Teacher updated!' : 'Teacher added!')
    fetchAll()
  }

  const deleteTeacher = async (id) => {
    if (!confirm('Delete teacher?')) return
    await supabase.from('teachers').delete().eq('id', id)
    fetchAll()
  }

  const toggleTeacherSubject = async (teacherId, subjectId, assigned) => {
    if (assigned) {
      await supabase.from('teacher_subject_assignments').delete()
        .eq('teacher_id', teacherId).eq('subject_id', subjectId)
    } else {
      await supabase.from('teacher_subject_assignments').insert({
        teacher_id: teacherId, subject_id: subjectId, school_id: profile.school_id
      })
    }
    fetchAll()
  }

  // ── Class CRUD ────────────────────────────────────────────
  const openNewClass = () => {
    setEditClass(null)
    setClassForm({ class_name: '', level: '', stream: '', academic_year: '2025' })
    setShowClassModal(true)
  }

  const openEditClass = (c) => {
    setEditClass(c)
    setClassForm({ ...c })
    setShowClassModal(true)
  }

  const saveClass = async () => {
    if (!classForm.class_name.trim()) return
    setSavingClass(true)
    const payload = { ...classForm, school_id: profile.school_id }
    if (editClass) {
      await supabase.from('classes').update(payload).eq('id', editClass.id)
    } else {
      await supabase.from('classes').insert(payload)
    }
    setSavingClass(false)
    setShowClassModal(false)
    showSuccess(editClass ? 'Class updated!' : 'Class added!')
    fetchAll()
  }

  const deleteClass = async (id) => {
    if (!confirm('Delete class? All related timetable data will be affected.')) return
    await supabase.from('classes').delete().eq('id', id)
    fetchAll()
  }

  const setClassRequirement = async (classId, subjectId, lessonsPerWeek) => {
    await supabase.from('class_subject_requirements').upsert(
      {
        class_id: classId,
        subject_id: subjectId,
        lessons_per_week: Number(lessonsPerWeek),
        school_id: profile.school_id,
      },
      { onConflict: 'class_id,subject_id' }
    )
    fetchAll()
  }

  // ── Manual Slot Edit ──────────────────────────────────────
  const openEditSlot = (slot, day, period, classId) => {
    setEditSlot(slot)
    const clsObj = classes.find(c => c.id === (classId || slot?.class_id))
    const bandLessonSlots = getTimeSlotsForBand(clsObj?.level || clsObj?.class_name || '').filter(s => s.type === 'lesson')
    const matchedSlot = bandLessonSlots.find(s => s.period === period)
    setSlotForm({
      day: slot?.day || day,
      subject_id: slot?.subject_id || '',
      class_id: slot?.class_id || classId || '',
      teacher_id: slot?.teacher_id || '',
      start_time: slot?.start_time || matchedSlot?.start || '',
      end_time: slot?.end_time || matchedSlot?.end || '',
      period: slot?.period || period,
    })
    setShowSlotForm(true)
  }

  const saveSlot = async () => {
    if (!slotForm.subject_id || !slotForm.class_id) { setError('Subject and class are required.'); return }
    const clsObj = classes.find(c => c.id === slotForm.class_id)
    const bandLessonSlots = getTimeSlotsForBand(clsObj?.level || clsObj?.class_name || '').filter(s => s.type === 'lesson')
    const ts = bandLessonSlots.find(s => s.start === slotForm.start_time)
    const payload = {
      school_id: profile.school_id,
      class_id: slotForm.class_id,
      teacher_id: slotForm.teacher_id || null,
      subject_id: slotForm.subject_id,
      day: slotForm.day,
      period: ts?.period || slotForm.period,
      start_time: slotForm.start_time,
      end_time: slotForm.end_time,
    }
    if (editSlot?.id) {
      await supabase.from('timetable_slots').update(payload).eq('id', editSlot.id)
    } else {
      await supabase.from('timetable_slots').insert(payload)
    }
    setShowSlotForm(false)
    showSuccess('Slot saved!')
    fetchAll()
  }

  const deleteSlot = async (id) => {
    if (!confirm('Remove this lesson?')) return
    await supabase.from('timetable_slots').delete().eq('id', id)
    fetchAll()
    // Also remove from local state if generated but not yet saved
    setTimetableSlots(prev => prev.filter(s => s.id !== id))
  }

  // ── Drag & Drop ───────────────────────────────────────────
  const handleDragStart = (slot) => setDragSlot(slot)

  const handleDrop = async (day, period, classId) => {
    if (!dragSlot || !editMode) return
    const targetKey = `${classId}_${day}_${period}`
    const targetOccupied = timetableSlots.find(s => s.class_id === classId && s.day === day && s.period === period && s.id !== dragSlot.id)
    if (targetOccupied) {
      // Swap
      const updatedSlots = timetableSlots.map(s => {
        if (s.id === dragSlot.id) return { ...s, day, period, start_time: LESSON_SLOTS.find(ls => ls.period === period)?.start, end_time: LESSON_SLOTS.find(ls => ls.period === period)?.end }
        if (s.id === targetOccupied.id) return { ...s, day: dragSlot.day, period: dragSlot.period, start_time: dragSlot.start_time, end_time: dragSlot.end_time }
        return s
      })
      setTimetableSlots(updatedSlots)
      // Validate after swap
      const errors = validateSlots(updatedSlots, teachers, classRequirements, subjects)
      setConflicts(errors)
    } else {
      // Move
      const updatedSlots = timetableSlots.map(s =>
        s.id === dragSlot.id
          ? { ...s, day, period, start_time: LESSON_SLOTS.find(ls => ls.period === period)?.start, end_time: LESSON_SLOTS.find(ls => ls.period === period)?.end }
          : s
      )
      setTimetableSlots(updatedSlots)
      const errors = validateSlots(updatedSlots, teachers, classRequirements, subjects)
      setConflicts(errors)
    }
    setDragSlot(null)
  }

  // ── Grid Helpers ───────────────────────────────────────────
  const getCell = (day, period, classId) =>
    timetableSlots.find(s => s.class_id === classId && s.day === day && s.period === period) || null

  const getTeacherCell = (day, period, teacherId) =>
    timetableSlots.find(s => s.teacher_id === teacherId && s.day === day && s.period === period) || null

  // ── PDF Print ─────────────────────────────────────────────
  const handlePrint = () => {
    const content = printRef.current
    if (!content) return
    const win = window.open('', '_blank')
    win.document.write(`
      <html>
        <head>
          <title>Timetable</title>
          <style>
            @page { size: A4 landscape; margin: 3mm; }
            * { box-sizing: border-box; font-family: Arial, sans-serif; }
            body { margin: 0; }
            .adm-tt-print-area { width: 100%; }
            .adm-grid-school-name { text-align:center; font-size:22px; font-weight:700; }
            .adm-grid-heading { text-align:center; font-size:24px; font-weight:900; text-decoration:underline; text-transform:uppercase; margin-bottom:22px; }
            .adm-tt-table { width:100%; border-collapse:collapse; border:3px solid #111; }
            .adm-tt-th, .adm-tt-td { border:2px solid #111; padding:8px 10px; text-align:center; vertical-align:middle; }
            .adm-tt-th { background:#f1f1f1; font-size:14px; font-weight:700; }
            .adm-tt-th-break, .adm-tt-td-break { background:#f8f8f8; width:40px; }
            .adm-tt-td-day { font-size:16px; font-weight:900; background:#f1f1f1; width:65px; }
            .adm-tt-td-lesson { height:80px; }
            .adm-tt-cell { display:flex; flex-direction:column; align-items:center; justify-content:center; height:80px; gap:4px; }
            .adm-tt-cell-code { font-size:15px; font-weight:700; font-style:italic; }
            .adm-tt-cell-class { font-size:11px; color:#1d4ed8; background:#dbeafe; padding:1px 5px; border-radius:3px; }
            .adm-tt-cell-teacher { font-size:12px; color:#555; background:#eee; padding:2px 6px; border-radius:3px; }
            .adm-tt-break-label { writing-mode:vertical-rl; transform:rotate(180deg); font-size:13px; font-weight:900; }
            .adm-tt-footer { display:flex; justify-content:space-between; margin-top:28px; font-size:15px; }
          </style>
        </head>
        <body>${content.outerHTML}</body>
      </html>
    `)
    win.document.close()
    win.onload = () => { win.focus(); win.print(); win.close() }
  }

  // ── Stats for dashboard ────────────────────────────────────
  const stats = {
    classes: classes.length,
    teachers: teachers.length,
    subjects: subjects.length,
    lessons: timetableSlots.length,
    conflicts: conflicts.filter(c => c.severity === 'error' || c.type === 'teacher_conflict').length,
    warnings: conflicts.filter(c => c.severity === 'warning').length,
  }

  // ── Global timetable filtering ────────────────────────────
  const globalLevelFilteredClasses = globalFilterLevel
    ? classes.filter(c => (c.level || '').toUpperCase() === globalFilterLevel.toUpperCase())
    : classes

  let globalFilteredSlots = timetableSlots
  if (globalFilterLevel) {
    const ids = globalLevelFilteredClasses.map(c => c.id)
    globalFilteredSlots = globalFilteredSlots.filter(s => ids.includes(s.class_id))
  }
  if (globalFilterClass) globalFilteredSlots = globalFilteredSlots.filter(s => s.class_id === globalFilterClass)
  if (globalFilterTeacher) globalFilteredSlots = globalFilteredSlots.filter(s => s.teacher_id === globalFilterTeacher)

  const globalActiveSlots = globalFilterLevel
    ? getTimeSlotsForBand(globalFilterLevel)
    : TIME_SLOTS_BY_BAND.SECONDARY

  const globalCellMap = {}
  for (const s of globalFilteredSlots) {
    const key = `${s.day}-${s.period}`
    if (!globalCellMap[key]) globalCellMap[key] = []
    globalCellMap[key].push(s)
  }

  const globalGetEntries = (day, period) => globalCellMap[`${day}-${period}`] || []

  const globalTotalLessons = globalFilteredSlots.length
  const globalUniqueSubjectNames = [...new Set(globalFilteredSlots.map(s => s.subject_name).filter(Boolean))]
  const globalUniqueClassIds = [...new Set(globalFilteredSlots.map(s => s.class_id).filter(Boolean))]
  const globalUniqueTeacherIds = [...new Set(globalFilteredSlots.map(s => s.teacher_id).filter(Boolean))]

  const globalDayIdx = DAYS.indexOf(globalSelectedDay)
  const globalPrevDay = () => setGlobalSelectedDay(DAYS[Math.max(0, globalDayIdx - 1)])
  const globalNextDay = () => setGlobalSelectedDay(DAYS[Math.min(DAYS.length - 1, globalDayIdx + 1)])

  const globalFilterLabel = globalFilterLevel || (globalFilterClass ? classes.find(c => c.id === globalFilterClass)?.class_name : '') || (globalFilterTeacher ? teachers.find(t => t.id === globalFilterTeacher)?.full_name : '') || 'School'

  const handleGlobalPrint = () => {
    const content = globalPrintRef.current
    if (!content) return
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`
      <html>
        <head>
          <title>School Timetable</title>
          <style>
            @page { size: A4 landscape; margin: 2mm; }
            * { box-sizing: border-box; font-family: Arial, sans-serif; }
            html, body { margin: 0; padding: 0; width: 100%; height: 100%; }
            .tt-print-area { width: 100%; padding: 0; }
            .tt-print-school-name { text-align:center; font-size:14px; font-weight:700; margin-bottom:2px; }
            .tt-print-heading { text-align:center; font-size:16px; font-weight:900; text-decoration:underline; text-transform:uppercase; margin-bottom:4px; }
            .tt-print-footer { display:flex; justify-content:space-between; margin-top:4px; font-size:10px; }
            .tt-print-table { width:100%; border-collapse:collapse; border:2px solid #111; }
            .tt-print-table th, .tt-print-table td { border:1.5px solid #111; padding:5px 6px; text-align:center; vertical-align:middle; }
            .tt-print-table th { background:#f1f1f1; font-size:11px; font-weight:700; }
            .tt-print-table .tt-grid-th-break, .tt-print-table .tt-grid-td-break { background:#f8f8f8; width:22px; }
            .tt-print-table .tt-grid-td-day { font-size:12px; font-weight:900; background:#f1f1f1; width:40px; }
            .tt-print-table .tt-grid-td-cell { height:auto; }
            .tt-grid-cell { display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:20px; gap:2px; padding:3px; }
            .tt-grid-subject-code { font-size:11px; font-weight:700; font-style:italic; }
            .tt-grid-teacher { font-size:9px; color:#555; background:#eee; padding:1px 4px; border-radius:2px; }
            .tt-break-label { writing-mode:vertical-rl; transform:rotate(180deg); font-size:9px; font-weight:900; }
          </style>
        </head>
        <body>${content.outerHTML}</body>
      </html>
    `)
    win.document.close()
    win.onload = () => { win.focus(); win.print(); win.close() }
  }

  // ── Tab config ────────────────────────────────────────────
  const tabs = [
    { key: 'dashboard', label: 'Dashboard',    icon: <BarChart2 size={15} /> },
    { key: 'subjects',  label: 'Subjects',      icon: <BookOpen size={15} /> },
    { key: 'teachers',  label: 'Teachers',      icon: <User size={15} /> },
    { key: 'classes',   label: 'Classes',       icon: <GraduationCap size={15} /> },
    { key: 'grid',      label: 'Timetable',     icon: <Grid size={15} /> },
    { key: 'global',    label: 'Global Timetable', icon: <Eye size={15} /> },
    { key: 'conflicts', label: `Conflicts${conflicts.length ? ` (${conflicts.length})` : ''}`, icon: <AlertTriangle size={15} /> },
  ]

  if (loading) return <div className="adm-tt-loading">Loading ShulePulse data…</div>

  // ── RENDER ─────────────────────────────────────────────────
  return (
    <div className="adm-tt-page">

      {/* Tabs */}
      <div className="adm-tt-tabs">
        {tabs.map(t => (
          <button key={t.key} className={`adm-tt-tab ${activeTab === t.key ? 'active' : ''}`}
            onClick={() => { setActiveTab(t.key); setError('') }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Feedback */}
      {success && <div className="adm-tt-success"><CheckCircle size={15} /> {success}</div>}
      {error && <div className="adm-tt-error">{error}</div>}

      {/* ══════════════════════════════════════════════
          DASHBOARD TAB
      ══════════════════════════════════════════════ */}
      {activeTab === 'dashboard' && (
        <div className="adm-tt-dashboard">
          {/* Stats row */}
          <div className="adm-dash-stats">
            {[
              { label: 'Classes',    value: stats.classes,   icon: <GraduationCap size={20} />, color: 'blue' },
              { label: 'Teachers',   value: stats.teachers,  icon: <User size={20} />,          color: 'purple' },
              { label: 'Subjects',   value: stats.subjects,  icon: <BookOpen size={20} />,      color: 'green' },
              { label: 'Lessons',    value: stats.lessons,   icon: <Calendar size={20} />,      color: 'indigo' },
              { label: 'Conflicts',  value: stats.conflicts, icon: <AlertTriangle size={20} />, color: stats.conflicts > 0 ? 'red' : 'gray' },
              { label: 'Warnings',   value: stats.warnings,  icon: <Zap size={20} />,           color: stats.warnings > 0 ? 'orange' : 'gray' },
            ].map(s => (
              <div key={s.label} className={`adm-dash-stat adm-stat-${s.color}`}>
                <div className="adm-dash-stat-icon">{s.icon}</div>
                <div className="adm-dash-stat-body">
                  <span className="adm-dash-stat-value">{s.value}</span>
                  <span className="adm-dash-stat-label">{s.label}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Action cards */}
          <div className="adm-dash-actions">
            <div className="adm-tt-card adm-dash-generate">
              <div className="adm-tt-card-header">
                <Zap size={17} />
                <h3>CBC Timetable Generator</h3>
              </div>
              <p className="adm-tt-card-desc">
                Uses a Constraint Satisfaction Problem (CSP) algorithm to generate a fully conflict-free,
                KICD-compliant timetable. Ensure teachers, subjects, classes, and weekly requirements
                are configured before generating.
              </p>
              <div className="adm-dash-gen-btns">
                <button className="adm-generate-btn" onClick={handleGenerate} disabled={generating}>
                  <Zap size={16} />
                  {generating ? 'Generating…' : timetableSlots.length ? 'Regenerate Timetable' : 'Generate Timetable'}
                </button>
                {timetableSlots.length > 0 && (
                  <button className="adm-save-btn" onClick={handleSave} disabled={saving}>
                    <Save size={15} />
                    {saving ? 'Saving…' : 'Save to Database'}
                  </button>
                )}
                {timetableSlots.length > 0 && (
                  <button className="adm-view-btn" onClick={() => setActiveTab('grid')}>
                    <Eye size={15} /> View Timetable
                  </button>
                )}
              </div>
              {timetableSlots.length > 0 && (
                <div className="adm-dash-gen-info">
                  <CheckCircle size={14} />
                  {timetableSlots.length} lessons generated across {classes.length} class{classes.length !== 1 ? 'es' : ''}
                </div>
              )}
            </div>

            {/* Quick links */}
            <div className="adm-tt-card adm-dash-quicklinks">
              <div className="adm-tt-card-header">
                <Settings size={17} />
                <h3>Setup Checklist</h3>
              </div>
              <div className="adm-checklist">
                {[
                  { label: `${stats.subjects} subject${stats.subjects !== 1 ? 's' : ''} added`, done: stats.subjects > 0, tab: 'subjects' },
                  { label: `${stats.teachers} teacher${stats.teachers !== 1 ? 's' : ''} added`, done: stats.teachers > 0, tab: 'teachers' },
                  { label: `${stats.classes} class${stats.classes !== 1 ? 'es' : ''} added`, done: stats.classes > 0, tab: 'classes' },
                  { label: 'Weekly lesson requirements set', done: classRequirements.length > 0, tab: 'classes' },
                  { label: 'Teacher subjects assigned', done: subjectAssignments.length > 0, tab: 'teachers' },
                  { label: 'Timetable generated', done: stats.lessons > 0, tab: 'dashboard' },
                  { label: 'No hard conflicts', done: stats.conflicts === 0, tab: 'conflicts' },
                ].map(item => (
                  <div key={item.label} className={`adm-checklist-item ${item.done ? 'done' : ''}`}
                    onClick={() => setActiveTab(item.tab)}>
                    <div className="adm-checklist-dot">{item.done ? <CheckCircle size={14} /> : <div className="adm-dot-empty" />}</div>
                    <span>{item.label}</span>
                    <ChevronRight size={13} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Recent conflicts preview */}
          {conflicts.length > 0 && (
            <div className="adm-tt-card">
              <div className="adm-tt-card-header">
                <AlertTriangle size={17} />
                <h3>Conflict Summary</h3>
                <button className="adm-tab-link" onClick={() => setActiveTab('conflicts')}>View all</button>
              </div>
              <div className="adm-conflict-list">
                {conflicts.slice(0, 4).map((c, i) => (
                  <div key={i} className={`adm-conflict-item adm-conflict-${c.severity || 'error'}`}>
                    <AlertTriangle size={13} />
                    <span>{c.message}</span>
                  </div>
                ))}
                {conflicts.length > 4 && (
                  <div className="adm-conflict-more">+{conflicts.length - 4} more — <button onClick={() => setActiveTab('conflicts')}>see all</button></div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════
          SUBJECTS TAB
      ══════════════════════════════════════════════ */}
      {activeTab === 'subjects' && (
        <div className="adm-tt-subjects">
          <div className="adm-tt-card">
            <div className="adm-tt-card-header">
              <BookOpen size={17} />
              <h3>Add Subject / Learning Area</h3>
            </div>
            <p className="adm-tt-card-desc">
              Define subjects your school teaches. The <strong>Timetable Code</strong> appears in grid cells —
              use KICD abbreviations (e.g. <em>ENG, KIS, MATH, INTS, AGRI, PRT, CRE, PE</em>).
            </p>
            <div className="adm-subject-form">
              <div className="form-field">
                <label>Subject Name *</label>
                <input placeholder="e.g. Integrated Science" value={subjectForm.name}
                  onChange={e => setSubjectForm({ ...subjectForm, name: e.target.value })}
                  onKeyDown={e => e.key === 'Enter' && addSubject()} />
              </div>
              <div className="form-grid">
                <div className="form-field">
                  <label>Timetable Code <span className="adm-code-hint">(shown in grid)</span></label>
                  <input placeholder="e.g. INTS, AGRI, PRT" value={subjectForm.code}
                    onChange={e => setSubjectForm({ ...subjectForm, code: e.target.value.toUpperCase() })}
                    maxLength={8} />
                </div>
                <div className="form-field">
                  <label>Category</label>
                  <select value={subjectForm.category}
                    onChange={e => setSubjectForm({ ...subjectForm, category: e.target.value })}>
                    <option value="core">Core</option>
                    <option value="elective">Elective / Pathway</option>
                    <option value="practical">Practical / Lab</option>
                    <option value="support">Support</option>
                    <option value="extracurricular">Extracurricular</option>
                  </select>
                </div>
              </div>
              <button className="adm-tt-add-btn" onClick={addSubject} disabled={savingSubject || !subjectForm.name.trim()}>
                <Plus size={15} /> {savingSubject ? 'Adding…' : 'Add Subject'}
              </button>
            </div>
          </div>

          <div className="adm-tt-card">
            <div className="adm-tt-card-header">
              <h3>Subjects ({subjects.length})</h3>
            </div>
            {subjects.length === 0 ? (
              <div className="adm-tt-empty"><BookOpen size={32} /><p>No subjects yet. Add your first above.</p></div>
            ) : (
              <div className="adm-subject-list">
                {subjects.map(s => (
                  <div key={s.id} className="adm-subject-row">
                    <div className="adm-subject-icon">{s.code?.slice(0,4) || s.name.slice(0,2).toUpperCase()}</div>
                    <div className="adm-subject-info">
                      <p className="adm-subject-name">{s.name}</p>
                      <div className="adm-subject-meta">
                        {s.code && <span className="adm-subject-code">{s.code}</span>}
                        <span className={`adm-subject-cat cat-${s.category}`}>{s.category}</span>
                      </div>
                    </div>
                    <button className="adm-subject-del" onClick={() => deleteSubject(s.id)}><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          TEACHERS TAB
      ══════════════════════════════════════════════ */}
      {activeTab === 'teachers' && (
        <div className="adm-tt-teachers">
          <div className="adm-tt-day-bar">
            <h3 className="adm-section-title">Teachers ({teachers.length})</h3>
            <button className="adm-tt-new-btn" onClick={openNewTeacher}><Plus size={15} /> Add Teacher</button>
          </div>

          {teachers.length === 0 ? (
            <div className="adm-tt-card">
              <div className="adm-tt-empty"><User size={32} /><p>No teachers yet.</p>
                <button className="adm-tt-empty-btn" onClick={openNewTeacher}><Plus size={14} /> Add first teacher</button>
              </div>
            </div>
          ) : (
            <div className="adm-teacher-list">
              {teachers.map(t => {
                const assignedSubjectIds = teacherSubjectMap[t.id] || []
                const weeklyLoad = timetableSlots.filter(s => s.teacher_id === t.id).length
                return (
                  <div key={t.id} className="adm-tt-card adm-teacher-card">
                    <div className="adm-teacher-header">
                      <div className="adm-teacher-avatar">
                        {t.full_name?.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase()}
                      </div>
                      <div className="adm-teacher-info">
                        <p className="adm-teacher-name">{t.full_name}</p>
                        <div className="adm-teacher-meta">
                          {t.staff_number && <span className="adm-tag">{t.staff_number}</span>}
                          {t.email && <span className="adm-tag adm-tag-gray">{t.email}</span>}
                          <span className={`adm-tag ${t.active_status !== false ? '' : 'adm-tag-gray'}`}>
                            {t.active_status !== false ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      </div>
                      <div className="adm-slot-actions">
                        <button onClick={() => openEditTeacher(t)}><Edit2 size={14} /></button>
                        <button className="del" onClick={() => deleteTeacher(t.id)}><Trash2 size={14} /></button>
                      </div>
                    </div>

                    <div className="adm-teacher-limits">
                      <div className="adm-limit-badge">
                        <Clock size={12} /> Max {t.maximum_lessons_per_day || '—'}/day
                      </div>
                      <div className="adm-limit-badge">
                        <Calendar size={12} /> Max {t.maximum_lessons_per_week || '—'}/week
                      </div>
                      <div className="adm-limit-badge adm-limit-current">
                        <Layers size={12} /> {weeklyLoad} scheduled
                      </div>
                    </div>

                    {/* Subject assignment checkboxes */}
                    <div className="adm-teacher-subjects-section">
                      <p className="adm-teacher-subj-label">Assigned Subjects</p>
                      <div className="adm-teacher-subjects">
                        {subjects.map(s => {
                          const assigned = assignedSubjectIds.includes(s.id)
                          return (
                            <button
                              key={s.id}
                              className={`adm-subj-chip ${assigned ? 'assigned' : ''}`}
                              onClick={() => toggleTeacherSubject(t.id, s.id, assigned)}
                              title={assigned ? 'Click to unassign' : 'Click to assign'}
                            >
                              {s.code || s.name.slice(0,4)}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════
          CLASSES TAB
      ══════════════════════════════════════════════ */}
      {activeTab === 'classes' && (
        <div className="adm-tt-classes">
          <div className="adm-tt-day-bar">
            <h3 className="adm-section-title">Classes ({classes.length})</h3>
            <button className="adm-tt-new-btn" onClick={openNewClass}><Plus size={15} /> Add Class</button>
          </div>

          {classes.length === 0 ? (
            <div className="adm-tt-card">
              <div className="adm-tt-empty"><GraduationCap size={32} /><p>No classes yet.</p>
                <button className="adm-tt-empty-btn" onClick={openNewClass}><Plus size={14} /> Add first class</button>
              </div>
            </div>
          ) : (
            <div className="adm-class-list">
              {classes.map(cls => {
                const reqs = classRequirements.filter(r => r.class_id === cls.id)
                const totalLessons = reqs.reduce((sum, r) => sum + (r.lessons_per_week || 0), 0)
                const scheduled = timetableSlots.filter(s => s.class_id === cls.id).length
                // Detect CBC level: first try exact key match, then band fallback
                const cbcLevel = Object.keys(CBC_REQUIREMENTS).find(k =>
                  cls.class_name?.includes(k) || cls.level?.includes(k)
                ) || (() => {
                  const band = getCBCBand(cls.level || cls.class_name || '')
                  if (band === 'PP') return cls.class_name?.toUpperCase().includes('PP2') ? 'PP2' : 'PP1'
                  if (band === 'LOWER_PRIMARY') return null // ambiguous without exact grade
                  if (band === 'UPPER_PRIMARY') return null
                  if (band === 'JUNIOR') return 'Junior'
                  if (band === 'SENIOR') return 'Senior'
                  return null
                })()
                const cbcBand = getCBCBand(cls.level || cls.class_name || '')
                const bandLabel = {
                  PP: 'Pre-Primary',
                  LOWER_PRIMARY: 'Lower Primary',
                  UPPER_PRIMARY: 'Upper Primary',
                  JUNIOR: 'Junior School',
                  SENIOR: 'Senior School',
                }[cbcBand] || null
                const totalRequired = cbcLevel
                  ? Object.values(CBC_REQUIREMENTS[cbcLevel]).reduce((a, b) => a + b, 0)
                  : null
                return (
                  <div key={cls.id} className="adm-tt-card adm-class-card">
                    <div className="adm-class-header">
                      <div className="adm-class-badge">{cls.class_name}</div>
                      <div className="adm-class-info">
                        <p className="adm-class-name">{cls.class_name} {cls.stream && `— ${cls.stream}`}</p>
                        <div className="adm-teacher-meta">
                          {cls.level && <span className="adm-tag">{cls.level}</span>}
                          <span className="adm-tag adm-tag-gray">AY {cls.academic_year}</span>
                          <span className="adm-tag adm-tag-teacher">{totalLessons}/wk required</span>
                          <span className="adm-tag">{scheduled} scheduled</span>
                        </div>
                      </div>
                      <div className="adm-slot-actions">
                        <button onClick={() => openEditClass(cls)}><Edit2 size={14} /></button>
                        <button className="del" onClick={() => deleteClass(cls.id)}><Trash2 size={14} /></button>
                      </div>
                    </div>

                    {/* CBC quick-fill */}
                    {(cbcLevel || bandLabel) && (
                      <div className="adm-cbc-hint">
                        <Zap size={12} />
                        <span>
                          {bandLabel && <strong>{bandLabel} · </strong>}
                          {cbcLevel
                            ? <>CBC defaults for <strong>{cbcLevel}</strong> ({totalRequired} lessons/wk) detected — </>
                            : <>Band detected — select exact grade for defaults — </>
                          }
                        </span>
                        {cbcLevel && (
                          <button onClick={async () => {
                            const defaults = CBC_REQUIREMENTS[cbcLevel]
                            for (const [subjName, count] of Object.entries(defaults)) {
                              const subj = subjects.find(s => s.name.toLowerCase().includes(subjName.toLowerCase()))
                              if (subj) await setClassRequirement(cls.id, subj.id, count)
                            }
                            showSuccess(`CBC defaults applied for ${cbcLevel}!`)
                          }}>apply defaults</button>
                        )}
                      </div>
                    )}

                    {/* Weekly requirements per subject */}
                    <div className="adm-class-reqs">
                      <p className="adm-teacher-subj-label">Weekly Lesson Requirements</p>
                      <div className="adm-req-grid">
                        {subjects.map(s => {
                          const req = reqs.find(r => r.subject_id === s.id)
                          return (
                            <div key={s.id} className="adm-req-row">
                              <span className="adm-req-subj">{s.code || s.name.slice(0,6)}</span>
                              <input
                                type="number" min="0" max="10"
                                className="adm-req-input"
                                value={req?.lessons_per_week || ''}
                                placeholder="0"
                                onChange={e => setClassRequirement(cls.id, s.id, e.target.value)}
                              />
                              <span className="adm-req-unit">/ wk</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════
          TIMETABLE GRID TAB
      ══════════════════════════════════════════════ */}
      {activeTab === 'grid' && (
        <div className="adm-tt-grid-tab">
          {/* Controls */}
          <div className="adm-tt-card adm-grid-controls">
            <div className="adm-grid-controls-row">
              {/* View mode toggle */}
              <div className="form-field">
                <label>View</label>
                <div className="adm-view-toggle">
                  <button className={viewMode === 'class' ? 'active' : ''} onClick={() => setViewMode('class')}>
                    <GraduationCap size={13} /> Class
                  </button>
                  <button className={viewMode === 'teacher' ? 'active' : ''} onClick={() => setViewMode('teacher')}>
                    <User size={13} /> Teacher
                  </button>
                </div>
              </div>

              {viewMode === 'class' ? (
                <div className="form-field">
                  <label>Class</label>
                  <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)}>
                    {classes.map(c => <option key={c.id} value={c.id}>{c.class_name} {c.stream}</option>)}
                  </select>
                </div>
              ) : (
                <div className="form-field">
                  <label>Teacher</label>
                  <select value={selectedTeacher} onChange={e => setSelectedTeacher(e.target.value)}>
                    {teachers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                  </select>
                </div>
              )}

              <div className="form-field">
                <label>Term</label>
                <select value={gridTerm} onChange={e => setGridTerm(e.target.value)}>
                  <option>Term 1</option><option>Term 2</option><option>Term 3</option>
                </select>
              </div>
              <div className="form-field">
                <label>Year</label>
                <input value={gridYear} onChange={e => setGridYear(e.target.value)} style={{ width: 80 }} />
              </div>

              <div className="form-field adm-edit-toggle-field">
                <label>Edit Mode</label>
                <button
                  className={`adm-edit-toggle ${editMode ? 'active' : ''}`}
                  onClick={() => setEditMode(v => !v)}
                  title={editMode ? 'Editing enabled — drag to swap slots' : 'Click to enable editing'}
                >
                  <Edit2 size={13} /> {editMode ? 'Editing' : 'View Only'}
                </button>
              </div>

              <button className="adm-print-btn" onClick={handlePrint}>
                <Download size={15} /> Download PDF
              </button>
            </div>
          </div>

          {editMode && (
            <div className="adm-edit-banner">
              <Edit2 size={14} /> Edit mode active — drag lessons to swap, click empty cells to add, click lessons to edit.
              {conflicts.length > 0 && <span className="adm-edit-conflict-count"><AlertTriangle size={13} /> {conflicts.length} conflict{conflicts.length !== 1 ? 's' : ''}</span>}
            </div>
          )}

          {/* The Grid */}
          {(() => {
            // Determine which time slots to display for the selected class/teacher
            const selectedClassObj = classes.find(c => c.id === selectedClass)
            const selectedTeacherObj = teachers.find(t => t.id === selectedTeacher)
            // For teacher view: use the broadest slot set (SECONDARY) so all their classes render
            const gridLevelStr = viewMode === 'class'
              ? (selectedClassObj?.level || selectedClassObj?.class_name || '')
              : '' // teacher view → default to widest (SECONDARY)
            const activeTimeSlots = viewMode === 'class'
              ? getTimeSlotsForBand(gridLevelStr)
              : TIME_SLOTS_BY_BAND.SECONDARY
            const activeLessonSlots = activeTimeSlots.filter(s => s.type === 'lesson')
            const band = getCBCBand(gridLevelStr)
            const lessonDuration = BAND_LESSON_DURATION[band] || 40
            const totalLessons = activeLessonSlots.length
            return (
              <div className="adm-tt-grid-wrapper">
                <div className="adm-tt-grid-scroll">
                  {/* Band info badge */}
                  {viewMode === 'class' && band && (
                    <div className="adm-band-badge">
                      <Clock size={12} />
                      {band === 'PP' && `Pre-Primary · 5 lessons/day · ${lessonDuration} min/lesson`}
                      {band === 'LOWER_PRIMARY' && `Lower Primary (Grade 1–3) · 31 lessons/week · ${lessonDuration} min/lesson`}
                      {band === 'UPPER_PRIMARY' && `Upper Primary (Grade 4–6) · 35 lessons/week · ${lessonDuration} min/lesson`}
                      {band === 'JUNIOR' && `Junior School (Grade 7–9) · 40 lessons/week · ${lessonDuration} min/lesson`}
                      {band === 'SENIOR' && `Senior School (Grade 10–11) · 40 lessons/week · ${lessonDuration} min/lesson`}
                    </div>
                  )}
                  <div ref={printRef} className="adm-tt-print-area">
                    <div className="adm-grid-school-name">{schoolName?.toUpperCase()}</div>
                    <div className="adm-grid-heading">
                      {viewMode === 'class'
                        ? `${selectedClassObj?.class_name || ''} ${gridTerm} ${gridYear} Timetable`
                        : `${selectedTeacherObj?.full_name || ''}${selectedTeacherObj?.staff_number ? ` (${selectedTeacherObj.staff_number})` : ''} ${gridTerm} ${gridYear} Timetable`
                      }
                    </div>

                    <table className="adm-tt-table">
                      <thead>
                        <tr>
                          <th className="adm-tt-th adm-tt-th-day">DAY</th>
                          {activeTimeSlots.map(slot => (
                            <th key={slot.key}
                              className={`adm-tt-th ${slot.type === 'break' ? 'adm-tt-th-break' : 'adm-tt-th-lesson'}`}>
                              {slot.type === 'lesson'
                                ? <span className="adm-tt-time-label">{slot.label}</span>
                                : <span className="adm-tt-break-time">{slot.label}</span>}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {DAYS.map((day, di) => (
                          <tr key={day} className="adm-tt-row">
                            <td className="adm-tt-td adm-tt-td-day"><span>{DAY_SHORT[day]}</span></td>
                            {activeTimeSlots.map(slot => {
                              if (slot.type === 'break') {
                                if (di === 0) return (
                                  <td key={slot.key}
                                    className={`adm-tt-td adm-tt-td-break adm-tt-break-${slot.key}`}
                                    rowSpan={DAYS.length}>
                                    <span className="adm-tt-break-label">{slot.breakLabel}</span>
                                  </td>
                                )
                                return null
                              }

                              const cell = viewMode === 'class'
                                ? getCell(day, slot.period, selectedClass)
                                : getTeacherCell(day, slot.period, selectedTeacher)

                              const hasConflict = conflicts.some(c =>
                                c.type === 'teacher_conflict' &&
                                cell?.teacher_name && c.message?.includes(cell.teacher_name) &&
                                c.message?.includes(day)
                              )

                              return (
                                <td key={slot.key} className="adm-tt-td adm-tt-td-lesson"
                                  onDragOver={editMode ? e => e.preventDefault() : undefined}
                                  onDrop={editMode ? () => handleDrop(day, slot.period, selectedClass) : undefined}>
                                  {cell ? (
                                    <div
                                      className={`adm-tt-cell ${hasConflict ? 'adm-cell-conflict' : ''}`}
                                      draggable={editMode}
                                      onDragStart={editMode ? () => handleDragStart(cell) : undefined}
                                      onClick={() => editMode && openEditSlot(cell, day, slot.period, selectedClass)}
                                      title={`${cell.subject_name}${cell.class_name ? ' — ' + cell.class_name : ''}${cell.teacher_name ? ' — ' + cell.teacher_name : ''}`}
                                    >
                                      <span className="adm-tt-cell-code">{cell.subject_code || cell.subject_name?.slice(0,4)}</span>
                                      {viewMode === 'teacher' && cell.class_name && <span className="adm-tt-cell-class">{cell.class_name}</span>}
                                      {cell.teacher_code && <span className="adm-tt-cell-teacher">{cell.teacher_code}</span>}
                                      {hasConflict && <span className="adm-cell-conflict-dot" />}
                                    </div>
                                  ) : (
                                    <div
                                      className="adm-tt-cell adm-tt-cell-empty"
                                      onClick={() => editMode && openEditSlot(null, day, slot.period, selectedClass)}
                                    >
                                      <span className="adm-tt-cell-dash">{editMode ? '+' : '–'}</span>
                                    </div>
                                  )}
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <div className="adm-tt-footer">
                      <div className="adm-tt-footer-left">PREPARED BY ……………………………………………………………</div>
                      <div className="adm-tt-footer-right">SCHOOL STAMP……………………………………………………………</div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* ══════════════════════════════════════════════
          GLOBAL TIMETABLE TAB
      ══════════════════════════════════════════════ */}
      {activeTab === 'global' && (
        <>
          {/* ── Filter Bar ── */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
            padding: '14px 18px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#64748b' }}>
              <Filter size={15} />
              <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>Filters</span>
            </div>

            <select value={globalFilterLevel} onChange={e => { setGlobalFilterLevel(e.target.value); setGlobalFilterClass('') }}
              style={selectStyle}>
              <option value="">All Levels</option>
              {LEVEL_GROUPS.filter(g => g.value).map(g => (
                <option key={g.value} value={g.value}>{g.label}</option>
              ))}
            </select>

            <select value={globalFilterClass} onChange={e => setGlobalFilterClass(e.target.value)}
              style={selectStyle}>
              <option value="">All Classes</option>
              {globalLevelFilteredClasses.map(c => (
                <option key={c.id} value={c.id}>{c.class_name}{c.stream ? ` ${c.stream}` : ''}</option>
              ))}
            </select>

            <select value={globalFilterTeacher} onChange={e => setGlobalFilterTeacher(e.target.value)}
              style={selectStyle}>
              <option value="">All Teachers</option>
              {teachers.map(t => (
                <option key={t.id} value={t.id}>{t.full_name} {t.staff_number ? `(${t.staff_number})` : ''}</option>
              ))}
            </select>

            {(globalFilterLevel || globalFilterClass || globalFilterTeacher) && (
              <button onClick={() => { setGlobalFilterLevel(''); setGlobalFilterClass(''); setGlobalFilterTeacher('') }}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px',
                  fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 6, background: '#f8fafc',
                  color: '#64748b', cursor: 'pointer', whiteSpace: 'nowrap',
                }}>
                <X size={13} /> Clear
              </button>
            )}
          </div>

          {/* ── Summary Strip ── */}
          <div className="tt-summary">
            {[
              { label: 'Lessons',   value: globalTotalLessons,       icon: <Calendar size={18} />,     color: '#2563eb' },
              { label: 'Classes',   value: globalUniqueClassIds.length, icon: <Users size={18} />,     color: '#0891b2' },
              { label: 'Subjects',  value: globalUniqueSubjectNames.length, icon: <BookOpen size={18} />, color: '#7c3aed' },
              { label: 'Teachers',  value: globalUniqueTeacherIds.length,  icon: <GraduationCap size={18} />, color: '#16a34a' },
            ].map(s => (
              <div className="tt-stat" key={s.label}>
                <div className="tt-stat-icon" style={{ color: s.color }}>{s.icon}</div>
                <div>
                  <p className="tt-stat-value" style={{ color: s.color }}>{s.value}</p>
                  <p className="tt-stat-label">{s.label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* ── Grid ── */}
          {globalFilteredSlots.length === 0 ? (
            <div className="tt-empty">
              <Calendar size={48} />
              <p>No timetable entries match the current filters</p>
              <span>Try adjusting the filters above to see more data.</span>
            </div>
          ) : (
            <div className="tt-grid-wrapper">
              <div className="tt-grid-header">
                <h3 className="tt-grid-title">
                  <GraduationCap size={18} /> {globalFilterLabel} — Weekly Timetable
                </h3>
                <div className="tt-grid-header-actions">
                  <button className="tt-print-btn" onClick={handleGlobalPrint}>
                    <Download size={15} /> Download PDF
                  </button>
                  {globalIsMobile && (
                    <div className="tt-day-nav">
                      <button onClick={globalPrevDay} disabled={globalDayIdx === 0}><ChevronLeft size={16} /></button>
                      <span className="tt-day-nav-label">{globalSelectedDay}</span>
                      <button onClick={globalNextDay} disabled={globalDayIdx === DAYS.length - 1}><ChevronRight size={16} /></button>
                    </div>
                  )}
                </div>
              </div>

              <div className="tt-grid-scroll">
                <div ref={globalPrintRef} className="tt-print-area">
                  <div className="tt-print-school-name">{schoolName?.toUpperCase()}</div>
                  <div className="tt-print-heading">{globalFilterLabel} — Weekly Timetable</div>
                  <table className="tt-grid-table tt-print-table">
                    <thead>
                      <tr>
                        <th className="tt-grid-th tt-grid-th-day">DAY</th>
                        {globalActiveSlots.map(slot => (
                          <th key={slot.key} className={`tt-grid-th ${slot.type === 'break' ? 'tt-grid-th-break' : 'tt-grid-th-period'}`}>
                            {slot.type === 'lesson'
                              ? <span className="tt-grid-time-label">{slot.label}</span>
                              : <span className="tt-grid-break-time">{slot.label}</span>
                            }
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(globalIsMobile ? [globalSelectedDay] : DAYS).map((day, di) => (
                        <tr key={day} className="tt-grid-row">
                          <td className="tt-grid-td tt-grid-td-day"><span>{DAY_SHORT[day]}</span></td>
                          {globalActiveSlots.map(slot => {
                            if (slot.type === 'break') {
                              if (globalIsMobile) {
                                return (
                                  <td key={slot.key} className="tt-grid-td tt-grid-td-break">
                                    <span className="tt-break-label">{slot.breakLabel}</span>
                                  </td>
                                )
                              }
                              if (di === 0) return (
                                <td key={slot.key} className={`tt-grid-td tt-grid-td-break tt-break-${slot.key}`} rowSpan={DAYS.length}>
                                  <span className="tt-break-label">{slot.breakLabel}</span>
                                </td>
                              )
                              return null
                            }

                            const entries = globalGetEntries(day, slot.period)

                            return (
                              <td key={slot.key} className="tt-grid-td tt-grid-td-cell" style={{ height: 'auto', minHeight: 56 }}>
                                {entries.length > 0 ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '3px 2px' }}>
                                    {entries.map((e, i) => {
                                      const bg = e.subject_name ? subjectColour(e.subject_name) : '#f1f5f9'
                                      return (
                                        <div key={i} style={{
                                          display: 'flex', alignItems: 'center', gap: 3,
                                          background: bg, borderRadius: 4, padding: '2px 5px',
                                          fontSize: 10, fontWeight: 700,
                                        }}
                                          title={`${e.subject_name || ''} — ${e.class_name || ''}${e.teacher_name ? ' — ' + e.teacher_name : ''}`}
                                        >
                                          <span style={{ fontStyle: 'italic', color: '#0f172a', whiteSpace: 'nowrap' }}>
                                            {e.subject_code || e.subject_name?.slice(0, 4)?.toUpperCase() || '—'}
                                          </span>
                                          <span style={{ color: '#475569', fontWeight: 600 }}>–</span>
                                          <span style={{ color: '#1d4ed8', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                            {e.class_name || ''}
                                          </span>
                                        </div>
                                      )
                                    })}
                                  </div>
                                ) : (
                                  <span className="tt-grid-dash">–</span>
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="tt-print-footer">
                    <div className="tt-print-footer-left">PREPARED BY ……………………………………………………………</div>
                    <div className="tt-print-footer-right">SCHOOL STAMP……………………………………………………………</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════
          CONFLICTS TAB
      ══════════════════════════════════════════════ */}
      {activeTab === 'conflicts' && (
        <div className="adm-tt-conflicts">
          <div className="adm-tt-card">
            <div className="adm-tt-card-header">
              <AlertTriangle size={17} />
              <h3>Conflict &amp; Validation Report</h3>
              <button className="adm-tt-new-btn" style={{ marginLeft: 'auto' }} onClick={() => {
                const errors = validateSlots(timetableSlots, teachers, classRequirements, subjects)
                setConflicts(errors)
                showSuccess('Revalidated.')
              }}>
                <RefreshCw size={14} /> Revalidate
              </button>
            </div>
            <p className="adm-tt-card-desc">
              Hard errors (red) must be fixed before saving. Warnings (orange) are KICD soft-rule violations.
            </p>

            {conflicts.length === 0 ? (
              <div className="adm-tt-empty">
                <CheckCircle size={36} style={{ color: '#16a34a' }} />
                <p style={{ color: '#16a34a', fontWeight: 600 }}>No conflicts detected — timetable is valid!</p>
              </div>
            ) : (
              <div className="adm-conflict-list adm-conflict-full">
                {['error', 'warning', 'info'].map(sev => {
                  const group = conflicts.filter(c =>
                    (c.severity === sev) ||
                    (!c.severity && sev === 'error' && (c.type === 'teacher_conflict' || c.type === 'class_conflict' || c.type === 'missing_lesson'))
                  )
                  if (!group.length) return null
                  return (
                    <div key={sev} className="adm-conflict-group">
                      <div className={`adm-conflict-group-header adm-cg-${sev}`}>
                        <AlertTriangle size={14} />
                        {sev === 'error' ? 'Hard Errors' : sev === 'warning' ? 'Warnings (KICD Soft Rules)' : 'Info'}
                        <span className="adm-conflict-badge">{group.length}</span>
                      </div>
                      {group.map((c, i) => (
                        <div key={i} className={`adm-conflict-item adm-conflict-${sev}`}>
                          <div className="adm-conflict-type">{c.type?.replace(/_/g, ' ')}</div>
                          <div className="adm-conflict-msg">{c.message}</div>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          TEACHER MODAL
      ══════════════════════════════════════════════ */}
      {showTeacherModal && (
        <div className="adm-tt-overlay" onClick={e => e.target === e.currentTarget && setShowTeacherModal(false)}>
          <div className="adm-tt-modal">
            <div className="adm-modal-header">
              <h3>{editTeacher ? 'Edit Teacher' : 'Add Teacher'}</h3>
              <button onClick={() => setShowTeacherModal(false)}><X size={18} /></button>
            </div>
            <div className="adm-modal-body">
              <div className="form-grid">
                <div className="form-field full">
                  <label>Full Name *</label>
                  <input placeholder="e.g. Jane Mwangi" value={teacherForm.full_name}
                    onChange={e => setTeacherForm({ ...teacherForm, full_name: e.target.value })} />
                </div>
                <div className="form-field">
                  <label>Staff Number / Code</label>
                  <input placeholder="e.g. TSC001" value={teacherForm.staff_number || ''}
                    onChange={e => setTeacherForm({ ...teacherForm, staff_number: e.target.value })} />
                </div>
                <div className="form-field">
                  <label>Email</label>
                  <input type="email" placeholder="teacher@school.ac.ke" value={teacherForm.email || ''}
                    onChange={e => setTeacherForm({ ...teacherForm, email: e.target.value })} />
                </div>
                <div className="form-field">
                  <label>Max Lessons / Day</label>
                  <input type="number" min="1" max="9" value={teacherForm.maximum_lessons_per_day || 6}
                    onChange={e => setTeacherForm({ ...teacherForm, maximum_lessons_per_day: Number(e.target.value) })} />
                </div>
                <div className="form-field">
                  <label>Max Lessons / Week</label>
                  <input type="number" min="1" max="45" value={teacherForm.maximum_lessons_per_week || 30}
                    onChange={e => setTeacherForm({ ...teacherForm, maximum_lessons_per_week: Number(e.target.value) })} />
                </div>
                <div className="form-field full">
                  <label>Status</label>
                  <select value={teacherForm.active_status ? 'true' : 'false'}
                    onChange={e => setTeacherForm({ ...teacherForm, active_status: e.target.value === 'true' })}>
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="adm-modal-footer">
              <button className="adm-cancel-btn" onClick={() => setShowTeacherModal(false)}>Cancel</button>
              <button className="adm-save-btn" onClick={saveTeacher} disabled={savingTeacher}>
                <Save size={15} /> {savingTeacher ? 'Saving…' : editTeacher ? 'Update' : 'Add Teacher'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          CLASS MODAL
      ══════════════════════════════════════════════ */}
      {showClassModal && (
        <div className="adm-tt-overlay" onClick={e => e.target === e.currentTarget && setShowClassModal(false)}>
          <div className="adm-tt-modal">
            <div className="adm-modal-header">
              <h3>{editClass ? 'Edit Class' : 'Add Class'}</h3>
              <button onClick={() => setShowClassModal(false)}><X size={18} /></button>
            </div>
            <div className="adm-modal-body">
              <div className="form-grid">
                <div className="form-field">
                  <label>Class Name *</label>
                  <input placeholder="e.g. Grade 7, PP1, Form 2" value={classForm.class_name}
                    onChange={e => setClassForm({ ...classForm, class_name: e.target.value })} />
                </div>
                <div className="form-field">
                  <label>Stream</label>
                  <input placeholder="e.g. East, Blue, A" value={classForm.stream || ''}
                    onChange={e => setClassForm({ ...classForm, stream: e.target.value })} />
                </div>
                <div className="form-field">
                  <label>Level</label>
                  <select value={classForm.level || ''} onChange={e => setClassForm({ ...classForm, level: e.target.value })}>
                    <option value="">Select level</option>
                    <option>PP1</option><option>PP2</option>
                    <option>Grade 1</option><option>Grade 2</option><option>Grade 3</option>
                    <option>Grade 4</option><option>Grade 5</option><option>Grade 6</option>
                    <option>Grade 7</option><option>Grade 8</option><option>Grade 9</option>
                    <option>Grade 10</option><option>Grade 11</option><option>Grade 12</option>
                  </select>
                </div>
                <div className="form-field">
                  <label>Academic Year</label>
                  <input value={classForm.academic_year || '2025'}
                    onChange={e => setClassForm({ ...classForm, academic_year: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="adm-modal-footer">
              <button className="adm-cancel-btn" onClick={() => setShowClassModal(false)}>Cancel</button>
              <button className="adm-save-btn" onClick={saveClass} disabled={savingClass}>
                <Save size={15} /> {savingClass ? 'Saving…' : editClass ? 'Update' : 'Add Class'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          SLOT EDIT MODAL
      ══════════════════════════════════════════════ */}
      {showSlotForm && (
        <div className="adm-tt-overlay" onClick={e => e.target === e.currentTarget && setShowSlotForm(false)}>
          <div className="adm-tt-modal">
            <div className="adm-modal-header">
              <h3>{editSlot ? 'Edit Lesson' : 'Add Lesson'}</h3>
              <button onClick={() => setShowSlotForm(false)}><X size={18} /></button>
            </div>
            {error && <div className="adm-tt-error" style={{ margin: '0 24px' }}>{error}</div>}
            <div className="adm-modal-body">
              <div className="form-grid">
                <div className="form-field">
                  <label>Day *</label>
                  <select value={slotForm.day} onChange={e => setSlotForm({ ...slotForm, day: e.target.value })}>
                    {DAYS.map(d => <option key={d}>{d}</option>)}
                  </select>
                </div>
                <div className="form-field">
                  <label>Period *</label>
                  <select value={slotForm.start_time} onChange={e => {
                    // Use band-aware lesson slots for the selected class
                    const clsObj = classes.find(c => c.id === slotForm.class_id)
                    const bandSlots = getTimeSlotsForBand(clsObj?.level || clsObj?.class_name || '').filter(s => s.type === 'lesson')
                    const found = bandSlots.find(s => s.start === e.target.value)
                    setSlotForm({ ...slotForm, start_time: e.target.value, end_time: found?.end || '', period: found?.period })
                  }}>
                    <option value="">Select period</option>
                    {(() => {
                      const clsObj = classes.find(c => c.id === slotForm.class_id)
                      const bandSlots = getTimeSlotsForBand(clsObj?.level || clsObj?.class_name || '').filter(s => s.type === 'lesson')
                      return bandSlots.map(s => <option key={s.key} value={s.start}>{s.label}</option>)
                    })()}
                  </select>
                </div>
                <div className="form-field">
                  <label>Subject *</label>
                  <select value={slotForm.subject_id} onChange={e => setSlotForm({ ...slotForm, subject_id: e.target.value })}>
                    <option value="">Select subject</option>
                    {subjects.map(s => <option key={s.id} value={s.id}>{s.code ? `${s.code} – ${s.name}` : s.name}</option>)}
                  </select>
                </div>
                <div className="form-field">
                  <label>Class *</label>
                  <select value={slotForm.class_id} onChange={e => setSlotForm({ ...slotForm, class_id: e.target.value })}>
                    <option value="">Select class</option>
                    {classes.map(c => <option key={c.id} value={c.id}>{c.class_name} {c.stream}</option>)}
                  </select>
                </div>
                <div className="form-field full">
                  <label>Teacher</label>
                  <select value={slotForm.teacher_id} onChange={e => setSlotForm({ ...slotForm, teacher_id: e.target.value })}>
                    <option value="">Unassigned</option>
                    {teachers.map(t => <option key={t.id} value={t.id}>{t.staff_number ? `${t.staff_number} – ` : ''}{t.full_name}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="adm-modal-footer">
              {editSlot && <button className="adm-cancel-btn" style={{ color: '#dc2626', marginRight: 'auto' }}
                onClick={() => { deleteSlot(editSlot.id); setShowSlotForm(false) }}>
                <Trash2 size={13} /> Remove
              </button>}
              <button className="adm-cancel-btn" onClick={() => setShowSlotForm(false)}>Cancel</button>
              <button className="adm-save-btn" onClick={saveSlot}>
                <Save size={15} /> {editSlot ? 'Update Lesson' : 'Add Lesson'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const selectStyle = {
  padding: '6px 10px',
  fontSize: 13,
  borderRadius: 8,
  border: '1px solid #e2e8f0',
  background: '#fff',
  minWidth: 140,
}

const modeBtnStyle = (active) => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px',
  fontSize: 13, fontWeight: 600, border: '1.5px solid #e2e8f0', borderRadius: 8,
  background: active ? '#7c3aed' : '#fff',
  color: active ? '#fff' : '#475569',
  cursor: 'pointer', transition: 'all 0.15s',
})