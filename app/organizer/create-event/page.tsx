'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { useToast } from '@/hooks/use-toast'
import { DSInput, DSPrimaryButton, DSTextarea } from '@/components/ui/design-system'
import { Button } from '@/components/ui/button'

export default function CreateEventPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [image, setImage] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)

  const [form, setForm] = useState({
    title: '',
    description: '',
    startDate: '',
    endDate: '',
    costPerVote: '',
    votingType: 'paid',
  })
  const [bulkPackages, setBulkPackages] = useState<Array<{ votes: string; price: string; description: string }>>([
    { votes: '10', price: '', description: 'Starter package' },
  ])

  const update = (key: string, value: any) =>
    setForm({ ...form, [key]: value })

  const handleImage = (file: File) => {
    setImage(file)
    setPreview(URL.createObjectURL(file))
  }

  const handleSubmit = async () => {
    setLoading(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      toast({ title: 'Not authenticated', description: 'Sign in again to create an event.', variant: 'destructive' })
      setLoading(false)
      return
    }

    // =========================
    // VALIDATION
    // =========================
    if (!form.title || !form.description) {
      toast({ title: 'Missing details', description: 'Title and description are required.', variant: 'destructive' })
      setLoading(false)
      return
    }

    if (!form.startDate || !form.endDate) {
      toast({ title: 'Missing dates', description: 'Please select start and end dates.', variant: 'destructive' })
      setLoading(false)
      return
    }

    if (new Date(form.endDate) <= new Date(form.startDate)) {
      toast({ title: 'Invalid dates', description: 'End date must be after start date.', variant: 'destructive' })
      setLoading(false)
      return
    }

    if (form.votingType === 'paid' && !form.costPerVote) {
      toast({ title: 'Missing vote price', description: 'Cost per vote is required for paid voting.', variant: 'destructive' })
      setLoading(false)
      return
    }

    // =========================
    // IMAGE UPLOAD
    // =========================
    let imageUrl = null

    if (image) {
      const fileExt = image.name.split('.').pop()
      const fileName = `${user.id}-${Date.now()}.${fileExt}`

      const { error: uploadError } = await supabase.storage
        .from('event-images')
        .upload(fileName, image)

      if (uploadError) {
        toast({ title: 'Upload failed', description: uploadError.message, variant: 'destructive' })
        setLoading(false)
        return
      }

      const { data } = supabase.storage
        .from('event-images')
        .getPublicUrl(fileName)

      imageUrl = data.publicUrl
    }

    // =========================
    // INSERT INTO DATABASE
    // =========================
    const response = await fetch('/api/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: form.title,
        description: form.description,
        startDate: form.startDate,
        endDate: form.endDate,
        imageUrl,
        votingType: form.votingType,
        costPerVote:
          form.votingType === 'paid'
            ? Number(form.costPerVote)
            : 0,
        candidates: [],
      }),
    })

    const result = await response.json()

    setLoading(false)

    if (!response.ok) {
      toast({ title: 'Creation failed', description: result.error || 'Failed to create event', variant: 'destructive' })
    } else {
      const createdEventId = result?.event?.id

      if (createdEventId && form.votingType === 'paid') {
        const validPackages = bulkPackages
          .map((pkg) => ({
            votes: Number(pkg.votes),
            price: Number(pkg.price),
            description: pkg.description?.trim() || null,
          }))
          .filter((pkg) => Number.isFinite(pkg.votes) && pkg.votes > 0 && Number.isFinite(pkg.price) && pkg.price >= 0)

        if (validPackages.length > 0) {
          for (const pkg of validPackages) {
            const savePkgRes = await fetch('/api/bulk-vote-packages', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                event_id: createdEventId,
                votes_included: pkg.votes,
                price_per_package: pkg.price,
                description: pkg.description,
              }),
            })

            if (!savePkgRes.ok) {
              const savePayload = await savePkgRes.json().catch(() => ({}))
              toast({
                title: 'Event created, but bulk package save failed',
                description: savePayload.error || 'Could not save one or more bulk vote packages.',
                variant: 'destructive',
              })
              router.push(`/organizer/events/${createdEventId}/edit`)
              return
            }
          }
        }
      }

      toast({ title: 'Event created', description: 'Your event has been created successfully.' })
      router.push('/organizer')
    }
  }

  return (
    <div className="min-h-screen bg-background px-4 py-10 text-foreground sm:px-6 sm:py-16">

      <div className="mx-auto w-full max-w-2xl space-y-8">
        <div className="text-center">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-gold">Organizer workspace</p>
          <h1 className="mt-3 text-3xl font-bold sm:text-4xl">Create Event</h1>
          <p className="mt-3 text-sm text-muted-foreground sm:text-base">
            Set up the event details, publishing model, and vote pricing before adding nominees.
          </p>
        </div>

        <div className="space-y-6 rounded-3xl border border-border bg-card/95 p-6 shadow-[0_20px_60px_hsl(var(--foreground)/0.08)] sm:p-8">

          {/* Image Upload */}
          <label className="block cursor-pointer rounded-2xl border border-dashed border-border bg-surface p-6 text-center transition hover:border-gold/50">
            {preview ? (
              <img
                src={preview}
                alt="Event preview"
                className="mx-auto w-32 h-32 object-cover rounded-xl"
              />
            ) : (
              <div>
                <div className="text-lg font-medium">
                  Upload Emblem
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  PNG or JPG · Square recommended
                </div>
              </div>
            )}
            <DSInput
              type="file"
              hidden
              accept="image/*"
              onChange={(e) =>
                e.target.files &&
                handleImage(e.target.files[0])
              }
            />
          </label>

          <DSInput
            placeholder="Event Name"
            className="h-12"
            onChange={(e) =>
              update('title', e.target.value)
            }
          />

          <DSTextarea
            placeholder="Description"
            className="min-h-28"
            onChange={(e) =>
              update('description', e.target.value)
            }
          />

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <DSInput
              type="date"
              onChange={(e) =>
                update('startDate', e.target.value)
              }
            />
            <DSInput
              type="date"
              onChange={(e) =>
                update('endDate', e.target.value)
              }
            />
          </div>

          {/* Voting Type */}
          <div className="flex gap-4">
            {['paid', 'social'].map((type) => (
              <Button
                key={type}
                type="button"
                onClick={() =>
                  update('votingType', type)
                }
                variant={form.votingType === type ? 'default' : 'secondary'}
                className={`flex-1 ${
                  form.votingType === type
                    ? ''
                    : 'text-muted-foreground'
                }`}
              >
                {type === 'paid'
                  ? 'Paid Voting'
                  : 'Social Voting'}
              </Button>
            ))}
          </div>

          {form.votingType === 'paid' && (
            <>
              <DSInput
                type="number"
                placeholder="Cost per vote (GHS)"
                className="h-12"
                onChange={(e) =>
                  update('costPerVote', e.target.value)
                }
              />

              <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
                <div>
                  <h3 className="text-sm font-semibold">Bulk Vote Packages</h3>
                  <p className="text-xs text-muted-foreground">Configure discounted vote bundles during setup.</p>
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
                      }}
                    />
                    <DSInput
                      type="number"
                      min="0"
                      placeholder="Package price (GHS)"
                      value={pkg.price}
                      onChange={(e) => {
                        const next = [...bulkPackages]
                        next[index] = { ...next[index], price: e.target.value }
                        setBulkPackages(next)
                      }}
                    />
                    <DSInput
                      placeholder="Description (optional)"
                      value={pkg.description}
                      onChange={(e) => {
                        const next = [...bulkPackages]
                        next[index] = { ...next[index], description: e.target.value }
                        setBulkPackages(next)
                      }}
                    />
                  </div>
                ))}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setBulkPackages((prev) => [...prev, { votes: '', price: '', description: '' }])}
                  >
                    Add Package
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setBulkPackages((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev))}
                  >
                    Remove Last
                  </Button>
                </div>
              </div>
            </>
          )}

          <DSPrimaryButton
            onClick={handleSubmit}
            disabled={loading}
            className="w-full h-12"
          >
            {loading ? 'Processing...' : 'Create Event'}
          </DSPrimaryButton>

        </div>
      </div>
    </div>
  )
}