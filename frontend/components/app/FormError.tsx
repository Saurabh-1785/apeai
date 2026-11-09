import React from 'react';
import Link from 'next/link';
import { AlertTriangle, Wrench } from 'lucide-react';
import type { FriendlyError } from '@/lib/authErrors';
import { isSupabaseConfigured } from '@/lib/supabase';

const IS_DEV = process.env.NODE_ENV === 'development';

/** Error alert for forms: plain message, optional next step, and a dev-only setup hint. */
export function FormError({ error, className = 'mb-6' }: { error: FriendlyError | null; className?: string }) {
  if (!error) return null;
  return (
    <div role="alert" className={`alert alert-error ${className}`}>
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 space-y-1.5">
        <p>{error.message}</p>
        {error.action && (
          <Link href={error.action.href} className="inline-block font-semibold underline underline-offset-4">
            {error.action.label}
          </Link>
        )}
        {/* When keys are missing, <SetupNotice> above already explains the fix. */}
        {IS_DEV && error.devHint && isSupabaseConfigured && (
          <p className="border-t border-danger/20 pt-1.5 font-mono text-[12px] leading-relaxed text-ink-2">
            Dev only: {error.devHint}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Shown on auth pages in development when the browser has no Supabase
 * URL / anon key, so the problem is visible before anyone tries to sign in.
 * Never rendered in production builds.
 */
export function SetupNotice() {
  if (!IS_DEV || isSupabaseConfigured) return null;
  return (
    <div role="status" className="alert alert-warning mb-6">
      <Wrench className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 space-y-1">
        <p className="font-semibold">Sign-in isn&apos;t set up on this machine</p>
        <p className="text-[13px] text-ink-2">
          Add <code className="font-mono text-[12px]">NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
          <code className="font-mono text-[12px]">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> (the anon / public key from
          Supabase → Project Settings → API) to the root <code className="font-mono text-[12px]">.env</code>, then
          restart the frontend. Only visible in development.
        </p>
      </div>
    </div>
  );
}
