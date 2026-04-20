'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Search } from 'lucide-react'
import { DSCard, DSInput, DSPrimaryButton, DSSecondaryButton, DSSelect } from '@/components/ui/design-system'

interface User {
  id: string
  email: string
  role: string
  status?: string
  first_name?: string
  last_name?: string
  created_at: string
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [filteredUsers, setFilteredUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [feeInputs, setFeeInputs] = useState<Record<string, string>>({})
  const [savingFeeId, setSavingFeeId] = useState<string | null>(null)

  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    const { data } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false })

    if (data) {
      setUsers(data)
      setFilteredUsers(data)
    }

    await fetchOrganizerFees()

    setLoading(false)
  }

  const fetchOrganizerFees = async () => {
    const res = await fetch('/api/admin/organizer-fees')
    if (!res.ok) return

    const payload = await res.json().catch(() => ({}))
    const overrides = Array.isArray(payload?.overrides) ? payload.overrides : []
    const nextInputs: Record<string, string> = {}

    for (const row of overrides) {
      const organizerUserId = row?.organizer_user_id
      if (organizerUserId) {
        nextInputs[organizerUserId] = String(row.platform_fee_percent ?? '')
      }
    }

    setFeeInputs(nextInputs)
  }

  const handleSearch = (term: string) => {
    setSearchTerm(term)

    const filtered = users.filter((user) =>
      user.email.toLowerCase().includes(term.toLowerCase()) ||
      user.first_name?.toLowerCase().includes(term.toLowerCase()) ||
      user.last_name?.toLowerCase().includes(term.toLowerCase())
    )

    setFilteredUsers(filtered)
  }

  const updateRole = async (id: string, newRole: string) => {
    await supabase.from('users').update({ role: newRole }).eq('id', id)
    fetchUsers()
  }

  const suspendOrganizer = async (organizerId: string) => {
    setProcessingId(organizerId)

    const res = await fetch('/api/admin/suspend-organizer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ organizerId }),
    })

    if (res.ok) {
      fetchUsers()
    }

    setProcessingId(null)
  }

  const unsuspendOrganizer = async (organizerId: string) => {
    setProcessingId(organizerId)

    const res = await fetch('/api/admin/unsuspend-organizer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ organizerId }),
    })

    if (res.ok) {
      fetchUsers()
    }

    setProcessingId(null)
  }

  const deleteOrganizer = async (organizerId: string) => {
    if (!confirm('Delete this organizer account and cancel their events?')) return

    setProcessingId(organizerId)

    const res = await fetch('/api/admin/delete-organizer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ organizerId }),
    })

    if (res.ok) {
      fetchUsers()
    }

    setProcessingId(null)
  }

  const setFeeInput = (organizerId: string, value: string) => {
    setFeeInputs((prev) => ({
      ...prev,
      [organizerId]: value,
    }))
  }

  const saveOrganizerFee = async (organizerId: string) => {
    const raw = feeInputs[organizerId]
    const parsed = Number(raw)

    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      alert('Platform fee must be a number between 0 and 100')
      return
    }

    setSavingFeeId(organizerId)

    const res = await fetch('/api/admin/organizer-fees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organizerUserId: organizerId,
        platformFeePercent: parsed,
      }),
    })

    if (!res.ok) {
      const payload = await res.json().catch(() => ({}))
      alert(payload?.error || 'Failed to save organizer fee')
    }

    setSavingFeeId(null)
  }

  const resetOrganizerFee = async (organizerId: string) => {
    setSavingFeeId(organizerId)

    const res = await fetch('/api/admin/organizer-fees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organizerUserId: organizerId,
        platformFeePercent: null,
      }),
    })

    if (!res.ok) {
      const payload = await res.json().catch(() => ({}))
      alert(payload?.error || 'Failed to reset organizer fee')
    } else {
      setFeeInput(organizerId, '')
    }

    setSavingFeeId(null)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-gold/20 border-t-gold" />
      </div>
    )
  }

  return (
    <div className="flex-1 space-y-8 p-4 text-foreground md:space-y-10 md:p-8">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">User Management</h1>
        <p className="text-muted-foreground">
          Manage platform users and roles.
        </p>
      </div>

      <DSCard className="p-6 space-y-6">

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <DSInput
            placeholder="Search by email or name..."
            value={searchTerm}
            onChange={(e) => handleSearch(e.target.value)}
            className="h-12 pl-10 rounded-2xl"
          />
        </div>

        {filteredUsers.length === 0 && (
          <div className="rounded-2xl border border-border bg-surface-card p-6 text-center text-muted-foreground">
            No users found.
          </div>
        )}

        {/* Mobile cards */}
        <div className="grid grid-cols-1 gap-3 md:hidden">
          {filteredUsers.map((user) => (
            <div
              key={user.id}
              className="space-y-3 rounded-2xl border border-border bg-card p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-gold to-gold-deep font-bold text-gold-foreground">
                    {user.first_name?.[0] || user.email[0].toUpperCase()}
                  </div>
                  <div>
                    <div className="font-semibold text-sm">
                      {user.first_name
                        ? `${user.first_name} ${user.last_name || ''}`
                        : 'N/A'}
                    </div>
                    <div className="break-all text-xs text-muted-foreground">{user.email}</div>
                  </div>
                </div>

                <span
                  className={`px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wide border ${
                    user.status === 'suspended'
                      ? 'bg-red-500/20 text-red-400 border-red-500/30'
                      : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                  }`}
                >
                  {user.status || 'active'}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>Joined {new Date(user.created_at).toLocaleDateString()}</span>
                <span
                  className={`px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider ${
                    user.role === 'admin'
                      ? 'bg-gold text-gold-foreground'
                      : user.role === 'organizer'
                      ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                      : 'border border-border bg-secondary text-secondary-foreground'
                  }`}
                >
                  {user.role}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-2">
                <DSSelect
                  value={user.role}
                  onChange={(e) => updateRole(user.id, e.target.value)}
                  className="min-h-11 px-3 rounded-xl text-sm"
                >
                  <option value="voter">Voter</option>
                  <option value="organizer">Organizer</option>
                  <option value="admin">Admin</option>
                </DSSelect>

                {user.role === 'organizer' && user.status !== 'suspended' && (
                  <button
                    onClick={() => suspendOrganizer(user.id)}
                    disabled={processingId === user.id}
                    className="min-h-11 px-3 py-2 rounded-xl text-sm font-semibold bg-yellow-100 text-yellow-700 border border-yellow-400 hover:bg-yellow-200 dark:bg-yellow-500/20 dark:text-yellow-400 dark:border-yellow-500/30 dark:hover:bg-yellow-500/30 disabled:opacity-50"
                  >
                    Suspend Organizer
                  </button>
                )}

                {user.role === 'organizer' && user.status === 'suspended' && (
                  <button
                    onClick={() => unsuspendOrganizer(user.id)}
                    disabled={processingId === user.id}
                    className="min-h-11 px-3 py-2 rounded-xl text-sm font-semibold bg-emerald-100 text-emerald-700 border border-emerald-400 hover:bg-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/30 dark:hover:bg-emerald-500/30 disabled:opacity-50"
                  >
                    Unsuspend Organizer
                  </button>
                )}

                {user.role === 'organizer' && (
                  <div className="grid grid-cols-1 gap-2 rounded-xl border border-border bg-surface p-2">
                    <DSInput
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={feeInputs[user.id] ?? ''}
                      onChange={(e) => setFeeInput(user.id, e.target.value)}
                      placeholder="Platform fee %"
                      className="min-h-10 rounded-lg text-sm"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <DSPrimaryButton
                        onClick={() => saveOrganizerFee(user.id)}
                        disabled={savingFeeId === user.id}
                        className="min-h-10 rounded-lg text-xs"
                      >
                        {savingFeeId === user.id ? 'Saving...' : 'Save Fee'}
                      </DSPrimaryButton>
                      <DSSecondaryButton
                        onClick={() => resetOrganizerFee(user.id)}
                        disabled={savingFeeId === user.id}
                        className="min-h-10 rounded-lg text-xs"
                      >
                        Use Default
                      </DSSecondaryButton>
                    </div>
                  </div>
                )}

                {user.role === 'organizer' && (
                  <button
                    onClick={() => deleteOrganizer(user.id)}
                    disabled={processingId === user.id}
                    className="min-h-11 px-3 py-2 rounded-xl text-sm font-semibold bg-red-100 text-red-700 border border-red-400 hover:bg-red-200 dark:bg-red-500/20 dark:text-red-400 dark:border-red-500/30 dark:hover:bg-red-500/30 disabled:opacity-50"
                  >
                    Delete Organizer
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                <th className="text-left py-4">User</th>
                <th className="text-left py-4">Email</th>
                <th className="text-left py-4">Role</th>
                <th className="text-left py-4">Status</th>
                <th className="text-left py-4">Joined</th>
                <th className="text-right py-4">Action</th>
              </tr>
            </thead>

            <tbody>
              {filteredUsers.map((user) => (
                <tr
                  key={user.id}
                  className="border-b border-border/60 transition hover:bg-muted/30"
                >
                  <td className="py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-gold to-gold-deep font-bold text-gold-foreground">
                        {user.first_name?.[0] ||
                          user.email[0].toUpperCase()}
                      </div>
                      <div>
                        <div className="font-semibold">
                          {user.first_name
                            ? `${user.first_name} ${user.last_name || ''}`
                            : 'N/A'}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="py-4 text-muted-foreground">
                    {user.email}
                  </td>

                  <td className="py-4">
                    <span
                      className={`px-4 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${
                        user.role === 'admin'
                          ? 'bg-gold text-gold-foreground'
                          : user.role === 'organizer'
                          ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                          : 'border border-border bg-secondary text-secondary-foreground'
                      }`}
                    >
                      {user.role}
                    </span>
                  </td>

                  <td className="py-4">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide border ${
                        user.status === 'suspended'
                          ? 'bg-red-500/20 text-red-400 border-red-500/30'
                          : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                      }`}
                    >
                      {user.status || 'active'}
                    </span>
                  </td>

                  <td className="py-4 text-muted-foreground">
                    {new Date(user.created_at).toLocaleDateString()}
                  </td>

                  <td className="py-4 text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      <DSSelect
                        value={user.role}
                        onChange={(e) =>
                          updateRole(user.id, e.target.value)
                        }
                        className="min-h-10 px-3 rounded-xl text-sm"
                      >
                        <option value="voter">Voter</option>
                        <option value="organizer">Organizer</option>
                        <option value="admin">Admin</option>
                      </DSSelect>

                      {user.role === 'organizer' && user.status !== 'suspended' && (
                        <button
                          onClick={() => suspendOrganizer(user.id)}
                          disabled={processingId === user.id}
                          className="min-h-10 px-3 py-2 rounded-xl text-xs font-semibold bg-yellow-100 text-yellow-700 border border-yellow-400 hover:bg-yellow-200 dark:bg-yellow-500/20 dark:text-yellow-400 dark:border-yellow-500/30 dark:hover:bg-yellow-500/30 disabled:opacity-50"
                        >
                          Suspend
                        </button>
                      )}

                      {user.role === 'organizer' && user.status === 'suspended' && (
                        <button
                          onClick={() => unsuspendOrganizer(user.id)}
                          disabled={processingId === user.id}
                          className="min-h-10 px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-100 text-emerald-700 border border-emerald-400 hover:bg-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/30 dark:hover:bg-emerald-500/30 disabled:opacity-50"
                        >
                          Unsuspend
                        </button>
                      )}

                      {user.role === 'organizer' && (
                        <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-2 py-2">
                          <DSInput
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={feeInputs[user.id] ?? ''}
                            onChange={(e) => setFeeInput(user.id, e.target.value)}
                            placeholder="Fee %"
                            className="h-10 w-24 rounded-lg px-2 text-xs"
                          />
                          <DSPrimaryButton
                            onClick={() => saveOrganizerFee(user.id)}
                            disabled={savingFeeId === user.id}
                            className="h-10 px-3 rounded-lg text-xs"
                          >
                            {savingFeeId === user.id ? '...' : 'Save Fee'}
                          </DSPrimaryButton>
                          <DSSecondaryButton
                            onClick={() => resetOrganizerFee(user.id)}
                            disabled={savingFeeId === user.id}
                            className="h-10 px-3 rounded-lg text-xs"
                          >
                            Default
                          </DSSecondaryButton>
                        </div>
                      )}

                      {user.role === 'organizer' && (
                        <button
                          onClick={() => deleteOrganizer(user.id)}
                          disabled={processingId === user.id}
                          className="min-h-10 px-3 py-2 rounded-xl text-xs font-semibold bg-red-100 text-red-700 border border-red-400 hover:bg-red-200 dark:bg-red-500/20 dark:text-red-400 dark:border-red-500/30 dark:hover:bg-red-500/30 disabled:opacity-50"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </DSCard>
    </div>
  )
}
