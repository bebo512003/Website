// Frontend copy of the permission catalog. The source of truth is the `permissions`
// table in Postgres (see migration 20260810000000_role_permission_system.sql); this
// module exists so the UI can label, group, and route-guard by permission without
// hardcoding a role → permission map. Role names never imply permissions.

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

// Which permission is required to open each staff route. This is enforced in the
// AppShell guard so manually typing a URL cannot bypass it; RLS enforces the same
// rules at the database layer.
export const ROUTE_PERMISSIONS: { prefix: string; permission: string; exact?: boolean }[] = [
  { prefix: '/admin', permission: 'admin.manage' },
  { prefix: '/team', permission: 'employee.view' },
  { prefix: '/projects', permission: 'project.view' },
  { prefix: '/clients', permission: 'client.view' },
  { prefix: '/tasks', permission: 'task.view' },
  { prefix: '/files', permission: 'file.view' },
  { prefix: '/forms', permission: 'submission.view' },
  { prefix: '/reports', permission: 'report.view' },
  { prefix: '/notifications', permission: 'notification.view' },
  { prefix: '/settings', permission: 'settings.view' },
  { prefix: '/ai-assistant', permission: 'workspace.access' },
  { prefix: '/templates', permission: 'workspace.access' },
  { prefix: '/dashboard', permission: 'dashboard.view', exact: true },
]

export function permissionRequiredForPath(pathname: string): string | null {
  // Longest matching prefix wins, so /projects/[id] inherits /projects.
  let best: string | null = null
  let bestLength = -1
  for (const rule of ROUTE_PERMISSIONS) {
    const matches = rule.exact ? pathname === rule.prefix : pathname === rule.prefix || pathname.startsWith(rule.prefix + '/')
    if (matches && rule.prefix.length > bestLength) {
      best = rule.permission
      bestLength = rule.prefix.length
    }
  }
  return best
}

export function permissionName(key: string): string {
  return PERMISSIONS.find((p) => p.key === key)?.name || key
}

export function permissionCategories(): string[] {
  return [...new Set(PERMISSIONS.map((p) => p.category))]
}

// ── Category presentation for the role editor ────────────────────────────────
// The `permissions` table stores category slugs in lowercase (e.g. 'access-control').
// The admin UI groups checkboxes by category and shows these friendly labels so a
// non-technical Admin never sees raw slugs or permission keys.
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

// Display order for the grouped checkbox grid. Categories missing from this list
// are appended alphabetically afterwards, so new catalog rows still show up.
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
