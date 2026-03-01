'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { useToast } from '@/hooks/use-toast'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'

export default function CategoriesPage() {
  const { eventId } = useParams()
  const router = useRouter()
  const { toast } = useToast()

  const [categories, setCategories] = useState<any[]>([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    fetchCategories()
  }, [])

  const fetchCategories = async () => {
    const { data } = await supabase
      .from('categories')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false })

    if (data) setCategories(data)
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

    const { error } = await supabase.from('categories').insert({
      event_id: eventId,
      name,
      description,
    })

    if (error) {
      toast({
        title: 'Create Failed',
        description: error.message,
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

    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('id', id)

    if (!error) {
      setCategories(categories.filter((c) => c.id !== id))
      toast({
        title: 'Category Deleted',
      })
    }
  }

  if (loading) {
    return (
      <div className="p-12">
        <div className="h-48 rounded-3xl bg-[#121421] animate-pulse" />
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
            className="flex items-center gap-2 text-white/40 hover:text-white transition mb-6"
          >
            <ArrowLeft size={16} />
            Back
          </button>

          <h1 className="text-4xl font-semibold tracking-tight">
            Categories
          </h1>
          <p className="text-white/40 mt-2">
            Organize nominees into voting groups.
          </p>
        </div>
      </div>

      {/* Create Category Section */}
      <div className="bg-[#121421] border border-white/5 rounded-3xl p-10 space-y-8 shadow-[0_30px_80px_rgba(0,0,0,0.6)]">

        <h2 className="text-xl font-semibold">
          Create New Category
        </h2>

        <div className="grid md:grid-cols-2 gap-6">

          <div>
            <label className="block text-sm text-white/40 mb-3">
              Category Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-[#0F111A] border border-white/10 rounded-2xl px-6 py-4 text-white focus:border-[#F5C044] focus:outline-none transition"
              placeholder="e.g. Best Actor"
            />
          </div>

          <div>
            <label className="block text-sm text-white/40 mb-3">
              Description (Optional)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-[#0F111A] border border-white/10 rounded-2xl px-6 py-4 text-white focus:border-[#F5C044] focus:outline-none transition"
              placeholder="Short explanation"
            />
          </div>

        </div>

        <button
          onClick={handleCreate}
          disabled={creating}
          className="px-8 py-4 rounded-2xl bg-gradient-to-br from-[#F5C044] to-[#D9A92E] text-black font-semibold shadow-[0_0_35px_rgba(245,192,68,0.35)] hover:scale-105 transition disabled:opacity-50"
        >
          <Plus size={16} className="inline mr-2" />
          {creating ? 'Creating…' : 'Create Category'}
        </button>

      </div>

      {/* Categories List */}
      <div className="space-y-6">

        {categories.length === 0 && (
          <div className="bg-[#121421] border border-white/5 rounded-3xl p-16 text-center text-white/40">
            No categories created yet.
          </div>
        )}

        {categories.map((category) => (
          <div
            key={category.id}
            className="bg-[#121421] border border-white/5 rounded-3xl p-8 flex justify-between items-center hover:border-[#F5C044]/30 transition group"
          >
            <div>
              <h3 className="text-lg font-semibold mb-2">
                {category.name}
              </h3>
              {category.description && (
                <p className="text-white/40 text-sm">
                  {category.description}
                </p>
              )}
            </div>

            <button
              onClick={() => handleDelete(category.id)}
              className="p-3 rounded-xl bg-[#0F111A] border border-white/10 text-red-500 hover:bg-red-500 hover:text-black transition"
            >
              <Trash2 size={18} />
            </button>

          </div>
        ))}

      </div>

    </div>
  )
}
