'use client'

import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { InlineAlert, Page, PageHeader, Panel, primaryButtonClassName } from "@/components/ui/page"

export default function SettingsPage() {
  const router = useRouter()
  const { profile } = useAuth()

  return (
    <Page>
      <PageHeader eyebrow="SETTINGS / ACCOUNT" title="Settings" description="Manage your account settings." />
      <Panel title="Account Settings" description="Your profile is managed in the dedicated Profile section.">
        <InlineAlert tone="info">
          Profile settings have moved to the Profile page where you can manage your personal information, professional details, social links, and security settings.
        </InlineAlert>
        <div className="mt-4">
          <button onClick={() => router.push("/profile")} className={primaryButtonClassName}>
            Go to Profile
          </button>
        </div>
        {profile && (
          <div className="mt-4 text-sm text-text-tertiary">
            <p className="font-medium text-fg">Current Role:</p>
            <p>{profile.role}</p>
          </div>
        )}
      </Panel>
    </Page>
  )
}
