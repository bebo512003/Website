'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Filter, Search, UsersRound } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { getAppRoles, getEmployeeRoles, getTeamMemberDepartments, getTeamMembersPage } from '@/lib/supabase/database'
import type { AppRoleRow, EmployeeRole, Profile } from '@/lib/supabase/types'
import { useDebouncedValue } from '@/lib/use-debounced-value'
import { Pagination } from '@/components/ui/pagination'
import { EmptyState, InlineAlert, LoadingState, Panel, inputClassName } from '@/components/ui/page'

type StatusFilter = 'active' | 'inactive' | 'all'

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  manager: 'Manager',
  employee: 'Employee',
}

/** Short initials fallback used when a member has no profile photo yet. */
function Initials({ member }: { member: Profile }) {
  const letter = (member.full_name?.trim()[0] || member.email[0] || 'U').toUpperCase()
  return (
    <div className="flex h-full w-full items-center justify-center text-lg font-semibold text-text-tertiary">
      {letter}
    </div>
  )
}

const PAGE_SIZE = 24

export function TeamDirectory() {
  const { can } = useAuth()
  const [members, setMembers] = useState<Profile[]>([])
  const [total, setTotal] = useState(0)
  const [roles, setRoles] = useState<AppRoleRow[]>([])
  const [employeeRoles, setEmployeeRoles] = useState<EmployeeRole[]>([])
  const [departmentOptions, setDepartmentOptions] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [departmentFilter, setDepartmentFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')
  const [page, setPage] = useState(1)

  // Only users who can manage the team are allowed to see inactive members.
  // Everyone else sees the active team only — inactive people never appear as
  // active team members (and never appear at all for regular staff).
  const canManage = can('employee.manage') || can('admin.manage')

  const debouncedSearch = useDebouncedValue(search, 300)

  // The role filter is expressed in display names; resolve it to the dynamic
  // role id and/or the legacy role key for the server-side query.
  const selectedRoleId = useMemo(() => {
    if (roleFilter === 'all') return 'all'
    return roles.find((r) => r.name === roleFilter)?.id || 'all'
  }, [roles, roleFilter])

  const selectedRoleKey = useMemo(() => {
    if (roleFilter === 'all') return 'all'
    const legacy = (Object.entries(ROLE_LABELS).find(([, label]) => label === roleFilter) || [])[0]
    return legacy || 'all'
  }, [roleFilter])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const [membersRes, rolesRes, empRolesRes, departmentsRes] = await Promise.all([
      getTeamMembersPage({
        search: debouncedSearch,
        roleId: selectedRoleId,
        roleKey: selectedRoleKey,
        department: departmentFilter,
        status: canManage ? statusFilter : 'active',
        page,
        pageSize: PAGE_SIZE,
      }),
      getAppRoles(),
      getEmployeeRoles(),
      getTeamMemberDepartments(),
    ])
    setMembers(membersRes.data || [])
    setTotal(membersRes.total)
    setRoles(rolesRes.data || [])
    setEmployeeRoles(empRolesRes.data || [])
    setDepartmentOptions(departmentsRes.data || [])
    setError(membersRes.error || '')
    setLoading(false)
  }, [debouncedSearch, selectedRoleId, selectedRoleKey, departmentFilter, statusFilter, canManage, page])

  useEffect(() => { void load() }, [load])

  // Search / filter changes start again from page 1.
  useEffect(() => { setPage(1) }, [debouncedSearch, roleFilter, departmentFilter, statusFilter])

  const roleMap = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles])
  const employeeRoleMap = useMemo(() => new Map(employeeRoles.map((r) => [r.id, r])), [employeeRoles])

  const displayRoleName = useCallback((member: Profile): string => {
    const fromRoleSystem = member.role_id ? roleMap.get(member.role_id)?.name : undefined
    return fromRoleSystem || ROLE_LABELS[member.role] || member.role
  }, [roleMap])

  const memberJobTitle = useCallback((member: Profile): string => {
    if (member.job_title) return member.job_title
    const jobRole = member.employee_role_id ? employeeRoleMap.get(member.employee_role_id) : undefined
    return jobRole?.name || ''
  }, [employeeRoleMap])

  const memberSpecialization = useCallback((member: Profile): string => {
    if (member.specialization) return member.specialization
    const jobRole = member.employee_role_id ? employeeRoleMap.get(member.employee_role_id) : undefined
    return jobRole?.name || ''
  }, [employeeRoleMap])

  const roleOptions = useMemo(() => {
    const names = new Set<string>([
      ...roles.filter((r) => r.key !== 'client' && r.is_active).map((r) => r.name),
      ...Object.values(ROLE_LABELS),
    ])
    return [...names].sort((a, b) => a.localeCompare(b))
  }, [roles])

  const hasFilters = search.trim() !== '' || roleFilter !== 'all' || departmentFilter !== 'all' || statusFilter !== 'active'

  const resetFilters = () => {
    setSearch('')
    setRoleFilter('all')
    setDepartmentFilter('all')
    setStatusFilter('active')
  }

  if (loading) {
    return <Panel><LoadingState label="Loading the team directory…" /></Panel>
  }

  return (
    <div className="space-y-5">
      {error && <InlineAlert>{error}</InlineAlert>}

      {/* Filters */}
      <Panel>
        <div className="grid gap-3 p-5 lg:grid-cols-[minmax(0,1.4fr)_repeat(2,minmax(0,1fr))_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
            <input
              placeholder="Search by name, title, or specialization…"
              className={`${inputClassName} pl-10`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search team members"
            />
          </div>

          <select
            className={inputClassName}
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            aria-label="Filter by role"
          >
            <option value="all">All roles</option>
            {roleOptions.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>

          <select
            className={inputClassName}
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            aria-label="Filter by department or specialization"
          >
            <option value="all">All departments</option>
            {departmentOptions.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>

          {canManage ? (
            <select
              className={inputClassName}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              aria-label="Filter by status"
            >
              <option value="active">Active only</option>
              <option value="inactive">Inactive only</option>
              <option value="all">All statuses</option>
            </select>
          ) : (
            <div className="hidden items-center gap-2 text-xs text-text-tertiary lg:flex">
              <Filter className="h-3.5 w-3.5" />
              Showing active members
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-3 text-xs text-text-tertiary">
          <span>
            {total} member{total === 1 ? '' : 's'}
            {!canManage ? ' · showing active members' : statusFilter !== 'active' ? ` · status: ${statusFilter}` : ''}
          </span>
          {hasFilters && (
            <button type="button" onClick={resetFilters} className="text-accent hover:underline">
              Reset filters
            </button>
          )}
        </div>
      </Panel>

      {/* Cards */}
      {members.length === 0 ? (
        <Panel>
          <EmptyState
            icon={UsersRound}
            title="No team members found"
            description={hasFilters ? 'No members match the current filters. Try adjusting or resetting them.' : 'Add team members from Administration → Team Management to populate the directory.'}
          />
        </Panel>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Team members">
          {members.map((member) => {
            const inactive = member.status !== 'active'
            const jobTitle = memberJobTitle(member)
            const specialization = memberSpecialization(member)
            return (
              <li key={member.id}>
                <Link
                  href={`/team/${member.id}`}
                  className={`group block h-full rounded-md border border-border bg-surface p-5 transition hover:border-line-light hover:bg-surface-raised/60 ${inactive ? 'opacity-70' : ''}`}
                  aria-label={`Open profile of ${member.full_name || member.email}`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`h-14 w-14 shrink-0 overflow-hidden rounded-full border border-border bg-surface-raised ${inactive ? 'grayscale' : ''}`}>
                      {member.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={member.avatar_url} alt={member.full_name || 'Team member photo'} className="h-full w-full object-cover" />
                      ) : (
                        <Initials member={member} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-fg group-hover:text-accent">
                        {member.full_name || 'Unnamed member'}
                      </p>
                      <p className="truncate text-xs text-text-secondary">{jobTitle || displayRoleName(member)}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <span className="inline-flex rounded border border-border px-1.5 py-0.5 text-[10px] text-text-secondary">
                          {displayRoleName(member)}
                        </span>
                        {specialization && (
                          <span className="inline-flex max-w-full truncate rounded border border-border px-1.5 py-0.5 text-[10px] text-text-secondary">
                            {specialization}
                          </span>
                        )}
                        {inactive && (
                          <span className="inline-flex rounded border border-red-500/30 bg-red-500/5 px-1.5 py-0.5 text-[10px] text-red-400">
                            Inactive
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <p className="mt-4 line-clamp-3 text-xs leading-relaxed text-text-tertiary">
                    {member.bio || 'No bio added yet.'}
                  </p>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
      {members.length > 0 && (
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={(next) => setPage(Math.min(Math.max(1, next), Math.max(1, Math.ceil(total / PAGE_SIZE))))} />
      )}
    </div>
  )
}
