'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Inbox, Upload, Plug, Sun, Moon, Menu, X, User, LogOut, ChevronDown, ArrowUpRight } from 'lucide-react';
import { useAuth } from './AuthContext';
import { Wordmark } from './app/primitives';

interface LayoutWrapperProps {
  children: React.ReactNode;
}

const NAV = [
  {
    href: '/dashboard',
    label: 'Inbox',
    icon: Inbox,
    isActive: (p: string) => p === '/dashboard' || p.startsWith('/pipeline') || p.startsWith('/review'),
  },
  { href: '/upload', label: 'Add feedback', icon: Upload, isActive: (p: string) => p === '/upload' },
  { href: '/integrations', label: 'Integrations', icon: Plug, isActive: (p: string) => p === '/integrations' },
];

const AUTH_PATHS = ['/login', '/signup', '/verify-otp', '/complete-profile'];

function breadcrumb(pathname: string): { label: string; href?: string }[] {
  if (pathname.startsWith('/pipeline')) return [{ label: 'Inbox', href: '/dashboard' }, { label: 'Pipeline' }];
  if (pathname.startsWith('/review')) return [{ label: 'Inbox', href: '/dashboard' }, { label: 'Review' }];
  const map: Record<string, string> = {
    '/dashboard': 'Inbox',
    '/upload': 'Add feedback',
    '/integrations': 'Integrations',
    '/profile': 'Profile',
  };
  return [{ label: map[pathname] ?? 'Workspace' }];
}

