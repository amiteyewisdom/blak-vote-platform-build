'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Trash2, Upload } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { DSCard, DSInput, DSPrimaryButton, DSSelect, DSTextarea } from '@/components/ui/design-system'
import { supabase } from '@/lib/supabaseClient'

export default function NomineesPage() {
  const params = useParams()
  const eventId = String(params?.eventId || params?.id)
  const router = useRouter()
  const { toast } = useToast()

  const [categories, setCategories] = useState<any[]>([])
  const [nominees, setNominees] = useState<any[]>([])
  const [name, setName] = useState('')
  const [bio, setBio] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [reviewingId, setReviewingId] = useState<string | null>(null)

  useEffect(() => {
    if (!eventId || eventId === 'undefined' || eventId === 'null') return
    fetchData()
  }, [eventId])

  const fetchData = async () => {
    const res = await fetch(`/api/organizer/nominees?eventId=${eventId}`)
    const payload = await res.json()

    if (!res.ok) {
      toast({
        title: 'Load Failed',
        description: payload?.error || 'Unable to load nominees',
        variant: 'destructive',
      })
      setLoading(false)
      return
    }

    setCategories(payload.categories || [])
    setNominees(payload.nominees || [])

    setLoading(false)
  }

  const uploadImage = async (file: File) => {
    const fileExt = file.name.split('.').pop()
    const fileName = `${eventId}/${Date.now()}.${fileExt}`

    const { error } = await supabase.storage
      .from('nominee-images')
      .upload(fileName, file)

    if (error) {
      throw error
    }

    const { data } = supabase.storage
      .from('nominee-images')
      .getPublicUrl(fileName)

    return data.publicUrl
  }

  const handleCreate = async () => {
    if (!eventId || eventId === 'undefined' || eventId === 'null') {
      toast({
        title: 'Error',
        description: 'Invalid event selected. Please reload this page.',
        variant: 'destructive',
      })
      return
    }

    if (!name.trim() || !categoryId) {
      toast({
        title: 'Validation Error',
        description: 'Nominee name and category are required',
        variant: 'destructive',
      })
      return
    }

    setCreating(true)

    try {
      let imageUrl = null

      if (imageFile) {
        try {
          imageUrl = await uploadImage(imageFile)
        } catch (uploadError: any) {
          toast({
            title: 'Image upload failed',
            description: uploadError?.message || 'Continuing without image',
            variant: 'destructive',
          })
          imageUrl = null
        }
      }

      const res = await fetch('/api/organizer/nominees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId,
          nomineeName: name.trim(),
          categoryId,
          bio,
          photoUrl: imageUrl,
        }),
      })

      const payload = await res.json()

      if (!res.ok) {
        const detailMessage = [payload?.error, payload?.details, payload?.hint, payload?.code]
          .filter(Boolean)
          .join(' | ')
        throw new Error(detailMessage || 'Unable to create nominee')
      }

      toast({ title: 'Nominee Created' })

      setName('')
      setBio('')
      setCategoryId('')
      setImageFile(null)
      setPreview(null)

      fetchData()
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message,
        variant: 'destructive',
      })
    }

    setCreating(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this nominee?')) return

    const res = await fetch(`/api/organizer/nominees?id=${id}`, {
      method: 'DELETE',
    })

    if (res.ok) {
      setNominees(nominees.filter((n) => n.id !== id))
      return
    }

    const payload = await res.json().catch(() => ({}))
    toast({
      title: 'Delete failed',
      description: payload?.error || 'Unable to delete nominee',
      variant: 'destructive',
    })
  }

  const reviewNomination = async (id: string, approve: boolean) => {
    setReviewingId(id)
    const res = await fetch('/api/organizer/nomination', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nomination_id: id, approve }),
    })

    if (res.ok) {
      fetchData()
      toast({ title: approve ? 'Nomination approved' : 'Nomination declined' })
    } else {
      toast({ title: 'Action failed', variant: 'destructive' })
    }

    setReviewingId(null)
  }

  if (loading)
    return (
      <div className="p-12">
        <div className="h-64 rounded-3xl bg-surface-card animate-pulse" />
      </div>
    )

  const pendingPublicNominations = nominees.filter(
    (nominee) => nominee.status === 'pending'
  )
  const activeNominees = nominees.filter(
    (nominee) => nominee.status !== 'pending'
  )

  return (
    <div className="flex-1 p-6 md:p-12 space-y-12">

      {/* Header */}
      <div>
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft size={16} />
          Back
        </button>

        <h1 className="text-3xl md:text-4xl font-semibold">
          Nominees
        </h1>
      </div>

      {/* Create Card */}
      <DSCard className="p-6 md:p-10 space-y-8">

        <div className="grid gap-6 md:grid-cols-2">

          <DSInput
            placeholder="Nominee Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="bg-surface rounded-2xl px-6 h-14"
          />

          <DSSelect
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="bg-surface rounded-2xl px-6 h-14"
          >
            <option value="">Select Category</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </DSSelect>

          <DSTextarea
            placeholder="Short Bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className="bg-surface rounded-2xl px-6 py-4 md:col-span-2"
          />

          {/* Image Upload */}
          <label className="md:col-span-2 bg-surface border border-border rounded-2xl p-6 cursor-pointer hover:border-gold/40 transition text-center">
            {preview ? (
              <img
                src={preview}
                className="mx-auto w-32 h-32 rounded-full object-cover"
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Upload size={20} />
                Upload Photo
              </div>
            )}

            <DSInput
              type="file"
              hidden
              accept="image/*"
              onChange={(e) => {
                if (e.target.files?.[0]) {
                  setImageFile(e.target.files[0])
                  setPreview(URL.createObjectURL(e.target.files[0]))
                }
              }}
            />
          </label>

        </div>

        <DSPrimaryButton
          onClick={handleCreate}
          disabled={creating}
          className="px-8 py-4 rounded-2xl"
        >
          <Plus size={16} className="inline mr-2" />
          {creating ? 'Creating…' : 'Create Nominee'}
        </DSPrimaryButton>

      </DSCard>

      {pendingPublicNominations.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground">Pending Public Nominations</h2>
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {pendingPublicNominations.map((nominee) => (
              <DSCard
                key={nominee.id}
                className="p-6 border-yellow-500/30 bg-yellow-500/5"
              >
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-16 h-16 rounded-full overflow-hidden bg-surface">
                    {nominee.photo_url ? (
                      <img
                        src={nominee.photo_url}
                        className="w-full h-full object-cover"
                      />
                    ) : null}
                  </div>

                  <div>
                    <div className="text-lg font-semibold">
                      {nominee.nominee_name}
                    </div>
                    <div className="text-xs text-muted-foreground uppercase">Status: {nominee.status || 'pending'}</div>
                    <div className="text-xs text-yellow-400">Source: Public nomination</div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => reviewNomination(nominee.id, true)}
                    disabled={reviewingId === nominee.id}
                    className="text-emerald-400 text-sm px-3 py-1 rounded-lg border border-emerald-500/30"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => reviewNomination(nominee.id, false)}
                    disabled={reviewingId === nominee.id}
                    className="text-yellow-400 text-sm px-3 py-1 rounded-lg border border-yellow-500/30"
                  >
                    Decline
                  </button>

                  <button
                    onClick={() => handleDelete(nominee.id)}
                    className="text-red-500 hover:text-red-400 ml-auto"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </DSCard>
            ))}
          </div>
        </div>
      )}

      {/* Nominee Grid */}
      <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
        {activeNominees.map((nominee) => (
          <DSCard
            key={nominee.id}
            className="p-6 hover:border-gold/30 transition"
          >
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 rounded-full overflow-hidden bg-surface">
                {nominee.photo_url ? (
                  <img
                    src={nominee.photo_url}
                    className="w-full h-full object-cover"
                  />
                ) : null}
              </div>

              <div>
                <div className="text-lg font-semibold">
                  {nominee.nominee_name}
                </div>
                <div className="text-xs text-muted-foreground">Code: {nominee.voting_code || 'N/A'}</div>
                <div className="text-xs text-muted-foreground uppercase">Status: {nominee.status || 'pending'}</div>
                <div className="text-xs text-muted-foreground">Source: Organizer</div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleDelete(nominee.id)}
                className="text-red-500 hover:text-red-400 ml-auto"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </DSCard>
        ))}
      </div>

    </div>
  )
}