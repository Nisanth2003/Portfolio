'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Github } from 'lucide-react';

import { cn } from '@/lib/utils';
import { site } from '@/lib/site';

export function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-colors duration-300',
        scrolled
          ? 'border-b border-border/40 bg-background/80 backdrop-blur-md'
          : 'border-b border-transparent',
      )}
    >
      {/* Violet hairline that resolves as you scroll — a System window edge. */}
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent transition-opacity duration-500',
          scrolled ? 'opacity-100' : 'opacity-0',
        )}
      />
      <div className="container flex h-16 max-w-7xl items-center justify-between">
        <Link
          href="/"
          className="group flex items-center gap-2.5 rounded-sm text-sm font-semibold tracking-tight"
        >
          <span
            aria-hidden="true"
            className="grid size-8 place-items-center rounded-sm border border-accent/40 bg-accent/10 font-mono text-xs text-accent shadow-glow transition-all duration-300 group-hover:border-accent group-hover:shadow-glow-lg"
          >
            {site.initials}
          </span>
          <span className="hidden text-foreground sm:inline">{site.shortName}</span>
        </Link>

        <nav aria-label="Main" className="flex items-center gap-1">
          <NavLink href="/#work">Work</NavLink>
          {/* The stairwell page. Separate from "Work" on purpose: that one is the
              featured rail on the home page, this one is everything. */}
          <NavLink href="/work">Archive</NavLink>
          <NavLink href="/contact">Contact</NavLink>
          {site.github && (
            <a
              href={site.github}
              target="_blank"
              rel="noreferrer noopener"
              aria-label="GitHub profile, opens in a new tab"
              className="ml-1 inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
            >
              <Github aria-hidden="true" className="size-4" />
            </a>
          )}
        </nav>
      </div>
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      // Tighter below sm. Three links plus the GitHub icon is 289px of chrome at the
      // default padding, which overflows a 320px screen once "Archive" joined the row.
      className="rounded-md px-2 py-2 text-[13px] text-muted-foreground transition-colors hover:text-foreground sm:px-3 sm:text-sm"
    >
      {children}
    </Link>
  );
}
