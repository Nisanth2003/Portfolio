import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight, ArrowUpRight, Code2, Globe, Lock } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getProjectBySlug, projects } from '@/lib/projects';
import { prettyUrl } from '@/lib/utils';
import type { Project } from '@/lib/schema';

type Params = { slug: string };

/** Every project gets a prerendered, shareable URL of its own. */
export function generateStaticParams(): Params[] {
  return projects.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const project = getProjectBySlug(slug);
  if (!project) return { title: 'Not found' };

  const description = project.tagline || project.description || undefined;

  return {
    title: project.title,
    description,
    openGraph: { title: project.title, description, type: 'article' },
    alternates: { canonical: `/work/${project.slug}/` },
  };
}

const STATUS_LABEL: Record<Project['status'], string> = {
  shipped: 'Shipped',
  wip: 'In progress',
  archived: 'Archived',
};

export default async function ProjectPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const project = getProjectBySlug(slug);
  if (!project) notFound();

  const index = projects.findIndex((p) => p.slug === project.slug);
  const previous = index > 0 ? projects[index - 1] : null;
  const next = index < projects.length - 1 ? projects[index + 1] : null;

  const accent = project.accentColor ?? '#22C55E';

  const sections = [
    { title: 'The problem', body: project.problem },
    { title: 'My role', body: project.role },
    { title: 'Outcome', body: project.impact },
  ].filter((s) => s.body);

  return (
    <article>
      <header className="relative isolate overflow-hidden border-b border-border/40">
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10"
          style={{
            background: `radial-gradient(70% 60% at 20% 0%, ${accent}1f, transparent 60%), linear-gradient(180deg, #0D1526, hsl(var(--background)))`,
          }}
        />

        <div className="container max-w-4xl pb-16 pt-28">
          <Link
            href="/#work"
            className="inline-flex items-center gap-2 rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            All work
          </Link>

          <div className="mt-8 flex flex-wrap items-center gap-2">
            <Badge variant={project.status === 'shipped' ? 'default' : project.status === 'wip' ? 'wip' : 'archived'}>
              {STATUS_LABEL[project.status]}
            </Badge>
            {project.category && <Badge variant="outline">{project.category}</Badge>}
            {project.year && (
              <Badge variant="outline" className="tabular">
                {project.year}
              </Badge>
            )}
          </div>

          <h1 className="mt-5 text-balance text-display font-semibold text-foreground">
            {project.title}
          </h1>

          {project.tagline && (
            <p className="mt-5 max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground sm:text-xl">
              {project.tagline}
            </p>
          )}

          <div className="mt-10 flex flex-wrap gap-3">
            {project.liveUrl && (
              <Button asChild size="lg">
                <a href={project.liveUrl} target="_blank" rel="noreferrer noopener">
                  <Globe aria-hidden="true" />
                  Open live site
                  <ArrowUpRight aria-hidden="true" />
                </a>
              </Button>
            )}
            {project.repoUrl && (
              <Button asChild size="lg" variant={project.liveUrl ? 'outline' : 'default'}>
                <a href={project.repoUrl} target="_blank" rel="noreferrer noopener">
                  <Code2 aria-hidden="true" />
                  View source
                  <ArrowUpRight aria-hidden="true" />
                </a>
              </Button>
            )}
            {!project.liveUrl && !project.repoUrl && (
              <p className="inline-flex items-center gap-2 rounded-md border border-border/60 px-4 py-2.5 text-sm text-muted-foreground">
                <Lock aria-hidden="true" className="size-4" />
                Source is private — happy to walk through it on request.
              </p>
            )}
          </div>

          {(project.liveUrl || project.repoUrl) && (
            <p className="mt-4 font-mono text-xs text-muted-foreground/70">
              {prettyUrl(project.liveUrl ?? project.repoUrl ?? '')}
            </p>
          )}
        </div>
      </header>

      <div className="relative">
        {/* Readability floor over the site-wide smoke. */}
        <div aria-hidden="true" className="absolute inset-0 -z-[1] bg-background/60" />

      <div className="container max-w-4xl py-16">
        {project.stats.length > 0 && (
          <dl className="mb-16 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border/50 bg-border/40 sm:grid-cols-3">
            {project.stats.map((stat) => (
              <div key={stat.label} className="bg-card px-5 py-6">
                <dt className="text-xs uppercase tracking-widest text-muted-foreground">
                  {stat.label}
                </dt>
                <dd className="mt-2 text-lg font-medium text-foreground">{stat.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {project.description && (
          <p className="text-pretty text-lg leading-relaxed text-foreground/90">
            {project.description}
          </p>
        )}

        {sections.length > 0 && (
          <div className="mt-16 space-y-12">
            {sections.map((section) => (
              <section key={section.title}>
                <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  {section.title}
                </h2>
                <p className="mt-3 text-pretty leading-relaxed text-foreground/90">
                  {section.body}
                </p>
              </section>
            ))}
          </div>
        )}

        <div className="mt-16 grid gap-8 border-t border-border/40 pt-10 sm:grid-cols-2">
          {project.tech.length > 0 && (
            <section>
              <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Built with
              </h2>
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {project.tech.map((tech) => (
                  <li key={tech}>
                    <Badge variant="outline" className="font-mono text-[11px]">
                      {tech}
                    </Badge>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {project.teamSize && (
            <section>
              <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Team size
              </h2>
              <p className="tabular mt-3 text-foreground">
                {project.teamSize === '1' ? 'Solo project' : `${project.teamSize} people`}
              </p>
            </section>
          )}
        </div>
        </div>
      </div>

      <nav
        aria-label="Other projects"
        className="border-t border-border/40"
      >
        <div className="container grid max-w-4xl grid-cols-1 gap-px py-10 sm:grid-cols-2">
          {previous ? (
            <Link
              href={`/work/${previous.slug}`}
              className="group rounded-lg px-4 py-5 transition-colors hover:bg-secondary/40"
            >
              <span className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
                <ArrowLeft aria-hidden="true" className="size-3.5" />
                Previous
              </span>
              <span className="mt-2 block font-medium text-foreground">{previous.title}</span>
            </Link>
          ) : (
            <span />
          )}

          {next && (
            <Link
              href={`/work/${next.slug}`}
              className="group rounded-lg px-4 py-5 text-right transition-colors hover:bg-secondary/40 sm:text-right"
            >
              <span className="flex items-center justify-end gap-2 text-xs uppercase tracking-widest text-muted-foreground">
                Next
                <ArrowRight aria-hidden="true" className="size-3.5" />
              </span>
              <span className="mt-2 block font-medium text-foreground">{next.title}</span>
            </Link>
          )}
        </div>
      </nav>
    </article>
  );
}
