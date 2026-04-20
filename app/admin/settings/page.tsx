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

export default function AdminSettingsPage() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const [settings, setSettings] = useState({
    platformName: '',
    maxEventsPerOrganizer: '10',
    enableFraudDetection: true,
    requireEmailVerification: true,
    maintenanceMode: false,
  })

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/admin/settings', { cache: 'no-store' })
      const payload = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(payload?.error || 'Failed to load settings')
      }

      setSettings((prev) => ({
        ...prev,
        platformName: payload.platformName ?? '',
        maxEventsPerOrganizer: String(payload.maxEventsPerOrganizer ?? 10),
        enableFraudDetection: payload.enableFraudDetection ?? true,
        requireEmailVerification: payload.requireEmailVerification ?? true,
        maintenanceMode: payload.maintenanceMode ?? false,
      }))
    } catch (error: any) {
      toast({
        title: 'Failed to load settings',
        description: error?.message || 'Try refreshing the page.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    const parsedMaxEvents = Number.parseInt(settings.maxEventsPerOrganizer, 10)

    if (!Number.isInteger(parsedMaxEvents) || parsedMaxEvents <= 0) {
      toast({
        title: 'Invalid value',
        description: 'Max events per organizer must be a positive integer.',
        variant: 'destructive',
      })
      return
    }

    if (!settings.platformName.trim()) {
      toast({
        title: 'Platform name required',
        description: 'Please enter a platform name before saving.',
        variant: 'destructive',
      })
      return
    }

    setSaving(true)

    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platformName: settings.platformName,
          maxEventsPerOrganizer: parsedMaxEvents,
          enableFraudDetection: settings.enableFraudDetection,
          requireEmailVerification: settings.requireEmailVerification,
          maintenanceMode: settings.maintenanceMode,
        }),
      })

      const payload = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(payload?.error || 'Failed to save settings')
      }

      setSaved(true)
      toast({
        title: 'Settings updated',
        description: 'Platform settings were saved successfully.',
      })
      setTimeout(() => setSaved(false), 3000)
    } catch (error: any) {
      toast({
        title: 'Save failed',
        description: error?.message || 'Unable to save platform settings.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-gold/20 border-t-gold" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl flex-1 space-y-6 p-4 text-foreground md:space-y-8 md:p-8">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Platform Settings</h1>
        <p className="mt-1 text-muted-foreground">
          Configure core platform behavior and security.
        </p>
      </div>

      <DSCard className="p-0">
        <DSCardHeader>
          <DSCardTitle>General Settings</DSCardTitle>
          <DSCardDescription>
            Basic platform configuration
          </DSCardDescription>
        </DSCardHeader>

        <DSCardContent className="space-y-6">
          <div>
            <Label>Platform Name</Label>
            <DSInput
              value={settings.platformName}
              onChange={(e) =>
                setSettings({ ...settings, platformName: e.target.value })
              }
              className="mt-2"
            />
          </div>

          <div>
            <Label>Max Events Per Organizer</Label>
            <DSInput
              type="number"
              value={settings.maxEventsPerOrganizer}
              min="1"
              onChange={(e) =>
                setSettings({
                  ...settings,
                  maxEventsPerOrganizer: e.target.value,
                })
              }
              className="mt-2"
            />
          </div>

          <div className="flex items-center justify-between border-t border-border pt-4">
            <div>
              <Label>Maintenance Mode</Label>
              <p className="text-sm text-muted-foreground">
                Temporarily disable platform access
              </p>
            </div>
            <Switch
              checked={settings.maintenanceMode}
              onCheckedChange={(checked) =>
                setSettings({ ...settings, maintenanceMode: checked })
              }
            />
          </div>
        </DSCardContent>
      </DSCard>

      <DSCard className="p-0">
        <DSCardHeader>
          <DSCardTitle>Security Settings</DSCardTitle>
          <DSCardDescription>
            Platform security configuration
          </DSCardDescription>
        </DSCardHeader>

        <DSCardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <Label>Fraud Detection</Label>
              <p className="text-sm text-muted-foreground">
                Enable IP & device tracking
              </p>
            </div>
            <Switch
              checked={settings.enableFraudDetection}
              onCheckedChange={(checked) =>
                setSettings({ ...settings, enableFraudDetection: checked })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Email Verification Required</Label>
              <p className="text-sm text-muted-foreground">
                Require verified emails for account actions
              </p>
            </div>
            <Switch
              checked={settings.requireEmailVerification}
              onCheckedChange={(checked) =>
                setSettings({ ...settings, requireEmailVerification: checked })
              }
            />
          </div>
        </DSCardContent>
      </DSCard>

      <DSPrimaryButton
        onClick={handleSave}
        disabled={saving}
        className="w-full md:w-auto min-h-11 gap-2 rounded-xl"
      >
        {saved && <CheckCircle className="w-4 h-4" />}
        {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Settings'}
      </DSPrimaryButton>
    </div>
  )
}
