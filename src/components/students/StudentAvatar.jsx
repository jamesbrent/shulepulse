export function StudentAvatar({ name, photoUrl, size = 32 }) {
  const initials = name
    ?.split(' ')
    .map(w => w[0])
    .filter(Boolean)
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?'

  const sizeStyle = { width: size, height: size, fontSize: Math.max(10, size * 0.35) }

  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name}
        className="student-avatar-img"
        style={sizeStyle}
      />
    )
  }

  return (
    <div className="student-avatar-sm" style={sizeStyle}>
      {initials}
    </div>
  )
}
