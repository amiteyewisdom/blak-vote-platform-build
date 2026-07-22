'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useToast } from '@/hooks/use-toast'
import { DSInput, DSPrimaryButton } from '@/components/ui/design-system'
import { ArrowLeft, Plus, Trash2, Package, Save } from 'lucide-react'

type BulkPackage = {
  id: string
  event_id: string
  votes_included: number
  price_per_package: number
  description: string | null
  is_active: boolean
}

const makeEmptyPackage = (eventId: string): BulkPackage => ({
  id: '',
  event_id: eventId,
  votes_included: 0,
  price_per_package: 0,
  description: '',
  is_active: true,
})

const normalizePackage = (pkg: any, fallbackEventId: string): BulkPackage => ({
  id: String(pkg.id || ''),
  event_id: String(pkg.event_id || fallbackEventId),
  votes_included: Number(pkg.votes_included || 0),
  price_per_package: Number(pkg.price_per_package || 0),
  description: pkg.description ?? '',
  is_active: pkg.is_active !== false,
})

export default function BulkVoteManagementPage() {
  const params = useParams()
  const eventId = (params?.eventId as string) || ''
  const { toast } = useToast()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [packages, setPackages] = useState<BulkPackage[]>([])

  useEffect(() => {
    if (eventId) {
      void fetchPackages()
    }
  }, [eventId])

  const fetchPackages = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/bulk-vote-packages?event_id=${encodeURIComponent(eventId)}`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast({
          title: 'Failed to load packages',
          description: data.error || 'Unknown error',
          variant: 'destructive',
        })
        return
      }
      const data = await res.json()
      setPackages((data.packages || []).map((pkg: any) => normalizePackage(pkg, eventId)))
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Unable to load bulk vote packages',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const updatePackage = (index: number, updates: Partial<BulkPackage>) => {
    setPackages((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], ...updates }
      return next
    })
  }

  const validatePackage = (pkg: BulkPackage): string | null => {
    const votes = Number(pkg.votes_included)
    const price = Number(pkg.price_per_package)
    if (!Number.isInteger(votes) || votes < 1) {
      return 'Votes must be a whole number greater than 0'
    }
    if (!Number.isFinite(price) || price < 0) {
      return 'Price must be a non-negative number'
    }
    return null
  }

  const handleSave = async (index: number) => {
    const pkg = packages[index]
    const validationError = validatePackage(pkg)
    if (validationError) {
      toast({
        title: 'Invalid package',
        description: validationError,
        variant: 'destructive',
      })
      return
    }

    setSaving(true)
    try {
      if (pkg.id) {
        const res = await fetch('/api/bulk-vote-packages', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: pkg.id,
            event_id: eventId,
            votes_included: Number(pkg.votes_included),
            price_per_package: Number(pkg.price_per_package),
            description: pkg.description?.trim() || null,
            is_active: pkg.is_active,
          }),
        })

        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          toast({
            title: 'Update failed',
            description: data.error || 'Unknown error',
            variant: 'destructive',
          })
          return
        }

        const data = await res.json()
        setPackages((prev) => {
          const next = [...prev]
          next[index] = normalizePackage(data.package, eventId)
          return next
        })
        toast({ title: 'Package updated' })
      } else {
        const res = await fetch('/api/bulk-vote-packages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event_id: eventId,
            votes_included: Number(pkg.votes_included),
            price_per_package: Number(pkg.price_per_package),
            description: pkg.description?.trim() || null,
          }),
        })

        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          toast({
            title: 'Create failed',
            description: data.error || 'Unknown error',
            variant: 'destructive',
          })
          return
        }

        const data = await res.json()
        setPackages((prev) => {
          const next = [...prev]
          next[index] = normalizePackage(data.package, eventId)
          next.push(makeEmptyPackage(eventId))
          return next
        })
        toast({ title: 'Package created' })
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Something went wrong',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (index: number) => {
    const pkg = packages[index]
    if (!pkg.id) {
      setPackages((prev) => prev.filter((_, i) => i !== index))
      return
    }

    const confirmed = window.confirm('Delete this bulk vote package? This cannot be undone.')
    if (!confirmed) return

    setSaving(true)
    try {
      const res = await fetch(`/api/bulk-vote-packages?id=${encodeURIComponent(pkg.id)}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast({
          title: 'Delete failed',
          description: data.error || 'Unknown error',
          variant: 'destructive',
        })
        return
      }

      toast({ title: 'Package deleted' })
      setPackages((prev) => prev.filter((_, i) => i !== index))
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Unable to delete package',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const addPackage = () => {
    setPackages((prev) => [...prev, makeEmptyPackage(eventId)])
  }

  if (loading) {
    return (
      <div className="p-12">
        <div className="h-48 rounded-3xl bg-surface-card animate-pulse" />
      </div>
    )
  }

  return (
    <div className="flex-1 p-4 md:p-8 lg:p-12 space-y-6 md:space-y-10">
      <div className="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link
            href={`/organizer/events/${eventId}`}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={16} />
            Back
          </Link>
          <h1 className="text-xl font-semibold">Bulk Vote Packages</h1>
        </div>
        <DSPrimaryButton
          onClick={addPackage}
          disabled={saving}
          className="inline-flex items-center gap-2"
        >
          <Plus size={16} />
          Add Package
        </DSPrimaryButton>
      </div>

      <div className="bg-surface-card border border-border/70 rounded-3xl p-4 md:p-10 space-y-6">
        <div>
          <h2 className="text-lg font-semibold">Manage Bundles</h2>
          <p className="text-sm text-muted-foreground">
            Create, edit, or remove discounted vote bundles for this event. Changes are saved
            immediately and will appear on the public voting page and USSD.
          </p>
        </div>

        {packages.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Package className="w-10 h-10 mx-auto mb-4 opacity-50" />
            <p>No bulk vote packages yet.</p>
            <p className="text-sm mt-1">Add a package to offer voters discounted vote bundles.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {packages.map((pkg, index) => (
              <div
                key={pkg.id || `new-${index}`}
                className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end p-4 rounded-2xl border border-border/60 bg-surface"
              >
                <div className="md:col-span-2">
                  <label className="block text-xs text-muted-foreground mb-1">Votes</label>
                  <DSInput
                    type="number"
                    min="1"
                    value={pkg.votes_included || ''}
                    onChange={(e) =>
                      updatePackage(index, {
                        votes_included: e.target.value === '' ? 0 : Number(e.target.value),
                      })
                    }
                    className="w-full bg-card rounded-xl px-4 h-12"
                    placeholder="10"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs text-muted-foreground mb-1">Price (GHS)</label>
                  <DSInput
                    type="number"
                    min="0"
                    step="0.01"
                    value={pkg.price_per_package || ''}
                    onChange={(e) =>
                      updatePackage(index, {
                        price_per_package: e.target.value === '' ? 0 : Number(e.target.value),
                      })
                    }
                    className="w-full bg-card rounded-xl px-4 h-12"
                    placeholder="0.00"
                  />
                </div>
                <div className="md:col-span-4">
                  <label className="block text-xs text-muted-foreground mb-1">Description</label>
                  <DSInput
                    value={pkg.description || ''}
                    onChange={(e) => updatePackage(index, { description: e.target.value })}
                    className="w-full bg-card rounded-xl px-4 h-12"
                    placeholder="Starter package"
                  />
                </div>
                <div className="md:col-span-2 flex items-center gap-2 pb-3">
                  <input
                    id={`active-${pkg.id || index}`}
                    type="checkbox"
                    checked={pkg.is_active}
                    onChange={(e) => updatePackage(index, { is_active: e.target.checked })}
                    className="h-4 w-4 rounded border-border"
                  />
                  <label htmlFor={`active-${pkg.id || index}`} className="text-sm">
                    Active
                  </label>
                </div>
                <div className="md:col-span-2 flex items-center gap-2">
                  <DSPrimaryButton
                    onClick={() => handleSave(index)}
                    disabled={saving}
                    className="flex-1 inline-flex items-center justify-center gap-2"
                  >
                    <Save size={14} />
                    {pkg.id ? 'Save' : 'Create'}
                  </DSPrimaryButton>
                  <button
                    type="button"
                    onClick={() => handleDelete(index)}
                    disabled={saving}
                    className="p-3 rounded-xl border border-red-500/30 text-red-300 hover:bg-red-500/10"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
