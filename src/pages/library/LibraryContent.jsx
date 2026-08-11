import { useState } from 'react'
import {
  LayoutDashboard, BookOpen, ArrowLeftRight, Users, Clock,
  BookMarked, BarChart3, Receipt
} from 'lucide-react'
import './LibrarianDashboard.css'
import LibraryOverview from './LibraryOverview'
import LibraryCatalogue from './LibraryCatalogue'
import LibraryBorrowReturn from './LibraryBorrowReturn'
import LibraryMembers from './LibraryMembers'
import LibraryOverdue from './LibraryOverdue'
import LibraryReservations from './LibraryReservations'
import LibraryFines from './LibraryFines'
import LibraryReports from './LibraryReports'
import MemberProfile from './MemberProfile'

export default function LibraryContent({ schoolId, school }) {
  const [tab, setTab] = useState('dashboard')
  const [profileMemberId, setProfileMemberId] = useState(null)

  const tabs = [
    { key: 'dashboard', label: 'Overview', icon: <LayoutDashboard size={15} /> },
    { key: 'catalogue', label: 'Catalogue', icon: <BookOpen size={15} /> },
    { key: 'borrow', label: 'Borrow / Return', icon: <ArrowLeftRight size={15} /> },
    { key: 'members', label: 'Members', icon: <Users size={15} /> },
    { key: 'overdue', label: 'Overdue', icon: <Clock size={15} /> },
    { key: 'reservations', label: 'Reservations', icon: <BookMarked size={15} /> },
    { key: 'fines', label: 'Fines', icon: <Receipt size={15} /> },
    { key: 'reports', label: 'Reports', icon: <BarChart3 size={15} /> },
  ]

  const renderContent = () => {
    if (profileMemberId) {
      return (
        <MemberProfile
          schoolId={schoolId}
          memberId={profileMemberId}
          school={school}
          onNavigate={setTab}
          onBack={() => setProfileMemberId(null)}
        />
      )
    }
    switch (tab) {
      case 'catalogue':    return <LibraryCatalogue schoolId={schoolId} onNavigate={setTab} />
      case 'borrow':       return <LibraryBorrowReturn schoolId={schoolId} onOpenMember={setProfileMemberId} />
      case 'members':      return <LibraryMembers schoolId={schoolId} onOpenMember={setProfileMemberId} />
      case 'overdue':      return <LibraryOverdue schoolId={schoolId} onOpenMember={setProfileMemberId} />
      case 'reservations': return <LibraryReservations schoolId={schoolId} />
      case 'fines':        return <LibraryFines schoolId={schoolId} term={school?.current_term} year={school?.current_year} onOpenMember={setProfileMemberId} />
      case 'reports':      return <LibraryReports schoolId={schoolId} />
      default:             return <LibraryOverview schoolId={schoolId} onNavigate={setTab} />
    }
  }

  return (
    <div>
      <div className="lib-tabs" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button
            key={t.key}
            className={`lib-tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            <span className="lib-nav-icon">{t.icon}</span> {t.label}
          </button>
        ))}
      </div>
      {renderContent()}
    </div>
  )
}
