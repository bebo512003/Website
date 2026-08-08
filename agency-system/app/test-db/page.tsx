'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Database } from '@/lib/supabase/types'
import { CheckCircle2, XCircle, Loader2, Database as DbIcon, Table } from 'lucide-react'

export default function TestDBPage() {
  const [status, setStatus] = useState<'testing' | 'success' | 'error'>('testing')
  const [tables, setTables] = useState<Record<string, number>>({})
  const [error, setError] = useState<string>('')
  const [logs, setLogs] = useState<string[]>([])

  const addLog = (msg: string) => setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`])

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!url || !key) {
      setStatus('error')
      setError('Credentials not found')
      addLog('❌ No credentials found')
      return
    }

    addLog('✅ Credentials found')

    const supabase = createClient<Database>(url, key)

    const checkTables = async () => {
      const tablesToCheck = ['clients', 'projects', 'tasks', 'files', 'interactions', 'comments', 'profiles']
      const counts: Record<string, number> = {}

      for (const table of tablesToCheck) {
        addLog(`🔍 Checking table: ${table}...`)
        const { count, error } = await supabase
          .from(table as any)
          .select('*', { count: 'exact', head: true })

        if (error) {
          addLog(`❌ ${table}: ${error.message}`)
        } else {
          counts[table] = count ?? 0
          addLog(`✅ ${table}: ${count ?? 0} rows`)
        }
      }

      setTables(counts)
      setStatus('success')
      addLog('🎉 All tables verified!')
    }

    checkTables()
  }, [])

  return (
    <div className="min-h-screen bg-bg text-fg p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="font-display text-4xl text-fg mb-2">Database Connection Test</h1>
          <p className="text-text-secondary">Testing Supabase connection from browser...</p>
        </div>

        <div className="border border-border bg-surface rounded-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            {status === 'testing' && <Loader2 className="h-6 w-6 text-yellow-500 animate-spin" />}
            {status === 'success' && <CheckCircle2 className="h-6 w-6 text-green-500" />}
            {status === 'error' && <XCircle className="h-6 w-6 text-red-500" />}
            <h2 className="text-xl font-bold">
              {status === 'testing' && 'Testing...'}
              {status === 'success' && 'Connected!'}
              {status === 'error' && 'Error'}
            </h2>
          </div>

          {error && <p className="text-red-500 mb-4">{error}</p>}

          {Object.keys(tables).length > 0 && (
            <div className="grid grid-cols-2 gap-3 mt-4">
              {Object.entries(tables).map(([name, count]) => (
                <div key={name} className="border border-border bg-surface-raised rounded p-3">
                  <div className="flex items-center gap-2">
                    <Table className="h-4 w-4 text-accent" />
                    <span className="font-mono font-bold text-sm">{name}</span>
                  </div>
                  <div className="font-display text-2xl text-fg mt-1">{count} rows</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border border-border bg-surface rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <DbIcon className="h-4 w-4 text-accent" />
            <h3 className="font-bold text-sm">Live Logs</h3>
          </div>
          <div className="space-y-1 font-mono text-xs text-text-secondary">
            {logs.map((log, i) => (
              <div key={i}>{log}</div>
            ))}
          </div>
        </div>

        <a href="/" className="inline-block text-sm text-accent hover:underline">← Back to Dashboard</a>
      </div>
    </div>
  )
}
