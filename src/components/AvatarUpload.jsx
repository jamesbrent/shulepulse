import { useState, useRef } from 'react'
import { Camera, Loader } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'

export default function AvatarUpload({ className, size = 36, fallbackChar = 'U' }) {
  const { profile, user } = useAuthStore()
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef()
  const photoUrl = profile?.photo_url
  const initial = profile?.full_name?.[0]?.toUpperCase() || fallbackChar
  const [imgError, setImgError] = useState(false)

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    const allowed = ['image/png', 'image/jpeg', 'image/webp']
    if (!allowed.includes(file.type)) return
    if (file.size > 2 * 1024 * 1024) return

    setUploading(true)
    const ext = file.name.split('.').pop()
    const path = `avatars/${user.id}.${ext}`

    const { error: uploadErr } = await supabase.storage
      .from('school-assets')
      .upload(path, file, { upsert: true, contentType: file.type })

    if (uploadErr) { setUploading(false); return }

    const { data: urlData, error: urlErr } = await supabase.storage
      .from('school-assets')
      .getPublicUrl(path)

    if (urlErr || !urlData?.publicUrl) { setUploading(false); return }

    const photoUrlWithCache = `${urlData.publicUrl}?t=${Date.now()}`

    await supabase.from('profiles').update({ photo_url: photoUrlWithCache }).eq('id', user.id)

    const { data: updatedProfile } = await supabase
      .from('profiles').select('*, schools(*)').eq('id', user.id).single()

    useAuthStore.setState({ profile: { ...updatedProfile, roles: updatedProfile?.roles || (updatedProfile?.role ? [updatedProfile.role] : []) } })
    setUploading(false)
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
    <div className={className} style={style} onClick={() => inputRef.current?.click()} title="Click to change photo">
      {photoUrl && !imgError ? (
        <img src={photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} onError={() => setImgError(true)} />
      ) : (
        initial
      )}
      <div className="avatar-upload-overlay">
        {uploading ? <Loader size={size * 0.35} className="spin" /> : <Camera size={size * 0.35} />}
      </div>
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
