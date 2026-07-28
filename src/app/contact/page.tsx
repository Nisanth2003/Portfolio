import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, FileText } from 'lucide-react';

import { ClipWipe, ScrollReveal3D, ScrollRule } from '@/components/motion/scroll-fx';
import { ContactGlyph, ContactRow } from '@/components/contact/contact-list';
import { Button } from '@/components/ui/button';
import { contactPoints, contactSource, primaryContacts, secondaryContacts } from '@/lib/contact';
import { site } from '@/lib/site';
import { asset } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Contact',
  description: `How to reach ${site.name}.`,
  alternates: { canonical: '/contact/' },
};

/**
 * Contact, on its own page and driven by the sheet's Contact tab.
 *
 * Every point here is a spreadsheet row: adding a phone number, dropping a LinkedIn,
 * reordering them or taking one down for a while is a cell edit, not a deploy of changed
 * code. When the tab does not exist yet it falls back to the email and GitHub in site.ts,
 * because a portfolio with no way to reach anyone is broken in a way a missing stack
 * section is not.
 */
export default function ContactPage() {
  return (
    <div>
      <header className="relative">
        <div aria-hidden="true" className="absolute inset-0 -z-[1] bg-background/55" />

        <div className="container max-w-5xl pb-14 pt-28">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Back home
          </Link>

          <p className="mt-8 font-mono text-[10px] uppercase tracking-[0.25em] text-system">
            Contact
          </p>
          <ScrollRule className="mt-3 w-40" />
          <ClipWipe>
            <h1 className="mt-4 max-w-3xl text-balance text-display font-bold text-monarch">
              Seen something worth talking about?
            </h1>
          </ClipWipe>
          <p className="mt-6 max-w-xl text-pretty leading-relaxed text-muted-foreground">
            Email is the fastest way. Source for most of the work is public — read it before you
            write, if you like.
          </p>

          {primaryContacts.length > 0 && (
            <div className="mt-10 flex flex-wrap gap-3">
              {primaryContacts.map((point, i) => (
                <Button key={point.label} asChild size="lg" variant={i === 0 ? 'default' : 'system'}>
                  <a
                    href={point.href ?? '#'}
                    {...(point.href?.startsWith('http')
                      ? { target: '_blank', rel: 'noreferrer noopener' }
                      : {})}
                  >
                    <ContactGlyph icon={point.icon} />
                    {point.label}
                    {point.href?.startsWith('http') && <ArrowUpRight aria-hidden="true" />}
                  </a>
                </Button>
              ))}

              <Button asChild size="lg" variant="outline">
                <a href={asset(site.resume)} target="_blank" rel="noreferrer noopener">
                  <FileText aria-hidden="true" />
                  Résumé
                  <ArrowUpRight aria-hidden="true" />
                </a>
              </Button>
            </div>
          )}
        </div>
      </header>

      <section aria-labelledby="all-contact-heading" className="relative border-t border-border/40">
        <div aria-hidden="true" className="absolute inset-0 -z-[1] bg-background/60" />

        <div className="container max-w-5xl py-20">
          <h2
            id="all-contact-heading"
            className="font-mono text-[10px] uppercase tracking-[0.25em] text-system/80"
          >
            Every way in
          </h2>

          <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {contactPoints.map((point, i) => (
              <li key={`${point.label}-${i}`}>
                <ScrollReveal3D intensity={0.35} from={i % 2 === 0 ? 'left' : 'right'}>
                  <ContactRow point={point} />
                </ScrollReveal3D>
              </li>
            ))}
          </ul>

          {/* Only in development: a standing reminder that this page is still running off
              site.ts rather than the sheet, which is easy to forget once it looks fine. */}
          {process.env.NODE_ENV === 'development' && contactSource === 'site-config' && (
            <p className="mt-8 rounded-sm border border-rank/40 bg-rank/[0.06] px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-rank">
              Dev note · no Contact tab yet, so these come from site.ts. Run{' '}
              <code>npm run create-tab -- Contact</code> to move them into the sheet.
            </p>
          )}

          {secondaryContacts.length === 0 && contactPoints.length <= 1 && (
            <p className="mt-8 text-sm text-muted-foreground">
              More ways to reach me are on the way.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
