import { redirect } from 'next/navigation'

type PageProps = {
  params: {
    eventId?: string
    rest?: string[]
  }
}

export default async function OrganizerLegacyEventRedirectPage({ params }: PageProps) {
  const eventId = params?.eventId
  const rest = params?.rest ?? []

  if (!eventId) {
    redirect('/organizer')
  }

  const suffix = rest.length > 0 ? `/${rest.join('/')}` : ''
  redirect(`/organizer/events/${eventId}${suffix}`)
}
