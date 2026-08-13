'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Building2, Mail, MapPin, Pencil, Plus, Search, Trash2, Users } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { createClient, deleteClient, getClientsPage, updateClient } from '@/lib/supabase/database'
import type { Client } from '@/lib/supabase/types'
import { useDebouncedValue } from '@/lib/use-debounced-value'
import { Pagination } from '@/components/ui/pagination'
import { EmptyState, InlineAlert, LoadingState, Modal, Page, PageHeader, Panel, inputClassName, primaryButtonClassName, secondaryButtonClassName } from '@/components/ui/page'
import { useConfirm } from '@/components/ui/confirm-dialog'

const PAGE_SIZE = 24

const blankForm = { name: '', type: 'smb' as Client['type'], status: 'active' as Client['status'], industry: '', contact_person: '', contact_position: '', email: '', phone: '', location: '', website: '', notes: '' }
type Form = typeof blankForm

function clientToForm(client: Client): Form {
  return { name: client.name, type: client.type, status: client.status, industry: client.industry || '', contact_person: client.contact_person || '', contact_position: client.contact_position || '', email: client.email || '', phone: client.phone || '', location: client.location || '', website: client.website || '', notes: client.notes || '' }
}

export default function ClientsPage() {
  const { can } = useAuth()
  const confirm = useConfirm()
  const canCreate = can('client.create')
  const canEdit = can('client.edit')
  const [clients, setClients] = useState<Client[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | Client['status']>('all')
  const [typeFilter, setTypeFilter] = useState<'all' | Client['type']>('all')
  const [sort, setSort] = useState<'name' | 'newest' | 'oldest'>('name')
  const [page, setPage] = useState(1)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<Client | null>(null)
  const [form, setForm] = useState<Form>(blankForm)

  const debouncedQuery = useDebouncedValue(query, 300)

  const load = useCallback(async () => {
    setLoading(true)
    const result = await getClientsPage({
      search: debouncedQuery,
      status: statusFilter,
      type: typeFilter,
      sort,
      page,
      pageSize: PAGE_SIZE,
    })
    setClients(result.data)
    setTotal(result.total)
    setError(result.error || '')
    setLoading(false)
  }, [debouncedQuery, statusFilter, typeFilter, sort, page])

  useEffect(() => { void load() }, [load])

  // Any filter/search/sort change starts again from page 1.
  useEffect(() => { setPage(1) }, [debouncedQuery, statusFilter, typeFilter, sort])

  const openCreate = () => { setEditing(null); setForm(blankForm); setModal(true) }
  const openEdit = (client: Client) => { setEditing(client); setForm(clientToForm(client)); setModal(true) }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true); setError(''); setMessage('')
    const payload = { ...form, name: form.name.trim(), industry: form.industry.trim() || null, contact_person: form.contact_person.trim() || null, contact_position: form.contact_position.trim() || null, email: form.email.trim() || null, phone: form.phone.trim() || null, location: form.location.trim() || null, website: form.website.trim() || null, notes: form.notes.trim() || null }
    const result = editing ? await updateClient(editing.id, payload) : await createClient(payload)
    setSaving(false)
    if (result.error) setError(result.error)
    else { setModal(false); setMessage(editing ? 'Client updated.' : 'Client created.'); await load() }
  }

  const remove = async (client: Client) => {
    const ok = await confirm({
      title: `Delete “${client.name}”?`,
      description: 'Clients with projects cannot be deleted.',
      confirmLabel: 'Delete client',
      tone: 'destructive',
    })
    if (!ok) return
    const result = await deleteClient(client.id)
    if (result.error) setError(result.error)
    else { setMessage('Client deleted.'); await load() }
  }

  const filtersActive = query.trim() !== '' || statusFilter !== 'all' || typeFilter !== 'all' || sort !== 'name'
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <Page>
      <PageHeader eyebrow="CLIENTS / DIRECTORY" title="Clients" description="Client records are secured by the same project access rules as the rest of the workspace. Search, filters, and pagination run in the database." action={canCreate ? <button onClick={openCreate} className={primaryButtonClassName}><Plus className="h-4 w-4" /> New client</button> : undefined} />
      {error && <InlineAlert>{error}</InlineAlert>}{message && <InlineAlert tone="success">{message}</InlineAlert>}
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
          <div className="relative w-full max-w-md"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" /><input className={`${inputClassName} pl-9`} placeholder="Search clients…" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
          <div className="flex flex-wrap items-center gap-3">
            <select aria-label="Filter by status" className={`${inputClassName} w-40`} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | Client['status'])}>
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="potential">Potential</option>
            </select>
            <select aria-label="Filter by type" className={`${inputClassName} w-44`} value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as 'all' | Client['type'])}>
              <option value="all">All types</option>
              <option value="enterprise">Enterprise</option>
              <option value="smb">Small or medium business</option>
              <option value="individual">Individual</option>
              <option value="potential">Potential</option>
            </select>
            <select aria-label="Sort clients" className={`${inputClassName} w-40`} value={sort} onChange={(event) => setSort(event.target.value as 'name' | 'newest' | 'oldest')}>
              <option value="name">Name A–Z</option>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
            <span className="text-xs text-text-tertiary">{total} client{total === 1 ? '' : 's'}</span>
            {filtersActive && (
              <button type="button" className="text-xs font-medium text-text-secondary hover:text-accent" onClick={() => { setQuery(''); setStatusFilter('all'); setTypeFilter('all'); setSort('name') }}>
                Clear
              </button>
            )}
          </div>
        </div>
        {loading ? <LoadingState label="Loading clients…" /> : clients.length === 0 ? <EmptyState icon={Users} title={total ? 'No clients match your search' : 'No clients yet'} description={total ? 'Try different search text or filters.' : canCreate ? 'Create the first real client record.' : 'Clients connected to your assigned projects will appear here.'} action={canCreate && !total ? <button onClick={openCreate} className={primaryButtonClassName}><Plus className="h-4 w-4" /> New client</button> : undefined} /> : <>
          <div className="grid gap-px bg-border md:grid-cols-2 xl:grid-cols-3">{clients.map((client) => <article key={client.id} className="bg-surface p-5 hover:bg-surface-raised"><div className="flex items-start justify-between gap-3"><div className="flex h-10 w-10 items-center justify-center rounded border border-border bg-surface-raised"><Building2 className="h-5 w-5 text-accent" /></div>{canEdit && <div className="flex gap-1"><button onClick={() => openEdit(client)} className="rounded border border-border p-1.5 text-text-tertiary hover:text-fg" aria-label={`Edit ${client.name}`}><Pencil className="h-3.5 w-3.5" /></button>{can('client.delete') && <button onClick={() => void remove(client)} className="rounded border border-border p-1.5 text-text-tertiary hover:text-red-400" aria-label={`Delete ${client.name}`}><Trash2 className="h-3.5 w-3.5" /></button>}</div>}</div><Link href={`/clients/${client.id}`} className="mt-5 block text-lg font-semibold hover:text-accent">{client.name}</Link><p className="mt-1 text-xs capitalize text-text-tertiary">{client.type} · {client.status}{client.industry ? ` · ${client.industry}` : ''}</p><div className="mt-5 space-y-2 text-xs text-text-secondary">{client.email && <div className="flex items-center gap-2"><Mail className="h-3.5 w-3.5" />{client.email}</div>}{client.location && <div className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5" />{client.location}</div>}</div></article>)}</div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={(next) => setPage(Math.min(Math.max(1, next), pageCount))} />
        </>}
      </Panel>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit client' : 'Create client'} description="Client information is stored in Supabase."><form onSubmit={submit} className="grid gap-4 sm:grid-cols-2"><label className="text-xs text-text-secondary sm:col-span-2">Client name<input required className={`${inputClassName} mt-2`} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label className="text-xs text-text-secondary">Type<select className={`${inputClassName} mt-2`} value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as Client['type'] })}><option value="enterprise">Enterprise</option><option value="smb">Small or medium business</option><option value="individual">Individual</option><option value="potential">Potential</option></select></label><label className="text-xs text-text-secondary">Status<select className={`${inputClassName} mt-2`} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as Client['status'] })}><option value="active">Active</option><option value="inactive">Inactive</option><option value="potential">Potential</option></select></label><label className="text-xs text-text-secondary">Industry<input className={`${inputClassName} mt-2`} value={form.industry} onChange={(event) => setForm({ ...form, industry: event.target.value })} /></label><label className="text-xs text-text-secondary">Contact person<input className={`${inputClassName} mt-2`} value={form.contact_person} onChange={(event) => setForm({ ...form, contact_person: event.target.value })} /></label><label className="text-xs text-text-secondary">Contact role<input className={`${inputClassName} mt-2`} value={form.contact_position} onChange={(event) => setForm({ ...form, contact_position: event.target.value })} /></label><label className="text-xs text-text-secondary">Email<input type="email" className={`${inputClassName} mt-2`} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label><label className="text-xs text-text-secondary">Phone<input className={`${inputClassName} mt-2`} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label><label className="text-xs text-text-secondary">Location<input className={`${inputClassName} mt-2`} value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} /></label><label className="text-xs text-text-secondary sm:col-span-2">Website<input className={`${inputClassName} mt-2`} placeholder="https://example.com" value={form.website} onChange={(event) => setForm({ ...form, website: event.target.value })} /></label><label className="text-xs text-text-secondary sm:col-span-2">Notes<textarea className={`${inputClassName} mt-2 min-h-24`} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label><div className="flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={() => setModal(false)} className={secondaryButtonClassName}>Cancel</button><button className={primaryButtonClassName} disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Create client'}</button></div></form></Modal>
    </Page>
  )
}
