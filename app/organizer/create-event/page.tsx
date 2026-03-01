'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function CreateEventPage() {
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
      alert('Not authenticated')
      setLoading(false)
      return
    }

    // =========================
    // VALIDATION
    // =========================
    if (!form.title || !form.description) {
      alert('Title and description are required')
      setLoading(false)
      return
    }

    if (!form.startDate || !form.endDate) {
      alert('Please select start and end dates')
      setLoading(false)
      return
    }

    if (new Date(form.endDate) <= new Date(form.startDate)) {
      alert('End date must be after start date')
      setLoading(false)
      return
    }

    if (form.votingType === 'paid' && !form.costPerVote) {
      alert('Cost per vote is required for paid voting')
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
        alert(uploadError.message)
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
    const { error } = await supabase.from('events').insert([
      {
        title: form.title,
        description: form.description,
        organizer_id: user.id,
        image_url: imageUrl,
        start_date: form.startDate,
        end_date: form.endDate,
        voting_type: form.votingType,
        cost_per_vote:
          form.votingType === 'paid'
            ? Number(form.costPerVote)
            : 0,
      },
    ])

    setLoading(false)

    if (error) {
      alert(error.message)
    } else {
      alert('Award created successfully')
      window.location.reload()
    }
  }

  return (
    <div className="min-h-screen bg-black text-white flex justify-center px-6 py-16">

      <div className="w-full max-w-md">

        <div className="text-center mb-10">
          <h1 className="text-4xl font-serif">
            Create Award
          </h1>
          <div className="mt-4 mx-auto w-20 h-[2px] bg-[#c6a74d]" />
        </div>

        <div className="backdrop-blur-xl bg-white/[0.04] border border-[#c6a74d]/30 rounded-3xl p-8 space-y-6">

          {/* Image Upload */}
          <label className="block bg-black/50 border border-white/10 rounded-2xl p-6 text-center cursor-pointer hover:border-[#c6a74d]/60 transition">
            {preview ? (
              <img
                src={preview}
                className="mx-auto w-32 h-32 object-cover rounded-xl"
              />
            ) : (
              <div>
                <div className="text-lg">
                  Upload Emblem
                </div>
                <div className="text-xs text-gray-400 mt-2">
                  PNG or JPG · Square recommended
                </div>
              </div>
            )}
            <input
              type="file"
              hidden
              accept="image/*"
              onChange={(e) =>
                e.target.files &&
                handleImage(e.target.files[0])
              }
            />
          </label>

          <input
            placeholder="Award Name"
            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 focus:border-[#c6a74d] outline-none transition"
            onChange={(e) =>
              update('title', e.target.value)
            }
          />

          <textarea
            placeholder="Description"
            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 focus:border-[#c6a74d] outline-none transition"
            onChange={(e) =>
              update('description', e.target.value)
            }
          />

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <input
              type="date"
              className="bg-black/50 border border-white/10 rounded-xl px-4 py-3 focus:border-[#c6a74d] outline-none transition"
              onChange={(e) =>
                update('startDate', e.target.value)
              }
            />
            <input
              type="date"
              className="bg-black/50 border border-white/10 rounded-xl px-4 py-3 focus:border-[#c6a74d] outline-none transition"
              onChange={(e) =>
                update('endDate', e.target.value)
              }
            />
          </div>

          {/* Voting Type */}
          <div className="flex gap-4">
            {['paid', 'social'].map((type) => (
              <button
                key={type}
                type="button"
                onClick={() =>
                  update('votingType', type)
                }
                className={`flex-1 py-3 rounded-xl transition ${
                  form.votingType === type
                    ? 'bg-[#c6a74d] text-black font-semibold'
                    : 'bg-black/50 text-gray-400'
                }`}
              >
                {type === 'paid'
                  ? 'Paid Voting'
                  : 'Social Voting'}
              </button>
            ))}
          </div>

          {form.votingType === 'paid' && (
            <input
              type="number"
              placeholder="Cost per vote (GHS)"
              className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 focus:border-[#c6a74d] outline-none transition"
              onChange={(e) =>
                update('costPerVote', e.target.value)
              }
            />
          )}

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full bg-[#c6a74d] text-black py-4 rounded-xl font-semibold shadow-lg hover:opacity-90 transition"
          >
            {loading ? 'Processing…' : 'Create Award'}
          </button>

        </div>
      </div>
    </div>
  )
}