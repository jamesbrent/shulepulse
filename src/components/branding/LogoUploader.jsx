import { useState, useRef } from 'react'
import { Upload, X, Image } from 'lucide-react'
import { supabase } from '../../lib/supabase'

export default function LogoUploader({ schoolId, currentUrl, onUploaded }) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef()

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    const allowed = ['image/png', 'image/jpeg', 'image/webp']
    if (!allowed.includes(file.type)) {
      setError('Only PNG, JPG or WEBP allowed. SVG is disabled for security.')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('File must be under 2MB.')
      return
    }

    setUploading(true)
    setError('')

    const ext = file.name.split('.').pop()
    const path = `logos/${schoolId}.${ext}`

    const { error: uploadErr } = await supabase.storage
      .from('school-assets')
      .upload(path, file, { upsert: true, contentType: file.type })

    if (uploadErr) {
      setError(uploadErr.message)
      setUploading(false)
      return
    }

    const { data: urlData } = supabase.storage
      .from('school-assets')
      .getPublicUrl(path)

    onUploaded(urlData.publicUrl)
    setUploading(false)
  }

  const handleRemove = () => {
    onUploaded(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="logo-uploader">
      {currentUrl ? (
        <div className="logo-preview-wrap">
          <img src={currentUrl} alt="School logo" className="logo-preview-img" />
          <button type="button" className="logo-remove-btn" onClick={handleRemove}>
            <X size={14} /> Remove
          </button>
        </div>
      ) : (
        <div
          className="logo-dropzone"
          onClick={() => inputRef.current?.click()}
        >
          <Image size={28} color="#94a3b8" />
          <p className="logo-drop-text">
            {uploading ? 'Uploading...' : 'Click to upload logo'}
          </p>
          <span className="logo-drop-hint">PNG, JPG or WEBP · max 2MB</span>
        </div>
      )}
      {error && <p className="logo-error">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        style={{ display: 'none' }}
        onChange={handleFile}
      />
    </div>
  )
}