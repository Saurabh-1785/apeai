'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ArrowRight, Loader2 } from 'lucide-react';
import { useAuth } from '@/components/AuthContext';
import AuthShell from '@/components/app/AuthShell';
import { FormError } from '@/components/app/FormError';
import { friendlyAuthError, type FriendlyError } from '@/lib/authErrors';

/** Post-login destination from ?next=, restricted to same-origin paths. */
function getNextPath(): string {
  if (typeof window === 'undefined') return '/dashboard';
  const next = new URLSearchParams(window.location.search).get('next');
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<FriendlyError | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { user } = useAuth();

  // If already logged in, redirect (in an effect — never navigate during render)
  useEffect(() => {
    if (user) router.replace(getNextPath());
  }, [user, router]);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setError(friendlyAuthError(error, 'signin', { email: email.trim() }));
        setLoading(false);
      } else {
        router.replace(getNextPath());
      }
    } catch (err) {
      setError(friendlyAuthError(err, 'signin'));
      setLoading(false);
    }
  };

  if (user) return null;

  return (
    <AuthShell
      eyebrow="sign in"
      title="Welcome back."
      description="Sign in to your ApeAI workspace."
      topRight={
        <>
          New here?{' '}
          <Link href="/signup" className="link">
            Create an account
          </Link>
        </>
      }
    >
      <FormError error={error} />

      <form className="space-y-5" onSubmit={handleEmailLogin}>
        <div>
          <label htmlFor="email" className="field-label">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="field"
            placeholder="name@company.com"
          />
        </div>
        <div>
          <label htmlFor="password" className="field-label">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="field"
          />
        </div>

        <button type="submit" disabled={loading} className="btn btn-primary btn-lg mt-2 w-full">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {loading ? 'Signing in…' : 'Sign in'}
          {!loading && <ArrowRight className="arrow h-4 w-4" aria-hidden />}
        </button>
      </form>

      <p className="mt-8 text-[14px] text-ink-2">
        Don&apos;t have an account?{' '}
        <Link href="/signup" className="link">
          Sign up
        </Link>
      </p>
    </AuthShell>
  );
}
