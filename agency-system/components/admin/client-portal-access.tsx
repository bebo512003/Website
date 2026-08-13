'use client'

import { useCallback, useEffect, useState } from 'react'
import { Copy, Eye, EyeOff, KeyRound, Plus, Trash2, UserRound } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import {
  createClientAccount,
  deleteClientAccount,
  getClientAccountsByClientId,
  setClientAccountStatus,
} from '@/lib/supabase/database'
import type { Profile } from '@/lib/supabase/types'
import { EmptyState, InlineAlert, LoadingState, Modal, Panel, inputClassName, primaryButtonClassName, secondaryButtonClassName } from '@/components/ui/page'
import { useConfirm } from '@/components/ui/confirm-dialog'

type Credentials = { email: string; password: string }

/**
 * Admin-managed portal access for a single CRM client. Inviting a client here is
 * the only way a client login is created — public form submitters never receive
 * one. Temporary passwords are generated on the server and shown exactly once.
 */
export function ClientPortalAccess({ clientId }: { clientId: string }) {
  const { can } = useAuth()
  const confirm = useConfirm()
  const canManage = can('admin.manage')

  const [accounts, setAccounts] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')

  const [credentials, setCredentials] = useState<Credentials | null>(null)
  const [revealPassword, setRevealPassword] = useState(false)
  const [copied, setCopied] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const result = await getClientAccountsByClientId(clientId)
    setAccounts(result.data)
    setError(result.error || '')
    setLoading(false)
  }, [clientId])

  useEffect(() => { void load() }, [load])

  if (!canManage) {
    return (
      <Panel title="Portal access">
        <div className="p-5 text-xs text-text-tertiary">Only administrators can manage client portal accounts.</div>
      </Panel>
    )
  }

  const openInvite = () => { setEmail(''); setFullName(''); setCredentials(null); setMessage(''); setModalOpen(true) }

  const submitInvite = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true); setError(''); setMessage('')
    const result = await createClientAccount({ client_id: clientId, email, full_name: fullName })
    setSaving(false)
    if (result.error || !result.data) {
      setError(result.error || 'Unable to invite the client.')
      return
    }
    setCredentials({ email: result.data.profile.email, password: result.data.temporaryPassword })
    setEmail(''); setFullName('')
    await load()
  }

  const toggleStatus = async (account: Profile) => {
    setError(''); setMessage('')
    const next = account.status === 'active' ? 'inactive' : 'active'
    const result = await setClientAccountStatus(account.id, next)
    if (result.error) setError(result.error)
    else { setMessage(`Portal access ${next === 'active' ? 'restored' : 'suspended'} for ${account.email}.`); await load() }
  }

  const revoke = async (account: Profile) => {
    const ok = await confirm({
      title: `Revoke portal access for “${account.email}”?`,
      description: 'The login is removed permanently. You can re-issue an invitation later.',
      confirmLabel: 'Revoke access',
      tone: 'destructive',
    })
    if (!ok) return
    setError(''); setMessage('')
    const result = await deleteClientAccount(account.id)
    if (result.error) setError(result.error)
    else { setMessage('Portal access revoked.'); await load() }
  }

  const copyCredentials = async () => {
    if (!credentials) return
    const text = `Login: ${credentials.email}\nTemporary password: ${credentials.password}`
    try {
      await navigator.clipboard.writeText(text)
      setCopied('credentials')
      setTimeout(() => setCopied(''), 1500)
    } catch { /* clipboard unavailable */ }
  }

  return (
    <Panel
      title="Portal access"
      description="Invite this client to the secure client portal. The login is separate from any public form submission."
    >
      {error && <div className="px-5 pt-4"><InlineAlert>{error}</InlineAlert></div>}
      {message && <div className="px-5 pt-4"><InlineAlert tone="success">{message}</InlineAlert></div>}

      {loading ? (
        <LoadingState label="Loading portal accounts…" />
      ) : accounts.length === 0 ? (
        <EmptyState
          icon={UserRound}
          title="No portal account"
          description="This client has not been invited to the portal yet."
          action={<button onClick={openInvite} className={primaryButtonClassName}><Plus className="h-4 w-4" /> Invite to portal</button>}
        />
      ) : (
        <div className="divide-y divide-border">
          {accounts.map((account) => (
            <div key={account.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-fg">{account.full_name || 'Client'}</p>
                  <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${account.status === 'active' ? 'border-emerald-500/30 text-emerald-300' : 'border-border text-text-tertiary'}`}>
                    {account.status === 'active' ? 'Active' : 'Suspended'}
                  </span>
                </div>
                <p className="mt-1 truncate text-xs text-text-tertiary">{account.email}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button onClick={() => void toggleStatus(account)} className={secondaryButtonClassName}>
                  {account.status === 'active' ? 'Suspend' : 'Restore'}
                </button>
                <button onClick={() => void revoke(account)} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-text-tertiary hover:border-red-500/30 hover:text-red-400" aria-label="Revoke portal access">
                  <Trash2 className="h-3.5 w-3.5" /> Revoke
                </button>
              </div>
            </div>
          ))}
          <div className="px-5 py-4">
            <button onClick={openInvite} className={secondaryButtonClassName}><Plus className="h-4 w-4" /> Invite another contact</button>
          </div>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Invite to client portal" description="An account with a temporary password is created and linked to this client record.">
        {credentials ? (
          <div className="space-y-4">
            <div className="rounded-md border border-accent/30 bg-accent/5 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-fg">
                <KeyRound className="h-4 w-4 text-accent" /> Share these credentials securely
              </div>
              <p className="mt-2 text-xs text-text-tertiary">The temporary password is shown once and never stored. The client must replace it on first login.</p>
              <div className="mt-3 space-y-2 rounded border border-border bg-surface-raised p-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="break-all text-text-secondary">{credentials.email}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="break-all font-mono-tech text-xs text-fg">{revealPassword ? credentials.password : '•'.repeat(credentials.password.length)}</span>
                  <div className="flex shrink-0 items-center gap-1">
                    <button type="button" onClick={() => setRevealPassword((value) => !value)} className="rounded border border-border p-1.5 text-text-tertiary hover:text-fg" aria-label={revealPassword ? 'Hide password' : 'Show password'}>
                      {revealPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                    <button type="button" onClick={() => void copyCredentials()} className="rounded border border-border p-1.5 text-text-tertiary hover:text-fg" aria-label="Copy credentials">
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
              {copied === 'credentials' && <p className="mt-2 text-xs text-emerald-400">Copied to clipboard.</p>}
            </div>
            <div className="flex justify-end">
              <button onClick={() => { setModalOpen(false); setCredentials(null) }} className={primaryButtonClassName}>Done</button>
            </div>
          </div>
        ) : (
          <form onSubmit={submitInvite} className="grid gap-4">
            <label className="text-xs text-text-secondary">Full name
              <input className={`${inputClassName} mt-2`} value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Client contact name" />
            </label>
            <label className="text-xs text-text-secondary">Login email
              <input type="email" required className={`${inputClassName} mt-2`} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setModalOpen(false)} className={secondaryButtonClassName}>Cancel</button>
              <button className={primaryButtonClassName} disabled={saving}>{saving ? 'Creating…' : 'Create portal account'}</button>
            </div>
          </form>
        )}
      </Modal>
    </Panel>
  )
}
