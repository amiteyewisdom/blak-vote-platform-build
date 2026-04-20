import OrganizerApplicationForm from '@/components/OrganizerApplicationForm'

export default function ApplyOrganizerPage() {
  return (
    <div className="min-h-screen bg-background text-foreground px-4 py-10">
      <div className="max-w-3xl mx-auto mb-6 text-center">
        <h1 className="text-3xl md:text-4xl font-bold">Apply To Become Organizer</h1>
        <p className="text-foreground/60 mt-2">Only registered voters can apply. Admin approval is required.</p>
      </div>
      <OrganizerApplicationForm />
    </div>
  )
}
