import { useState, useRef, useEffect } from 'react'
import { Camera, Loader, AlertCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp']

function normalizeType(file) {
  if (ALLOWED_TYPES.includes(file.type)) return file.type
  const ext = (file.name.split('.').pop() || '').toLowerCase()
  if (ext === 'png') return 'image/png'
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'webp') return 'image/webp'
  return file.type
}

export default function AvatarUpload({ className, size = 36, fallbackChar = 'U' }) {
  const { profile, user } = useAuthStore()
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState('')
  const inputRef = useRef()
  const photoUrl = profile?.photo_url
  const initial = profile?.full_name?.[0]?.toUpperCase() || fallbackChar
  const [imgError, setImgError] = useState(false)

  useEffect(() => {
    setImgError(false)
  }, [photoUrl])

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    const type = normalizeType(file)
    if (!ALLOWED_TYPES.includes(type)) {
      setErr('Please choose a PNG, JPG or WebP image.')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setErr('Image must be 2 MB or smaller.')
      return
    }

    setErr('')
    setUploading(true)
    const path = `avatars/${user.id}`

    const { error: uploadErr } = await supabase.storage
      .from('school-assets')
      .upload(path, file, { upsert: true, contentType: type })

    if (uploadErr) {
      setUploading(false)
      setErr(`Upload failed: ${uploadErr.message || 'unknown error'}`)
      return
    }

    const { data: urlData, error: urlErr } = await supabase.storage
      .from('school-assets')
      .getPublicUrl(path)

    if (urlErr || !urlData?.publicUrl) {
      setUploading(false)
      setErr(urlErr?.message || 'Could not build the photo URL.')
      return
    }

    const photoUrlWithCache = `${urlData.publicUrl}?t=${Date.now()}`

    const { error: updateErr } = await supabase
      .from('profiles')
      .update({ photo_url: photoUrlWithCache })
      .eq('id', user.id)

    if (updateErr) {
      setUploading(false)
      setErr(`Could not save photo: ${updateErr.message || 'unknown error'}`)
      return
    }

    const { data: updatedProfile } = await supabase
      .from('profiles').select('*, schools(*)').eq('id', user.id).single()

    useAuthStore.setState({
      profile: {
        ...updatedProfile,
        roles: updatedProfile?.roles || (updatedProfile?.role ? [updatedProfile.role] : []),
      },
    })
    setUploading(false)
    setImgError(false)
  }

  const style = {
    width: size,
    height: size,
    fontSize: size * 0.38,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
    cursor: 'pointer',
    flexShrink: 0,
  }

  return (
    <div className={className} style={{ ...style, flexDirection: 'column', overflow: 'visible' }}>
      <div
        style={{ ...style, position: 'relative' }}
        onClick={() => inputRef.current?.click()}
        title="Click to change photo"
      >
        {photoUrl && !imgError ? (
          <img
            src={photoUrl}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
            onError={() => setImgError(true)}
          />
        ) : (
          initial
        )}
        <div className="avatar-upload-overlay">
          {uploading ? <Loader size={size * 0.35} className="spin" /> : <Camera size={size * 0.35} />}
        </div>
      </div>
      {err && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, color: '#dc2626', fontSize: 11, fontWeight: 500, maxWidth: size * 4 }}>
          <AlertCircle size={12} style={{ flexShrink: 0 }} />
          {err}
        </span>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={handleFile}
        style={{ display: 'none' }}
      />
    </div>
  )
}
