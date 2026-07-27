import { ArrowUpRight, FileText, Github, Linkedin, Mail } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { site } from '@/lib/site';
import { asset } from '@/lib/utils';

export function Footer() {
  return (
    <footer id="contact" className="relative border-t border-border/40">
      {/* Readability floor over the site-wide smoke. */}
      <div aria-hidden="true" className="absolute inset-0 -z-[1] bg-background/70" />

      <div className="container max-w-7xl py-20">
        <div className="flex flex-col gap-10 md:flex-row md:items-end md:justify-between">
          <div className="max-w-xl">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Contact
            </p>
            <h2 className="mt-3 text-balance text-headline font-bold text-monarch">
              Seen something worth talking about?
            </h2>
            <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
              The fastest way to reach me is email. Source for most of the work above is
              public — read it before you write, if you like.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <a href={`mailto:${site.email}`}>
                <Mail aria-hidden="true" />
                Email me
              </a>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href={asset(site.resume)} target="_blank" rel="noreferrer noopener">
                <FileText aria-hidden="true" />
                Résumé
                <ArrowUpRight aria-hidden="true" />
              </a>
            </Button>
          </div>
        </div>

        <div className="mt-16 flex flex-col-reverse gap-6 border-t border-border/40 pt-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} {site.name}
          </p>

          <ul className="flex items-center gap-4 text-sm">
            <li>
              <a
                className="text-muted-foreground transition-colors hover:text-foreground"
                href={`mailto:${site.email}`}
              >
                <span className="sr-only">Email</span>
                <Mail aria-hidden="true" className="size-4" />
              </a>
            </li>
            {site.github && (
              <li>
                <a
                  className="text-muted-foreground transition-colors hover:text-foreground"
                  href={site.github}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  <span className="sr-only">GitHub, opens in a new tab</span>
                  <Github aria-hidden="true" className="size-4" />
                </a>
              </li>
            )}
            {site.linkedin && (
              <li>
                <a
                  className="text-muted-foreground transition-colors hover:text-foreground"
                  href={site.linkedin}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  <span className="sr-only">LinkedIn, opens in a new tab</span>
                  <Linkedin aria-hidden="true" className="size-4" />
                </a>
              </li>
            )}
          </ul>
        </div>
      </div>
    </footer>
  );
}
