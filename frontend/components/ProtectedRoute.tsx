'use client';

import React, { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from './AuthContext';
import { Loader2 } from 'lucide-react';

const PUBLIC_PATHS = ['/', '/login', '/signup', '/verify-otp'];

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isPublic = PUBLIC_PATHS.includes(pathname);

  useEffect(() => {
    if (!loading && !user && !isPublic) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [user, loading, router, pathname, isPublic]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[65vh] gap-4">
        <Loader2 className="w-8 h-8 text-slate-900 dark:text-zinc-300 animate-spin" />
        <p className="text-xs font-bold tracking-widest text-slate-400 dark:text-zinc-500 uppercase">Verifying Authentication...</p>
      </div>
    );
  }

  if (!user && !isPublic) return null; // redirecting

  return <>{children}</>;
}
