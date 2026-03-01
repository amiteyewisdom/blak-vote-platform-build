'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import {
  Trophy,
  FolderPlus,
  Users,
  BarChart3,
  CreditCard,
  ArrowRightLeft,
  Package,
  FileText,
  Pencil,
  ArrowLeft,
} from 'lucide-react'

export default function EventDashboardPage() {
  const params = useParams()
  const rawId = params?.eventId
  const id = Array.isArray(rawId) ? rawId[0] : rawId
  const router = useRouter()

  const [event, setEvent] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return

    const init = async () => {
      setLoading(true)

      const {
        data: { user },
      } = await supabase.auth.getUser()

      console.log('Logged in user:', user?.email)

      if (!user) {
        router.push('/auth/sign-in')
        return
      }

      const { data } = await supabase
        .from('events')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      setEvent(data ?? null)
      setLoading(false)
    }

    init()
  }, [id, router])

  if (loading) {
    return (
      <div className="p-12">
        <div className="h-40 rounded-3xl bg-[#121421] animate-pulse" />
      </div>
    )
  }

  if (!event) {
    return (
      <div className="p-12 text-red-500">
        Event not found or access denied
      </div>
    )
  }

  return (
    <div className="flex-1 p-12 space-y-12">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={() => router.push('/organizer')}
            className="flex items-center gap-2 text-white/40 hover:text-white transition mb-6"
          >
            <ArrowLeft size={16} />
            Back to Dashboard
          </button>

          <h1 className="text-4xl font-semibold text-white">
            {event.title}
          </h1>
          <p className="text-white/40 mt-3 max-w-2xl">
            {event.description}
          </p>
        </div>

        <button
          onClick={() =>
            router.push(`/organizer/events/${id}/edit`)
          }
          className="px-8 py-4 rounded-2xl bg-gradient-to-br from-[#F5C044] to-[#D9A92E] text-black font-semibold"
        >
          <span className="flex items-center gap-2">
            <Pencil size={16} />
            Edit Event
          </span>
        </button>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-8">
        <MenuCard title="Categories" icon={FolderPlus} path={`/organizer/events/${id}/categories`} />
        <MenuCard title="Nominees" icon={Trophy} path={`/organizer/events/${id}/nominees`} />
        <MenuCard title="Nominations" icon={Users} path={`/organizer/events/${id}/nominations`} />
        <MenuCard title="Bulk Voting" icon={Package} path={`/organizer/events/${id}/bulk`} />
        <MenuCard title="Votes" icon={BarChart3} path={`/organizer/events/${id}/votes`} />
        <MenuCard title="Results" icon={FileText} path={`/organizer/events/${id}/results`} />
        <MenuCard title="Transfers" icon={ArrowRightLeft} path={`/organizer/events/${id}/transfer`} />
        <MenuCard title="Payments" icon={CreditCard} path={`/organizer/events/${id}/payments`} />
      </div>
    </div>
  )
}

function MenuCard({
  title,
  icon: Icon,
  path,
}: {
  title: string
  icon: any
  path: string
}) {
  const router = useRouter()

  return (
    <button
      onClick={() => router.push(path)}
      className="group rounded-3xl p-8 text-left bg-[#121421] border border-white/5 text-white hover:border-[#F5C044]/30 transition-all"
    >
      <div className="flex items-center gap-4 mb-4">
        <Icon size={26} className="text-[#F5C044]" />
        <h3 className="text-lg font-semibold">
          {title}
        </h3>
      </div>

      <p className="text-white/40 text-sm">
        Manage {title.toLowerCase()} for this event.
      </p>
    </button>
  )
}