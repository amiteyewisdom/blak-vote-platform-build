'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { resolveEventVotePrice } from '@/lib/event-pricing'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { DSInput, DSPrimaryButton, DSTextarea } from '@/components/ui/design-system'

type BulkPackageDraft = {
  votes: string
  price: string
  description: string
}

export default function EventSettingsPage() {
  const params = useParams()
  const eventId =
    (params?.eventId as string) ||
    (params?.id as string)

  const router = useRouter()
  const { toast } = useToast()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    title: '',
    description: '',
    cost_per_vote: '',
    status: 'active',
    start_date: '',
    end_date: '',
  })

  const [image, setImage] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [bulkPackagesSaved, setBulkPackagesSaved] = useState(false)
  const [bulkPackages, setBulkPackages] = useState<BulkPackageDraft[]>([
    { votes: '10', price: '', description: 'Starter package' },
  ])

  useEffect(() => {
    if (!eventId) return
    fetchEvent()
  }, [eventId])

  const fetchEvent = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session?.user) {
      router.replace('/auth/sign-in')
      return
    }

    const { data } = await supabase
      .from('events')
      .select('*')
      .eq('id', eventId)
      .eq('organizer_id', session.user.id)
      .single()

    if (!data) return

    setForm({
      title: data.title || '',
      description: data.description || '',
      cost_per_vote: resolveEventVotePrice(data).toString(),
      status: data.status || 'active',
      start_date: data.start_date ? new Date(data.start_date).toISOString().slice(0, 16) : '',
      end_date: data.end_date ? new Date(data.end_date).toISOString().slice(0, 16) : '',
    })

    setPreview(data.image_url || null)

    const packagesRes = await fetch(`/api/bulk-vote-packages?event_id=${encodeURIComponent(eventId)}`)
    if (packagesRes.ok) {
      const payload = await packagesRes.json()
      const packages = (payload.packages || []).map((pkg: any) => ({
        votes: String(pkg.votes_included ?? ''),
        price: String(pkg.price_per_package ?? ''),
        description: String(pkg.description ?? ''),
      }))

      if (packages.length > 0) {
        setBulkPackages(packages)
      }

      setBulkPackagesSaved(true)
    }

    setLoading(false)
  }

  const handleUpdate = async () => {
    setSaving(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return

    let imageUrl = preview

    // Upload new image if selected
    if (image) {
      const fileExt = image.name.split('.').pop()
      const fileName = `${user.id}-${Date.now()}.${fileExt}`

      const { error } = await supabase.storage
        .from('event-images')
        .upload(fileName, image)

      if (!error) {
        const { data } = supabase.storage
          .from('event-images')
          .getPublicUrl(fileName)

        imageUrl = data.publicUrl
      }
    }

    const votePrice = Number(form.cost_per_vote || 0)

    if (form.start_date && form.end_date && new Date(form.end_date) <= new Date(form.start_date)) {
      toast({
        title: 'Invalid voting window',
        description: 'Voting end date must be later than voting start date.',
        variant: 'destructive',
      })
      setSaving(false)
      return
    }

    const response = await fetch('/api/organizer/update-event', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        eventId,
        title: form.title,
        description: form.description,
        cost_per_vote: votePrice,
        vote_price: votePrice,
        status: form.status,
        image_url: imageUrl,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
      }),
    })

    const result = await response.json().catch(() => ({}))

    if (!response.ok) {
      toast({
        title: 'Update failed',
        description: result.error || 'Unknown error',
        variant: 'destructive',
      })
    } else {
      const validPackages = bulkPackages
        .map((pkg) => ({
          votes_included: Number(pkg.votes),
          price_per_package: Number(pkg.price),
          description: pkg.description?.trim() || null,
        }))
        .filter(
          (pkg) =>
            Number.isFinite(pkg.votes_included) &&
            pkg.votes_included > 0 &&
            Number.isFinite(pkg.price_per_package) &&
            pkg.price_per_package >= 0
        )

      const clearRes = await fetch(`/api/bulk-vote-packages?event_id=${encodeURIComponent(eventId)}`, {
        method: 'DELETE',
      })

      if (!clearRes.ok) {
        const clearPayload = await clearRes.json().catch(() => ({}))
        toast({
          title: 'Bulk package update failed',
          description: clearPayload.error || 'Could not reset existing bulk packages.',
          variant: 'destructive',
        })
        setSaving(false)
        return
      }

      for (const pkg of validPackages) {
        const savePkgRes = await fetch('/api/bulk-vote-packages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event_id: eventId,
            votes_included: pkg.votes_included,
            price_per_package: pkg.price_per_package,
            description: pkg.description,
          }),
        })

        if (!savePkgRes.ok) {
          const pkgPayload = await savePkgRes.json().catch(() => ({}))
          toast({
            title: 'Bulk package update failed',
            description: pkgPayload.error || 'Could not save one or more bulk packages.',
            variant: 'destructive',
          })
          setSaving(false)
          return
        }
      }

      toast({
        title: 'Event Updated',
        description: 'Changes and bulk vote packages saved successfully.',
      })
      setBulkPackagesSaved(true)
    }

    setSaving(false)
  }

  const handleDelete = async () => {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${form.title}"? This cannot be undone.`
    )
    if (!confirmed) return

    const response = await fetch('/api/organizer/delete-event', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ eventId }),
    })

    if (!response.ok) {
      const result = await response.json().catch(() => ({}))
      toast({
        title: 'Delete failed',
        description: result.error || 'Unable to delete this event.',
        variant: 'destructive',
      })
      return
    }

    toast({
      title: 'Event Deleted',
      description: 'Event removed successfully.',
    })

    router.push('/organizer')
  }

  if (loading)
    return (
      <div className="p-12">
        <div className="h-48 rounded-3xl bg-surface-card animate-pulse" />
      </div>
    )

  return (
    <div className="flex-1 p-4 md:p-8 lg:p-12 space-y-6 md:space-y-10">

      <div className="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={16} />
          Back
        </button>

        <button
          onClick={handleUpdate}
          disabled={saving}
          className="px-6 py-3 rounded-2xl bg-gradient-to-br from-gold to-gold-deep text-black font-semibold w-full sm:w-auto"
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>

      <div className="bg-surface-card border border-border/70 rounded-3xl p-4 md:p-10 space-y-7 md:space-y-8">

        {/* Image */}
        <div>
          <label className="block text-sm text-muted-foreground mb-3">
            Event Image
          </label>

          {preview && (
            <img
              src={preview}
              className="w-full h-48 md:h-60 object-cover rounded-2xl mb-4"
            />
          )}

          <DSInput
            type="file"
            accept="image/*"
            onChange={(e) => {
              if (e.target.files) {
                setImage(e.target.files[0])
                setPreview(
                  URL.createObjectURL(
                    e.target.files[0]
                  )
                )
              }
            }}
            className="block w-full text-sm"
          />
        </div>

        {/* Title */}
        <DSInput
          value={form.title}
          onChange={(e) =>
            setForm({
              ...form,
              title: e.target.value,
            })
          }
          className="w-full bg-surface rounded-2xl px-6 h-14"
          placeholder="Event Title"
        />

        {/* Description */}
        <DSTextarea
          rows={5}
          value={form.description}
          onChange={(e) =>
            setForm({
              ...form,
              description: e.target.value,
            })
          }
          className="w-full bg-surface rounded-2xl px-6 py-4"
          placeholder="Description"
        />

        {/* Cost */}
        <DSInput
          type="number"
          value={form.cost_per_vote}
          onChange={(e) =>
            setForm({
              ...form,
              cost_per_vote: e.target.value,
            })
          }
          className="w-full bg-surface rounded-2xl px-6 h-14"
          placeholder="Cost per vote"
        />

        <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
          <div>
            <h3 className="text-sm font-semibold">Bulk Vote Packages</h3>
            <p className="text-xs text-muted-foreground">Configure discounted vote bundles for this event.</p>
            {bulkPackagesSaved ? (
              <p className="mt-2 inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-300">
                Bulk Packages Saved
              </p>
            ) : null}
          </div>
          {bulkPackages.map((pkg, index) => (
            <div key={index} className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <DSInput
                type="number"
                min="1"
                placeholder="Votes included"
                value={pkg.votes}
                onChange={(e) => {
                  const next = [...bulkPackages]
                  next[index] = { ...next[index], votes: e.target.value }
                  setBulkPackages(next)
                  setBulkPackagesSaved(false)
                }}
              />
              <DSInput
                type="number"
                min="0"
                step="0.01"
                placeholder="Package price (GHS)"
                value={pkg.price}
                onChange={(e) => {
                  const next = [...bulkPackages]
                  next[index] = { ...next[index], price: e.target.value }
                  setBulkPackages(next)
                  setBulkPackagesSaved(false)
                }}
              />
              <DSInput
                placeholder="Description (optional)"
                value={pkg.description}
                onChange={(e) => {
                  const next = [...bulkPackages]
                  next[index] = { ...next[index], description: e.target.value }
                  setBulkPackages(next)
                  setBulkPackagesSaved(false)
                }}
              />
            </div>
          ))}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setBulkPackages((prev) => [...prev, { votes: '', price: '', description: '' }])
                setBulkPackagesSaved(false)
              }}
              className="px-4 py-2 rounded-xl border border-border bg-card text-sm"
            >
              Add Package
            </button>
            <button
              type="button"
              onClick={() => {
                setBulkPackages((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev))
                setBulkPackagesSaved(false)
              }}
              className="px-4 py-2 rounded-xl border border-border bg-card text-sm"
            >
              Remove Last
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-muted-foreground mb-2">Voting Starts</label>
            <DSInput
              type="datetime-local"
              value={form.start_date}
              onChange={(e) =>
                setForm({
                  ...form,
                  start_date: e.target.value,
                })
              }
              className="w-full bg-surface rounded-2xl px-6 h-14"
            />
          </div>

          <div>
            <label className="block text-sm text-muted-foreground mb-2">Voting Ends</label>
            <DSInput
              type="datetime-local"
              value={form.end_date}
              onChange={(e) =>
                setForm({
                  ...form,
                  end_date: e.target.value,
                })
              }
              className="w-full bg-surface rounded-2xl px-6 h-14"
            />
          </div>
        </div>

        {/* Delete */}
        <DSPrimaryButton
          onClick={handleDelete}
          className="flex items-center gap-2 bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30"
        >
          <Trash2 size={16} />
          Delete Event
        </DSPrimaryButton>

      </div>
    </div>
  )
}