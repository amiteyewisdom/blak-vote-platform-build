'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { resolveEventVotePrice } from '@/lib/event-pricing'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { DSInput, DSPrimaryButton, DSTextarea } from '@/components/ui/design-system'

const SUPPORTED_EVENT_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_EVENT_IMAGE_SIZE_BYTES = 5 * 1024 * 1024

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
    nomination_open_date: '',
    nomination_close_date: '',
  })

  const [image, setImage] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  useEffect(() => {
    if (!eventId) return
    fetchEvent()
  }, [eventId])

  const fetchEvent = async () => {
    const response = await fetch(`/api/organizer/event/${encodeURIComponent(eventId)}`)

    if (response.status === 401) {
      router.replace('/auth/sign-in')
      return
    }

    if (!response.ok) {
      setLoading(false)
      return
    }

    const payload = await response.json().catch(() => ({}))
    const data = payload?.event

    if (!data) return

    setForm({
      title: data.title || '',
      description: data.description || '',
      cost_per_vote: resolveEventVotePrice(data).toString(),
      status: data.status || 'active',
      start_date: data.start_date ? new Date(data.start_date).toISOString().slice(0, 16) : '',
      end_date: data.end_date ? new Date(data.end_date).toISOString().slice(0, 16) : '',
      nomination_open_date: data.nomination_open_date ? new Date(data.nomination_open_date).toISOString().slice(0, 16) : '',
      nomination_close_date: data.nomination_close_date ? new Date(data.nomination_close_date).toISOString().slice(0, 16) : '',
    })

    setPreview(data.image_url || null)

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
      const uploadForm = new FormData()
      uploadForm.append('image', image)

      const uploadRes = await fetch('/api/organizer/upload-event-image', {
        method: 'POST',
        body: uploadForm,
      })

      const uploadPayload = await uploadRes.json().catch(() => ({}))

      if (!uploadRes.ok || !uploadPayload?.imageUrl) {
        toast({
          title: 'Upload failed',
          description: uploadPayload?.error || 'Could not upload event image',
          variant: 'destructive',
        })
        setSaving(false)
        return
      }

      imageUrl = uploadPayload.imageUrl
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
        nomination_open_date: form.nomination_open_date || null,
        nomination_close_date: form.nomination_close_date || null,
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
      toast({
        title: 'Event Updated',
        description: 'Event settings saved successfully.',
      })
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
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => {
              if (e.target.files) {
                const nextFile = e.target.files[0]
                if (!SUPPORTED_EVENT_IMAGE_TYPES.includes(nextFile.type)) {
                  toast({
                    title: 'Unsupported image format',
                    description: 'Please upload a JPG, PNG, or WebP image.',
                    variant: 'destructive',
                  })
                  return
                }
                if (nextFile.size > MAX_EVENT_IMAGE_SIZE_BYTES) {
                  toast({
                    title: 'Image too large',
                    description: 'Image size must be 5MB or less.',
                    variant: 'destructive',
                  })
                  return
                }

                setImage(nextFile)
                setPreview(
                  URL.createObjectURL(
                    nextFile
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
            <p className="text-xs text-muted-foreground">
              Manage discounted vote bundles on a dedicated page.
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push(`/organizer/events/${eventId}/bulk-votes`)}
            className="px-4 py-3 rounded-xl border border-border bg-card text-sm hover:border-[hsl(var(--gold))]/40 transition"
          >
            Open Bulk Vote Management
          </button>
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

        <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
          <div>
            <h3 className="text-sm font-semibold">Public Nomination Window</h3>
            <p className="text-xs text-muted-foreground">Set when the public can submit nominations.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-muted-foreground mb-2">Nominations Open</label>
              <DSInput
                type="datetime-local"
                value={form.nomination_open_date}
                onChange={(e) => setForm({ ...form, nomination_open_date: e.target.value })}
                className="w-full bg-surface rounded-2xl px-6 h-14"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-2">Nominations Close</label>
              <DSInput
                type="datetime-local"
                value={form.nomination_close_date}
                onChange={(e) => setForm({ ...form, nomination_close_date: e.target.value })}
                className="w-full bg-surface rounded-2xl px-6 h-14"
              />
            </div>
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