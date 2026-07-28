import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';

import { ContactGlyph } from '@/components/contact/contact-list';
import { contactPoints } from '@/lib/contact';
import { site } from '@/lib/site';

/**
 * The footer is a footer again.
 *
 * It used to hold the whole contact block — a headline, a paragraph and two buttons — which
 * meant the single most important thing on the site lived at the bottom of the longest page,
 * below thirteen projects and a stack. Contact has its own page now; this is the sign that
 * points at it, plus the direct links for anyone who does not want another click.
 */
export function Footer() {
  const links = contactPoints.filter((p) => p.href).slice(0, 5);

  return (
    <footer className="relative border-t border-border/40">
      <div aria-hidden="true" className="absolute inset-0 -z-[1] bg-background/70" />

      <div className="container max-w-7xl py-12">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/contact"
            className="group inline-flex items-center gap-3 text-lg font-semibold tracking-tight text-foreground transition-colors hover:text-accent"
          >
            Get in touch
            <ArrowUpRight
              aria-hidden="true"
              className="size-4 text-muted-foreground transition-transform duration-300 ease-expo group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent"
            />
          </Link>

          {links.length > 0 && (
            <ul className="flex flex-wrap items-center gap-1">
              {links.map((point, i) => (
                <li key={`${point.label}-${i}`}>
                  <a
                    href={point.href ?? '#'}
                    {...(point.href?.startsWith('http')
                      ? { target: '_blank', rel: 'noreferrer noopener' }
                      : {})}
                    className="inline-flex size-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
                  >
                    <ContactGlyph icon={point.icon} />
                    <span className="sr-only">
                      {point.label}
                      {point.href?.startsWith('http') ? ', opens in a new tab' : ''}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-10 flex flex-col-reverse gap-4 border-t border-border/40 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} {site.name}
          </p>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/60">
            Generated from a spreadsheet
          </p>
        </div>
      </div>
    </footer>
  );
}
