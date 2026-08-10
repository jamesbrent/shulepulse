import { useState, useEffect } from 'react'
import {
  Phone, Mail, MessageSquare, Search, User,
  Send, Clock, Users
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'

export default function ParentCommunication({ teacherData, currentTerm, currentYear, assignedClasses = [] }) {
  const { profile } = useAuthStore()
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterClass, setFilterClass] = useState('all')
  const [selectedStudent, setSelectedStudent] = useState(null)
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [showMessages, setShowMessages] = useState(false)

  const fetchStudentsWithParents = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('students')
      .select('*')
      .eq('school_id', teacherData.school_id)
      .in('class', assignedClasses)
      .eq('status', 'active')
      .order('full_name')
    setStudents(data || [])
    setLoading(false)
  }

  const fetchMessages = async () => {
    if (!selectedStudent) return
    const { data } = await supabase
      .from('parent_messages')
      .select('*')
      .eq('school_id', teacherData.school_id)
      .eq('student_id', selectedStudent.id)
      .order('created_at', { ascending: false })
    setMessages(data || [])
  }

  useEffect(() => {
    if (assignedClasses.length > 0) {
      fetchStudentsWithParents()
    }
  }, [teacherData, assignedClasses])

  useEffect(() => {
    if (selectedStudent) {
      fetchMessages()
    }
  }, [selectedStudent])

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedStudent) return
    setSending(true)
    const email = profile?.email || (await supabase.auth.getUser()).data.user?.email
    const payload = {
      school_id: teacherData.school_id,
      student_id: selectedStudent.id,
      teacher_name: teacherData.full_name || teacherData.name || email,
      teacher_email: email,
      parent_name: selectedStudent.parent_name || selectedStudent.guardian_name || null,
      parent_phone: selectedStudent.parent_phone || selectedStudent.guardian_phone || null,
      parent_email: selectedStudent.parent_email || selectedStudent.guardian_email || null,
      message: newMessage.trim(),
      direction: 'teacher_to_parent',
      term: currentTerm,
      year: currentYear,
    }

    const { error } = await supabase
      .from('parent_messages')
      .insert(payload)

    if (error) {
      alert('Error sending message: ' + error.message)
    } else {
      setNewMessage('')
      fetchMessages()
    }
    setSending(false)
  }

  const filtered = students.filter(s => {
    if (filterClass !== 'all' && s.class !== filterClass) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        s.full_name?.toLowerCase().includes(q) ||
        s.admission_number?.toLowerCase().includes(q) ||
        s.parent_name?.toLowerCase().includes(q)
      )
    }
    return true
  })

  const formatDate = (dateStr) => {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleDateString('en-KE', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    })
  }

  return (
    <div className="ct-comm-page">
      {!showMessages ? (
        <>
          <div className="ct-comm-header-card">
            <div className="ct-comm-header-content">
              <Phone size={20} />
              <div>
                <h3>Parent Communication</h3>
                <p>Contact parents of students in {assignedClasses.length > 0 ? assignedClasses.join(', ') : 'your classes'}</p>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {assignedClasses.length > 1 && (
              <select
                className="ct-filter-select"
                value={filterClass}
                onChange={e => setFilterClass(e.target.value)}
              >
                <option value="all">All Classes</option>
                {assignedClasses.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            )}

            <div className="ct-search-wrap" style={{ flex: 1, minWidth: 200, maxWidth: 360 }}>
              <Search size={14} className="ct-search-icon" />
              <input
                className="ct-search-input"
                placeholder="Search by student or parent name..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>

          {loading ? (
            <p className="ct-text-muted" style={{ textAlign: 'center', padding: 20 }}>Loading students...</p>
          ) : filtered.length === 0 ? (
            <div className="ct-comm-empty">
              <Users size={40} color="#cbd5e1" />
              <p>No students found</p>
            </div>
          ) : (
            <div className="ct-comm-student-list">
              {filtered.map(s => (
                <div
                  key={s.id}
                  className={`ct-comm-student-card ${selectedStudent?.id === s.id ? 'selected' : ''}`}
                  onClick={() => {
                    setSelectedStudent(s)
                    setShowMessages(true)
                  }}
                >
                  <div className="ct-comm-student-avatar">
                    {s.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>
                  <div className="ct-comm-student-info">
                    <p className="ct-comm-student-name">{s.full_name}</p>
                    <p className="ct-comm-student-detail">{s.admission_number || ''} · {s.stream || ''}</p>
                    <div className="ct-comm-contact-info">
                      {s.parent_name && (
                        <span className="ct-comm-contact-item">
                          <User size={11} /> {s.parent_name}
                        </span>
                      )}
                      {s.parent_phone && (
                        <span className="ct-comm-contact-item">
                          <Phone size={11} /> {s.parent_phone}
                        </span>
                      )}
                      {s.parent_email && (
                        <span className="ct-comm-contact-item">
                          <Mail size={11} /> {s.parent_email}
                        </span>
                      )}
                      {!s.parent_name && !s.parent_phone && !s.parent_email && (
                        <span className="ct-comm-contact-item" style={{ color: '#94a3b8' }}>
                          No parent contact info
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="ct-comm-student-action">
                    <MessageSquare size={16} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="ct-comm-messages-view">
          <div className="ct-comm-messages-header">
            <button className="ct-btn-secondary" onClick={() => setShowMessages(false)}>
              ← Back to Students
            </button>
            <div className="ct-comm-messages-student">
              <div className="ct-comm-student-avatar" style={{ width: 36, height: 36, fontSize: 12 }}>
                {selectedStudent?.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </div>
              <div>
                <p className="ct-comm-student-name">{selectedStudent?.full_name}</p>
                <p className="ct-comm-student-detail">
                  {selectedStudent?.admission_number} · Parent: {selectedStudent?.parent_name || '—'} · {selectedStudent?.parent_phone || '—'}
                </p>
              </div>
            </div>
          </div>

          <div className="ct-comm-messages-list">
            {messages.length === 0 ? (
              <div className="ct-comm-empty" style={{ padding: 30 }}>
                <MessageSquare size={36} color="#cbd5e1" />
                <p>No messages yet</p>
                <span>Send your first message to the parent</span>
              </div>
            ) : (
              messages.map(m => (
                <div key={m.id} className={`ct-comm-message-item ${m.direction === 'teacher_to_parent' ? 'sent' : 'received'}`}>
                  <div className="ct-comm-message-header">
                    <span className="ct-comm-message-sender">
                      {m.direction === 'teacher_to_parent' ? 'You' : m.parent_name || 'Parent'}
                    </span>
                    <span className="ct-comm-message-date">
                      <Clock size={11} /> {formatDate(m.created_at)}
                    </span>
                  </div>
                  <p className="ct-comm-message-text">{m.message}</p>
                  {m.direction === 'teacher_to_parent' && m.teacher_name && (
                    <span className="ct-comm-message-meta">{m.teacher_name}</span>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="ct-comm-message-input">
            <textarea
              className="ct-comm-textarea"
              placeholder="Type your message to the parent..."
              value={newMessage}
              onChange={e => setNewMessage(e.target.value)}
              rows={2}
            />
            <button
              className="ct-btn-primary"
              onClick={sendMessage}
              disabled={sending || !newMessage.trim()}
            >
              <Send size={15} /> {sending ? 'Sending...' : 'Send Message'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
