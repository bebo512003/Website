'use client'

import { useCallback, useEffect, useState } from 'react'
import { Award, BookOpen, Briefcase, Camera, GitBranch, Globe, Link, LoaderCircle, Mail, MapPin, Phone, Plus, Shield, Trash2 } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import {
  avatarStoragePathFromUrl,
  collectSocialLinks,
  deleteTeamAvatar,
  updateOwnEnhancedProfile,
  uploadTeamAvatar,
} from '@/lib/supabase/database'
import { updatePasswordAndMarkChanged, verifyCurrentPassword } from '@/lib/supabase/auth'
import {
  linkKeyLabel,
  normalizeUrl,
  isValidHttpUrl,
  PROFILE_LIMITS,
  validateCustomLink,
  validateProfileForm,
} from '@/lib/profile-validation'
import { validateFile, STORAGE_RULES } from '@/lib/storage-config'
import type { Profile } from '@/lib/supabase/types'
import { InlineAlert, Page, PageHeader, Panel, inputClassName, primaryButtonClassName, secondaryButtonClassName } from '@/components/ui/page'

const SOCIAL_PLATFORMS = [
  { key: 'linkedin', label: 'LinkedIn', icon: <Link className="h-4 w-4" /> },
  { key: 'behance', label: 'Behance', icon: <Link className="h-4 w-4" /> },
  { key: 'instagram', label: 'Instagram', icon: <Link className="h-4 w-4" /> },
  { key: 'facebook', label: 'Facebook', icon: <Link className="h-4 w-4" /> },
  { key: 'twitter', label: 'X/Twitter', icon: <Link className="h-4 w-4" /> },
  { key: 'personal_website', label: 'Personal Website', icon: <Globe className="h-4 w-4" /> },
]

const PLATFORM_KEYS = SOCIAL_PLATFORMS.map((platform) => platform.key)

type ProfileFormState = {
  full_name: string
  phone: string
  whatsapp: string
  bio: string
  job_title: string
  skills: string
  experience: string
  previous_projects: string
  certifications: string
  location: string
  portfolio_url: string
  linkedin: string
  behance: string
  instagram: string
  facebook: string
  twitter: string
  personal_website: string
}

const EMPTY_FORM: ProfileFormState = {
  full_name: '',
  phone: '',
  whatsapp: '',
  bio: '',
  job_title: '',
  skills: '',
  experience: '',
  previous_projects: '',
  certifications: '',
  location: '',
  portfolio_url: '',
  linkedin: '',
  behance: '',
  instagram: '',
  facebook: '',
  twitter: '',
  personal_website: '',
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <span role="alert" className="mt-1 block text-xs text-red-400">{message}</span>
}

function initialsFor(profile: Profile, fallbackName: string): string {
  const source = fallbackName || profile.full_name || profile.email
  return (source.trim()[0] || 'U').toUpperCase()
}

