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
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // TODO: Send application to backend for admin approval
    // Example: await fetch('/api/organizer/apply', { method: 'POST', body: JSON.stringify({ ... }) })
    setLoading(false);
    toast({ title: 'Application submitted', description: 'Your application will be reviewed by admin.' });
    router.push('/');
  };

  return (
    <div className="max-w-lg mx-auto mt-10 p-6 bg-white rounded shadow">
      <h2 className="text-2xl font-bold mb-4">Organizer Application</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          className="w-full border p-2 rounded"
          type="text"
          placeholder="Company/Organization Name"
          value={company}
          onChange={e => setCompany(e.target.value)}
          required
        />
        <input
          className="w-full border p-2 rounded"
          type="url"
          placeholder="Website (optional)"
          value={website}
          onChange={e => setWebsite(e.target.value)}
        />
        <textarea
          className="w-full border p-2 rounded"
          placeholder="Brief Bio / Reason for Applying"
          value={bio}
          onChange={e => setBio(e.target.value)}
          required
        />
        <input
          className="w-full border p-2 rounded"
          type="tel"
          placeholder="Phone Number"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          required
        />
        <input
          className="w-full border p-2 rounded"
          type="email"
          placeholder="Contact Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
        />
        <button
          type="submit"
          className="w-full bg-blue-600 text-white py-2 rounded font-semibold hover:bg-blue-700 transition"
          disabled={loading}
        >
          {loading ? 'Submitting...' : 'Apply as Organizer'}
        </button>
      </form>
    </div>
  );
}
