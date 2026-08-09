'use client'

import { useParams } from 'next/navigation'
import { MemberProfile } from '@/components/team/member-profile'
import { Page, PageHeader } from '@/components/ui/page'

export default function TeamMemberPage() {
  const params = useParams<{ id: string }>()
  const memberId = typeof params?.id === 'string' ? params.id : ''

  return (
    <Page>
      <PageHeader
        eyebrow="PEOPLE / TEAM DIRECTORY / PROFILE"
        title="Team Member"
        description="Complete internal profile for this team member."
      />
      <MemberProfile memberId={memberId} />
    </Page>
  )
}
