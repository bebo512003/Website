'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Briefcase, Building2, CalendarDays, Globe, Link2, Mail, MapPin, MessageCircle, Pencil, Phone, ShieldOff, UsersRound } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { getAppRoles, getEmployeeRoles, getTeamMemberById } from '@/lib/supabase/database'
import type { AppRoleRow, EmployeeRole, Profile } from '@/lib/supabase/types'
import { EmptyState, InlineAlert, LoadingState, Panel, primaryButtonClassName, secondaryButtonClassName } from '@/components/ui/page'

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  manager: 'Manager',
  employee: 'Employee',
}

const SOCIAL_LABELS: Record<string, string> = {
  linkedin: 'LinkedIn',
  github: 'GitHub',
  twitter: 'Twitter / X',
  behance: 'Behance',
  dribbble: 'Dribbble',
  website: 'Website',
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 text-sm">
      <span className="text-text-tertiary">{label}</span>
      <span className="min-w-0 text-fg">{children}</span>
    </div>
  )
}

export function MemberProfile({ memberId }: { memberId: string }) {
  const { can } = useAuth()
  const [member, setMember] = useState<Profile | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [roles, setRoles] = useState<AppRoleRow[]>([])
  const [employeeRoles, setEmployeeRoles] = useState<EmployeeRole[]>([])

  const canManage = can('employee.manage') || can('admin.manage')

  useEffect(() => {
    let mounted = true
    void (async () => {
      const [memberRes, rolesRes, empRolesRes] = await Promise.all([
        getTeamMemberById(memberId),
        getAppRoles(),
        getEmployeeRoles(),
      ])
      if (!mounted) return
      setMember(memberRes.data)
      setRoles(rolesRes.data || [])
      setEmployeeRoles(empRolesRes.data || [])
      setError(memberRes.error || '')
      setLoaded(true)
    })()
    return () => { mounted = false }
  }, [memberId])

  const roleName = useMemo(() => {
    if (!member) return ''
    return (member.role_id ? roles.find((r) => r.id === member.role_id)?.name : undefined)
      || ROLE_LABELS[member.role]
      || member.role
  }, [member, roles])

  const jobRoleName = useMemo(() => {
    if (!member?.employee_role_id) return ''
    return employeeRoles.find((r) => r.id === member.employee_role_id)?.name || ''
  }, [member, employeeRoles])

  const socialLinks = useMemo(() => {
    if (!member || !member.social_links || typeof member.social_links !== 'object') return []
    return Object.entries(member.social_links as Record<string, unknown>)
      .filter(([, value]) => typeof value === 'string' && (value as string).trim() !== '')
      .map(([key, value]) => ({ key, label: SOCIAL_LABELS[key] || key, url: value as string }))
  }, [member])

  if (!loaded) {
    return <Panel><LoadingState label="Loading member profile…" /></Panel>
  }

  if (error) {
    return (
      <div className="space-y-4">
        <InlineAlert>{error}</InlineAlert>
        <Link href="/team" className={secondaryButtonClassName}><ArrowLeft className="h-4 w-4" /> Back to Team</Link>
      </div>
    )
  }

  // Not found — or a client account someone tried to open through the team
  // directory. Both resolve to the same neutral message so nothing is leaked.
  if (!member) {
    return (
      <Panel>
        <EmptyState
          icon={UsersRound}
          title="Team member not found"
          description="This person is not part of the internal team directory, or you are not authorized to view their profile."
          action={<Link href="/team" className={secondaryButtonClassName}><ArrowLeft className="h-4 w-4" /> Back to Team</Link>}
        />
      </Panel>
    )
  }

  // Inactive members are only visible to the people who manage the team.
  // They are never presented as active team members.
  if (member.status !== 'active' && !canManage) {
    return (
      <Panel>
        <EmptyState
          icon={ShieldOff}
          title="Member unavailable"
          description="This team member is no longer active in the workspace."
          action={<Link href="/team" className={secondaryButtonClassName}><ArrowLeft className="h-4 w-4" /> Back to Team</Link>}
        />
      </Panel>
    )
  }

  const inactive = member.status !== 'active'
  const jobTitle = member.job_title || jobRoleName
  const memberSince = member.created_at ? new Date(member.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : null

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Link href="/team" className={secondaryButtonClassName}><ArrowLeft className="h-4 w-4" /> Back to Team</Link>
        {canManage && (
          <Link href="/admin/team" className={primaryButtonClassName}>
            <Pencil className="h-4 w-4" /> Edit in Team Management
          </Link>
        )}
      </div>

      {/* Header */}
      <Panel>
        <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center">
          <div className={`h-24 w-24 shrink-0 overflow-hidden rounded-full border border-border bg-surface-raised ${inactive ? 'grayscale' : ''}`}>
            {member.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={member.avatar_url} alt={member.full_name || 'Team member photo'} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-2xl font-semibold text-text-tertiary">
                {(member.full_name?.trim()[0] || member.email[0] || 'U').toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-semibold text-fg">{member.full_name || 'Unnamed member'}</h2>
            {jobTitle && <p className="mt-0.5 text-sm text-text-secondary">{jobTitle}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="inline-flex rounded border border-border px-2 py-0.5 text-xs text-text-secondary">{roleName}</span>
              {member.specialization && (
                <span className="inline-flex rounded border border-border px-2 py-0.5 text-xs text-text-secondary">{member.specialization}</span>
              )}
              {member.department && (
                <span className="inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 text-xs text-text-secondary">
                  <Building2 className="h-3 w-3" /> {member.department}
                </span>
              )}
              <span className={`inline-flex rounded border px-2 py-0.5 text-xs ${inactive ? 'border-red-500/30 bg-red-500/5 text-red-400' : 'border-green-500/30 bg-green-500/5 text-green-400'}`}>
                {inactive ? 'Inactive' : 'Active'}
              </span>
            </div>
          </div>
        </div>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* About */}
        <Panel title="About">
          <p className="p-5 text-sm leading-relaxed text-text-secondary">
            {member.bio || 'No bio added yet.'}
          </p>
        </Panel>

        {/* Contact */}
        <Panel title="Contact">
          <div className="space-y-3 p-5">
            <DetailRow label="Email">
              <a href={`mailto:${member.email}`} className="break-all text-accent hover:underline">{member.email}</a>
            </DetailRow>
            <DetailRow label="Phone">
              {member.phone ? <a href={`tel:${member.phone}`} className="inline-flex items-center gap-1.5 hover:text-accent"><Phone className="h-3.5 w-3.5" />{member.phone}</a> : '—'}
            </DetailRow>
            <DetailRow label="WhatsApp">
              {member.whatsapp ? <span className="inline-flex items-center gap-1.5"><MessageCircle className="h-3.5 w-3.5" />{member.whatsapp}</span> : '—'}
            </DetailRow>
            <DetailRow label="Location">
              {member.location ? <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{member.location}</span> : '—'}
            </DetailRow>
          </div>
        </Panel>

        {/* Work */}
        <Panel title="Work">
          <div className="space-y-3 p-5">
            <DetailRow label="Department">{member.department || '—'}</DetailRow>
            <DetailRow label="Specialization">{member.specialization || '—'}</DetailRow>
            <DetailRow label="Job role">
              {jobRoleName ? <span className="inline-flex items-center gap-1.5"><Briefcase className="h-3.5 w-3.5" />{jobRoleName}</span> : '—'}
            </DetailRow>
            <DetailRow label="Access role">{roleName}</DetailRow>
            {memberSince && (
              <DetailRow label="Member since">
                <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{memberSince}</span>
              </DetailRow>
            )}
          </div>
        </Panel>

        {/* Links */}
        <Panel title="Links">
          <div className="space-y-3 p-5">
            <DetailRow label="Portfolio">
              {member.portfolio_url ? (
                <a href={member.portfolio_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 break-all text-accent hover:underline">
                  <Globe className="h-3.5 w-3.5 shrink-0" />{member.portfolio_url}
                </a>
              ) : '—'}
            </DetailRow>
            <DetailRow label="Social">
              {socialLinks.length > 0 ? (
                <span className="flex flex-wrap gap-2">
                  {socialLinks.map((link) => (
                    <a key={link.key} href={link.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 text-xs text-text-secondary hover:border-line-light hover:text-fg">
                      <Link2 className="h-3 w-3" />{link.label}
                    </a>
                  ))}
                </span>
              ) : '—'}
            </DetailRow>
          </div>
        </Panel>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-text-tertiary">
        <Mail className="h-3.5 w-3.5" /> Contact details are visible to signed-in team members only.
      </p>
    </div>
  )
}
