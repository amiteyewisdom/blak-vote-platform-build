'use client'

import { useEffect, useState } from 'react'

export default function AdminApplicationsPage() {
  const [applications, setApplications] = useState<any[]>([])
  const [otpAttempts, setOtpAttempts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const fetchApplications = async () => {
    const [applicationsRes, otpRes] = await Promise.all([
      fetch('/api/admin/organizer-applications', { cache: 'no-store' }),
      fetch('/api/admin/otp-monitor', { cache: 'no-store' }),
    ])
    const applicationsData = await applicationsRes.json().catch(() => ({}))
    const otpData = await otpRes.json().catch(() => ({}))
    if (applicationsRes.ok) {
      setApplications(applicationsData.applications || [])
    }
    if (otpRes.ok) {
      setOtpAttempts(otpData.attempts || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchApplications()
  }, [])

  const review = async (applicationId: string, action: 'approve' | 'reject') => {
    setBusyId(applicationId)
    const res = await fetch('/api/admin/organizer-applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicationId, action }),
    })
    if (res.ok) {
      await fetchApplications()
    }
    setBusyId(null)
  }

  if (loading) {
    return <div className="p-8 text-foreground">Loading applications...</div>
  }

  return (
    <div className="p-4 md:p-8 text-foreground space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Organizer Applications</h1>
        <p className="text-foreground/60">Approve or reject voter applications to become organizers.</p>
      </div>

      <div className="rounded-2xl border border-border bg-surface-card p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">OTP Abuse Monitor</h2>
          <span className="text-xs text-foreground/50">Last 24 hours</span>
        </div>

        {otpAttempts.length === 0 ? (
          <p className="text-sm text-foreground/60">No suspicious OTP activity detected.</p>
        ) : (
          <div className="space-y-2">
            {otpAttempts.slice(0, 8).map((attempt) => (
              <div key={attempt.id} className="flex items-center justify-between rounded-xl border border-border/70 px-3 py-2 text-sm">
                <div>
                  <div className="font-medium">{attempt.email}</div>
                  <div className="text-foreground/50">{attempt.purpose} • {attempt.verified ? 'verified' : 'unverified'}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">{attempt.attempts || 0} attempts</div>
                  <div className="text-foreground/50">{new Date(attempt.created_at).toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {applications.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface-card p-6 text-foreground/60">
          No applications found.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {applications.map((app) => (
            <div key={app.id} className="rounded-2xl border border-border bg-surface-card p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">{app.organization_name || app.company || 'Organizer Application'}</h3>
                <span className="text-xs uppercase px-3 py-1 rounded-full border border-white/20 text-foreground/70">
                  {app.status || 'pending'}
                </span>
              </div>

              <p className="text-sm text-foreground/70">{app.description || app.bio || 'No description provided'}</p>
              <p className="text-sm text-foreground/50">Org ID: {app.organization_id || app.id_number || 'N/A'}</p>
              <p className="text-sm text-foreground/50">Email: {app.email || 'N/A'}</p>
              <p className="text-sm text-foreground/50">Phone: {app.phone_number || app.phone || 'N/A'}</p>
              <p className="text-sm text-foreground/50">Address: {app.address || 'N/A'}</p>
              {app.document_signed_url ? (
                <a href={app.document_signed_url} target="_blank" rel="noreferrer" className="inline-flex text-sm font-medium text-gold hover:opacity-80">
                  View supporting document
                </a>
              ) : null}

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => review(app.id, 'approve')}
                  disabled={busyId === app.id}
                  className="px-4 py-2 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30 active:scale-[0.97] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Approve
                </button>
                <button
                  onClick={() => review(app.id, 'reject')}
                  disabled={busyId === app.id}
                  className="px-4 py-2 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30 active:scale-[0.97] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
