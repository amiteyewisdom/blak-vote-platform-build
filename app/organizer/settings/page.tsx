'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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

  // ✅ Fetch existing settings
  useEffect(() => {
    const fetchSettings = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session?.user) return

      const { data, error } = await supabase
        .from('users')
        .select(
          'organization_name, contact_email, enable_notifications, enable_public_results'
        )
        .eq('id', session.user.id)
        .single()

      if (!error && data) {
        setSettings({
          organization_name: data.organization_name || '',
          contact_email: data.contact_email || '',
          enable_notifications: data.enable_notifications ?? true,
          enable_public_results: data.enable_public_results ?? false,
        })
      }

      setLoading(false)
    }

    fetchSettings()
  }, [])

  // ✅ Save to Supabase
  const handleSave = async () => {
    setSaving(true)

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session?.user) return

    const { error } = await supabase
      .from('users')
      .update(settings)
      .eq('id', session.user.id)

    if (error) {
      toast({
        title: 'Save failed',
        description: error.message,
        variant: 'destructive',
      })
      setSaving(false)
      return
    }

    setSaved(true)
    toast({
      title: 'Settings updated',
      description: 'Organization settings saved successfully.',
    })

    setTimeout(() => setSaved(false), 3000)
    setSaving(false)
  }

  if (loading) {
    return <div className="p-8 text-white">Loading settings...</div>
  }

  return (
    <div className="flex-1 p-10 max-w-3xl mx-auto space-y-10">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Organization Settings</h1>
        <p className="text-neutral-400">
          Manage your organization's profile and preferences
        </p>
      </div>

      <div className="space-y-6">
        {/* Organization Info */}
        <Card className="card-premium">
          <CardHeader>
            <CardTitle>Organization Information</CardTitle>
            <CardDescription>
              Your organization's basic details
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            <div>
              <Label>Organization Name</Label>
              <Input
                value={settings.organization_name}
                onChange={(e) =>
                  setSettings({ ...settings, organization_name: e.target.value })
                }
                className="mt-2 bg-[#181822] border-white/10"
              />
            </div>

            <div>
              <Label>Contact Email</Label>
              <Input
                type="email"
                value={settings.contact_email}
                onChange={(e) =>
                  setSettings({ ...settings, contact_email: e.target.value })
                }
                className="mt-2 bg-[#181822] border-white/10"
              />
            </div>
          </CardContent>
        </Card>

        {/* Preferences */}
        <Card className="card-premium">
          <CardHeader>
            <CardTitle>Preferences</CardTitle>
            <CardDescription>
              Configure your event preferences
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <Label>Event Notifications</Label>
                <p className="text-sm text-neutral-400 mt-1">
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

            <div className="flex items-center justify-between pt-4 border-t border-white/10">
              <div>
                <Label>Public Results</Label>
                <p className="text-sm text-neutral-400 mt-1">
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
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex gap-2">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary gap-2"
          >
            {saved && <CheckCircle className="w-4 h-4" />}
            {saving ? 'Saving...' : saved ? 'Saved' : 'Save Settings'}
          </Button>
        </div>
      </div>
    </div>
  )
}
