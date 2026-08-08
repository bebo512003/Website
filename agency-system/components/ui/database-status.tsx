'use client'

import { useEffect, useState } from 'react'
import { Database, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'

export function DatabaseStatus() {
  const [status, setStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking')

  useEffect(() => {
    // Check if Supabase is connected
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    
    if (url && key && url !== 'your_supabase_url_here') {
      setStatus('connected')
    } else {
      setStatus('disconnected')
    }
  }, [])

  return (
    <div className="flex items-center gap-3 p-4 border border-border rounded-[4px] bg-surface">
      {status === 'checking' ? (
        <Loader2 className="h-5 w-5 text-text-secondary animate-spin" />
      ) : status === 'connected' ? (
        <CheckCircle2 className="h-5 w-5 text-green-500" />
      ) : (
        <AlertCircle className="h-5 w-5 text-yellow-500" />
      )}
      
      <div className="flex-1">
        <div className="text-sm font-medium text-fg">
          {status === 'checking' && 'Checking database...'}
          {status === 'connected' && 'Database Connected'}
          {status === 'disconnected' && 'Database Not Connected'}
        </div>
        <div className="font-mono-tech text-[10px] text-text-secondary mt-0.5">
          {status === 'checking' && 'Verifying connection...'}
          {status === 'connected' && 'Supabase is ready'}
          {status === 'disconnected' && 'Using mock data. See supabase/README.md to connect.'}
        </div>
      </div>

      <Database className="h-4 w-4 text-text-tertiary" />
    </div>
  )
}