function SidebarContent({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <>
      <div className="flex h-16 shrink-0 items-center px-6">
        <Link href="/dashboard" onClick={onNavigate} aria-label="ApeAI inbox" className="rounded-sm">
          <Wordmark />
        </Link>
      </div>

      <nav aria-label="Workspace" className="flex-1 px-3 pt-4">
        <p className="eyebrow px-3 pb-2">workspace</p>
        <ul className="space-y-1">
          {NAV.map(({ href, label, icon: Icon, isActive }) => {
            const active = isActive(pathname);
            return (
              <li key={href}>
                <Link href={href} onClick={onNavigate} aria-current={active ? 'page' : undefined} className="nav-item">
                  <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-ink' : 'text-ink-3'}`} aria-hidden />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="space-y-4 p-4">
        <div className="rounded-xl border border-line bg-card p-4">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-ink">
            <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
            Human review is on
          </p>
          <p className="mt-1.5 text-[12.5px] leading-snug text-ink-3">Nothing reaches Jira until someone approves it.</p>
        </div>
        <Link
          href="/"
          onClick={onNavigate}
          className="flex items-center gap-1.5 px-1 text-[13px] font-medium text-ink-3 transition-colors hover:text-ink"
        >
          ApeAI home <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
    </>
  );
}

export default function LayoutWrapper({ children }: LayoutWrapperProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, profile, signOut } = useAuth();
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const drawerButtonRef = useRef<HTMLButtonElement>(null);

  // The inline script in app/layout.tsx already applied the theme class.
  useEffect(() => {
    setTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
  }, []);

  useEffect(() => {
    setDrawerOpen(false);
    setUserMenuOpen(false);
  }, [pathname]);

  // Close the user menu on outside click or Escape.
  useEffect(() => {
    if (!userMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!userMenuRef.current?.contains(e.target as Node)) setUserMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setUserMenuOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [userMenuOpen]);

  // Escape closes the mobile drawer and returns focus to its button.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setDrawerOpen(false);
      drawerButtonRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    try {
      localStorage.setItem('theme', next);
    } catch {
      // storage unavailable: the choice lasts for this page only
    }
    document.documentElement.classList.toggle('dark', next === 'dark');
  };

  // The landing page and sign-in flows bring their own full-screen layouts.
  if (pathname === '/' || AUTH_PATHS.includes(pathname)) {
    return <>{children}</>;
  }

  const crumbs = breadcrumb(pathname);
  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'Account';
  const initial = (profile?.full_name || user?.email || 'U').charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-paper text-ink md:pl-[248px]">
      {/* Sidebar — desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-line bg-paper md:flex">
        <SidebarContent pathname={pathname} />
      </aside>

      {/* Sidebar — mobile drawer */}
      <div
        className="fixed inset-0 z-50 md:hidden"
        style={{ visibility: drawerOpen ? 'visible' : 'hidden', transition: `visibility 0s linear ${drawerOpen ? '0ms' : '200ms'}` }}
      >
        <div
          className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${drawerOpen ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setDrawerOpen(false)}
          aria-hidden
        />
        <aside
          id="app-drawer"
          aria-label="Navigation"
          className={`absolute inset-y-0 left-0 flex w-[272px] flex-col border-r border-line bg-paper transition-transform duration-200 ${
            drawerOpen ? 'translate-x-0 ease-out' : '-translate-x-full ease-in'
          }`}
        >
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close navigation"
            className="btn btn-ghost btn-icon btn-sm absolute right-3 top-4"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
          <SidebarContent pathname={pathname} onNavigate={() => setDrawerOpen(false)} />
        </aside>
      </div>

      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-line bg-paper px-4 sm:px-6 md:px-10">
          <div className="flex min-w-0 items-center gap-3">
            <button
              ref={drawerButtonRef}
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open navigation"
              aria-expanded={drawerOpen}
              aria-controls="app-drawer"
              className="btn btn-secondary btn-icon btn-sm md:hidden"
            >
              <Menu className="h-4 w-4" aria-hidden />
            </button>
            <nav aria-label="Breadcrumb" className="min-w-0">
              <ol className="flex items-center gap-2 text-[14px]">
                {crumbs.map((c, i) => (
                  <li key={c.label} className="flex min-w-0 items-center gap-2">
                    {i > 0 && <span className="text-ink-3" aria-hidden>/</span>}
                    {c.href ? (
                      <Link href={c.href} className="font-medium text-ink-3 transition-colors hover:text-ink">
                        {c.label}
                      </Link>
                    ) : (
                      <span aria-current="page" className="truncate font-semibold text-ink">
                        {c.label}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </nav>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
              title={theme === 'light' ? 'Dark theme' : 'Light theme'}
              className="btn btn-ghost btn-icon"
            >
              {theme === 'light' ? <Moon className="h-4 w-4" aria-hidden /> : <Sun className="h-4 w-4" aria-hidden />}
            </button>

            {user && (
              <div ref={userMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setUserMenuOpen((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={userMenuOpen}
                  className="flex h-10 items-center gap-2 rounded-[10px] px-1.5 transition-colors duration-150 hover:bg-stone sm:pr-2.5"
                >
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt="" className="h-7 w-7 rounded-full border border-line object-cover" />
                  ) : (
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink text-[12px] font-semibold text-paper">
                      {initial}
                    </span>
                  )}
                  <span className="hidden max-w-[140px] truncate text-[14px] font-semibold sm:inline">{displayName}</span>
                  <ChevronDown
                    className={`hidden h-3.5 w-3.5 text-ink-3 transition-transform duration-200 sm:block ${userMenuOpen ? 'rotate-180' : ''}`}
                    aria-hidden
                  />
                </button>

                {userMenuOpen && (
                  <div
                    role="menu"
                    className="card absolute right-0 mt-2 w-60 p-1.5 shadow-[0_18px_40px_-20px_rgba(0,0,0,0.35)]"
                    style={{ animation: 'app-enter 150ms var(--ease-out) both' }}
                  >
                    <div className="border-b border-line px-3 pb-3 pt-2">
                      <p className="truncate text-[14px] font-semibold">{profile?.full_name || 'Your account'}</p>
                      <p className="truncate text-[12.5px] text-ink-3">{user.email}</p>
                    </div>
                    <div className="pt-1.5">
                      <Link href="/profile" role="menuitem" className="nav-item h-9 text-[14px]">
                        <User className="h-4 w-4 text-ink-3" aria-hidden /> Profile
                      </Link>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={async () => {
                          setUserMenuOpen(false);
                          await signOut();
                          router.push('/login');
                        }}
                        className="nav-item h-9 w-full text-[14px] text-danger hover:text-danger"
                      >
                        <LogOut className="h-4 w-4" aria-hidden /> Log out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-8 sm:px-6 md:px-10 md:py-12">
          <div key={pathname} className="app-enter">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
