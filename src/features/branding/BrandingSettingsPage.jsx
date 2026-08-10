import { useState, useEffect } from 'react'
import { Palette, Save, CheckCircle, RotateCcw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'
import { useBranding } from './useBranding'
import LogoUploader from '../../components/branding/LogoUploader'
import BrandPreview from '../../components/branding/BrandPreview'

export default function BrandingSettingsPage() {
  const { profile } = useAuthStore()
  const { applyBranding } = useBranding()

  const [logoUrl, setLogoUrl] = useState(null)
  const [schoolName, setSchoolName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { loadBranding() }, [])

  const loadBranding = async () => {
    const { data, error } = await supabase
      .from('schools')
      .select('name, logo_url')
      .eq('id', profile.school_id)
      .single()
    if (data) {
      setLogoUrl(data.logo_url || null)
      setSchoolName(data.name || '')
    } else if (error) {
      console.error('[Branding] load error:', error)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')

    const { data: saveData, error: err } = await supabase
      .from('schools')
      .update({ logo_url: logoUrl })
      .eq('id', profile.school_id)
      .select()

    setSaving(false)
    if (err) { setError(err.message); return }
    if (!saveData || saveData.length === 0) {
      setError('Save appeared to succeed but no data was written. Run the SQL migration to fix this.')
      return
    }

    applyBranding({ logoUrl, schoolName })
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const handleReset = () => {
    setLogoUrl(null)
  }

  return (
    <div className="branding-page">

      {saved && (
        <div className="branding-success">
          <CheckCircle size={15} /> Branding saved and applied across all portals.
        </div>
      )}
      {error && <div className="form-error">{error}</div>}

      <div className="branding-layout">

        {/* Left — Controls */}
        <div className="branding-controls">

          {/* Logo */}
          <div className="branding-card">
            <div className="branding-card-header">
              <Palette size={17} />
              <h3>School Logo</h3>
            </div>
            <p className="branding-card-desc">
              Shown in the sidebar and on portal headers. Recommended size: 200x200px.
            </p>
            <LogoUploader
              schoolId={profile.school_id}
              currentUrl={logoUrl}
              onUploaded={setLogoUrl}
            />
          </div>

          {/* Actions */}
          <div className="branding-actions">
            <button type="button" className="btn-secondary" onClick={handleReset}>
              <RotateCcw size={14} /> Reset to Default
            </button>
            <button type="button" className="btn-primary" onClick={handleSave} disabled={saving}>
              <Save size={15} /> {saving ? 'Saving...' : 'Save Branding'}
            </button>
          </div>
        </div>

        {/* Right — Preview */}
        <div className="branding-preview-col">
          <BrandPreview
            logoUrl={logoUrl}
            schoolName={schoolName}
          />
        </div>
      </div>
    </div>
  )
}