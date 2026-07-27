'use client';

import { cn } from '@/lib/utils';

/**
 * Infinite ticker. The item list is rendered twice and the track translates -50%,
 * so the loop is seamless without measuring anything. Duplicated content is
 * aria-hidden and the whole strip carries one label, so it isn't read twice.
 */
export function Marquee({
  items,
  label,
  className,
}: {
  items: string[];
  label: string;
  className?: string;
}) {
  if (items.length === 0) return null;

  return (
    <div
      className={cn('fade-edges group relative overflow-hidden', className)}
      role="group"
      aria-label={label}
    >
      <div className="flex w-max animate-marquee gap-3 group-hover:[animation-play-state:paused] motion-reduce:animate-none">
        {[0, 1].map((copy) => (
          <ul key={copy} className="flex shrink-0 gap-3" aria-hidden={copy === 1}>
            {items.map((item) => (
              <li
                key={`${copy}-${item}`}
                className="flex items-center gap-2 whitespace-nowrap rounded-sm border border-border/60 bg-card/50 px-3.5 py-1.5 font-mono text-xs uppercase tracking-wider text-muted-foreground backdrop-blur-sm"
              >
                <span aria-hidden="true" className="size-1 rounded-full bg-system shadow-glow-system" />
                {item}
              </li>
            ))}
          </ul>
        ))}
      </div>
    </div>
  );
}
