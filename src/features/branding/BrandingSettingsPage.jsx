import { useState, useEffect } from 'react'
import { Palette, Save, CheckCircle, RotateCcw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'
import { useBranding } from './useBranding'
import LogoUploader from '../../components/branding/LogoUploader'
import BrandPreview from '../../components/branding/BrandPreview'
import ColorPicker from '../../components/branding/ColorPicker'

const DEFAULT_PRIMARY = '#2563eb'
const DEFAULT_SECONDARY = '#16a34a'

export default function BrandingSettingsPage() {
  const { profile } = useAuthStore()
  const { applyBranding } = useBranding()

  const [logoUrl, setLogoUrl] = useState(null)
  const [schoolName, setSchoolName] = useState('')
  const [primaryColor, setPrimaryColor] = useState(DEFAULT_PRIMARY)
  const [secondaryColor, setSecondaryColor] = useState(DEFAULT_SECONDARY)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { loadBranding() }, [])

  const loadBranding = async () => {
    const { data, error } = await supabase
      .from('schools')
      .select('name, logo_url, primary_color, secondary_color')
      .eq('id', profile.school_id)
      .single()
    if (data) {
      setLogoUrl(data.logo_url || null)
      setSchoolName(data.name || '')
      setPrimaryColor(data.primary_color || DEFAULT_PRIMARY)
      setSecondaryColor(data.secondary_color || DEFAULT_SECONDARY)
    } else if (error) {
      console.error('[Branding] load error:', error)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')

    const { data: saveData, error: err } = await supabase
      .from('schools')
      .update({
        logo_url: logoUrl,
        primary_color: primaryColor,
        secondary_color: secondaryColor,
      })
      .eq('id', profile.school_id)
      .select()

    setSaving(false)
    if (err) { setError(err.message); return }
    if (!saveData || saveData.length === 0) {
      setError('Save appeared to succeed but no data was written. Run the SQL migration to fix this.')
      return
    }

    applyBranding({ logoUrl, schoolName, primaryColor, secondaryColor })
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const handleReset = () => {
    setLogoUrl(null)
    setPrimaryColor(DEFAULT_PRIMARY)
    setSecondaryColor(DEFAULT_SECONDARY)
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

          {/* Colors */}
          <div className="branding-card">
            <div className="branding-card-header">
              <Palette size={17} />
              <h3>School Colors</h3>
            </div>
            <p className="branding-card-desc">
              Set your primary and secondary colors. These will be applied across all portals and user dashboards.
            </p>
            <div className="color-pickers">
              <ColorPicker
                label="Primary Color"
                value={primaryColor}
                onChange={setPrimaryColor}
              />
              <ColorPicker
                label="Secondary Color"
                value={secondaryColor}
                onChange={setSecondaryColor}
              />
            </div>
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
            primaryColor={primaryColor}
            secondaryColor={secondaryColor}
          />
        </div>
      </div>
    </div>
  )
}
