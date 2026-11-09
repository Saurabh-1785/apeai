import { Instrument_Serif, Manrope, JetBrains_Mono } from 'next/font/google';

export const displayFont = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-display',
  display: 'swap',
});

export const sansFont = Manrope({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

export const monoFont = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const fontVars = `${displayFont.variable} ${sansFont.variable} ${monoFont.variable}`;
export const landingFontVars = fontVars;
