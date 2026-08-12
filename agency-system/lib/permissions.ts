// Frontend copy of the permission catalog. The source of truth is the `permissions`
// table in Postgres; this module labels, groups, and route-guards by permission
// without hardcoding a role → permission map. Role names never imply permissions.

export type PermissionDef = {
  key: string
  name: string
  category: string
  description?: string
}

export const PERMISSIONS: PermissionDef[] = [
  { key: 'workspace.access', name: 'Workspace access', category: 'General', description: 'Base access to the staff workspace.' },
  { key: 'dashboard.view', name: 'View dashboard', category: 'General', description: 'See the workspace overview dashboard.' },

  { key: 'project.view', name: 'View projects', category: 'Projects', description: 'View projects you can access.' },
  { key: 'project.view_all', name: 'View all projects', category: 'Projects', description: 'View every project in the workspace.' },
  { key: 'project.create', name: 'Create projects', category: 'Projects', description: 'Create new projects.' },
  { key: 'project.edit', name: 'Edit projects', category: 'Projects', description: 'Update project details, status, and progress.' },
  { key: 'project.delete', name: 'Delete projects', category: 'Projects', description: 'Delete projects.' },
  { key: 'project.assign', name: 'Assign projects', category: 'Projects', description: 'Assign employees to projects.' },

  { key: 'client.view', name: 'View clients', category: 'Clients', description: 'View client records you can access.' },
  { key: 'client.view_all', name: 'View all clients', category: 'Clients', description: 'View every client record.' },
  { key: 'client.create', name: 'Create clients', category: 'Clients', description: 'Create new client records.' },
  { key: 'client.edit', name: 'Edit clients', category: 'Clients', description: 'Update client records and interactions.' },
  { key: 'client.delete', name: 'Delete clients', category: 'Clients', description: 'Delete client records.' },

  { key: 'task.view', name: 'View tasks', category: 'Tasks', description: 'View tasks in projects you can access.' },
  { key: 'task.create', name: 'Create tasks', category: 'Tasks', description: 'Create tasks in accessible projects.' },
  { key: 'task.edit', name: 'Edit tasks', category: 'Tasks', description: 'Update tasks (status, priority, etc.).' },
  { key: 'task.delete', name: 'Delete tasks', category: 'Tasks', description: 'Delete tasks.' },
  { key: 'task.assign', name: 'Assign tasks', category: 'Tasks', description: 'Assign tasks to people.' },

  { key: 'file.view', name: 'View files', category: 'Files', description: 'View files in projects you can access.' },
  { key: 'file.upload', name: 'Upload files', category: 'Files', description: 'Upload files to accessible projects.' },
  { key: 'file.edit', name: 'Edit files', category: 'Files', description: 'Update and rename files.' },
  { key: 'file.delete', name: 'Delete files', category: 'Files', description: 'Delete files.' },

  { key: 'submission.view', name: 'View submissions', category: 'Submissions', description: 'View intake/submission records.' },
  { key: 'submission.edit', name: 'Edit submissions', category: 'Submissions', description: 'Update submission records.' },
  { key: 'submission.assign', name: 'Assign submissions', category: 'Submissions', description: 'Assign submissions to projects or people.' },

  { key: 'form.view', name: 'View forms', category: 'Forms', description: 'Open the form inventory, including drafts that are not public.' },
  { key: 'form.manage', name: 'Manage forms', category: 'Forms', description: 'Create, edit, publish, duplicate, archive and delete dynamic forms and their questions.' },

  { key: 'portfolio.manage', name: 'Manage portfolio', category: 'Portfolio', description: 'Create, edit, reorder, publish, archive, and delete public portfolio projects and images.' },

  { key: 'employee.view', name: 'View employees', category: 'Employees', description: 'View the team member directory.' },
  { key: 'employee.edit', name: 'Edit employees', category: 'Employees', description: 'Edit team member details.' },
  { key: 'employee.delete', name: 'Delete employees', category: 'Employees', description: 'Remove team members.' },
  { key: 'employee.manage', name: 'Manage employees', category: 'Employees', description: 'Change system roles, status, and job roles.' },

  { key: 'role.view', name: 'View roles', category: 'Access control', description: 'View the role catalog.' },
  { key: 'role.create', name: 'Create roles', category: 'Access control', description: 'Create new roles.' },
  { key: 'role.edit', name: 'Edit roles', category: 'Access control', description: 'Edit roles.' },
  { key: 'role.delete', name: 'Delete roles', category: 'Access control', description: 'Delete roles.' },
  { key: 'role.assign_permissions', name: 'Assign permissions to roles', category: 'Access control', description: 'Grant or revoke permissions on roles.' },
  { key: 'permission.view', name: 'View permissions', category: 'Access control', description: 'View the permission catalog.' },
  { key: 'permission.manage', name: 'Manage permissions', category: 'Access control', description: 'Add or edit permissions in the catalog.' },

  { key: 'settings.view', name: 'View settings', category: 'Settings', description: 'Open the settings area.' },
  { key: 'settings.edit', name: 'Edit system settings', category: 'Settings', description: 'Change workspace settings.' },
  { key: 'report.view', name: 'View reports', category: 'Reports', description: 'Open the reports area.' },
  { key: 'notification.view', name: 'View notifications', category: 'Notifications', description: 'View your notifications inbox.' },
  { key: 'admin.manage', name: 'Manage system', category: 'Admin', description: 'Full system administration.' },
  { key: 'portal.view', name: 'View client portal', category: 'Portal', description: 'Access the client portal.' },
]

