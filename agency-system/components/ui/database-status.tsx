'use client'

import { AlertCircle, CheckCircle2, Database } from 'lucide-react'
import { isDatabaseConnected } from '@/lib/supabase/client'

export function DatabaseStatus() {
  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-surface p-4">
      {isDatabaseConnected ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : <AlertCircle className="h-5 w-5 text-yellow-500" />}
      <div className="flex-1"><div className="text-sm font-medium text-fg">{isDatabaseConnected ? 'Supabase configured' : 'Supabase not configured'}</div><div className="mt-0.5 text-xs text-text-secondary">{isDatabaseConnected ? 'Authentication and database requests are enabled.' : 'Add the required public environment variables to enable the application.'}</div></div>
      <Database className="h-4 w-4 text-text-tertiary" />
    </div>
  )
}
