'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { ArrowDown, ArrowUpRight, Github } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { SplitText, Typewriter } from '@/components/motion/split-text';
import { setAccent, surge } from '@/components/smoke/smoke-store';
import { cn } from '@/lib/utils';

export type HeroProject = {
  slug: string;
  title: string;
  year: number | null;
  accentColor: string | null;
};

export function Hero({
  name,
  role,
  projects,
  githubUrl,
  systemLine,
}: {
  name: string;
  role: string;
  projects: HeroProject[];
  githubUrl: string | null;
  systemLine: string;
}) {
  const prefersReducedMotion = useReducedMotion();
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const sectionRef = useRef<HTMLElement>(null);

  // The hero content lifts and dims as you scroll out while the smoke behind it
  // keeps its own pace — the two layers separating is what gives the depth.
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end start'],
  });
  const contentY = useTransform(scrollYProgress, [0, 1], [0, -120]);
  const contentOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);
  const contentScale = useTransform(scrollYProgress, [0, 1], [1, 0.94]);

  /** Hovering a project tints the whole page's smoke toward its colour. */
  const focus = (project: HeroProject | null) => {
    setActiveSlug(project?.slug ?? null);
    setAccent(project?.accentColor ?? null);
    if (project) surge(0.5);
  };

  return (
    <section
      ref={sectionRef}
      aria-labelledby="hero-heading"
      className="relative flex min-h-dvh flex-col justify-center overflow-hidden"
    >
      {/* Local scrim only. The smoke itself is a fixed, site-wide layer behind
          everything — this just protects the left column where the text sits. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-[1] bg-gradient-to-r from-background via-background/70 to-transparent"
      />

      <motion.div
        style={
          prefersReducedMotion
            ? undefined
            : { y: contentY, opacity: contentOpacity, scale: contentScale }
        }
        className="container relative w-full max-w-7xl py-20 lg:py-28"
      >
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="mb-7 inline-flex max-w-full items-center gap-3 rounded-sm border border-system/30 bg-system/[0.06] px-3 py-2 backdrop-blur-sm"
        >
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.2em] text-system/80">
            System
          </span>
          <span aria-hidden="true" className="h-3 w-px bg-system/30" />
          <Typewriter
            text={systemLine}
            delay={0.5}
            className="font-mono text-xs text-system glow-system"
          />
        </motion.div>

        <SplitText
          as="h1"
          text="The work speaks."
          delay={0.15}
          className="text-balance text-display font-bold text-foreground glow-violet [perspective:600px]"
        />

        <motion.p
          initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="mt-7 max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground sm:text-xl"
        >
          <span className="font-medium text-foreground">{name}</span> — {role}. Android, web, and
          the pipelines that ship them. Every project below goes straight to the live build or the
          source.
        </motion.p>

        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.85, ease: [0.16, 1, 0.3, 1] }}
          className="mt-10 flex flex-wrap items-center gap-3"
        >
          <Button asChild size="lg" onMouseEnter={() => surge(0.6)}>
            <Link href="#work">
              Enter the archive
              <ArrowDown aria-hidden="true" />
            </Link>
          </Button>

          {githubUrl && (
            <Button asChild size="lg" variant="system">
              <a href={githubUrl} target="_blank" rel="noreferrer noopener">
                <Github aria-hidden="true" />
                GitHub
                <ArrowUpRight aria-hidden="true" />
              </a>
            </Button>
          )}
        </motion.div>

        {/* Featured rail. Hover or keyboard focus pushes that project's colour into
            the smoke — the interaction lives in the DOM, so it works with a keyboard
            and a screen reader, and the canvas stays completely inert. */}
        {projects.length > 0 && (
          <motion.nav
            aria-label="Featured projects"
            initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 1, ease: [0.16, 1, 0.3, 1] }}
            className="mt-20 max-w-2xl"
            onMouseLeave={() => focus(null)}
          >
            <p className="mb-4 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
              Featured
              <span
                aria-hidden="true"
                className="h-px flex-1 bg-gradient-to-r from-border to-transparent"
              />
            </p>

            <ul className="flex flex-col">
              {projects.slice(0, 6).map((project, i) => {
                const isActive = activeSlug === project.slug;
                return (
                  <li key={project.slug}>
                    <Link
                      href={`/work/${project.slug}`}
                      onMouseEnter={() => focus(project)}
                      onFocus={() => focus(project)}
                      onBlur={() => focus(null)}
                      className={cn(
                        'group flex items-center gap-4 border-b border-border/30 py-3 transition-colors duration-300',
                        isActive ? 'border-accent/40' : 'hover:border-border/60',
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          'tabular w-6 shrink-0 font-mono text-[10px] transition-colors duration-300',
                          isActive ? 'text-system' : 'text-muted-foreground/50',
                        )}
                      >
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span
                        className={cn(
                          'flex-1 truncate font-medium transition-all duration-300',
                          isActive
                            ? 'translate-x-1 text-foreground glow-violet'
                            : 'text-muted-foreground',
                        )}
                      >
                        {project.title}
                      </span>
                      {project.year && (
                        <span className="tabular shrink-0 font-mono text-[10px] text-muted-foreground/60">
                          {project.year}
                        </span>
                      )}
                      <ArrowUpRight
                        aria-hidden="true"
                        className={cn(
                          'size-4 shrink-0 transition-all duration-300',
                          isActive
                            ? 'translate-x-0 text-system opacity-100'
                            : '-translate-x-1 opacity-0',
                        )}
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </motion.nav>
        )}
      </motion.div>

      <div className="container relative flex max-w-7xl items-center pb-8">
        <motion.span
          aria-hidden="true"
          initial={prefersReducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.4 }}
          className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/60"
        >
          <motion.span
            animate={prefersReducedMotion ? undefined : { y: [0, 5, 0] }}
            transition={{ duration: 1.9, repeat: Infinity, ease: 'easeInOut' }}
            className="inline-block"
          >
            ↓
          </motion.span>
          Scroll
        </motion.span>
      </div>
    </section>
  );
}