export const ALL_PERMISSION_KEYS = PERMISSIONS.map((permission) => permission.key)

// Default seeded grants for the four system roles. Custom roles start empty and
// receive only the boxes an administrator checks. Admin is every catalog key.
export const ROLE_CAPABILITY_MATRIX: Record<'admin' | 'manager' | 'employee' | 'client', readonly string[]> = {
  admin: ALL_PERMISSION_KEYS,
  manager: [
    'workspace.access', 'dashboard.view',
    'project.view', 'project.view_all', 'project.create', 'project.edit', 'project.delete', 'project.assign',
    'client.view', 'client.view_all', 'client.create', 'client.edit',
    'task.view', 'task.create', 'task.edit', 'task.delete', 'task.assign',
    'file.view', 'file.upload', 'file.edit', 'file.delete',
    'submission.view', 'submission.edit', 'submission.assign',
    'employee.view', 'employee.edit',
    'role.view', 'permission.view',
    'settings.view', 'report.view', 'notification.view',
  ],
  employee: [
    'workspace.access', 'dashboard.view',
    'project.view',
    'task.view', 'task.edit',
    'file.view', 'file.upload',
    'employee.view',
    'report.view', 'notification.view',
  ],
  client: [
    'portal.view',
  ],
}

export const ROLE_MATRIX_LABELS: Record<keyof typeof ROLE_CAPABILITY_MATRIX, { name: string; summary: string }> = {
  admin: {
    name: 'Admin',
    summary: 'Every capability in the catalog, including role and permission management.',
  },
  manager: {
    name: 'Manager',
    summary: 'Full operational control of projects, clients, tasks, files, and submissions. Cannot manage roles, permissions, or employee accounts.',
  },
  employee: {
    name: 'Employee',
    summary: 'Assigned-project work only. No submissions or client records unless an administrator checks those boxes on a custom role.',
  },
  client: {
    name: 'Client',
    summary: 'Portal-only access. No staff workspace, submissions inbox, or CRM directory.',
  },
}

// Any of these opens the administration hub. Individual tabs and sub-routes
// still require their own capability — this list only prevents the old bug
// where form.manage (or similar) was useless without admin.manage.
export const ADMIN_AREA_PERMISSIONS = [
  'admin.manage',
  'form.view',
  'form.manage',
  'portfolio.manage',
  'employee.edit',
  'employee.delete',
  'employee.manage',
  'role.view',
  'role.create',
  'role.edit',
  'role.delete',
  'role.assign_permissions',
  'permission.view',
  'permission.manage',
  'project.assign',
  'project.create',
  'project.delete',
] as const

export type RoutePermissionRule = {
  prefix: string
  anyOf: readonly string[]
  exact?: boolean
}

