'use client';

import React, { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from './AuthContext';
import { LoadingState } from './app/primitives';

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

  if (loading) return <LoadingState label="Checking your session…" />;

  if (!user && !isPublic) return null; // redirecting

  return <>{children}</>;
}
