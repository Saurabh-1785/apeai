'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ArrowRight, Loader2, AlertTriangle, MailCheck } from 'lucide-react';
import { useAuth } from '@/components/AuthContext';
import AuthShell from '@/components/app/AuthShell';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [dob, setDob] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const router = useRouter();
  const { user } = useAuth();

  // If already logged in, redirect (in an effect — never navigate during render)
  useEffect(() => {
    if (user) router.replace('/dashboard');
  }, [user, router]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (!dob) {
      setError("Date of birth is required");
      return;
    }

    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          dob: dob
        }
      }
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      // Show success message telling them to check email for the verification link
      setSuccess(true);
    }
  };

  if (user) return null;

  const mismatch = confirmPassword.length > 0 && password !== confirmPassword;

  return (
    <AuthShell
      eyebrow="create account"
      title={success ? 'Check your email.' : 'Start with the noise.'}
      description={
        success
          ? undefined
          : 'Create a workspace and turn the feedback you already have into work your team can ship.'
      }
      topRight={
        <>
          Have an account?{' '}
          <Link href="/login" className="link">
            Sign in
          </Link>
        </>
      }
    >
      {error && (
        <div role="alert" className="alert alert-error mb-6">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>{error}</p>
        </div>
      )}

      {success ? (
        <div className="space-y-6">
          <div role="status" className="alert alert-success">
            <MailCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p>
              We sent a verification email to <strong className="font-semibold">{email}</strong>. Click the link in it, or
              enter the 6-digit code if you received one.
            </p>
          </div>
          <Link href={`/verify-otp?email=${encodeURIComponent(email)}`} className="btn btn-primary btn-lg w-full">
            Enter verification code <ArrowRight className="arrow h-4 w-4" aria-hidden />
          </Link>
        </div>
      ) : (
        <>
          <form className="space-y-5" onSubmit={handleSignup}>
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

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="password" className="field-label">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="field"
                />
              </div>
              <div>
                <label htmlFor="confirm" className="field-label">
                  Confirm password
                </label>
                <input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  aria-invalid={mismatch}
                  aria-describedby={mismatch ? 'confirm-hint' : undefined}
                  className="field"
                />
              </div>
            </div>
            {mismatch && (
              <p id="confirm-hint" className="-mt-2 text-[12.5px] font-medium text-danger">
                The passwords don&apos;t match yet.
              </p>
            )}

            <button type="submit" disabled={loading} className="btn btn-primary btn-lg mt-2 w-full">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {loading ? 'Creating account…' : 'Create account'}
              {!loading && <ArrowRight className="arrow h-4 w-4" aria-hidden />}
            </button>
          </form>

          <p className="mt-8 text-[14px] text-ink-2">
            Already have an account?{' '}
            <Link href="/login" className="link">
              Sign in
            </Link>
          </p>
        </>
      )}
    </AuthShell>
  );
}
