'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { useToast } from '@/hooks/use-toast'
import { ArrowLeft, Pencil, Plus, Save, Trash2, X } from 'lucide-react'
import { DSCard, DSInput, DSPrimaryButton } from '@/components/ui/design-system'

export default function CategoriesPage() {
  const params = useParams()
  const eventId = String(params?.eventId || params?.id)
  const router = useRouter()
  const { toast } = useToast()

  const [categories, setCategories] = useState<any[]>([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [eventImageUrl, setEventImageUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!eventId || eventId === 'undefined' || eventId === 'null') return
    fetchCategories()
  }, [eventId])

  const fetchCategories = async () => {
    const res = await fetch(`/api/organizer/categories?eventId=${eventId}`)
    const payload = await res.json()

    if (!res.ok) {
      toast({
        title: 'Load Failed',
        description: payload?.error || 'Unable to load categories',
        variant: 'destructive',
      })
      setLoading(false)
      return
    }

    setCategories(payload.categories || [])
    setEventImageUrl(payload.eventImageUrl || null)
    setLoading(false)
  }

  const handleCreate = async () => {
    if (!name.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Category name is required',
        variant: 'destructive',
      })
      return
    }

    setCreating(true)

    const res = await fetch('/api/organizer/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId,
        name,
        description,
      }),
    })

    const payload = await res.json()

    if (!res.ok) {
      toast({
        title: 'Create Failed',
        description: payload?.error || 'Unable to create category',
        variant: 'destructive',
      })
    } else {
      toast({
        title: 'Category Created',
        description: 'New category added successfully.',
      })
      setName('')
      setDescription('')
      fetchCategories()
    }

    setCreating(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this category?')) return

    const res = await fetch(`/api/organizer/categories?id=${id}`, {
      method: 'DELETE',
    })

    if (res.ok) {
      setCategories(categories.filter((c) => c.id !== id))
      toast({
        title: 'Category Deleted',
      })
    } else {
      const payload = await res.json().catch(() => ({}))
      toast({
        title: 'Delete Failed',
        description: payload?.error || 'Unable to delete category',
        variant: 'destructive',
      })
    }
  }

  const startEditing = (category: any) => {
    setEditingId(category.id)
    setEditName(category.name || '')
    setEditDescription(category.description || '')
  }

  const cancelEditing = () => {
    setEditingId(null)
    setEditName('')
    setEditDescription('')
  }

  const handleUpdate = async (id: string) => {
    if (!editName.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Category name is required',
        variant: 'destructive',
      })
      return
    }

    setSavingId(id)

    const res = await fetch('/api/organizer/categories', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id,
        name: editName.trim(),
        description: editDescription.trim(),
      }),
    })

    const payload = await res.json()

    if (!res.ok) {
      toast({
        title: 'Update Failed',
        description: payload?.error || 'Unable to update category',
        variant: 'destructive',
      })
      setSavingId(null)
      return
    }

    setCategories(categories.map((category) => (category.id === id ? payload.category : category)))
    cancelEditing()
    setSavingId(null)
    toast({
      title: 'Category Updated',
      description: 'Category details saved successfully.',
    })
  }

  if (loading) {
    return (
      <div className="p-12">
        <div className="h-48 rounded-3xl bg-surface-card animate-pulse" />
      </div>
    )
  }

  return (
    <div className="flex-1 p-12 space-y-12">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition mb-6"
          >
            <ArrowLeft size={16} />
            Back
          </button>

          <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold tracking-tight">
            Categories
          </h1>
          <p className="text-muted-foreground mt-2">
            Organize nominees into voting groups.
          </p>
        </div>
      </div>

      {/* Create Category Section */}
      <DSCard className="p-6 sm:p-10 space-y-8 shadow-[0_30px_80px_rgba(0,0,0,0.6)]">

        <h2 className="text-xl font-semibold">
          Create New Category
        </h2>

        <div className="grid md:grid-cols-2 gap-6">

          <div>
            <label className="block text-sm text-muted-foreground mb-3">
              Category Name
            </label>
            <DSInput
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-14 bg-surface rounded-2xl px-6"
              placeholder="e.g. Best Actor"
            />
          </div>

          <div>
            <label className="block text-sm text-muted-foreground mb-3">
              Description (Optional)
            </label>
            <DSInput
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="h-14 bg-surface rounded-2xl px-6"
              placeholder="Short explanation"
            />
          </div>

        </div>

        <DSPrimaryButton
          onClick={handleCreate}
          disabled={creating}
          className="px-8 py-4 h-14 rounded-2xl shadow-[0_0_35px_rgba(245,192,68,0.35)] hover:scale-105 transition"
        >
          <Plus size={16} className="inline mr-2" />
          {creating ? 'Creating…' : 'Create Category'}
        </DSPrimaryButton>

      </DSCard>

      {/* Categories List */}
      <div className="space-y-6">

        {categories.length === 0 && (
          <DSCard className="p-16 text-center text-muted-foreground">
            No categories created yet.
          </DSCard>
        )}

        {categories.map((category) => (
          <DSCard
            key={category.id}
            className="p-8 flex justify-between items-center hover:border-gold/30 transition group"
          >
            {editingId === category.id ? (
              <div className="flex w-full flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="grid flex-1 gap-4 md:grid-cols-2">
                  <DSInput
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="h-12 bg-surface rounded-2xl px-4"
                    placeholder="Category name"
                  />
                  <DSInput
                    type="text"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="h-12 bg-surface rounded-2xl px-4"
                    placeholder="Description"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleUpdate(category.id)}
                    disabled={savingId === category.id}
                    className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/40 px-4 py-3 text-sm text-emerald-400 transition hover:bg-emerald-500/10 disabled:opacity-60"
                  >
                    <Save size={16} />
                    {savingId === category.id ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={cancelEditing}
                    disabled={savingId === category.id}
                    className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-3 text-sm text-muted-foreground transition hover:text-foreground disabled:opacity-60"
                  >
                    <X size={16} />
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div>
                  <h3 className="text-lg font-semibold mb-2 flex items-center gap-3">
                    {eventImageUrl ? (
                      <img
                        src={eventImageUrl}
                        alt="Event"
                        className="h-8 w-8 rounded-md object-cover border border-border"
                      />
                    ) : (
                      <div className="h-8 w-8 rounded-md bg-surface border border-border" />
                    )}
                    <span>{category.name}</span>
                  </h3>
                  {category.description && (
                    <p className="text-muted-foreground text-sm">
                      {category.description}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => startEditing(category)}
                    className="p-3 rounded-xl bg-surface border border-border text-muted-foreground hover:text-foreground transition"
                  >
                    <Pencil size={18} />
                  </button>
                  <button
                    onClick={() => handleDelete(category.id)}
                    className="p-3 rounded-xl bg-surface border border-border text-red-500 hover:bg-red-500 hover:text-black transition"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </>
            )}

          </DSCard>
        ))}

      </div>

    </div>
  )
}
