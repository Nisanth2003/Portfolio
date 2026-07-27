import { ArrowUpRight } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { ClipWipe, Parallax, ScrollReveal3D, ScrollRule } from '@/components/motion/scroll-fx';
import { experience } from '@/lib/experience';
import type { Experience } from '@/lib/schema';

function Entry({ item, index }: { item: Experience; index: number }) {
  return (
    <ScrollReveal3D intensity={0.55} from={index % 2 === 0 ? 'right' : 'left'}>
      {/* The rail is the timeline: a hairline down the left with a node per role.
          Drawn with borders rather than an absolutely-positioned element so it can
          never drift out of alignment with the text beside it. */}
      <div className="group/role relative border-l border-border/50 pb-10 pl-6 last:pb-0">
        <span
          aria-hidden="true"
          className={
            'absolute -left-[5px] top-1.5 size-[9px] rounded-full ring-4 ring-background ' +
            'transition-colors duration-300 ' +
            (item.current ? 'bg-accent' : 'bg-border group-hover/role:bg-system')
          }
        />

        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p className="tabular font-mono text-[10px] uppercase tracking-[0.2em] text-system">
            {item.period}
          </p>
          {item.current && (
            <Badge variant="system" className="text-[10px]">
              Current
            </Badge>
          )}
          {item.type && (
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70">
              {item.type}
            </span>
          )}
        </div>

        <h3 className="mt-2 text-lg font-semibold leading-snug tracking-tight text-foreground">
          {item.role}
        </h3>

        <p className="mt-0.5 text-sm text-muted-foreground">
          {item.url ? (
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 text-foreground/90 transition-colors hover:text-accent"
            >
              {item.company}
              <ArrowUpRight aria-hidden="true" className="size-3.5" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          ) : (
            <span className="text-foreground/90">{item.company}</span>
          )}
          {item.location && <span className="text-muted-foreground"> · {item.location}</span>}
        </p>

        {item.summary && (
          <p className="mt-3 text-pretty text-sm leading-relaxed text-muted-foreground">
            {item.summary}
          </p>
        )}

        {item.highlights.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {item.highlights.map((line) => (
              <li
                key={line}
                className="relative pl-4 text-pretty text-sm leading-relaxed text-muted-foreground before:absolute before:left-0 before:top-[0.7em] before:size-1 before:rounded-full before:bg-system/60"
              >
                {line}
              </li>
            ))}
          </ul>
        )}

        {item.tech.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-1.5">
            {item.tech.map((tech) => (
              <li key={tech}>
                <Badge variant="outline" className="rounded-sm font-mono text-[10px]">
                  {tech}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ScrollReveal3D>
  );
}

export function ExperienceSection() {
  // No Experience tab, or nothing published in it. Render nothing rather than an empty
  // heading — a "Service record" with no roles reads worse than no section at all.
  if (experience.length === 0) return null;

  return (
    <section
      id="experience"
      aria-labelledby="experience-heading"
      className="relative border-t border-border/40"
    >
      <div aria-hidden="true" className="absolute inset-0 -z-[1] bg-background/60" />

      <div className="container max-w-7xl py-24">
        <div className="grid gap-12 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)]">
          <Parallax distance={40}>
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-system">Record</p>
            <ScrollRule className="mt-3 w-28" />
            <ClipWipe>
              <h2
                id="experience-heading"
                className="mt-4 text-balance text-headline font-bold text-monarch"
              >
                Where I&apos;ve done the work
              </h2>
            </ClipWipe>
          </Parallax>

          <div>
            {experience.map((item, i) => (
              <Entry key={`${item.company}-${item.role}-${item.start}`} item={item} index={i} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
