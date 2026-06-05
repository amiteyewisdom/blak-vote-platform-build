'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Eye, Pencil, Plus, Trash2, Upload, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { DSCard, DSInput, DSPrimaryButton, DSSelect, DSTextarea } from '@/components/ui/design-system'

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

  const [viewNominee, setViewNominee] = useState<any>(null)
  const [editNominee, setEditNominee] = useState<any>(null)
  const [editForm, setEditForm] = useState({
    nominee_name: '',
    nominee_email: '',
    nominee_phone: '',
    bio: '',
    categoryId: '',
    status: '',
    photoUrl: '',
    imageFile: null as File | null,
    preview: '',
  })
  const [updatingNominee, setUpdatingNominee] = useState(false)

  useEffect(() => {
    if (!eventId || eventId === 'undefined' || eventId === 'null') return
    fetchData()
  }, [eventId])

  const fetchData = async () => {
    const res = await fetch(`/api/organizer/nominees?eventId=${eventId}`, { cache: 'no-store' })
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
    const formData = new FormData()
    formData.append('eventId', eventId)
    formData.append('image', file)

    // Add timeout for upload to prevent hanging on slow devices
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 60000) // 60 second timeout

    try {
      const uploadRes = await fetch('/api/organizer/upload-nominee-image', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      const uploadPayload = await uploadRes.json().catch(() => ({}))

      if (!uploadRes.ok || !uploadPayload?.imageUrl) {
        throw new Error(uploadPayload?.error || 'Could not upload nominee image')
      }

      return String(uploadPayload.imageUrl)
    } catch (error: any) {
      clearTimeout(timeoutId)
      if (error.name === 'AbortError') {
        throw new Error('Upload timed out. Please try again with a smaller image or better connection.')
      }
      throw error
    }
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
        // Validate file size before upload (client-side check)
        const maxSize = 5 * 1024 * 1024 // 5MB
        if (imageFile.size > maxSize) {
          throw new Error('Image must be 5MB or smaller. Please choose a smaller image.')
        }

        // Validate file type
        const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg']
        if (!validTypes.includes(imageFile.type)) {
          throw new Error('Only JPG, PNG, and WebP images are supported.')
        }

        imageUrl = await uploadImage(imageFile)
      }

      // Add timeout to the create request as well
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout

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
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

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
      setImageFile(null)
      setPreview(null)

      fetchData()
    } catch (err: any) {
      // Provide more helpful error messages for common issues
      let errorMessage = err.message || 'Unable to create nominee'
      
      if (err.name === 'AbortError') {
        errorMessage = 'Request timed out. Please check your connection and try again.'
      } else if (errorMessage.includes('fetch')) {
        errorMessage = 'Network error. Please check your internet connection and try again.'
      }

      toast({
        title: 'Error',
        description: errorMessage,
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

  const getCategoryName = (catId: string | null) => {
    if (!catId) return 'Uncategorized'
    return categories.find((c) => c.id === catId)?.name || catId
  }

  const openViewModal = (nominee: any) => {
    setViewNominee(nominee)
  }

  const openEditModal = (nominee: any) => {
    setEditNominee(nominee)
    setEditForm({
      nominee_name: nominee.nominee_name || '',
      nominee_email: nominee.nominee_email || '',
      nominee_phone: nominee.nominee_phone || '',
      bio: nominee.bio || '',
      categoryId: nominee.category_id || '',
      status: nominee.status || 'candidate',
      photoUrl: nominee.photo_url || '',
      imageFile: null,
      preview: nominee.photo_url || '',
    })
    setEditNominee(nominee)
  }

  const handleUpdateNominee = async () => {
    if (!editNominee) return
    setUpdatingNominee(true)

    try {
      let photoUrl = editForm.photoUrl

      if (editForm.imageFile) {
        const formData = new FormData()
        formData.append('eventId', eventId)
        formData.append('image', editForm.imageFile)

        const uploadRes = await fetch('/api/organizer/upload-nominee-image', {
          method: 'POST',
          body: formData,
        })

        const uploadPayload = await uploadRes.json().catch(() => ({}))

        if (!uploadRes.ok || !uploadPayload?.imageUrl) {
          throw new Error(uploadPayload?.error || 'Could not upload nominee image')
        }

        photoUrl = String(uploadPayload.imageUrl)
      }

      const res = await fetch('/api/organizer/nominees', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editNominee.id,
          nominee_name: editForm.nominee_name,
          nominee_email: editForm.nominee_email || null,
          nominee_phone: editForm.nominee_phone || null,
          bio: editForm.bio || null,
          category_id: editForm.categoryId || null,
          status: editForm.status,
          photo_url: photoUrl || null,
        }),
      })

      const payload = await res.json()

      if (!res.ok) {
        throw new Error(payload?.error || 'Update failed')
      }

      toast({ title: 'Nominee updated' })
      setEditNominee(null)
      fetchData()
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' })
    } finally {
      setUpdatingNominee(false)
    }
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
                    onClick={() => openViewModal(nominee)}
                    className="text-blue-400 text-sm px-3 py-1 rounded-lg border border-blue-500/30"
                  >
                    <Eye size={14} className="inline mr-1" /> View
                  </button>
                  <button
                    onClick={() => openEditModal(nominee)}
                    className="text-violet-400 text-sm px-3 py-1 rounded-lg border border-violet-500/30"
                  >
                    <Pencil size={14} className="inline mr-1" /> Edit
                  </button>
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
                onClick={() => openViewModal(nominee)}
                className="text-blue-400 text-sm px-3 py-1 rounded-lg border border-blue-500/30"
              >
                <Eye size={14} className="inline mr-1" /> View
              </button>
              <button
                onClick={() => openEditModal(nominee)}
                className="text-violet-400 text-sm px-3 py-1 rounded-lg border border-violet-500/30"
              >
                <Pencil size={14} className="inline mr-1" /> Edit
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

      {/* ── View Nominee Dialog ── */}
      <Dialog open={!!viewNominee} onOpenChange={(open) => !open && setViewNominee(null)}>
        <DialogContent className="max-w-lg bg-surface-card border border-border rounded-3xl p-0 overflow-hidden">
          {viewNominee && (
            <div>
              <div className="relative h-40 bg-gradient-to-br from-gold/20 to-gold-deep/20 flex items-center justify-center">
                {viewNominee.photo_url ? (
                  <img src={viewNominee.photo_url} className="w-24 h-24 rounded-full object-cover border-4 border-surface-card" />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-surface flex items-center justify-center text-3xl font-bold text-muted-foreground">
                    {(viewNominee.nominee_name || '?').charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="p-6 space-y-4">
                <DialogHeader>
                  <DialogTitle className="text-xl">{viewNominee.nominee_name}</DialogTitle>
                  <DialogDescription>
                    Status: <span className="uppercase font-medium">{viewNominee.status}</span> &middot; Category: {getCategoryName(viewNominee.category_id)}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3 text-sm">
                  {viewNominee.nominee_email && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Email</span>
                      <span>{viewNominee.nominee_email}</span>
                    </div>
                  )}
                  {viewNominee.nominee_phone && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Phone</span>
                      <span>{viewNominee.nominee_phone}</span>
                    </div>
                  )}
                  {viewNominee.voting_code && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Voting Code</span>
                      <span className="font-mono">{viewNominee.voting_code}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Votes</span>
                    <span>{viewNominee.vote_count || 0}</span>
                  </div>
                  {viewNominee.bio && (
                    <div className="pt-2 border-t border-border/60">
                      <span className="text-muted-foreground block mb-1">Bio</span>
                      <p className="text-foreground/80">{viewNominee.bio}</p>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => { setViewNominee(null); openEditModal(viewNominee) }}
                  className="w-full mt-4 px-6 py-3 rounded-2xl bg-gradient-to-br from-gold to-gold-deep text-black font-semibold"
                >
                  Edit Nominee
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Edit Nominee Dialog ── */}
      <Dialog open={!!editNominee} onOpenChange={(open) => !open && setEditNominee(null)}>
        <DialogContent className="max-w-lg bg-surface-card border border-border rounded-3xl p-0 overflow-hidden max-h-[90vh] overflow-y-auto">
          {editNominee && (
            <div className="p-6 md:p-8 space-y-6">
              <DialogHeader>
                <DialogTitle>Edit Nominee</DialogTitle>
                <DialogDescription>Update nominee information and photo.</DialogDescription>
              </DialogHeader>

              {/* Photo */}
              <div className="flex flex-col items-center gap-3">
                {editForm.preview ? (
                  <img src={editForm.preview} className="w-24 h-24 rounded-full object-cover border-2 border-border" />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-surface flex items-center justify-center text-2xl font-bold text-muted-foreground">
                    {(editForm.nominee_name || '?').charAt(0).toUpperCase()}
                  </div>
                )}
                <label className="cursor-pointer text-sm text-gold hover:text-gold-deep transition">
                  <Upload size={14} className="inline mr-1" /> Change Photo
                  <DSInput
                    type="file"
                    hidden
                    accept="image/*"
                    onChange={(e) => {
                      if (e.target.files?.[0]) {
                        setEditForm({
                          ...editForm,
                          imageFile: e.target.files[0],
                          preview: URL.createObjectURL(e.target.files[0]),
                        })
                      }
                    }}
                  />
                </label>
              </div>

              <div className="space-y-4">
                <DSInput
                  placeholder="Nominee Name"
                  value={editForm.nominee_name}
                  onChange={(e) => setEditForm({ ...editForm, nominee_name: e.target.value })}
                  className="bg-surface rounded-2xl px-6 h-14 w-full"
                />
                <DSInput
                  placeholder="Email"
                  type="email"
                  value={editForm.nominee_email}
                  onChange={(e) => setEditForm({ ...editForm, nominee_email: e.target.value })}
                  className="bg-surface rounded-2xl px-6 h-14 w-full"
                />
                <DSInput
                  placeholder="Phone Number"
                  type="tel"
                  value={editForm.nominee_phone}
                  onChange={(e) => setEditForm({ ...editForm, nominee_phone: e.target.value })}
                  className="bg-surface rounded-2xl px-6 h-14 w-full"
                />
                <DSSelect
                  value={editForm.categoryId}
                  onChange={(e) => setEditForm({ ...editForm, categoryId: e.target.value })}
                  className="bg-surface rounded-2xl px-6 h-14 w-full"
                >
                  <option value="">Select Category</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </DSSelect>
                <DSSelect
                  value={editForm.status}
                  onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                  className="bg-surface rounded-2xl px-6 h-14 w-full"
                >
                  <option value="candidate">Candidate</option>
                  <option value="approved">Approved</option>
                  <option value="pending">Pending</option>
                  <option value="rejected">Rejected</option>
                </DSSelect>
                <DSTextarea
                  placeholder="Short Bio"
                  value={editForm.bio}
                  onChange={(e) => setEditForm({ ...editForm, bio: e.target.value })}
                  rows={4}
                  className="bg-surface rounded-2xl px-6 py-4 w-full"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setEditNominee(null)}
                  className="flex-1 px-6 py-3 rounded-2xl border border-border bg-card text-foreground font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateNominee}
                  disabled={updatingNominee}
                  className="flex-1 px-6 py-3 rounded-2xl bg-gradient-to-br from-gold to-gold-deep text-black font-semibold disabled:opacity-50"
                >
                  {updatingNominee ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

    </div>
  )
}