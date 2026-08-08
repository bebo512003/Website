'use client'

import { useState } from 'react'
import { Save } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { InlineAlert, Page, PageHeader, Panel, inputClassName, primaryButtonClassName } from '@/components/ui/page'

export default function SettingsPage() {
  const { profile, updateProfile } = useAuth()
  const [fullName, setFullName] = useState(profile?.full_name || '')
  const [phone, setPhone] = useState(profile?.phone || '')
  const [bio, setBio] = useState(profile?.bio || '')
  const [message, setMessage] = useState('')

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    const { error } = await updateProfile({ full_name: fullName, phone, bio })
    setMessage(error ? error.message : 'Profile saved.')
  }

  return <Page><PageHeader eyebrow="SETTINGS / ACCOUNT" title="Settings" description="Update the profile attached to your authenticated Supabase account." /><Panel title="Profile" description={`Role: ${profile?.role || 'employee'}`}><form onSubmit={save} className="grid gap-5 p-6 md:grid-cols-2"><label className="text-xs text-text-secondary">Full name<input className={`${inputClassName} mt-2`} value={fullName} onChange={(event) => setFullName(event.target.value)} /></label><label className="text-xs text-text-secondary">Email<input className={`${inputClassName} mt-2`} value={profile?.email || ''} disabled /></label><label className="text-xs text-text-secondary">Phone<input className={`${inputClassName} mt-2`} value={phone} onChange={(event) => setPhone(event.target.value)} /></label><label className="text-xs text-text-secondary md:col-span-2">Bio<textarea className={`${inputClassName} mt-2 min-h-24`} value={bio} onChange={(event) => setBio(event.target.value)} /></label>{message && <div className="md:col-span-2"><InlineAlert tone={message === 'Profile saved.' ? 'success' : 'error'}>{message}</InlineAlert></div>}<div className="md:col-span-2"><button className={primaryButtonClassName} type="submit"><Save className="h-4 w-4" /> Save profile</button></div></form></Panel></Page>
}