// Longest matching prefix wins. Public pages (/forms, /f/*, /portfolio, /)
// never consult this list because AppShell renders them outside the staff shell.
export const ROUTE_PERMISSIONS: RoutePermissionRule[] = [
  { prefix: '/admin/forms', anyOf: ['form.manage', 'form.view', 'submission.view'] },
  { prefix: '/admin/portfolio', anyOf: ['portfolio.manage'] },
  { prefix: '/admin/roles', anyOf: ['role.view', 'role.assign_permissions', 'permission.view', 'permission.manage'] },
  { prefix: '/admin/team', anyOf: ['employee.manage', 'employee.edit'] },
  { prefix: '/admin', anyOf: ADMIN_AREA_PERMISSIONS },
  { prefix: '/submissions', anyOf: ['submission.view'] },
  { prefix: '/team', anyOf: ['employee.view'] },
  { prefix: '/projects', anyOf: ['project.view'] },
  { prefix: '/clients', anyOf: ['client.view'] },
  { prefix: '/tasks', anyOf: ['task.view'] },
  { prefix: '/files', anyOf: ['file.view'] },
  { prefix: '/reports', anyOf: ['report.view'] },
  { prefix: '/notifications', anyOf: ['notification.view'] },
  { prefix: '/settings', anyOf: ['settings.view'] },
  { prefix: '/ai-assistant', anyOf: ['workspace.access'] },
  { prefix: '/templates', anyOf: ['workspace.access'] },
  { prefix: '/dashboard', anyOf: ['dashboard.view'], exact: true },
]

export function matchRoutePermission(pathname: string): RoutePermissionRule | null {
  let best: RoutePermissionRule | null = null
  let bestLength = -1
  for (const rule of ROUTE_PERMISSIONS) {
    const matches = rule.exact
      ? pathname === rule.prefix
      : pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`)
    if (matches && rule.prefix.length > bestLength) {
      best = rule
      bestLength = rule.prefix.length
    }
  }
  return best
}

export function permissionsRequiredForPath(pathname: string): readonly string[] | null {
  return matchRoutePermission(pathname)?.anyOf ?? null
}

/** @deprecated Use permissionsRequiredForPath — routes may accept any of several keys. */
export function permissionRequiredForPath(pathname: string): string | null {
  return permissionsRequiredForPath(pathname)?.[0] ?? null
}

export function pathAllowed(pathname: string, has: (permission: string) => boolean): boolean {
  const required = permissionsRequiredForPath(pathname)
  if (!required || required.length === 0) return true
  return required.some((permission) => has(permission))
}

export function firstAllowedStaffPath(has: (permission: string) => boolean): string {
  const candidates = [
    '/dashboard',
    '/projects',
    '/tasks',
    '/team',
    '/files',
    '/notifications',
    '/reports',
    '/submissions',
    '/admin',
    '/settings',
    '/profile',
  ]
  for (const path of candidates) {
    if (pathAllowed(path, has)) return path
  }
  return '/profile'
}

export function permissionName(key: string): string {
  return PERMISSIONS.find((permission) => permission.key === key)?.name || key
}

export function permissionCategories(): string[] {
  return [...new Set(PERMISSIONS.map((permission) => permission.category))]
}

export const CATEGORY_LABELS: Record<string, string> = {
  general: 'Workspace',
  projects: 'Projects',
  clients: 'Clients',
  tasks: 'Tasks',
  files: 'Files',
  submissions: 'Submissions',
  forms: 'Forms',
  portfolio: 'Portfolio',
  employees: 'Team',
  'access-control': 'Roles & Permissions',
  settings: 'Settings',
  reports: 'Reports',
  notifications: 'Notifications',
  admin: 'System',
  portal: 'Client Portal',
}

export const CATEGORY_ORDER: string[] = [
  'general',
  'submissions',
  'forms',
  'projects',
  'clients',
  'tasks',
  'files',
  'portfolio',
  'employees',
  'access-control',
  'reports',
  'notifications',
  'settings',
  'admin',
  'portal',
]

export function categorySlug(category: string): string {
  return category.trim().toLowerCase()
}

export function categoryLabel(category: string): string {
  const slug = categorySlug(category)
  return CATEGORY_LABELS[slug] || category.replace(/[-_]+/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase())
}

export function compareCategories(a: string, b: string): number {
  const ia = CATEGORY_ORDER.indexOf(categorySlug(a))
  const ib = CATEGORY_ORDER.indexOf(categorySlug(b))
  if (ia !== -1 && ib !== -1) return ia - ib
  if (ia !== -1) return -1
  if (ib !== -1) return 1
  return categoryLabel(a).localeCompare(categoryLabel(b))
}
