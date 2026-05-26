'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Cpu, Mail, Lock, Calendar, ArrowRight, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/components/AuthContext';

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

  // If already logged in, redirect
  if (user) {
    router.push('/dashboard');
    return null;
  }

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

    const { data, error } = await supabase.auth.signUp({
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

  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/complete-profile`
      }
    });

    if (error) {
      setError(error.message);
    }
  };

  return (
    <div className="min-h-[85vh] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 animate-fade-in">
      <div className="max-w-md w-full space-y-8 bg-white dark:bg-[#0c0c0e] p-8 md:p-10 rounded-3xl border border-slate-200 dark:border-zinc-800 shadow-2xl shadow-slate-900/5">
        <div className="text-center flex flex-col items-center">
          <div className="bg-slate-900 dark:bg-white text-white dark:text-black p-3 rounded-2xl mb-4 shadow-lg">
            <Cpu className="w-8 h-8" />
          </div>
          <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">Create an account</h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-zinc-400 font-medium">
            Start organizing your product feedback today
          </p>
        </div>

        {error && (
          <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-400 px-4 py-3 rounded-xl flex items-start gap-3 text-sm font-medium">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
        )}

        {success ? (
          <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-400 px-4 py-6 rounded-xl flex flex-col items-center gap-3 text-center animate-fade-in">
            <CheckCircle2 className="w-10 h-10 text-emerald-500" />
            <div>
              <p className="font-bold text-lg">Check your email!</p>
              <p className="text-sm opacity-80 mt-1">We've sent you a verification link. Please click it to activate your account.</p>
            </div>
          </div>
        ) : (
          <>
            <form className="mt-8 space-y-6" onSubmit={handleSignup}>
              <div className="space-y-4">
            <div>
              <label className="text-[11px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest mb-1 block">Email address</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3.5 w-5 h-5 text-slate-400 dark:text-zinc-500" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-zinc-900/50 text-slate-900 dark:text-white border border-slate-200 dark:border-zinc-800 rounded-xl pl-11 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-slate-900/20 dark:focus:ring-white/20 focus:border-slate-900 dark:focus:border-zinc-700 transition-all font-medium"
                  placeholder="name@company.com"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest mb-1 block">Date of Birth</label>
              <div className="relative">
                <Calendar className="absolute left-3.5 top-3.5 w-5 h-5 text-slate-400 dark:text-zinc-500" />
                <input
                  type="date"
                  required
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-zinc-900/50 text-slate-900 dark:text-white border border-slate-200 dark:border-zinc-800 rounded-xl pl-11 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-slate-900/20 dark:focus:ring-white/20 focus:border-slate-900 dark:focus:border-zinc-700 transition-all font-medium"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[11px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest mb-1 block">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3.5 w-5 h-5 text-slate-400 dark:text-zinc-500" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-zinc-900/50 text-slate-900 dark:text-white border border-slate-200 dark:border-zinc-800 rounded-xl pl-11 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-slate-900/20 dark:focus:ring-white/20 focus:border-slate-900 dark:focus:border-zinc-700 transition-all font-medium"
                    placeholder="••••••••"
                  />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest mb-1 block">Confirm Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3.5 w-5 h-5 text-slate-400 dark:text-zinc-500" />
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-zinc-900/50 text-slate-900 dark:text-white border border-slate-200 dark:border-zinc-800 rounded-xl pl-11 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-slate-900/20 dark:focus:ring-white/20 focus:border-slate-900 dark:focus:border-zinc-700 transition-all font-medium"
                    placeholder="••••••••"
                  />
                </div>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !email || !password || !confirmPassword || !dob}
            className="group w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-black font-bold py-3.5 rounded-xl disabled:opacity-50 transition-all duration-300 shadow-md"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
            <span>Sign Up</span>
            {!loading && <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />}
          </button>
        </form>

        <div className="relative my-8">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200 dark:border-zinc-800" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="px-4 bg-white dark:bg-[#0c0c0e] text-slate-400 dark:text-zinc-500 font-semibold tracking-wider uppercase">Or continue with</span>
          </div>
        </div>

        <button
          onClick={handleGoogleLogin}
          type="button"
          className="w-full flex items-center justify-center gap-3 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300 font-bold py-3.5 rounded-xl transition-all duration-300"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Google
        </button>

            <p className="mt-8 text-center text-sm text-slate-500 dark:text-zinc-400 font-medium">
              Already have an account?{' '}
              <Link href="/login" className="text-slate-900 dark:text-white font-bold hover:underline">
                Log in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
