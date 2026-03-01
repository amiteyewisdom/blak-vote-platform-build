'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

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
    status: 'draft',
  })

  const [image, setImage] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)

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
      cost_per_vote:
        data.cost_per_vote?.toString() || '',
      status: data.status || 'draft',
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

    const { error } = await supabase
      .from('events')
      .update({
        title: form.title,
        description: form.description,
        cost_per_vote: Number(
          form.cost_per_vote || 0
        ),
        status: form.status,
        image_url: imageUrl,
      })
      .eq('id', eventId)

    if (error) {
      toast({
        title: 'Update failed',
        description: error.message,
        variant: 'destructive',
      })
    } else {
      toast({
        title: 'Event Updated',
        description:
          'Changes saved successfully.',
      })
    }

    setSaving(false)
  }

  const handleDelete = async () => {
    // Only allow delete if event is draft
    if (form.status !== 'draft') {
      toast({
        title: 'Cannot Delete',
        description:
          'Only draft events can be deleted.',
        variant: 'destructive',
      })
      return
    }

    await supabase
      .from('events')
      .delete()
      .eq('id', eventId)

    toast({
      title: 'Event Deleted',
      description: 'Event removed successfully.',
    })

    router.push('/organizer')
  }

  if (loading)
    return (
      <div className="p-12">
        <div className="h-48 rounded-3xl bg-[#121421] animate-pulse" />
      </div>
    )

  return (
    <div className="flex-1 p-12 space-y-12">

      <div className="flex items-center justify-between">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-white/40 hover:text-white"
        >
          <ArrowLeft size={16} />
          Back
        </button>

        <button
          onClick={handleUpdate}
          disabled={saving}
          className="px-8 py-4 rounded-2xl bg-gradient-to-br from-[#F5C044] to-[#D9A92E] text-black font-semibold"
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>

      <div className="bg-[#121421] border border-white/5 rounded-3xl p-10 space-y-8">

        {/* Image */}
        <div>
          <label className="block text-sm text-white/40 mb-3">
            Event Image
          </label>

          {preview && (
            <img
              src={preview}
              className="w-full h-60 object-cover rounded-2xl mb-4"
            />
          )}

          <input
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
          />
        </div>

        {/* Title */}
        <input
          value={form.title}
          onChange={(e) =>
            setForm({
              ...form,
              title: e.target.value,
            })
          }
          className="w-full bg-[#0F111A] border border-white/10 rounded-2xl px-6 py-4 text-white"
          placeholder="Event Title"
        />

        {/* Description */}
        <textarea
          rows={5}
          value={form.description}
          onChange={(e) =>
            setForm({
              ...form,
              description: e.target.value,
            })
          }
          className="w-full bg-[#0F111A] border border-white/10 rounded-2xl px-6 py-4 text-white"
          placeholder="Description"
        />

        {/* Cost */}
        <input
          type="number"
          value={form.cost_per_vote}
          onChange={(e) =>
            setForm({
              ...form,
              cost_per_vote: e.target.value,
            })
          }
          className="w-full bg-[#0F111A] border border-white/10 rounded-2xl px-6 py-4 text-white"
          placeholder="Cost per vote"
        />

        {/* Delete */}
        <button
          onClick={handleDelete}
          className="flex items-center gap-2 text-red-400 hover:text-red-300"
        >
          <Trash2 size={16} />
          Delete Event
        </button>

      </div>
    </div>
  )
}