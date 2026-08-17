import { useAuthStore } from '../../store/authStore'
import { useSchool } from '../admin/useSchool'
import { FeeStructureTab } from '../admin/fees/tabs/FeeStructureTab'

export default function FeesPage() {
  const { profile } = useAuthStore()
  const { currentTerm, currentYear } = useSchool()

  return (
    <FeeStructureTab
      profile={profile}
      term={currentTerm}
      year={currentYear}
    />
  )
}