export default function UserProfilePage() {
  const { profile, user, isAdmin, refreshProfile } = useAuth()
  const [loading, setLoading] = useState(true)

  // Profile editing state (shared buffer across the personal/professional/
  // social panels — every save persists the whole buffer through one RPC).
  const [form, setForm] = useState<ProfileFormState>(EMPTY_FORM)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [profileMessage, setProfileMessage] = useState('')

  const [customSocialLinks, setCustomSocialLinks] = useState<{ key: string; url: string }[]>([])
  const [newLinkKey, setNewLinkKey] = useState('')
  const [newLinkUrl, setNewLinkUrl] = useState('')
  const [linkError, setLinkError] = useState('')

  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [avatarSaving, setAvatarSaving] = useState(false)

  // Password state — deliberately independent from the profile buffer.
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [passwordMessage, setPasswordMessage] = useState('')
  const [mustChangePassword, setMustChangePassword] = useState(false)

  const loadProfile = useCallback((current: Profile) => {
    setForm({
      full_name: current.full_name || '',
      phone: current.phone || '',
      whatsapp: current.whatsapp || '',
      bio: current.bio || '',
      job_title: current.job_title || '',
      skills: current.skills || '',
      experience: current.experience || '',
      previous_projects: current.previous_projects || '',
      certifications: current.certifications || '',
      location: current.location || '',
      portfolio_url: current.portfolio_url || '',
      linkedin: current.linkedin || '',
      behance: current.behance || '',
      instagram: current.instagram || '',
      facebook: current.facebook || '',
      twitter: current.twitter || '',
      personal_website: current.personal_website || '',
    })
    setFieldErrors({})
    setProfileError('')
    setProfileMessage('')
    setAvatarUrl(current.avatar_url || '')
    setAvatarFile(null)
    setAvatarPreview('')
    setMustChangePassword(current.must_change_password || false)

    const links = collectSocialLinks(current)
    setCustomSocialLinks(
      Object.entries(links)
        .filter(([key]) => !PLATFORM_KEYS.includes(key))
        .map(([key, url]) => ({ key, url })),
    )
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!profile) {
      setLoading(false)
      return
    }
    loadProfile(profile)
  }, [profile, loadProfile])

  const updateField = (field: keyof ProfileFormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    setFieldErrors((prev) => {
      if (!prev[field]) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }

  // ── Avatar ────────────────────────────────────────────────────────────────
  const handleAvatarFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null
    if (!file) return
    const validation = validateFile(file, 'avatars')
    if (!validation.valid) {
      setProfileError(validation.error || 'Please choose a valid image file.')
      return
    }
    setProfileError('')
    if (avatarPreview) URL.revokeObjectURL(avatarPreview)
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  // Shared validator for the whole profile edit buffer.
  const validateBuffer = () => {
    const { errors } = validateProfileForm({ ...form })
    for (const link of customSocialLinks) {
      const checked = validateCustomLink(link.key, link.url)
      if (checked.error) errors[`link:${link.key}`] = checked.error
    }
    return errors
  }

  const handleRemoveAvatar = async () => {
    if (!user || !profile) return
    setAvatarSaving(true)
    setProfileError('')
    setProfileMessage('')

    const errors = validateBuffer()
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      setProfileError('Some fields need your attention before the photo can be removed. Fix the highlighted values and try again.')
      setAvatarSaving(false)
      return
    }

    setAvatarFile(null)
    if (avatarPreview) URL.revokeObjectURL(avatarPreview)
    setAvatarPreview('')
    // The explicit override avoids reading the stale avatarUrl from this
    // closure; the shared save path validates, persists avatar_url = '' and
    // cleans up the stored object.
    await saveProfile('')
    setAvatarSaving(false)
  }

  // ── Profile save (shared by every panel's Save button) ─────────────────────
  const saveProfile = async (avatarOverride?: string) => {
    if (!user) {
      setProfileError('You are not signed in. Please sign in again.')
      return
    }
    setProfileSaving(true)
    setProfileError('')
    setProfileMessage('')
    setLinkError('')

    // 1. Validate the whole edit buffer — invalid values are never persisted.
    const errors = validateBuffer()
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      setProfileError('Some fields need your attention. Fix the highlighted values and save again.')
      setProfileSaving(false)
      return
    }
    const { normalized } = validateProfileForm({ ...form })

    // 2. Resolve the avatar: a freshly selected file wins over the URL field.
    const originalAvatar = profile?.avatar_url || ''
    let finalAvatarUrl = avatarOverride !== undefined ? avatarOverride : avatarUrl
    let oldAvatarPath: string | null = null
    let uploadedPath: string | null = null

    if (avatarFile && avatarOverride === undefined) {
      const up = await uploadTeamAvatar(user.id, avatarFile)
      if (up.error) {
        setProfileError(up.error)
        setProfileSaving(false)
        return
      }
      finalAvatarUrl = up.data || ''
      uploadedPath = avatarStoragePathFromUrl(finalAvatarUrl)
      if (finalAvatarUrl !== originalAvatar) oldAvatarPath = avatarStoragePathFromUrl(originalAvatar)
    } else {
      const candidate = normalizeUrl(finalAvatarUrl)
      if (candidate && !isValidHttpUrl(candidate)) {
        setProfileError('The photo URL is not a valid web address (e.g. https://example.com/photo.jpg).')
        setProfileSaving(false)
        return
      }
      finalAvatarUrl = candidate
      if (finalAvatarUrl !== originalAvatar) oldAvatarPath = avatarStoragePathFromUrl(originalAvatar)
    }

    // 3. Persist through the owner-only RPC (role/status/email stay untouched).
    const result = await updateOwnEnhancedProfile(user.id, {
      ...normalized,
      avatar_url: finalAvatarUrl,
      other_social_links: Object.fromEntries(customSocialLinks.map((link) => [link.key, link.url])),
    })
    if (result.error) {
      // Avoid leaving an orphaned object behind when the profile save fails.
      if (uploadedPath && uploadedPath !== oldAvatarPath) {
        await deleteTeamAvatar(uploadedPath)
      }
      setProfileError(result.error)
      setProfileSaving(false)
      return
    }

    // 4. Cleanup the replaced avatar object (best-effort) and sync the shell.
    if (oldAvatarPath && oldAvatarPath !== uploadedPath) {
      await deleteTeamAvatar(oldAvatarPath)
    }
    const removedAvatar = Boolean(originalAvatar) && !finalAvatarUrl && !avatarFile
    setAvatarUrl(finalAvatarUrl)
    setAvatarFile(null)
    if (avatarPreview) URL.revokeObjectURL(avatarPreview)
    setAvatarPreview('')
    setForm(normalized as ProfileFormState)
    setFieldErrors({})
    setProfileMessage(removedAvatar ? 'Profile photo removed' : 'Profile updated successfully')
    await refreshProfile()
    setProfileSaving(false)
  }

  // ── Custom social links ────────────────────────────────────────────────────
  const addCustomLink = () => {
    setLinkError('')
    if (!newLinkKey.trim() || !newLinkUrl.trim()) {
      setLinkError('Enter a link key and a URL to add a custom link.')
      return
    }
    const checked = validateCustomLink(newLinkKey, newLinkUrl)
    if (checked.error) {
      setLinkError(checked.error)
      return
    }
    if (customSocialLinks.some((link) => link.key.toLowerCase() === checked.key.toLowerCase()) || PLATFORM_KEYS.includes(checked.key)) {
      setLinkError('That link key already exists. Use a different key.')
      return
    }
    setCustomSocialLinks((prev) => [...prev, { key: checked.key, url: checked.url }])
    setNewLinkKey('')
    setNewLinkUrl('')
  }

  const updateCustomLink = (index: number, field: 'key' | 'url', value: string) => {
    setCustomSocialLinks((prev) => prev.map((link, i) => (i === index ? { ...link, [field]: value } : link)))
  }

  const removeCustomLink = (index: number) => {
    setCustomSocialLinks((prev) => prev.filter((_, i) => i !== index))
  }

  // ── Password (independent from the profile buffer) ─────────────────────────
  const handlePasswordChange = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!user) return
    setPasswordError('')
    setPasswordMessage('')

    if (!currentPassword) {
      setPasswordError('Enter your current password.')
      return
    }
    if (newPassword.length < 8) {
      setPasswordError('The new password must be at least 8 characters.')
      return
    }
    if (newPassword === currentPassword) {
      setPasswordError('The new password must be different from the current one.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('The new passwords do not match.')
      return
    }

    const loginEmail = user.email || profile?.email
    if (!loginEmail) {
      setPasswordError('Unable to determine your login email. Sign out and sign in again.')
      return
    }

    setPasswordSaving(true)
    // Prove the caller knows the current password before replacing it.
    const verification = await verifyCurrentPassword(loginEmail, currentPassword)
    if (verification.error) {
      setPasswordError(verification.error.message)
      setPasswordSaving(false)
      return
    }

    const result = await updatePasswordAndMarkChanged(newPassword)
    if (result.error) {
      setPasswordError(result.error.message)
      setPasswordSaving(false)
      return
    }

    setPasswordMessage('Password changed successfully')
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setShowPasswordForm(false)
    setMustChangePassword(false)
    await refreshProfile()
    setPasswordSaving(false)
  }

  if (loading) {
    return <Page><div className="flex min-h-[400px] items-center justify-center gap-2 text-sm text-text-secondary"><LoaderCircle className="h-4 w-4 animate-spin text-accent" /> Loading profile...</div></Page>
  }
  if (!profile) return <Page><InlineAlert>Profile not found</InlineAlert></Page>

  const avatarInitial = initialsFor(profile, form.full_name)
  const hasAvatar = Boolean(avatarPreview || avatarUrl)

  return (
    <Page>
      <PageHeader eyebrow="PROFILE" title={mustChangePassword ? 'Set Up Your Account' : 'My Profile'} description={mustChangePassword ? 'You need to change your temporary password before accessing the system.' : 'Manage your personal and professional profile information. Role and status are managed by your administrator.'} />

      {profileError && <InlineAlert>{profileError}</InlineAlert>}
      {profileMessage && <InlineAlert tone="success">{profileMessage}</InlineAlert>}
      {passwordError && <InlineAlert>{passwordError}</InlineAlert>}
      {passwordMessage && <InlineAlert tone="success">{passwordMessage}</InlineAlert>}

      {mustChangePassword && (
        <Panel title="Action Required" className="border-l-4 border-l-red-500">
          <p className="px-5 py-4 text-sm text-text-secondary">This is your first login with a temporary password. You must create a new password to continue.</p>
          <div className="px-5 pb-5">
            <button onClick={() => setShowPasswordForm(true)} className={primaryButtonClassName}>Change Password</button>
          </div>
        </Panel>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* ── Profile Photo ─────────────────────────────────────────── */}
          <Panel title="Profile Photo" description="Upload a photo or paste an image URL. Saved separately from the rest of your profile.">
            <div className="p-5">
              <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
                <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-border bg-surface-raised">
                  {avatarPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarPreview} alt="New photo preview" className="h-full w-full object-cover" />
                  ) : avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarUrl} alt="Profile photo" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-2xl font-semibold text-text-tertiary">{avatarInitial}</div>
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-3">
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-text-secondary">
                    <Camera className="h-4 w-4 shrink-0" />
                    <span className="rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-fg transition hover:border-accent">Choose image…</span>
                    <input type="file" accept={STORAGE_RULES['avatars'].acceptAttribute} onChange={handleAvatarFileChange} className="sr-only" />
                  </label>
                  {avatarFile && (
                    <p className="text-xs text-text-secondary">
                      <span className="font-medium text-fg">{avatarFile.name}</span> is ready to upload ({Math.round(avatarFile.size / 1024)} KB). It replaces the current photo when you save.
                    </p>
                  )}
                  <div>
                    <input
                      type="text"
                      inputMode="url"
                      placeholder="Or paste image URL (https://…)"
                      className={inputClassName}
                      value={avatarUrl}
                      disabled={Boolean(avatarFile)}
                      onChange={(event) => setAvatarUrl(event.target.value)}
                      aria-label="Profile photo URL"
                    />
                    {avatarFile && <p className="mt-1 text-xs text-text-tertiary">A selected file takes priority over the URL above.</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void saveProfile()}
                      className={primaryButtonClassName}
                      disabled={profileSaving || avatarSaving}
                    >
                      {profileSaving && <LoaderCircle className="h-4 w-4 animate-spin" />}
                      Save photo
                    </button>
                    {hasAvatar && (
                      <button
                        type="button"
                        onClick={() => void handleRemoveAvatar()}
                        className={secondaryButtonClassName}
                        disabled={profileSaving || avatarSaving}
                      >
                        <Trash2 className="h-4 w-4" />
                        Remove photo
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-text-tertiary">Images up to 5 MB. Your photo is visible to signed-in team members.</p>
                </div>
              </div>
            </div>
          </Panel>

          {/* ── Personal Information ───────────────────────────────────── */}
          <form onSubmit={(event) => { event.preventDefault(); void saveProfile() }}>
            <Panel title="Personal Information" description="Basic contact details">
              <div className="grid gap-4 p-5 sm:grid-cols-2">
                <label className="text-xs text-text-secondary">Full Name <span className="text-red-400">*</span>
                  <input required maxLength={PROFILE_LIMITS.fullName} className={`${inputClassName} mt-2`} value={form.full_name} onChange={(e) => updateField('full_name', e.target.value)} placeholder="Your full name" />
                  <FieldError message={fieldErrors.full_name} />
                </label>
                <label className="text-xs text-text-secondary"><Mail className="mr-1 inline h-4 w-4" /> Email
                  <input type="email" className={`${inputClassName} mt-2`} value={profile.email} disabled />
                  <span className="mt-1 block text-[11px] text-text-tertiary">Managed by your administrator.</span>
                </label>
                <label className="text-xs text-text-secondary"><Phone className="mr-1 inline h-4 w-4" /> Phone
                  <input type="tel" className={`${inputClassName} mt-2`} value={form.phone} onChange={(e) => updateField('phone', e.target.value)} placeholder="+1 234 567 890" />
                  <FieldError message={fieldErrors.phone} />
                </label>
                <label className="text-xs text-text-secondary"><Phone className="mr-1 inline h-4 w-4" /> WhatsApp
                  <input type="tel" className={`${inputClassName} mt-2`} value={form.whatsapp} onChange={(e) => updateField('whatsapp', e.target.value)} placeholder="+1 234 567 891" />
                  <FieldError message={fieldErrors.whatsapp} />
                </label>
                <label className="text-xs text-text-secondary sm:col-span-2"><MapPin className="mr-1 inline h-4 w-4" /> Location
                  <input className={`${inputClassName} mt-2`} value={form.location} onChange={(e) => updateField('location', e.target.value)} placeholder="City, Country or Remote" maxLength={PROFILE_LIMITS.location} />
                  <FieldError message={fieldErrors.location} />
                </label>
                <label className="text-xs text-text-secondary sm:col-span-2"><BookOpen className="mr-1 inline h-4 w-4" /> Bio
                  <textarea className={`${inputClassName} mt-2 min-h-24`} value={form.bio} onChange={(e) => updateField('bio', e.target.value)} placeholder="Tell us about yourself..." maxLength={PROFILE_LIMITS.bio} />
                  <span className="mt-1 block text-right text-[11px] text-text-tertiary">{form.bio.length}/{PROFILE_LIMITS.bio}</span>
                  <FieldError message={fieldErrors.bio} />
                </label>
              </div>
              <div className="flex justify-end border-t border-border px-5 py-4">
                <button type="submit" className={primaryButtonClassName} disabled={profileSaving}>
                  {profileSaving && <LoaderCircle className="h-4 w-4 animate-spin" />}
                  Save Changes
                </button>
              </div>
            </Panel>
          </form>

          {/* ── Professional Information ───────────────────────────────── */}
          <form onSubmit={(event) => { event.preventDefault(); void saveProfile() }}>
            <Panel title="Professional Information" description="Your career and expertise">
              <div className="grid gap-4 p-5 sm:grid-cols-2">
                <label className="text-xs text-text-secondary"><Briefcase className="mr-1 inline h-4 w-4" /> Job Title
                  <input className={`${inputClassName} mt-2`} value={form.job_title} onChange={(e) => updateField('job_title', e.target.value)} placeholder="e.g. Senior Designer" maxLength={PROFILE_LIMITS.jobTitle} />
                  <FieldError message={fieldErrors.job_title} />
                </label>
                <label className="text-xs text-text-secondary"><GitBranch className="mr-1 inline h-4 w-4" /> Skills
                  <input className={`${inputClassName} mt-2`} value={form.skills} onChange={(e) => updateField('skills', e.target.value)} placeholder="UI/UX, React, Node.js, Figma" maxLength={PROFILE_LIMITS.skills} />
                  <FieldError message={fieldErrors.skills} />
                </label>
                <label className="text-xs text-text-secondary sm:col-span-2"><Briefcase className="mr-1 inline h-4 w-4" /> Experience
                  <textarea className={`${inputClassName} mt-2 min-h-24`} value={form.experience} onChange={(e) => updateField('experience', e.target.value)} placeholder="Describe your work experience..." maxLength={PROFILE_LIMITS.longText} />
                  <FieldError message={fieldErrors.experience} />
                </label>
                <label className="text-xs text-text-secondary sm:col-span-2"><Award className="mr-1 inline h-4 w-4" /> Certifications
                  <textarea className={`${inputClassName} mt-2 min-h-20`} value={form.certifications} onChange={(e) => updateField('certifications', e.target.value)} placeholder="List your certifications..." maxLength={PROFILE_LIMITS.longText} />
                  <FieldError message={fieldErrors.certifications} />
                </label>
                <label className="text-xs text-text-secondary sm:col-span-2"><GitBranch className="mr-1 inline h-4 w-4" /> Previous Projects
                  <textarea className={`${inputClassName} mt-2 min-h-20`} value={form.previous_projects} onChange={(e) => updateField('previous_projects', e.target.value)} placeholder="Describe notable projects you've worked on..." maxLength={PROFILE_LIMITS.longText} />
                  <FieldError message={fieldErrors.previous_projects} />
                </label>
              </div>
              <div className="flex justify-end border-t border-border px-5 py-4">
                <button type="submit" className={primaryButtonClassName} disabled={profileSaving}>
                  {profileSaving && <LoaderCircle className="h-4 w-4 animate-spin" />}
                  Save Changes
                </button>
              </div>
            </Panel>
          </form>

          {/* ── Social Links ───────────────────────────────────────────── */}
          <form onSubmit={(event) => { event.preventDefault(); void saveProfile() }}>
            <Panel title="Social Links" description="Connect your social media profiles and portfolio">
              <div className="space-y-6 p-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  {SOCIAL_PLATFORMS.map((platform) => {
                    const platformKey = platform.key as keyof ProfileFormState
                    return (
                      <label key={platform.key} className="flex items-start gap-3 text-sm">
                        <span className="mt-2 flex h-8 w-8 shrink-0 items-center justify-center rounded border border-border bg-surface-raised text-text-secondary">{platform.icon}</span>
                        <span className="min-w-0 flex-1">
                          <span className="text-xs text-text-secondary">{platform.label}</span>
                          <input
                            type="text"
                            inputMode="url"
                            className={`${inputClassName} mt-1`}
                            value={form[platformKey] || ''}
                            onChange={(e) => updateField(platformKey, e.target.value)}
                            placeholder={platform.key === 'personal_website' ? 'yourwebsite.com' : `${platform.key}.com/yourprofile`}
                          />
                          <FieldError message={fieldErrors[platformKey]} />
                        </span>
                      </label>
                    )
                  })}
                </div>

                <div>
                  <p className="text-xs font-semibold text-text-secondary">Portfolio</p>
                  <div className="mt-2 flex items-start gap-3">
                    <span className="mt-2 flex h-8 w-8 shrink-0 items-center justify-center rounded border border-border bg-surface-raised text-text-secondary"><Globe className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1">
                      <input
                        type="text"
                        inputMode="url"
                        className={inputClassName}
                        value={form.portfolio_url}
                        onChange={(e) => updateField('portfolio_url', e.target.value)}
                        placeholder="https://yourportfolio.com"
                      />
                      <FieldError message={fieldErrors.portfolio_url} />
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-text-tertiary">Tip: you can leave out https:// — it is added automatically.</p>
                </div>

                {customSocialLinks.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-text-secondary">Custom Links</p>
                    <div className="space-y-3">
                      {customSocialLinks.map((link, index) => (
                        <div key={`${link.key}-${index}`} className="flex items-center gap-2">
                          <span className="w-28 shrink-0 truncate text-xs font-medium text-text-secondary" title={linkKeyLabel(link.key)}>{linkKeyLabel(link.key)}</span>
                          <input className={`${inputClassName} w-32`} value={link.key} onChange={(e) => updateCustomLink(index, 'key', e.target.value)} placeholder="key" aria-label="Custom link key" />
                          <input type="text" inputMode="url" className={`${inputClassName} flex-1`} value={link.url} onChange={(e) => updateCustomLink(index, 'url', e.target.value)} placeholder="https://..." aria-label="Custom link URL" />
                          <button type="button" onClick={() => removeCustomLink(index)} className="shrink-0 p-2 text-red-400 transition hover:text-red-600" aria-label={`Remove ${link.key} link`}>
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <p className="text-xs font-semibold text-text-secondary">Add a custom link</p>
                  <div className="flex items-center gap-2">
                    <input className={`${inputClassName} w-32`} value={newLinkKey} onChange={(e) => { setNewLinkKey(e.target.value); setLinkError('') }} placeholder="key (e.g. dribbble)" aria-label="New custom link key" />
                    <input type="text" inputMode="url" className={`${inputClassName} flex-1`} value={newLinkUrl} onChange={(e) => { setNewLinkUrl(e.target.value); setLinkError('') }} placeholder="https://..." aria-label="New custom link URL" />
                    <button type="button" onClick={addCustomLink} className={secondaryButtonClassName} disabled={!newLinkKey.trim() || !newLinkUrl.trim()} aria-label="Add custom link">
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  {linkError && <FieldError message={linkError} />}
                </div>
              </div>
              <div className="flex justify-end border-t border-border px-5 py-4">
                <button type="submit" className={primaryButtonClassName} disabled={profileSaving}>
                  {profileSaving && <LoaderCircle className="h-4 w-4 animate-spin" />}
                  Save Links
                </button>
              </div>
            </Panel>
          </form>
        </div>

        {/* ── Side column ───────────────────────────────────────────────── */}
        <div className="space-y-6">
          <Panel title="Account Information" description="Managed by your administrator">
            <div className="space-y-3 p-5 text-sm">
              <div className="flex justify-between"><span className="text-text-tertiary">Role</span><span className="font-medium">{profile.role}</span></div>
              <div className="flex justify-between"><span className="text-text-tertiary">Status</span><span className={`font-medium ${profile.status === 'active' ? 'text-green-400' : 'text-red-400'}`}>{profile.status}</span></div>
              <div className="flex justify-between"><span className="text-text-tertiary">Member since</span><span className="font-medium">{new Date(profile.created_at).toLocaleDateString()}</span></div>
              {isAdmin && <div className="flex justify-between"><span className="text-text-tertiary">Permissions</span><span className="font-medium">Admin</span></div>}
              <p className="border-t border-border pt-3 text-xs text-text-tertiary">
                <Shield className="mr-1 inline h-3.5 w-3.5" />
                Role, status, and job-role assignments can only be changed by an administrator from Administration → Team Management.
              </p>
            </div>
          </Panel>

          <Panel title="Account Security" description="Change your password">
            <div className="p-5">
              <button onClick={() => { setShowPasswordForm(!showPasswordForm); setPasswordError(''); setPasswordMessage('') }} className={`${primaryButtonClassName} w-full justify-start`}>
                <Shield className="h-4 w-4" /> {showPasswordForm ? 'Cancel' : 'Change Password'}
              </button>
              {showPasswordForm && (
                <form onSubmit={handlePasswordChange} className="mt-4 space-y-4">
                  <label className="text-xs text-text-secondary">Current Password
                    <input type="password" className={`${inputClassName} mt-2`} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Enter current password" required autoComplete="current-password" />
                  </label>
                  <label className="text-xs text-text-secondary">New Password
                    <input type="password" className={`${inputClassName} mt-2`} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 8 characters" required minLength={8} autoComplete="new-password" />
                  </label>
                  <label className="text-xs text-text-secondary">Confirm New Password
                    <input type="password" className={`${inputClassName} mt-2`} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Repeat the new password" required minLength={8} autoComplete="new-password" />
                  </label>
                  <div className="flex justify-end gap-2">
                    <button type="button" className={secondaryButtonClassName} onClick={() => setShowPasswordForm(false)}>Cancel</button>
                    <button type="submit" className={primaryButtonClassName} disabled={passwordSaving}>
                      {passwordSaving && <LoaderCircle className="h-4 w-4 animate-spin" />}
                      Update Password
                    </button>
                  </div>
                  <p className="text-[11px] text-text-tertiary">Changing your password only affects your login — profile information is saved separately.</p>
                </form>
              )}
            </div>
          </Panel>

          {isAdmin && (
            <Panel title="Email Management" description="For admin users">
              <p className="p-5 text-xs text-text-tertiary">Email changes must be done through the Admin Team Management panel.</p>
            </Panel>
          )}
        </div>
      </div>
    </Page>
  )
}
