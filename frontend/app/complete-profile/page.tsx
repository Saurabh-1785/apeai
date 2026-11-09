'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ArrowRight, Loader2, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/components/AuthContext';
import AuthShell from '@/components/app/AuthShell';
import { FormError } from '@/components/app/FormError';
import { friendlyAuthError, type FriendlyError } from '@/lib/authErrors';

export default function CompleteProfilePage() {
  const [dob, setDob] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<FriendlyError | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  const { user, profile, loading: authLoading, refreshProfile } = useAuth();

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  // Pre-fill name if available from Google
  useEffect(() => {
    if (user?.user_metadata?.full_name && !fullName) {
      setFullName(user.user_metadata.full_name);
    }
    // If they already have a DOB in profile, they might not need this page, but we let them update it.
    if (profile?.dob && !dob) {
      setDob(profile.dob);
    }
  }, [user, profile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dob) {
      setError({ message: 'Add your date of birth to continue.' });
      return;
    }

    if (!user) return;

    setLoading(true);
    setError(null);

    // Upsert the profile in the database
    const { error } = await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        email: user.email,
        dob: dob,
        full_name: fullName || null
      });

    if (error) {
      setError(friendlyAuthError(error, 'profile'));
      setLoading(false);
    } else {
      await refreshProfile();
      setSuccess(true);
      setTimeout(() => {
        router.push('/dashboard');
      }, 1500);
    }
  };

  if (authLoading) return null;

  return (
    <AuthShell
      eyebrow="one more step"
      title={success ? 'All set.' : 'Almost there.'}
      description={
        success
          ? 'Taking you to your inbox…'
          : 'Tell us who you are, so your team can see who approved what.'
      }
    >
      <FormError error={error} />

      {success ? (
        <div role="status" className="alert alert-success">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>Profile saved.</p>
        </div>
      ) : (
        <form className="space-y-5" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="name" className="field-label">
              Full name
            </label>
            <input
              id="name"
              type="text"
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="field"
              placeholder="Jane Doe"
            />
          </div>

          <div>
            <label htmlFor="dob" className="field-label">
              Date of birth
            </label>
            <input
              id="dob"
              type="date"
              autoComplete="bday"
              required
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              className="field"
            />
          </div>

          <button type="submit" disabled={loading} className="btn btn-primary btn-lg mt-2 w-full">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {loading ? 'Saving…' : 'Save and continue'}
            {!loading && <ArrowRight className="arrow h-4 w-4" aria-hidden />}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
