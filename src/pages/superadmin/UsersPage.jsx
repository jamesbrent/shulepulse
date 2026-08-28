import { useState, useEffect } from 'react'
import {
  Users, Search, Filter, School, UserCog,
  Lock, Unlock, Trash2, Mail, Clock,
  ShieldCheck, UserCheck, User as UserIcon, Key
} from 'lucide-react'
import { fetchUsers, toggleUserDisabled, sendPasswordReset, deleteProfile, setUserPassword } from '../../features/superadmin/userService'
import { useAuthStore } from '../../store/authStore'
import './UsersPage.css'

const ROLE_META = {
  superadmin: { label: 'Superadmin', icon: ShieldCheck, color: '#7c3aed', bg: '#ede9fe' },
  admin: { label: 'School Admin', icon: UserCog, color: '#2563eb', bg: '#dbeafe' },
  teacher: { label: 'Teacher', icon: UserCheck, color: '#16a34a', bg: '#dcfce7' },
  parent: { label: 'Parent', icon: UserIcon, color: '#ca8a04', bg: '#fef9c3' },
}

export default function UsersPage() {
  const { profile } = useAuthStore()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [roleFilter, setRoleFilter] = useState('')
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState(null)
  const [pwdModal, setPwdModal] = useState(null)
  const [newPwd, setNewPwd] = useState('')
  const [settingPwd, setSettingPwd] = useState(false)

  const loadUsers = async () => {
    setLoading(true)
    const data = await fetchUsers({ role: roleFilter || undefined, search: search || undefined })
    setUsers(data)
    setLoading(false)
  }

  useEffect(() => {
    loadUsers()
  }, [roleFilter])

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const handleSearch = (e) => {
    e.preventDefault()
    loadUsers()
  }

  const handleToggleDisabled = async (user) => {
    try {
      const result = await toggleUserDisabled(user.id, user.full_name, user.disabled)
      showToast(`"${user.full_name || user.email}" ${result.locked ? 'locked' : 'unlocked'}`)
      loadUsers()
    } catch (err) {
      showToast(`Error: ${err.message}`)
    }
  }

  const handleResetPassword = async (user) => {
    if (!window.confirm(`Send password reset email to ${user.email}?`)) return
    try {
      await sendPasswordReset(user.email)
      showToast(`Password reset email sent to ${user.email}`)
    } catch (err) {
      showToast(`Error: ${err.message}`)
    }
  }

  const handleDelete = async (user) => {
    if (!window.confirm(`Delete user "${user.full_name || user.email}"? This cannot be undone.`)) return
    try {
      await deleteProfile(user.id, user.full_name, { callerId: profile?.id })
      showToast(`User "${user.full_name || user.email}" deleted`)
      loadUsers()
    } catch (err) {
      showToast(`Error: ${err.message}`)
    }
  }

  const handleSetPassword = async () => {
    if (!pwdModal || !newPwd) return
    if (newPwd.length < 6) {
      showToast('Error: Password must be at least 6 characters')
      return
    }
    setSettingPwd(true)
    try {
      await setUserPassword(pwdModal.id, newPwd)
      showToast(`Password updated for ${pwdModal.email}`)
      setPwdModal(null)
      setNewPwd('')
    } catch (err) {
      showToast(`Error: ${err.message}`)
    }
    setSettingPwd(false)
  }

  return (
    <div className="users-page">
      <div className="users-filters">
        <div className="users-filter-group">
          <Filter size={14} />
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="">All Roles</option>
            <option value="superadmin">Superadmin</option>
            <option value="admin">School Admin</option>
            <option value="teacher">Teacher</option>
            <option value="parent">Parent</option>
          </select>
        </div>
        <form onSubmit={handleSearch} className="users-search">
          <Search size={14} />
          <input
            placeholder="Search name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </form>
      </div>

      {loading ? (
        <div className="loading-state">Loading users...</div>
      ) : users.length === 0 ? (
        <div className="empty-state">
          <Users size={32} />
          <p>No users found</p>
        </div>
      ) : (
        <div className="users-table-wrap">
          <table className="users-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th>Role</th>
                <th>School</th>
                <th>Status</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const meta = ROLE_META[u.role] || { label: u.role, icon: UserIcon, color: '#64748b', bg: '#f1f5f9' }
                const RoleIcon = meta.icon
                return (
                  <tr key={u.id} className={u.disabled ? 'row-disabled' : ''}>
                    <td className="user-cell">
                      <div className="user-avatar" style={{ background: meta.bg, color: meta.color }}>
                        {(u.full_name || u.email || '?')[0].toUpperCase()}
                      </div>
                      <span className="user-name">{u.full_name || <span className="text-muted">—</span>}</span>
                    </td>
                    <td className="user-email">{u.email}</td>
                    <td>
                      <span className="user-role-badge" style={{ background: meta.bg, color: meta.color }}>
                        <RoleIcon size={12} />
                        {meta.label}
                      </span>
                    </td>
                    <td className="user-school">
                      <School size={13} />
                      {u.schools?.name || <span className="text-muted">—</span>}
                    </td>
                    <td>
                      <span className={`user-status-dot ${u.disabled ? 'locked' : 'active'}`} />
                      {u.disabled ? 'Locked' : 'Active'}
                    </td>
                    <td className="user-joined">
                      <Clock size={12} />
                      {u.created_at
                        ? new Date(u.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })
                        : <span className="text-muted">—</span>}
                    </td>
                    <td>
                      <div className="users-action-btns">
                        <button
                          className={`users-action-btn ${u.disabled ? 'warning' : ''}`}
                          onClick={() => handleToggleDisabled(u)}
                          title={u.disabled ? 'Unlock' : 'Lock'}
                        >
                          {u.disabled ? <Unlock size={13} /> : <Lock size={13} />}
                          {u.disabled ? 'Unlock' : 'Lock'}
                        </button>
                        <button className="users-action-btn" onClick={() => handleResetPassword(u)} title="Send Reset Email">
                          <Mail size={13} /> Email
                        </button>
                        <button className="users-action-btn" onClick={() => { setPwdModal(u); setNewPwd('') }} title="Set Password Directly">
                          <Key size={13} /> Set Pwd
                        </button>
                        <button className="users-action-btn danger" onClick={() => handleDelete(u)} title="Delete">
                          <Trash2 size={13} /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {pwdModal && (
        <div className="users-modal-overlay" onClick={() => setPwdModal(null)}>
          <div className="users-modal" onClick={e => e.stopPropagation()}>
            <h3>Set Password for {pwdModal.email}</h3>
            <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 16px' }}>
              {pwdModal.full_name || 'User'}
            </p>
            <input
              type="text"
              placeholder="New password (min 6 chars)"
              value={newPwd}
              onChange={e => setNewPwd(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, marginBottom: 16 }}
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') handleSetPassword() }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="users-action-btn" onClick={() => setPwdModal(null)}>Cancel</button>
              <button
                className="users-action-btn"
                onClick={handleSetPassword}
                disabled={settingPwd || newPwd.length < 6}
                style={{ background: '#2563eb', color: '#fff', padding: '8px 16px' }}
              >
                {settingPwd ? 'Setting...' : 'Set Password'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="onboard-toast" style={{ background: toast.startsWith('Error') ? '#ef4444' : '#16a34a' }}>
          {toast}
        </div>
      )}
    </div>
  )
}
