import { createClient } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { sanitizeFileName, validateFile } from '@/lib/storage-config'

// ── POST /api/forms/upload-url ───────────────────────────────────────────────
// Issues a short-lived signed upload URL so a public respondent can attach a
// file without Anonymous Sign-ins (and without sending the bytes through
// Vercel, which would hit the serverless body-size cap).
//
// The file lands in the caller's folder when a session JWT is present, or in
// the shared `anon/` folder otherwise. submit_dynamic_form only attaches
// paths in those folders.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    if (!SUPABASE_URL || (!SERVICE_ROLE_KEY && !ANON_KEY)) {
      return NextResponse.json({ error: 'File upload is temporarily unavailable.' }, { status: 503 })
    }

    let body: { name?: unknown; size?: unknown; mimeType?: unknown; accessToken?: unknown }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
    }

    const name = typeof body.name === 'string' ? body.name : ''
    const size = typeof body.size === 'number' ? body.size : Number(body.size)
    const mimeType = typeof body.mimeType === 'string' ? body.mimeType : ''
    const accessToken = typeof body.accessToken === 'string' ? body.accessToken : ''

    const stub = { name, size: Number.isFinite(size) ? size : 0, type: mimeType } as File
    const validation = validateFile(stub, 'form-files')
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error || 'Invalid file.' }, { status: 400 })
    }

    const safeName = validation.sanitizedName || sanitizeFileName(name)

    let folder = 'anon'
    if (accessToken && ANON_KEY) {
      const authClient = createClient(SUPABASE_URL, ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      })
      const { data } = await authClient.auth.getUser(accessToken)
      if (data.user?.id) folder = data.user.id
    }

    const path = `${folder}/${randomUUID()}-${safeName}`
    const key = SERVICE_ROLE_KEY || ANON_KEY
    const storage = createClient(SUPABASE_URL, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })

    const { data, error } = await storage.storage.from('form-files').createSignedUploadUrl(path)
    if (error || !data) {
      console.error('[forms/upload-url]', error?.message)
      return NextResponse.json({ error: 'Could not prepare the file upload. Please try again.' }, { status: 500 })
    }

    return NextResponse.json({
      path: data.path || path,
      token: data.token,
      signedUrl: data.signedUrl,
    })
  } catch (error) {
    console.error('[forms/upload-url] unexpected', error)
    return NextResponse.json({ error: 'Could not prepare the file upload. Please try again.' }, { status: 500 })
  }
}
