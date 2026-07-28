import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';

import { Hero } from '@/components/hero/hero';
import { ProjectRail } from '@/components/work/project-rail';
import { StackSection } from '@/components/stack/stack-section';
import { ExperienceSection } from '@/components/experience/experience-section';
import { GithubActivity } from '@/components/github/activity';
import { Button } from '@/components/ui/button';
import { CountUp } from '@/components/motion/count-up';
import { Marquee } from '@/components/motion/marquee';
import { ClipWipe, Parallax, ScrollReveal3D, ScrollRule } from '@/components/motion/scroll-fx';
import { allTech, headlineStats, projects, summaryStats } from '@/lib/projects';
import { stackNames } from '@/lib/stack';
import { site } from '@/lib/site';

/** How many projects the home rail carries before you have to go to the archive. */
const RAIL_LIMIT = 5;

const toHeroProject = (p: (typeof projects)[number]) => ({
  slug: p.slug,
  title: p.title,
  year: p.year,
  accentColor: p.accentColor,
});

export default function HomePage() {
  const featured = projects.filter((p) => p.featured);
  const rail = (featured.length > 0 ? featured : projects).slice(0, 6);

  // `projects` is already sorted featured-first, so the head of the list is the right
  // five without a second pass.
  const railProjects = projects.slice(0, RAIL_LIMIT);

  /**
   * The Stack tab is the better source once it exists: it's the full toolset, where
   * allTech can only ever name things attached to a shipped project. Falls back to
   * the project-derived list so the ticker still works with no Stack tab.
   */
  const tickerItems = stackNames.length >= 3 ? stackNames : allTech;

  const skillCount = Math.max(stackNames.length, summaryStats.techCount);
  const systemLine =
    `${summaryStats.projectCount} project${summaryStats.projectCount === 1 ? '' : 's'} logged · ` +
    `${skillCount} skills acquired`;

  return (
    <>
      <Hero
        name={site.name}
        role={site.role}
        githubUrl={site.github || null}
        projects={rail.map(toHeroProject)}
        systemLine={systemLine}
      />

      {tickerItems.length > 2 && (
        <div className="relative border-y border-border/40 py-4">
          <div aria-hidden="true" className="absolute inset-0 -z-[1] bg-background/50" />
          <Marquee items={tickerItems} label="Technologies I work with" />
        </div>
      )}

      <section id="work" aria-labelledby="work-heading" className="relative">
        {/* Readability scrim. The smoke is a fixed layer behind the whole page now, so
            each text-heavy section needs its own floor or body copy sits on moving
            contrast. Kept translucent so the smoke still reads through it. */}
        <div aria-hidden="true" className="absolute inset-0 -z-[1] bg-background/55" />

        <div className="container max-w-7xl py-24">
          <div className="mb-12 flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.25em] text-system">
                Archive
              </p>
              <ScrollRule className="mt-3 w-40" />
              <ClipWipe>
                <h2
                  id="work-heading"
                  className="mt-4 text-balance text-headline font-bold text-monarch"
                >
                  {summaryStats.projectCount}{' '}
                  {summaryStats.projectCount === 1 ? 'project' : 'projects'}, each one clickable
                  through to the real thing.
                </h2>
              </ClipWipe>
            </div>

            {/* STATUS window — numbers computed from the sheet, not typed. */}
            <ScrollReveal3D intensity={0.7} from="right" className="shrink-0">
              <dl className="system-panel group relative rounded-md border border-border/50 bg-card/60 p-5 backdrop-blur-sm lg:min-w-[290px]">
                <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.25em] text-system/70">
                  Status
                </p>
                <div className="space-y-3">
                  {headlineStats.map((stat, i) => (
                    <div key={stat.label} className="flex items-center gap-4">
                      <dt className="w-24 shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        {stat.label}
                      </dt>
                      <dd className="flex flex-1 items-center gap-3">
                        <span className="tabular w-6 text-right text-lg font-bold text-foreground">
                          <CountUp value={stat.value} duration={900 + i * 120} />
                        </span>
                        <span
                          aria-hidden="true"
                          className="h-1 flex-1 overflow-hidden rounded-full bg-muted"
                        >
                          <span
                            className="block h-full origin-left animate-stat-fill rounded-full bg-gradient-to-r from-accent to-system"
                            style={{
                              width: `${Math.min(100, (stat.value / Math.max(...headlineStats.map((s) => s.value))) * 100)}%`,
                              animationDelay: `${i * 110}ms`,
                            }}
                          />
                        </span>
                      </dd>
                    </div>
                  ))}
                </div>
              </dl>
            </ScrollReveal3D>
          </div>

          {/* Above the rail, because the rail is a sample and the button is the way out
              of it — putting it underneath means scrolling a moving track to find it. */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-t border-border/40 pt-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70">
              Showing {railProjects.length} of {summaryStats.projectCount}
            </p>

            <Button asChild variant="outline" size="sm">
              <Link href="/work">
                View all projects
                <ArrowUpRight aria-hidden="true" />
              </Link>
            </Button>
          </div>

          <ProjectRail projects={railProjects} />
        </div>
      </section>

      {/* Both render nothing until their tab has rows, so they're safe to leave
          mounted. Experience before Stack: a recruiter looks for roles first. */}
      <ExperienceSection />
      <StackSection />

      <section aria-labelledby="about-heading" className="relative border-t border-border/40">
        <div aria-hidden="true" className="absolute inset-0 -z-[1] bg-background/60" />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/50 to-transparent"
        />

        <div className="container max-w-7xl py-24">
          <div className="grid gap-12 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)]">
            {/* Drifts against the page as you pass it. */}
            <Parallax distance={40}>
              <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-system">
                Profile
              </p>
              <ScrollRule className="mt-3 w-28" />
              <ClipWipe>
                <h2
                  id="about-heading"
                  className="mt-4 text-balance text-headline font-bold text-monarch"
                >
                  Who built it
                </h2>
              </ClipWipe>
            </Parallax>

            <div className="space-y-5 text-pretty leading-relaxed text-muted-foreground">
              {/* Each paragraph gets its own scrub, so they resolve in sequence as you
                  scroll and un-resolve on the way back up. */}
              <ScrollReveal3D intensity={0.45}>
                <p>
                  I&apos;m {site.name}, a software developer working across Android and the web.
                  Computer Science honours graduate from Lovely Professional University, and most of
                  what I know came from building the things above and then rebuilding them once I
                  understood why the first attempt was wrong.
                </p>
              </ScrollReveal3D>
              <ScrollReveal3D intensity={0.45}>
                <p>
                  The through-line is reuse. The detection pipeline in the Android project was
                  designed to be lifted out and dropped into something else; the social app shipped
                  behind an automated pipeline rather than a manual deploy. I would rather spend an
                  extra day on the seams than a month on the consequences.
                </p>
              </ScrollReveal3D>
              <ScrollReveal3D intensity={0.45}>
                <p className="border-l-2 border-accent/50 pl-4 text-foreground">
                  This page is generated from a private spreadsheet I keep — so it stays current
                  without becoming a project of its own.
                </p>
              </ScrollReveal3D>
            </div>
          </div>
        </div>
      </section>

      {/* Renders nothing if the GitHub snapshot is missing or too thin to chart. */}
      <GithubActivity />
    </>
  );
}
