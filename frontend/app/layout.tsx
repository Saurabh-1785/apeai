import './globals.css';
import React from 'react';
import LayoutWrapper from '@/components/LayoutWrapper';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { AuthProvider } from '@/components/AuthContext';
import { fontVars } from '@/lib/fonts';

export const metadata = {
  title: 'ApeAI — Automated Product Engineering AI',
  description: 'AI-assisted feedback clustering, multi-stage document drafting, and human-approved ticket publishing.',
};

// Applies the saved (or system) theme before first paint, so dark-mode users
// never see a flash of the light theme.
const themeScript = `(function(){try{var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}if(t==='dark')document.documentElement.classList.add('dark')}catch(e){}})()`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={fontVars} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <AuthProvider>
          <LayoutWrapper>
            <ToastProvider>{children}</ToastProvider>
          </LayoutWrapper>
        </AuthProvider>
      </body>
    </html>
  );
}
