import { useState, useEffect, Fragment } from 'react'
import {
  Award, Save, CheckCircle, Users, Search, BarChart3,
  TrendingUp, FileText, BookOpen, ChevronDown, ChevronRight,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { esc } from '../../utils/escapeHtml'
import { REPORT_CARD_STYLES } from '../../components/students/ReportCard'
import { getGrade } from '../../services/grading'

const TERM_ORDER = ['Term 1', 'Term 2', 'Term 3']

function cbcPoints(score, className) {
  return getGrade(score, className || '').points || 0
}

function cbcBand(points) {
  if (points >= 7) return 'EE'
  if (points >= 5) return 'ME'
  if (points >= 3) return 'AE'
  return 'BE'
}

function cbcBandLabel(points) {
  if (points === 8) return 'EE1'
  if (points === 7) return 'EE2'
  if (points === 6) return 'ME1'
  if (points === 5) return 'ME2'
  if (points === 4) return 'AE1'
  if (points === 3) return 'AE2'
  if (points === 2) return 'BE1'
  return 'BE2'
}

const CBC_BAND_COLORS = {
  EE: { bg: '#dcfce7', color: '#16a34a', label: 'Exceeding Expectations' },
  ME: { bg: '#dbeafe', color: '#2563eb', label: 'Meeting Expectations' },
  AE: { bg: '#fef3c7', color: '#ca8a04', label: 'Approaching Expectations' },
  BE: { bg: '#fee2e2', color: '#dc2626', label: 'Below Expectations' },
}

const CBC_REPORT_STYLES = `
  ${REPORT_CARD_STYLES}
  .rc-wrap { max-width: 900px; }
  .rc-center-table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 8px; }
  .rc-center-table th {
    background: #1e293b; color: #fff; padding: 8px 10px;
    text-align: left; font-weight: 700; font-size: 10px;
    border: 1px solid #94a3b8; text-transform: uppercase; letter-spacing: 0.03em;
  }
  .rc-center-table td { padding: 7px 10px; border: 1px solid #cbd5e1; color: #1e293b; }
  .rc-center-table tbody tr:nth-child(even) td { background: #f8fafc; }
  .rc-center-metric-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 12px 0; }
  .rc-center-metric { padding: 10px 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; text-align: center; }
  .rc-center-metric-value { font-size: 18px; font-weight: 700; color: #0f172a; }
  .rc-center-metric-label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; margin-top: 2px; }
  .rc-center-title { font-size: 16px; font-weight: 800; color: #0f172a; text-align: center; margin: 8px 0 4px; text-transform: uppercase; letter-spacing: 0.5px; }
  .rc-center-subtitle { font-size: 11px; color: #64748b; text-align: center; margin-bottom: 10px; }
  .rc-center-section-title { font-size: 12px; font-weight: 700; color: #0f172a; text-transform: uppercase; letter-spacing: 0.3px; margin: 14px 0 8px; }
  .rc-center-footer { text-align: center; font-size: 9px; color: #94a3b8; margin-top: 16px; padding-top: 8px; border-top: 1px solid #e2e8f0; }
  @media print {
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
    body { margin: 0; padding: 0; }
    .rc-wrap { width: 100%; max-width: none; padding: 12px 16px; }
  }
`

function buildCBCReportHtml(bodyContent, title, school, term, year) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${esc(title)} – ${esc(term)} ${esc(year)}</title>
<style>${CBC_REPORT_STYLES}</style></head><body>
<div class="rc-wrap">
  <div class="rc-top">
    <div class="rc-logo-box">
      ${school?.logo_url ? `<img src="${esc(school.logo_url)}" alt="Logo" />` : `<div class="rc-logo-placeholder">${esc((school?.name || 'S')[0])}</div>`}
    </div>
    <div class="rc-school-block">
      <div class="rc-school-name">${esc(school?.name || 'School')}</div>
      ${school?.address ? `<div class="rc-school-contact">${esc(school.address)}${school.phone ? ' · ' + esc(school.phone) : ''}${school.email ? ' · ' + esc(school.email) : ''}</div>` : ''}
      ${school?.motto ? `<div class="rc-school-contact" style="font-style:italic">"${esc(school.motto)}"</div>` : ''}
    </div>
  </div>
  <hr class="rc-hr" />
  ${bodyContent}
  <div class="rc-center-footer">Generated on ${new Date().toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' })} · ${esc(term)} ${esc(year)}</div>
</div></body></html>`
}

function printCBCReport(html) {
  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(html)
  win.document.close()
  win.onload = () => { win.focus(); win.print() }
}

export default function CBCCompetency({ profile, mode }) {
  const [activeTab, setActiveTab] = useState('proficiency')
  const [students, setStudents] = useState([])
  const [teacherClasses, setTeacherClasses] = useState([])
  const [teacherSubjects, setTeacherSubjects] = useState([])
  const [allClasses, setAllClasses] = useState([])
  const [competencyAreas, setCompetencyAreas] = useState([])
  const [competencyLevels, setCompetencyLevels] = useState([])
  const [terms, setTerms] = useState([])
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear())
  const [levelColorMap, setLevelColorMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')

  const [selectedClass, setSelectedClass] = useState('')
  const [selectedSubject, setSelectedSubject] = useState('')
  const [selectedArea, setSelectedArea] = useState('')
  const [term, setTerm] = useState('')
  const [year, setYear] = useState('')
  const [search, setSearch] = useState('')
  const [ratings, setRatings] = useState({})

  const [grades, setGrades] = useState([])
  const [subjectsList, setSubjectsList] = useState([])
  const [filterClass, setFilterClass] = useState('all')
  const [expandedClass, setExpandedClass] = useState(null)
  const [schoolData, setSchoolData] = useState(null)

  const isAdmin = mode === 'admin'

  useEffect(() => {
    if (isAdmin) {
      fetchAdminData()
    } else if (profile?.school_id) {
      fetchData()
    }
  }, [profile, isAdmin])

  useEffect(() => {
    if (isAdmin && term && year) {
      fetchGradesData()
    }
  }, [isAdmin, term, year])

  const fetchAdminData = async () => {
    setLoading(true)
    const { data: profileData } = await supabase
      .from('profiles')
      .select('school_id')
      .eq('id', (await supabase.auth.getUser()).data.user.id)
      .single()
    const sid = profileData?.school_id
    if (!sid) { setLoading(false); return }

    const [{ data: cls }, { data: subs }, { data: school }] = await Promise.all([
      supabase.from('classes').select('class_name').eq('school_id', sid).order('class_name'),
      supabase.from('subjects').select('id, name').eq('school_id', sid).order('name'),
      supabase.from('schools').select('current_term, current_year, name, logo_url, address, phone, email, motto').eq('id', sid).single(),
    ])

    const classNames = cls?.map(c => c.class_name) || []
    const subNames = subs?.map(s => s.name) || []
    setAllClasses(classNames)
    setTeacherClasses(classNames)
    setTeacherSubjects(subNames)
    setSubjectsList(subs || [])
    setSchoolData(school)

    if (classNames.length > 0 && !selectedClass) setSelectedClass(classNames[0])
    if (subNames.length > 0 && !selectedSubject) setSelectedSubject(subNames[0])

    let areaNames = []
    let levelsArr = []
    const colorMap = {}
    try {
      const { data: areas } = await supabase.from('competency_areas').select('name, sort_order').eq('school_id', sid).order('sort_order')
      if (areas) areaNames = areas.map(a => a.name)
    } catch {}
    try {
      const { data: levels } = await supabase.from('competency_levels').select('value, label, color, sort_order').eq('school_id', sid).order('sort_order')
      if (levels) {
        levelsArr = levels.map(l => ({ value: l.value, label: l.label, color: l.color }))
        levels.forEach(l => { colorMap[l.value] = l.color })
      }
    } catch {}
    setCompetencyAreas(areaNames)
    setCompetencyLevels(levelsArr)
    setLevelColorMap(colorMap)
    if (areaNames.length > 0) setSelectedArea(areaNames[0])

    const schoolTerm = school?.current_term || 'Term 1'
    const schoolYear = school?.current_year || new Date().getFullYear()
    const termIdx = TERM_ORDER.indexOf(schoolTerm)
    const derivedTerms = TERM_ORDER
    setTerms(derivedTerms)
    setCurrentYear(schoolYear)
    setTerm(derivedTerms[Math.max(0, termIdx)])
    setYear(String(schoolYear))

    const { data: studentsData } = await supabase
      .from('students').select('id, full_name, class, admission_number')
      .eq('school_id', sid).eq('status', 'active').order('full_name')
    setStudents(studentsData || [])

    setLoading(false)
  }

  const fetchGradesData = async () => {
    const { data: profileData } = await supabase
      .from('profiles')
      .select('school_id')
      .eq('id', (await supabase.auth.getUser()).data.user.id)
      .single()
    const sid = profileData?.school_id
    if (!sid) return

    const { data } = await supabase
      .from('grades')
      .select('*, students!inner(full_name, class, stream, admission_number)')
      .eq('school_id', sid)
      .eq('term', term)
      .eq('year', Number(year))

    setGrades(data || [])
  }

  const fetchData = async () => {
    setLoading(true)
    const schoolId = profile.school_id

    const [{ data: teacherRec }, { data: school }] = await Promise.all([
      supabase.from('teachers').select('id').eq('email', profile.email).eq('school_id', schoolId).maybeSingle(),
      supabase.from('schools').select('current_term, current_year, name, logo_url, address, phone, email, motto').eq('id', schoolId).single(),
    ])

    setSchoolData(school)

    if (!teacherRec) { setLoading(false); return }

    const schoolTerm = school?.current_term || 'Term 1'
    const schoolYear = school?.current_year || new Date().getFullYear()
    const termIdx = TERM_ORDER.indexOf(schoolTerm)
    const derivedTerms = TERM_ORDER

    setTerms(derivedTerms)
    setCurrentYear(schoolYear)
    setTerm(derivedTerms[Math.max(0, termIdx)])
    setYear(String(schoolYear))

    let areaNames = []
    let levelsArr = []
    const colorMap = {}
    try {
      const { data: areas } = await supabase.from('competency_areas').select('name, sort_order').eq('school_id', schoolId).order('sort_order')
      if (areas) areaNames = areas.map(a => a.name)
    } catch {}
    try {
      const { data: levels } = await supabase.from('competency_levels').select('value, label, color, sort_order').eq('school_id', schoolId).order('sort_order')
      if (levels) {
        levelsArr = levels.map(l => ({ value: l.value, label: l.label, color: l.color }))
        levels.forEach(l => { colorMap[l.value] = l.color })
      }
    } catch {}
    setCompetencyAreas(areaNames)
    setCompetencyLevels(levelsArr)
    setLevelColorMap(colorMap)
    if (areaNames.length > 0) setSelectedArea(areaNames[0])

    const { data: slots } = await supabase
      .from('timetable_slots')
      .select('class_id, subject_id, classes(class_name), subjects(name)')
      .eq('teacher_id', teacherRec.id).eq('school_id', schoolId)

    const uniqueClasses = [...new Set((slots || []).map(s => s.classes?.class_name?.trim()).filter(Boolean))].sort()
    const uniqueSubjects = [...new Set((slots || []).map(s => s.subjects?.name).filter(Boolean))].sort()

    setTeacherClasses(uniqueClasses)
    setTeacherSubjects(uniqueSubjects)
    setAllClasses(uniqueClasses)
    setSubjectsList(s => s)

    if (uniqueClasses.length > 0) setSelectedClass(uniqueClasses[0])
    if (uniqueSubjects.length > 0) setSelectedSubject(uniqueSubjects[0])

    if (uniqueClasses.length > 0) {
      const { data: studentsData } = await supabase
        .from('students').select('id, full_name, class, admission_number')
        .eq('school_id', schoolId).eq('status', 'active')
        .in('class', uniqueClasses).order('full_name')
      setStudents(studentsData || [])
    } else {
      setStudents([])
    }

    const gradesRes = await supabase
      .from('grades')
      .select('*, students!inner(full_name, class, stream, admission_number)')
      .eq('school_id', schoolId)
      .eq('term', derivedTerms[Math.max(0, termIdx)])
      .eq('year', Number(schoolYear))
    setGrades(gradesRes.data || [])

    setLoading(false)
  }

  const fetchExisting = async () => {
    const sid = isAdmin ? (await supabase.from('profiles').select('school_id').eq('id', (await supabase.auth.getUser()).data.user.id).single()).data?.school_id : profile?.school_id
    if (!sid) return
    const { data } = await supabase
      .from('cbc_assessments').select('*')
      .eq('school_id', sid)
      .eq('class_name', selectedClass).eq('subject', selectedSubject)
      .eq('competency_area', selectedArea)
      .eq('term', term).eq('year', Number(year))

    const map = {}
    ;(data || []).forEach(r => { map[r.student_id] = r.competency_level })
    setRatings(prev => {
      const merged = { ...prev }
      Object.entries(map).forEach(([sid, level]) => { merged[sid] = level })
      return merged
    })
  }

  useEffect(() => {
    if (selectedClass && selectedSubject && selectedArea && activeTab === 'rating') {
      fetchExisting()
    }
  }, [selectedClass, selectedSubject, selectedArea, term, year, activeTab])

  const filteredStudents = students.filter(s => {
    const matchClass = !selectedClass || s.class === selectedClass
    const matchSearch = search
      ? s.full_name?.toLowerCase().includes(search.toLowerCase()) || s.admission_number?.toLowerCase().includes(search.toLowerCase())
      : true
    return matchClass && matchSearch
  })

  const setRating = (studentId, level) => {
    setRatings(prev => ({ ...prev, [studentId]: level }))
  }

  const handleSave = async () => {
    setSaving(true)
    setSaveError('')
    const sid = isAdmin ? (await supabase.from('profiles').select('school_id').eq('id', (await supabase.auth.getUser()).data.user.id).single()).data?.school_id : profile?.school_id
    if (!sid) { setSaving(false); setSaveError('Could not determine school'); return }

    const email = isAdmin ? (await supabase.auth.getUser()).data.user?.email : profile.email
    const { data: teacherRec } = await supabase
      .from('teachers').select('id').eq('email', email).eq('school_id', sid).maybeSingle()
    const teacherId = teacherRec?.id || null

    const inserts = []
    filteredStudents.forEach(s => {
      const level = ratings[s.id]
      if (!level) return
      inserts.push({
        school_id: sid, student_id: s.id, class_name: selectedClass,
        subject: selectedSubject, competency_area: selectedArea,
        competency_level: level, term, year: Number(year),
        ...(teacherId ? { teacher_id: teacherId } : {}),
      })
    })
    if (inserts.length === 0) {
      setSaving(false)
      setSaveError('No ratings selected. Click a competency level button for each student first.')
      return
    }

    const { error } = await supabase
      .from('cbc_assessments').upsert(inserts, { onConflict: 'student_id,subject,competency_area,term,year' })

    setSaving(false)
    if (error) {
      setSaveError(`Save failed: ${error.message}`)
    } else {
      setSaved(true)
      setSaveError('')
      setTimeout(() => setSaved(false), 3000)
    }
  }

  const bandBarWidth = (pct) => Math.max(pct, 2)

  const classCBCAverages = (() => {
    const map = {}
    grades.forEach(g => {
      const cls = g.students?.class
      if (!cls) return
      if (!map[cls]) map[cls] = { name: cls, students: 0, scores: [], points: [], dist: { EE: 0, ME: 0, AE: 0, BE: 0 } }
      const studentKey = g.student_id
      if (!map[cls].seen) map[cls].seen = new Set()
      if (!map[cls].seen.has(studentKey)) {
        map[cls].seen.add(studentKey)
        map[cls].students += 1
      }
      if (!g.subject) return
      const score = Number(g.total_score || 0)
      const pts = cbcPoints(score, cls)
      map[cls].scores.push(score)
      map[cls].points.push(pts)
      map[cls].dist[cbcBand(pts)] += 1
    })
    return Object.values(map).map(c => {
      const ptsCount = c.points.length
      const meanPts = ptsCount > 0 ? Math.round(c.points.reduce((a, b) => a + b, 0) / ptsCount * 10) / 10 : 0
      const totalRated = Object.values(c.dist).reduce((a, b) => a + b, 0)
      const distPct = {}
      Object.keys(c.dist).forEach(b => { distPct[b] = totalRated > 0 ? Math.round((c.dist[b] / totalRated) * 100) : 0 })
      return {
        name: c.name, students: c.students, meanPoints: meanPts,
        meanGrade: cbcBandLabel(Math.round(meanPts)), band: cbcBand(Math.round(meanPts)),
        highest: c.scores.length > 0 ? Math.max(...c.scores) : 0,
        lowest: c.scores.length > 0 ? Math.min(...c.scores) : 0,
        median: (() => { const sorted = [...c.scores].sort((a, b) => a - b); const mid = Math.floor(sorted.length / 2); return sorted.length > 0 ? (sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)) : 0 })(),
        dist: distPct,
      }
    }).sort((a, b) => b.meanPoints - a.meanPoints)
  })()

  const displayedClasses = filterClass && filterClass !== 'all'
    ? classCBCAverages.filter(c => c.name === filterClass)
    : classCBCAverages

  const classSubjectBreakdown = (() => {
    if (!expandedClass) return []
    const map = {}
    grades.forEach(g => {
      if (g.students?.class !== expandedClass) return
      if (!g.subject) return
      if (!map[g.subject]) map[g.subject] = { scores: [], points: [], count: 0, bands: { EE: 0, ME: 0, AE: 0, BE: 0 } }
      const score = Number(g.total_score || 0)
      const pts = cbcPoints(score, g.students?.class)
      map[g.subject].scores.push(score)
      map[g.subject].points.push(pts)
      map[g.subject].count += 1
      map[g.subject].bands[cbcBand(pts)] += 1
    })
    return Object.entries(map).map(([name, d]) => {
      const meanPts = d.points.length > 0 ? Math.round(d.points.reduce((a, b) => a + b, 0) / d.points.length * 10) / 10 : 0
      const dist = {}
      Object.keys(d.bands).forEach(b => { dist[b] = d.count > 0 ? Math.round((d.bands[b] / d.count) * 100) : 0 })
      return { name, meanPoints: meanPts, grade: cbcBandLabel(Math.round(meanPts)), band: cbcBand(Math.round(meanPts)), count: d.count, dist }
    }).sort((a, b) => b.meanPoints - a.meanPoints)
  })()

  const overallMeanPoints = displayedClasses.length > 0
    ? Math.round(displayedClasses.reduce((s, c) => s + c.meanPoints, 0) / displayedClasses.length * 10) / 10 : 0
  const overallStudents = displayedClasses.reduce((s, c) => s + c.students, 0)
  const overallBand = cbcBand(Math.round(overallMeanPoints))

  const overallDistPct = {}
  ;['EE', 'ME', 'AE', 'BE'].forEach(b => {
    let totalInBand = 0
    displayedClasses.forEach(c => { totalInBand += Math.round(c.dist[b] * c.students / 100) })
    overallDistPct[b] = overallStudents > 0 ? Math.round((totalInBand / overallStudents) * 100) : 0
  })

  const exportClassPDF = async (cls) => {
    const win = window.open('', '_blank')
    if (!win) return

    if (!schoolData) {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('schools(name, logo_url, address, phone, email, motto)')
        .eq('id', (await supabase.auth.getUser()).data.user.id)
        .single()
      setSchoolData(profileData?.schools)
    }

    const bandColor = CBC_BAND_COLORS[cls.band]
    const allMap = {}
    grades.forEach(g => {
      if (g.students?.class !== cls.name) return
      if (!g.subject) return
      if (!allMap[g.subject]) allMap[g.subject] = { points: [], count: 0, bands: { EE: 0, ME: 0, AE: 0, BE: 0 } }
      const score = Number(g.total_score || 0)
      const pts = cbcPoints(score, g.students?.class)
      allMap[g.subject].points.push(pts)
      allMap[g.subject].count += 1
      allMap[g.subject].bands[cbcBand(pts)] += 1
    })
    const subjectTableRows = Object.entries(allMap).map(([name, d]) => {
      const meanPts = d.points.length > 0 ? Math.round(d.points.reduce((a, b) => a + b, 0) / d.points.length * 10) / 10 : 0
      const dist = {}
      Object.keys(d.bands).forEach(b => { dist[b] = d.count > 0 ? Math.round((d.bands[b] / d.count) * 100) : 0 })
      const sBand = CBC_BAND_COLORS[cbcBand(Math.round(meanPts))]
      return `<tr>
        <td style="font-weight:500">${esc(name)}</td>
        <td style="text-align:center;font-weight:700;color:${sBand?.color || '#64748b'}">${meanPts}/8</td>
        <td style="text-align:center"><span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;background:${sBand?.bg || '#f1f5f9'};color:${sBand?.color || '#64748b'}">${cbcBandLabel(Math.round(meanPts))}</span></td>
        <td style="text-align:center">${dist.EE}%</td><td style="text-align:center">${dist.ME}%</td><td style="text-align:center">${dist.AE}%</td><td style="text-align:center">${dist.BE}%</td>
      </tr>`
    }).sort((a, b) => a.localeCompare(b)).join('')

    const distBarHtml = ['EE', 'ME', 'AE', 'BE'].map(band =>
      `<div style="text-align:center;flex:1;padding:12px 8px;background:${CBC_BAND_COLORS[band].bg};border-radius:8px;border:1px solid ${CBC_BAND_COLORS[band].color}22">
        <div style="font-size:24px;font-weight:700;color:${CBC_BAND_COLORS[band].color}">${cls.dist[band]}%</div>
        <div style="font-size:11px;font-weight:600;color:${CBC_BAND_COLORS[band].color};margin-top:2px">${band}</div>
        <div style="font-size:9px;color:#64748b">${CBC_BAND_COLORS[band].label}</div>
      </div>`
    ).join('')

    const body = `
      <div class="rc-center-title">${esc(cls.name)} - CBC Proficiency Report</div>
      <div class="rc-center-subtitle">${esc(term)} ${esc(year)} · ${cls.students} students</div>
      <div class="rc-center-metric-grid">
        <div class="rc-center-metric"><div class="rc-center-metric-value" style="color:${bandColor?.color || '#64748b'}">${cls.meanPoints}/8</div><div class="rc-center-metric-label">Mean Points</div></div>
        <div class="rc-center-metric"><div class="rc-center-metric-value" style="color:${bandColor?.color || '#64748b'}">${cls.meanGrade}</div><div class="rc-center-metric-label">Grade</div></div>
        <div class="rc-center-metric"><div class="rc-center-metric-value" style="color:#16a34a">${cls.highest}</div><div class="rc-center-metric-label">Highest</div></div>
        <div class="rc-center-metric"><div class="rc-center-metric-value" style="color:#dc2626">${cls.lowest}</div><div class="rc-center-metric-label">Lowest</div></div>
      </div>
      <div class="rc-center-section-title">Proficiency Distribution</div>
      <div style="display:flex;gap:10px;margin-bottom:16px">${distBarHtml}</div>
      <div class="rc-center-section-title">Subject Breakdown</div>
      <table class="rc-center-table"><thead><tr><th>Subject</th><th style="text-align:center">Mean Points</th><th style="text-align:center">Grade</th><th style="text-align:center">EE</th><th style="text-align:center">ME</th><th style="text-align:center">AE</th><th style="text-align:center">BE</th></tr></thead><tbody>${subjectTableRows}</tbody></table>
    `
    const html = buildCBCReportHtml(body, `${cls.name} CBC Proficiency`, schoolData, term, year)
    win.document.write(html)
    win.document.close()
    win.onload = () => { win.focus(); win.print() }
  }

  if (loading) return <p className="loading-state">Loading CBC data...</p>

  return (
    <div className="cbc-page">
      <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #e2e8f0', marginBottom: 4 }}>
        {[
          { key: 'proficiency', label: 'CBC Proficiency', icon: <BarChart3 size={15} /> },
          { key: 'rating', label: 'Competency Rating', icon: <Award size={15} /> },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px',
              fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', background: 'none',
              borderBottom: activeTab === tab.key ? '2px solid #2563eb' : '2px solid transparent',
              color: activeTab === tab.key ? '#2563eb' : '#64748b', marginBottom: -2,
              transition: 'all 0.15s',
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'proficiency' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <select className="filter-select" value={filterClass} onChange={e => { setFilterClass(e.target.value); setExpandedClass(null) }}>
              <option value="all">All Classes</option>
              {allClasses.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className="filter-select" value={term} onChange={e => setTerm(e.target.value)}>
              {terms.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select className="filter-select" value={year} onChange={e => setYear(e.target.value)}>
              {[currentYear - 1, currentYear, currentYear + 1].map(y => <option key={y} value={String(y)}>{y}</option>)}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            <div className="ct-perf-sum-card blue" style={{ padding: 20, borderRadius: 12 }}>
              <Users size={20} />
              <div><p className="ct-psc-label">Classes</p><p className="ct-psc-value">{displayedClasses.length}</p></div>
            </div>
            <div className="ct-perf-sum-card purple" style={{ padding: 20, borderRadius: 12 }}>
              <BarChart3 size={20} />
              <div><p className="ct-psc-label">Overall Mean</p><p className="ct-psc-value" style={{ color: CBC_BAND_COLORS[overallBand]?.color }}>{overallMeanPoints}/8</p></div>
            </div>
            <div className="ct-perf-sum-card green" style={{ padding: 20, borderRadius: 12 }}>
              <TrendingUp size={20} />
              <div><p className="ct-psc-label">Total Students</p><p className="ct-psc-value">{overallStudents}</p></div>
            </div>
            <div className="ct-perf-sum-card red" style={{ padding: 20, borderRadius: 12 }}>
              <Award size={20} />
              <div><p className="ct-psc-label">Top Class</p><p className="ct-psc-value" style={{ color: '#16a34a' }}>{displayedClasses.length > 0 ? `${displayedClasses[0].name} (${displayedClasses[0].meanPoints}/8)` : '\u2014'}</p></div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {['EE', 'ME', 'AE', 'BE'].map(band => (
              <div key={band} style={{ textAlign: 'center', padding: '14px 10px', background: CBC_BAND_COLORS[band].bg, borderRadius: 10, border: `1px solid ${CBC_BAND_COLORS[band].color}22` }}>
                <div style={{ fontSize: 26, fontWeight: 700, color: CBC_BAND_COLORS[band].color }}>{overallDistPct[band]}%</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: CBC_BAND_COLORS[band].color, marginTop: 2 }}>{band}</div>
                <div style={{ fontSize: 10, color: '#64748b' }}>{CBC_BAND_COLORS[band].label}</div>
              </div>
            ))}
          </div>

          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <table className="att-table" style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th>Class</th>
                  <th style={{ textAlign: 'center' }}>Students</th>
                  <th style={{ textAlign: 'center' }}>Mean Points</th>
                  <th style={{ textAlign: 'center' }}>Grade</th>
                  <th>Proficiency</th>
                  <th style={{ textAlign: 'center' }}>Highest</th>
                  <th style={{ textAlign: 'center' }}>Lowest</th>
                  <th style={{ textAlign: 'center' }}>Median</th>
                  <th style={{ textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayedClasses.map(c => {
                  const bColor = CBC_BAND_COLORS[c.band]
                  const isExpanded = expandedClass === c.name
                  return (
                    <Fragment key={c.name}>
                      <tr onClick={() => setExpandedClass(prev => prev === c.name ? null : c.name)} style={{ cursor: 'pointer' }}>
                        <td style={{ fontWeight: 600 }}>{c.name}</td>
                        <td style={{ textAlign: 'center' }}>{c.students}</td>
                        <td style={{ textAlign: 'center', fontWeight: 700, color: bColor?.color }}>{c.meanPoints}/8</td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: bColor?.bg, color: bColor?.color }}>{c.meanGrade}</span>
                        </td>
                        <td style={{ minWidth: 180 }}>
                          <div style={{ display: 'flex', gap: 2, height: 6, borderRadius: 3, overflow: 'hidden' }}>
                            {['EE', 'ME', 'AE', 'BE'].map(band => (
                              <div key={band} style={{ width: `${bandBarWidth(c.dist[band])}%`, background: CBC_BAND_COLORS[band].color }} />
                            ))}
                          </div>
                          <div style={{ display: 'flex', gap: 6, marginTop: 4, justifyContent: 'center' }}>
                            {['EE', 'ME', 'AE', 'BE'].map(band => (
                              <span key={band} style={{ color: CBC_BAND_COLORS[band].color, fontSize: 9 }}>{band} {c.dist[band]}%</span>
                            ))}
                          </div>
                        </td>
                        <td style={{ textAlign: 'center', color: '#16a34a', fontWeight: 500 }}>{c.highest}</td>
                        <td style={{ textAlign: 'center', color: '#dc2626', fontWeight: 500 }}>{c.lowest}</td>
                        <td style={{ textAlign: 'center', color: '#64748b' }}>{c.median}</td>
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                            <button
                              onClick={(e) => { e.stopPropagation(); setExpandedClass(prev => prev === c.name ? null : c.name) }}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6,
                                border: '1px solid #e2e8f0', background: isExpanded ? '#ede9fe' : '#fff', color: '#6b21a8',
                                fontSize: 11, fontWeight: 500, cursor: 'pointer',
                              }}
                            >
                              {isExpanded ? 'Close' : 'Subjects'}
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); exportClassPDF(c) }}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6,
                                border: '1px solid #e2e8f0', background: '#fff', color: '#dc2626',
                                fontSize: 11, fontWeight: 500, cursor: 'pointer',
                              }}
                            >
                              <FileText size={12} /> PDF
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${c.name}-detail`}>
                          <td colSpan={9} style={{ padding: 0, background: '#faf5ff', borderBottom: '2px solid #e2e8f0' }}>
                            <div style={{ padding: 20 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                                <span style={{ fontWeight: 700, fontSize: 14 }}>{c.name}</span>
                                <span style={{ fontSize: 12, color: '#64748b' }}>{c.students} students</span>
                                <span style={{ padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: bColor?.bg, color: bColor?.color }}>
                                  Mean: {c.meanPoints}/8 — {c.meanGrade}
                                </span>
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
                                {['EE', 'ME', 'AE', 'BE'].map(band => (
                                  <div key={band} style={{ padding: '12px 10px', background: CBC_BAND_COLORS[band].bg, borderRadius: 8, textAlign: 'center' }}>
                                    <div style={{ fontSize: 20, fontWeight: 700, color: CBC_BAND_COLORS[band].color }}>{c.dist[band]}%</div>
                                    <div style={{ fontSize: 11, fontWeight: 600, color: CBC_BAND_COLORS[band].color }}>{band}</div>
                                  </div>
                                ))}
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                                {classSubjectBreakdown.map((s, si) => {
                                  const sBand = CBC_BAND_COLORS[s.band]
                                  return (
                                    <div key={si} style={{ padding: 14, background: '#fff', borderRadius: 10, borderLeft: `3px solid ${sBand?.color || '#94a3b8'}`, border: '1px solid #e2e8f0' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                        <span style={{ fontWeight: 600, fontSize: 13 }}>{s.name}</span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                          <span style={{ fontWeight: 700, color: sBand?.color || '#64748b' }}>{s.meanPoints}/8</span>
                                          <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: sBand?.bg, color: sBand?.color }}>{s.grade}</span>
                                        </div>
                                      </div>
                                      <div style={{ height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden', display: 'flex', marginBottom: 6 }}>
                                        {['EE', 'ME', 'AE', 'BE'].map(band => (
                                          <div key={band} style={{ width: `${bandBarWidth(s.dist[band])}%`, background: CBC_BAND_COLORS[band].color }} />
                                        ))}
                                      </div>
                                      <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                                        {['EE', 'ME', 'AE', 'BE'].map(band => (
                                          <span key={band} style={{ color: CBC_BAND_COLORS[band].color, fontSize: 9 }}>{band} {s.dist[band]}%</span>
                                        ))}
                                      </div>
                                    </div>
                                  )
                                })}
                                {classSubjectBreakdown.length === 0 && <span style={{ color: '#94a3b8', fontSize: 13 }}>No subject data</span>}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'rating' && (
        <>
          {teacherClasses.length === 0 ? (
            <div className="empty-att">
              <Award size={40} color="#cbd5e1" />
              <p>No classes assigned</p>
              <span>You need to be assigned classes in the timetable first</span>
            </div>
          ) : (
            <>
              <div className="att-toolbar">
                <div className="att-toolbar-left">
                  <select className="filter-select" value={selectedClass} onChange={e => { setSelectedClass(e.target.value); setRatings({}) }}>
                    {teacherClasses.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select className="filter-select" value={selectedSubject} onChange={e => { setSelectedSubject(e.target.value); setRatings({}) }}>
                    {teacherSubjects.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <select className="filter-select" value={selectedArea} onChange={e => { setSelectedArea(e.target.value); setRatings({}) }}>
                    {competencyAreas.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                  <select className="filter-select" value={term} onChange={e => setTerm(e.target.value)}>
                    {terms.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <select className="filter-select" value={year} onChange={e => setYear(e.target.value)}>
                    {[currentYear - 1, currentYear, currentYear + 1].map(y => <option key={y} value={String(y)}>{y}</option>)}
                  </select>
                  <div className="search-wrap">
                    <Search size={14} className="search-icon" />
                    <input className="search-input" placeholder="Search student..." value={search} onChange={e => setSearch(e.target.value)} />
                  </div>
                </div>
                <button className="btn-primary" onClick={handleSave} disabled={saving || filteredStudents.length === 0}>
                  {saved ? <><CheckCircle size={15} /> Saved</> : <><Save size={15} /> {saving ? 'Saving...' : 'Save Competency'}</>}
                </button>
              </div>

              {saveError && (
                <div style={{ padding: '8px 14px', borderRadius: 8, background: '#fee2e2', color: '#991b1b', fontSize: 12, fontWeight: 500, marginTop: 4 }}>
                  {saveError}
                </div>
              )}
              {saved && (
                <div style={{ padding: '8px 14px', borderRadius: 8, background: '#dcfce7', color: '#166534', fontSize: 12, fontWeight: 500, marginTop: 4 }}>
                  Competency ratings saved successfully!
                </div>
              )}

              <div className="cbc-level-legend">
                {competencyLevels.map(l => (
                  <span key={l.value} className="cbc-legend-item">
                    <span className="cbc-legend-dot" style={{ background: l.color }} />
                    {l.value} – {l.label}
                  </span>
                ))}
              </div>

              {filteredStudents.length === 0 ? (
                <div className="empty-att">
                  <Users size={40} color="#cbd5e1" />
                  <p>No students in this class</p>
                </div>
              ) : (
                <div className="att-table-wrap">
                  <table className="att-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Student</th>
                        <th>Adm No.</th>
                        <th>Competency Level</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStudents.map((s, i) => (
                        <tr key={s.id}>
                          <td className="text-muted">{i + 1}</td>
                          <td>
                            <div className="student-name-cell">
                              <div className="student-avatar-sm">
                                {s.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                              </div>
                              {s.full_name}
                            </div>
                          </td>
                          <td className="adm-no">{s.admission_number || '\u2014'}</td>
                          <td>
                            <div className="cbc-rating-group">
                              {competencyLevels.map(l => (
                                <button
                                  key={l.value}
                                  className={`cbc-rating-btn ${ratings[s.id] === l.value ? 'active' : ''}`}
                                  style={{
                                    borderColor: ratings[s.id] === l.value ? l.color : '#e2e8f0',
                                    background: ratings[s.id] === l.value ? `${l.color}15` : '#fff',
                                    color: ratings[s.id] === l.value ? l.color : '#64748b',
                                  }}
                                  onClick={() => setRating(s.id, l.value)}
                                  title={l.label}
                                >
                                  {l.value}
                                </button>
                              ))}
                            </div>
                          </td>
                          <td>
                            {ratings[s.id] ? (
                              <span className="cbe-badge" style={{
                                background: `${levelColorMap[ratings[s.id]] || '#94a3b8'}20`,
                                color: levelColorMap[ratings[s.id]] || '#94a3b8',
                              }}>
                                {ratings[s.id]}
                              </span>
                            ) : (
                              <span className="text-muted">Not rated</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
