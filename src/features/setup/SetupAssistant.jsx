import { useState, useEffect, useMemo } from 'react'
import {
  CheckCircle2, Circle, ArrowRight, Info, Sparkles,
  GraduationCap, Calendar, Users, BookOpen, ClipboardList,
  UserPlus, UserCheck, Wallet, UserCog, Clock,
  LayoutDashboard, Sparkles as SparkIcon,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useFeatureAccess } from '../access/FeatureAccessContext'
import { fetchSetupSnapshot, buildSetupSteps, setSetupChoice, markSetupCompleted } from './setupService'
import './SetupAssistant.css'

const STEP_ICONS = {
  school_info: <GraduationCap size={18} />,
  academic_year: <Calendar size={18} />,
  classes: <Users size={18} />,
  subjects: <BookOpen size={18} />,
  grading: <ClipboardList size={18} />,
  staff: <UserPlus size={18} />,
  students: <UserCheck size={18} />,
  parents: <UserCheck size={18} />,
  fees: <Wallet size={18} />,
  users: <UserCog size={18} />,
  timetable: <Clock size={18} />,
}

export default function SetupAssistant({ onNavigate, onExit }) {
  const { profile } = useAuthStore()
  const { features } = useFeatureAccess()
  const schoolId = profile?.school_id

  const [snapshot, setSnapshot] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const financeEnabled = features.includes('finance.fees')

  const load = async () => {
    if (!schoolId) return
    setLoading(true)
    setError('')
    const result = await fetchSetupSnapshot({ schoolId, profile })
    if (result.error) { setError(result.error); setLoading(false); return }
    setSnapshot(result)
    setLoading(false)
  }

  useEffect(() => { load() }, [schoolId, profile?.id])

  const { steps, overallPct, ready } = useMemo(
    () => (snapshot ? buildSetupSteps(snapshot, { financeEnabled }) : { steps: [], overallPct: 0, ready: false }),
    [snapshot, financeEnabled],
  )

  const autoSteps = steps.filter((s) => s.auto)
  const manualSteps = steps.filter((s) => !s.auto)
  const completeCount = steps.filter((s) => s.done).length

  useEffect(() => {
    if (ready && profile?.id) {
      markSetupCompleted(profile.id)
    }
  }, [ready, profile?.id])

  const exitToDashboard = () => {
    setSetupChoice(profile?.id, 'dashboard')
    onExit?.()
  }

  if (!schoolId) {
    return <div className="su-root"><div className="su-message">No school linked to your account yet.</div></div>
  }

  if (loading) {
    return <div className="su-root"><div className="su-loading">Checking your school setup…</div></div>
  }

  return (
    <div className="su-root">
      <div className="su-header">
        <div className="su-header-left">
          <div className="su-title-badge"><SparkIcon size={18} /></div>
          <div>
            <h2>Setup Assistant</h2>
            <p>Follow the recommended order to get your school fully operational. Open any module to see the real ShulePulse tools — everything you complete here appears in the normal dashboard too.</p>
          </div>
        </div>
        <button className="su-exit-btn" onClick={exitToDashboard}>
          <LayoutDashboard size={15} /> Go to Dashboard
        </button>
      </div>

      {error && <div className="su-error">{error}</div>}

      <div className="su-progress-card">
        <div className="su-progress-top">
          <div>
            <span className="su-progress-label">Overall completion</span>
            <span className="su-progress-value">{overallPct}%</span>
          </div>
          <div className="su-progress-status">
            {ready ? (
              <span className="su-ready"><CheckCircle2 size={16} /> Ready for full operation</span>
            ) : (
              <span className="su-not-ready"><Info size={16} /> {steps.length - completeCount} task(s) remaining</span>
            )}
          </div>
        </div>
        <div className="su-progress-bar">
          <div className="su-progress-fill" style={{ width: `${overallPct}%` }} />
        </div>
      </div>

      <div className="su-section">
        <h3 className="su-section-title">
          <Sparkles size={15} /> Automatically configured
          <span className="su-section-sub">Review, no work needed</span>
        </h3>
        <div className="su-grid">
          {autoSteps.map((s) => <StepCard key={s.key} step={s} onNavigate={onNavigate} auto />)}
        </div>
      </div>

      <div className="su-section">
        <h3 className="su-section-title">
          <ClipboardList size={15} /> Setup steps
          <span className="su-section-sub">Required and recommended tasks</span>
        </h3>
        <div className="su-grid">
          {manualSteps.map((s) => <StepCard key={s.key} step={s} onNavigate={onNavigate} />)}
        </div>
      </div>
    </div>
  )
}

function StepCard({ step, onNavigate, auto }) {
  const Icon = STEP_ICONS[step.key] || <ArrowRight size={18} />
  return (
    <div className={`su-card ${step.done ? 'done' : ''} ${auto ? 'auto' : ''}`}>
      <div className="su-card-icon">{Icon}</div>
      <div className="su-card-body">
        <div className="su-card-title-row">
          <h4>{step.title}</h4>
          {step.required && <span className="su-req-badge">Required</span>}
          {auto && <span className="su-auto-badge">Auto</span>}
          <span className={`su-status ${step.done ? 'ok' : ''}`}>
            {step.done ? <><CheckCircle2 size={13} /> Complete</> : <><Circle size={13} /> {auto ? 'Review' : 'Not started'}</>}
          </span>
        </div>
        <p className="su-card-hint">{step.hint}</p>
        <div className="su-card-detail"><strong>{step.detail}</strong></div>
        <p className="su-card-why"><Info size={12} /> {step.why}</p>
      </div>
      <button className="su-open-btn" onClick={() => onNavigate?.(step.nav)} disabled={!step.nav}>
        {step.action} <ArrowRight size={14} />
      </button>
    </div>
  )
}