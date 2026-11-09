import React from 'react';
import { cssVars } from './motion';

type Part = string | { text: string; className?: string };

/**
 * Renders a sentence as individually masked words that rise into place one
 * after another when the sentence scrolls into view.
 */
export default function SplitWords({
  parts,
  delay = 0,
  step = 70,
}: {
  parts: Part[];
  delay?: number;
  step?: number;
}) {
  let i = 0;
  const nodes: React.ReactNode[] = [];

  parts.forEach((part, p) => {
    const text = typeof part === 'string' ? part : part.text;
    const className = typeof part === 'string' ? undefined : part.className;
    text
      .split(' ')
      .filter(Boolean)
      .forEach((word, w) => {
        if (nodes.length) nodes.push(' ');
        nodes.push(
          <span key={`${p}-${w}`} data-reveal="mask" style={cssVars({ '--d': `${delay + i * step}ms` })}>
            <span className={className}>{word}</span>
          </span>
        );
        i += 1;
      });
  });

  return <>{nodes}</>;
}
