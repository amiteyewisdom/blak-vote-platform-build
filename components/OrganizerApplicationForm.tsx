"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';

type OrganizerApplicationFormProps = {
  successHref?: string;
};

export default function OrganizerApplicationForm({ successHref = '/voter' }: OrganizerApplicationFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [organizationName, setOrganizationName] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!documentFile) {
      toast({
        title: 'Supporting document required',
        description: 'Upload a PDF or image before submitting your application.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    const body = new FormData();
    body.set('organizationName', organizationName);
    body.set('organizationId', organizationId);
    body.set('address', address);
    body.set('description', description);
    body.set('phoneNumber', phoneNumber);
    body.set('document', documentFile);

    const res = await fetch('/api/organizer/apply', {
      method: 'POST',
      body,
    });

    const payload = await res.json();
    setLoading(false);

    if (!res.ok) {
      toast({
        title: 'Application failed',
        description: payload?.error || 'Unable to submit application',
        variant: 'destructive',
      });
      return;
    }

    toast({ title: 'Application submitted', description: 'Your application will be reviewed by admin.' });
    router.push(successHref);
  };

  return (
    <div className="mx-auto mt-10 max-w-lg rounded-2xl border border-border bg-card p-6 shadow-lg">
      <h2 className="mb-4 text-2xl font-bold text-card-foreground">Organizer Application</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          className="w-full rounded-xl border border-input bg-background p-2 text-foreground placeholder:text-muted-foreground"
          type="text"
          placeholder="Organization Name"
          value={organizationName}
          onChange={e => setOrganizationName(e.target.value)}
          required
        />
        <input
          className="w-full rounded-xl border border-input bg-background p-2 text-foreground placeholder:text-muted-foreground"
          type="text"
          placeholder="Organization ID / Registration Number"
          value={organizationId}
          onChange={e => setOrganizationId(e.target.value)}
          required
        />
        <input
          className="w-full rounded-xl border border-input bg-background p-2 text-foreground placeholder:text-muted-foreground"
          type="text"
          placeholder="Organization Address"
          value={address}
          onChange={e => setAddress(e.target.value)}
          required
        />
        <textarea
          className="w-full rounded-xl border border-input bg-background p-2 text-foreground placeholder:text-muted-foreground"
          placeholder="Describe your organization and why you are applying"
          value={description}
          onChange={e => setDescription(e.target.value)}
          required
        />
        <input
          className="w-full rounded-xl border border-input bg-background p-2 text-foreground placeholder:text-muted-foreground"
          type="tel"
          placeholder="Phone Number"
          value={phoneNumber}
          onChange={e => setPhoneNumber(e.target.value)}
          required
        />
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Supporting Document</label>
          <input
            className="w-full rounded-xl border border-input bg-background p-2 text-foreground placeholder:text-muted-foreground"
            type="file"
            accept=".pdf,image/jpeg,image/png,image/webp"
            onChange={e => setDocumentFile(e.target.files?.[0] ?? null)}
            required
          />
          <p className="text-xs text-muted-foreground">Accepted: PDF, JPG, PNG, WEBP up to 5MB.</p>
        </div>
        <button
          type="submit"
          className="w-full rounded-xl bg-gradient-to-br from-gold to-gold-deep py-3 font-semibold text-gold-foreground transition-all duration-200 hover:brightness-110 hover:shadow-[0_4px_20px_hsl(var(--gold)/0.3)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
          disabled={loading}
        >
          {loading ? 'Submitting...' : 'Apply as Organizer'}
        </button>
      </form>
    </div>
  );
}
