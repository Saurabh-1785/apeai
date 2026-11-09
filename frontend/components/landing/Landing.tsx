'use client';

import React, { useRef } from 'react';
import './landing.css';
import { landingFontVars } from '@/lib/fonts';
import { useRevealOnScroll } from './motion';
import LandingNav, { Wordmark } from './LandingNav';
import Hero from './Hero';
import ProductPreview from './ProductPreview';
import Introduction from './Introduction';
import HowItWorks from './HowItWorks';
import Sources from './Sources';
import Principles from './Principles';
import { ClosingSections, SiteFooter } from './Closing';

/**
 * Marketing landing page. Sections inside <main> share one containing block
 * so the sticky ones (hero, intro statement, closing line) stay pinned while
 * the next section slides over them.
 */
export default function Landing() {
  const rootRef = useRef<HTMLDivElement>(null);
  useRevealOnScroll(rootRef);

  return (
    <div ref={rootRef} className={`lp ${landingFontVars}`}>
      <a
        href="#lp-main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-lp-ink focus:px-4 focus:py-2 focus:text-lp-paper"
      >
        Skip to content
      </a>
      <LandingNav />
      <main id="lp-main" className="relative flex flex-col">
        <Hero />
        <ProductPreview />
        <Introduction />
        <HowItWorks />
        <Sources />
        <Principles />
        <ClosingSections />
      </main>
      <SiteFooter wordmark={<Wordmark className="text-lp-moon" />} />
    </div>
  );
}
