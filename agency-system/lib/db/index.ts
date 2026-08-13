/**
 * Domain-based data layer (Session 28). Each module owns one domain; the
 * barrel keeps a single import surface for callers:
 *   import { getProjects, getTasksPage } from '@/lib/db'
 */
export * from './shared'
export * from './analytics'
export * from './access'
export * from './team'
export * from './clients'
export * from './portal'
export * from './projects'
export * from './tasks'
export * from './files'
export * from './notifications'
export * from './forms'
export * from './portfolio'
export * from './profile'

