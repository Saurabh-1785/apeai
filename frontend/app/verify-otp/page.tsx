'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ArrowRight, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/components/AuthContext';
import AuthShell from '@/components/app/AuthShell';
import { LoadingState } from '@/components/app/primitives';

function VerifyOTPContent() {
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const searchParams = useSearchParams();
  const email = searchParams.get('email');
  const router = useRouter();
  const { user } = useAuth();

  // If already logged in, redirect
  useEffect(() => {
    if (user) {
      router.push('/dashboard');
    }
  }, [user, router]);

  if (!email) {
    return (
      <AuthShell
        eyebrow="verify email"
        title="This link is incomplete."
        description="We couldn't tell which email to verify. Sign up again and we'll send a fresh code."
      >
        <Link href="/signup" className="btn btn-primary btn-lg w-full">
          Back to sign up <ArrowRight className="arrow h-4 w-4" aria-hidden />
        </Link>
      </AuthShell>
    );
  }

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== 6) {
      setError("Please enter a 6-digit OTP code");
      return;
    }

    setLoading(true);
    setError(null);
    setNotice(null);

    const { error } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: 'signup'
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setSuccess(true);
      setTimeout(() => {
        router.push('/dashboard');
      }, 1500);
    }
  };

  const handleResend = async () => {
    setResendLoading(true);
    setError(null);
    setNotice(null);

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email,
    });

    if (error) {
      setError(error.message);
    } else {
      setNotice('A new code is on its way. Codes from earlier emails no longer work.');
    }
    setResendLoading(false);
  };

  return (
    <AuthShell
      eyebrow="verify email"
      title={success ? 'You’re in.' : 'Check your email.'}
      description={
        success ? (
          'Taking you to your workspace…'
        ) : (
          <>
            We sent a 6-digit code to <strong className="font-semibold text-ink">{email}</strong>.
          </>
        )
      }
    >
      {error && (
        <div role="alert" className="alert alert-error mb-6">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>{error}</p>
        </div>
      )}
      {notice && (
        <div role="status" className="alert alert-success mb-6">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>{notice}</p>
        </div>
      )}

      {success ? (
        <div role="status" className="alert alert-success">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>Email verified.</p>
        </div>
      ) : (
        <>
          <form className="space-y-5" onSubmit={handleVerify}>
            <div>
              <label htmlFor="otp" className="field-label">
                Verification code
              </label>
              <input
                id="otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                className="field py-3.5 text-center font-mono text-[28px] tracking-[0.5em]"
                placeholder="000000"
              />
            </div>

            <button type="submit" disabled={loading} className="btn btn-primary btn-lg w-full">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {loading ? 'Verifying…' : 'Verify email'}
              {!loading && <ArrowRight className="arrow h-4 w-4" aria-hidden />}
            </button>
          </form>

          <p className="mt-8 text-[14px] text-ink-2">
            Didn&apos;t get it?{' '}
            <button type="button" onClick={handleResend} disabled={resendLoading} className="link disabled:opacity-50">
              {resendLoading ? 'Sending…' : 'Send a new code'}
            </button>
          </p>
        </>
      )}
    </AuthShell>
  );
}

export default function VerifyOTPPage() {
  return (
    <Suspense fallback={<LoadingState className="min-h-screen" />}>
      <VerifyOTPContent />
    </Suspense>
  );
}
