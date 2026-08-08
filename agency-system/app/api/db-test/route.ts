import { NextResponse } from 'next/server'
import { supabase, isDatabaseConnected, checkDatabase } from '@/lib/supabase/client'

export async function GET() {
  const connection = checkDatabase()

  if (!connection.ready) {
    return NextResponse.json({
      status: 'disconnected',
      message: connection.message,
      tables: null,
    })
  }

  // Check if tables exist
  const { data: tables, error } = await supabase!
    .from('clients')
    .select('id')
    .limit(1)

  if (error) {
    return NextResponse.json({
      status: 'error',
      message: error.message,
      tables: null,
    })
  }

  // Get counts
  const [clientsRes, projectsRes, tasksRes, filesRes] = await Promise.all([
    supabase!.from('clients').select('id', { count: 'exact', head: true }),
    supabase!.from('projects').select('id', { count: 'exact', head: true }),
    supabase!.from('tasks').select('id', { count: 'exact', head: true }),
    supabase!.from('files').select('id', { count: 'exact', head: true }),
  ])

  return NextResponse.json({
    status: 'connected',
    message: 'Supabase is connected and ready',
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    tables: {
      clients: clientsRes.count ?? 0,
      projects: projectsRes.count ?? 0,
      tasks: tasksRes.count ?? 0,
      files: filesRes.count ?? 0,
    },
  })
}
