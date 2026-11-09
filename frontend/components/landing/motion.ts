'use client';

import React, { RefObject, useEffect, useRef, useState } from 'react';

/** Cast a map of CSS custom properties to a style object. */
export const cssVars = (vars: Record<string, string | number>) => vars as React.CSSProperties;

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

export function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return reduced;
}

/**
 * Marks every [data-reveal] element under `root` with data-shown once it
 * scrolls into view. The CSS in landing.css does the actual animation.
 */
export function useRevealOnScroll(root: RefObject<HTMLElement>) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const targets = Array.from(el.querySelectorAll<HTMLElement>('[data-reveal]'));
    if (!('IntersectionObserver' in window)) {
      targets.forEach((t) => (t.dataset.shown = ''));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          (entry.target as HTMLElement).dataset.shown = '';
          io.unobserve(entry.target);
        });
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.01 }
    );
    targets.forEach((t) => io.observe(t));
    return () => io.disconnect();
  }, [root]);
}

/**
 * Writes a 0..1 scroll-linked value to a CSS custom property on `ref`.
 * The value eases toward its target every frame (lerp), which is what makes
 * scroll-linked motion feel smooth instead of jittery. The loop stops as soon
 * as the value settles, so idle pages cost nothing.
 */
export function useScrollVar(
  ref: RefObject<HTMLElement>,
  measure: (el: HTMLElement, viewportHeight: number) => number,
  options: { name?: string; ease?: number; reducedValue?: number } = {}
) {
  const { name = '--p', ease = 0.12, reducedValue } = options;
  const measureRef = useRef(measure);
  measureRef.current = measure;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = prefersReducedMotion();
    if (reduced && reducedValue !== undefined) {
      el.style.setProperty(name, String(reducedValue));
      return;
    }

    let current = Number.NaN;
    let target = 0;
    let raf = 0;

    const tick = () => {
      if (Number.isNaN(current) || reduced) current = target;
      else current += (target - current) * ease;
      if (Math.abs(target - current) < 0.0004) current = target;
      el.style.setProperty(name, current.toFixed(4));
      raf = current === target ? 0 : requestAnimationFrame(tick);
    };

    const onScroll = () => {
      target = clamp01(measureRef.current(el, window.innerHeight));
      if (!raf) raf = requestAnimationFrame(tick);
    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [ref, name, ease, reducedValue]);
}

/** Height of the sticky landing nav, read from the CSS variable. */
export function navHeight(el: HTMLElement) {
  const v = parseFloat(getComputedStyle(el).getPropertyValue('--nav-h'));
  return Number.isFinite(v) ? v : 72;
}

/** Types and deletes a list of words in a loop. */
export function useTypewriter(words: string[], reduced: boolean) {
  const [state, setState] = useState({ index: 0, text: '', typing: true });

  useEffect(() => {
    if (reduced) {
      let index = 0;
      setState({ index, text: words[index], typing: false });
      const id = window.setInterval(() => {
        index = (index + 1) % words.length;
        setState({ index, text: words[index], typing: false });
      }, 2800);
      return () => window.clearInterval(id);
    }

    let index = 0;
    let chars = 0;
    let deleting = false;
    let timer = 0;

    const step = () => {
      const word = words[index];
      if (!deleting) {
        if (chars < word.length) {
          chars += 1;
          setState({ index, text: word.slice(0, chars), typing: true });
          timer = window.setTimeout(step, 70 + Math.random() * 60);
        } else {
          deleting = true;
          setState({ index, text: word, typing: false });
          timer = window.setTimeout(step, 2300);
        }
      } else if (chars > 0) {
        chars -= 1;
        setState({ index, text: word.slice(0, chars), typing: true });
        timer = window.setTimeout(step, 32);
      } else {
        deleting = false;
        index = (index + 1) % words.length;
        setState({ index, text: '', typing: true });
        timer = window.setTimeout(step, 280);
      }
    };

    timer = window.setTimeout(step, 900);
    return () => window.clearTimeout(timer);
  }, [words, reduced]);

  return state;
}
