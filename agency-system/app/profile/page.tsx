'use client'

import { useCallback, useEffect, useState } from 'react'
import { Plus, Shield, Camera, Mail, Phone, MapPin, Briefcase, Award, BookOpen, GitBranch, Globe, Linkedin, Instagram, Facebook, Twitter, Beaker, Trash2 } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import {
  getSocialLinks,
  markPasswordChanged,
  updateOwnEnhancedProfile,
  uploadTeamAvatar,
} from '@/lib/supabase/database'
import { updatePasswordAndMarkChanged } from '@/lib/supabase/auth'
import type { Profile } from '@/lib/supabase/types'
import { InlineAlert, Page, PageHeader, Panel, inputClassName, primaryButtonClassName, secondaryButtonClassName } from '@/components/ui/page'

const SOCIAL_PLATFORMS = [
  { key: 'linkedin', label: 'LinkedIn', icon: <Linkedin className="h-4 w-4" /> },
  { key: 'behance', label: 'Behance', icon: <Beaker className="h-4 w-4" /> },
  { key: 'instagram', label: 'Instagram', icon: <Instagram className="h-4 w-4" /> },
  { key: 'facebook', label: 'Facebook', icon: <Facebook className="h-4 w-4" /> },
  { key: 'twitter', label: 'X/Twitter', icon: <Twitter className="h-4 w-4" /> },
  { key: 'personal_website', label: 'Personal Website', icon: <Globe className="h-4 w-4" /> },
]

