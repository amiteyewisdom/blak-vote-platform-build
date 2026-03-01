'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { CheckCircle } from 'lucide-react'

export default function AdminSettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const [settings, setSettings] = useState({
    id: '',
    platformName: '',
    maxEventsPerOrganizer: 10,
    enableFraudDetection: true,
    requireEmailVerification: true,
    maintenanceMode: false,
  })

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    const { data } = await supabase
      .from('platform_settings')
      .select('*')
      .limit(1)
      .single()

    if (data) {
      setSettings({
        id: data.id,
        platformName: data.platform_name,
        maxEventsPerOrganizer: data.max_events_per_organizer,
        enableFraudDetection: data.enable_fraud_detection,
        requireEmailVerification: data.require_email_verification,
        maintenanceMode: data.maintenance_mode,
      })
    }

    setLoading(false)
  }

  const handleSave = async () => {
    setSaving(true)

    const { error } = await supabase
      .from('platform_settings')
      .update({
        platform_name: settings.platformName,
        max_events_per_organizer: settings.maxEventsPerOrganizer,
        enable_fraud_detection: settings.enableFraudDetection,
        require_email_verification: settings.requireEmailVerification,
        maintenance_mode: settings.maintenanceMode,
        updated_at: new Date().toISOString(),
      })
      .eq('id', settings.id)

    setSaving(false)

    if (!error) {
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0B0B0F]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#F5C044]" />
      </div>
    )
  }

  return (
    <div className="flex-1 space-y-8 p-8 text-white max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold">Platform Settings</h1>
        <p className="text-neutral-400">
          Configure core platform behavior and security.
        </p>
      </div>

      <Card className="bg-[#111118] border-white/5">
        <CardHeader>
          <CardTitle>General Settings</CardTitle>
          <CardDescription>
            Basic platform configuration
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <div>
            <Label>Platform Name</Label>
            <Input
              value={settings.platformName}
              onChange={(e) =>
                setSettings({ ...settings, platformName: e.target.value })
              }
              className="mt-2"
            />
          </div>

          <div>
            <Label>Max Events Per Organizer</Label>
            <Input
              type="number"
              value={settings.maxEventsPerOrganizer}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  maxEventsPerOrganizer: parseInt(e.target.value),
                })
              }
              className="mt-2"
            />
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-white/5">
            <div>
              <Label>Maintenance Mode</Label>
              <p className="text-sm text-neutral-400">
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
        </CardContent>
      </Card>

      <Card className="bg-[#111118] border-white/5">
        <CardHeader>
          <CardTitle>Security Settings</CardTitle>
          <CardDescription>
            Platform security configuration
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <Label>Fraud Detection</Label>
              <p className="text-sm text-neutral-400">
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

          <div className="flex items-center justify-between pt-4 border-t border-white/5">
            <div>
              <Label>Email Verification Required</Label>
              <p className="text-sm text-neutral-400">
                Require email verification for new users
              </p>
            </div>
            <Switch
              checked={settings.requireEmailVerification}
              onCheckedChange={(checked) =>
                setSettings({ ...settings, requireEmailVerification: checked })
              }
            />
          </div>
        </CardContent>
      </Card>

      <Button
        onClick={handleSave}
        disabled={saving}
        className="gap-2 bg-gradient-to-r from-[#F5C044] to-[#D9A92E] text-black"
      >
        {saved && <CheckCircle className="w-4 h-4" />}
        {saving ? 'Saving...' : saved ? 'Saved' : 'Save Settings'}
      </Button>
    </div>
  )
}
