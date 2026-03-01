'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { ArrowLeft, Plus, Trash2, Upload } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

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

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    const { data: catData } = await supabase
      .from('categories')
      .select('*')
      .eq('event_id', eventId)

    if (catData) setCategories(catData)

    const { data: nomData } = await supabase
      .from('nominees')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false })

    if (nomData) setNominees(nomData)

    setLoading(false)
  }

  const generateVotingCode = () => {
    return 'BV-' + Math.random().toString(36).substring(2, 8).toUpperCase()
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
        imageUrl = await uploadImage(imageFile)
      }

      const votingCode = generateVotingCode()

      const { error } = await supabase.from('nominees').insert({
        event_id: eventId,
        category_id: categoryId,
        name,
        bio,
        photo_url: imageUrl,
        voting_code: votingCode,
      })

      if (error) throw error

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

    await supabase.from('nominees').delete().eq('id', id)
    setNominees(nominees.filter((n) => n.id !== id))
  }

  if (loading)
    return (
      <div className="p-12">
        <div className="h-64 rounded-3xl bg-[#121421] animate-pulse" />
      </div>
    )

  return (
    <div className="flex-1 p-6 md:p-12 space-y-12">

      {/* Header */}
      <div>
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-white/40 hover:text-white mb-6"
        >
          <ArrowLeft size={16} />
          Back
        </button>

        <h1 className="text-3xl md:text-4xl font-semibold">
          Nominees
        </h1>
      </div>

      {/* Create Card */}
      <div className="bg-[#121421] border border-white/5 rounded-3xl p-6 md:p-10 space-y-8">

        <div className="grid gap-6 md:grid-cols-2">

          <input
            placeholder="Nominee Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="bg-[#0F111A] border border-white/10 rounded-2xl px-6 py-4"
          />

          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="bg-[#0F111A] border border-white/10 rounded-2xl px-6 py-4"
          >
            <option value="">Select Category</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>

          <textarea
            placeholder="Short Bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className="bg-[#0F111A] border border-white/10 rounded-2xl px-6 py-4 md:col-span-2"
          />

          {/* Image Upload */}
          <label className="md:col-span-2 bg-[#0F111A] border border-white/10 rounded-2xl p-6 cursor-pointer hover:border-[#F5C044]/40 transition text-center">
            {preview ? (
              <img
                src={preview}
                className="mx-auto w-32 h-32 rounded-full object-cover"
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-white/40">
                <Upload size={20} />
                Upload Photo
              </div>
            )}

            <input
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

        <button
          onClick={handleCreate}
          disabled={creating}
          className="px-8 py-4 rounded-2xl bg-gradient-to-br from-[#F5C044] to-[#D9A92E] text-black font-semibold"
        >
          <Plus size={16} className="inline mr-2" />
          {creating ? 'Creating…' : 'Create Nominee'}
        </button>

      </div>

      {/* Nominee Grid */}
      <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
        {nominees.map((nominee) => (
          <div
            key={nominee.id}
            className="bg-[#121421] border border-white/5 rounded-3xl p-6 hover:border-[#F5C044]/30 transition"
          >
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 rounded-full overflow-hidden bg-[#0F111A]">
                {nominee.photo_url ? (
                  <img
                    src={nominee.photo_url}
                    className="w-full h-full object-cover"
                  />
                ) : null}
              </div>

              <div>
                <div className="text-lg font-semibold">
                  {nominee.name}
                </div>
              </div>
            </div>

            <button
              onClick={() => handleDelete(nominee.id)}
              className="text-red-500 hover:text-red-400"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>

    </div>
  )
}