export default function UserProfilePage() {
  const { profile, user, isAdmin } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  
  const [form, setForm] = useState({
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
  })
  
  const [customSocialLinks, setCustomSocialLinks] = useState([])
  const [newLinkKey, setNewLinkKey] = useState('')
  const [newLinkLabel, setNewLinkLabel] = useState('')
  const [newLinkUrl, setNewLinkUrl] = useState('')
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [mustChangePassword, setMustChangePassword] = useState(false)
  
  const loadProfile = useCallback(async () => {
    if (!profile) { setLoading(false); return }
    
    setForm({
      full_name: profile.full_name || '',
      phone: profile.phone || '',
      whatsapp: profile.whatsapp || '',
      bio: profile.bio || '',
      job_title: profile.job_title || '',
      skills: profile.skills || '',
      experience: profile.experience || '',
      previous_projects: profile.previous_projects || '',
      certifications: profile.certifications || '',
      location: profile.location || '',
      portfolio_url: profile.portfolio_url || '',
      linkedin: profile.linkedin || '',
      behance: profile.behance || '',
      instagram: profile.instagram || '',
      facebook: profile.facebook || '',
      twitter: profile.twitter || '',
      personal_website: profile.personal_website || '',
    })
    
    setAvatarUrl(profile.avatar_url || '')
    setMustChangePassword(profile.must_change_password || false)
    
    const links = await getSocialLinks(profile)
    setCustomSocialLinks(
      Object.entries(links).filter(([key]) => !SOCIAL_PLATFORMS.some(p => p.key === key)).map(([key, url]) => ({
        key, label: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' '), url,
      }))
    )
    setLoading(false)
  }, [profile])
  
  useEffect(() => { void loadProfile() }, [loadProfile])
  
  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0] || null
    setAvatarFile(file)
    if (file) setAvatarPreview(URL.createObjectURL(file))
  }
  
  const handleSocialChange = (platform, value) => setForm(prev => ({ ...prev, [platform]: value }))
  
  const handleCustomLinkChange = (index, field, value) => {
    setCustomSocialLinks(prev => prev.map((link, i) => i === index ? { ...link, [field]: value } : link))
  }
  
  const addCustomLink = () => {
    if (!newLinkKey.trim() || !newLinkUrl.trim()) return
    setCustomSocialLinks(prev => [...prev, { key: newLinkKey.trim(), label: newLinkLabel.trim() || newLinkKey.trim(), url: newLinkUrl.trim() }])
    setNewLinkKey(''); setNewLinkLabel(''); setNewLinkUrl('')
  }
  
  const removeCustomLink = (index) => setCustomSocialLinks(prev => prev.filter((_, i) => i !== index))
  
  const saveProfile = async (e) => {
    e.preventDefault()
    if (!user) return
    setSaving(true); setError(''); setMessage('')
    
    try {
      let finalAvatarUrl = avatarUrl
      if (avatarFile) {
        const up = await uploadTeamAvatar(user.id, avatarFile)
        if (up.error) { setError(up.error); setSaving(false); return }
        if (up.data) finalAvatarUrl = up.data
      }
      
      const result = await updateOwnEnhancedProfile(user.id, {
        ...form, avatar_url: finalAvatarUrl,
        other_social_links: Object.fromEntries(customSocialLinks.map(link => [link.key, link.url])),
      })
      
      if (result.error) setError(result.error)
      else { setMessage('Profile updated successfully'); setAvatarUrl(finalAvatarUrl) }
    } catch (err) {
      setError(err.message || 'Failed to save profile')
    }
    setSaving(false)
  }
  
  const handlePasswordChange = async (e) => {
    e.preventDefault()
    if (!user) return
    if (newPassword !== confirmPassword) { setError('New passwords do not match'); return }
    if (newPassword.length < 8) { setError('Password must be at least 8 characters'); return }
    
    setSaving(true); setError(''); setMessage('')
    const result = await updatePasswordAndMarkChanged(newPassword)
    
    if (result.error) setError(result.error.message)
    else {
      setMessage('Password changed successfully')
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
      setShowPasswordForm(false)
      const changed = await markPasswordChanged(user.id)
      if (!changed.error) setMustChangePassword(false)
    }
    setSaving(false)
  }
  
  if (loading) return <Page><div className="flex min-h-[400px] items-center justify-center">Loading profile...</div></Page>
  if (!profile) return <Page><InlineAlert>Profile not found</InlineAlert></Page>
  
  return (
    <Page>
      <PageHeader eyebrow="PROFILE" title={mustChangePassword ? 'Set Up Your Account' : 'My Profile'} description={mustChangePassword ? 'You need to change your temporary password before accessing the system.' : 'Manage your personal and professional profile information.'} />
      
      {error && <InlineAlert tone="error">{error}</InlineAlert>}
      {message && <InlineAlert tone="success">{message}</InlineAlert>}
      
      {mustChangePassword && (
        <Panel title="Action Required" className="border-l-4 border-l-red-500">
          <p className="text-sm text-text-secondary">This is your first login with a temporary password. You must create a new password to continue.</p>
          <button onClick={() => setShowPasswordForm(true)} className={primaryButtonClassName}>Change Password</button>
        </Panel>
      )}
      
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Panel title="Profile Photo" description="Update your profile picture">
            <div className="flex items-center gap-6">
              <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-border bg-surface-raised">
                {avatarPreview ? <img src={avatarPreview} alt="Preview" className="h-full w-full object-cover" /> :
                 avatarUrl ? <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" /> :
                 <div className="flex h-full w-full items-center justify-center text-2xl font-semibold text-text-tertiary">{(form.full_name[0] || profile.email[0] || 'U').toUpperCase()}</div>}
              </div>
              <div className="flex flex-col gap-3">
                <label className="text-xs text-text-secondary">
                  <Camera className="inline h-4 w-4 mr-1" /> Upload new photo
                  <input type="file" accept="image/*" onChange={handleAvatarChange} className="ml-2" />
                </label>
                <input type="url" placeholder="Or paste image URL" className={inputClassName} value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} />
              </div>
            </div>
          </Panel>
          
          <form onSubmit={saveProfile}>
            <Panel title="Personal Information" description="Basic contact details">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-xs text-text-secondary">Full Name
                  <input required className={`${inputClassName} mt-2`} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Your full name" />
                </label>
                <label className="text-xs text-text-secondary"><Mail className="inline h-4 w-4 mr-1" /> Email
                  <input type="email" className={`${inputClassName} mt-2`} value={profile.email} disabled />
                </label>
                <label className="text-xs text-text-secondary"><Phone className="inline h-4 w-4 mr-1" /> Phone
                  <input className={`${inputClassName} mt-2`} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+1 234 567 890" />
                </label>
                <label className="text-xs text-text-secondary"><Phone className="inline h-4 w-4 mr-1" /> WhatsApp
                  <input className={`${inputClassName} mt-2`} value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} placeholder="+1 234 567 891" />
                </label>
                <label className="text-xs text-text-secondary sm:col-span-2"><MapPin className="inline h-4 w-4 mr-1" /> Location
                  <input className={`${inputClassName} mt-2`} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="City, Country or Remote" />
                </label>
                <label className="text-xs text-text-secondary sm:col-span-2"><BookOpen className="inline h-4 w-4 mr-1" /> Bio
                  <textarea className={`${inputClassName} mt-2 min-h-24`} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder="Tell us about yourself..." />
                </label>
              </div>
              <div className="mt-4 flex justify-end"><button type="submit" className={primaryButtonClassName} disabled={saving}>{saving && <span className="h-4 w-4 animate-spin">⟳</span>} Save Changes</button></div>
            </Panel>
          </form>
          
          <form onSubmit={saveProfile}>
            <Panel title="Professional Information" description="Your career and expertise">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-xs text-text-secondary"><Briefcase className="inline h-4 w-4 mr-1" /> Job Title
                  <input className={`${inputClassName} mt-2`} value={form.job_title} onChange={(e) => setForm({ ...form, job_title: e.target.value })} placeholder="e.g. Senior Designer" />
                </label>
                <label className="text-xs text-text-secondary"><GitBranch className="inline h-4 w-4 mr-1" /> Skills
                  <input className={`${inputClassName} mt-2`} value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} placeholder="UI/UX, React, Node.js, Figma" />
                </label>
                <label className="text-xs text-text-secondary sm:col-span-2"><Briefcase className="inline h-4 w-4 mr-1" /> Experience
                  <textarea className={`${inputClassName} mt-2 min-h-24`} value={form.experience} onChange={(e) => setForm({ ...form, experience: e.target.value })} placeholder="Describe your work experience..." />
                </label>
                <label className="text-xs text-text-secondary sm:col-span-2"><Award className="inline h-4 w-4 mr-1" /> Certifications
                  <textarea className={`${inputClassName} mt-2 min-h-20`} value={form.certifications} onChange={(e) => setForm({ ...form, certifications: e.target.value })} placeholder="List your certifications..." />
                </label>
                <label className="text-xs text-text-secondary sm:col-span-2"><GitBranch className="inline h-4 w-4 mr-1" /> Previous Projects
                  <textarea className={`${inputClassName} mt-2 min-h-20`} value={form.previous_projects} onChange={(e) => setForm({ ...form, previous_projects: e.target.value })} placeholder="Describe notable projects you've worked on..." />
                </label>
              </div>
              <div className="mt-4 flex justify-end"><button type="submit" className={primaryButtonClassName} disabled={saving}>{saving && <span className="h-4 w-4 animate-spin">⟳</span>} Save Changes</button></div>
            </Panel>
          </form>
          
          <Panel title="Social Links" description="Connect your social media profiles">
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                {SOCIAL_PLATFORMS.map(platform => (
                  <label key={platform.key} className="flex items-center gap-3 text-sm">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-border bg-surface-raised text-text-secondary">{platform.icon}</span>
                    <input type="url" className={`${inputClassName} flex-1`} value={form[platform.key] || ''} onChange={(e) => handleSocialChange(platform.key, e.target.value)} placeholder={`https://${platform.key === 'personal_website' ? 'yourwebsite.com' : platform.key}.com/yourprofile`} />
                  </label>
                ))}
              </div>
              {customSocialLinks.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-text-secondary">Custom Links</p>
                  <div className="space-y-3">
                    {customSocialLinks.map((link, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-text-tertiary" />
                        <input className={`${inputClassName} flex-1`} value={link.label} onChange={(e) => handleCustomLinkChange(index, 'label', e.target.value)} placeholder="Link name" />
                        <input type="url" className={`${inputClassName} flex-1`} value={link.url} onChange={(e) => handleCustomLinkChange(index, 'url', e.target.value)} placeholder="URL" />
                        <button type="button" onClick={() => removeCustomLink(index)} className="p-2 text-red-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2">
                <input className={`${inputClassName} w-32`} value={newLinkKey} onChange={(e) => setNewLinkKey(e.target.value)} placeholder="link-key" />
                <input className={`${inputClassName} flex-1`} value={newLinkLabel} onChange={(e) => setNewLinkLabel(e.target.value)} placeholder="Link name" />
                <input type="url" className={`${inputClassName} flex-1`} value={newLinkUrl} onChange={(e) => setNewLinkUrl(e.target.value)} placeholder="https://..." />
                <button type="button" onClick={addCustomLink} className={secondaryButtonClassName} disabled={!newLinkKey.trim() || !newLinkUrl.trim()}><Plus className="h-4 w-4" /></button>
              </div>
            </div>
          </Panel>
        </div>
        
        <div className="space-y-6">
          <Panel title="Account Information" description="Your account details">
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-text-tertiary">Role</span><span className="font-medium">{profile.role}</span></div>
              <div className="flex justify-between"><span className="text-text-tertiary">Status</span><span className={`font-medium ${profile.status === 'active' ? 'text-green-400' : 'text-red-400'}`}>{profile.status}</span></div>
              <div className="flex justify-between"><span className="text-text-tertiary">Member since</span><span className="font-medium">{new Date(profile.created_at).toLocaleDateString()}</span></div>
              {isAdmin && <div className="flex justify-between"><span className="text-text-tertiary">Permissions</span><span className="font-medium">Admin</span></div>}
            </div>
          </Panel>
          
          <Panel title="Account Security" description="Manage your password">
            <button onClick={() => setShowPasswordForm(!showPasswordForm)} className={`${primaryButtonClassName} w-full justify-start`}>
              <Shield className="h-4 w-4" /> {showPasswordForm ? 'Cancel' : 'Change Password'}
            </button>
            {showPasswordForm && (
              <form onSubmit={handlePasswordChange} className="mt-4 space-y-4">
                <label className="text-xs text-text-secondary">Current Password
                  <input type="password" className={`${inputClassName} mt-2`} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Enter current password" required={!mustChangePassword} />
                </label>
                <label className="text-xs text-text-secondary">New Password
                  <input type="password" className={`${inputClassName} mt-2`} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Enter new password" required minLength={8} />
                </label>
                <label className="text-xs text-text-secondary">Confirm New Password
                  <input type="password" className={`${inputClassName} mt-2`} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm new password" required minLength={8} />
                </label>
                <div className="flex justify-end gap-2">
                  <button type="button" className={secondaryButtonClassName} onClick={() => setShowPasswordForm(false)}>Cancel</button>
                  <button type="submit" className={primaryButtonClassName} disabled={saving}>{saving ? 'Saving...' : 'Update Password'}</button>
                </div>
              </form>
            )}
          </Panel>
          
          {isAdmin && (
            <Panel title="Email Management" description="For admin users">
              <p className="text-xs text-text-tertiary">Email changes must be done through the Admin Team Management panel.</p>
            </Panel>
          )}
        </div>
      </div>
    </Page>
  )
}
