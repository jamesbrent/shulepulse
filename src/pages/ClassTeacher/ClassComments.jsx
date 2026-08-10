import { useState, useEffect } from 'react'
import { MessageSquare, Send, Trash2, Calendar, User } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'

export default function ClassComments({ teacherData, currentTerm: termProp, currentYear: yearProp, assignedClasses = [] }) {
  const { profile } = useAuthStore()
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [newComment, setNewComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [subject, setSubject] = useState('General')
  const [commentClass, setCommentClass] = useState(assignedClasses[0] || '')
  const [currentTerm, setCurrentTerm] = useState(termProp || 'Term 1')
  const [currentYear, setCurrentYear] = useState(yearProp || new Date().getFullYear())

  useEffect(() => {
    if (teacherData?.school_id) {
      fetchTermYear()
    }
  }, [teacherData])

  useEffect(() => {
    if (teacherData?.school_id && assignedClasses.length > 0) {
      fetchComments()
    }
  }, [teacherData, assignedClasses])

  const fetchTermYear = async () => {
    const { data: school } = await supabase
      .from('schools')
      .select('current_term, current_year')
      .eq('id', teacherData.school_id)
      .single()
    if (school) {
      setCurrentTerm(school.current_term)
      setCurrentYear(school.current_year)
    }
  }

  const fetchComments = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('class_comments')
      .select('*')
      .eq('school_id', teacherData.school_id)
      .in('class_name', assignedClasses)
      .order('created_at', { ascending: false })
    setComments(data || [])
    setLoading(false)
  }

  const addComment = async () => {
    if (!newComment.trim()) return
    setSaving(true)
    const email = profile?.email || (await supabase.auth.getUser()).data.user?.email
    const payload = {
      school_id: teacherData.school_id,
      class_name: commentClass || assignedClasses[0] || '',
      teacher_name: teacherData.full_name || teacherData.name || email,
      subject: subject,
      comment: newComment.trim(),
      term: currentTerm,
      year: currentYear,
    }

    const { error } = await supabase
      .from('class_comments')
      .insert(payload)

    if (error) {
      alert('Error adding comment: ' + error.message)
    } else {
      setNewComment('')
      fetchComments()
    }
    setSaving(false)
  }

  const deleteComment = async (id) => {
    if (!window.confirm('Delete this comment?')) return
    const { error } = await supabase
      .from('class_comments')
      .delete()
      .eq('id', id)
    if (!error) {
      fetchComments()
    }
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleDateString('en-KE', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    })
  }

  return (
    <div className="ct-comments-page">
      <div className="ct-comments-card">
        <div className="ct-comments-card-header">
          <MessageSquare size={18} />
          <span>Add a Comment{assignedClasses.length > 1 ? '' : ` for ${assignedClasses[0] || ''}`}</span>
        </div>
        <div className="ct-comment-form">
          <div className="ct-comment-subject-row">
            {assignedClasses.length > 1 && (
              <select
                className="ct-filter-select"
                value={commentClass}
                onChange={e => setCommentClass(e.target.value)}
                style={{ width: 160 }}
              >
                {assignedClasses.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            )}
            <select
              className="ct-filter-select"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              style={{ width: 180 }}
            >
              <option value="General">General</option>
              <option value="Academic">Academic</option>
              <option value="Behaviour">Behaviour</option>
              <option value="Attendance">Attendance</option>
              <option value="Announcement">Announcement</option>
            </select>
          </div>
          <textarea
            className="ct-comment-textarea"
            placeholder="Write your comment about the class..."
            value={newComment}
            onChange={e => setNewComment(e.target.value)}
            rows={3}
          />
          <div className="ct-comment-form-actions">
            <span className="ct-comment-char-count">{newComment.length} characters</span>
            <button
              className="ct-btn-primary"
              onClick={addComment}
              disabled={saving || !newComment.trim()}
            >
              <Send size={15} /> {saving ? 'Posting...' : 'Post Comment'}
            </button>
          </div>
        </div>
      </div>

      <div className="ct-comments-card">
        <div className="ct-comments-card-header">
          <MessageSquare size={18} />
          <span>Previous Comments ({comments.length})</span>
        </div>

        {loading ? (
          <p className="ct-text-muted" style={{ textAlign: 'center', padding: 20 }}>Loading comments...</p>
        ) : comments.length === 0 ? (
          <div className="ct-comments-empty">
            <MessageSquare size={40} color="#cbd5e1" />
            <p>No comments yet for {teacherData?.class}</p>
            <span>Add the first comment above</span>
          </div>
        ) : (
          <div className="ct-comments-list">
            {comments.map(c => (
              <div key={c.id} className="ct-comment-item">
                <div className="ct-comment-header">
                  <div className="ct-comment-meta">
                    <span className="ct-comment-author">
                      <User size={12} /> {c.teacher_name || 'Teacher'}
                    </span>
                    <span className="ct-comment-subject-badge">{c.subject || 'General'}</span>
                    <span className="ct-comment-date">
                      <Calendar size={12} /> {formatDate(c.created_at)}
                    </span>
                  </div>
                  <button
                    className="ct-comment-delete"
                    onClick={() => deleteComment(c.id)}
                    title="Delete comment"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <p className="ct-comment-text">{c.comment}</p>
                {c.term && c.year && (
                  <p className="ct-comment-term">{c.term} {c.year}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
