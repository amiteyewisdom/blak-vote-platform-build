"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';

export default function OrganizerApplicationForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [company, setCompany] = useState('');
  const [website, setWebsite] = useState('');
  const [bio, setBio] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [idType, setIdType] = useState('national_id');
  const [idNumber, setIdNumber] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const res = await fetch('/api/organizer/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company, website, bio, phone, email, id_type: idType, id_number: idNumber }),
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
    router.push('/events');
  };

  return (
    <div className="mx-auto mt-10 max-w-lg rounded-2xl border border-border bg-card p-6 shadow-lg">
      <h2 className="mb-4 text-2xl font-bold text-card-foreground">Organizer Application</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          className="w-full rounded-xl border border-input bg-background p-2 text-foreground placeholder:text-muted-foreground"
          type="text"
          placeholder="Company/Organization Name"
          value={company}
          onChange={e => setCompany(e.target.value)}
          required
        />
        <input
          className="w-full rounded-xl border border-input bg-background p-2 text-foreground placeholder:text-muted-foreground"
          type="url"
          placeholder="Website (optional)"
          value={website}
          onChange={e => setWebsite(e.target.value)}
        />
        <textarea
          className="w-full rounded-xl border border-input bg-background p-2 text-foreground placeholder:text-muted-foreground"
          placeholder="Brief Bio / Reason for Applying"
          value={bio}
          onChange={e => setBio(e.target.value)}
          required
        />
        <input
          className="w-full rounded-xl border border-input bg-background p-2 text-foreground placeholder:text-muted-foreground"
          type="tel"
          placeholder="Phone Number"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          required
        />
        <input
          className="w-full rounded-xl border border-input bg-background p-2 text-foreground placeholder:text-muted-foreground"
          type="email"
          placeholder="Contact Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
        />
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Government-Issued ID</label>
          <select
            className="w-full rounded-xl border border-input bg-background p-2 text-foreground"
            value={idType}
            onChange={e => setIdType(e.target.value)}
            required
          >
            <option value="national_id">National ID</option>
            <option value="passport">Passport</option>
            <option value="drivers_license">Driver&apos;s License</option>
            <option value="voter_id">Voter ID</option>
          </select>
          <input
            className="w-full rounded-xl border border-input bg-background p-2 text-foreground placeholder:text-muted-foreground"
            type="text"
            placeholder="ID Number"
            value={idNumber}
            onChange={e => setIdNumber(e.target.value)}
            required
          />
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
