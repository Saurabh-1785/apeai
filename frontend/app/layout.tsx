import './globals.css';
import React from 'react';
import Link from 'next/link';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { Inbox, Compass, Settings, ShieldAlert, Cpu } from 'lucide-react';

export const metadata = {
  title: 'ApeAI — Intelligent Product Ops Portal',
  description: 'AI-assisted feedback clustering, multi-stage document drafting, and human-approved ticket publishing.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900 font-sans antialiased">
        <ToastProvider>
          <div className="flex min-h-screen">
            {/* Sidebar Navigation */}
            <aside className="w-64 border-r border-slate-200 bg-white hidden md:flex flex-col fixed h-full z-20">
              {/* Branding / Header */}
              <div className="h-16 flex items-center gap-3 px-6 border-b border-slate-100">
                <div className="bg-blue-600 text-white p-1.5 rounded-lg flex items-center justify-center">
                  <Cpu className="w-6 h-6" />
                </div>
                <div>
                  <h1 className="text-lg font-bold tracking-tight text-slate-800">ApeAI</h1>
                  <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-widest -mt-1">Product Ops</p>
                </div>
              </div>

              {/* Navigation Items */}
              <nav className="flex-1 py-6 px-4 space-y-1.5">
                <Link
                  href="/"
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:text-blue-600 hover:bg-slate-50 transition-colors"
                >
                  <Inbox className="w-4 h-4 text-slate-400" />
                  Feedback Inbox
                </Link>
                <Link
                  href="/integrations"
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:text-blue-600 hover:bg-slate-50 transition-colors"
                >
                  <Settings className="w-4 h-4 text-slate-400" />
                  Integrations
                </Link>
              </nav>

              {/* Bottom Metadata Info */}
              <div className="p-4 border-t border-slate-100 bg-slate-50/50">
                <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                  <ShieldAlert className="w-3.5 h-3.5 text-blue-600" />
                  <span>Human-in-the-Loop Active</span>
                </div>
              </div>
            </aside>

            {/* Main Application Container */}
            <div className="flex-1 md:pl-64 flex flex-col min-h-screen">
              {/* Top Navigation Bar */}
              <header className="h-16 border-b border-slate-200 bg-white sticky top-0 z-10 flex items-center justify-between px-6 md:px-8">
                <div className="flex items-center gap-4">
                  {/* Mobile Logo Fallback */}
                  <div className="flex md:hidden items-center gap-2">
                    <Cpu className="w-5 h-5 text-blue-600" />
                    <span className="font-bold text-slate-800">ApeAI</span>
                  </div>
                  <div className="text-xs text-slate-400 hidden sm:block">
                    Server Status: <span className="font-semibold text-emerald-600">Online</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-600">
                    AD
                  </div>
                  <span className="text-sm font-semibold text-slate-700 hidden sm:inline">Admin Portal</span>
                </div>
              </header>

              {/* Dynamic Pages Area */}
              <main className="flex-1 p-6 md:p-8 max-w-7xl w-full mx-auto">
                {children}
              </main>
            </div>
          </div>
        </ToastProvider>
      </body>
    </html>
  );
}
