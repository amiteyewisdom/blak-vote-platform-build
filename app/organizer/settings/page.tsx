'use client'

import { useEffect, useState } from 'react'
import {
  DSCard,
  DSCardContent,
  DSCardDescription,
  DSCardHeader,
  DSCardTitle,
  DSInput,
  DSPrimaryButton,
} from '@/components/ui/design-system'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { CheckCircle } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

export default function OrganizerSettingsPage() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const [settings, setSettings] = useState({
    organization_name: '',
    contact_email: '',
    enable_notifications: true,
    enable_public_results: false,
  })

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch('/api/organizer/settings', { cache: 'no-store' })
        const data = await res.json().catch(() => ({}))

        if (!res.ok) {
          throw new Error(data?.error || 'Failed to load organizer settings')
        }

        setSettings({
          organization_name: data.organization_name || '',
          contact_email: data.contact_email || '',
          enable_notifications: data.enable_notifications ?? true,
          enable_public_results: data.enable_public_results ?? false,
        })
      } catch (error: any) {
        toast({
          title: 'Failed to load settings',
          description: error?.message || 'Please refresh and try again.',
          variant: 'destructive',
        })
      } finally {
        setLoading(false)
      }
    }

    fetchSettings()
  }, [])

  const handleSave = async () => {
    if (!settings.organization_name.trim()) {
      toast({
        title: 'Organization name required',
        description: 'Please enter your organization name before saving.',
        variant: 'destructive',
      })
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(settings.contact_email.trim())) {
      toast({
        title: 'Invalid contact email',
        description: 'Please enter a valid email address.',
        variant: 'destructive',
      })
      return
    }

    setSaving(true)

    try {
      const res = await fetch('/api/organizer/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })

      const payload = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(payload?.error || 'Failed to save organizer settings')
      }

      setSaved(true)
      toast({
        title: 'Settings updated',
        description: 'Organization settings saved successfully.',
      })
      setTimeout(() => setSaved(false), 3000)
    } catch (error: any) {
      toast({
        title: 'Save failed',
        description: error?.message || 'Unable to save settings.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="p-8 text-foreground">Loading settings...</div>
  }

  return (
    <div className="mx-auto flex-1 max-w-3xl space-y-10 p-10 text-foreground">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Organization Settings</h1>
        <p className="text-muted-foreground">
          Manage your organization's profile and preferences
        </p>
      </div>

      <div className="space-y-6">
        {/* Organization Info */}
        <DSCard className="p-0">
          <DSCardHeader>
            <DSCardTitle>Organization Information</DSCardTitle>
            <DSCardDescription>
              Your organization's basic details
            </DSCardDescription>
          </DSCardHeader>

          <DSCardContent className="space-y-6">
            <div>
              <Label>Organization Name</Label>
              <DSInput
                value={settings.organization_name}
                onChange={(e) =>
                  setSettings({ ...settings, organization_name: e.target.value })
                }
                className="mt-2"
              />
            </div>

            <div>
              <Label>Contact Email</Label>
              <DSInput
                type="email"
                value={settings.contact_email}
                onChange={(e) =>
                  setSettings({ ...settings, contact_email: e.target.value })
                }
                className="mt-2"
              />
            </div>
          </DSCardContent>
        </DSCard>

        {/* Preferences */}
        <DSCard className="p-0">
          <DSCardHeader>
            <DSCardTitle>Preferences</DSCardTitle>
            <DSCardDescription>
              Configure your event preferences
            </DSCardDescription>
          </DSCardHeader>

          <DSCardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <Label>Event Notifications</Label>
                <p className="mt-1 text-sm text-muted-foreground">
                  Receive notifications about voting activity
                </p>
              </div>
              <Switch
                checked={settings.enable_notifications}
                onCheckedChange={(checked) =>
                  setSettings({ ...settings, enable_notifications: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between border-t border-border pt-4">
              <div>
                <Label>Public Results</Label>
                <p className="mt-1 text-sm text-muted-foreground">
                  Allow the public to view voting results
                </p>
              </div>
              <Switch
                checked={settings.enable_public_results}
                onCheckedChange={(checked) =>
                  setSettings({ ...settings, enable_public_results: checked })
                }
              />
            </div>
          </DSCardContent>
        </DSCard>

        {/* Save Button */}
        <div className="flex gap-2">
          <DSPrimaryButton
            onClick={handleSave}
            disabled={saving}
            className="gap-2"
          >
            {saved && <CheckCircle className="w-4 h-4" />}
            {saving ? 'Saving...' : saved ? 'Saved' : 'Save Settings'}
          </DSPrimaryButton>
        </div>
      </div>
    </div>
  )
}
