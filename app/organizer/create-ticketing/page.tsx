'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { useToast } from '@/hooks/use-toast'
import { DSInput, DSPrimaryButton, DSTextarea } from '@/components/ui/design-system'
import { Plus, Trash2 } from 'lucide-react'

const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

interface TicketPlan {
  name: string
  price: string
  quantity: string
  adminFee: string
  description: string
}

export default function CreateTicketingPage() {
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
  })

  const [ticketPlans, setTicketPlans] = useState<TicketPlan[]>([
    { name: 'General Admission', price: '', quantity: '', adminFee: '', description: '' },
  ])

  const update = (key: string, value: string) => setForm({ ...form, [key]: value })

  const updatePlan = (index: number, key: keyof TicketPlan, value: string) => {
    setTicketPlans(ticketPlans.map((plan, i) => (i === index ? { ...plan, [key]: value } : plan)))
  }

  const addPlan = () => {
    setTicketPlans([...ticketPlans, { name: '', price: '', quantity: '', adminFee: '', description: '' }])
  }

  const removePlan = (index: number) => {
    if (ticketPlans.length === 1) {
      toast({ title: 'At least one ticket plan is required', variant: 'destructive' })
      return
    }
    setTicketPlans(ticketPlans.filter((_, i) => i !== index))
  }

  const handleImage = (file: File) => {
    if (!SUPPORTED_IMAGE_TYPES.includes(file.type)) {
      toast({ title: 'Unsupported image format', description: 'JPG, PNG or WebP only.', variant: 'destructive' })
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast({ title: 'Image too large', description: 'Max 5 MB.', variant: 'destructive' })
      return
    }
    setImage(file)
    setPreview(URL.createObjectURL(file))
  }

  const handleSubmit = async () => {
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      toast({ title: 'Not authenticated', description: 'Sign in again.', variant: 'destructive' })
      setLoading(false)
      return
    }

    if (!form.title || !form.description) {
      toast({ title: 'Missing details', description: 'Title and description are required.', variant: 'destructive' })
      setLoading(false)
      return
    }

    if (!form.startDate || !form.endDate) {
      toast({ title: 'Missing dates', description: 'Start and end dates are required.', variant: 'destructive' })
      setLoading(false)
      return
    }

    if (new Date(form.endDate) <= new Date(form.startDate)) {
      toast({ title: 'Invalid dates', description: 'End date must be after start date.', variant: 'destructive' })
      setLoading(false)
      return
    }

    const validPlans = ticketPlans.filter((p) => p.name.trim() && Number(p.price) >= 0 && Number(p.quantity) > 0)
    if (validPlans.length === 0) {
      toast({ title: 'Add ticket plans', description: 'At least one ticket plan with name, price and quantity is required.', variant: 'destructive' })
      setLoading(false)
      return
    }

    let imageUrl: string | null = null

    if (image) {
      const uploadForm = new FormData()
      uploadForm.append('image', image)
      const uploadRes = await fetch('/api/organizer/upload-event-image', {
        method: 'POST',
        body: uploadForm,
      })
      const uploadPayload = await uploadRes.json().catch(() => ({}))
      if (!uploadRes.ok || !uploadPayload.imageUrl) {
        toast({ title: 'Image upload failed', description: uploadPayload.error || 'Could not upload cover image', variant: 'destructive' })
        setLoading(false)
        return
      }
      imageUrl = uploadPayload.imageUrl
    }

    const eventRes = await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: form.title.trim(),
        description: form.description.trim(),
        startDate: form.startDate,
        endDate: form.endDate,
        imageUrl,
        votingType: 'paid',
        costPerVote: '0',
        eventType: 'ticketing',
        candidates: [],
      }),
    })

    const eventPayload = await eventRes.json()

    if (!eventRes.ok || !eventPayload?.event?.id) {
      toast({ title: 'Failed to create event', description: eventPayload?.error || 'Unknown error.', variant: 'destructive' })
      setLoading(false)
      return
    }

    const eventId = eventPayload.event.id

    const planInserts = validPlans.map((plan) => ({
      event_id: eventId,
      ticket_kind: 'plan',
      name: plan.name.trim(),
      price: Number(plan.price),
      quantity: Number(plan.quantity),
      sold_count: 0,
      admin_fee: plan.adminFee ? Number(plan.adminFee) : null,
      status: 'valid',
      usage_status: 'unused',
    }))

    const { error: planError } = await supabase.from('tickets').insert(planInserts)

    if (planError) {
      toast({ title: 'Event created but ticket plans failed', description: planError.message, variant: 'destructive' })
    } else {
      toast({ title: 'Ticketing event created!', description: 'Your event and ticket plans are live.' })
    }

    setLoading(false)
    router.push(`/organizer/events/${eventId}/tickets`)
  }

  return (
    <div className="min-h-screen bg-background p-3 sm:p-4 md:p-8 lg:p-10">
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="border-b border-border/60 pb-6">
          <h1 className="text-2xl font-bold text-foreground sm:text-3xl md:text-4xl">Create Ticketing Event</h1>
          <p className="mt-2 text-sm text-foreground/50 md:text-base">
            A standalone ticketing event lets you sell tickets independently from voting.
          </p>
        </div>

        <section className="space-y-4">
          <h2 className="text-base font-semibold text-foreground">Event Details</h2>

          <div className="space-y-1">
            <DSInput
              label="Event Title *"
              value={form.title}
              onChange={(e) => update('title', e.target.value)}
              placeholder="e.g. Annual Gala Night 2026"
            />
            <p className="text-xs text-muted-foreground px-1">The public name of your event shown on all tickets and listings.</p>
          </div>

          <div className="space-y-1">
            <DSTextarea
              label="Description *"
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
              placeholder="Describe the event — venue, dress code, agenda, what to expect…"
              rows={4}
            />
            <p className="text-xs text-muted-foreground px-1">Shown on the public event page to help attendees understand what the event is about.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <DSInput
                label="Start Date & Time *"
                type="datetime-local"
                value={form.startDate}
                onChange={(e) => update('startDate', e.target.value)}
              />
              <p className="text-xs text-muted-foreground px-1">When doors open / event begins. Tickets become purchasable after publishing.</p>
            </div>
            <div className="space-y-1">
              <DSInput
                label="End Date & Time *"
                type="datetime-local"
                value={form.endDate}
                onChange={(e) => update('endDate', e.target.value)}
              />
              <p className="text-xs text-muted-foreground px-1">When the event closes. Ticket sales stop at this time.</p>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-base font-semibold text-foreground">Cover Image</h2>

          {preview && (
            <div className="relative rounded-xl overflow-hidden h-44 w-full">
              <img src={preview} alt="Preview" className="w-full h-full object-cover" />
              <button
                onClick={() => { setImage(null); setPreview(null) }}
                className="absolute top-2 right-2 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}

          {!preview && (
            <label className="flex h-36 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border text-foreground/40 hover:border-gold/50 hover:text-gold/60 transition-colors">
              <Plus className="w-8 h-8 mb-1" />
              <span className="text-xs">Click to upload image (JPG, PNG, WebP · max 5 MB)</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => { if (e.target.files?.[0]) handleImage(e.target.files[0]) }}
              />
            </label>
          )}
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">Ticket Plans</h2>
            <button
              onClick={addPlan}
              className="flex items-center gap-1.5 text-xs font-medium text-gold hover:underline"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Plan
            </button>
          </div>

          {ticketPlans.map((plan, index) => (
            <div key={index} className="rounded-xl border border-border bg-surface-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-foreground/60">
                  Plan {index + 1}
                </p>
                <button onClick={() => removePlan(index)} className="text-red-400 hover:text-red-300">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <DSInput
                    label="Ticket Name *"
                    value={plan.name}
                    onChange={(e) => updatePlan(index, 'name', e.target.value)}
                    placeholder="e.g. VIP, General Admission, Early Bird"
                  />
                  <p className="text-xs text-muted-foreground px-1">The tier or category of this ticket (shown at checkout).</p>
                </div>
                <div className="space-y-1">
                  <DSInput
                    label="Price (GHS) *"
                    type="number"
                    min="0"
                    step="0.01"
                    value={plan.price}
                    onChange={(e) => updatePlan(index, 'price', e.target.value)}
                    placeholder="0.00"
                  />
                  <p className="text-xs text-muted-foreground px-1">Amount each buyer pays. Enter 0 for a free ticket tier.</p>
                </div>
                <div className="space-y-1">
                  <DSInput
                    label="Quantity Available *"
                    type="number"
                    min="1"
                    value={plan.quantity}
                    onChange={(e) => updatePlan(index, 'quantity', e.target.value)}
                    placeholder="e.g. 100"
                  />
                  <p className="text-xs text-muted-foreground px-1">Total number of tickets available for this tier. Sales stop when sold out.</p>
                </div>
                <div className="space-y-1">
                  <DSInput
                    label="Admin Fee (GHS, optional)"
                    type="number"
                    min="0"
                    step="0.01"
                    value={plan.adminFee}
                    onChange={(e) => updatePlan(index, 'adminFee', e.target.value)}
                    placeholder="0.00"
                  />
                  <p className="text-xs text-muted-foreground px-1">Optional extra processing/service fee charged on top of the ticket price.</p>
                </div>
              </div>
              <div className="space-y-1">
                <DSInput
                  label="Plan Description (optional)"
                  value={plan.description}
                  onChange={(e) => updatePlan(index, 'description', e.target.value)}
                  placeholder="e.g. Includes backstage access and welcome drink"
                />
                <p className="text-xs text-muted-foreground px-1">Short description shown below the ticket name at checkout.</p>
              </div>
            </div>
          ))}
        </section>

        <DSPrimaryButton onClick={handleSubmit} disabled={loading} className="w-full py-3 text-base font-semibold">
          {loading ? 'Creating…' : 'Create Ticketing Event'}
        </DSPrimaryButton>
      </div>
    </div>
  )
}
